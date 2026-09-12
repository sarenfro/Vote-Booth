import { Router, type IRouter, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import {
  members,
  nominations,
  nominationPositions,
  electionOptions,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const router: IRouter = Router();

function getMemberId(req: Request): string | null {
  const raw = req.headers["x-member-id"];
  if (!raw || Array.isArray(raw)) return null;
  const id = raw.trim().toLowerCase();
  return id || null;
}

async function requireEcOrAdmin(req: Request, res: Response): Promise<boolean> {
  const memberId = getMemberId(req);
  if (!memberId) {
    res.status(401).json({ error: "X-Member-Id header required" });
    return false;
  }
  const [member] = await db
    .select({ isAdmin: members.isAdmin, isEc: members.isEc })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!member?.isAdmin && !member?.isEc) {
    res.status(403).json({ error: "EC or admin access required" });
    return false;
  }
  return true;
}

function isPositionOpen(pos: { status: string; closesAt: Date | null }): boolean {
  if (pos.status !== "open") return false;
  if (pos.closesAt && new Date() > pos.closesAt) return false;
  return true;
}

// GET /api/nomination-positions
router.get("/nomination-positions", async (req: Request, res: Response) => {
  const memberId = getMemberId(req);
  let isEcOrAdmin = false;
  let memberCohort: string | null = null;

  if (memberId) {
    const [member] = await db
      .select({ isAdmin: members.isAdmin, isEc: members.isEc, cohort: members.cohort })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);
    isEcOrAdmin = !!(member?.isAdmin || member?.isEc);
    memberCohort = member?.cohort ?? null;
  }

  const rows = await db
    .select()
    .from(nominationPositions)
    .orderBy(nominationPositions.createdAt);

  if (isEcOrAdmin) {
    res.json(rows);
    return;
  }

  // For regular members: only open positions they're eligible for
  const visible = rows.filter(pos => {
    if (!isPositionOpen(pos)) return false;
    if (!pos.cohorts?.length) return true;
    return memberCohort ? pos.cohorts.includes(memberCohort) : false;
  });
  res.json(visible);
});

