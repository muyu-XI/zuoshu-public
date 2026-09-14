"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";

export default function HistoryTimeline({
  dates,
  starredDates = [],
  onNavigate,
}: {
  dates: string[];
  starredDates?: string[];
  onNavigate: (date: string) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const timeline = useRef<HTMLElement>(null);
  const pointer = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  const direction = useRef<"horizontal" | "vertical" | null>(null);
  const swipeX = useRef(0);
  const previousY = useRef(0);
  const dragged = useRef(false);
  const pressedDate = useRef<string | null>(null);
  const lastDate = useRef("");
  const navigate = useRef(onNavigate);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(dates[0] ?? "");
  const [positions, setPositions] = useState<Record<string, number>>({});

  useEffect(() => {
    navigate.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    const element = rail.current;
    if (!element || !expanded) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      element.scrollTop += event.deltaY * unit * 5;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [expanded]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".history-sticker"));
      const firstTop = cards[0]?.getBoundingClientRect().top;
      if (timeline.current && firstTop !== undefined) {
        timeline.current.style.top = `${Math.max(110, firstTop)}px`;
      }
      const origin = rail.current?.getBoundingClientRect().top ?? 0;
      const next: Record<string, number> = {};
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        if (card.dataset.date) next[card.dataset.date] = rect.top + rect.height / 2 - origin;
      }
      setPositions((previous) => Object.keys(next).length === Object.keys(previous).length &&
        Object.entries(next).every(([date, y]) => Math.abs((previous[date] ?? Infinity) - y) < 0.5)
        ? previous : next);
      const nearest = cards.reduce<HTMLElement | null>((best, card) =>
        !best || Math.abs(card.getBoundingClientRect().top - 100) <
          Math.abs(best.getBoundingClientRect().top - 100) ? card : best, null);
      if (pointer.current === null && nearest?.dataset.date) setActive(nearest.dataset.date);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    document.querySelectorAll<HTMLElement>(".history-sticker").forEach((card) => observer.observe(card));
    if (timeline.current) observer.observe(timeline.current);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [dates, expanded]);

  useEffect(() => {
    if (!expanded) return;
    let frame = 0;
    let previousTime = 0;
    const tick = (time: number) => {
      const elapsed = Math.min(previousTime ? time - previousTime : 16, 32);
      previousTime = time;
      const element = rail.current;
      const y = pointer.current;
      if (element && y !== null) {
        const bounds = element.getBoundingClientRect();
        if (y < bounds.top + 28) element.scrollTop -= 3 * elapsed;
        if (y > bounds.bottom - 28) element.scrollTop += 3 * elapsed;
        const points = Array.from(element.querySelectorAll<HTMLElement>("[data-timeline-date]"));
        const nearest = points.reduce<HTMLElement | null>((best, point) =>
          !best || Math.abs(point.getBoundingClientRect().top + 16 - y) <
            Math.abs(best.getBoundingClientRect().top + 16 - y) ? point : best, null);
        const date = nearest?.dataset.timelineDate;
        if (date && date !== lastDate.current) {
          lastDate.current = date;
          setActive(date);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

  function cancel() {
    pointer.current = null;
    startY.current = null;
    lastDate.current = "";
    dragged.current = false;
    pressedDate.current = null;
    direction.current = null;
    swipeX.current = 0;
  }

  function release() {
    if (startY.current === null) return;
    if (expanded && direction.current === "horizontal" && swipeX.current <= -30) {
      if (rail.current) rail.current.scrollTop = 0;
      setExpanded(false);
    } else if (!dragged.current) {
      if (expanded && pressedDate.current) {
        navigate.current(pressedDate.current);
      } else if (!expanded) {
        if (rail.current) rail.current.scrollTop = 0;
        setExpanded(true);
      }
    }
    cancel();
  }

  if (!dates.length) return null;
  return (
    <nav ref={timeline} className={`history-timeline ${expanded ? "is-expanded" : ""}`} aria-label="足迹时间轴">
      <div
        ref={rail}
        className="history-timeline-scroll"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          startY.current = event.clientY;
          startX.current = event.clientX;
          direction.current = null;
          swipeX.current = 0;
          previousY.current = event.clientY;
          dragged.current = false;
          pressedDate.current = (event.target as HTMLElement).closest<HTMLElement>("[data-timeline-date]")?.dataset.timelineDate ?? null;
        }}
        onPointerMove={(event) => {
          if (startY.current === null || !expanded) return;
          const dx = event.clientX - startX.current;
          const dy = event.clientY - startY.current;
          swipeX.current = dx;
          if (!direction.current && Math.hypot(dx, dy) > 5) {
            direction.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
            dragged.current = true;
          }
          if (direction.current === "vertical") {
            event.currentTarget.scrollTop += (previousY.current - event.clientY) * 5;
            pointer.current = event.clientY;
          }
          previousY.current = event.clientY;
        }}
        onPointerUp={release}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
      >
        {dates.map((date, index) => (
          <div
            key={date}
            className="history-timeline-point"
            style={expanded ? undefined : { top: (positions[date] ?? -1000) - 16 }}
          >
            {(index === 0 || date.slice(0, 4) !== dates[index - 1].slice(0, 4)) && (
              <div className="history-timeline-year"><span>{date.slice(0, 4)}</span></div>
            )}
            <button
              type="button"
              data-timeline-date={date}
              className={active === date ? "is-active" : ""}
              aria-label={`定位到 ${date}${starredDates.includes(date) ? "，已星标收藏" : ""}`}
              aria-current={active === date ? "date" : undefined}
              aria-expanded={expanded}
              title={date}
              onClick={(event) => {
                if (event.detail === 0) {
                  if (expanded) onNavigate(date);
                  else setExpanded(true);
                }
              }}
            >
              {starredDates.includes(date)
                ? <Star className="timeline-favorite-star" size={16} fill="currentColor" aria-hidden="true" />
                : <i aria-hidden="true" />}
              <span data-date-label={date}>{Number(date.slice(5, 7))}月{Number(date.slice(8))}日</span>
            </button>
          </div>
        ))}
      </div>
    </nav>
  );
}
