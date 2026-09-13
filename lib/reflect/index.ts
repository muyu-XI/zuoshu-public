import type { DailyContext, ReflectionCard } from "@/types";
import { composeReflection, type FavoriteMaterial } from "./compose";
import { readRelevantFavorites } from "./favorites";
import { buildFastQueries } from "./queries";
import { mineSignals } from "./signals";
import {
  searchZhihuBatch,
  zhihuSearchConfigured,
} from "./zhihu";
import {
  ReflectError,
  type Candidate,
  type PipelineOutcome,
  type PipelineTrace,
  type SearchQuery,
  type Signal,
} from "./types";

/** EdgeOne 外层配置为 90 秒；业务最多等待 60 秒后返回可用的本地回顾。 */
const DEFAULT_DEADLINE_MS = Number(process.env.REFLECT_DEADLINE_MS ?? 60_000);

export type RunOptions = {
  signal?: AbortSignal;
  deadlineMs?: number;
  request?: Request;
};

function linkCandidates(
  itemsByQuery: Map<string, Candidate["item"][]>,
  queries: SearchQuery[],
  signals: Signal[],
): Candidate[] {
  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  const byUrl = new Map<string, Candidate>();
  for (const query of queries) {
    const owner = signalById.get(query.signalId);
    if (!owner) continue;
    const items = itemsByQuery.get(query.text) ?? [];
    for (const [rank, item] of items.entries()) {
      const key = item.url || item.contentId || item.title;
      const existing = byUrl.get(key);
      if (existing) {
        existing.recurrence += 1;
        existing.queryRank = Math.min(existing.queryRank, rank);
      } else {
        byUrl.set(key, {
          item,
          signal: owner,
          query,
          recurrence: 1,
          queryRank: rank,
          querySize: items.length,
        });
      }
    }
  }
  return [...byUrl.values()]
    .sort((a, b) =>
      b.recurrence - a.recurrence ||
      a.queryRank - b.queryRank ||
      b.item.rankingScore - a.item.rankingScore,
    )
    .slice(0, 5);
}

function usedSources(cards: ReflectionCard[]): PipelineTrace["usedSources"] {
  return cards.flatMap((card) => {
    if (!("source" in card)) return [];
    return [{ field: card.type, title: card.source.title, url: card.source.url }];
  });
}

export async function runReflection(
  context: DailyContext,
  options: RunOptions = {},
): Promise<PipelineOutcome> {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onOuterAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(
    () => controller.abort(),
    options.deadlineMs ?? DEFAULT_DEADLINE_MS,
  );
  const signal = controller.signal;
  const degraded: string[] = [];

  try {
    if (options.signal?.aborted) {
      throw new ReflectError("TIMEOUT", "请求已取消。");
    }

    // 第一次模型调用同时完成日记整理、需求门判断和今日瞬间提取。
    const mined = await mineSignals(context, signal);
    degraded.push(...mined.degraded);
    const analysisContext = { ...context, journal: mined.cleanedJournal };
    const searchSignals = mined.signals.filter((item) => item.searchWorthy);
    const queries = buildFastQueries(searchSignals, context);
    let candidates: Candidate[] = [];
    let searchStatus: "not_needed" | "ready" | "no_match" | "unavailable" =
      queries.length ? "no_match" : "not_needed";
    const favoritesPromise = options.request
      ? readRelevantFavorites({
          request: options.request,
          context,
          signals: mined.signals,
          signal,
        })
      : Promise.resolve({ status: "signed_out" as const, items: [] as FavoriteMaterial[] });

    if (queries.length > 0 && zhihuSearchConfigured() && !signal.aborted) {
      try {
        const searched = await searchZhihuBatch(queries, signal);
        degraded.push(...searched.degraded);
        candidates = linkCandidates(searched.itemsByQuery, queries, searchSignals);
        searchStatus = candidates.length ? "ready" : "no_match";
      } catch (error) {
        searchStatus = "unavailable";
        degraded.push(`知乎经验暂时不可用：${
          error instanceof Error ? error.message : "未知错误"
        }`);
      }
    } else if (queries.length > 0 && !zhihuSearchConfigured()) {
      searchStatus = "unavailable";
      degraded.push("未配置知乎搜索，本次保留本地回顾。");
    }

    const favorites = await favoritesPromise;

    // 第二次、也是最后一次模型调用：只在存在外部候选时做严格匹配。
    const composed = await composeReflection({
      context: analysisContext,
      signals: mined.signals,
      moment: mined.moment,
      candidates,
      favorites: favorites.items,
      signal,
    });
    degraded.push(...composed.degraded);

    if (options.signal?.aborted) {
      throw new ReflectError("TIMEOUT", "请求已取消。");
    }
    if (composed.result.externalStatus) {
      const cards = composed.result.cards ?? [];
      const hasSearchCard = cards.some((card) =>
        "source" in card && card.source.origin === "search");
      const hasFavoriteCard = cards.some((card) => card.type === "past_collection");
      composed.result.externalStatus.search = searchStatus === "ready" && !hasSearchCard
        ? "no_match"
        : searchStatus;
      composed.result.externalStatus.favorites = favorites.status === "ready" && !hasFavoriteCard
        ? "no_match"
        : favorites.status;
    }

    const cards = composed.result.cards ?? [];
    const trace: PipelineTrace = {
      stages: [
        "daily-understanding",
        ...(queries.length ? ["zhihu-search"] : []),
        ...(candidates.length || favorites.items.length
          ? ["evidence-selection"]
          : []),
      ],
      signals: mined.signals,
      queries,
      candidateCount: candidates.length + favorites.items.length,
      ranked: [],
      degraded,
      usedSources: usedSources(cards),
    };
    return { result: composed.result, trace };
  } catch (error) {
    if (error instanceof ReflectError) throw error;
    throw new ReflectError("UPSTREAM_ERROR", "生成回顾失败，请稍后重试。");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}
