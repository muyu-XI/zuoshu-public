"use client";

import { newId } from "@/lib/id";
import { db } from "@/lib/db";
import { useEffect, useRef, useState } from "react";

export const FIRST_VISIT_TASK_GUIDE_KEY = "zuoshu:first-visit-task-guide-v1";

export default function FirstVisitTaskGuide({
  date,
  onAdded,
}: {
  date: string;
  onAdded: () => void;
}) {
  const [completed, setCompleted] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pointer = useRef<{ x: number; y: number; lastX: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  useEffect(() => () => cancelHold(), []);

  return (
    <>
      <div
        className={`task-row garden-task garden-guide-task${completed ? " guide-completed" : ""}`}
        style={{
          touchAction: "pan-y",
          transform: swipeX ? `translateX(${swipeX}px)` : undefined,
          transition: swipeX ? "none" : undefined,
        }}
        tabIndex={0}
        aria-label={completed
          ? "长按这张示例卡片，可以恢复"
          : "向右滑动这张示例卡片，完成这件小事"}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          pointer.current = {
            x: event.clientX,
            y: event.clientY,
            lastX: event.clientX,
          };
          if (completed) {
            holdTimer.current = setTimeout(() => {
              setCompleted(false);
              pointer.current = null;
              cancelHold();
            }, 550);
          }
        }}
        onPointerMove={(event) => {
          const current = pointer.current;
          if (!current) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          current.lastX = event.clientX;
          if (Math.hypot(dx, dy) > 10) cancelHold();
          if (
            !completed
            && dx >= 18
            && Math.abs(dx) > Math.abs(dy) * 1.5
          ) {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.setPointerCapture(event.pointerId);
            }
            setSwipeX(Math.min(dx, 140));
          }
        }}
        onPointerUp={(event) => {
          const current = pointer.current;
          if (
            current
            && !completed
            && Math.max(current.lastX, event.clientX) - current.x >= 112
          ) {
            setCompleted(true);
          }
          pointer.current = null;
          setSwipeX(0);
          cancelHold();
        }}
        onPointerCancel={() => {
          pointer.current = null;
          setSwipeX(0);
          cancelHold();
        }}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          setCompleted((value) => !value);
        }}
      >
        <span className="guide-example-label">示例</span>
        <div className="task-copy">
          <strong>
            {completed
              ? "长按这张卡片，可以恢复"
              : "向右滑动，完成这件小事"}
          </strong>
          <small>手势练习，不计入足迹</small>
        </div>
      </div>

      <button
        className="task-row garden-task garden-guide-task garden-guide-suggestion"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await db.tasks.add({
              id: newId(),
              title: "读一章书，记下一个问题",
              date,
              estimatedTomatoes: 1,
              actualTomatoes: 0,
              completed: false,
              createdAt: Date.now(),
            });
            onAdded();
          } catch {
            setError("加入失败，请重试。");
          } finally {
            setBusy(false);
          }
        }}
        aria-label="把读一章书，记下一个问题加入今日待办"
      >
        <span className="guide-example-label">示例</span>
        <span className="task-copy">
          <strong>读一章书，记下一个问题</strong>
          <small>{busy ? "正在加入……" : "点击加入今天 · 预计 1 颗"}</small>
        </span>
        <span className="task-fruits" aria-hidden="true">
          <span className="task-fruit">
            <span className="unripe-ring" />
          </span>
        </span>
      </button>
      {error && <p role="alert" className="error guide-error">{error}</p>}
    </>
  );
}
