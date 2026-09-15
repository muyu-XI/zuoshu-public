import { offsetDay } from "./date";
import { FIRST_USE_FOCUS_MS } from "./focus-timing";
import type {
  DailyContext,
  DailyJournal,
  ReflectionRecord,
  ReflectionResult,
  Task,
  TomatoSession,
} from "@/types";

export const FIRST_USE_GUIDE_STORAGE_KEY = "zuoshu:first-use-guide-v2";
export const FIRST_USE_GUIDE_DONE_KEY = "zuoshu:first-use-guide-v2:done";
export const LEGACY_FIRST_VISIT_GUIDE_KEY = "zuoshu:first-visit-task-guide-v1";
export const FIRST_USE_JOURNAL_REVIEW_MS = 2000;

export function placeGuideNote(
  target: { left: number; top: number; right: number; bottom: number; width: number },
  note: { width: number; height: number },
  viewport: { left: number; top: number; width: number; height: number },
): { left: number; top: number; above: boolean } {
  const gap = 20;
  const safeTop = viewport.top + 68;
  const safeBottom = viewport.top + viewport.height - 76;
  const aboveRoom = target.top - gap - safeTop;
  const belowRoom = safeBottom - target.bottom - gap;
  const above = aboveRoom >= note.height || aboveRoom > belowRoom;
  const preferredTop = above
    ? target.top - gap - note.height
    : target.bottom + gap;
  const maxTop = Math.max(safeTop, safeBottom - note.height);
  const top = Math.max(safeTop, Math.min(maxTop, preferredTop));
  const centeredLeft = target.left + target.width / 2 - note.width / 2;
  const minLeft = viewport.left + 16;
  const maxLeft = Math.max(minLeft, viewport.left + viewport.width - note.width - 16);
  return {
    left: Math.max(minLeft, Math.min(maxLeft, centeredLeft)),
    top,
    above,
  };
}

export const FIRST_USE_TASK_TITLE = "读一章书，记下一个问题";
export const FIRST_USE_TASK_ID = "first-use-guide:task";
export const FIRST_USE_TOMATO_ID = "first-use-guide:tomato";
export const FIRST_USE_TOMORROW_ACTION =
  "开始读书前，先把手机放到够不到的地方静音，先读 25 分钟";
export const FIRST_USE_REFLECTION_MS = 3600;
export const FIRST_USE_JOURNAL =
  "早上七点半起床。洗漱时顺手拿起手机，看了十来分钟消息。\n\n上午把桌上的书和纸收了收，留出一块能摊书的地方。原想接着读书，坐下后又看了一会儿手机。\n\n午饭后有点困，睡了二十分钟。醒来泡了杯茶，把手机调成静音，读了二十多页。\n\n下午读到作者讲研究方法的地方，有一段没看明白。我在纸上记了一句，作者为什么选这个方法，不用更直接的做法。\n\n晚上又读了一会儿，把这一章收了尾。读得不快，记下的问题还算具体，明天可以接着找答案。\n\n临睡前想到明天还要继续读。我有点担心自己又会在开始前被手机带走，还不知道怎样更容易开始。";

export const FIRST_USE_REFLECTION: ReflectionResult = {
  schemaVersion: 2,
  summary: "今天完成了 1 / 1 项任务，收获 1 颗番茄。",
  achievements: ["完成读一章书，记下一个问题"],
  cards: [
    {
      type: "resonance",
      signal: "开始读书前反复想先看手机，难启动",
      connection: "有人也写到，短视频会让人失去沉下心做一件事的能力；真正需要阅读时，把手机放到另一个房间，用物理距离减少意志力消耗。",
      source: {
        title: "短视频看多了，怎么静下心来阅读和思考？ - 知乎",
        excerpt: "短视频看多了真的会让大脑的专注力丧失，很难去沉下心来深度阅读和输出自己的观点。",
        fullText: "短视频看多了真的会让大脑的专注力丧失，很难去沉下心来深度阅读和输出自己的观点。\n这不是“他刷我也刷”的小毛病，是把我们宝贵的注意力和“魔鬼”做了交换——\n我们失去了沉下心来做一件事的能力，算法背后的资本则用我们的注意力挣得盆满钵满。\n我有几个方法可以帮你找回注意力的主动权，静下心来阅读、思考、输出——\n\n1、把手机界面调成黑白。\n跟李笑来学的，当视频从彩色变成黑白色，会减少刷短视频的欲望。\n\n2、手机不要放在身边。\n真的要沉浸式阅读或者学习时，把手机放在别的房间。\n睡前不要带手机进卧室。\n这条没什么技巧，就是物理隔离。距离越远，意志力消耗越少。",
        author: "桔大",
        voteCount: 62,
        url: "https://www.zhihu.com/question/2022386857049073398/answer/2027415959007240806",
        materialType: "search_excerpt",
        origin: "search",
      },
    },
    {
      type: "tomorrow_action",
      friction: "开始读书前容易被手机带走",
      text: FIRST_USE_TOMORROW_ACTION,
      source: {
        title: "阅读速度越来越慢、注意力难以集中，有什么改善的阅读习惯？ - 知乎",
        excerpt: "找安静的时段阅读，减少干扰。",
        voteCount: 2,
        url: "https://www.zhihu.com/question/2071981692127130155/answer/2072121185328952439",
        materialType: "search_excerpt",
        origin: "search",
      },
    },
  ],
  externalStatus: { search: "ready", favorites: "signed_out" },
};

