"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { db, saveFirstUseGuideHistory } from "@/lib/db";
import {
  FIRST_USE_GUIDE_DONE_KEY,
  FIRST_USE_GUIDE_STORAGE_KEY,
  FIRST_USE_JOURNAL_REVIEW_MS,
  FIRST_USE_REFLECTION_MS,
  LEGACY_FIRST_VISIT_GUIDE_KEY,
  advanceFirstUseGuide,
  createFirstUseGuideState,
  parseFirstUseGuideState,
  placeGuideNote,
  resumeFirstUseGuideState,
  type FirstUseGuideState,
  type FirstUseGuideStep,
} from "@/lib/first-use-guide";
import { FIRST_USE_FOCUS_MS } from "@/lib/focus-timing";

type GuideContextValue = {
  state: FirstUseGuideState | null;
  step: FirstUseGuideStep | null;
  advance: (expected: FirstUseGuideStep, next: FirstUseGuideStep) => void;
  startTimer: () => void;
  finishJournalTyping: () => void;
  startReflection: () => void;
  starReflection: () => void;
  addTomorrow: () => void;
  skip: () => void;
  finish: () => Promise<void>;
};

const GuideContext = createContext<GuideContextValue | null>(null);

export function useFirstUseGuide() {
  const value = useContext(GuideContext);
  if (!value) throw new Error("useFirstUseGuide must be used inside FirstUseGuideProvider");
  return value;
}

const guidePresentation: Record<FirstUseGuideStep, {
  target?: string;
  title: string;
  copy: string;
}> = {
  "complete-demo": { target: "guide-demo-task", title: "先划掉一件小事", copy: "按住这张示例卡，向右滑动。" },
  "restore-demo": { target: "guide-demo-task", title: "也可以随时恢复", copy: "长按刚刚划掉的卡片。" },
  "add-task": { target: "guide-add-task", title: "种下第一件小事", copy: "点击，把这件阅读计划加入今天。" },
  "open-focus": { target: "guide-open-focus", title: "现在，开始一次专注", copy: "点击“开始作数”。" },
  "start-timer": { target: "guide-start-timer", title: "先种一颗小番茄", copy: "教程里只需 3 秒，之后会恢复正常的 25 分钟。" },
  "focus-running": { target: "guide-focus-timer", title: "给自己三秒钟", copy: "这颗教程番茄很快就会成熟。" },
  "return-tree": { target: "guide-return-tree", title: "番茄成熟了", copy: "回到果树，把它交给刚才的待办。" },
  "drag-tomato": { target: "guide-tree-tomato", title: "把收获放到做过的事上", copy: "按住番茄，把它拖到阅读待办。" },
  "complete-task": { target: "guide-real-task", title: "这件事完成了", copy: "向右滑动待办，让它真正作数。" },
  "open-reflection": { target: "guide-open-reflection", title: "回头看看今天", copy: "点击“回顾”。" },
  "fill-journal": { target: "guide-journal", title: "留下一小段话", copy: "点击日记本，我们用一段示例带你体验。" },
  "journal-typing": { target: "guide-journal", title: "正在写下今天", copy: "真实使用时，这里会保存你自己的话。" },
  "journal-reading": { target: "guide-journal", title: "刚刚写完了", copy: "先看看最后几行，马上继续。" },
  "submit-reflection": { target: "guide-submit-reflection", title: "让今天作数", copy: "点击生成这一天的回顾。" },
  "reflection-loading": { title: "正在整理这一天", copy: "稍等一会儿，每日回声正在慢慢浮现。" },
  "review-reflection": { title: "慢慢看一遍", copy: "点击“别人也这样走过”卡片底部的箭头，可以直接展开原文；看完后再继续。" },
  "star-reflection": { target: "guide-star-reflection", title: "把这一天收好", copy: "点击星标，以后能更快找到这次回顾。" },
  "add-tomorrow": { target: "guide-add-tomorrow", title: "给明天留一个起点", copy: "把这个具体方法加到明日待办，今天结束后还能接着做。" },
  "open-history": { target: "guide-open-history", title: "这一天已经留下来了", copy: "点击“足迹”，看看走过的日子。" },
  "open-orchard": { target: "guide-open-orchard", title: "这里是你的足迹", copy: "以前完成的事会留在这里。点击“我的果园”，还能看到收获过的番茄。" },
  "finish": { title: "你的果园会慢慢长出来", copy: "教程记录会放到昨天；今天仍是一张空白纸，等你自己开始。" },
};

