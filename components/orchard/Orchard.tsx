"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { dateKey } from "@/lib/date";
import { useToday } from "@/components/layout/AppShell";
import TomatoTree from "@/components/mascot/TomatoTree";
import { useFirstUseGuide } from "@/components/onboarding/FirstUseGuide";
import { buildFirstUseGuideRecords } from "@/lib/first-use-guide";

function offsetDate(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + offset);
  return dateKey(value);
}

function treeVariant(date: string) {
  let hash = 2166136261;
  for (const char of date) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return (hash >>> 0) % 5;
}

export default function Orchard() {
  const guide = useFirstUseGuide();
  const today = useToday();
  const [page, setPage] = useState(0);
  const storedTomatoes = useLiveQuery(() => db.tomatoes.toArray(), []);
  const tutorialTomato = guide.step === "finish" && guide.state
    ? buildFirstUseGuideRecords(guide.state.firstOpenedDate).tomato
    : null;
  const tomatoes = storedTomatoes === undefined
    ? undefined
    : tutorialTomato
      ? storedTomatoes.some((item) => item.id === tutorialTomato.id)
        ? storedTomatoes
        : [...storedTomatoes, tutorialTomato]
      : storedTomatoes;
  const landRef = useRef<HTMLElement>(null);
  const loaded = tomatoes !== undefined;
  useEffect(() => {
    const land = landRef.current;
    if (!land || !loaded) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const rows = Array.from(land.querySelectorAll<HTMLElement>(".orchard-row"));
    const parts = Array.from(land.querySelectorAll<SVGGElement>("[data-orchard-part]")).map((element, index) => ({
      element,
      x: Number(element.dataset.pivotX),
      y: Number(element.dataset.pivotY),
      angle: 0,
      velocity: 0,
      gain: element.dataset.orchardPart === "fruit" ? 0.6 : 1 + (index % 3) * 0.15,
      row: rows.indexOf(element.closest<HTMLElement>(".orchard-row")!),
    }));
    let frame = 0;
    const entranceTimers: number[] = [];
    let previousTime = 0;
    let pointer: { x: number; y: number; time: number } | null = null;
    let touch: { x: number; y: number; time: number } | null = null;
    let previousScroll = window.scrollY;
    let lastTouchTime = 0;
    const tick = (time: number) => {
      const dt = Math.min((time - previousTime) / 1000 || 1 / 60, 1 / 30);
      previousTime = time;
      let active = false;
      for (const part of parts) {
        part.velocity += (-150 * part.angle - 11 * part.velocity) * dt;
        part.angle += part.velocity * dt;
        if (Math.abs(part.angle) + Math.abs(part.velocity) > 0.03) {
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
      const rect = land.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    };
    const sway = (impulse: number, row?: number) => {
      if (reduced.matches || !isVisible()) return;
      for (const part of parts) {
        if (row !== undefined && part.row !== row) continue;
        part.velocity = Math.max(
          -160,
          Math.min(160, part.velocity + impulse * part.gain),
        );
      }
      if (!frame) {
        previousTime = performance.now();
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
      const impulse = Math.max(-65, Math.min(65, (dx + dy * 0.35) / elapsed * 24));
      for (const part of parts) {
        const matrix = part.element.ownerSVGElement?.getScreenCTM();
        if (!matrix) continue;
        const point = new DOMPoint(part.x, part.y).matrixTransform(matrix);
        const proximity = Math.max(0, 1 - Math.hypot(point.x - event.clientX, point.y - event.clientY) / 150);
        part.velocity = Math.max(-160, Math.min(160, part.velocity + impulse * proximity * part.gain));
      }
      if (!frame) {
        previousTime = now;
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
        sway(Math.max(-42, Math.min(42, (dx * 0.2 - dy) / elapsed * 16)));
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
      sway(Math.max(-38, Math.min(38, delta * -1.2)));
    };
    const leave = () => { pointer = null; };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      pointer = null;
      touch = null;
      for (const part of parts) {
        part.angle = part.velocity = 0;
        part.element.removeAttribute("transform");
      }
    };
    land.addEventListener("pointermove", move);
    land.addEventListener("pointerleave", leave);
    window.addEventListener("pointerdown", touchStart, { passive: true });
    window.addEventListener("pointermove", touchMove, { passive: true });
    window.addEventListener("pointerup", touchEnd, { passive: true });
    window.addEventListener("pointercancel", touchEnd, { passive: true });
    window.addEventListener("scroll", scroll, { passive: true });
    reduced.addEventListener("change", reset);
    for (let row = 0; row < rows.length; row += 1) {
      entranceTimers.push(window.setTimeout(
        () => sway(page % 2 === 0 ? 48 : -48, row),
        560 + row * 80,
      ));
    }
    return () => {
      entranceTimers.forEach(window.clearTimeout);
      reset();
      land.removeEventListener("pointermove", move);
      land.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointerdown", touchStart);
      window.removeEventListener("pointermove", touchMove);
      window.removeEventListener("pointerup", touchEnd);
      window.removeEventListener("pointercancel", touchEnd);
      window.removeEventListener("scroll", scroll);
      reduced.removeEventListener("change", reset);
    };
  }, [loaded, page, today, tomatoes?.length]);
  const days = Array.from({ length: 9 }, (_, index) =>
    offsetDate(today, -page * 9 - 8 + index),
  );
  const counts = new Map<string, number>();
  for (const tomato of tomatoes ?? [])
    counts.set(tomato.date, (counts.get(tomato.date) ?? 0) + 1);
  const total = days.reduce((sum, day) => sum + (counts.get(day) ?? 0), 0);
  const hasEarlier = (tomatoes ?? []).some((tomato) => tomato.date < days[0]);

  return (
    <main className="orchard-page">
      <Link
        href="/history"
        className="orchard-back"
        aria-label="返回足迹"
        title="返回足迹"
      >
        <ArrowLeft size={21} aria-hidden="true" />
      </Link>
      <header className="orchard-heading">
        <span className="orchard-eyebrow">MY LITTLE ORCHARD</span>
        <div className="orchard-title-row">
          <h1>果园</h1>
          <span className="orchard-total">共种植 <strong>{tomatoes?.length ?? 0}</strong> 颗番茄</span>
        </div>
      </header>
      <div className="orchard-period">
        <button
          aria-label="查看更早九天"
          disabled={!hasEarlier}
          onClick={() => setPage((value) => value + 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <time>
          {days[0].replaceAll("-", ".")} — {days[8].slice(5).replace("-", ".")}
        </time>
        <button
          aria-label="查看更新九天"
          disabled={page === 0}
          onClick={() => setPage((value) => value - 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
      {tomatoes === undefined ? (
        <p className="empty">正在走进你的果园……</p>
      ) : (
        <>
          <section
            ref={landRef}
            className="orchard-land"
            aria-label="每日番茄果树，远处是较早的日子"
          >
            <div className="orchard-horizon" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            {[0, 1, 2].map((row) => (
              <div className={`orchard-row orchard-depth-${row}`} key={row}>
                {days.slice(row * 3, row * 3 + 3).map((day) => {
                  const count = counts.get(day) ?? 0;
                  const treeCount = Math.min(count, 10);
                  return (
                    <figure
                      className={`orchard-day ${day === today ? "is-today" : ""}`}
                      key={day}
                      aria-label={`${day}，${count}颗番茄`}
                    >
                      <TomatoTree count={treeCount} variant={treeVariant(day)} compact />
                      <figcaption>
                        <time dateTime={day}>
                          {day.slice(5).replace("-", ".")}
                        </time>
                        <span>
                          {count} <small>颗</small>
                          {day === today && <em>今天</em>}
                        </span>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            ))}
          </section>
          <div className="orchard-harvest">
            <span className="orchard-harvest-mark" aria-hidden="true">
              ✳
            </span>
            <span>
              这九天，留下了 <b>{total}</b> 颗番茄
            </span>
          </div>
        </>
      )}
    </main>
  );
}