export const firstUseGuideSteps = [
  "complete-demo",
  "restore-demo",
  "add-task",
  "open-focus",
  "start-timer",
  "focus-running",
  "return-tree",
  "drag-tomato",
  "complete-task",
  "open-reflection",
  "fill-journal",
  "journal-typing",
  "journal-reading",
  "submit-reflection",
  "reflection-loading",
  "review-reflection",
  "star-reflection",
  "add-tomorrow",
  "open-history",
  "open-orchard",
  "finish",
] as const;

export type FirstUseGuideStep = (typeof firstUseGuideSteps)[number];

export type FirstUseGuideState = {
  version: 2;
  firstOpenedDate: string;
  step: FirstUseGuideStep;
  focusEndsAt?: number;
  journalEndsAt?: number;
  reflectionEndsAt?: number;
  starred?: boolean;
  tomorrowAdded?: boolean;
};

export function createFirstUseGuideState(firstOpenedDate: string): FirstUseGuideState {
  return { version: 2, firstOpenedDate, step: "complete-demo" };
}

export function parseFirstUseGuideState(value: string | null): FirstUseGuideState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<FirstUseGuideState>;
    if (
      parsed.version !== 2 ||
      typeof parsed.firstOpenedDate !== "string" ||
      !firstUseGuideSteps.includes(parsed.step as FirstUseGuideStep)
    ) return null;
    return parsed as FirstUseGuideState;
  } catch {
    return null;
  }
}

export function resumeFirstUseGuideState(
  state: FirstUseGuideState,
  now = Date.now(),
): FirstUseGuideState {
  if (state.step === "focus-running") {
    const latestAllowedEnd = now + FIRST_USE_FOCUS_MS;
    const focusEndsAt = typeof state.focusEndsAt === "number"
      ? Math.min(state.focusEndsAt, latestAllowedEnd)
      : latestAllowedEnd;
    return { ...state, focusEndsAt };
  }
  if (state.step === "journal-reading") {
    const latestAllowedEnd = now + FIRST_USE_JOURNAL_REVIEW_MS;
    const journalEndsAt = typeof state.journalEndsAt === "number"
      ? Math.min(state.journalEndsAt, latestAllowedEnd)
      : latestAllowedEnd;
    return { ...state, journalEndsAt };
  }
  return state;
}

export function advanceFirstUseGuide(
  state: FirstUseGuideState,
  expected: FirstUseGuideStep,
  next: FirstUseGuideStep,
  changes: Partial<FirstUseGuideState> = {},
): FirstUseGuideState {
  if (state.step !== expected) return state;
  return { ...state, ...changes, step: next };
}

export function buildFirstUseGuideRecords(firstOpenedDate: string): {
  task: Task;
  tomato: TomatoSession;
  journal: DailyJournal;
  reflection: ReflectionRecord;
  context: DailyContext;
  tomorrowTask: Task;
} {
  const date = offsetDay(firstOpenedDate, -1);
  const createdAt = new Date(`${date}T20:00:00`).getTime();
  const task: Task = {
    id: `first-use:${date}:task`,
    title: FIRST_USE_TASK_TITLE,
    date,
    estimatedTomatoes: 1,
    actualTomatoes: 1,
    tomatoSlots: [0],
    completed: true,
    createdAt,
  };
  const tomato: TomatoSession = {
    id: `first-use:${date}:tomato`,
    date,
    durationType: "small",
    plannedMinutes: 25,
    taskId: task.id,
    slot: 0,
    completedAt: createdAt + 25 * 60_000,
    demo: true,
  };
  const journal: DailyJournal = {
    date,
    content: FIRST_USE_JOURNAL,
    pages: [FIRST_USE_JOURNAL],
    updatedAt: createdAt + 30 * 60_000,
    demo: true,
  };
  const context: DailyContext = {
    date,
    tasks: [task],
    tomatoes: [tomato],
    journal: FIRST_USE_JOURNAL,
  };
  const reflection: ReflectionRecord = {
    date,
    result: FIRST_USE_REFLECTION,
    context,
    createdAt: journal.updatedAt + 1,
    source: "mock",
  };
  const tomorrowTask: Task = {
    id: `first-use:${firstOpenedDate}:tomorrow-task`,
    title: FIRST_USE_TOMORROW_ACTION,
    date: firstOpenedDate,
    estimatedTomatoes: 1,
    actualTomatoes: 0,
    completed: false,
    createdAt: new Date(`${firstOpenedDate}T08:00:00`).getTime(),
    sourceKey: `reflection:${date}`,
  };
  return { task, tomato, journal, reflection, context, tomorrowTask };
}
