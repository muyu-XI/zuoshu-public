import type { DailyContext } from "@/types";
import { llmDegradeNote, llmJson } from "./llm";
import { selectPassages } from "./passages";
import { bigrams, clamp01, lexicalOverlap, truncate } from "./text";
import type { Candidate, ScoredCandidate, ScoreFactor } from "./types";

/**
 * 重排目标不是「点赞最高的排前面」，而是「最贴合用户今天实际情况的排前面」。
 * 因此相关性占大头，社区认可度只占两成，并且最后还要过一遍多样性筛选。
 */
export const SCORE_WEIGHTS: Record<ScoreFactor, number> = {
  relevance: 0.4,
  quality: 0.2,
  community: 0.2,
  authority: 0.1,
  diversity: 0.1,
};

/** 送去给模型打相关性分数的候选数量上限，控制 token 与延迟。 */
const LLM_SCORING_LIMIT = 12;

function weightedScore(factors: Record<ScoreFactor, number>): number {
  let total = 0;
  for (const key of Object.keys(SCORE_WEIGHTS) as ScoreFactor[]) {
    total += factors[key] * SCORE_WEIGHTS[key];
  }
  return Number(total.toFixed(4));
}

/** 社区认可度取对数，避免高赞内容一刀切碾压其他维度。 */
function communityFactor(candidate: Candidate): number {
  const votes = Math.log10(1 + Math.max(0, candidate.item.voteUpCount));
  const comments = Math.log10(1 + Math.max(0, candidate.item.commentCount));
  return clamp01((votes / 4) * 0.7 + (comments / 3) * 0.3);
}

/** 内容质量：摘要信息量、行文结构、内容类型。 */
function qualityFactor(candidate: Candidate): number {
  const text = candidate.item.contentText;
  // 目标长度放宽到 400 字：实测真实摘录多在 200–400 字，
  // 用 220 作分母会让绝大多数条目直接顶到 1.0，质量这一维就失去区分度。
  const lengthScore = clamp01(text.length / 400);
  const hasStructure = /[。；]/.test(text) ? 0.1 : 0;
  const type = candidate.item.contentType.toLowerCase();
  const typeBonus = type.includes("article") || type.includes("answer") ? 0.05 : 0;
  return clamp01(lengthScore * 0.85 + hasStructure + typeBonus);
}

/** 作者可信度：认证标识与平台权威等级。 */
function authorityFactor(candidate: Candidate): number {
  const badge = candidate.item.authorBadgeText.trim().length > 0 ? 0.55 : 0;
  const level = Number.parseInt(candidate.item.authorityLevel, 10);
  let levelScore = 0;
  if (Number.isFinite(level)) {
    if (level >= 3) levelScore = 0.45;
    else if (level === 2) levelScore = 0.3;
    else if (level === 1) levelScore = 0.15;
  }
  const named = candidate.item.authorName.trim().length > 0 ? 0.1 : 0;
  return clamp01(0.2 + badge + levelScore + named);
}

/** 单条检索词被内容覆盖的比例：检索词的元有多少出现在内容里。 */
function coverage(needle: string, haystack: string): number {
  const target = new Set(bigrams(needle));
  if (target.size === 0) return 0;
  const source = new Set(bigrams(haystack));
  let hit = 0;
  for (const gram of target) {
    if (source.has(gram)) hit += 1;
  }
  return hit / target.size;
}

/** 服务端把它排在该查询结果里的第几位。 */
function positionScore(candidate: Candidate): number {
  if (candidate.querySize <= 1) return 0.7;
  return clamp01(1 - candidate.queryRank / (candidate.querySize - 1));
}

/**
 * 模型不可用时的相关性近似。
 *
 * 这里刻意不只用字符 Jaccard：实测在「短日记 vs 长文章」上它必然趋近 0，
 * 等于把相关性这一维直接废掉，排序随即退化成质量与权威的比拼，
 * 最后选出一篇和用户当天处境无关的泛泛爆款。所以改用四个更有判别力的信号：
 *   1. 服务端自己的排序位次——语义相关性它已经算过一遍了（RankingScore）
 *   2. 检索词被内容覆盖的比例
 *   3. 信号本身被内容覆盖的比例
 *   4. 与今天语料的字符重合度（最弱，但确实是这位用户专属的）
 */
function heuristicRelevance(candidate: Candidate, corpus: string): number {
  const text = `${candidate.item.title} ${candidate.item.contentText}`;
  const position = positionScore(candidate);
  const queryCoverage = coverage(candidate.query.text, text);
  const signalCoverage = coverage(candidate.signal.text, text);
  const corpusOverlap = lexicalOverlap(text, corpus);
  // 被多条不同类型检索词同时召回的内容，多半确实切题。
  const recurrenceBonus = Math.min(0.1, 0.05 * (candidate.recurrence - 1));
  return clamp01(
    position * 0.35 +
      queryCoverage * 0.3 +
      signalCoverage * 0.2 +
      corpusOverlap * 0.15 +
      recurrenceBonus,
  );
}

