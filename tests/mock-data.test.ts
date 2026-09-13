import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDemoHistoryFixtures,
  isLegacyDemoReflection,
  reflectionTemplate,
} from "../lib/mock-data";

test("history demos cover every approved state from September 3 through 12", () => {
  const fixture = buildDemoHistoryFixtures();
  assert.deepEqual(fixture.days.map((day) => day.date), [
    "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07",
    "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12",
  ]);
  assert.equal(fixture.days.reduce((sum, day) => sum + day.tomatoes.length, 0), 31);
  assert.ok(fixture.days.every((day) =>
    day.tasks.length > 0 && day.tomatoes.length > 0 && day.journal.content.trim() && day.reflection.result,
  ));

  const cards = fixture.days.flatMap((day) => day.reflection.result.cards ?? []);
  assert.ok(["daily_highlight", "resonance", "tomorrow_action", "past_collection"]
    .every((type) => cards.some((card) => card.type === type)));
  assert.equal(fixture.days.find((day) => day.date === "2026-09-08")?.tasks[0].sourceKey,
    "reflection:2026-09-07");
  assert.equal(fixture.days.find((day) => day.date === "2026-09-10")?.tomatoes
    .reduce((sum, tomato) => sum + tomato.plannedMinutes, 0), 154);
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
