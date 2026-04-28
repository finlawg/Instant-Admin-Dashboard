import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);

router.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, "Request failed");
  const status = err?.name === "ZodError" ? 400 : 500;
  res.status(status).json({ error: err instanceof Error ? err.message : "Unknown error" });
});

export default router;
