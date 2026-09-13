import type { Task } from "@/types";

export function filledSlots(task: Task): number[] {
  return (
    task.tomatoSlots ?? Array.from({ length: task.actualTomatoes }, (_, i) => i)
  );
}
