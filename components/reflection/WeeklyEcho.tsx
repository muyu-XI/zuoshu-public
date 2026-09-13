"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, RotateCcw } from "lucide-react";
import { db } from "@/lib/db";
import { weeklyReflectionMessages } from "@/lib/reflection-loading";
import { journalInPeriod, latestCompletedWeeklyPeriod } from "@/lib/weekly";
import type { DailyJournal, WeeklyReflectionResult } from "@/types";

function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

async function requestAndStore(
  journals: DailyJournal[],
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  const response = await fetch("/api/reflect/weekly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      periodStart,
      periodEnd,
      journals: journals.map(({ date, content }) => ({ date, content })),
    }),
  });
  const result = await response.json() as WeeklyReflectionResult & { error?: string };
  if (!response.ok) throw new Error(result.error || "每周回声暂时没有生成。");
  const generatedFromUpdatedAt = Math.max(0, ...journals.map((journal) => journal.updatedAt));
  await db.weeklyReflections.put({
    ...result,
    id: `${periodStart}:${periodEnd}`,
    generatedFromUpdatedAt,
    createdAt: Date.now(),
  });
}

export default function WeeklyEcho({ today }: { today: string }) {
  const data = useLiveQuery(async () => ({
    journals: await db.journals.orderBy("date").toArray(),
    records: await db.weeklyReflections.toArray(),
  }), [today]);
  const [generating, setGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const autoAttempt = useRef("");
  const view = useMemo(() => {
    if (!data) return null;
    const realJournals = data.journals.filter(
      (journal) => !journal.demo && journal.content.trim(),
    );
    const anchor = realJournals[0]?.date;
    const period = anchor ? latestCompletedWeeklyPeriod(anchor, today) : null;
    if (period) {
      const journals = realJournals.filter((journal) => journalInPeriod(journal, period));
      const record = data.records.find((item) =>
        !item.demo && item.periodStart === period.periodStart);
      const newestUpdate = Math.max(0, ...journals.map((journal) => journal.updatedAt));
      return {
        ...period,
        journals,
        record,
        stale: !!record && record.generatedFromUpdatedAt < newestUpdate,
        demo: false,
      };
    }
    const record = data.records.filter((item) => item.demo && item.periodEnd <= today)
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
    if (!record) return null;
    return {
      periodStart: record.periodStart,
      periodEnd: record.periodEnd,
      journals: data.journals.filter((journal) =>
        journal.demo && journalInPeriod(journal, record)),
      record,
      stale: false,
      demo: true,
    };
  }, [data, today]);

  const generate = useCallback(async (journals: DailyJournal[], periodStart: string, periodEnd: string) => {
    setGenerating(true);
    setError("");
    try {
      await requestAndStore(journals, periodStart, periodEnd);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "每周回声暂时没有生成。");
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    if (!view || view.demo || view.record || autoAttempt.current === view.periodStart) return;
    autoAttempt.current = view.periodStart;
    void requestAndStore(view.journals, view.periodStart, view.periodEnd)
      .catch((cause) => setError(
        cause instanceof Error ? cause.message : "每周回声暂时没有生成。",
      ));
  }, [view]);

  useEffect(() => {
    if (!view || view.demo || view.record) return;
    const timer = setInterval(
      () => setLoadingStep((current) =>
        (current + 1) % weeklyReflectionMessages.length),
      1800,
    );
    return () => clearInterval(timer);
  }, [view]);

  if (!view) return null;
  if (!view.record) {
    return (
      <section className="weekly-echo result-card" aria-live="polite">
        <div className="reflection-card-title"><CalendarDays size={20} /><h2>每周回声</h2></div>
        <p className="weekly-loading-message">
          {error || weeklyReflectionMessages[loadingStep]}
        </p>
        {!generating && error && (
          <button className="text-button" type="button"
            onClick={() => void generate(view.journals, view.periodStart, view.periodEnd)}>再试一次</button>
        )}
      </section>
    );
  }
  const record = view.record;
  return (
    <section className="weekly-echo result-card">
      <div className="weekly-echo-heading">
        <div className="reflection-card-title"><CalendarDays size={20} /><h2>每周回声</h2></div>
        <span>{shortDate(record.periodStart)}—{shortDate(record.periodEnd)} · 记录 {record.recordedDays}/7 天</span>
      </div>
      <p className="weekly-summary">{record.summary}</p>
      {record.moments.length > 0 && (
        <div className="weekly-section"><h3>这一程的片段</h3>
          {record.moments.map((moment) => <p key={`${moment.date}-${moment.text}`}><time>{shortDate(moment.date)}</time>{moment.text}</p>)}
        </div>
      )}
      {record.patterns.length > 0 && (
        <div className="weekly-section"><h3>反复出现的线索</h3>
          {record.patterns.map((pattern) =>
            <p className="weekly-pattern" key={pattern.text}>{pattern.text}</p>)}
        </div>
      )}
      <blockquote>{record.carryForward}</blockquote>
      {view.stale && (
        <button className="weekly-refresh" type="button" disabled={generating}
          onClick={() => void generate(view.journals, view.periodStart, view.periodEnd)}>
          <RotateCcw size={14} />日记有更新，重新生成
        </button>
      )}
    </section>
  );
}
