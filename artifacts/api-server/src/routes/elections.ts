import { Router, type IRouter, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import {
  elections,
  electionOptions,
  voterLog,
  members,
} from "@workspace/db";
import { eq, and, or, desc, inArray } from "drizzle-orm";

const router: IRouter = Router();

// Helper: coerce Drizzle `numeric` field (returned as string) to number so the
// API response matches the OpenAPI spec declaration of `number`.
function formatElection(row: typeof elections.$inferSelect) {
  return {
    ...row,
    thresholdPercent:
      row.thresholdPercent != null ? parseFloat(row.thresholdPercent) : null,
  };
}

// Helper: resolve member from X-Member-Id header.
// NOTE: This is a placeholder for a real auth system. Phase 1 uses a plain
// integer header. A proper auth system (e.g. session, JWT) ships in a later
// phase and will enforce @uw.edu email restriction.
function getMemberId(req: Request): number | null {
  const raw = req.headers["x-member-id"];
  if (!raw || Array.isArray(raw)) return null;
  const id = parseInt(raw, 10);
  return isNaN(id) ? null : id;
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const memberId = getMemberId(req);
  if (!memberId) {
    res.status(401).json({ error: "X-Member-Id header required" });
    return false;
  }
  const [member] = await db
    .select({ isAdmin: members.isAdmin })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!member?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

// GET /api/elections: list elections.
// Admins (valid X-Member-Id with isAdmin = true) see all statuses including drafts.
// Non-admins see open and closed elections only.
router.get("/elections", async (req: Request, res: Response) => {
  const memberId = getMemberId(req);
  let isAdmin = false;
  if (memberId) {
    const [member] = await db
      .select({ isAdmin: members.isAdmin })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);
    isAdmin = member?.isAdmin ?? false;
  }

  const rows = await db
    .select()
    .from(elections)
    .where(
      isAdmin
        ? undefined
        : or(eq(elections.status, "open"), eq(elections.status, "closed")),
    )
    .orderBy(desc(elections.createdAt));
  res.json(rows.map(formatElection));
});

// GET /api/elections/:id: single election with options.
// Draft elections are only visible to admins.
router.get("/elections/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const [election] = await db
    .select()
    .from(elections)
    .where(eq(elections.id, id))
    .limit(1);
  if (!election) {
    res.status(404).json({ error: "Election not found" });
    return;
  }
  if (election.status === "draft") {
    const memberId = getMemberId(req);
    let isAdmin = false;
    if (memberId) {
      const [member] = await db
        .select({ isAdmin: members.isAdmin })
        .from(members)
        .where(eq(members.id, memberId))
        .limit(1);
      isAdmin = member?.isAdmin ?? false;
    }
    if (!isAdmin) {
      res.status(404).json({ error: "Election not found" });
      return;
    }
  }
  const options = await db
    .select()
    .from(electionOptions)
    .where(eq(electionOptions.electionId, id))
    .orderBy(electionOptions.orderIndex);
  res.json({ ...formatElection(election), options });
});

// POST /api/elections/:id/vote: cast a vote via cast_vote() Postgres function.
// Member identity is derived from the X-Member-Id header only; the client
// MUST NOT pass memberId in the body. This prevents identity spoofing.
// Direct inserts into ballots are intentionally bypassed. The Postgres function
// handles both voter_log (who voted) and ballots (what was voted) atomically.
router.post("/elections/:id/vote", async (req: Request, res: Response) => {
  const electionId = parseInt(req.params.id as string, 10);
  const memberId = getMemberId(req);
  const { payload } = req.body as { payload: unknown };
  if (!memberId) {
    res.status(401).json({ error: "X-Member-Id header required" });
    return;
  }
  if (payload === undefined) {
    res.status(400).json({ error: "payload is required" });
    return;
  }
  try {
    await pool.query("SELECT cast_vote($1, $2, $3::jsonb)", [
      electionId,
      memberId,
      JSON.stringify(payload),
    ]);
    res.status(204).end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Unique violation on voter_log: member already voted
    if (msg.includes("unique") || msg.includes("voter_log")) {
      res.status(409).json({ error: "Already voted in this election" });
    } else if (msg.includes("not open")) {
      res.status(400).json({ error: msg });
    } else {
      res.status(400).json({ error: msg });
    }
  }
});

