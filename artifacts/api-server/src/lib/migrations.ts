import { pool } from "@workspace/db";
import { logger } from "./logger";

const ADD_RESULTS_VISIBLE_SQL = `
ALTER TABLE elections
  ADD COLUMN IF NOT EXISTS results_visible boolean NOT NULL DEFAULT false;
`;

const ADD_BALLOT_MEMBER_SQL = `
ALTER TABLE ballots
  ADD COLUMN IF NOT EXISTS member_id text REFERENCES members(id);
CREATE INDEX IF NOT EXISTS ballots_election_member_idx
  ON ballots (election_id, member_id);
`;

const VOTING_FUNCTIONS_SQL = `
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
  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM members WHERE id = p_member_id) THEN
    RAISE EXCEPTION 'Not a registered member';
  END IF;

  SELECT * INTO v_election FROM elections WHERE id = p_election_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Election not found';
  END IF;
  IF v_election.status <> 'open' THEN
    RAISE EXCEPTION 'Election is not open';
  END IF;

  IF v_election.starts_at IS NOT NULL AND now() < v_election.starts_at THEN
    RAISE EXCEPTION 'Election has not started';
  END IF;
  IF v_election.ends_at IS NOT NULL AND now() > v_election.ends_at THEN
    RAISE EXCEPTION 'Election has ended';
  END IF;

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
      IF NOT (p_payload ? 'rankings') OR
         jsonb_typeof(p_payload -> 'rankings') <> 'array' THEN
        RAISE EXCEPTION 'Invalid ranked_choice payload: expected {"rankings": [...]}';
      END IF;

    WHEN 'multi_select' THEN
      IF NOT (p_payload ? 'option_ids') OR
         jsonb_typeof(p_payload -> 'option_ids') <> 'array' THEN
        RAISE EXCEPTION 'Invalid multi_select payload: expected {"option_ids": [...]}';
      END IF;
      IF v_election.max_selections IS NOT NULL AND
         jsonb_array_length(p_payload -> 'option_ids') > v_election.max_selections THEN
        RAISE EXCEPTION 'Too many selections: max is %', v_election.max_selections;
      END IF;

  END CASE;

  INSERT INTO voter_log (election_id, member_id, voted_at)
  VALUES (p_election_id, p_member_id, now());

  INSERT INTO ballots (election_id, member_id, payload, submitted_at)
  VALUES (p_election_id, p_member_id, p_payload, now());
END;
$$;
`;

export async function runMigrations() {
  await pool.query(ADD_RESULTS_VISIBLE_SQL);
  await pool.query(ADD_BALLOT_MEMBER_SQL);
  await pool.query(VOTING_FUNCTIONS_SQL);
  logger.info("DB migrations applied");
}
