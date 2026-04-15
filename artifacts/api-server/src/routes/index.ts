import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dropsRouter from "./drops";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dropsRouter);

export default router;