function GuideOverlay({ state, onSkip, onFinish, onContinue }: {
  state: FirstUseGuideState;
  onSkip: () => void;
  onFinish: () => Promise<void>;
  onContinue: () => void;
}) {
  const presentation = guidePresentation[state.step];
  const viewing = ["review-reflection", "open-orchard", "finish"].includes(state.step);
  const bottomNote = state.step === "review-reflection" || state.step === "finish";
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [noteSize, setNoteSize] = useState({ width: 288, height: 160 });
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [finishing, setFinishing] = useState(false);
  const noteRef = useRef<HTMLElement>(null);
  const noteSizeRef = useRef(noteSize);
  const scrolledStep = useRef("");

  useLayoutEffect(() => {
    const note = noteRef.current;
    if (!note) return;
    const update = () => {
      const next = { width: note.offsetWidth, height: note.offsetHeight };
      noteSizeRef.current = next;
      setNoteSize((current) => current.width === next.width && current.height === next.height
        ? current
        : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(note);
    return () => observer.disconnect();
  }, [state.step]);

  useEffect(() => {
    scrolledStep.current = "";
    const update = () => {
      const visual = window.visualViewport;
      const nextViewport = {
        left: visual?.offsetLeft ?? 0,
        top: visual?.offsetTop ?? 0,
        width: visual?.width ?? window.innerWidth,
        height: visual?.height ?? window.innerHeight,
      };
      setViewport((current) => current.left === nextViewport.left
        && current.top === nextViewport.top
        && current.width === nextViewport.width
        && current.height === nextViewport.height
        ? current
        : nextViewport);
      const element = presentation.target
        ? document.querySelector<HTMLElement>(`[data-guide-id="${presentation.target}"]`)
        : null;
      const next = element?.getBoundingClientRect() ?? null;
      const scrollKey = `${state.step}:${presentation.target ?? ""}`;
      if (element && next && scrolledStep.current !== scrollKey) {
        const safeTop = nextViewport.top + 76;
        const safeBottom = nextViewport.top + nextViewport.height - 100;
        const gap = 20;
        const aboveRoom = next.top - gap - safeTop;
        const belowRoom = safeBottom - next.bottom - gap;
        let desiredTop: number | null = null;
        if (next.top < safeTop || next.bottom > safeBottom) {
          desiredTop = next.top < safeTop
            ? safeTop
            : Math.min(
              safeBottom - next.height,
              safeTop + noteSizeRef.current.height + gap,
            );
        } else if (Math.max(aboveRoom, belowRoom) < noteSizeRef.current.height) {
          desiredTop = safeTop + noteSizeRef.current.height + gap;
        }
        if (desiredTop !== null) {
          window.scrollBy({
            top: next.top - desiredTop,
            behavior: "smooth",
          });
        }
        scrolledStep.current = scrollKey;
      }
      setRect((current) => {
        if (!next) return null;
        if (!current) return next;
        return current.left === next.left && current.top === next.top
          && current.width === next.width && current.height === next.height
          ? current
          : next;
      });
    };
    update();
    let frame = 0;
    const followDraggedTomato = () => {
      update();
      frame = window.requestAnimationFrame(followDraggedTomato);
    };
    const timer = state.step === "drag-tomato"
      ? 0
      : window.setInterval(update, 250);
    if (state.step === "drag-tomato") frame = window.requestAnimationFrame(followDraggedTomato);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.clearInterval(timer);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [presentation.target, state.step]);

  const notePosition = rect && viewport.width
    ? placeGuideNote(rect, noteSize, viewport)
    : null;
  return (
    <div className={`first-use-guide${viewing ? " is-viewing" : ""}${state.step === "drag-tomato" ? " is-dragging" : ""}`} aria-live="polite">
      <div className={`guide-dim${rect ? " has-spotlight" : ""}`} aria-hidden="true" />
      {rect && (
        <div
          className="guide-spotlight"
          aria-hidden="true"
          style={{ left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      )}
      <button className="guide-skip" type="button" onClick={onSkip} aria-label="退出引导">
        <X size={16} /> 退出引导
      </button>
      <section
        ref={noteRef}
        className={`guide-note${notePosition?.above ? " is-above" : ""}${!rect && !bottomNote ? " is-centered" : ""}${bottomNote ? " is-review" : ""}`}
        style={notePosition ? {
          left: notePosition.left,
          top: notePosition.top,
        } : undefined}
      >
        <span className="guide-step">首次练习</span>
        <h2>{presentation.title}</h2>
        <p>{presentation.copy}</p>
        {state.step === "review-reflection" && (
          <button type="button" className="primary" onClick={onContinue}>
            我看完了，继续
          </button>
        )}
        {state.step === "finish" && (
          <button
            type="button"
            className="primary"
            disabled={finishing}
            onClick={async () => {
              setFinishing(true);
              await onFinish();
            }}
          >
            {finishing ? "正在收好昨天……" : "开始我的今天"}
          </button>
        )}
      </section>
    </div>
  );
}

export default function FirstUseGuideProvider({ today, children }: {
  today: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<FirstUseGuideState | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!today || initialized) return;
    let cancelled = false;
    void (async () => {
      const done = window.localStorage.getItem(FIRST_USE_GUIDE_DONE_KEY);
      const legacyDone = window.localStorage.getItem(LEGACY_FIRST_VISIT_GUIDE_KEY);
      if (done || legacyDone) {
        if (!done) window.localStorage.setItem(FIRST_USE_GUIDE_DONE_KEY, "legacy");
        if (!cancelled) setInitialized(true);
        return;
      }
      const stored = parseFirstUseGuideState(
        window.localStorage.getItem(FIRST_USE_GUIDE_STORAGE_KEY),
      );
      if (stored) {
        if (!cancelled) {
          setState(resumeFirstUseGuideState(stored));
          setInitialized(true);
        }
        return;
      }
      const [tasks, tomatoes, journals] = await Promise.all([
        db.tasks.toArray(),
        db.tomatoes.toArray(),
        db.journals.toArray(),
      ]);
      const hasRealRecords = tasks.some((item) => !item.id.startsWith("demo-history:"))
        || tomatoes.some((item) => !item.demo)
        || journals.some((item) => !item.demo);
      if (hasRealRecords) {
        window.localStorage.setItem(FIRST_USE_GUIDE_DONE_KEY, "existing-user");
      } else {
        const initial = createFirstUseGuideState(today);
        window.localStorage.setItem(FIRST_USE_GUIDE_STORAGE_KEY, JSON.stringify(initial));
        if (!cancelled) setState(initial);
      }
      if (!cancelled) setInitialized(true);
    })();
    return () => { cancelled = true; };
  }, [initialized, today]);

  useEffect(() => {
    if (!state) return;
    window.localStorage.setItem(FIRST_USE_GUIDE_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const expectedRoute = ["start-timer", "focus-running", "return-tree"].includes(state.step)
      ? "/focus"
      : ["fill-journal", "journal-typing", "journal-reading", "submit-reflection", "reflection-loading", "review-reflection", "star-reflection", "add-tomorrow", "open-history"].includes(state.step)
        ? "/reflection"
        : state.step === "open-orchard"
          ? "/history"
          : state.step === "finish"
            ? "/orchard"
            : "/";
    if (pathname !== expectedRoute) router.replace(expectedRoute);
  }, [pathname, router, state]);

  useEffect(() => {
    if (state?.step !== "focus-running" || !state.focusEndsAt) return;
    const remaining = Math.max(0, state.focusEndsAt - Date.now());
    const timer = window.setTimeout(() => {
      setState((current) => current
        ? advanceFirstUseGuide(current, "focus-running", "return-tree")
        : current);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (state?.step !== "journal-reading" || !state.journalEndsAt) return;
    const remaining = Math.max(0, state.journalEndsAt - Date.now());
    const timer = window.setTimeout(() => {
      setState((current) => current
        ? advanceFirstUseGuide(current, "journal-reading", "submit-reflection", {
          journalEndsAt: undefined,
        })
        : current);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (state?.step !== "reflection-loading" || !state.reflectionEndsAt) return;
    const remaining = Math.max(0, state.reflectionEndsAt - Date.now());
    const timer = window.setTimeout(() => {
      setState((current) => current
        ? advanceFirstUseGuide(current, "reflection-loading", "review-reflection", {
          reflectionEndsAt: undefined,
        })
        : current);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const handleClick = (event: MouseEvent) => {
      const id = (event.target as Element | null)?.closest<HTMLElement>("[data-guide-id]")
        ?.dataset.guideId;
      if (id === "guide-open-reflection") {
        setState((current) => current
          ? advanceFirstUseGuide(current, "open-reflection", "fill-journal")
          : current);
      } else if (id === "guide-open-history") {
        setState((current) => current
          ? advanceFirstUseGuide(current, "open-history", "open-orchard")
          : current);
      } else if (id === "guide-open-orchard") {
        setState((current) => current
          ? advanceFirstUseGuide(current, "open-orchard", "finish")
          : current);
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [state]);

  const advance = useCallback((expected: FirstUseGuideStep, next: FirstUseGuideStep) => {
    setState((current) => current ? advanceFirstUseGuide(current, expected, next) : current);
  }, []);

  const skip = useCallback(() => {
    window.localStorage.removeItem(FIRST_USE_GUIDE_STORAGE_KEY);
    window.localStorage.setItem(FIRST_USE_GUIDE_DONE_KEY, "skipped");
    setState(null);
    router.replace("/");
  }, [router]);

  const finish = useCallback(async () => {
    if (!state) return;
    await saveFirstUseGuideHistory(state.firstOpenedDate);
    window.localStorage.removeItem(FIRST_USE_GUIDE_STORAGE_KEY);
    window.localStorage.setItem(FIRST_USE_GUIDE_DONE_KEY, "complete");
    setState(null);
    router.replace("/");
  }, [router, state]);

  const value = useMemo<GuideContextValue>(() => ({
    state,
    step: state?.step ?? null,
    advance,
    startTimer: () => setState((current) => current
      ? advanceFirstUseGuide(current, "start-timer", "focus-running", {
        focusEndsAt: Date.now() + FIRST_USE_FOCUS_MS,
      })
      : current),
    finishJournalTyping: () => setState((current) => current
      ? advanceFirstUseGuide(current, "journal-typing", "journal-reading", {
        journalEndsAt: Date.now() + FIRST_USE_JOURNAL_REVIEW_MS,
      })
      : current),
    startReflection: () => setState((current) => current
      ? advanceFirstUseGuide(current, "submit-reflection", "reflection-loading", {
        reflectionEndsAt: Date.now() + FIRST_USE_REFLECTION_MS,
      })
      : current),
    starReflection: () => setState((current) => current
      ? advanceFirstUseGuide(current, "star-reflection", "add-tomorrow", { starred: true })
      : current),
    addTomorrow: () => setState((current) => current
      ? advanceFirstUseGuide(current, "add-tomorrow", "open-history", { tomorrowAdded: true })
      : current),
    skip,
    finish,
  }), [advance, finish, skip, state]);

  return (
    <GuideContext value={value}>
      <div className={state ? "first-use-guide-running" : undefined} data-guide-step={state?.step}>
        {children}
      </div>
      {initialized && state && state.step !== "reflection-loading" && (
        <GuideOverlay
          state={state}
          onSkip={skip}
          onFinish={finish}
          onContinue={() => advance("review-reflection", "star-reflection")}
        />
      )}
    </GuideContext>
  );
}
