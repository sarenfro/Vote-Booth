-- Manual migration: Postgres functions for anonymous ballot casting and tally.
--
-- SECURITY LIMITATION (known): If the Express application connects to Postgres
-- as a superuser (common in development with DATABASE_URL), then SECURITY
-- DEFINER on these functions does NOT prevent the app from directly SELECT-ing
-- the ballots table. The functions are still the only path used by application
-- code, but the database role cannot enforce this.
--
-- Proper fix for production:
--   1. Create a restricted app role:
--        CREATE ROLE mbaa_app LOGIN PASSWORD '...';
--   2. Grant minimal permissions:
--        GRANT CONNECT ON DATABASE <db> TO mbaa_app;
--        GRANT USAGE ON SCHEMA public TO mbaa_app;
--        GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO mbaa_app;
--        REVOKE ALL ON ballots FROM mbaa_app;
--   3. Keep functions owned by a superuser role (e.g. postgres) so SECURITY
--      DEFINER elevates to that role when called by mbaa_app.
--   4. Grant EXECUTE on these functions to mbaa_app:
--        GRANT EXECUTE ON FUNCTION cast_vote(integer, integer, jsonb) TO mbaa_app;
--        GRANT EXECUTE ON FUNCTION election_tally(integer) TO mbaa_app;
--   5. Set DATABASE_URL to use mbaa_app credentials.
--
-- Until that role separation is in place, flag ballots as a sensitive table and
-- ensure application code never issues direct SELECT on it.

-- cast_vote: atomically records who voted (voter_log) and what was voted
-- (ballots) in a single transaction. The UNIQUE constraint on voter_log
-- (election_id, member_id) prevents double voting.
CREATE OR REPLACE FUNCTION cast_vote(
  p_election_id integer,
  p_member_id   integer,
  p_payload     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify the election is currently open.
  IF NOT EXISTS (
    SELECT 1 FROM elections WHERE id = p_election_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Election % is not open for voting', p_election_id;
  END IF;

  -- Insert into voter_log. The UNIQUE constraint on (election_id, member_id)
  -- will raise a unique_violation if the member already voted.
  INSERT INTO voter_log (election_id, member_id, voted_at)
  VALUES (p_election_id, p_member_id, now());

  -- Insert into ballots. No voter_id. No FK to members.
  INSERT INTO ballots (election_id, payload, submitted_at)
  VALUES (p_election_id, p_payload, now());
END;
$$;

-- election_tally: returns aggregate vote counts per option (or per choice for
-- yes_no). Never exposes individual ballot rows. Phase 1 returns raw
-- first-choice counts for ranked_choice; full IRV ships in phase 5.
CREATE OR REPLACE FUNCTION election_tally(p_election_id integer)
RETURNS TABLE(
  option_id    integer,
  option_label text,
  vote_count   bigint,
  total_ballots bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_vote_type text;
  v_total     bigint;
BEGIN
  SELECT e.vote_type INTO v_vote_type
  FROM elections e
  WHERE e.id = p_election_id;

  IF v_vote_type IS NULL THEN
    RAISE EXCEPTION 'Election % not found', p_election_id;
  END IF;

  SELECT COUNT(*) INTO v_total FROM ballots WHERE election_id = p_election_id;

  IF v_vote_type = 'yes_no' THEN
    RETURN QUERY
    SELECT
      NULL::integer                                          AS option_id,
      (b.payload ->> 'choice')::text                        AS option_label,
      COUNT(*)::bigint                                       AS vote_count,
      v_total                                                AS total_ballots
    FROM ballots b
    WHERE b.election_id = p_election_id
    GROUP BY b.payload ->> 'choice'
    ORDER BY option_label;

  ELSIF v_vote_type = 'plurality' THEN
    RETURN QUERY
    SELECT
      eo.id                                                  AS option_id,
      eo.label                                               AS option_label,
      COUNT(b.id) FILTER (
        WHERE (b.payload ->> 'option_id')::integer = eo.id
      )::bigint                                              AS vote_count,
      v_total                                                AS total_ballots
    FROM election_options eo
    LEFT JOIN ballots b ON b.election_id = p_election_id
    WHERE eo.election_id = p_election_id
    GROUP BY eo.id, eo.label, eo.order_index
    ORDER BY eo.order_index;

  ELSIF v_vote_type = 'ranked_choice' THEN
    -- Phase 1: first-choice counts only. Full IRV deferred to phase 5.
    RETURN QUERY
    SELECT
      eo.id                                                  AS option_id,
      eo.label                                               AS option_label,
      COUNT(b.id) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements(b.payload -> 'rankings') r
          WHERE (r ->> 'option_id')::integer = eo.id
            AND (r ->> 'rank')::integer = 1
        )
      )::bigint                                              AS vote_count,
      v_total                                                AS total_ballots
    FROM election_options eo
    LEFT JOIN ballots b ON b.election_id = p_election_id
    WHERE eo.election_id = p_election_id
    GROUP BY eo.id, eo.label, eo.order_index
    ORDER BY eo.order_index;

  ELSIF v_vote_type = 'multi_select' THEN
    RETURN QUERY
    SELECT
      eo.id                                                  AS option_id,
      eo.label                                               AS option_label,
      COUNT(b.id) FILTER (
        WHERE b.payload -> 'option_ids' @> to_jsonb(eo.id)
      )::bigint                                              AS vote_count,
      v_total                                                AS total_ballots
    FROM election_options eo
    LEFT JOIN ballots b ON b.election_id = p_election_id
    WHERE eo.election_id = p_election_id
    GROUP BY eo.id, eo.label, eo.order_index
    ORDER BY eo.order_index;

  END IF;
END;
$$;
