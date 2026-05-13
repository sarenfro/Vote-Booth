import { Router, type IRouter } from "express";
import healthRouter from "./health";
import electionsRouter from "./elections";
import meRouter from "./me";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(electionsRouter);

export default router;
