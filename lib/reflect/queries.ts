import type { DailyContext } from "@/types";
import { llmDegradeNote, llmJson } from "./llm";
import { normalizeForMatch, truncate } from "./text";
import { topicFromText } from "./topic";
import {
  isQueryKind,
  type QueryKind,
  type SearchQuery,
  type Signal,
} from "./types";

/** 阶段 2：把一个信号拆成不同类型的知乎检索词。 */
/**
 * 单次回顾最多发出的检索请求数。
 *
 * 新版日流程默认最多两条互补查询；保留该常量供旧拆词函数和测试使用。
 */
export const MAX_QUERIES = Math.max(
  1,
  Number(process.env.REFLECT_MAX_QUERIES ?? 2),
);

export const QUERY_KIND_LABEL: Record<QueryKind, string> = {
  experience: "经验型",
  method: "方法型",
  cognition: "认知型",
};

/**
 * 确定性降级方案：按「经验型 / 方法型 / 认知型」三类模板生成检索词。
 * 模型可用时不会走这里，因此这里只求「能问出去」，不求措辞完美。
 */
function heuristicQueries(
  signal: Signal,
  context: DailyContext,
): SearchQuery[] {
  const topic = topicFromText(signal.evidence || signal.text, context, 12);
  const lacksMotivation = /没(?:有)?动力|提不起劲/.test(
    `${signal.text}${signal.evidence}`,
  );
  const templates: Record<QueryKind, string> = (() => {
    switch (signal.kind) {
      case "friction":
        if (lacksMotivation) {
          return {
            experience: `${topic}没动力时别人是怎么走过来的`,
            method: `${topic}没动力怎么重新开始`,
            cognition: `${topic}没动力一定是懒吗`,
          };
        }
        return {
          experience: `第一次接触${topic}进度很慢正常吗`,
          method: `怎么提高${topic}的效率`,
          cognition: `${topic}是不是越快越好`,
        };
      case "emotion":
        return {
          experience: `${topic}时情绪低落正常吗`,
          method: `怎么调整${topic}时的心态`,
          cognition: `对${topic}的焦虑是必要的吗`,
        };
      case "curiosity":
        return {
          experience: `刚开始接触${topic}是什么体验`,
          method: `${topic}应该怎么入门`,
          cognition: `值得投入时间在${topic}上吗`,
        };
      case "question":
      default: {
        const base = truncate(signal.text.replace(/[?？]$/, "").trim(), 20);
        return {
          experience: `${base}，别人也遇到过吗`,
          method: `${base}应该怎么解决`,
          cognition: `${base}是不是一个真问题`,
        };
      }
    }
  })();

  return (["experience", "method", "cognition"] as const).map((kind) => ({
    text: truncate(templates[kind], 40),
    kind,
    signalId: signal.id,
  }));
}

/**
 * 线上回顾只为最重要的一个未解决需要发出两条互补查询。
 * 查询由确定性模板生成，省掉一次串行模型调用并控制外部请求预算。
 */
export function buildFastQueries(
  signals: Signal[],
  context: DailyContext,
): SearchQuery[] {
  const selected = signals
    .filter((signal) => signal.searchWorthy)
    .sort((a, b) => b.weight - a.weight)[0];
  if (!selected) return [];
  const queries = heuristicQueries(selected, context);
  return queries
    .filter((query) => query.kind === "experience" || query.kind === "method")
    .slice(0, 2);
}

function buildQueryPrompt(signals: Signal[]): string {
  return [
    "用户的今日信号如下：",
    ...signals.map(
      (signal, index) =>
        `${index + 1}. [${signal.kind}] ${signal.text}（依据：${signal.evidence}）`,
    ),
    "",
    "请为每个信号生成知乎站内检索词，覆盖三种类型：",
    "- experience 经验型：想找到有过相同经历的人怎么说，例如「第一次读论文很慢正常吗」",
    "- method 方法型：想找到可执行的做法，例如「科研新人如何提高论文阅读效率」",
    "- cognition 认知型：想挑战或校准原有认知，例如「读论文是不是越快越好」",
    "",
    "要求：",
    "- 每条检索词都是可以直接丢进知乎搜索框的短句，不超过 20 字，不要加引号或标点结尾。",
    "- 三种类型的问题角度必须真的不同，不要只换同义词。",
    "- 检索词要贴合这位用户今天的实际情况，而不是泛泛的百科问题。",
    "",
    "只输出 JSON：",
    '{"queries":[{"signalIndex":1,"kind":"experience","text":"..."}]}',
  ].join("\n");
}

