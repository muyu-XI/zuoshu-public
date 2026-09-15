import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advanceFirstUseGuide,
  buildFirstUseGuideRecords,
  createFirstUseGuideState,
  parseFirstUseGuideState,
  resumeFirstUseGuideState,
} from "../lib/first-use-guide";
import { breakDurationMs, FIRST_USE_FOCUS_MS, focusDurationMs } from "../lib/focus-timing";

test("the first-use history is saved on yesterday without changing planned focus time", () => {
  const records = buildFirstUseGuideRecords("2027-01-01");
  assert.equal(records.task.date, "2026-12-31");
  assert.equal(records.tomato.date, "2026-12-31");
  assert.equal(records.tomato.plannedMinutes, 25);
  assert.equal(records.tomato.demo, true);
  assert.equal(records.task.completed, true);
  assert.equal(records.reflection.context?.date, "2026-12-31");
  assert.equal(records.tomorrowTask.date, "2027-01-01");
  assert.equal(
    records.tomorrowTask.title,
    "开始读书前，先把手机放到够不到的地方静音，先读 25 分钟",
  );
  const resonance = records.reflection.result.cards?.find((card) => card.type === "resonance");
  assert.ok(resonance?.source.fullText?.includes("距离越远，意志力消耗越少"));
  assert.equal(resonance?.source.voteCount, 62);
  assert.equal(records.tomorrowTask.completed, false);
  assert.equal(records.tomorrowTask.sourceKey, "reflection:2026-12-31");
});

test("guide transitions only advance from their expected step", () => {
  const initial = createFirstUseGuideState("2026-09-14");
  const unchanged = advanceFirstUseGuide(initial, "restore-demo", "add-task");
  assert.equal(unchanged, initial);
  const completed = advanceFirstUseGuide(initial, "complete-demo", "restore-demo");
  assert.equal(completed.step, "restore-demo");
});

test("guide persistence accepts only the current schema and known steps", () => {
  const state = createFirstUseGuideState("2026-09-14");
  assert.deepEqual(parseFirstUseGuideState(JSON.stringify(state)), state);
  assert.equal(parseFirstUseGuideState('{"version":1,"step":"complete-demo"}'), null);
  assert.equal(parseFirstUseGuideState('{"version":2,"firstOpenedDate":"2026-09-14","step":"unknown"}'), null);
});

test("the three-second tutorial timer cannot change normal focus durations", () => {
  assert.equal(FIRST_USE_FOCUS_MS, 3000);
  assert.equal(focusDurationMs("small"), 25 * 60_000);
  assert.equal(focusDurationMs("large"), 52 * 60_000);
  assert.equal(breakDurationMs(), 5 * 60_000);
});

test("a resumed tutorial focus can never wait longer than three seconds", () => {
  const now = 1_000_000;
  const resumed = resumeFirstUseGuideState({
    version: 2,
    firstOpenedDate: "2026-09-14",
    step: "focus-running",
    focusEndsAt: now + 25_000,
  }, now);
  assert.equal(resumed.focusEndsAt, now + 3_000);
});

test("the finished tutorial journal pauses for at most two seconds before its prompt", () => {
  const now = 1_000_000;
  const resumed = resumeFirstUseGuideState({
    version: 2,
    firstOpenedDate: "2026-09-14",
    step: "journal-reading",
    journalEndsAt: now + 20_000,
  }, now);
  assert.equal(resumed.journalEndsAt, now + 2_000);
});
