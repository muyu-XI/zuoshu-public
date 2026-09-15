import { dateKey } from "./date";

const HISTORY_SCENARIOS_VERSION = "history-scenarios-v5";
const FIRST_OPENED_DATE = "first-opened-date";
const LEGACY_TASK_GUIDE_CLEANUP = "legacy-task-guide-cleanup-v1";
const LEGACY_TASK_GUIDE = new Map([
  ["右滑以完成待办", 2],
  ["长按可以恢复代办", 1],
]);
import { newId } from "@/lib/id";
import Dexie, { type EntityTable } from "dexie";
import type {
  Task,
  TomatoSession,
  DailyJournal,
  ReflectionRecord,
  FocusState,
  WeeklyReflectionRecord,
} from "@/types";
import {
  buildDemoHistoryFixtures,
  demoHistorySeeds,
  isLegacyDemoReflection,
  mockJournal,
  reflectionTemplate,
} from "./mock-data";
import { demoHighlight } from "./reflection-theme";
import { filledSlots } from "./task-progress";
import { buildFirstUseGuideRecords } from "./first-use-guide";
import { breakDurationMs } from "./focus-timing";
export const db = new Dexie("zuoshu") as Dexie & {
  tasks: EntityTable<Task, "id">;
  tomatoes: EntityTable<TomatoSession, "id">;
  journals: EntityTable<DailyJournal, "date">;
  reflections: EntityTable<ReflectionRecord, "date">;
  weeklyReflections: EntityTable<WeeklyReflectionRecord, "periodStart">;
  settings: EntityTable<{ key: string; value: string | FocusState }, "key">;
};

function demoReflection(title: string) {
  const highlight = demoHighlight(title) ?? `今天完成了${title}`;
  return {
    ...reflectionTemplate,
    schemaVersion: 2 as const,
    summary: `完成了${title}。`,
    cards: [{
      type: "daily_highlight" as const,
      heading: "今日闪耀瞬间" as const,
      text: highlight,
      evidence: highlight,
    }],
  };
}

function demoTomatoes(task: Task, count: number, durationType: "small" | "large"):
  TomatoSession[] {
  return Array.from({ length: count }, (_, slot) => ({
    id: newId(),
    date: task.date,
    durationType,
    plannedMinutes: durationType === "small" ? 25 : 52,
    taskId: task.id,
    slot,
    completedAt: task.createdAt + 3_600_000 + slot,
    demo: true,
  }));
}

db.version(1).stores({
  tasks: "id,date,&sourceKey",
  tomatoes: "id,date,taskId",
  journals: "date",
  reflections: "date",
  settings: "key",
});
db.version(2)
  .stores({
    tasks: "id,date,&sourceKey",
    tomatoes: "id,date,taskId",
    journals: "date",
    reflections: "date",
    settings: "key",
  })
  .upgrade(async (transaction) => {
    const taskTable = transaction.table<Task, string>("tasks");
    const tomatoTable = transaction.table<TomatoSession, string>("tomatoes");
    const tasks = await taskTable.toArray();

    for (const task of tasks) {
      const sessions = await tomatoTable
        .where("taskId")
        .equals(task.id)
        .sortBy("completedAt");
      const previousSlots = filledSlots(task);
      const usedSlots: number[] = [];

      for (const [index, session] of sessions.entries()) {
        let slot = session.slot ?? previousSlots[index] ?? index;
        while (usedSlots.includes(slot)) slot++;
        usedSlots.push(slot);
        await tomatoTable.update(session.id, { slot });
      }

      await taskTable.update(task.id, {
        actualTomatoes: usedSlots.length,
        tomatoSlots: usedSlots,
      });
    }
  });
db.version(3)
  .stores({
    tasks: "id,date,&sourceKey",
    tomatoes: "id,date,taskId",
    journals: "date",
    reflections: "date",
    weeklyReflections: "periodStart,periodEnd",
    settings: "key",
  })
  .upgrade(async (transaction) => {
    const journals = transaction.table<DailyJournal, string>("journals");
    await journals.toCollection().modify((journal) => {
      if (/^今天完成了.+，(?:留下了一点清晰的进展|为接下来留出了一点空间)。$/.test(journal.content)) {
        journal.demo = true;
      }
    });
  });
