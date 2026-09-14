import type { Task, TomatoSession } from "@/types";

export function filledSlots(task: Task): number[] {
  return (
    task.tomatoSlots ?? Array.from({ length: task.actualTomatoes }, (_, i) => i)
  );
}

export function tomatoSlotCount(
  task: Pick<Task, "estimatedTomatoes">,
  tomatoes: Array<Pick<TomatoSession, "slot">>,
): number {
  if (task.estimatedTomatoes === 0) return tomatoes.length;
  return Math.max(
    task.estimatedTomatoes,
    ...tomatoes.map((tomato) => (tomato.slot ?? 0) + 1),
  );
}
