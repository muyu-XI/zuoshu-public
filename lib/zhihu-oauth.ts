import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const ZHIHU_SESSION_COOKIE = "zuoshu-zhihu-session";
export const ZHIHU_STATE_COOKIE = "zuoshu-zhihu-state";

type OAuthSession = { accessToken: string; expiresAt: number };

export function oauthConfig(origin?: string) {
  const appId = process.env.ZHIHU_OAUTH_APP_ID?.trim();
  const appKey = process.env.ZHIHU_OAUTH_APP_KEY?.trim();
  const cookieSecret = process.env.ZHIHU_OAUTH_COOKIE_SECRET?.trim();
  const redirectUri = process.env.ZHIHU_OAUTH_REDIRECT_URI?.trim() ||
    (origin ? `${origin}/api/zhihu/auth/callback` : undefined);
  if (!appId || !appKey || !cookieSecret || !redirectUri) return null;
  return { appId, appKey, cookieSecret, redirectUri };
}

function key(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function sealSession(session: OAuthSession, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function openSession(value: string, secret: string): OAuthSession | null {
  try {
    const payload = Buffer.from(value, "base64url");
    if (payload.length < 29) return null;
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
    decipher.setAuthTag(tag);
    const decoded = JSON.parse(Buffer.concat([
      decipher.update(payload.subarray(28)),
      decipher.final(),
    ]).toString("utf8")) as Partial<OAuthSession>;
    if (typeof decoded.accessToken !== "string" ||
        typeof decoded.expiresAt !== "number" || decoded.expiresAt <= Date.now()) {
      return null;
    }
    return { accessToken: decoded.accessToken, expiresAt: decoded.expiresAt };
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function readOAuthSession(request: Request): OAuthSession | null {
  const config = oauthConfig(new URL(request.url).origin);
  const value = cookieValue(request, ZHIHU_SESSION_COOKIE);
  return config && value ? openSession(value, config.cookieSecret) : null;
}

export function readStateCookie(request: Request): string | null {
  return cookieValue(request, ZHIHU_STATE_COOKIE);
}
