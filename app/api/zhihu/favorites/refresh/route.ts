import { clearFavoriteCache } from "@/lib/reflect/favorites";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!clearFavoriteCache(request)) {
    return Response.json({ error: "知乎连接已失效。" }, { status: 401 });
  }
  return Response.json({ refreshed: true }, {
    headers: { "Cache-Control": "no-store" },
  });
}
