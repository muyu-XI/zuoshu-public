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
import { useFirstUseGuide } from "@/components/onboarding/FirstUseGuide";
import { FIRST_USE_TASK_ID, FIRST_USE_TASK_TITLE } from "@/lib/first-use-guide";
export default function Today() {
  const date = useToday();
  const { step, advance } = useFirstUseGuide();
  const [clock, setClock] = useState(() => new Date());
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
  const practicing = step === "complete-demo" || step === "restore-demo" || step === "add-task";
  const hasTutorialTask = !!step && !practicing && ![
    "start-timer", "focus-running", "return-tree", "fill-journal",
    "journal-typing", "journal-reading", "submit-reflection", "open-history", "open-orchard", "finish",
  ].includes(step);
  const tutorialTask = hasTutorialTask ? [{
    id: FIRST_USE_TASK_ID,
    title: FIRST_USE_TASK_TITLE,
    date,
    estimatedTomatoes: 1,
    actualTomatoes: step === "complete-task" || step === "open-reflection" ? 1 : 0,
    tomatoSlots: step === "complete-task" || step === "open-reflection" ? [0] : [],
    completed: step === "open-reflection",
    createdAt: 0,
  }] : [];
  const visibleTasks = tutorialTask.length ? tutorialTask : (tasks ?? []);
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
              {practicing
                ? "首次练习"
                : `${visibleTasks.filter((task) => task.completed).length} / ${visibleTasks.length}`}
            </span>
          </h2>
        </div>
        {tasks ? (
          <TaskList
            key={date}
            tasks={visibleTasks}
            date={date}
            garden
            showFirstVisitGuide={practicing}
            guideStep={step}
          />
        ) : (
          <p className="empty">正在读取小事……</p>
        )}
      </section>
      <div className="garden-focus">
        <Link
          href="/focus"
          className="garden-start"
          data-guide-id="guide-open-focus"
          onClick={() => advance("open-focus", "start-timer")}
        >
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
