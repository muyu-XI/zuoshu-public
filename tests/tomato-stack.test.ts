import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import "fake-indexeddb/auto";
import {
  assignTomato,
  clearAllLocalRecords,
  db,
  initialize,
  restoreDemoHistory,
  saveFirstUseGuideHistory,
} from "../lib/db";
import { tomatoSlotCount } from "../lib/task-progress";
import type { Task, TomatoSession } from "../types";

const date = "2099-01-01";

function task(): Task {
  return {
    id: "task",
    title: "测试堆叠",
    date,
    estimatedTomatoes: 2,
    actualTomatoes: 2,
    tomatoSlots: [0, 1],
    completed: false,
    createdAt: 1,
  };
}

function tomato(id: string, taskId: string, slot?: number): TomatoSession {
  return {
    id,
    date,
    durationType: "small",
    plannedMinutes: 25,
    taskId,
    slot,
    completedAt: Number(id.replace("tomato-", "")),
    demo: false,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

after(async () => {
  await db.delete();
});

test("assigns a mature tomato beyond the estimate", async () => {
  await db.tasks.add(task());
  await db.tomatoes.bulkAdd([
    tomato("tomato-1", "task", 0),
    tomato("tomato-2", "task", 1),
    tomato("tomato-3", ""),
  ]);

  assert.equal(await assignTomato("tomato-3", "task"), 2);
  assert.deepEqual(await db.tasks.get("task"), {
    ...task(),
    actualTomatoes: 3,
    tomatoSlots: [0, 1, 2],
  });
  assert.equal((await db.tomatoes.get("tomato-3"))?.taskId, "task");
});

test("renders slots beyond the estimate so they can overlap", () => {
  assert.equal(
    tomatoSlotCount(task(), [
      tomato("tomato-1", "task", 0),
      tomato("tomato-2", "task", 1),
      tomato("tomato-3", "task", 2),
    ]),
    3,
  );
});

test("initialization preserves tomatoes beyond the estimate", async () => {
  await db.tasks.add({
    ...task(),
    actualTomatoes: 3,
    tomatoSlots: [0, 1, 2],
  });
  await db.tomatoes.bulkAdd([
    tomato("tomato-1", "task", 0),
    tomato("tomato-2", "task", 1),
    tomato("tomato-3", "task", 2),
  ]);

  await initialize(date);

  assert.equal(await db.tomatoes.where("taskId").equals("task").count(), 3);
  assert.deepEqual(await db.tasks.get("task"), {
    ...task(),
    actualTomatoes: 3,
    tomatoSlots: [0, 1, 2],
  });
});

test("restores demo history after local records were cleared", async () => {
  await clearAllLocalRecords();
  await initialize(date);
  assert.equal(await db.journals.count(), 0);

  await restoreDemoHistory();

  assert.equal(
    (await db.journals.toArray()).filter((journal) => journal.demo).length,
    10,
  );
  assert.equal(await db.tomatoes.count(), 60);
  assert.equal(await db.weeklyReflections.count(), 1);
});

test("restoring demos does not overwrite a real record on a demo date", async () => {
  await clearAllLocalRecords();
  await db.tasks.add({
    ...task(),
    id: "real-task",
    title: "真实记录",
    date: "2026-09-03",
  });

  await restoreDemoHistory();

  assert.equal(await db.tasks.where("date").equals("2026-09-03").count(), 1);
  assert.equal((await db.tasks.get("real-task"))?.title, "真实记录");
  assert.equal(await db.journals.get("2026-09-03"), undefined);
});

test("finishing the guide saves yesterday and carries one concrete action into today", async () => {
  await saveFirstUseGuideHistory("2099-01-01");

  const yesterdayTasks = await db.tasks.where("date").equals("2098-12-31").toArray();
  const todayTasks = await db.tasks.where("date").equals("2099-01-01").toArray();
  assert.equal(yesterdayTasks.length, 1);
  assert.equal(yesterdayTasks[0].completed, true);
  assert.equal(await db.tomatoes.where("date").equals("2098-12-31").count(), 1);
  assert.equal((await db.settings.get("reflection-star:2098-12-31"))?.value, "true");
  assert.equal(todayTasks.length, 1);
  assert.equal(todayTasks[0].title, "开始读书前，先把手机放到够不到的地方静音，先读 25 分钟");
  assert.equal(todayTasks[0].completed, false);
});
