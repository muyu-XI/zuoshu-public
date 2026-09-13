import { NextResponse } from "next/server";
import { ZHIHU_SESSION_COOKIE, ZHIHU_STATE_COOKIE } from "@/lib/zhihu-oauth";

export async function POST(): Promise<Response> {
  const response = NextResponse.json({ connected: false });
  response.cookies.delete(ZHIHU_SESSION_COOKIE);
  response.cookies.delete(ZHIHU_STATE_COOKIE);
  return response;
}
