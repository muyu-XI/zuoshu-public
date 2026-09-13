import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { oauthConfig, ZHIHU_STATE_COOKIE } from "@/lib/zhihu-oauth";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const config = oauthConfig(url.origin);
  if (!config) {
    return NextResponse.redirect(new URL("/reflection?zhihu=unavailable", url.origin));
  }
  const state = randomBytes(24).toString("base64url");
  const authorize = new URL("https://openapi.zhihu.com/authorize");
  authorize.searchParams.set("redirect_uri", config.redirectUri);
  authorize.searchParams.set("app_id", config.appId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);
  const response = NextResponse.redirect(authorize);
  response.cookies.set(ZHIHU_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 600,
  });
  return response;
}