// GET /api/elections/:id/tally: aggregate counts via election_tally() function
// Individual ballot rows are never exposed: all reads go through this function.
router.get("/elections/:id/tally", async (req: Request, res: Response) => {
  const electionId = parseInt(req.params.id as string, 10);
  const [election] = await db
    .select({ quorumCount: elections.quorumCount })
    .from(elections)
    .where(eq(elections.id, electionId))
    .limit(1);
  if (!election) {
    res.status(404).json({ error: "Election not found" });
    return;
  }
  const { rows } = await pool.query<{
    option_id: number | null;
    option_label: string;
    vote_count: string;
    total_ballots: string;
  }>("SELECT * FROM election_tally($1)", [electionId]);

  const totalBallots = rows.length > 0 ? parseInt(rows[0].total_ballots, 10) : 0;
  const quorumMet =
    election.quorumCount != null ? totalBallots >= election.quorumCount : null;

  const options = rows.map((r) => ({
    optionId: r.option_id,
    optionLabel: r.option_label,
    voteCount: parseInt(r.vote_count, 10),
  }));

  res.json({ electionId, totalBallots, quorumMet, options });
});

// GET /api/elections/:id/has-voted: check voter_log for the current member.
// Member identity is derived from the X-Member-Id header only.
router.get("/elections/:id/has-voted", async (req: Request, res: Response) => {
  const electionId = parseInt(req.params.id as string, 10);
  const memberId = getMemberId(req);
  if (!memberId) {
    res.status(401).json({ error: "X-Member-Id header required" });
    return;
  }
  const [row] = await db
    .select({ id: voterLog.id })
    .from(voterLog)
    .where(
      and(eq(voterLog.electionId, electionId), eq(voterLog.memberId, memberId)),
    )
    .limit(1);
  res.json({ hasVoted: !!row });
});

// POST /api/elections: create a new election in draft status (admin only)
router.post("/elections", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const {
    title,
    description,
    voteType,
    thresholdType,
    thresholdPercent,
    quorumCount,
    eligibleVoterCount,
    showLiveProgress,
    maxSelections,
    startsAt,
    endsAt,
    createdBy,
    options: optionLabels,
  } = req.body as {
    title: string;
    description?: string;
    voteType: "yes_no" | "plurality" | "ranked_choice" | "multi_select";
    thresholdType?: "simple_majority" | "two_thirds" | "three_quarters" | "custom";
    thresholdPercent?: number;
    quorumCount?: number;
    eligibleVoterCount?: number;
    showLiveProgress: boolean;
    maxSelections?: number;
    startsAt?: string;
    endsAt?: string;
    createdBy?: number;
    options: string[];
  };

  const needsOptions = ["plurality", "ranked_choice", "multi_select"].includes(voteType);
  if (!title || !voteType) {
    res.status(400).json({ error: "title and voteType are required" });
    return;
  }
  if (needsOptions && (!Array.isArray(optionLabels) || optionLabels.length < 2)) {
    res.status(400).json({ error: "At least 2 options are required for this vote type" });
    return;
  }

  const [newElection] = await db
    .insert(elections)
    .values({
      title,
      description,
      voteType,
      thresholdType,
      thresholdPercent: thresholdPercent?.toString(),
      quorumCount,
      eligibleVoterCount,
      showLiveProgress: showLiveProgress ?? true,
      maxSelections,
      startsAt: startsAt ? new Date(startsAt) : undefined,
      endsAt: endsAt ? new Date(endsAt) : undefined,
      createdBy,
    })
    .returning();

  if (Array.isArray(optionLabels) && optionLabels.length > 0) {
    await db.insert(electionOptions).values(
      optionLabels.map((label: string, i: number) => ({
        electionId: newElection.id,
        label,
        orderIndex: i,
      })),
    );
  }

  const opts = await db
    .select()
    .from(electionOptions)
    .where(eq(electionOptions.electionId, newElection.id))
    .orderBy(electionOptions.orderIndex);

  res.status(201).json({ ...formatElection(newElection), options: opts });
});

