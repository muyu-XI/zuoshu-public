import type {
  DailyContext,
  ReflectionCard,
  ReflectionResult,
  ReflectionSource,
} from "@/types";
import { llmDegradeNote, llmJson } from "./llm";
import type { DailyMoment } from "./signals";
import { firstParagraphFrom, sourceTextFrom, truncate } from "./text";
import type { Candidate, Signal, ZhihuSearchItem } from "./types";

export type FavoriteMaterial = {
  item: ZhihuSearchItem;
  savedAt?: number;
};

type Material = {
  origin: "search" | "favorite";
  item: ZhihuSearchItem;
  signal: Signal;
  savedAt?: number;
};

type RawComposition = {
  resonanceIndex?: unknown;
  resonanceConnection?: unknown;
  favoriteIndex?: unknown;
  favoriteConnection?: unknown;
  actionIndex?: unknown;
  actionText?: unknown;
  actionFriction?: unknown;
};

function sourceFrom(material: Material): ReflectionSource {
  return {
    title: material.item.title,
    excerpt: firstParagraphFrom(material.item.contentText),
    fullText: sourceTextFrom(material.item.contentText),
    author: material.item.authorName || undefined,
    voteCount: material.item.voteUpCount || undefined,
    url: material.item.url,
    materialType: "search_excerpt",
    origin: material.origin,
    ...(material.savedAt ? { savedAt: material.savedAt } : {}),
  };
}

function readIndex(value: unknown, size: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  const index = value - 1;
  return index >= 0 && index < size ? index : null;
}

function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return truncate(value.trim(), max);
}

function materialBlock(materials: Material[]): string {
  return materials.map((material, index) => [
    `${index + 1}. 类型：${material.origin === "favorite" ? "用户以前的知乎收藏" : "知乎搜索结果"}`,
    `   对应信号：${material.signal.text}`,
    `   标题：${material.item.title}`,
    `   摘要：${truncate(material.item.contentText, 700)}`,
  ].join("\n")).join("\n");
}

function buildPrompt(context: DailyContext, materials: Material[]): string {
  const canAct = materials.some((material) => material.signal.wantsHelp);
  return [
    "请从给定材料中选择真正能回应这篇日记的内容。只输出 JSON。",
    "日记：",
    truncate(context.journal, 5000),
    "",
    "候选材料：",
    materialBlock(materials),
    "",
    "输出字段：resonanceIndex、resonanceConnection、favoriteIndex、favoriteConnection、actionIndex、actionText、actionFriction。索引从 1 开始，不适合则为 null。",
    "规则：",
    "- resonanceIndex 只能选择 search 类型，且材料必须包含与困惑、烦躁、迷茫或未解决问题相似的具体经历。",
    "- favoriteIndex 只能选择 favorite 类型，且不能只因出现相同关键词就匹配。",
    `- action 只有用户明确想找方法或下一步时才允许；当前${canAct ? "存在" : "不存在"}这种信号。材料摘要必须含具体方法，动作一次只做一件事。`,
    "- connection 只解释材料为何与今天有关，不补写用户情况。",
    "- 不为了填满卡片而选择弱相关内容。",
    '{"resonanceIndex":null,"resonanceConnection":null,"favoriteIndex":null,"favoriteConnection":null,"actionIndex":null,"actionText":null,"actionFriction":null}',
  ].join("\n");
}

export async function composeReflection(args: {
  context: DailyContext;
  signals: Signal[];
  moment: DailyMoment;
  candidates: Candidate[];
  favorites?: FavoriteMaterial[];
  signal: AbortSignal;
}): Promise<{ result: ReflectionResult; degraded: string[] }> {
  const degraded: string[] = [];
  const searchMaterials: Material[] = args.candidates.slice(0, 5).map((candidate) => ({
    origin: "search",
    item: candidate.item,
    signal: candidate.signal,
  }));
  const fallbackSignal: Signal = args.signals[0] ?? {
    id: "daily-moment",
    kind: "curiosity",
    text: args.moment.text,
    evidence: args.moment.evidence,
    weight: 0.5,
    searchWorthy: false,
    unresolved: false,
    wantsHelp: false,
    reason: "用于判断旧收藏是否与今天相关",
  };
  const favoriteMaterials: Material[] = (args.favorites ?? [])
    .slice(0, 5).map((favorite) => ({
        origin: "favorite",
        item: favorite.item,
        signal: fallbackSignal,
        savedAt: favorite.savedAt,
      }));
  const materials = [...favoriteMaterials, ...searchMaterials];
  const completed = args.context.tasks.filter((task) => task.completed);
  const stats = `今天完成了 ${completed.length} / ${args.context.tasks.length} 项任务，收获 ${args.context.tomatoes.length} 颗番茄。`;
  const base: Omit<ReflectionResult, "cards"> = {
    schemaVersion: 2,
    summary: stats,
    achievements: completed.map((task) => `完成${task.title}`),
  };

  if (materials.length === 0) {
    return {
      result: {
        ...base,
        cards: [{ type: "daily_highlight", ...args.moment }],
        externalStatus: { search: "not_needed", favorites: "signed_out" },
      },
      degraded,
    };
  }

  const raw = await llmJson<RawComposition>({
    system: "你是克制的日记回顾编辑，只能从候选材料中选择，不编造来源或方法。",
    user: buildPrompt(args.context, materials),
    signal: args.signal,
  });
  if (!raw) degraded.push(llmDegradeNote("经验匹配"));

  const cards: ReflectionCard[] = [];
  const favoriteIndex = readIndex(raw?.favoriteIndex, materials.length);
  const favoriteConnection = readText(raw?.favoriteConnection, 140);
  const favorite = favoriteIndex === null ? null : materials[favoriteIndex];
  if (favorite?.origin === "favorite" && favoriteConnection) {
    cards.push({
      type: "past_collection",
      signal: favorite.signal.text,
      connection: favoriteConnection,
      source: sourceFrom(favorite),
    });
  }

  const resonanceIndex = readIndex(raw?.resonanceIndex, materials.length);
  const resonanceConnection = readText(raw?.resonanceConnection, 140);
  const resonance = resonanceIndex === null ? null : materials[resonanceIndex];
  if (resonance?.origin === "search" && resonanceConnection &&
      !cards.some((card) => "source" in card && card.source.url === resonance.item.url)) {
    cards.push({
      type: "resonance",
      signal: resonance.signal.text,
      connection: resonanceConnection,
      source: sourceFrom(resonance),
    });
  }

  const actionIndex = readIndex(raw?.actionIndex, materials.length);
  const actionText = readText(raw?.actionText, 80);
  const actionFriction = readText(raw?.actionFriction, 60);
  const action = actionIndex === null ? null : materials[actionIndex];
  if (action && action.signal.wantsHelp && actionText && actionFriction) {
    cards.push({
      type: "tomorrow_action",
      friction: actionFriction,
      text: actionText,
      source: sourceFrom(action),
    });
  }

  if (cards.length === 0) {
    cards.push({ type: "daily_highlight", ...args.moment });
  }

  return {
    result: {
      ...base,
      cards,
      externalStatus: {
        search: searchMaterials.length === 0 ? "not_needed" :
          cards.some((card) => card.type === "resonance" || (card.type === "tomorrow_action" && card.source.origin === "search")) ? "ready" : "no_match",
        favorites: favoriteMaterials.length === 0 ? "signed_out" :
          cards.some((card) => card.type === "past_collection") ? "ready" : "no_match",
      },
    },
    degraded,
  };
}
