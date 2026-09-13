import type { DailyContext, ReflectionResult } from "@/types";

/** 信号的四个类别：阻碍 / 情绪 / 兴趣 / 未解决问题。 */
export type SignalKind = "friction" | "emotion" | "curiosity" | "question";

/** 检索 Query 的三种类型：经验型 / 方法型 / 认知型。 */
export type QueryKind = "experience" | "method" | "cognition";

export type Signal = {
  id: string;
  kind: SignalKind;
  /** 一句话描述这个信号，用于展示和后续 Prompt。 */
  text: string;
  /** 来自今天上下文的证据，避免信号变成凭空想象。 */
  evidence: string;
  /** 0..1 的重要程度。 */
  weight: number;
  /** 是否值得去知乎检索。 */
  searchWorthy: boolean;
  /** 这件事在日记结尾仍未解决。 */
  unresolved?: boolean;
  /** 用户表达了想获得方法或下一步的意愿。 */
  wantsHelp?: boolean;
  /** 保留或过滤这个信号的理由。 */
  reason: string;
};

export type SearchQuery = {
  text: string;
  kind: QueryKind;
  signalId: string;
};

/** 知乎搜索 API 返回的条目，字段名保持服务端原始大小写。 */
export type ZhihuSearchItem = {
  title: string;
  contentType: string;
  contentId: string;
  contentText: string;
  url: string;
  commentCount: number;
  voteUpCount: number;
  authorName: string;
  authorBadgeText: string;
  authorityLevel: string;
  editTime: number;
  rankingScore: number;
};

export type Candidate = {
  item: ZhihuSearchItem;
  signal: Signal;
  query: SearchQuery;
  /** 被多少条不同类型的检索词召回（>=1）。多次召回是切题的旁证。 */
  recurrence: number;
  /** 该条目在所属检索结果里的位次（0 开始）。服务端自己的相关性排序。 */
  queryRank: number;
  /** 所属检索结果的总条数。 */
  querySize: number;
};

export type ScoreFactor =
  | "relevance"
  | "quality"
  | "community"
  | "authority"
  | "diversity";

export type ScoredCandidate = Candidate & {
  score: number;
  factors: Record<ScoreFactor, number>;
  /** 为什么排在这里，便于调试与人工复核。 */
  rationale: string;
};

export type PipelineTrace = {
  /** 每个阶段的名称，按执行顺序。 */
  stages: string[];
  signals: Signal[];
  queries: SearchQuery[];
  candidateCount: number;
  ranked: Array<{
    title: string;
    author: string;
    voteUpCount: number;
    score: number;
    factors: Record<ScoreFactor, number>;
    rationale: string;
    url: string;
  }>;
  /** 降级说明，例如未配置模型或未配置 Access Secret。 */
  degraded: string[];
  /** 选中的来源，便于核对溯源。 */
  usedSources: Array<{ field: string; title: string; url: string }>;
};

export type PipelineOutcome = {
  result: ReflectionResult;
  trace: PipelineTrace;
};

export type ReflectErrorCode =
  | "INVALID_REQUEST"
  | "MISSING_CONFIG"
  | "UPSTREAM_AUTH"
  | "UPSTREAM_RATE_LIMIT"
  | "UPSTREAM_ERROR"
  | "TIMEOUT";

const STATUS_BY_CODE: Record<ReflectErrorCode, number> = {
  INVALID_REQUEST: 400,
  MISSING_CONFIG: 503,
  UPSTREAM_AUTH: 502,
  UPSTREAM_RATE_LIMIT: 429,
  UPSTREAM_ERROR: 502,
  TIMEOUT: 504,
};

export class ReflectError extends Error {
  readonly code: ReflectErrorCode;
  readonly status: number;

  constructor(code: ReflectErrorCode, message: string) {
    super(message);
    this.name = "ReflectError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

export const SIGNAL_KINDS: readonly SignalKind[] = [
  "friction",
  "emotion",
  "curiosity",
  "question",
];

export const QUERY_KINDS: readonly QueryKind[] = [
  "experience",
  "method",
  "cognition",
];

export function isSignalKind(value: unknown): value is SignalKind {
  return (
    typeof value === "string" && SIGNAL_KINDS.includes(value as SignalKind)
  );
}

export function isQueryKind(value: unknown): value is QueryKind {
  return typeof value === "string" && QUERY_KINDS.includes(value as QueryKind);
}

/** 把一次回顾的原始入参归一化成 DailyContext。 */
export type ReflectRequest = DailyContext;
