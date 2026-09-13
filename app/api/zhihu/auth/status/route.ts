import { oauthConfig, readOAuthSession } from "@/lib/zhihu-oauth";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const configured = oauthConfig(new URL(request.url).origin) !== null;
  const session = configured ? readOAuthSession(request) : null;
  return Response.json(
    { configured, connected: session !== null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
