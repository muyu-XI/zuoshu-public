"use client";
import { newId } from "@/lib/id";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, continueAfterHarvest } from "@/lib/db";
import type { FocusState } from "@/types";
import { TreeFruit } from "@/components/mascot/TomatoTree";
import WateringMascot from "@/components/mascot/WateringMascot";
import { useFirstUseGuide } from "@/components/onboarding/FirstUseGuide";
import { focusDurationMs } from "@/lib/focus-timing";
export default function FocusTimer() {
  const guide = useFirstUseGuide();
  const [mode, setMode] = useState<"small" | "large">("small");
  const [count, setCount] = useState(1);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmStop, setConfirmStop] = useState(false);
  const stored = useLiveQuery(
    async () => (await db.settings.get("focus")) ?? null,
    [],
  );
  const focus =
    stored?.value && typeof stored.value !== "string" ? stored.value : null;
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 200);
    const visibility = () => tick();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const seconds =
    focus && now
      ? Math.max(0, Math.ceil((focus.endTimestamp - now) / 1000))
      : 0;
  const ripe =
    focus &&
    (focus.phase === "ripe" || (focus.phase === "focus" && seconds === 0));
  const durationSeconds = focus
    ? focus.phase === "break"
      ? (focus.demo ? 5 : 300)
      : (focus.demo ? (focus.durationType === "small" ? 10 : 20) : focus.plannedMinutes * 60)
    : 1;
  const progress = focus
    ? Math.max(0, Math.min(1, 1 - (focus.endTimestamp - now) / (durationSeconds * 1000)))
    : 0;
  const tutorialMode = guide.step === "start-timer"
    || guide.step === "focus-running"
    || guide.step === "return-tree";
  const tutorialSeconds = guide.state?.focusEndsAt
    ? Math.min(3, Math.max(0, Math.ceil((guide.state.focusEndsAt - now) / 1000)))
    : 3;
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  async function start(previous?: FocusState) {
    const durationType = previous?.durationType ?? mode;
    const isDemo = previous?.demo ?? false;
    const minutes = durationType === "small" ? 25 : 52;
    await db.settings.put({
      key: "focus",
      value: {
        id: newId(),
        phase: "focus",
        endTimestamp: Date.now() + focusDurationMs(durationType, isDemo),
        durationType,
        plannedMinutes: minutes,
        remaining: previous?.remaining ?? count,
        total: previous?.total ?? count,
        demo: isDemo,
      },
    });
    setNow(Date.now());
  }
  if (stored === undefined || !now)
    return <main className="empty">正在查看种植进度……</main>;
  if (tutorialMode) {
    return (
      <main className="focus-page journal-page tutorial-focus-page">
        {guide.step === "return-tree" ? (
          <>
            <div className="focus-center">
              <div className="harvest-icon"><TreeFruit /></div>
              <h1 className="page-heading">番茄成熟了</h1>
              <p className="intro">这是教程里的快速番茄，之后每颗小番茄都会恢复为 25 分钟。</p>
            </div>
            <div className="harvest-actions">
              <Link
                href="/"
                className="primary harvest-return"
                data-guide-id="guide-return-tree"
                onClick={() => guide.advance("return-tree", "drag-tomato")}
              >
                回到果树
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mode-picker tutorial-mode-picker">
              <div className="selected">
                <small>教程小番茄</small>
                <b>3 <small>sec</small></b>
              </div>
            </div>
            <div
              className="tutorial-focus-progress"
              data-guide-id={guide.step === "focus-running" ? "guide-focus-timer" : undefined}
            >
              <div className="timer" role="timer" aria-label="教程番茄剩余时间">
                <b>00:{String(guide.step === "focus-running" ? tutorialSeconds : 3).padStart(2, "0")}</b>
              </div>
              <WateringMascot />
            </div>
            {guide.step === "start-timer" && (
              <button
                className="primary"
                data-guide-id="guide-start-timer"
                onClick={guide.startTimer}
              >
                开始种植
              </button>
            )}
          </>
        )}
      </main>
    );
  }
  return (
    <main className="focus-page journal-page">
      <Link href="/" className="back">
        <ArrowLeft size={23} strokeWidth={2.6} /> 回到今天
      </Link>
      {!focus ? (
        <>
          <div className="mode-picker">
            <button
              className={mode === "small" ? "selected" : ""}
              aria-pressed={mode === "small"}
              onClick={() => setMode("small")}
            >
              <small>小番茄</small>
              <b>
                25 <small>min</small>
              </b>
            </button>
            <button
              className={mode === "large" ? "selected" : ""}
              aria-pressed={mode === "large"}
              onClick={() => setMode("large")}
            >
              <small>大番茄</small>
              <b>
                52 <small>min</small>
              </b>
            </button>
          </div>
          <label>
            <span className="sr-only">种植数量</span>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} 颗{n > 1 ? " · 每颗之间休息 5 分钟" : " · 从一颗开始"} · 共{" "}
                  {(() => {
                    const minutes = (mode === "small" ? 25 : 52) * n + (n - 1) * 5;
                    return minutes >= 60
                      ? `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ""}`
                      : `${minutes} 分钟`;
                  })()}
                </option>
              ))}
            </select>
          </label>
          <div className="timer">
            <b>{mode === "small" ? "25" : "52"}:00</b>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() => run(() => start())}
          >
            开始种植
          </button>
        </>
      ) : ripe ? (
        <>
          <div className="focus-center">
            <div className="harvest-icon"><TreeFruit /></div>
            <h1 className="page-heading">番茄成熟了</h1>
            <p className="intro">番茄已挂上果树，回到今天即可拖到待办中。</p>
          </div>
          <div className="harvest-actions">
          <Link href="/" className="primary harvest-return">
            回到果树
          </Link>
          <button
            className="harvest-continue"
            disabled={busy}
            onClick={() => run(continueAfterHarvest)}
          >
            {focus.remaining > 1 ? "休息一下，继续下一颗" : "继续种植"}
          </button>
          </div>
        </>
      ) : (
        <>
          <div className="timer" role="timer" aria-label="剩余时间">
            <svg className="timer-ticks" viewBox="0 0 300 300" aria-hidden="true">
              {Array.from({ length: 60 }, (_, index) => (
                <line key={index} x1="150" y1="9" x2="150" y2={index % 5 === 0 ? "28" : "21"}
                  transform={`rotate(${index * 6} 150 150)`}
                  className={index < Math.floor(progress * 60) ? "elapsed" : ""} />
              ))}
            </svg>
            <span>
              {focus.phase === "break"
                ? "休息时间"
                : `${focus.plannedMinutes} min · 第 ${focus.total - focus.remaining + 1} / ${focus.total} 颗`}
            </span>
            <b>
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:
              {String(seconds % 60).padStart(2, "0")}
            </b>
          </div>
          <WateringMascot />
          {focus.phase === "break" && (
            <button
              className="primary"
              disabled={busy || seconds > 0}
              onClick={() => run(() => start(focus))}
            >
              {seconds > 0 ? "让自己休息一下" : "开始下一颗"}
            </button>
          )}
          <button
            className="focus-stop-button"
            disabled={busy}
            onClick={() => setConfirmStop(true)}
          >
            结束本轮种植
          </button>
          {confirmStop && (
            <div className="focus-confirm-backdrop" role="presentation">
              <section className="focus-confirm" role="dialog" aria-modal="true" aria-labelledby="focus-confirm-title">
                <h2 id="focus-confirm-title">确定吗？</h2>
                <p>番茄将不会成熟</p>
                <div className="focus-confirm-actions">
                  <button type="button" onClick={() => setConfirmStop(false)}>取消</button>
                  <button
                    type="button"
                    className="confirm-danger"
                    onClick={() => {
                      setConfirmStop(false);
                      void run(() => db.settings.delete("focus"));
                    }}
                  >
                    确定结束
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  );
}
