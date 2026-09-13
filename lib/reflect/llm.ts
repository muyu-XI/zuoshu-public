/**
 * 极简的 OpenAI 兼容 Chat Completions 客户端。
 *
 * 流水线里只有「需要判断/写作」的四个阶段会用到模型：信号挖掘、Query 拆解、
 * 相关性打分、最终合写。任何一次调用失败都不抛出，而是返回 null，让调用方
 * 退回确定性启发式实现——回顾接口不应该因为模型抖动而整体失败。
 *
 * 通过环境变量配置，因此可以对接任意 OpenAI 兼容服务：
 *   REFLECT_LLM_BASE_URL   例如 https://api.deepseek.com/v1
 *   REFLECT_LLM_API_KEY
 *   REFLECT_LLM_MODEL      例如 deepseek-chat
 */

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

/**
 * 单次模型调用的超时。
 *
 * 不要把这里调小：实测该模型即便只回 15 个 token 也要 7.1s，且波动很大，
 * 20s 会把信号挖掘这种 prompt 较长的调用直接掐断，导致那一阶段静默降级。
 */
const DEFAULT_TIMEOUT_MS = Math.max(
  5_000,
  Number(process.env.REFLECT_LLM_TIMEOUT_MS ?? 45_000),
);

export function llmConfig(): LlmConfig | null {
  const baseUrl = (process.env.REFLECT_LLM_BASE_URL || process.env.LLM_BASE_URL)?.trim();
  const apiKey = (process.env.REFLECT_LLM_API_KEY || process.env.LLM_API_KEY)?.trim();
  const model = (process.env.REFLECT_LLM_MODEL || process.env.LLM_MODEL)?.trim();
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

export function llmEnabled(): boolean {
  return llmConfig() !== null;
}

/** 最近一次模型调用的失败原因；任意一次成功都会把它清空。 */
let lastFailure: string | null = null;

export function llmLastFailure(): string | null {
  return lastFailure;
}

/**
 * 统一的降级说明。
 *
 * 必须区分「没配模型」和「配了但调用失败」：如果 key 写错却告诉用户
 * 「未配置模型」，排查方向会被完全带偏——这是静默降级的典型坑。
 */
export function llmDegradeNote(stage: string): string {
  if (!llmEnabled()) return `未配置模型，${stage}使用本地规则。`;
  return `模型调用失败（${lastFailure ?? "原因未知"}），${stage}改用本地规则。`;
}


/** 从模型输出里抽出第一个 JSON 对象，容忍 ```json 围栏和前后废话。 */
export function extractJsonObject(raw: string): unknown {
  const text = raw.trim();
  if (!text) return null;
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const candidates = [withoutFence, text];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 继续尝试截取花括号区间。
    }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // 放弃这一种截取方式。
      }
    }
  }
  return null;
}

type ChatChoice = { message?: { content?: unknown } };
type ChatResponse = { choices?: ChatChoice[] };

function readContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as ChatResponse).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const content = choices[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

async function postChat(
  config: LlmConfig,
  system: string,
  user: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  useJsonMode: boolean,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    const body = await response.text();
    return new Response(body, { status: response.status, headers: response.headers });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * 要求模型返回一个 JSON 对象。失败时返回 null，绝不抛出。
 */
export async function llmJson<T>(options: {
  system: string;
  user: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<T | null> {
  const config = llmConfig();
  if (!config) return null;
  // 已经超时就不要再发请求了。
  // 注意 addEventListener("abort") 对「已经处于 aborted 状态」的 signal 不会触发，
  // 少了这句检查就会出现「总超时之后仍在继续干活」：前面的阶段被掐断降级，
  // 后面的阶段却照跑，最终既慢又半途降级。
  if (options.signal?.aborted) {
    lastFailure = "请求被中止";
    return null;
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (const useJsonMode of [true, false]) {
    if (options.signal?.aborted) {
      lastFailure = "请求被中止";
      return null;
    }
    try {
      const response = await postChat(
        config,
        options.system,
        options.user,
        timeoutMs,
        options.signal,
        useJsonMode,
      );
      if (!response.ok) {
        lastFailure = `HTTP ${response.status}`;
        // 只有「大概是不认 response_format」才值得去掉它再试一次；
        // 401 / 403 / 429 这类重试没有任何意义，只会白等一轮。
        if (useJsonMode && (response.status === 400 || response.status === 422)) {
          continue;
        }
        return null;
      }
      const payload: unknown = await response.json();
      const content = readContent(payload);
      if (content === null) {
        lastFailure = "响应里没有 choices[0].message.content";
        return null;
      }
      const parsed = extractJsonObject(content);
      if (parsed === null) {
        lastFailure = "模型返回的内容不是合法 JSON";
        return null;
      }
      lastFailure = null;
      return parsed as T;
    } catch (error) {
      // 网络错误、超时、JSON 解析失败都走降级路径，但要把原因留下来。
      lastFailure = options.signal?.aborted
        ? "请求被中止"
        : `请求异常：${error instanceof Error ? error.message : "未知错误"}`;
      return null;
    }
  }
  return null;
}
