import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { members } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function getMemberId(req: Request): string | null {
  const raw = req.headers["x-member-id"];
  if (!raw || Array.isArray(raw)) return null;
  const id = raw.trim().toLowerCase();
  return id || null;
}

async function requireEcOrAdmin(req: Request, res: Response): Promise<boolean> {
  const memberId = getMemberId(req);
  if (!memberId) { res.status(401).json({ error: "X-Member-Id header required" }); return false; }
  const [member] = await db
    .select({ isAdmin: members.isAdmin, isEc: members.isEc })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!member?.isAdmin && !member?.isEc) {
    res.status(403).json({ error: "EC or admin access required" }); return false;
  }
  return true;
}

// GET /api/members: list all members with cohort and disqualified status.
router.get("/members", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      id: members.id,
      name: members.name,
      email: members.email,
      isAdmin: members.isAdmin,
      isEc: members.isEc,
      cohort: members.cohort,
      disqualified: members.disqualified,
    })
    .from(members)
    .orderBy(members.name);
  res.json(rows);
});

// PATCH /api/members/:id: update disqualified flag and/or cohort (EC/admin only).
router.patch("/members/:id", async (req: Request, res: Response) => {
  if (!(await requireEcOrAdmin(req, res))) return;
  const id = req.params.id as string;
  const { disqualified, cohort } = req.body as { disqualified?: boolean; cohort?: string | null };
  const updates: Partial<{ disqualified: boolean; cohort: string | null }> = {};
  if (typeof disqualified === "boolean") updates.disqualified = disqualified;
  if (cohort !== undefined) updates.cohort = cohort ?? null;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }
  const [updated] = await db
    .update(members)
    .set(updates)
    .where(eq(members.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Member not found" }); return; }
  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    isAdmin: updated.isAdmin,
    isEc: updated.isEc,
    cohort: updated.cohort ?? null,
    disqualified: updated.disqualified,
  });
});

// GET /api/me: resolve X-Member-Id header to member identity + role flags.
router.get("/me", async (req: Request, res: Response) => {
  const memberId = getMemberId(req);
  if (!memberId) {
    res.status(401).json({ error: "X-Member-Id header required" });
    return;
  }
  const [member] = await db
    .select({ id: members.id, isAdmin: members.isAdmin, isEc: members.isEc, cohort: members.cohort })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json({ memberId: member.id, isAdmin: member.isAdmin ?? false, isEc: member.isEc ?? false, cohort: member.cohort ?? null });
});

export default router;