type RawQuery = { signalIndex?: unknown; kind?: unknown; text?: unknown };

export async function decomposeQueries(
  signals: Signal[],
  context: DailyContext,
  signal: AbortSignal,
): Promise<{ queries: SearchQuery[]; degraded: string[] }> {
  const degraded: string[] = [];
  if (signals.length === 0) return { queries: [], degraded };

  const raw = await llmJson<{ queries?: RawQuery[] }>({
    system:
      "你是检索策略助手，负责把用户的个人困境翻译成知乎站内可检索的问题。只输出 JSON。",
    user: `${buildQueryPrompt(signals)}\n\n补充：今天日期 ${context.date}。`,
    signal,
  });

  const parsed = Array.isArray(raw?.queries) ? raw.queries : null;
  const collected: SearchQuery[] = [];
  if (parsed && parsed.length > 0) {
    parsed.forEach((entry) => {
      if (!isQueryKind(entry.kind)) return;
      const text = typeof entry.text === "string" ? entry.text.trim() : "";
      if (text.length < 3) return;
      const index =
        typeof entry.signalIndex === "number" ? entry.signalIndex : 1;
      const owner = signals[index - 1] ?? signals[0];
      if (!owner) return;
      collected.push({
        text: truncate(text.replace(/[?？。！!]+$/, ""), 40),
        kind: entry.kind,
        signalId: owner.id,
      });
    });
  } else {
    degraded.push(llmDegradeNote("检索词生成"));
  }

  // 模型只给了一部分时，用模板补齐缺失的类型。
  for (const owner of signals) {
    const existingKinds = new Set(
      collected.filter((query) => query.signalId === owner.id).map((q) => q.kind),
    );
    if (existingKinds.size >= 3) continue;
    for (const fallback of heuristicQueries(owner, context)) {
      if (existingKinds.has(fallback.kind)) continue;
      collected.push(fallback);
      existingKinds.add(fallback.kind);
    }
  }

  const seen = new Set<string>();
  const deduped: SearchQuery[] = [];
  for (const query of collected) {
    const key = `${query.signalId}:${normalizeForMatch(query.text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(query);
  }

  // 把预算平摊给每个信号，每个信号内部按「经验 → 方法 → 认知」的顺序取。
  // 直接截断前 N 条会让第一个信号吃光预算（第二个信号一条都检索不到）；
  // 而单纯按信号轮流又会牺牲类型覆盖。平摊 + 种类顺序可以两者兼顾。
  const buckets = new Map<string, SearchQuery[]>();
  for (const query of deduped) {
    const bucket = buckets.get(query.signalId);
    if (bucket) bucket.push(query);
    else buckets.set(query.signalId, [query]);
  }
  const lists = [...buckets.values()];
  const perSignal = Math.max(
    1,
    Math.floor(MAX_QUERIES / Math.max(1, lists.length)),
  );

  const ordered: SearchQuery[] = [];
  const leftovers: SearchQuery[] = [];
  for (const list of lists) {
    ordered.push(...list.slice(0, perSignal));
    leftovers.push(...list.slice(perSignal));
  }
  // 还有剩余预算就补给尚未取完的信号。
  for (const query of leftovers) {
    if (ordered.length >= MAX_QUERIES) break;
    ordered.push(query);
  }

  const unique = ordered.slice(0, MAX_QUERIES);

  if (unique.length === 0) {
    degraded.push("没有生成可用的检索词。");
  }
  return { queries: unique, degraded };
}
