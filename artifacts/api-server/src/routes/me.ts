import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { members } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function getMemberId(req: Request): number | null {
  const raw = req.headers["x-member-id"];
  if (!raw || Array.isArray(raw)) return null;
  const id = parseInt(raw, 10);
  return isNaN(id) ? null : id;
}

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
