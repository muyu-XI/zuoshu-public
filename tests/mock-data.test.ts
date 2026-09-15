import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDemoHistoryFixtures,
  demoHistorySeeds,
  isLegacyDemoReflection,
  reflectionTemplate,
} from "../lib/mock-data";
import { orderReflectionCards } from "../lib/reflection-order";
import { reflectionTheme } from "../lib/reflection-theme";
import type { ReflectionCard } from "../types";

test("history demos cover every approved state through two days before first use", () => {
  const fixture = buildDemoHistoryFixtures("2026-09-14");
  assert.deepEqual(fixture.days.map((day) => day.date), [
    "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07",
    "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12",
  ]);
  assert.equal(fixture.days.reduce((sum, day) => sum + day.tomatoes.length, 0), 60);
  assert.ok(fixture.days.every((day) =>
    day.tasks.length > 0 && day.tomatoes.length > 0 && day.journal.content.trim() && day.reflection.result,
  ));

  const cards = fixture.days.flatMap((day) => day.reflection.result.cards ?? []);
  assert.ok(["daily_highlight", "resonance", "tomorrow_action", "past_collection"]
    .every((type) => cards.some((card) => card.type === type)));
  assert.equal(fixture.days.find((day) => day.date === "2026-09-08")?.tasks[0].sourceKey,
    "reflection:2026-09-07");
  assert.equal(fixture.days.find((day) => day.date === "2026-09-10")?.tomatoes
    .reduce((sum, tomato) => sum + tomato.plannedMinutes, 0), 204);
  assert.equal(fixture.days.find((day) => day.date === "2026-09-12")?.tasks.length, 5);
  assert.equal(fixture.days.find((day) => day.date === "2026-09-12")?.reflection.result.schemaVersion,
    undefined);
  assert.deepEqual(fixture.settings, [
    { key: "reflection-star:2026-09-12", value: "true" },
  ]);
  assert.equal(fixture.weeklyReflection.periodStart, "2026-09-03");
  assert.equal(fixture.weeklyReflection.periodEnd, "2026-09-09");
  assert.equal(fixture.weeklyReflection.recordedDays, 7);
  assert.equal(fixture.weeklyReflection.demo, true);
  assert.equal(fixture.weeklyReflection.patterns.length, 2);
});

test("recognizes only the exact legacy research-reading demo reflection", () => {
  assert.equal(isLegacyDemoReflection(reflectionTemplate), true);
  assert.equal(isLegacyDemoReflection({
    ...reflectionTemplate,
    resonance: {
      ...reflectionTemplate.resonance!,
      title: "我自己的科研回顾",
    },
  }), false);
  assert.equal(isLegacyDemoReflection(undefined), false);
});

test("history demos keep the original varied tomato totals and sticker notes", () => {
  const fixture = buildDemoHistoryFixtures("2026-09-14");

  assert.deepEqual(
    fixture.days.map((day) => day.tomatoes.length),
    demoHistorySeeds.map((seed) => seed.tomatoes),
  );
  assert.deepEqual(
    fixture.days.map((day) => reflectionTheme(
      day.reflection.result,
      day.tasks[0]?.title,
      day.reflection.source,
    )),
    demoHistorySeeds.map((seed) => seed.highlight),
  );

  for (const day of fixture.days) {
    const summaryCount = day.reflection.result.summary.match(/收获 (\d+) 颗番茄/)?.[1];
    if (summaryCount) assert.equal(Number(summaryCount), day.tomatoes.length);
    assert.equal(
      day.tasks.reduce((sum, task) => sum + task.actualTomatoes, 0),
      day.tomatoes.length,
    );
    assert.ok(day.tasks.every((task) =>
      task.actualTomatoes <= task.estimatedTomatoes
      && task.tomatoSlots?.length === task.actualTomatoes
      && day.tomatoes.filter((tomato) => tomato.taskId === task.id).length
        === task.actualTomatoes
    ));
    assert.equal(day.reflection.context?.tomatoes.length, day.tomatoes.length);
    assert.ok(day.tomatoes.every((tomato) =>
      day.tasks.some((task) => task.id === tomato.taskId)
    ));
  }

  const september12 = fixture.days.find((day) => day.date === "2026-09-12")!;
  assert.equal(september12.tomatoes.length, 9);
  assert.match(september12.journal.content, /九个番茄钟/);
  assert.equal(demoHistorySeeds.at(-1)?.highlight, "忙乱的一天，也留下了九颗番茄");
  assert.equal(september12.reflection.result.resonance?.stickerTheme,
    "忙乱的一天，也留下了九颗番茄");
});

test("history demo dates stay relative across month and year boundaries", () => {
  const fixture = buildDemoHistoryFixtures("2027-01-03");
  assert.equal(fixture.days[0].date, "2026-12-23");
  assert.equal(fixture.days.at(-1)?.date, "2027-01-01");
  assert.equal(fixture.weeklyReflection.periodStart, "2026-12-23");
  assert.equal(fixture.weeklyReflection.periodEnd, "2026-12-29");
  assert.equal(
    fixture.days[5].tasks[0].sourceKey,
    `reflection:${fixture.days[4].date}`,
  );
});

test("reflection cards follow the daily-to-action reading order without adding cards", () => {
  const source = {
    title: "来源",
    excerpt: "摘要",
    url: "https://example.com",
    materialType: "search_excerpt" as const,
    origin: "search" as const,
  };
  const cards: ReflectionCard[] = [
    { type: "tomorrow_action", friction: "难点", text: "下一步", source },
    { type: "resonance", signal: "线索", connection: "共鸣", source },
    { type: "daily_highlight", heading: "今日闪耀瞬间", text: "亮点", evidence: "证据" },
    { type: "past_collection", signal: "线索", connection: "过去", source: { ...source, origin: "favorite" } },
  ];

  assert.deepEqual(orderReflectionCards(cards).map((card) => card.type), [
    "daily_highlight",
    "past_collection",
    "resonance",
    "tomorrow_action",
  ]);
  assert.equal(cards[0].type, "tomorrow_action");
});
