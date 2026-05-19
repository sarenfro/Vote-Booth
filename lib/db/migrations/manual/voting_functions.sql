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
--
-- Validation order (mirrors the reference spec):
--   1. Caller must be a registered member
--   2. Election must exist and be open
--   3. starts_at / ends_at timing windows must be satisfied
--   4. Payload must match the election vote_type schema
--   5. multi_select must not exceed max_selections
--   6. Split-table insert: voter_log (who) then ballots (what, no voter link)
CREATE OR REPLACE FUNCTION cast_vote(
  p_election_id integer,
  p_member_id   text,
  p_payload     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_election elections%rowtype;
BEGIN
  -- 1. Caller must be a registered member.
  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM members WHERE id = p_member_id) THEN
    RAISE EXCEPTION 'Not a registered member';
  END IF;

  -- 2. Election must exist and be open.
  SELECT * INTO v_election FROM elections WHERE id = p_election_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Election not found';
  END IF;
  IF v_election.status <> 'open' THEN
    RAISE EXCEPTION 'Election is not open';
  END IF;

  -- 3. Timing window validation.
  IF v_election.starts_at IS NOT NULL AND now() < v_election.starts_at THEN
    RAISE EXCEPTION 'Election has not started';
  END IF;
  IF v_election.ends_at IS NOT NULL AND now() > v_election.ends_at THEN
    RAISE EXCEPTION 'Election has ended';
  END IF;

  -- 4. Per-vote-type payload validation.
  CASE v_election.vote_type
    WHEN 'yes_no' THEN
      IF NOT (p_payload ? 'choice') OR
         (p_payload ->> 'choice') NOT IN ('yes', 'no') THEN
        RAISE EXCEPTION 'Invalid yes/no payload: expected {"choice": "yes"|"no"}';
      END IF;

    WHEN 'plurality' THEN
      IF NOT (p_payload ? 'option_id') THEN
        RAISE EXCEPTION 'Invalid plurality payload: expected {"option_id": <number>}';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM election_options
        WHERE election_id = p_election_id
          AND id = (p_payload ->> 'option_id')::integer
      ) THEN
        RAISE EXCEPTION 'option_id does not belong to this election';
      END IF;

    WHEN 'ranked_choice' THEN
      -- Frontend and API use the key "rankings" (array of {option_id, rank}).
      IF NOT (p_payload ? 'rankings') OR
         jsonb_typeof(p_payload -> 'rankings') <> 'array' THEN
        RAISE EXCEPTION 'Invalid ranked_choice payload: expected {"rankings": [...]}';
      END IF;

    WHEN 'multi_select' THEN
      IF NOT (p_payload ? 'option_ids') OR
         jsonb_typeof(p_payload -> 'option_ids') <> 'array' THEN
        RAISE EXCEPTION 'Invalid multi_select payload: expected {"option_ids": [...]}';
      END IF;
      -- 5. Enforce max_selections when the election defines one.
      IF v_election.max_selections IS NOT NULL AND
         jsonb_array_length(p_payload -> 'option_ids') > v_election.max_selections THEN
        RAISE EXCEPTION 'Too many selections: max is %', v_election.max_selections;
      END IF;

  END CASE;

  -- 6. Split-table insert. voter_log UNIQUE constraint blocks double votes.
  INSERT INTO voter_log (election_id, member_id, voted_at)
  VALUES (p_election_id, p_member_id, now());

  -- Ballots has no voter link (anonymity guarantee).
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
