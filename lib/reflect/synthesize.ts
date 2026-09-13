import type { DailyContext, ReflectionResult } from "@/types";
import { llmDegradeNote, llmJson } from "./llm";
import { selectPassages } from "./passages";
import { excerptFrom, firstParagraphFrom, sourceTextFrom, truncate } from "./text";
import type { ScoredCandidate, Signal } from "./types";

/**
 * 合写阶段。
 *
 * 一条硬性约束：模型只负责写字，**不负责提供来源**。
 * resonance / improvement / question 里的 title、url、author、voteCount
 * 全部从知乎接口真实返回的条目里取，模型给的来源字段一律忽略。
 * 这样即使模型胡说，回顾里的出处依然可点、可核对。
 */

/** 信号文案自带「」，嵌进模板句之前先去掉，避免出现「「…」」。 */
function plain(text: string): string {
  return text.replace(/[「」]/g, "").trim();
}

function buildCandidatesBlock(selected: ScoredCandidate[]): string {
  return selected
    .map(
      (candidate, index) =>
        `${index + 1}. 标题：${candidate.item.title}\n   作者：${
          candidate.item.authorName || "未知"
        }｜赞同 ${candidate.item.voteUpCount}｜链接：${candidate.item.url}\n   来源选段：${selectPassages(candidate, "synthesis")}\n   对应信号：${candidate.signal.text}`,
    )
    .join("\n");
}

function buildPrompt(args: {
  context: DailyContext;
  signals: Signal[];
  selected: ScoredCandidate[];
}): string {
  const { context, signals, selected } = args;
  const completed = context.tasks.filter((task) => task.completed);
  return [
    "请为这位用户写一份简短的今日回顾。",
    "",
    "用户今天的情况：",
    `- 日期：${context.date}`,
    `- 任务：完成 ${completed.length} / ${context.tasks.length} 项`,
    `- 番茄：${context.tomatoes.length} 颗`,
    `- 日记：${truncate(context.journal, 5000)}`,
    "",
    "从这一天里挖出的信号：",
    ...signals.map((signal) => `- [${signal.kind}] ${signal.text}`),
    "",
    "从知乎检索并用相关性重排后留下的候选内容：",
    buildCandidatesBlock(selected),
    "",
    "请输出：",
    "- summaryTail：一句话总结这一天，不超过 40 字，要具体，不要空泛鼓励。",
    "- insight：一句能让用户重新看待当前阻碍的话，不超过 60 字。",
    "- tomorrowAction：明天可以立刻执行的一个最小动作，具体到动作本身，不超过 40 字。",
    "- questionText：留一个值得继续想的问题，不超过 30 字。",
    "- resonanceIndex：最能回应这位用户的一个候选编号。",
    "- improvementIndex：最适合作为「明天可以试试」依据的候选编号。",
    "- questionIndex：最适合支撑那个未解决问题的候选编号。",
    "",
    "严格约束：",
    "- 只能使用上面候选内容里真实存在的说法，不要编造任何事实、数据、作者或链接。",
    "- 不要写成鸡汤，不要用「加油」「相信自己」这类空话。",
    "",
    "只输出 JSON：",
    '{"summaryTail":"...","insight":"...","tomorrowAction":"...","questionText":"...","resonanceIndex":1,"improvementIndex":2,"questionIndex":3}',
  ].join("\n");
}

function pickIndex(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const index = Math.trunc(value) - 1;
  if (index < 0 || index >= max) return null;
  return index;
}

/** 从候选里挑出最贴合某个信号类别的一条。 */
function findByKind(
  selected: ScoredCandidate[],
  kinds: Signal["kind"][],
): ScoredCandidate | null {
  for (const kind of kinds) {
    const match = selected.find((candidate) => candidate.signal.kind === kind);
    if (match) return match;
  }
  return null;
}

