import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { members, ballotDocuments, elections } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateDocumentBody } from "@workspace/api-zod";

const router: IRouter = Router();

function getMemberId(req: Request): number | null {
  const raw = req.headers["x-member-id"];
  if (!raw || Array.isArray(raw)) return null;
  const id = parseInt(raw, 10);
  return isNaN(id) ? null : id;
}

async function requireEc(req: Request, res: Response): Promise<number | null> {
  const memberId = getMemberId(req);
  if (!memberId) {
    res.status(401).json({ error: "X-Member-Id header required" });
    return null;
  }
  const [member] = await db
    .select({ id: members.id, isEc: members.isEc, isAdmin: members.isAdmin })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return null;
  }
  if (!member.isEc && !member.isAdmin) {
    res.status(403).json({ error: "EC or admin access required" });
    return null;
  }
  return member.id;
}

router.post("/documents", async (req: Request, res: Response) => {
  const uploaderId = await requireEc(req, res);
  if (!uploaderId) return;

  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid fields" });
    return;
  }

  const { electionId, name, objectPath } = parsed.data;

  const [election] = await db
    .select({ id: elections.id })
    .from(elections)
    .where(eq(elections.id, electionId))
    .limit(1);
  if (!election) {
    res.status(404).json({ error: "Election not found" });
    return;
  }

  const [doc] = await db
    .insert(ballotDocuments)
    .values({ electionId, name, objectPath, uploadedBy: uploaderId })
    .returning();

  res.status(201).json(doc);
});

router.get("/elections/:id/documents", async (req: Request, res: Response) => {
  const electionId = parseInt(req.params.id, 10);
  if (isNaN(electionId)) {
    res.status(400).json({ error: "Invalid election id" });
    return;
  }

  const docs = await db
    .select()
    .from(ballotDocuments)
    .where(eq(ballotDocuments.electionId, electionId))
    .orderBy(ballotDocuments.createdAt);

  res.json(docs);
});

router.delete("/documents/:id", async (req: Request, res: Response) => {
  const uploaderId = await requireEc(req, res);
  if (!uploaderId) return;

  const docId = parseInt(req.params.id, 10);
  if (isNaN(docId)) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  const [doc] = await db
    .select()
    .from(ballotDocuments)
    .where(eq(ballotDocuments.id, docId))
    .limit(1);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  await db.delete(ballotDocuments).where(eq(ballotDocuments.id, docId));
  res.status(204).end();
});

export default router;
