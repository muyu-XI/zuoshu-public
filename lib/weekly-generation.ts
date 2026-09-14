import { db } from "@/lib/db";
import { journalInPeriod, latestCompletedWeeklyPeriod } from "@/lib/weekly";
import type { WeeklyReflectionResult } from "@/types";

export async function generateWeeklyReflectionForDay(date: string): Promise<void> {
  const journals = (await db.journals.orderBy("date").toArray())
    .filter((journal) => !journal.demo && journal.content.trim());
  const anchor = journals[0]?.date;
  const period = anchor ? latestCompletedWeeklyPeriod(anchor, date) : null;
  if (!period || period.periodEnd !== date) return;

  const periodJournals = journals.filter((journal) => journalInPeriod(journal, period));
  const generatedFromUpdatedAt = Math.max(
    0,
    ...periodJournals.map((journal) => journal.updatedAt),
  );
  const existing = await db.weeklyReflections.get(period.periodStart);
  if (existing && !existing.demo && existing.generatedFromUpdatedAt >= generatedFromUpdatedAt) {
    return;
  }

  const response = await fetch("/api/reflect/weekly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...period,
      journals: periodJournals.map(({ date: journalDate, content }) => ({
        date: journalDate,
        content,
      })),
    }),
  });
  const result = await response.json() as WeeklyReflectionResult & { error?: string };
  if (!response.ok) throw new Error(result.error || "每周回声暂时没有生成。");

  await db.weeklyReflections.put({
    ...result,
    id: `${period.periodStart}:${period.periodEnd}`,
    generatedFromUpdatedAt,
    createdAt: Date.now(),
  });
}
