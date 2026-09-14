"use client";
import Link from "next/link";
import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { prettyDate } from "@/lib/date";
import { useToday } from "@/components/layout/AppShell";
import HarvestTree from "@/components/mascot/HarvestTree";
import TaskList from "./TaskList";
import { FIRST_VISIT_TASK_GUIDE_KEY } from "./FirstVisitTaskGuide";
export default function Today() {
  const date = useToday();
  const [clock, setClock] = useState(() => new Date());
  const [showFirstVisitGuide, setShowFirstVisitGuide] = useState(false);
  useEffect(() => {
    const update = () => setClock(new Date());
    const timer = setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const tasks = useLiveQuery(
    () => db.tasks.where("date").equals(date).sortBy("createdAt"),
    [date],
  );
  const planted = useLiveQuery(
    () => db.tomatoes.where("date").equals(date).count(),
    [date],
  );
  useEffect(() => {
    if (!tasks || tasks.length > 0) return;
    try {
      if (window.localStorage.getItem(FIRST_VISIT_TASK_GUIDE_KEY)) return;
    } catch {
      // Storage can be unavailable in strict privacy modes; show for this visit.
    }
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(FIRST_VISIT_TASK_GUIDE_KEY, "seen");
      } catch {
        // The in-memory state still keeps the guide limited to this visit.
      }
      setShowFirstVisitGuide(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tasks]);
  return (
    <main className="garden-home">
      <section className="garden-hero">
        <div className="garden-clock-scene">
          <div className="garden-clock">
            <div className="garden-calendar">{prettyDate(date)}</div>
            <time dateTime={clock.toISOString()}>
              {clock.toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </time>
            <p className="today-planted">今日已种 {planted ?? 0} 颗番茄</p>
          </div>
          <HarvestTree />
        </div>
      </section>
      <section className="garden-tasks" aria-label="待办的小事">
        <div className="section-heading">
          <h2>
            今日待办{" "}
            <span>
              {showFirstVisitGuide
                ? "首次练习"
                : `${tasks?.filter((task) => task.completed).length ?? 0} / ${tasks?.length ?? 0}`}
            </span>
          </h2>
        </div>
        {tasks ? (
          <TaskList
            key={date}
            tasks={tasks}
            date={date}
            garden
            showFirstVisitGuide={showFirstVisitGuide}
            onFirstVisitGuideAdded={() => setShowFirstVisitGuide(false)}
          />
        ) : (
          <p className="empty">正在读取小事……</p>
        )}
      </section>
      <div className="garden-focus">
        <Link href="/focus" className="garden-start">
          <span className="garden-play-card">
            <Play
              size={34}
              fill="currentColor"
              strokeWidth={1.4}
              aria-hidden="true"
            />
          </span>
          <span>开始作数</span>
        </Link>
      </div>
    </main>
  );
}
