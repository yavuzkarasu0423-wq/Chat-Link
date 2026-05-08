import * as oidc from "openid-client";
import { Router, type Request, type Response } from "express";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  upsertUser,
  type SessionData,
} from "../lib/auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;
const router = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

// GET /api/auth/user veya /api/auth/me — mevcut oturum bilgisi
router.get(["/auth/user", "/auth/me"], (req: Request, res: Response) => {
  res.json({ user: req.user ?? null });
});

// GET /api/login — Replit OIDC başlat
router.get("/login", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;
    const returnTo = getSafeReturnTo(req.query.returnTo);
    const isMobile = req.query.mobile === "1";
    const webRedirect = typeof req.query.webRedirect === "string" ? req.query.webRedirect : null;

    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    const redirectTo = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: "openid email profile offline_access",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "login consent",
      state,
      nonce,
    });

    setOidcCookie(res, "code_verifier", codeVerifier);
    setOidcCookie(res, "nonce", nonce);
    setOidcCookie(res, "state", state);
    setOidcCookie(res, "return_to", returnTo);
    if (isMobile) setOidcCookie(res, "mobile", "1");
    if (isMobile && webRedirect && (webRedirect.startsWith("https://") || webRedirect.startsWith("http://"))) {
      setOidcCookie(res, "web_redirect", webRedirect);
    }

    res.redirect(redirectTo.href);
  } catch (err) {
    res.status(500).json({ error: "OIDC yapılandırması yüklenemedi" });
  }
});

// GET /api/callback — OIDC callback
router.get("/callback", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;

    const codeVerifier = req.cookies?.code_verifier as string | undefined;
    const nonce = req.cookies?.nonce as string | undefined;
    const expectedState = req.cookies?.state as string | undefined;

    if (!codeVerifier || !expectedState) {
      res.redirect("/api/login");
      return;
    }

    const currentUrl = new URL(
      `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
    );

    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });

    const returnTo = getSafeReturnTo(req.cookies?.return_to);

    res.clearCookie("code_verifier", { path: "/" });
    res.clearCookie("nonce", { path: "/" });
    res.clearCookie("state", { path: "/" });
    res.clearCookie("return_to", { path: "/" });

    const claims = tokens.claims();
    if (!claims) { res.redirect("/api/login"); return; }

    const dbUser = await upsertUser(claims as unknown as Record<string, unknown>);

    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      user: {
        id: dbUser.id,
        email: dbUser.email ?? null,
        firstName: dbUser.firstName ?? null,
        lastName: dbUser.lastName ?? null,
        profileImageUrl: dbUser.profileImageUrl ?? null,
      },
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : (claims.exp as number | undefined),
    };

    const sid = await createSession(sessionData);
    const isMobile = req.cookies?.mobile === "1";
    const webRedirectCookie = req.cookies?.web_redirect as string | undefined;
    res.clearCookie("mobile", { path: "/" });
    res.clearCookie("web_redirect", { path: "/" });

    if (isMobile) {
      setSessionCookie(res, sid);
      if (webRedirectCookie && (webRedirectCookie.startsWith("https://") || webRedirectCookie.startsWith("http://"))) {
        const rurl = new URL(webRedirectCookie);
        rurl.searchParams.set("sid", sid);
        res.redirect(rurl.toString());
      } else {
        res.redirect(`mobile://auth?sid=${sid}`);
      }
      return;
    }

    setSessionCookie(res, sid);
    res.redirect(returnTo);
  } catch {
    res.redirect("/api/login");
  }
});

// GET /api/logout — oturumu kapat
router.get("/logout", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const origin = getOrigin(req);
    const sid = getSessionId(req);
    await clearSession(res, sid);

    const endSessionUrl = oidc.buildEndSessionUrl(config, {
      client_id: process.env.REPL_ID!,
      post_logout_redirect_uri: origin,
    });
    res.redirect(endSessionUrl.href);
  } catch {
    res.redirect("/");
  }
});

export default router;
