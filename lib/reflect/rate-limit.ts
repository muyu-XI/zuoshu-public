import { createHash } from "node:crypto";

type Bucket = { day: string; count: number };

export type ReflectionQuota = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
};

const DEVICE_ID_PATTERN = /^[a-f0-9]{32}$/i;
const buckets = new Map<string, Bucket>();

function dailyLimit(): number {
  const configured = Number(process.env.REFLECT_DAILY_LIMIT ?? 10);
  if (!Number.isFinite(configured) || configured < 1) return 10;
  return Math.min(1_000, Math.floor(configured));
}

/** Beijing has no daylight-saving changes, so a fixed UTC+8 day is sufficient. */
function beijingWindow(now: number): { day: string; resetAt: string } {
  const day = new Date(now + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  const resetAt = new Date(Date.parse(`${day}T16:00:00.000Z`)).toISOString();
  return { day, resetAt };
}

function firstForwardedIp(request: Request): string {
  const explicit =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0];
  return explicit?.trim().slice(0, 128) || "unknown";
}

function clientKey(request: Request): string {
  const deviceId = request.headers.get("x-zuoshu-client-id")?.trim();
  const identity =
    deviceId && DEVICE_ID_PATTERN.test(deviceId)
      ? `device:${deviceId.toLowerCase()}`
      : [
          "fallback",
          firstForwardedIp(request),
          request.headers.get("user-agent")?.slice(0, 256) ?? "unknown",
          request.headers.get("accept-language")?.slice(0, 64) ?? "unknown",
        ].join(":");
  return createHash("sha256").update(identity).digest("hex");
}

/**
 * Consume one generation attempt before any paid upstream work starts.
 *
 * This process-local store is reliable for one long-running Next.js instance.
 * Multi-instance or serverless deployments need a shared atomic store such as Redis.
 */
export function consumeReflectionQuota(
  request: Request,
  now = Date.now(),
): ReflectionQuota {
  const limit = dailyLimit();
  const { day, resetAt } = beijingWindow(now);
  const key = clientKey(request);
  const previous = buckets.get(key);
  const count = previous?.day === day ? previous.count : 0;

  if (count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt };
  }

  buckets.set(key, { day, count: count + 1 });
  if (buckets.size > 5_000) {
    for (const [storedKey, bucket] of buckets) {
      if (bucket.day !== day) buckets.delete(storedKey);
    }
  }

  return {
    allowed: true,
    limit,
    remaining: limit - count - 1,
    resetAt,
  };
}

export function clearReflectionQuotaForTests(): void {
  buckets.clear();
}
