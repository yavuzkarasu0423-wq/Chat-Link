import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import coinsRouter from "./coins";
import bansRouter from "./bans";
import friendsRouter from "./friends";
import dmsRouter from "./dms";
import reportsRouter from "./reports";
import presenceRouter from "./presence";
import giftsRouter from "./gifts";
import adminRouter from "./admin";
import emailRouter from "./email";
import matchesRouter from "./matches";
import checkoutRouter from "./checkout";
import broadcastersRouter from "./broadcasters";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use("/profile", profileRouter);
router.use("/coins", coinsRouter);
router.use("/bans", bansRouter);
router.use("/friends", friendsRouter);
router.use("/dms", dmsRouter);
router.use("/reports", reportsRouter);
router.use("/presence", presenceRouter);
router.use("/gifts", giftsRouter);
router.use("/admin", adminRouter);
router.use("/email", emailRouter);
router.use("/matches", matchesRouter);
router.use("/checkout", checkoutRouter);
router.use("/broadcasters", broadcastersRouter);

export default router;