db.version(4)
  .stores({
    tasks: "id,date,&sourceKey",
    tomatoes: "id,date,taskId",
    journals: "date",
    reflections: "date",
    weeklyReflections: "periodStart,periodEnd",
    settings: "key",
  })
  .upgrade(async (transaction) => {
    const taskTable = transaction.table<Task, string>("tasks");
    const tomatoTable = transaction.table<TomatoSession, string>("tomatoes");
    const journalTable = transaction.table<DailyJournal, string>("journals");
    const reflectionTable = transaction.table<ReflectionRecord, string>("reflections");
    const tasks = await taskTable.toArray();

    for (const task of tasks) {
      const seedIndex = demoHistorySeeds.findIndex((seed) => seed.title === task.title);
      if (seedIndex < 0) continue;
      const [journal, record] = await Promise.all([
        journalTable.get(task.date),
        reflectionTable.get(task.date),
      ]);
      if (
        !journal?.demo ||
        !record ||
        record.result.summary !== `完成了${task.title}。` ||
        record.context?.tasks[0]?.id !== task.id
      ) continue;

      const count = demoHistorySeeds[seedIndex].tomatoes;
      const sessions = demoTomatoes(
        task,
        count,
        seedIndex % 2 === 0 ? "small" : "large",
      );
      await tomatoTable.where("taskId").equals(task.id).delete();
      await tomatoTable.bulkAdd(sessions);
      await taskTable.update(task.id, {
        actualTomatoes: count,
        tomatoSlots: sessions.map((session) => session.slot ?? 0),
      });
      await reflectionTable.update(task.date, {
        result: demoReflection(task.title),
        context: { ...record.context, tomatoes: sessions },
        source: "mock",
      });
    }
  });
export async function initialize(date: string) {
  await db.transaction(
    "rw",
    [db.settings, db.tasks, db.tomatoes, db.journals, db.reflections,
      db.weeklyReflections],
    async () => {
    const firstOpenedDateSetting = await db.settings.get(FIRST_OPENED_DATE);
    const firstOpenedDate = typeof firstOpenedDateSetting?.value === "string"
      ? firstOpenedDateSetting.value
      : date;
    if (!firstOpenedDateSetting) {
      await db.settings.put({ key: FIRST_OPENED_DATE, value: firstOpenedDate });
    }
    if (!(await db.settings.get(LEGACY_TASK_GUIDE_CLEANUP))) {
      const candidates = (await db.tasks.where("date").equals(date).toArray())
        .filter((task) =>
          LEGACY_TASK_GUIDE.get(task.title) === task.estimatedTomatoes
          && task.actualTomatoes === 0
          && !task.sourceKey
        );
      const titles = new Set(candidates.map((task) => task.title));
      if (titles.size === LEGACY_TASK_GUIDE.size) {
        const taskIds = candidates.map((task) => task.id);
        const sessions = await db.tomatoes.where("taskId").anyOf(taskIds).count();
        if (sessions === 0) await db.tasks.bulkDelete(taskIds);
      }
      await db.settings.put({ key: LEGACY_TASK_GUIDE_CLEANUP, value: "true" });
    }

    if (!(await db.settings.get("legacy-reflection-cleanup-v1"))) {
      const reflections = await db.reflections.toArray();
      for (const record of reflections) {
        if (!isLegacyDemoReflection(record.result)) continue;
        const journal = await db.journals.get(record.date);
        await db.reflections.delete(record.date);
        if (journal?.content === mockJournal) {
          await db.journals.delete(record.date);
        }
      }
      // Re-run fixture seeding in case a legacy demo occupied one of its dates.
      await db.settings.delete(HISTORY_SCENARIOS_VERSION);
      await db.settings.put({ key: "legacy-reflection-cleanup-v1", value: "true" });
    }

    if (!(await db.settings.get(HISTORY_SCENARIOS_VERSION))) {
      const demoJournals = (await db.journals.toArray()).filter((journal) => journal.demo);
      for (const journal of demoJournals) {
        const record = await db.reflections.get(journal.date);
        if (record?.source !== "mock") continue;
        const taskIds = record.context?.tasks.map((task) => task.id) ?? [];
        if (taskIds.length) {
          await db.tomatoes.where("taskId").anyOf(taskIds).delete();
          await db.tasks.bulkDelete(taskIds);
        }
        await Promise.all([
          db.journals.delete(journal.date),
          db.reflections.delete(journal.date),
        ]);
      }

      await seedDemoHistoryFixtures(firstOpenedDate);
    }

    const tasks = await db.tasks.toArray();
    for (const task of tasks) {
      if (task.estimatedTomatoes <= 0) continue;
      const sessions = (await db.tomatoes.where("taskId").equals(task.id).toArray())
        .sort((a, b) => a.completedAt - b.completedAt);
      const slots = sessions.map((_, index) => index);
      await Promise.all([
        ...sessions.map((session, index) => db.tomatoes.update(session.id, { slot: index })),
        db.tasks.update(task.id, {
          actualTomatoes: sessions.length,
          tomatoSlots: slots,
        }),
      ]);
    }
  });
}

