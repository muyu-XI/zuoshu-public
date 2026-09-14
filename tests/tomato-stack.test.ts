import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import "fake-indexeddb/auto";
import { assignTomato, db, initialize } from "../lib/db";
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