function buildCorpus(context: DailyContext): string {
  return [
    context.journal,
    ...context.tasks.map((task) => task.title),
  ]
    .filter(Boolean)
    .join(" ");
}

function buildScoringPrompt(
  context: DailyContext,
  batch: Candidate[],
): string {
  return [
    "用户今天的情况：",
    `日记：${truncate(context.journal, 5000)}`,
    `任务：${
      context.tasks.map((t) => `${t.title}（${t.completed ? "已完成" : "未完成"}）`).join("；") ||
      "无"
    }`,
    "",
    "下面是知乎检索回来的候选内容。请判断每一条与「这位用户今天的实际情况」的相关程度：",
    ...batch.map(
      (candidate, index) =>
        `${index + 1}. [信号：${candidate.signal.text}｜检索词：${candidate.query.text}] ${candidate.item.title} —— ${selectPassages(candidate, "rerank")}`,
    ),
    "",
    "打分标准：",
    "- 不是判断内容本身好不好，而是判断它能不能回应这位用户今天遇到的具体情况。",
    "- 泛泛而谈、只蹭关键词、和信号没有实质关系的内容应该给低分。",
    "- relevance 是 0 到 1 的小数，可以有小数位。",
    "",
    "只输出 JSON：",
    '{"scores":[{"index":1,"relevance":0.82,"rationale":"..."}]}',
  ].join("\n");
}

type RawScore = { index?: unknown; relevance?: unknown; rationale?: unknown };

export async function rerank(
  candidates: Candidate[],
  context: DailyContext,
  signal: AbortSignal,
): Promise<{ ranked: ScoredCandidate[]; degraded: string[] }> {
  const degraded: string[] = [];
  if (candidates.length === 0) return { ranked: [], degraded };

  const corpus = buildCorpus(context);
  const base = candidates.map<ScoredCandidate>((candidate) => {
    const factors: Record<ScoreFactor, number> = {
      relevance: heuristicRelevance(candidate, corpus),
      quality: qualityFactor(candidate),
      community: communityFactor(candidate),
      authority: authorityFactor(candidate),
      diversity: 0,
    };
    return {
      ...candidate,
      factors,
      score: weightedScore(factors),
      rationale: "本地规则初评（相关性=服务端位次+检索词覆盖度）",
    };
  });

  base.sort((a, b) => b.score - a.score);
  const batch = base.slice(0, LLM_SCORING_LIMIT);

  const raw = await llmJson<{ scores?: RawScore[] }>({
    system:
      "你是内容相关性评审。你只依据用户提供的今日记录判断候选内容是否切题，只输出 JSON。",
    user: buildScoringPrompt(context, batch),
    signal,
  });

  const scores = Array.isArray(raw?.scores) ? raw.scores : null;
  if (scores && scores.length > 0) {
    for (const entry of scores) {
      const index = typeof entry.index === "number" ? entry.index : NaN;
      const target = batch[index - 1];
      if (!target) continue;
      if (typeof entry.relevance === "number") {
        target.factors.relevance = clamp01(entry.relevance);
      }
      target.rationale =
        typeof entry.rationale === "string" && entry.rationale.trim()
          ? truncate(entry.rationale.trim(), 160)
          : "模型相关性评分";
      target.score = weightedScore(target.factors);
    }
  } else {
    degraded.push(llmDegradeNote("相关性打分"));
  }

  base.sort((a, b) => b.score - a.score);
  return { ranked: base, degraded };
}

/** 同一作者 / 同一链接视为高度重复，其余用标题重合度衡量。 */
function similarity(a: ScoredCandidate, b: ScoredCandidate): number {
  if (a.item.contentId && a.item.contentId === b.item.contentId) return 1;
  if (a.item.url && a.item.url === b.item.url) return 1;
  if (a.item.authorName && a.item.authorName === b.item.authorName) return 0.8;
  return lexicalOverlap(a.item.title, b.item.title);
}

/**
 * 贪心 MMR 选择：每一步都在「分数高」和「与已选项不同」之间折中，
 * 避免最终三个来源全是同一个人的同一类回答。
 */
export function selectDiverse(
  ranked: ScoredCandidate[],
  count: number,
): ScoredCandidate[] {
  const pool = [...ranked];
  const selected: ScoredCandidate[] = [];

  while (selected.length < count && pool.length > 0) {
    let bestIndex = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    pool.forEach((candidate, index) => {
      const maxSimilarity = selected.reduce(
        (max, chosen) => Math.max(max, similarity(candidate, chosen)),
        0,
      );
      const diversity = clamp01(1 - maxSimilarity);
      const value =
        candidate.score * (1 - SCORE_WEIGHTS.diversity) +
        diversity * SCORE_WEIGHTS.diversity;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    });

    const [picked] = pool.splice(bestIndex, 1);
    if (!picked) break;
    const maxSimilarity = selected.reduce(
      (max, chosen) => Math.max(max, similarity(picked, chosen)),
      0,
    );
    const diversity = clamp01(1 - maxSimilarity);
    picked.factors.diversity = diversity;
    picked.score = weightedScore(picked.factors);
    selected.push(picked);
  }

  return selected;
}