async function seedDemoHistoryFixtures(firstOpenedDate: string): Promise<void> {
  const fixture = buildDemoHistoryFixtures(firstOpenedDate);
  const seededDates = new Set<string>();
  for (const day of fixture.days) {
    const [tasks, tomatoes, journal, reflection] = await Promise.all([
      db.tasks.where("date").equals(day.date).count(),
      db.tomatoes.where("date").equals(day.date).count(),
      db.journals.get(day.date),
      db.reflections.get(day.date),
    ]);
    if (tasks || tomatoes || journal || reflection) continue;
    await db.tasks.bulkAdd(day.tasks);
    await db.tomatoes.bulkAdd(day.tomatoes);
    await db.journals.add(day.journal);
    await db.reflections.add(day.reflection);
    seededDates.add(day.date);
  }

  for (const setting of fixture.settings) {
    if (seededDates.has(setting.key.slice("reflection-star:".length))) {
      await db.settings.put(setting);
    }
  }
  const existingWeekly = await db.weeklyReflections.get(
    fixture.weeklyReflection.periodStart,
  );
  const hasEveryWeeklyDay = fixture.days
    .filter((day) => day.date <= fixture.weeklyReflection.periodEnd)
    .every((day) => seededDates.has(day.date));
  if (hasEveryWeeklyDay && (!existingWeekly || existingWeekly.demo)) {
    await db.weeklyReflections.put(fixture.weeklyReflection);
  }
  await db.settings.delete("history-scenarios-v1");
  await db.settings.put({ key: HISTORY_SCENARIOS_VERSION, value: "true" });
}

export async function restoreDemoHistory(): Promise<void> {
  await db.transaction(
    "rw",
    [db.settings, db.tasks, db.tomatoes, db.journals, db.reflections,
      db.weeklyReflections],
    async () => {
      const stored = await db.settings.get(FIRST_OPENED_DATE);
      const firstOpenedDate = typeof stored?.value === "string"
        ? stored.value
        : dateKey();
      await db.settings.put({ key: FIRST_OPENED_DATE, value: firstOpenedDate });
      await seedDemoHistoryFixtures(firstOpenedDate);
    },
  );
}

export async function clearAllLocalRecords(): Promise<void> {
  const storedFirstOpenedDate = await db.settings.get(FIRST_OPENED_DATE);
  await db.transaction(
    "rw",
    [db.settings, db.tasks, db.tomatoes, db.journals, db.reflections,
      db.weeklyReflections],
    async () => {
      await Promise.all([
        db.tasks.clear(),
        db.tomatoes.clear(),
        db.journals.clear(),
        db.reflections.clear(),
        db.weeklyReflections.clear(),
        db.settings.clear(),
      ]);
      await db.settings.bulkPut([
        { key: "legacy-reflection-cleanup-v1", value: "true" },
        { key: HISTORY_SCENARIOS_VERSION, value: "true" },
        ...(storedFirstOpenedDate ? [storedFirstOpenedDate] : []),
      ]);
    },
  );
}

