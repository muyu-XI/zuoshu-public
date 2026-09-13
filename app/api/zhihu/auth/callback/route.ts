import { NextResponse } from "next/server";
import {
  oauthConfig,
  readStateCookie,
  sealSession,
  ZHIHU_SESSION_COOKIE,
  ZHIHU_STATE_COOKIE,
} from "@/lib/zhihu-oauth";

export const runtime = "nodejs";

function back(origin: string, status: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/reflection?zhihu=${status}`, origin));
  response.cookies.delete(ZHIHU_STATE_COOKIE);
  return response;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const config = oauthConfig(url.origin);
  if (!config) return back(url.origin, "unavailable");
  const code = url.searchParams.get("authorization_code") || url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const storedState = readStateCookie(request);
  // 知乎当前实测回调可能只带 authorization_code；若返回 state 则必须严格匹配。
  if (!code || !storedState || (returnedState !== null && returnedState !== storedState)) {
    return back(url.origin, "failed");
  }

  try {
    const body = new URLSearchParams({
      app_id: config.appId,
      app_key: config.appKey,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      code,
    });
    const exchanged = await fetch("https://openapi.zhihu.com/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      redirect: "error",
    });
    const payload: unknown = await exchanged.json();
    if (!exchanged.ok || typeof payload !== "object" || payload === null) {
      return back(url.origin, "failed");
    }
    const record = payload as Record<string, unknown>;
    const accessToken = typeof record.access_token === "string" ? record.access_token : "";
    const parsedExpiresIn = typeof record.expires_in === "number"
      ? record.expires_in
      : Number(record.expires_in);
    const expiresIn = Number.isFinite(parsedExpiresIn) ? parsedExpiresIn : 3600;
    if (!accessToken) return back(url.origin, "failed");
    const maxAge = Math.max(60, Math.min(expiresIn, 60 * 60 * 24 * 30));
    const response = back(url.origin, "connected");
    response.cookies.set(
      ZHIHU_SESSION_COOKIE,
      sealSession({ accessToken, expiresAt: Date.now() + maxAge * 1000 }, config.cookieSecret),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: url.protocol === "https:",
        path: "/",
        maxAge,
      },
    );
    return response;
  } catch {
    return back(url.origin, "failed");
  }
}
