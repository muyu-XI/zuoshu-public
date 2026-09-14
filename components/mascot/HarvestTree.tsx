"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useToday } from "@/components/layout/AppShell";
import { assignTomato, db } from "@/lib/db";
import TomatoTree, { fruitPositions, TreeFruit } from "./TomatoTree";

export default function HarvestTree() {
  const pending = useLiveQuery(
    () => db.tomatoes.where("taskId").equals("").sortBy("completedAt"),
    [],
  );
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const treeRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const today = useToday();
  const tasks = useLiveQuery(
    () => db.tasks.where("date").equals(today).toArray(),
    [today],
  );
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const parts = Array.from(tree.querySelectorAll<SVGGElement>("[data-orchard-part]"));
    let frame = 0;
    let entranceFrame = 0;
    let last = 0;
    let pointer: { x: number; y: number; time: number } | null = null;
    let touch: { x: number; y: number; time: number } | null = null;
    let previousScroll = window.scrollY;
    let lastTouchTime = 0;
    const state = parts.map((element, index) => ({
      element,
      x: Number(element.dataset.pivotX),
      y: Number(element.dataset.pivotY),
      angle: 0,
      velocity: 0,
      gain: 1 + (index % 3) * 0.2,
    }));
    const tick = (time: number) => {
      const dt = Math.min((time - last) / 1000 || 1 / 60, 1 / 30);
      last = time;
      let active = false;
      for (const part of state) {
        part.velocity += (-180 * part.angle - 12 * part.velocity) * dt;
        part.angle += part.velocity * dt;
        if (Math.abs(part.angle) > 0.03 || Math.abs(part.velocity) > 0.03) {
          active = true;
          part.element.setAttribute("transform", `rotate(${part.angle} ${part.x} ${part.y})`);
        } else {
          part.angle = part.velocity = 0;
          part.element.removeAttribute("transform");
        }
      }
      frame = active ? requestAnimationFrame(tick) : 0;
    };
    const isVisible = () => {
      const rect = tree.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    };
    const sway = (impulse: number) => {
      if (reduced.matches || !isVisible()) return;
      for (const part of state) {
        part.velocity = Math.max(
          -190,
          Math.min(190, part.velocity + impulse * part.gain),
        );
      }
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const move = (event: PointerEvent) => {
      if (reduced.matches || event.pointerType === "touch") return;
      const now = performance.now();
      const dx = pointer ? event.clientX - pointer.x : 0;
      const dy = pointer ? event.clientY - pointer.y : 0;
      const elapsed = pointer ? Math.max(8, now - pointer.time) : 16;
      pointer = { x: event.clientX, y: event.clientY, time: now };
      const impulse = Math.max(-90, Math.min(90, (dx + dy * 0.3) / elapsed * 28));
      for (const part of state) {
        const matrix = part.element.ownerSVGElement?.getScreenCTM();
        if (!matrix) continue;
        const point = new DOMPoint(part.x, part.y).matrixTransform(matrix);
        const proximity = Math.max(0, 1 - Math.hypot(point.x - event.clientX, point.y - event.clientY) / 130);
        part.velocity = Math.max(-190, Math.min(190, part.velocity + impulse * proximity * part.gain));
      }
      if (!frame) {
        last = now;
        frame = requestAnimationFrame(tick);
      }
    };
    const touchStart = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !event.isPrimary) return;
      touch = { x: event.clientX, y: event.clientY, time: performance.now() };
    };
    const touchMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !event.isPrimary) return;
      const now = performance.now();
      if (touch) {
        const elapsed = Math.max(8, now - touch.time);
        const dx = event.clientX - touch.x;
        const dy = event.clientY - touch.y;
        sway(Math.max(-48, Math.min(48, (dx * 0.2 - dy) / elapsed * 18)));
      }
      touch = { x: event.clientX, y: event.clientY, time: now };
      lastTouchTime = now;
    };
    const touchEnd = (event: PointerEvent) => {
      if (event.pointerType === "touch" && event.isPrimary) touch = null;
    };
    const scroll = () => {
      const nextScroll = window.scrollY;
      const delta = nextScroll - previousScroll;
      previousScroll = nextScroll;
      if (performance.now() - lastTouchTime < 100 || Math.abs(delta) < 1) return;
      sway(Math.max(-42, Math.min(42, delta * -1.4)));
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      pointer = null;
      touch = null;
      for (const part of state) {
        part.angle = part.velocity = 0;
        part.element.removeAttribute("transform");
      }
    };
    tree.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", touchStart, { passive: true });
    window.addEventListener("pointermove", touchMove, { passive: true });
    window.addEventListener("pointerup", touchEnd, { passive: true });
    window.addEventListener("pointercancel", touchEnd, { passive: true });
    window.addEventListener("scroll", scroll, { passive: true });
    reduced.addEventListener("change", reset);
    entranceFrame = requestAnimationFrame(() => sway(18));
    return () => {
      tree.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", touchStart);
      window.removeEventListener("pointermove", touchMove);
      window.removeEventListener("pointerup", touchEnd);
      window.removeEventListener("pointercancel", touchEnd);
      window.removeEventListener("scroll", scroll);
      reduced.removeEventListener("change", reset);
      cancelAnimationFrame(entranceFrame);
      reset();
    };
  }, []);
  async function drop(id: string, taskId: string, slot?: number) {
    if (busy.current) return;
    busy.current = true;
    try {
      const assignedSlot = await assignTomato(id, taskId, slot);
      if (assignedSlot !== undefined)
        window.dispatchEvent(
          new CustomEvent("tomato-dropped", {
            detail: { taskId, slot: assignedSlot },
          }),
        );
      setSelected(null);
      setError("");
    } catch {
      setError("番茄未放下，请重试。");
    } finally {
      busy.current = false;
    }
  }
  function clearTarget() {
    document
      .querySelectorAll(".harvest-target")
      .forEach((el) => el.classList.remove("harvest-target"));
  }
  function getDropTarget(x: number, y: number) {
    const tasks = Array.from(
      document.querySelectorAll<HTMLElement>("[data-task-id]"),
    );
    const task = tasks.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
    if (task?.dataset.taskId) {
      return { taskId: task.dataset.taskId };
    }
    return null;
  }
  function highlightDropTarget(x: number, y: number) {
    clearTarget();
    const target = getDropTarget(x, y);
    if (!target) return;
    document
      .querySelectorAll<HTMLElement>("[data-task-id]")
      .forEach((element) => {
        if (element.dataset.taskId === target.taskId)
          element.classList.add("harvest-target");
      });
  }
  return (
    <>
      <div ref={treeRef} className={`orchard-entry harvest-tree ${drag ? "is-dragging-fruit" : ""}`}>
        <Link href="/orchard" aria-label="进入果园">
          <TomatoTree count={0} />
        </Link>
        {(pending ?? []).slice(0, 3).map((tomato, index) => {
          const [x, y] = fruitPositions[index];
          return (
            <button
              key={tomato.id}
              className="tree-fruit"
              aria-label={`拖动成熟番茄${index + 1}到待办，或按回车选择任务`}
              style={{
                left: `${((x - 25) / 260) * 100}%`,
                top: `${((y - 24) / 210) * 100}%`,
                opacity: drag?.id === tomato.id ? 0 : 1,
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDrag(null);
                  clearTarget();
                }
              }}
              onClick={(e) => {
                if (e.detail === 0) setSelected(tomato.id);
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ id: tomato.id, x: e.clientX, y: e.clientY });
              }}
              onPointerMove={(e) => {
                if (!drag || drag.id !== tomato.id) return;
                e.preventDefault();
                setDrag({ ...drag, x: e.clientX, y: e.clientY });
                highlightDropTarget(e.clientX, e.clientY);
              }}
              onPointerCancel={() => {
                setDrag(null);
                clearTarget();
              }}
              onPointerUp={(e) => {
                if (!drag) return;
                e.preventDefault();
                const target = getDropTarget(e.clientX, e.clientY);
                setDrag(null);
                clearTarget();
                if (target)
                  void drop(
                    tomato.id,
                    target.taskId,
                    undefined,
                  );
              }}
            >
              <TreeFruit />
            </button>
          );
        })}
      </div>
      {drag && createPortal(
        <div className="dragged-tomato" style={{ left: drag.x, top: drag.y }}>
          <TreeFruit />
        </div>,
        document.body,
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {selected && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="放下番茄"
          >
            <h2>把番茄放到哪件事？</h2>
            {tasks?.map((task) => (
              <button
                className="choice"
                key={task.id}
                onClick={() => void drop(selected, task.id)}
              >
                {task.title}
              </button>
            ))}
            <button className="quiet-link" onClick={() => setSelected(null)}>
              取消
            </button>
          </section>
        </div>
      )}
    </>
  );
}