export async function saveFirstUseGuideHistory(firstOpenedDate: string): Promise<void> {
  const { task, tomato, journal, reflection, tomorrowTask } = buildFirstUseGuideRecords(firstOpenedDate);
  await db.transaction(
    "rw",
    [db.settings, db.tasks, db.tomatoes, db.journals, db.reflections],
    async () => {
      await Promise.all([
        db.tasks.put(task),
        db.tasks.put(tomorrowTask),
        db.tomatoes.put(tomato),
        db.journals.put(journal),
        db.reflections.put(reflection),
        db.settings.put({ key: `reflection-star:${reflection.date}`, value: "true" }),
      ]);
    },
  );
}
// Maturity and allocation are separate, idempotent transactions.
export async function matureTomato() {
  await db.transaction("rw", db.tomatoes, db.settings, async () => {
    const focus = (await db.settings.get("focus"))?.value;
    if (
      !focus ||
      typeof focus === "string" ||
      focus.phase === "break" ||
      focus.endTimestamp > Date.now()
    )
      return;
    if (!(await db.tomatoes.get(focus.id))) {
      await db.tomatoes.add({
        id: focus.id,
        date: dateKey(new Date(focus.endTimestamp)),
        durationType: focus.durationType,
        plannedMinutes: focus.plannedMinutes,
        taskId: "",
        completedAt: focus.endTimestamp,
        demo: focus.demo,
      });
    }
    if (focus.phase !== "ripe")
      await db.settings.put({
        key: "focus",
        value: { ...focus, phase: "ripe" },
      });
  });
}
export async function continueAfterHarvest() {
  await matureTomato();
  await db.transaction("rw", db.settings, async () => {
    const focus = (await db.settings.get("focus"))?.value;
    if (!focus || typeof focus === "string" || focus.phase !== "ripe") return;
    if (focus.remaining > 1)
      await db.settings.put({
        key: "focus",
        value: {
          ...focus,
          phase: "break",
          remaining: focus.remaining - 1,
          endTimestamp: Date.now() + breakDurationMs(focus.demo),
        },
      });
    else await db.settings.delete("focus");
  });
}
export async function assignTomato(
  tomatoId: string,
  taskId: string,
  slot?: number,
) {
  return db.transaction("rw", db.tasks, db.tomatoes, async () => {
    const tomato = await db.tomatoes.get(tomatoId);
    if (!tomato || tomato.taskId) return undefined;
    const task = await db.tasks.get(taskId);
    if (!task) throw new Error("任务已删除，请重新选择。");
    const sessions = await db.tomatoes.where("taskId").equals(taskId).toArray();
    const slots = sessions
      .map((session) => session.slot ?? 0);
    let nextSlot =
      slot !== undefined && !slots.includes(slot)
        ? slot
        : 0;
    while (slots.includes(nextSlot)) nextSlot++;
    await db.tasks.update(taskId, {
      actualTomatoes: slots.length + 1,
      tomatoSlots: [...slots, nextSlot],
    });
    await db.tomatoes.update(tomatoId, { taskId, slot: nextSlot });
    return nextSlot;
  });
}

export async function moveTomato(
  tomatoId: string,
  targetTaskId: string,
  requestedSlot?: number,
) {
  return db.transaction("rw", db.tasks, db.tomatoes, async () => {
    const tomato = await db.tomatoes.get(tomatoId);
    if (!tomato?.taskId) throw new Error("这颗番茄已经移动，请重新查看。");
    if (tomato.taskId === targetTaskId)
      return { taskId: targetTaskId, slot: tomato.slot ?? 0 };

    const [source, target] = await Promise.all([
      db.tasks.get(tomato.taskId),
      db.tasks.get(targetTaskId),
    ]);
    if (!source || !target) throw new Error("待办已变化，请重新选择。");

    const sourceTomatoes = (
      await db.tomatoes.where("taskId").equals(source.id).toArray()
    )
      .filter((session) => session.id !== tomato.id)
      .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    const sourceSlots = sourceTomatoes.map((_, index) => index);
    const targetSlots = filledSlots(target);
    let targetSlot =
      requestedSlot !== undefined && !targetSlots.includes(requestedSlot)
        ? requestedSlot
        : 0;
    while (targetSlots.includes(targetSlot)) targetSlot++;

    await Promise.all([
      ...sourceTomatoes.map((session, index) =>
        db.tomatoes.update(session.id, { slot: index }),
      ),
      db.tasks.update(source.id, {
        actualTomatoes: sourceSlots.length,
        tomatoSlots: sourceSlots,
      }),
      db.tasks.update(target.id, {
        actualTomatoes: targetSlots.length + 1,
        tomatoSlots: [...targetSlots, targetSlot],
      }),
      db.tomatoes.update(tomatoId, {
        taskId: target.id,
        slot: targetSlot,
      }),
    ]);
    return { taskId: target.id, slot: targetSlot };
  });
}
export async function addTomorrowAction(
  date: string,
  title: string,
  sourceKey: string,
) {
  await db.transaction("rw", db.tasks, async () => {
    if (await db.tasks.where("sourceKey").equals(sourceKey).first()) return;
    await db.tasks.add({
      id: newId(),
      title,
      date,
      sourceKey,
      estimatedTomatoes: 1,
      actualTomatoes: 0,
      completed: false,
      createdAt: Date.now(),
    });
  });
}
