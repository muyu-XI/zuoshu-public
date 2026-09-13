import { ReflectError, type SearchQuery, type ZhihuSearchItem } from "./types";

/**
 * 知乎站内搜索 API（知乎开放平台）。
 * 文档：references/http-api.md 「知乎搜索 API」
 *
 * 鉴权使用 Access Secret：
 *   Authorization: Bearer <access_secret>
 *   X-Request-Timestamp: <秒级 Unix 时间戳>
 *
 * 额度有限，因此使用进程内结果缓存和同查询并发去重，避免重复请求。
 * 平台返回频率限制时立即停止，不做自动重试。
 */

const SEARCH_ENDPOINT = "https://developer.zhihu.com/api/v1/content/zhihu_search";
const QUOTA_ENDPOINT = "https://developer.zhihu.com/api/v1/quota";
const SEARCH_COUNT = Math.min(
  10,
  Math.max(1, Number(process.env.REFLECT_SEARCH_COUNT ?? 5)),
);
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const REQUEST_TIMEOUT_MS = 12_000;

// 平台侧错误码 → 我方语义。
const CODE_SUCCESS = 0;
const CODE_PARAM_ERROR = 10001;
const CODE_AUTH_FAILED = 20001;
const CODE_RATE_LIMITED = 30001;

type CacheEntry = { at: number; items: ZhihuSearchItem[] };

const resultCache = new Map<string, CacheEntry>();
type PendingSearch = { promise: Promise<ZhihuSearchItem[]>; controller: AbortController; users: number };
const inflight = new Map<string, PendingSearch>();

export function zhihuSearchConfigured(): boolean {
  return Boolean(process.env.ZHIHU_ACCESS_SECRET?.trim());
}

/**
 * 查询当前自然日知乎搜索的剩余额度。
 *
 * 该查询**不消耗**业务额度，所以在真正花钱之前先问一句是划算的：
 * 额度耗尽时可以直接给出明确原因，而不是让整条管道白跑一遍再失败。
 * 查询失败返回 null，表示「不知道」，此时按调用方的默认上限继续。
 *
 * 注意：踩到 30001 频率限制期间，这个接口可能返回的是短窗口读数而不是当日额度，
 * 因此它只适合做「够不够」的粗判断，不要用它做精确统计。
 */