// PATCH /api/elections/:id: update a draft election (admin only)
router.patch("/elections/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = parseInt(req.params.id as string, 10);
  const [existing] = await db
    .select()
    .from(elections)
    .where(eq(elections.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Election not found" });
    return;
  }
  if (existing.status === "closed") {
    res.status(409).json({ error: "Closed elections cannot be updated" });
    return;
  }

  const {
    title,
    description,
    thresholdType,
    thresholdPercent,
    quorumCount,
    eligibleVoterCount,
    showLiveProgress,
    maxSelections,
    startsAt,
    endsAt,
    options: optionLabels,
  } = req.body as {
    title?: string;
    description?: string;
    thresholdType?: "simple_majority" | "two_thirds" | "three_quarters" | "custom";
    thresholdPercent?: number;
    quorumCount?: number;
    eligibleVoterCount?: number;
    showLiveProgress?: boolean;
    maxSelections?: number;
    startsAt?: string;
    endsAt?: string;
    options?: string[];
  };

  const updates: Partial<typeof elections.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (thresholdType !== undefined) updates.thresholdType = thresholdType;
  if (thresholdPercent !== undefined) updates.thresholdPercent = thresholdPercent.toString();
  if (quorumCount !== undefined) updates.quorumCount = quorumCount;
  if (eligibleVoterCount !== undefined) updates.eligibleVoterCount = eligibleVoterCount;
  if (showLiveProgress !== undefined) updates.showLiveProgress = showLiveProgress;
  if (maxSelections !== undefined) updates.maxSelections = maxSelections;
  if (startsAt !== undefined) updates.startsAt = new Date(startsAt);
  if (endsAt !== undefined) updates.endsAt = new Date(endsAt);

  const [updated] = await db
    .update(elections)
    .set(updates)
    .where(eq(elections.id, id))
    .returning();

  if (Array.isArray(optionLabels) && existing.status === "draft") {
    await db.delete(electionOptions).where(eq(electionOptions.electionId, id));
    if (optionLabels.length > 0) {
      await db.insert(electionOptions).values(
        optionLabels.map((label: string, i: number) => ({
          electionId: id,
          label,
          orderIndex: i,
        })),
      );
    }
  }

  const opts = await db
    .select()
    .from(electionOptions)
    .where(eq(electionOptions.electionId, id))
    .orderBy(electionOptions.orderIndex);

  res.json({ ...formatElection(updated), options: opts });
});

// POST /api/elections/:id/open: transition draft to open (admin only)
router.post("/elections/:id/open", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = parseInt(req.params.id as string, 10);
  const [existing] = await db
    .select()
    .from(elections)
    .where(eq(elections.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Election not found" });
    return;
  }
  if (existing.status !== "draft") {
    res.status(409).json({ error: "Only draft elections can be opened" });
    return;
  }
  const [updated] = await db
    .update(elections)
    .set({ status: "open" })
    .where(eq(elections.id, id))
    .returning();
  res.json(formatElection(updated));
});

// POST /api/elections/:id/close: transition open to closed (admin only)
router.post("/elections/:id/close", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = parseInt(req.params.id as string, 10);
  const [existing] = await db
    .select()
    .from(elections)
    .where(eq(elections.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Election not found" });
    return;
  }
  if (existing.status !== "open") {
    res.status(409).json({ error: "Only open elections can be closed" });
    return;
  }
  const [updated] = await db
    .update(elections)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(elections.id, id))
    .returning();
  res.json(formatElection(updated));
});

export default router;
