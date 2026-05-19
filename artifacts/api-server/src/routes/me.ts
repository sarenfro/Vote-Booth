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

// GET /api/members: list all members (id, name, email prefix, role flags) — no auth required.
router.get("/members", async (_req: Request, res: Response) => {
  const rows = await db
    .select({ id: members.id, name: members.name, email: members.email, isAdmin: members.isAdmin, isEc: members.isEc })
    .from(members)
    .orderBy(members.name);
  res.json(rows);
});

// GET /api/me: resolve X-Member-Id header to member identity + admin status.
// Returns { memberId, isAdmin } or 401 if header is missing.
router.get("/me", async (req: Request, res: Response) => {
  const memberId = getMemberId(req);
  if (!memberId) {
    res.status(401).json({ error: "X-Member-Id header required" });
    return;
  }
  const [member] = await db
    .select({ id: members.id, isAdmin: members.isAdmin, isEc: members.isEc })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json({ memberId: member.id, isAdmin: member.isAdmin ?? false, isEc: member.isEc ?? false });
});

export default router;
