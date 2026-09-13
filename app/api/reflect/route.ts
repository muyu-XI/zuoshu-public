import { newId } from "@/lib/id";
import { runReflection } from "@/lib/reflect";
import {
  consumeReflectionQuota,
  type ReflectionQuota,
} from "@/lib/reflect/rate-limit";
import { ReflectError } from "@/lib/reflect/types";
import type { DailyContext, Task, TomatoSession } from "@/types";

/**
 * POST /api/reflect
 *
 * 入参：DailyContext（date / tasks / tomatoes / journal）
 * 出参：ReflectionResult（见 types/index.ts）
 *
 * 这是前端唯一需要知道的接口。Query 怎么拆、检索几次、用几个模型都属于实现细节。
 * 加 ?debug=1 会额外返回流水线轨迹，用于演示与排查，不属于对外契约。
 */

/**
 * EdgeOne 外层配置为 90 秒，内部会在 60 秒主动降级返回本地回顾。
 */
export const maxDuration = 90;
export const runtime = "nodejs";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_TASKS = 200;
const MAX_TOMATOES = 500;
const MAX_JOURNAL_CHARS = 10_000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function bad(message: string): ReflectError {
  return new ReflectError("INVALID_REQUEST", message);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** 兼容秒级 / 毫秒级时间戳与 ISO 字符串。 */
function asTimestamp(value: unknown, fallback: number): number {
  const direct = asNumber(value);
  if (direct !== null) return direct < 1e12 ? direct * 1000 : direct;
  const text = asString(value);
  if (text) {
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function normalizeTasks(value: unknown, date: string): Task[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw bad("tasks 必须是数组。");
  if (value.length > MAX_TASKS) {
    throw bad(`tasks 最多 ${MAX_TASKS} 条。`);
  }
  const now = Date.now();
  return value.map((entry, index) => {
    const record = asRecord(entry);
    if (!record) throw bad(`tasks[${index}] 必须是对象。`);
    const title = asString(record.title)?.trim();
    if (!title) throw bad(`tasks[${index}].title 不能为空。`);
    // 旧版文档里的 tomatoes 字段与实际的 actualTomatoes 等价，这里一并接受。
    const actual =
      asNumber(record.actualTomatoes) ?? asNumber(record.tomatoes) ?? 0;
    return {
      id: asString(record.id) ?? newId(),
      title,
      date: asString(record.date) ?? date,
      estimatedTomatoes: Math.max(0, asNumber(record.estimatedTomatoes) ?? 0),
      actualTomatoes: Math.max(0, actual),
      completed: record.completed === true,
      createdAt: asTimestamp(record.createdAt, now + index),
      ...(asString(record.sourceKey)
        ? { sourceKey: asString(record.sourceKey) ?? undefined }
        : {}),
    };
  });
}

function normalizeTomatoes(value: unknown, date: string): TomatoSession[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw bad("tomatoes 必须是数组。");
  if (value.length > MAX_TOMATOES) {
    throw bad(`tomatoes 最多 ${MAX_TOMATOES} 条。`);
  }
  const now = Date.now();
  return value.map((entry, index) => {
    const record = asRecord(entry);
    if (!record) throw bad(`tomatoes[${index}] 必须是对象。`);
    const durationType = record.durationType === "large" ? "large" : "small";
    const planned =
      asNumber(record.plannedMinutes) ?? asNumber(record.durationMinutes) ?? 25;
    return {
      id: asString(record.id) ?? newId(),
      date: asString(record.date) ?? date,
      durationType,
      plannedMinutes: Math.max(0, planned),
      taskId: asString(record.taskId) ?? "",
      completedAt: asTimestamp(record.completedAt, now + index),
      demo: record.demo === true,
    };
  });
}

function normalizeContext(payload: unknown): DailyContext {
  const record = asRecord(payload);
  if (!record) throw bad("请求体必须是 JSON 对象。");

  const date = asString(record.date)?.trim();
  if (!date || !DATE_PATTERN.test(date)) {
    throw bad("date 必须存在且形如 YYYY-MM-DD。");
  }

  const journal = asString(record.journal);
  if (journal === null) throw bad("journal 必须是字符串。");
  if (journal.length > MAX_JOURNAL_CHARS) {
    throw bad(`journal 最多 ${MAX_JOURNAL_CHARS} 字。`);
  }
  if (journal.trim().length === 0) {
    throw bad("journal 不能为空，没有内容就无法做回顾。");
  }

  return {
    date,
    tasks: normalizeTasks(record.tasks, date),
    tomatoes: normalizeTomatoes(record.tomatoes, date),
    journal,
    ...(Array.isArray(record.excludedFavoriteUrls)
      ? {
          excludedFavoriteUrls: record.excludedFavoriteUrls
            .filter((item): item is string => typeof item === "string")
            .slice(0, 20),
        }
      : {}),
  };
}

function quotaHeaders(quota: ReflectionQuota): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(quota.limit),
    "X-RateLimit-Remaining": String(quota.remaining),
    "X-RateLimit-Reset": quota.resetAt,
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ReflectError) {
    return jsonResponse({ error: error.message, code: error.code }, error.status);
  }
  return jsonResponse(
    { error: "生成回顾时发生未预期的错误。", code: "UPSTREAM_ERROR" },
    500,
  );
}

export async function POST(request: Request): Promise<Response> {
  let raw = "";
  try {
    const reader = request.body?.getReader();
    if (!reader) throw bad("请求体不能为空。");
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          await reader.cancel();
          throw bad("请求体过大。");
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
  } catch (error) {
    return errorResponse(error instanceof ReflectError ? error : bad("无法读取请求体。"));
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return errorResponse(bad("请求体不是合法 JSON。"));
  }

  let context: DailyContext;
  try {
    context = normalizeContext(payload);
  } catch (error) {
    return errorResponse(error);
  }

  const quota = consumeReflectionQuota(request);
  if (!quota.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((Date.parse(quota.resetAt) - Date.now()) / 1_000),
    );
    return jsonResponse(
      {
        error: `今天的回顾次数已用完，每台设备每天最多 ${quota.limit} 次，请明天再试。`,
        code: "DAILY_LIMIT",
        limit: quota.limit,
        remaining: quota.remaining,
        resetAt: quota.resetAt,
      },
      429,
      { ...quotaHeaders(quota), "Retry-After": String(retryAfter) },
    );
  }

  const debug = process.env.NODE_ENV !== "production" && new URL(request.url).searchParams.get("debug") === "1";

  try {
    const outcome = await runReflection(context, {
      signal: request.signal,
      request,
    });
    return jsonResponse(
      debug
        ? { result: outcome.result, trace: outcome.trace }
        : outcome.result,
      200,
      quotaHeaders(quota),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      error: "请使用 POST 调用本接口。",
      code: "INVALID_REQUEST",
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Allow: "POST",
      },
    },
  );
}