// POST /api/nomination-positions
router.post("/nomination-positions", async (req: Request, res: Response) => {
  if (!(await requireEcOrAdmin(req, res))) return;
  const memberId = getMemberId(req)!;
  const { title, description, cohorts, closesAt, linkedElectionId } = req.body as {
    title: string;
    description?: string | null;
    cohorts?: string[] | null;
    closesAt?: string | null;
    linkedElectionId?: number | null;
  };
  if (!title?.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const [created] = await db
    .insert(nominationPositions)
    .values({
      title: title.trim(),
      description: description ?? null,
      cohorts: cohorts ?? null,
      closesAt: closesAt ? new Date(closesAt) : null,
      linkedElectionId: linkedElectionId ?? null,
      createdBy: memberId,
    })
    .returning();
  res.status(201).json(created);
});

// PATCH /api/nomination-positions/:id
router.patch("/nomination-positions/:id", async (req: Request, res: Response) => {
  if (!(await requireEcOrAdmin(req, res))) return;
  const id = parseInt(req.params.id as string, 10);
  const [existing] = await db
    .select()
    .from(nominationPositions)
    .where(eq(nominationPositions.id, id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { title, description, cohorts, status, closesAt, linkedElectionId } = req.body as {
    title?: string;
    description?: string | null;
    cohorts?: string[] | null;
    status?: "draft" | "open" | "closed";
    closesAt?: string | null;
    linkedElectionId?: number | null;
  };

  const updates: Partial<typeof nominationPositions.$inferInsert> = {};
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description ?? null;
  if ("cohorts" in req.body) updates.cohorts = cohorts ?? null;
  if (status !== undefined) updates.status = status;
  if ("closesAt" in req.body) updates.closesAt = closesAt ? new Date(closesAt) : null;
  if ("linkedElectionId" in req.body) updates.linkedElectionId = linkedElectionId ?? null;

  const [updated] = await db
    .update(nominationPositions)
    .set(updates)
    .where(eq(nominationPositions.id, id))
    .returning();
  res.json(updated);
});

// DELETE /api/nomination-positions/:id
router.delete("/nomination-positions/:id", async (req: Request, res: Response) => {
  if (!(await requireEcOrAdmin(req, res))) return;
  const id = parseInt(req.params.id as string, 10);
  const [existing] = await db
    .select()
    .from(nominationPositions)
    .where(eq(nominationPositions.id, id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(nominations).where(eq(nominations.positionId, id));
  await db.delete(nominationPositions).where(eq(nominationPositions.id, id));
  res.status(204).end();
});

// POST /api/nomination-positions/:id/sync-to-ballot
router.post("/nomination-positions/:id/sync-to-ballot", async (req: Request, res: Response) => {
  if (!(await requireEcOrAdmin(req, res))) return;
  const id = parseInt(req.params.id as string, 10);
  const [pos] = await db
    .select()
    .from(nominationPositions)
    .where(eq(nominationPositions.id, id))
    .limit(1);
  if (!pos) { res.status(404).json({ error: "Not found" }); return; }
  if (!pos.linkedElectionId) {
    res.status(400).json({ error: "No linked election. Set a linkedElectionId first." });
    return;
  }

  // Get accepted nominees who aren't already options in the election
  const accepted = await db
    .select({ nomineeId: nominations.nomineeId })
    .from(nominations)
    .leftJoin(members, eq(members.id, nominations.nomineeId))
    .where(
      and(
        eq(nominations.positionId, id),
        eq(nominations.status, "accepted"),
      ),
    );

  const existing = await db
    .select({ label: electionOptions.label })
    .from(electionOptions)
    .where(eq(electionOptions.electionId, pos.linkedElectionId));
  const existingLabels = new Set(existing.map(o => o.label));

  const toAdd = await db
    .select({ id: members.id, name: members.name })
    .from(members)
    .where(inArray(members.id, accepted.map(a => a.nomineeId)));

  const newOptions = toAdd.filter(m => !existingLabels.has(m.name));
  if (newOptions.length > 0) {
    const maxIndex = existing.length;
    await db.insert(electionOptions).values(
      newOptions.map((m, i) => ({
        electionId: pos.linkedElectionId!,
        label: m.name,
        orderIndex: maxIndex + i,
      })),
    );
  }

  res.json({ added: newOptions.length });
});

// GET /api/nominations (EC/admin only)
router.get("/nominations", async (req: Request, res: Response) => {
  if (!(await requireEcOrAdmin(req, res))) return;
  const positionId = req.query.positionId ? parseInt(req.query.positionId as string, 10) : null;

  const params: unknown[] = [];
  const whereClause = positionId ? `AND n.position_id = $${params.push(positionId)}` : "";

  const { rows } = await pool.query<{
    id: number; positionId: number; positionTitle: string | null;
    nominatorId: string; nominatorName: string | null; nominatorEmail: string | null;
    nomineeId: string; nomineeName: string | null; nomineeEmail: string | null;
    reason: string; revealNominator: boolean; status: string; createdAt: Date;
  }>(`
    SELECT
      n.id,
      n.position_id AS "positionId",
      np.title AS "positionTitle",
      n.nominator_id AS "nominatorId",
      mr.name AS "nominatorName",
      mr.email AS "nominatorEmail",
      n.nominee_id AS "nomineeId",
      me.name AS "nomineeName",
      me.email AS "nomineeEmail",
      n.reason,
      n.reveal_nominator AS "revealNominator",
      n.status,
      n.created_at AS "createdAt"
    FROM nominations n
    LEFT JOIN nomination_positions np ON np.id = n.position_id
    LEFT JOIN members mr ON mr.id = n.nominator_id
    LEFT JOIN members me ON me.id = n.nominee_id
    ${whereClause}
    ORDER BY n.created_at DESC
  `, params);
  res.json(rows);
});

// POST /api/nominations
router.post("/nominations", async (req: Request, res: Response) => {
  const memberId = getMemberId(req);
  if (!memberId) { res.status(401).json({ error: "X-Member-Id header required" }); return; }

  const { positionId, nomineeId, reason, revealNominator } = req.body as {
    positionId: number;
    nomineeId: string;
    reason: string;
    revealNominator: boolean;
  };

  if (!positionId || !nomineeId || !reason?.trim()) {
    res.status(400).json({ error: "positionId, nomineeId, and reason are required" });
    return;
  }

  // Load position and check it's open
  const [pos] = await db
    .select()
    .from(nominationPositions)
    .where(eq(nominationPositions.id, positionId))
    .limit(1);
  if (!pos || !isPositionOpen(pos)) {
    res.status(403).json({ error: "This nomination position is not open." });
    return;
  }

  // Check nominator cohort eligibility
  const [nominator] = await db
    .select({ cohort: members.cohort })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!nominator) { res.status(404).json({ error: "Member not found" }); return; }

  if (pos.cohorts?.length) {
    if (!nominator.cohort || !pos.cohorts.includes(nominator.cohort)) {
      res.status(403).json({ error: "not_eligible" });
      return;
    }
    // Nominee must also be in the same cohort
    const [nomineeRow] = await db
      .select({ cohort: members.cohort })
      .from(members)
      .where(eq(members.id, nomineeId))
      .limit(1);
    if (!nomineeRow || !nomineeRow.cohort || !pos.cohorts.includes(nomineeRow.cohort)) {
      res.status(400).json({ error: "Nominee must be in the same eligible cohort." });
      return;
    }
  }

  const [created] = await db
    .insert(nominations)
    .values({
      positionId,
      nominatorId: memberId,
      nomineeId,
      reason: reason.trim(),
      revealNominator: revealNominator ?? false,
    })
    .returning();

  const { rows } = await pool.query(`
    SELECT n.id, n.position_id AS "positionId", np.title AS "positionTitle",
      n.nominator_id AS "nominatorId", mr.name AS "nominatorName", mr.email AS "nominatorEmail",
      n.nominee_id AS "nomineeId", me.name AS "nomineeName", me.email AS "nomineeEmail",
      n.reason, n.reveal_nominator AS "revealNominator", n.status,
      n.created_at AS "createdAt"
    FROM nominations n
    LEFT JOIN nomination_positions np ON np.id = n.position_id
    LEFT JOIN members mr ON mr.id = n.nominator_id
    LEFT JOIN members me ON me.id = n.nominee_id
    WHERE n.id = $1
  `, [created.id]);

  res.status(201).json(rows[0]);
});

// PATCH /api/nominations/:id
router.patch("/nominations/:id", async (req: Request, res: Response) => {
  if (!(await requireEcOrAdmin(req, res))) return;
  const id = parseInt(req.params.id as string, 10);
  const { status } = req.body as { status?: "pending" | "accepted" | "declined" };
  if (!status) { res.status(400).json({ error: "status is required" }); return; }

  const [updated] = await db
    .update(nominations)
    .set({ status })
    .where(eq(nominations.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  const { rows } = await pool.query(`
    SELECT n.id, n.position_id AS "positionId", np.title AS "positionTitle",
      n.nominator_id AS "nominatorId", mr.name AS "nominatorName", mr.email AS "nominatorEmail",
      n.nominee_id AS "nomineeId", me.name AS "nomineeName", me.email AS "nomineeEmail",
      n.reason, n.reveal_nominator AS "revealNominator", n.status,
      n.created_at AS "createdAt"
    FROM nominations n
    LEFT JOIN nomination_positions np ON np.id = n.position_id
    LEFT JOIN members mr ON mr.id = n.nominator_id
    LEFT JOIN members me ON me.id = n.nominee_id
    WHERE n.id = $1
  `, [updated.id]);

  res.json(rows[0]);
});

export default router;
