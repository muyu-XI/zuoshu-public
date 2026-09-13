import type { DailyJournal, WeeklyReflectionResult } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(parseDate(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function latestCompletedWeeklyPeriod(
  anchor: string,
  today: string,
): { periodStart: string; periodEnd: string } | null {
  const elapsed = Math.floor((parseDate(today) - parseDate(anchor)) / DAY_MS);
  if (!Number.isFinite(elapsed) || elapsed < 6) return null;
  const periodIndex = Math.floor((elapsed - 6) / 7);
  const periodStart = addDays(anchor, periodIndex * 7);
  return { periodStart, periodEnd: addDays(periodStart, 6) };
}

export function journalInPeriod(
  journal: Pick<DailyJournal, "date">,
  period: { periodStart: string; periodEnd: string },
): boolean {
  return journal.date >= period.periodStart && journal.date <= period.periodEnd;
}

function firstSentence(content: string): string {
  const text = content.replace(/\s+/g, " ").trim();
  const end = text.search(/[。！？!?]/);
  return (end >= 0 ? text.slice(0, end + 1) : text).slice(0, 72);
}

export function fallbackWeeklyReflection(args: {
  periodStart: string;
  periodEnd: string;
  journals: Array<Pick<DailyJournal, "date" | "content">>;
}): WeeklyReflectionResult {
  const moments = args.journals.slice(0, 3).map((journal) => ({
    date: journal.date,
    text: firstSentence(journal.content),
  }));
  const recordedDays = args.journals.length;
  return {
    schemaVersion: 1,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    recordedDays,
    summary: recordedDays
      ? `这一程留下了 ${recordedDays} 天记录。先把真实发生过的事放在这里，不急着给一周下结论。`
      : "这一程还没有留下日记。",
    moments,
    patterns: [],
    carryForward: recordedDays
      ? "下一程，继续留意哪一件事最值得你投入。"
      : "下一程，从写下一天开始。",
  };
}
