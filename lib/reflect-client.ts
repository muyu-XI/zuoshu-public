import type { DailyContext, ReflectionResult } from "@/types";
import { newId } from "@/lib/id";

const CLIENT_ID_KEY = "zuoshu-reflection-client-id";

function reflectionClientId(): string | null {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const created = newId();
    localStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return null;
  }
}

export async function requestReflection(context: DailyContext): Promise<ReflectionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);
  try {
    let response: Response;
    try {
      const clientId = reflectionClientId();
      response = await fetch("/api/reflect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clientId ? { "X-Zuoshu-Client-ID": clientId } : {}),
        },
        body: JSON.stringify(context),
        signal: controller.signal,
      });
    } catch {
      throw new Error("回顾服务连接失败或超时，日记已保留，请重试。");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof body?.error === "string" ? body.error : "回顾服务暂时不可用，请重试。");
    }
    const v2 = body?.schemaVersion === 2 && Array.isArray(body?.cards);
    const legacy = typeof body?.resonance?.title === "string" &&
      typeof body?.resonance?.excerpt === "string" &&
      typeof body?.resonance?.url === "string" &&
      typeof body?.improvement?.tomorrowAction === "string" &&
      typeof body?.improvement?.sourceUrl === "string";
    if (!body || typeof body.summary !== "string" || !Array.isArray(body.achievements) ||
        (!v2 && !legacy)) {
      throw new Error("回顾服务返回的数据不完整，日记已保留，请重试。");
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}
