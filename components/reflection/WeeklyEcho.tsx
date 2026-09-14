"use client";
import { CalendarDays } from "lucide-react";
import type { WeeklyReflectionRecord } from "@/types";

function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export default function WeeklyEcho({ record }: { record: WeeklyReflectionRecord }) {
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
    </section>
  );
}
