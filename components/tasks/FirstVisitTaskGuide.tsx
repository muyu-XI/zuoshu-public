"use client";

import { useEffect, useRef, useState } from "react";
import { useFirstUseGuide } from "@/components/onboarding/FirstUseGuide";

export default function FirstVisitTaskGuide() {
  const { step, advance } = useFirstUseGuide();
  const completed = step === "restore-demo";
  const [swipeX, setSwipeX] = useState(0);
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
        data-guide-id="guide-demo-task"
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
              advance("restore-demo", "add-task");
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
            advance("complete-demo", "restore-demo");
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
          if (completed) advance("restore-demo", "add-task");
          else advance("complete-demo", "restore-demo");
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
        data-guide-id="guide-add-task"
        disabled={step !== "add-task"}
        onClick={() => advance("add-task", "open-focus")}
        aria-label="把读一章书，记下一个问题加入今日待办"
      >
        <span className="guide-example-label">示例</span>
        <span className="task-copy">
          <strong>读一章书，记下一个问题</strong>
          <small>点击加入今天 · 预计 1 颗</small>
        </span>
        <span className="task-fruits" aria-hidden="true">
          <span className="task-fruit">
            <span className="unripe-ring" />
          </span>
        </span>
      </button>
    </>
  );
}
