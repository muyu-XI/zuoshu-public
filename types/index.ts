export type Task = {
  id: string;
  title: string;
  date: string;
  estimatedTomatoes: number;
  actualTomatoes: number;
  tomatoSlots?: number[];
  completed: boolean;
  createdAt: number;
  sourceKey?: string;
};
export type TomatoSession = {
  id: string;
  date: string;
  durationType: "small" | "large";
  plannedMinutes: number;
  taskId: string;
  slot?: number;
  completedAt: number;
  demo: boolean;
};
export type DailyJournal = {
  date: string;
  content: string;
  pages?: string[];
  updatedAt: number;
  demo?: boolean;
};
export type DailyContext = {
  date: string;
  tasks: Task[];
  tomatoes: TomatoSession[];
  journal: string;
  excludedFavoriteUrls?: string[];
};
export type ReflectionSource = {
  title: string;
  excerpt: string;
  author?: string;
  voteCount?: number;
  url: string;
  materialType: "search_excerpt";
  origin: "search" | "favorite";
  savedAt?: number;
};
export type ReflectionCard =
  | {
      type: "past_collection";
      signal: string;
      connection: string;
      source: ReflectionSource;
    }
  | {
      type: "resonance";
      signal: string;
      connection: string;
      source: ReflectionSource;
    }
  | {
      type: "tomorrow_action";
      friction: string;
      text: string;
      source: ReflectionSource;
    }
  | {
      type: "daily_highlight";
      heading: "今日闪耀瞬间" | "今天留下的话";
      text: string;
      evidence: string;
    };
export type ReflectionExternalStatus = {
  search: "not_needed" | "ready" | "no_match" | "unavailable";
  favorites: "signed_out" | "ready" | "no_match" | "unavailable";
};
export type ReflectionResult = {
  schemaVersion?: 2;
  summary: string;
  achievements: string[];
  cards?: ReflectionCard[];
  externalStatus?: ReflectionExternalStatus;
  /** Legacy v1 fields are kept optional so saved IndexedDB records still render. */
  resonance?: {
    stickerTheme?: string;
    signal: string;
    title: string;
    excerpt: string;
    fullText?: string;
    author?: string;
    voteCount?: number;
    url: string;
  };
  improvement?: {
    friction: string;
    insight: string;
    sourceTitle: string;
    sourceUrl: string;
    tomorrowAction: string;
  };
  question?: { text: string; sourceTitle: string; sourceUrl: string };
};
export type ReflectionRecord = {
  source?: "zhihu" | "mock";
  context?: DailyContext;
  date: string;
  result: ReflectionResult;
  createdAt: number;
};
export type WeeklyReflectionResult = {
  schemaVersion: 1;
  periodStart: string;
  periodEnd: string;
  recordedDays: number;
  summary: string;
  moments: Array<{ date: string; text: string }>;
  patterns: Array<{ text: string; evidenceDates: string[] }>;
  carryForward: string;
};
export type WeeklyReflectionRecord = WeeklyReflectionResult & {
  id: string;
  generatedFromUpdatedAt: number;
  createdAt: number;
  demo?: boolean;
};
export type FocusState = {
  id: string;
  phase: "focus" | "ripe" | "break";
  endTimestamp: number;
  durationType: "small" | "large";
  plannedMinutes: number;
  remaining: number;
  total: number;
  demo: boolean;
};