export async function synthesize(args: {
  context: DailyContext;
  signals: Signal[];
  selected: ScoredCandidate[];
  signal: AbortSignal;
}): Promise<{ result: ReflectionResult; degraded: string[] }> {
  const { context, signals, selected } = args;
  const degraded: string[] = [];

  const completed = context.tasks.filter((task) => task.completed);
  const achievements = completed.map((task) => `完成${task.title}`);
  const statsLine = `今天完成了 ${completed.length} / ${context.tasks.length} 项任务，收获 ${context.tomatoes.length} 颗番茄。`;

  const raw = await llmJson<Record<string, unknown>>({
    system:
      "你是一位克制的复盘助手。你只使用给定材料，不编造事实，只输出 JSON。",
    user: buildPrompt(args),
    signal: args.signal,
  });

  if (!raw) {
    degraded.push(llmDegradeNote("回顾文案合成"));
  }

  const readText = (key: string, max: number): string | null => {
    const value = raw?.[key];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? truncate(trimmed, max) : null;
  };

  // ---- resonance：信号 + 真实来源 ----
  const resonanceIndex = pickIndex(raw?.resonanceIndex, selected.length);
  const resonanceCandidate =
    (resonanceIndex === null ? null : selected[resonanceIndex]) ??
    findByKind(selected, ["friction", "emotion", "curiosity"]) ??
    selected[0];

  // ---- improvement：阻碍信号 + 真实来源 ----
  const improvementIndex = pickIndex(raw?.improvementIndex, selected.length);
  const improvementCandidate =
    (improvementIndex === null ? null : selected[improvementIndex]) ??
    findByKind(selected, ["friction", "emotion"]) ??
    selected[0];

  // ---- question：未解决 / 好奇信号 ----
  const questionSignal =
    signals.find((item) => item.kind === "question") ??
    signals.find((item) => item.kind === "curiosity") ??
    null;
  const questionIndex = pickIndex(raw?.questionIndex, selected.length);
  const questionCandidate =
    (questionIndex === null ? null : selected[questionIndex]) ??
    findByKind(selected, ["question", "curiosity"]);

  const frictionSignal =
    signals.find((item) => item.kind === "friction") ?? signals[0];

  const summaryTail =
    readText("summaryTail", 80) ??
    (frictionSignal
      ? `今天的卡点集中在「${truncate(plain(frictionSignal.text), 24)}」。`
      : "今天的情况已经留存下来了。");

  const frictionLabel = truncate(plain(frictionSignal?.text ?? ""), 40);

  const improvement = (() => {
    if (!improvementCandidate || !frictionSignal) return null;
    return {
      friction: frictionLabel,
      insight:
        readText("insight", 120) ??
        // 降级路径下取短一句，避免和 resonance.excerpt 那段长摘录完全重复。
        excerptFrom(improvementCandidate.item.contentText, 70) ??
        "把动作拆到足够小，先让今天推进一点。",
      sourceTitle: improvementCandidate.item.title,
      sourceUrl: improvementCandidate.item.url,
      tomorrowAction:
        readText("tomorrowAction", 80) ??
        `针对「${truncate(plain(frictionSignal.text), 20)}」，明天只做一个最小动作：先开始 10 分钟。`,
    };
  })();

  // 契约要求 improvement 必填；没有可用来源时用信号本身兜底，来源留空由上层拦截。
  const safeImprovement =
    improvement ?? {
      friction: frictionLabel || "今天没有明显卡点",
      insight: readText("insight", 120) ?? "今天没有检索到可用的经验来源。",
      sourceTitle: "",
      sourceUrl: "",
      tomorrowAction:
        readText("tomorrowAction", 80) ?? "明天先从一个最小的动作开始。",
    };

  const question = (() => {
    const text =
      readText("questionText", 60) ??
      (questionSignal ? truncate(questionSignal.text, 60) : null);
    if (!text || !questionCandidate) return undefined;
    return {
      text,
      sourceTitle: questionCandidate.item.title,
      sourceUrl: questionCandidate.item.url,
    };
  })();

  const resonance = resonanceCandidate
    ? {
        signal: truncate(resonanceCandidate.signal.text, 60),
        title: resonanceCandidate.item.title,
        excerpt: firstParagraphFrom(resonanceCandidate.item.contentText),
        fullText: sourceTextFrom(resonanceCandidate.item.contentText),
        author: resonanceCandidate.item.authorName || undefined,
        voteCount: resonanceCandidate.item.voteUpCount,
        url: resonanceCandidate.item.url,
      }
    : null;

  if (!resonance) {
    degraded.push("没有可用于 resonance 的真实来源。");
  }

  const result: ReflectionResult = {
    summary: `${statsLine}${summaryTail}`,
    achievements,
    resonance:
      resonance ?? {
        signal: truncate(frictionSignal?.text ?? "", 60),
        title: "",
        excerpt: "",
        url: "",
      },
    improvement: safeImprovement,
    ...(question ? { question } : {}),
  };

  return { result, degraded };
}
