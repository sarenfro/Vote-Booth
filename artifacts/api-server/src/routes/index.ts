import { Router, type IRouter } from "express";
import healthRouter from "./health";
import electionsRouter from "./elections";

const router: IRouter = Router();

router.use(healthRouter);
router.use(electionsRouter);

export default router;
