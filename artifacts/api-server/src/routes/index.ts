import { Router, type IRouter } from "express";
import healthRouter from "./health";
import electionsRouter from "./elections";
import meRouter from "./me";
import storageRouter from "./storage";
import documentsRouter from "./documents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(electionsRouter);
router.use(storageRouter);
router.use(documentsRouter);

export default router;
