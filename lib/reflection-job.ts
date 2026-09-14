"use client";

import { useSyncExternalStore } from "react";
import { db } from "@/lib/db";
import { requestReflection } from "@/lib/reflect-client";
import { generateWeeklyReflectionForDay } from "@/lib/weekly-generation";
import type { DailyContext } from "@/types";

type ReflectionJobState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "complete" }
  | { status: "error"; error: string };

const idle: ReflectionJobState = { status: "idle" };
const jobs = new Map<string, ReflectionJobState>();
const running = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function publish(date: string, state: ReflectionJobState): void {
  jobs.set(date, state);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(date: string): ReflectionJobState {
  return jobs.get(date) ?? idle;
}

export function useReflectionJob(date: string): ReflectionJobState {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(date),
    () => idle,
  );
}

/**
 * 任务由模块持有，而不是由回顾页组件持有。Next 页面切换时组件可以卸载，
 * 但同一浏览器标签页里的请求和 IndexedDB 写入仍会继续。
 */
export function startReflectionJob(context: DailyContext): Promise<void> {
  const existing = running.get(context.date);
  if (existing) return existing;

  publish(context.date, { status: "running" });
  const job = requestReflection(context)
    .then(async (result) => {
      await db.reflections.put({
        date: context.date,
        result,
        source: "zhihu",
        context,
        createdAt: Date.now(),
      });
      await generateWeeklyReflectionForDay(context.date).catch(() => undefined);
      publish(context.date, { status: "complete" });
    })
    .catch((cause) => {
      const message = cause instanceof Error
        ? cause.message
        : "这次整理没有完成，日记仍在这里，请重试。";
      publish(context.date, { status: "error", error: message });
      throw cause;
    })
    .finally(() => {
      running.delete(context.date);
    });
  running.set(context.date, job);
  return job;
}
