"use client";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowUp, ArrowUpToLine, RotateCcw, Star, Trash2, X } from "lucide-react";
import { clearAllLocalRecords, db, restoreDemoHistory } from "@/lib/db";
import { useToday } from "@/components/layout/AppShell";
import TaskList from "@/components/tasks/TaskList";
import ReflectionCards from "@/components/reflection/ReflectionCards";
import { TreeFruit } from "@/components/mascot/TomatoTree";
import HistoryTimeline from "@/components/history/HistoryTimeline";
import { reflectionTheme } from "@/lib/reflection-theme";
import WeeklyEcho from "@/components/reflection/WeeklyEcho";
export default function History() {
  const today = useToday();
  const [selected, setSelected] = useState<string | null>(null);
  const [raisedDate, setRaisedDate] = useState<string | null>(null);
  const [showTopButton, setShowTopButton] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const [restoringDemo, setRestoringDemo] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const data = useLiveQuery(
    async () => ({
      tasks: await db.tasks.toArray(),
      tomatoes: await db.tomatoes.toArray(),
      journals: await db.journals.toArray(),
      records: await db.reflections.toArray(),
      weeklyRecords: await db.weeklyReflections.toArray(),
      stars: await db.settings.where("key").startsWith("reflection-star:").toArray(),
    }),
    [],
  );
  useEffect(() => {
    const update = () => setShowTopButton(window.scrollY > window.innerHeight);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    if (!showClearConfirm) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !clearing) setShowClearConfirm(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [showClearConfirm, clearing]);
  async function clearHistory() {
    if (clearing) return;
    setClearing(true);
    setClearError("");
    try {
      await clearAllLocalRecords();
      window.location.reload();
    } catch {
      setClearError("历史记录清除失败，请重试。");
    } finally {
      setClearing(false);
    }
  }
  async function restoreDemo() {
    if (restoringDemo) return;
    setRestoringDemo(true);
    setRestoreError("");
    try {
      await restoreDemoHistory();
    } catch {
      setRestoreError("演示足迹恢复失败，请重试。");
    } finally {
      setRestoringDemo(false);
    }
  }
  if (!data) return <main className="empty">正在拾起留下的日子……</main>;
  const starredDates = data.stars.filter((entry) => entry.value === "true")
    .map((entry) => entry.key.slice("reflection-star:".length));
  const dates = [
    ...new Set([
      ...data.tasks.map((t) => t.date),
      ...data.tomatoes.map((t) => t.date),
      ...data.journals.map((t) => t.date),
      ...data.records.map((t) => t.date),
    ]),
  ]
    .filter((d) => d <= today)
    .sort()
    .reverse();
  const stickerSeed = (date: string) => {
    let hash = 0;
    for (const character of date) hash = (hash * 31 + character.charCodeAt(0)) | 0;
    return Math.abs(hash);
  };
  if (selected) {
    const tasks = data.tasks.filter((t) => t.date === selected);
    const tomatoes = data.tomatoes.filter((t) => t.date === selected);
    const journal = data.journals.find((j) => j.date === selected);
    const record = data.records.find((r) => r.date === selected);
    const weeklyRecord = data.weeklyRecords.find((item) => item.periodEnd === selected);
    return (
      <main className="journal-page history-page">
        <button
          className="back history-back"
          onClick={() => setSelected(null)}
          aria-label="返回所有日子"
          title="返回所有日子"
        >
          <ArrowLeft size={22} strokeWidth={2.5} />
        </button>
        <h1 className="page-heading">{selected.replaceAll("-", ".")}</h1>
        <p className="intro">
          🍅 × {tomatoes.length} · 专注{" "}
          {tomatoes.reduce((s, t) => s + t.plannedMinutes, 0)} 分钟
          {tomatoes.some((t) => t.demo) ? "（含模拟时长）" : ""}
        </p>
        <section className="result-card">
          <h2>这一天的小事</h2>
          <TaskList tasks={tasks} date={selected} readOnly />
        </section>
        <section className="result-card">
          <h2>那天，写下的话</h2>
          <div className="journal-content">
            {journal?.content || "这一天还没有留下日记。"}
          </div>
        </section>
        {record ? (
          <ReflectionCards
            context={
              record.context ?? {
                date: selected,
                tasks,
                tomatoes,
                journal: journal?.content ?? "",
              }
            }
            result={record.result}
            source={record.source}
          />
        ) : (
          <p className="empty">这一天还没有回顾。</p>
        )}
        {weeklyRecord && <WeeklyEcho record={weeklyRecord} />}
      </main>
    );
  }
  return (
    <main className="journal-page history-page">
      <div className="history-eyebrow-row">
        <div className="eyebrow">LITTLE THINGS, REAL DAYS</div>
        <button
          type="button"
          className="history-clear-button"
          disabled={clearing}
          onClick={() => {
            setClearError("");
            setShowClearConfirm(true);
          }}
        >
          <Trash2 size={15} aria-hidden="true" />
          {clearing ? "正在清空…" : "清空历史"}
        </button>
      </div>
      <div className="history-title-row">
        <h1 className="page-heading">我的足迹</h1>
        <Link href="/orchard" className="history-orchard-card" aria-label="进入我的果园" title="进入我的果园">
          <span className="history-tomato-stack" aria-hidden="true">
            <i><TreeFruit /></i>
            <i><TreeFruit /></i>
            <i><TreeFruit /></i>
          </span>
          <span className="history-orchard-label" aria-label="我的果园">
            <i>我</i><i>的</i><i>果</i><i>园</i>
          </span>
          <ArrowUp className="history-orchard-arrow" size={18} strokeWidth={2.5} aria-hidden="true" />
        </Link>
      </div>
      <p className="intro">
        那些认真生活的痕迹，
        <br />
        会慢慢长成自己的样子。
      </p>
      <section
        className="history-sticker-wall"
        aria-label="每日回顾"
        style={{ minHeight: dates.length ? `${Math.max(880, dates.length * 210 + 160)}px` : 0 }}
      >
      {dates.map((date, index) => {
        const tasks = data.tasks.filter((t) => t.date === date);
        const record = data.records.find((record) => record.date === date);
        const theme = reflectionTheme(
          record?.result,
          record?.context?.tasks[0]?.title,
          record?.source,
        );
        const seed = stickerSeed(date);
        const rotation = (seed % 11) - 5;
        const stemRotation = ((seed * 47 + 13) % 55) - 27;
        const column = index % 2;
        const row = index;
        return (
          <button
            className={`history-sticker history-sticker-${index % 5} w-full text-left ${theme ? "has-theme" : ""} ${raisedDate === date ? "is-raised" : ""}`}
            key={date}
            data-date={date}
            style={{ "--sticker-rotation": `${rotation}deg`, "--stem-rotation": `${stemRotation}deg`, "--sticker-column": column, "--sticker-row": row, top: `${row * 210}px`, ...(column ? { left: "auto", right: 0 } : { left: 0, right: "auto" }), zIndex: raisedDate === date ? 30 : dates.length - index } as unknown as CSSProperties}
            onClick={() => {
              if (raisedDate === date) setSelected(date);
              else setRaisedDate(date);
            }}
          >
            <h2>
              {starredDates.includes(date) && <Star className="history-favorite-star" size={20}
                fill="currentColor" role="img" aria-label="已星标收藏" />}
              {date.replaceAll("-", ".")}{" "}
              <span className="text-xs text-stone-400">
                {date === today ? "今天" : ""} ↗
              </span>
            </h2>
            <p>
              {tasks.slice(0, 3).map((t) => (
                <span key={t.id} className="block">
                  {t.completed ? "✓" : "○"} {t.title}
                </span>
              ))}
              {tasks.length > 3 && <span>还有 {tasks.length - 3} 件小事</span>}
            </p>
            <small>
              🍅 × {data.tomatoes.filter((t) => t.date === date).length}
            </small>
            {theme && (
              <span
                className="history-sticker-theme"
                style={{ transform: `rotate(-${(seed * 17 + 7) % 31}deg)` }}
              >
                {theme}
              </span>
            )}
          </button>
        );
      })}
      </section>
      <HistoryTimeline dates={dates} starredDates={starredDates} onNavigate={(date) => {
        setRaisedDate(date);
        const card = Array.from(document.querySelectorAll<HTMLElement>(".history-sticker"))
          .find((element) => element.dataset.date === date);
        if (card) window.scrollTo({
          top: window.scrollY + card.getBoundingClientRect().top - 100,
          behavior: "instant",
        });
      }} />
      {!dates.length && (
        <div className="history-empty-state">
          <p className="empty">这里还没有足迹。</p>
          <button
            type="button"
            className="secondary history-restore-demo"
            disabled={restoringDemo}
            onClick={() => void restoreDemo()}
          >
            <RotateCcw size={16} aria-hidden="true" />
            {restoringDemo ? "正在恢复…" : "恢复演示足迹"}
          </button>
          <small>只恢复演示内容，不会覆盖真实记录。</small>
          {restoreError && <p role="alert" className="error">{restoreError}</p>}
        </div>
      )}
      {showTopButton && (
        <button
          className="history-top-button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="回到顶部"
          title="回到顶部"
        >
          <ArrowUpToLine size={22} strokeWidth={2.5} />
        </button>
      )}
      {showClearConfirm && createPortal(
        <div
          className="modal-backdrop history-clear-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !clearing) setShowClearConfirm(false);
          }}
        >
          <section
            className="modal history-clear-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-clear-title"
            aria-describedby="history-clear-description"
          >
            <div className="section-heading">
              <span className="history-clear-modal-icon" aria-hidden="true"><Trash2 size={20} /></span>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭"
                disabled={clearing}
                onClick={() => setShowClearConfirm(false)}
              >
                <X />
              </button>
            </div>
            <h2 id="history-clear-title">要清空这些痕迹吗？</h2>
            <p id="history-clear-description">
              足迹、日记、计划、番茄记录和 Demo 演示都会被清除，之后将从零开始。
            </p>
            <p className="history-clear-warning">清空后无法恢复。</p>
            {clearError && <p role="alert" className="error">{clearError}</p>}
            <div className="history-clear-actions">
              <button
                type="button"
                className="secondary"
                autoFocus
                disabled={clearing}
                onClick={() => setShowClearConfirm(false)}
              >
                再想想
              </button>
              <button
                type="button"
                className="history-clear-confirm"
                disabled={clearing}
                onClick={() => void clearHistory()}
              >
                {clearing ? "正在清空…" : "确认清空"}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </main>
  );
}
