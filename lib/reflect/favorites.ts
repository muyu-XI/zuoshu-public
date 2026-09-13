import { createHash } from "node:crypto";
import type { DailyContext } from "@/types";
import { readOAuthSession } from "@/lib/zhihu-oauth";
import { bigrams, sourceTextFrom } from "./text";
import type { FavoriteMaterial } from "./compose";
import type { Signal, ZhihuSearchItem } from "./types";

type FavoriteResponseItem = Record<string, unknown>;
type CacheEntry = { at: number; items: FavoriteMaterial[] };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export function clearFavoriteCache(request: Request): boolean {
  const session = readOAuthSession(request);
  if (!session) return false;
  const cacheKey = createHash("sha256").update(session.accessToken).digest("hex");
  cache.delete(cacheKey);
  return true;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalize(entry: FavoriteResponseItem): FavoriteMaterial | null {
  const title = text(entry.Title);
  const contentText = sourceTextFrom(text(entry.Summary));
  const url = text(entry.Url);
  if (!title || !contentText || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" ||
        !(parsed.hostname === "zhihu.com" || parsed.hostname.endsWith(".zhihu.com"))) return null;
  } catch {
    return null;
  }
  const author = typeof entry.Author === "object" && entry.Author
    ? text((entry.Author as Record<string, unknown>).Name)
    : "";
  const item: ZhihuSearchItem = {
    title,
    contentType: text(entry.ContentType),
    contentId: url,
    contentText,
    url,
    commentCount: number(entry.CommentCount),
    voteUpCount: number(entry.LikeCount),
    authorName: author,
    authorBadgeText: "",
    authorityLevel: "",
    editTime: number(entry.CreatedAt),
    rankingScore: 0,
  };
  return { item, savedAt: number(entry.FavTime) || undefined };
}

function similarity(left: string, right: string): number {
  const a = new Set(bigrams(left));
  const b = new Set(bigrams(right));
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return shared / Math.min(a.size, b.size);
}

function selectRelevant(
  items: FavoriteMaterial[],
  context: DailyContext,
  signals: Signal[],
): FavoriteMaterial[] {
  const anchors = [context.journal, ...signals.flatMap((signal) => [signal.text, signal.evidence])];
  const excluded = new Set(context.excludedFavoriteUrls ?? []);
  return items
    .filter((favorite) => !excluded.has(favorite.item.url))
    .map((favorite) => ({
      favorite,
      score: Math.max(...anchors.map((anchor) =>
        similarity(anchor, `${favorite.item.title}${favorite.item.contentText}`))),
    }))
    .filter(({ score }) => score >= 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ favorite }) => favorite);
}

export async function readRelevantFavorites(args: {
  request: Request;
  context: DailyContext;
  signals: Signal[];
  signal: AbortSignal;
}): Promise<{ status: "signed_out" | "ready" | "no_match" | "unavailable"; items: FavoriteMaterial[] }> {
  const session = readOAuthSession(args.request);
  const secret = process.env.ZHIHU_ACCESS_SECRET?.trim();
  if (!session) return { status: "signed_out", items: [] };
  if (!secret) return { status: "unavailable", items: [] };
  const cacheKey = createHash("sha256").update(session.accessToken).digest("hex");
  let all = cache.get(cacheKey);
  if (!all || Date.now() - all.at > CACHE_TTL_MS) {
    try {
      const url = new URL("https://developer.zhihu.com/api/v1/user/collections");
      url.searchParams.set("Limit", "50");
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${secret}`,
          "X-OAuth-Token": session.accessToken,
          "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
          "Content-Type": "application/json",
        },
        signal: args.signal,
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok || typeof payload !== "object" || payload === null) {
        return { status: "unavailable", items: [] };
      }
      const data = (payload as Record<string, unknown>).Data;
      const records = typeof data === "object" && data !== null &&
        Array.isArray((data as Record<string, unknown>).Items)
        ? ((data as Record<string, unknown>).Items as FavoriteResponseItem[])
        : [];
      all = { at: Date.now(), items: records.map(normalize).filter((item): item is FavoriteMaterial => item !== null) };
      cache.set(cacheKey, all);
    } catch {
      return { status: "unavailable", items: [] };
    }
  }
  const items = selectRelevant(all.items, args.context, args.signals);
  return { status: items.length ? "ready" : "no_match", items };
}