export async function readSearchQuota(
  outerSignal: AbortSignal,
): Promise<number | null> {
  try {
    const url = new URL(QUOTA_ENDPOINT);
    url.searchParams.set("APIIDs", "zhihu_search");
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessSecret()}`,
        "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
      },
      signal: outerSignal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) return null;
    const data = (payload as Record<string, unknown>).Data;
    if (!Array.isArray(data) || data.length === 0) return null;
    const item = data[0];
    if (typeof item !== "object" || item === null) return null;
    const remaining = (item as Record<string, unknown>).RemainingQuota;
    return typeof remaining === "number" && Number.isFinite(remaining)
      ? remaining
      : null;
  } catch {
    return null;
  }
}

function accessSecret(): string {
  const secret = process.env.ZHIHU_ACCESS_SECRET?.trim();
  if (!secret) {
    throw new ReflectError(
      "MISSING_CONFIG",
      "未配置 ZHIHU_ACCESS_SECRET，无法调用知乎搜索 API。",
    );
  }
  return secret;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** 服务端可能增删字段，这里做保守归一化，缺失字段不猜造。 */
function normalizeItem(raw: unknown): ZhihuSearchItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const title = asString(record.Title).trim();
  const url = asString(record.Url).trim();
  const contentId = asString(record.ContentID).trim();
  if (!title || !asString(record.ContentText).trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        !(parsed.hostname === "zhihu.com" || parsed.hostname.endsWith(".zhihu.com"))) return null;
  } catch { return null; }
  return {
    title,
    contentType: asString(record.ContentType),
    contentId,
    contentText: asString(record.ContentText).trim(),
    url,
    commentCount: asNumber(record.CommentCount),
    voteUpCount: asNumber(record.VoteUpCount),
    authorName: asString(record.AuthorName).trim(),
    authorBadgeText: asString(record.AuthorBadgeText).trim(),
    authorityLevel: asString(record.AuthorityLevel).trim(),
    editTime: asNumber(record.EditTime),
    rankingScore: asNumber(record.RankingScore),
  };
}

function cacheKey(query: string): string {
  return `${SEARCH_COUNT}:${query.trim().toLowerCase()}`;
}

function readCache(key: string): ZhihuSearchItem[] | null {
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    resultCache.delete(key);
    return null;
  }
  return hit.items;
}

function writeCache(key: string, items: ZhihuSearchItem[]): void {
  if (resultCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = resultCache.keys().next();
    if (!oldest.done) resultCache.delete(oldest.value);
  }
  resultCache.set(key, { at: Date.now(), items });
}

function mapErrorCode(code: number): ReflectError | null {
  if (code === CODE_SUCCESS) return null;
  if (code === CODE_AUTH_FAILED) {
    return new ReflectError(
      "UPSTREAM_AUTH",
      `知乎搜索鉴权失败（${code}）。`,
    );
  }
  if (code === CODE_RATE_LIMITED) {
    return new ReflectError(
      "UPSTREAM_RATE_LIMIT",
      `知乎搜索触发频率限制（${code}），请稍后再试。`,
    );
  }
  if (code === CODE_PARAM_ERROR) {
    return new ReflectError(
      "UPSTREAM_ERROR",
      `知乎搜索参数错误（${code}）。`,
    );
  }
  return new ReflectError(
    "UPSTREAM_ERROR",
    `知乎搜索返回错误（${code}）。`,
  );
}

/** 实际发起一次搜索请求。调用方负责缓存与去重。 */
async function requestSearch(
  query: string,
  outerSignal: AbortSignal,
): Promise<ZhihuSearchItem[]> {
  outerSignal.throwIfAborted();

  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("Query", query);
  url.searchParams.set("Count", String(SEARCH_COUNT));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  outerSignal.addEventListener("abort", onOuterAbort, { once: true });
  if (outerSignal.aborted) controller.abort();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessSecret()}`,
        "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new ReflectError(
          "UPSTREAM_RATE_LIMIT",
          "知乎搜索返回 429，请降低调用频率。",
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new ReflectError(
          "UPSTREAM_AUTH",
          `知乎搜索鉴权失败（HTTP ${response.status}）。`,
        );
      }
      throw new ReflectError(
        "UPSTREAM_ERROR",
        `知乎搜索返回 HTTP ${response.status}。`,
      );
    }

    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) {
      throw new ReflectError("UPSTREAM_ERROR", "知乎搜索返回了非对象响应。");
    }
    const body = payload as Record<string, unknown>;
    const mapped = mapErrorCode(asNumber(body.Code, -1));
    if (mapped) throw mapped;

    const data = body.Data;
    if (typeof data !== "object" || data === null) return [];
    const items = (data as Record<string, unknown>).Items;
    if (!Array.isArray(items)) return [];
    return items
      .map(normalizeItem)
      .filter((item): item is ZhihuSearchItem => item !== null);
  } catch (error) {
    if (error instanceof ReflectError) throw error;
    if (controller.signal.aborted) {
      if (outerSignal.aborted) throw error;
      throw new ReflectError("TIMEOUT", `知乎搜索超时：${query}`);
    }
    throw new ReflectError(
      "UPSTREAM_ERROR",
      "知乎搜索请求失败，请稍后重试。",
    );
  } finally {
    clearTimeout(timer);
    outerSignal.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * 带缓存与并发去重的单查询检索。
 */
export async function searchZhihu(
  query: string,
  outerSignal: AbortSignal,
): Promise<ZhihuSearchItem[]> {
  outerSignal.throwIfAborted();
  const key = cacheKey(query);
  const cached = readCache(key);
  if (cached) return cached;

  let pending = inflight.get(key);
  if (!pending || pending.controller.signal.aborted) {
    const controller = new AbortController();
    const entry: PendingSearch = {
      controller, users: 0,
      promise: requestSearch(query, controller.signal).then((items) => {
        if (!controller.signal.aborted) writeCache(key, items);
        return items;
      }).finally(() => {
        if (inflight.get(key) === entry) inflight.delete(key);
      }),
    };
    inflight.set(key, entry);
    pending = entry;
  }
  const entry = pending;
  entry.users++;
  return new Promise((resolve, reject) => {
    const abort = () => reject(outerSignal.reason);
    outerSignal.addEventListener("abort", abort, { once: true });
    entry.promise.then(resolve, reject).finally(() => outerSignal.removeEventListener("abort", abort));
    if (outerSignal.aborted) abort();
  }).finally(() => {
    entry.users--;
    if (entry.users === 0) entry.controller.abort();
  }) as Promise<ZhihuSearchItem[]>;
}

export type SearchBatchResult = {
  itemsByQuery: Map<string, ZhihuSearchItem[]>;
  requestCount: number;
  cacheHits: number;
  degraded: string[];
};

/** 两条互补查询并行执行，避免把上游延迟相加。 */
export async function searchZhihuBatch(
  queries: SearchQuery[],
  outerSignal: AbortSignal,
): Promise<SearchBatchResult> {
  const itemsByQuery = new Map<string, ZhihuSearchItem[]>();
  const degraded: string[] = [];
  let requestCount = 0;
  let cacheHits = 0;

  const results = await Promise.all(queries.map(async (query) => {
    const cached = readCache(cacheKey(query.text)) !== null;
    try {
      return { query, cached, items: await searchZhihu(query.text, outerSignal) };
    } catch (error) {
      if (
        error instanceof ReflectError &&
        (error.code === "UPSTREAM_AUTH" ||
          error.code === "UPSTREAM_RATE_LIMIT" ||
          error.code === "MISSING_CONFIG")
      ) {
        throw error;
      }
      return { query, cached, items: [] as ZhihuSearchItem[], error };
    }
  }));

  for (const result of results) {
    itemsByQuery.set(result.query.text, result.items);
    if (result.cached) cacheHits += 1;
    else requestCount += 1;
    if (result.error) {
      degraded.push(`检索「${result.query.text}」失败：${
        result.error instanceof Error ? result.error.message : "未知错误"
      }`);
    } else if (result.items.length === 0) {
      degraded.push(`检索「${result.query.text}」没有返回结果。`);
    }
  }

  return { itemsByQuery, requestCount, cacheHits, degraded };
}
