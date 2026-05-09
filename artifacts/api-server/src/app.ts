import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const _rlMap = new Map<string, [count: number, resetAt: number]>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rlMap) if (now > v[1]) _rlMap.delete(k);
}, 5 * 60 * 1000);

function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";
    const now = Date.now();
    const e = _rlMap.get(ip);
    if (!e || now > e[1]) {
      _rlMap.set(ip, [1, now + windowMs]);
      return next();
    }
    e[0]++;
    if (e[0] > max) {
      res.status(429).json({ error: "Çok fazla istek, lütfen bekleyin." });
      return;
    }
    next();
  };
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(cookieParser());
// Stripe webhooks need the raw body for signature verification — mount express.raw BEFORE express.json
app.use("/api/subscription/webhook", express.raw({ type: "application/json" }));
app.use("/api/checkout/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(authMiddleware);

app.use(rateLimit(300, 60 * 1000));

// Admin routes: generous limit for dashboard polling — 120 req/min per IP
app.use("/api/admin", rateLimit(120, 60 * 1000));

app.use("/api", router);

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
