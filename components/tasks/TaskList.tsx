"use client";
import { newId } from "@/lib/id";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, MoreHorizontal, Plus, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, moveTomato } from "@/lib/db";
import type { Task } from "@/types";
import { TomatoIcon } from "@/components/mascot/TomatoTree";
import { tomatoSlotCount } from "@/lib/task-progress";
import FirstVisitTaskGuide from "./FirstVisitTaskGuide";
import { useFirstUseGuide } from "@/components/onboarding/FirstUseGuide";
import { FIRST_USE_TASK_ID, FIRST_USE_TOMATO_ID, type FirstUseGuideStep } from "@/lib/first-use-guide";
export default function TaskList({
  tasks,
  date,
  readOnly = false,
  garden = false,
  showFirstVisitGuide = false,
  onFirstVisitGuideAdded,
  guideStep = null,
}: {
  tasks: Task[];
  date: string;
  readOnly?: boolean;
  garden?: boolean;
  showFirstVisitGuide?: boolean;
  onFirstVisitGuideAdded?: () => void;
  guideStep?: FirstUseGuideStep | null;
}) {
  const guide = useFirstUseGuide();
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState<number | "">("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState<string[]>([]);
  const [drag, setDrag] = useState<{
    tomatoId: string;
    x: number;
    y: number;
  } | null>(null);
  const [swipe, setSwipe] = useState<{ id: string; x: number } | null>(null);
  const Copy = garden ? "button" : "div";
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<{
    id: string;
    x: number;
    y: number;
    lastX: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const scrollTop = useRef(0);
  const sessions = useLiveQuery(
    () =>
      db.tomatoes
        .where("date")
        .equals(date)
        .filter((tomato) => Boolean(tomato.taskId))
        .sortBy("completedAt"),
    [date],
  );
  function cancelHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }
  function clearTarget() {
    document
      .querySelectorAll(".harvest-target")
      .forEach((element) => element.classList.remove("harvest-target"));
  }
  useEffect(() => {
    const dropped = (event: Event) => {
      const { taskId, slot } = (event as CustomEvent).detail;
      const key = `${taskId}:${slot}`;
      setShaking((keys) => [...keys.filter((item) => item !== key), key]);
    };
    window.addEventListener("tomato-dropped", dropped);
    return () => {
      cancelHold();
      window.removeEventListener("tomato-dropped", dropped);
    };
  }, []);
  async function move(
    tomatoId: string,
    targetTaskId: string,
    targetSlot?: number,
  ) {
    try {
      const result = await moveTomato(tomatoId, targetTaskId, targetSlot);
      window.dispatchEvent(
        new CustomEvent("tomato-dropped", { detail: result }),
      );
    } catch {
      setError("番茄移动失败，请重试。");
    }
  }
  async function toggle(task: Task) {
    if (task.id === FIRST_USE_TASK_ID) {
      guide.advance("complete-task", "open-reflection");
      return;
    }
    try {
      await db.tasks.update(task.id, { completed: !task.completed });
    } catch {
      setError("保存失败，请重试。");
    }
  }
  function edit(task: Task | "new") {
    setEditing(task);
    setTitle(task === "new" ? "" : task.title);
    setEstimate(task === "new" ? "" : task.estimatedTomatoes || "");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      if (editing === "new") {
        await db.tasks.add({
          id: newId(),
          title: title.trim(),
          date,
          estimatedTomatoes: Number(estimate),
          actualTomatoes: 0,
          completed: false,
          createdAt: Date.now(),
        });
        onFirstVisitGuideAdded?.();
      } else if (editing)
        await db.tasks.update(editing.id, {
          title: title.trim(),
          estimatedTomatoes: Number(estimate),
        });
      setEditing(null);
    } catch {
      setError("保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className={garden ? "garden-board" : undefined}>
        <div
          className={
            garden
              ? `task-list garden-scroll${tasks.length === 0 && !showFirstVisitGuide ? " is-empty" : ""}`
              : "task-list"
          }
          aria-label={garden ? "待办事项，可上下滚动" : undefined}
          tabIndex={garden ? 0 : undefined}
          onScroll={(e) => {
            const nextTop = e.currentTarget.scrollTop;
            if (Math.abs(nextTop - scrollTop.current) < 1) return;
            scrollTop.current = nextTop;
            cancelHold();
            gesture.current = null;
            setSwipe(null);
          }}
        >
          {showFirstVisitGuide && tasks.length === 0 && (
            <FirstVisitTaskGuide />
          )}
          {tasks.map((task) => {
            const tutorialSessions = task.id === FIRST_USE_TASK_ID
              && (guideStep === "complete-task" || guideStep === "open-reflection")
              ? [{
                id: FIRST_USE_TOMATO_ID,
                date,
                durationType: "small" as const,
                plannedMinutes: 25,
                taskId: FIRST_USE_TASK_ID,
                slot: 0,
                completedAt: 0,
                demo: true,
              }]
              : [];
            const taskSessions = [...(sessions ?? []), ...tutorialSessions]
              .filter((tomato) => tomato.taskId === task.id)
              .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
            const sessionBySlot = new Map(
              taskSessions.map((tomato, index) => [
                task.estimatedTomatoes === 0 ? index : (tomato.slot ?? 0),
                tomato,
              ]),
            );
            const length = tomatoSlotCount(task, taskSessions);
            const stackStart = Math.max(1, task.estimatedTomatoes);

            return (
              <div
                key={task.id}
                data-task-id={readOnly ? undefined : task.id}
                data-guide-id={task.id === FIRST_USE_TASK_ID ? "guide-real-task" : undefined}
                className={`task-row ${garden ? "garden-task" : ""} ${task.sourceKey ? "source-task" : ""} ${task.completed ? "completed" : ""}`}
                style={{
                  touchAction: "pan-y",
                  transform:
                    swipe?.id === task.id
                      ? `translateX(${swipe.x}px)`
                      : undefined,
                  transition: swipe?.id === task.id ? "none" : undefined,
                }}
                tabIndex={garden ? 0 : undefined}
                aria-label={
                  garden
                    ? task.completed
                      ? `${task.title}，已划掉，长按恢复`
                      : `${task.title}，右滑划掉`
                    : undefined
                }
                onPointerDown={(e) => {
                  suppressClick.current = false;
                  cancelHold();
                  if (
                    !garden ||
                    readOnly ||
                    e.button !== 0 ||
                    (e.target as Element).closest(".task-fruit")
                  )
                    return;
                  gesture.current = {
                    id: task.id,
                    x: e.clientX,
                    y: e.clientY,
                    lastX: e.clientX,
                  };
                  if (task.completed)
                    holdTimer.current = setTimeout(() => {
                      suppressClick.current = true;
                      void toggle(task);
                      gesture.current = null;
                      cancelHold();
                    }, 550);
                }}
                onPointerMove={(e) => {
                  const current = gesture.current;
                  if (!current || current.id !== task.id) return;
                  const dx = e.clientX - current.x;
                  const dy = e.clientY - current.y;
                  current.lastX = e.clientX;
                  if (Math.hypot(dx, dy) > 10) {
                    cancelHold();
                  }
                  if (
                    !task.completed &&
                    dx > 0 &&
                    dx >= 18 &&
                    Math.abs(dx) > Math.abs(dy) * 1.5
                  ) {
                    if (!e.currentTarget.hasPointerCapture(e.pointerId))
                      e.currentTarget.setPointerCapture(e.pointerId);
                    suppressClick.current = true;
                    setSwipe({ id: task.id, x: Math.min(dx, 140) });
                  }
                }}
                onPointerUp={(e) => {
                  const current = gesture.current;
                  if (
                    current?.id === task.id &&
                    !task.completed &&
                    Math.max(current.lastX, e.clientX) - current.x >= 112
                  )
                    void toggle(task);
                  gesture.current = null;
                  setSwipe(null);
                  cancelHold();
                }}
                onPointerCancel={() => {
                  gesture.current = null;
                  setSwipe(null);
                  cancelHold();
                }}
                onContextMenu={(e) => {
                  if (garden) e.preventDefault();
                }}
                onClickCapture={(e) => {
                  if (suppressClick.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    suppressClick.current = false;
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    garden &&
                    e.target === e.currentTarget &&
                    (e.key === " " || e.key === "Enter")
                  ) {
                    e.preventDefault();
                    void toggle(task);
                  }
                }}
              >
                {!garden && (
                  <button
                    className="check"
                    aria-label={`${task.completed ? "取消完成" : "完成"}${task.title}`}
                    disabled={readOnly}
                    onClick={() => toggle(task)}
                  >
                    {task.completed && <Check size={16} />}
                  </button>
                )}
                <Copy
                  className="task-copy"
                  onClick={garden ? () => edit(task) : undefined}
                  aria-label={garden ? `编辑${task.title}` : undefined}
                >
                  <strong>{task.title}</strong>
                  {!garden && (
                    <small>
                      预计 {task.estimatedTomatoes} 颗 <span>·</span> 已投入{" "}
                      {task.actualTomatoes} 颗
                    </small>
                  )}
                </Copy>
                {garden && (
                  <div
                    className="task-fruits"
                    aria-label={`${task.title}的番茄进度`}
                  >
                    {Array.from({ length }, (_, index) => {
                      const tomato = sessionBySlot.get(index);
                      const overflow = index >= stackStart;
                      const opacity = overflow
                        ? Math.max(0.2, 1 - (index - stackStart + 1) * 0.1)
                        : 1;

                      return tomato ? (
                        <button
                          key={tomato.id}
                          className={`task-fruit ${overflow ? "overflow-fruit" : ""}`}
                          data-slot={index}
                          style={{
                            zIndex: 20 - index,
                            opacity: drag?.tomatoId === tomato.id ? 0 : opacity,
                          }}
                          aria-label={`拖动${task.title}的第${index + 1}颗番茄`}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            setDrag({
                              tomatoId: tomato.id,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          onPointerMove={(e) => {
                            if (drag?.tomatoId !== tomato.id) return;
                            setDrag({
                              tomatoId: tomato.id,
                              x: e.clientX,
                              y: e.clientY,
                            });
                            clearTarget();
                            document
                              .elementFromPoint(e.clientX, e.clientY)
                              ?.closest("[data-task-id]")
                              ?.classList.add("harvest-target");
                          }}
                          onPointerCancel={() => {
                            setDrag(null);
                            clearTarget();
                          }}
                          onPointerUp={(e) => {
                            if (drag?.tomatoId !== tomato.id) return;
                            const taskId = document
                              .elementFromPoint(e.clientX, e.clientY)
                              ?.closest<HTMLElement>("[data-task-id]")
                              ?.dataset.taskId;
                            const slot = document
                              .elementFromPoint(e.clientX, e.clientY)
                              ?.closest<HTMLElement>("[data-slot]")
                              ?.dataset.slot;
                            setDrag(null);
                            clearTarget();
                            if (taskId && taskId !== task.id)
                              void move(
                                tomato.id,
                                taskId,
                                slot === undefined ? undefined : Number(slot),
                              );
                          }}
                        >
                          <span
                            className={
                              shaking.includes(`${task.id}:${index}`)
                                ? "tomato-pop"
                                : "tomato-mark"
                            }
                            onAnimationEnd={() =>
                              setShaking((keys) =>
                                keys.filter(
                                  (key) => key !== `${task.id}:${index}`,
                                ),
                              )
                            }
                          >
                            <TomatoIcon />
                          </span>
                        </button>
                      ) : (
                        <span
                          key={index}
                          className="task-fruit"
                          data-slot={index}
                          aria-label={`${task.title}第${index + 1}个预计番茄位`}
                        >
                          <span className="unripe-ring" />
                        </span>
                      );
                    })}
                  </div>
                )}
                {!readOnly && !garden && (
                  <button
                    className="icon-button"
                    aria-label={`编辑${task.title}`}
                    onClick={() => edit(task)}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {!tasks.length && !garden && (
          <p className="empty">留一点空白，种下第一件想做的事。</p>
        )}
        {!readOnly && (
          <button
            className={garden ? "add-task garden-add" : "add-task"}
            onClick={() => edit("new")}
            aria-label="添加一件事"
          >
            <Plus size={garden ? 25 : 18} />{" "}
            {garden ? (
              <span className="sr-only">添加一件事</span>
            ) : (
              "添加一件事"
            )}
          </button>
        )}
      </div>
      {drag && createPortal(
        <div
          className="dragged-tomato task-dragged-tomato"
          style={{ left: drag.x, top: drag.y }}
        >
          <TomatoIcon />
        </div>,
        document.body,
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {editing && createPortal(
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="编辑任务"
          >
            <div className="section-heading">
              <h2>{editing === "new" ? "种下一件小事" : "调整这件事"}</h2>
              <button
                className="icon-button"
                aria-label="关闭"
                onClick={() => setEditing(null)}
              >
                <X />
              </button>
            </div>
            <form onSubmit={save}>
              <label>
                想做什么？
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="小到可以开始的一步"
                />
              </label>
              <label>
                预计番茄数（选填）
                <input
                  type="number"
                  min={0}
                  max={24}
                  placeholder="暂不预计"
                  value={estimate}
                  onChange={(e) =>
                    setEstimate(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
              </label>
              {editing !== "new" && (
                <p className="hint">
                  已投入{" "}
                  {tasks.find((task) => task.id === editing.id)
                    ?.actualTomatoes ?? editing.actualTomatoes}{" "}
                  颗番茄
                </p>
              )}
              <button className="primary" disabled={busy}>
                保存任务
              </button>
            </form>
            {editing !== "new" && (
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await db.tasks.delete(editing.id);
                    setEditing(null);
                  } catch {
                    setError("删除失败，请重试。");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                删除任务
              </button>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
