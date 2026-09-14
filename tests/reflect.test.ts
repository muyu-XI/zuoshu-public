import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POST, GET } from "../app/api/reflect/route";
import { runReflection } from "../lib/reflect";
import { searchZhihu } from "../lib/reflect/zhihu";
import { requestReflection } from "../lib/reflect-client";
import { synthesize } from "../lib/reflect/synthesize";
import { selectPassages } from "../lib/reflect/passages";
import { mineSignals } from "../lib/reflect/signals";
import { latestCompletedWeeklyPeriod } from "../lib/weekly";
import { POST as weeklyPOST } from "../app/api/reflect/weekly/route";
import { GET as oauthCallbackGET } from "../app/api/zhihu/auth/callback/route";
import { composeReflection } from "../lib/reflect/compose";
import { openSession, sealSession } from "../lib/zhihu-oauth";
import { demoHistorySeeds, reflectionTemplate } from "../lib/mock-data";
import { reflectionTheme } from "../lib/reflection-theme";
import {
  dailyReflectionMessages,
  weeklyReflectionMessages,
} from "../lib/reflection-loading";
import {
  clearReflectionQuotaForTests,
  consumeReflectionQuota,
} from "../lib/reflect/rate-limit";
import type { ScoredCandidate, Signal } from "../lib/reflect/types";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const context = { date: "2026-09-12", tasks: [], tomatoes: [], journal: "今天读论文很慢，看不懂方法，感到焦虑，想知道怎样提高阅读效率。" };
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  clearReflectionQuotaForTests();
});

test("daily pipeline uses at most two model calls and cleaned text reaches evidence selection", async () => {
  configure();
  process.env.REFLECT_LLM_BASE_URL = "https://test.invalid/v1";
  process.env.REFLECT_LLM_API_KEY = "test";
  process.env.REFLECT_LLM_MODEL = "test";
  const journal = "啊，怎么说呢，demo 很容易实现，很容易实现，燃起来了。G 一还没看完，Scaling Low 也不确定。晚上认识了朋友，事情太多让我烦躁。";
  const cleanedJournal = "demo 很容易实现，感到兴奋。G 一还没看完，Scaling Low 也不确定。晚上认识了朋友，事情太多让我烦躁。";
  const input = { ...context, journal };
  const prompts: string[] = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/quota")) return Response.json({ Data: [{ RemainingQuota: 1 }] });
    if (!String(url).includes("chat/completions")) return Response.json({ Code: 0, Data: { Items: [item] } });
    const prompt = JSON.parse(String(options?.body)).messages[1].content as string;
    prompts.push(prompt);
    const payload = prompts.length === 1 ? {
      cleanedJournal,
      signals: [{ kind: "friction", text: "事情太多带来烦躁", evidence: "事情太多让我烦躁", weight: 0.8, searchWorthy: true, unresolved: true, wantsHelp: true }],
    } : {};
    return Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] });
  };
  const result = await runReflection(input);
  assert.equal(prompts.length, 2);
  assert.ok(prompts[0].includes(journal));
  for (const prompt of prompts.slice(1)) {
    assert.ok(prompt.includes(cleanedJournal));
    assert.ok(!prompt.includes("啊，怎么说呢"));
  }
  assert.equal(result.trace.signals[0].evidence, "事情太多让我烦躁");
  assert.equal(input.journal, journal);
});

test("missing or invalid cleanup falls back to original and fabricated evidence is discarded", async () => {
  configure();
  process.env.REFLECT_LLM_BASE_URL = "https://test.invalid/v1";
  process.env.REFLECT_LLM_API_KEY = "test";
  process.env.REFLECT_LLM_MODEL = "test";
  for (const cleanedJournal of [undefined, null, "   ", 42, "字".repeat(10001)]) {
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({
      cleanedJournal, signals: [{ kind: "friction", text: "伪造信号", evidence: "原文没有这个事实", weight: 1 }],
    }) } }] });
    const result = await mineSignals(context, new AbortController().signal);
    assert.equal(result.cleanedJournal, context.journal);
    assert.ok(result.signals.every(signal => signal.evidence !== "原文没有这个事实"));
  }
  globalThis.fetch = async () => { throw new Error("offline"); };
  assert.equal((await mineSignals(context, new AbortController().signal)).cleanedJournal, context.journal);
});

test("model-approved friction triggers experience and tomorrow cards without local keyword veto", async () => {
  configure();
  process.env.REFLECT_LLM_BASE_URL = "https://test.invalid/v1";
  process.env.REFLECT_LLM_API_KEY = "test";
  process.env.REFLECT_LLM_MODEL = "test";

  for (const journal of ["健身没效果", "学习学不动"]) {
    let modelCalls = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes("/quota")) {
        return Response.json({ Data: [{ RemainingQuota: 10 }] });
      }
      if (String(url).includes("chat/completions")) {
        modelCalls++;
        const payload = modelCalls === 1 ? {
          cleanedJournal: journal,
          signals: [{
            kind: "friction",
            text: journal,
            evidence: journal,
            weight: 0.9,
            searchWorthy: true,
            unresolved: true,
            wantsHelp: true,
          }],
          highlight: {
            heading: "今天留下的话",
            text: "先看清这个卡点。",
            evidence: journal,
          },
        } : {
          resonanceIndex: 1,
          resonanceConnection: "这段经历回应了今天遇到的阻碍。",
          actionIndex: 1,
          actionText: "明天先尝试一个最小步骤",
          actionFriction: journal,
        };
        return Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] });
      }
      return Response.json({ Code: 0, Data: { Items: [item] } });
    };

    const outcome = await runReflection({ ...context, journal });
    assert.equal(outcome.trace.signals[0]?.searchWorthy, true, journal);
    assert.ok(outcome.result.cards?.some((card) => card.type === "resonance"), journal);
    assert.ok(outcome.result.cards?.some((card) => card.type === "tomorrow_action"), journal);
  }
});

test("Zhihu OAuth callback rejects missing or mismatched state before token exchange", async () => {
  process.env.ZHIHU_OAUTH_APP_ID = "200";
  process.env.ZHIHU_OAUTH_APP_KEY = "test-key";
  process.env.ZHIHU_OAUTH_COOKIE_SECRET = "test-cookie-secret";
  process.env.ZHIHU_OAUTH_REDIRECT_URI = "https://example.com/api/zhihu/auth/callback";
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    return Response.json({ access_token: "token", expires_in: 3600 });
  };

  for (const query of ["authorization_code=code", "authorization_code=code&state=wrong"]) {
    const response = await oauthCallbackGET(new Request(
      `https://example.com/api/zhihu/auth/callback?${query}`,
      { headers: { cookie: "zuoshu-zhihu-state=expected" } },
    ));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://example.com/reflection?zhihu=failed");
  }
  assert.equal(fetchCalls, 0);
});

test("Zhihu OAuth callback verifies the authorized user before creating a session", async () => {
  process.env.ZHIHU_OAUTH_APP_ID = "200";
  process.env.ZHIHU_OAUTH_APP_KEY = "test-key";
  process.env.ZHIHU_OAUTH_COOKIE_SECRET = "test-cookie-secret";
  process.env.ZHIHU_OAUTH_REDIRECT_URI = "https://example.com/api/zhihu/auth/callback";
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push(String(input));
    if (String(input).endsWith("/access_token")) {
      assert.match(String(init?.body), /code=code/);
      return Response.json({ access_token: "oauth-token", expires_in: 3600 });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer oauth-token");
    return Response.json({ code: 20000, data: { hash_id: "authorized-user", fullname: "测试用户" } });
  };

  const response = await oauthCallbackGET(new Request(
    "https://example.com/api/zhihu/auth/callback?authorization_code=code&state=expected",
    { headers: { cookie: "zuoshu-zhihu-state=expected" } },
  ));
  assert.deepEqual(requests, [
    "https://openapi.zhihu.com/access_token",
    "https://openapi.zhihu.com/user",
  ]);
  assert.equal(response.headers.get("location"), "https://example.com/reflection?zhihu=connected");
  assert.match(response.headers.get("set-cookie") ?? "", /zuoshu-zhihu-session=/);
});

test("difficulty with no motivation asks for experience and a next step", async () => {
  configure();
  process.env.REFLECT_LLM_BASE_URL = "https://test.invalid/v1";
  process.env.REFLECT_LLM_API_KEY = "test";
  process.env.REFLECT_LLM_MODEL = "test";
  const journal = "学习好难没动力";
  let modelCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/quota")) {
      return Response.json({ Data: [{ RemainingQuota: 10 }] });
    }
    if (String(url).includes("chat/completions")) {
      modelCalls++;
      const payload = modelCalls === 1
        ? {
            cleanedJournal: journal,
            signals: [{
              kind: "friction",
              text: "学习缺少动力",
              evidence: journal,
              weight: 0.9,
              searchWorthy: true,
              unresolved: true,
              wantsHelp: true,
            }],
            highlight: {
              heading: "今天留下的话",
              text: `你把「${journal}」留在了今天。`,
              evidence: journal,
            },
          }
        : {
            resonanceIndex: 1,
            resonanceConnection: "这段经历回应了学习困难和缺少动力的处境。",
            actionIndex: 1,
            actionText: "明天先学习十分钟，只完成一个最小任务",
            actionFriction: "学习缺少动力",
          };
      return Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] });
    }
    return Response.json({ Code: 0, Data: { Items: [{
      Title: "学习没有动力时，如何重新开始",
      Url: "https://www.zhihu.com/question/123/answer/789",
      ContentText: "我也经历过学不动的时候。先把目标缩小到十分钟，只完成一个最小任务。",
      AuthorName: "测试作者",
      VoteUpCount: 30,
    }] } });
  };

  const outcome = await runReflection({ ...context, journal });
  const friction = outcome.trace.signals.find((signal) => signal.kind === "friction");
  assert.ok(friction);
  assert.equal(friction.searchWorthy, true);
  assert.equal(friction.wantsHelp, true);
  assert.ok(outcome.trace.queries.some((query) => query.text.includes("没动力")));
  assert.ok(outcome.result.cards?.some((card) => card.type === "resonance"));
  assert.ok(outcome.result.cards?.some((card) => card.type === "tomorrow_action"));
});

test("a negative daily note is comforted instead of mechanically repeated", async () => {
  configure();
  process.env.REFLECT_LLM_BASE_URL = "https://test.invalid/v1";
  process.env.REFLECT_LLM_API_KEY = "test";
  process.env.REFLECT_LLM_MODEL = "test";
  const journal = "学习好难没动力";
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({
    cleanedJournal: journal,
    signals: [{
      kind: "friction",
      text: "学习缺少动力",
      evidence: journal,
      weight: 0.9,
      searchWorthy: true,
      unresolved: true,
      wantsHelp: false,
    }],
    highlight: {
      heading: "今天留下的话",
      text: `你把「${journal}」留在了今天。`,
      evidence: journal,
    },
  }) } }] });

  const result = await mineSignals(
    { ...context, journal },
    new AbortController().signal,
  );
  assert.doesNotMatch(result.moment.text, /^你把「.*」留在了今天。$/);
  assert.match(result.moment.text, /没关系|不必|允许|慢一点|先休息|已经/);
});

test("loading copy follows the reflection type without claiming weekly Zhihu work", () => {
  const support = dailyReflectionMessages("学习好难没动力");
  const highlight = dailyReflectionMessages("今天学会了无人机叶片建模");
  assert.ok(support.some((message) => message.includes("相似道路")));
  assert.ok(support.some((message) => message.includes("明天")));
  assert.ok(highlight.some((message) => message.includes("闪耀")));
  assert.ok(weeklyReflectionMessages.every((message) => !message.includes("知乎")));
  assert.ok(weeklyReflectionMessages.every((message) => !message.includes("经验")));
});
function configure() {
  process.env.ZHIHU_ACCESS_SECRET = "test-only";
  for (const key of ["REFLECT_LLM_API_KEY", "LLM_API_KEY"]) delete process.env[key];
}
const item = { Title: "读论文的方法", Url: "https://www.zhihu.com/question/123/answer/456", ContentText: "<em>读论文</em>先看摘要，明确问题。\n\n再看方法与实验，遇到不懂的内容先记下来。", AuthorName: "测试作者", VoteUpCount: 20 };
function request(body: unknown) { return new Request("http://localhost/api/reflect", { method: "POST", body: JSON.stringify(body) }); }

test("invalid inputs and method have structured errors", async () => {
  assert.equal((await GET()).status, 405);
  for (const body of [{}, { ...context, journal: "" }, { ...context, tasks: "bad" }]) {
    const response = await POST(request(body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_REQUEST");
  }
  const broken = await POST(new Request("http://localhost/api/reflect", { method: "POST", body: "{" }));
  assert.equal(broken.status, 400);
});
test("body limit counts UTF-8 bytes and stream failures are JSON", async () => {
  const response = await POST(request({ ...context, extra: "中".repeat(100_000) }));
  assert.match((await response.json()).error, /过大/);
  const body = new ReadableStream({ start(controller) { controller.error(new Error("broken")); } });
  const broken = await POST(new Request("http://localhost/api/reflect", { method: "POST", body, duplex: "half" } as RequestInit));
  assert.equal(broken.status, 400);
});
test("daily reflection quota is per anonymous device and resets on Beijing midnight", async () => {
  process.env.REFLECT_DAILY_LIMIT = "2";
  const a = new Request("http://localhost/api/reflect", {
    headers: { "X-Zuoshu-Client-ID": "a".repeat(32) },
  });
  const b = new Request("http://localhost/api/reflect", {
    headers: { "X-Zuoshu-Client-ID": "b".repeat(32) },
  });
  const beforeMidnight = Date.parse("2026-09-13T15:59:00.000Z");
  assert.deepEqual(consumeReflectionQuota(a, beforeMidnight), {
    allowed: true,
    limit: 2,
    remaining: 1,
    resetAt: "2026-09-13T16:00:00.000Z",
  });
  assert.equal(consumeReflectionQuota(a, beforeMidnight).allowed, true);
  assert.equal(consumeReflectionQuota(a, beforeMidnight).allowed, false);
  assert.equal(consumeReflectionQuota(b, beforeMidnight).allowed, true);
  assert.equal(
    consumeReflectionQuota(a, Date.parse("2026-09-13T16:01:00.000Z")).allowed,
    true,
  );
});
test("route rejects an exhausted device before calling upstream services", async () => {
  process.env.REFLECT_DAILY_LIMIT = "1";
  const headers = { "X-Zuoshu-Client-ID": "c".repeat(32) };
  consumeReflectionQuota(new Request("http://localhost/api/reflect", { headers }));
  globalThis.fetch = async () => {
    throw new Error("upstream must not be called");
  };
  const response = await POST(
    new Request("http://localhost/api/reflect", {
      method: "POST",
      headers,
      body: JSON.stringify(context),
    }),
  );
  const body = await response.json();
  assert.equal(response.status, 429);
  assert.equal(body.code, "DAILY_LIMIT");
  assert.equal(response.headers.get("X-RateLimit-Remaining"), "0");
});
test("missing Zhihu credentials keeps a local reflection", async () => {
  delete process.env.ZHIHU_ACCESS_SECRET;
  const response = await POST(request(context));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.cards[0].type, "daily_highlight");
  assert.equal(result.externalStatus.search, "unavailable");
});
test("matched cards bind source metadata and pipeline stays within two model calls", async () => {
  configure();
  process.env.REFLECT_LLM_BASE_URL = "https://test.invalid/v1";
  process.env.REFLECT_LLM_API_KEY = "test";
  process.env.REFLECT_LLM_MODEL = "test";
  let modelCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/quota")) return Response.json({ Data: [{ RemainingQuota: 1 }] });
    if (!String(url).includes("chat/completions")) return Response.json({ Code: 0, Data: { Items: [item] } });
    modelCalls++;
    const payload = modelCalls === 1
      ? { cleanedJournal: context.journal, signals: [{ kind: "friction", text: "论文阅读让我焦虑", evidence: "看不懂方法，感到焦虑", weight: 0.9, searchWorthy: true, unresolved: true, wantsHelp: true }], highlight: { heading: "今天留下的话", text: "你记下了阅读中的卡点。", evidence: "看不懂方法" } }
      : { resonanceIndex: 1, resonanceConnection: "这段经历回应了今天的阅读卡点。", favoriteIndex: null, actionIndex: 1, actionText: "明天先读摘要并写下研究问题", actionFriction: "读论文很慢" };
    return Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] });
  };
  const outcome = await runReflection(context);
  assert.equal(modelCalls, 2);
  assert.equal(outcome.trace.stages.length, 3);
  const resonance = outcome.result.cards?.find((card) => card.type === "resonance");
  const action = outcome.result.cards?.find((card) => card.type === "tomorrow_action");
  assert.ok(resonance && resonance.type === "resonance");
  assert.ok(action && action.type === "tomorrow_action");
  assert.equal(resonance.source.url, item.Url);
  assert.equal(resonance.source.author, item.AuthorName);
  assert.equal(resonance.source.excerpt, "读论文先看摘要，明确问题。");
  assert.equal(action.source.url, item.Url);
});
test("empty search, auth and rate limits fail explicitly", async () => {
  configure();
  for (const [code, expected] of [[20001, "UPSTREAM_AUTH"], [30001, "UPSTREAM_RATE_LIMIT"]]) {
    globalThis.fetch = async () => Response.json({ Code: code, Message: "secret-must-not-escape" });
    await assert.rejects(searchZhihu(`error-${code}`, new AbortController().signal), (error: Error & { code?: string }) => error.code === expected && !error.message.includes("secret-must-not-escape"));
  }
  globalThis.fetch = async () => Response.json({ Code: 0, Data: { Items: [] } });
  assert.deepEqual(await searchZhihu("empty", new AbortController().signal), []);
});
test("outer cancellation stops work while internal deadline returns a fallback", async () => {
  configure();
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  };
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runReflection(context, { signal: controller.signal }), { code: "TIMEOUT" });
  assert.equal(calls, 0);
  const outcome = await runReflection(context, { deadlineMs: 20 });
  assert.equal(outcome.result.cards?.[0]?.type, "daily_highlight");
});
test("client rejects errors and malformed success instead of mock fallback", async () => {
  globalThis.fetch = async () => Response.json({ error: "额度不足" }, { status: 429 });
  await assert.rejects(requestReflection(context), /额度不足/);
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(requestReflection(context), /不完整/);
});

test("client works when AbortSignal.timeout is unavailable", async () => {
  const timeout = AbortSignal.timeout;
  Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: undefined });
  let called = false;
  globalThis.fetch = async (_url, options) => {
    called = true;
    assert.ok(options?.signal instanceof AbortSignal);
    return Response.json({
      summary: "完成阅读",
      achievements: [],
      resonance: { signal: "阅读", title: "阅读方法", excerpt: "先看摘要。", url: "https://www.zhihu.com/question/1" },
      improvement: { friction: "阅读慢", insight: "带着问题阅读", sourceTitle: "阅读方法", sourceUrl: "https://www.zhihu.com/question/1", tomorrowAction: "先读摘要" },
    });
  };
  try {
    await requestReflection(context);
    assert.equal(called, true);
  } finally {
    Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: timeout });
  }
});

test("synthesis ignores model-invented source metadata", async () => {
  configure();
  process.env.REFLECT_LLM_BASE_URL = "https://test.invalid/v1";
  process.env.REFLECT_LLM_API_KEY = "test";
  process.env.REFLECT_LLM_MODEL = "test";
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ resonanceIndex: 1, improvementIndex: 1, title: "invented", url: "https://evil.invalid", tomorrowAction: "读摘要" }) } }] });
  const signal: Signal = { id: "s1", kind: "friction", text: "阅读困难", evidence: "读论文很慢", weight: 1, searchWorthy: true, reason: "test" };
  const candidate = { item: { title: item.Title, url: item.Url, contentText: item.ContentText, authorName: item.AuthorName, voteUpCount: 20 }, signal } as ScoredCandidate;
  const { result } = await synthesize({ context, signals: [signal], selected: [candidate], signal: new AbortController().signal });
  assert.ok(result.resonance);
  assert.ok(result.improvement);
  assert.equal(result.resonance.title, item.Title);
  assert.equal(result.resonance.url, item.Url);
  assert.equal(result.improvement.tomorrowAction, "读摘要");
});

test("concurrent search is deduplicated and one cancellation spares other caller", async () => {
  configure();
  let calls = 0;
  globalThis.fetch = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 30)); return Response.json({ Code: 0, Data: { Items: [item] } }); };
  const a = new AbortController();
  const first = searchZhihu("shared-query", a.signal);
  const second = searchZhihu("shared-query", new AbortController().signal);
  const rejected = assert.rejects(first);
  a.abort();
  await rejected;
  assert.equal((await second)[0].url, item.Url);
  assert.equal(calls, 1);
  await searchZhihu("shared-query", new AbortController().signal);
  assert.equal(calls, 1);
});

test("no search candidates falls back instead of failing the reflection", async () => {
  configure();
  globalThis.fetch = async (url) => Response.json(String(url).includes("/quota") ? { Data: [{ RemainingQuota: 1 }] } : { Code: 0, Data: { Items: [] } });
  const outcome = await runReflection({ ...context, journal: "今天准备面试很焦虑，效率低，不知道如何准备面试。" });
  assert.equal(outcome.result.cards?.[0]?.type, "daily_highlight");
  assert.equal(outcome.result.externalStatus?.search, "no_match");
});

test("passages preserve short sources and select late evidence in source order within budget", () => {
  const intro = "这是一段文章背景。";
  const before = "以下方法需要在安静的环境中进行。";
  const relevant = "论文阅读困难时，先读摘要并记录研究问题。";
  const after = "如果仍然不理解，再对照实验结果检查。";
  const candidate = {
    item: { contentText: [intro, ...Array.from({ length: 30 }, (_, i) => `背景${i}：${"无关铺垫。".repeat(15)}`), before, relevant, after, relevant].join("\n\n") },
    signal: { text: "论文阅读困难", evidence: "读论文很慢，不知道怎样阅读摘要" },
    query: { text: "论文阅读方法" },
  } as ScoredCandidate;
  for (const stage of ["rerank", "synthesis"] as const) {
    const output = selectPassages(candidate, stage);
    assert.ok(output.startsWith(intro));
    assert.ok(output.includes(relevant));
    assert.equal(output.split(relevant).length - 1, 1);
    assert.ok(output.length <= (stage === "rerank" ? 1200 : 2500));
    if (stage === "synthesis") {
      assert.ok(output.indexOf(before) < output.indexOf(relevant));
      assert.ok(output.indexOf(after) > output.indexOf(relevant));
    }
  }
  candidate.item.contentText = "第一段。\n\n第二段。";
  assert.equal(selectPassages(candidate, "rerank"), candidate.item.contentText);
  candidate.item.contentText = "长".repeat(4000);
  assert.ok(selectPassages(candidate, "rerank").length <= 1200);
});

test("a productive day returns a highlight without spending searches on positive signals", async () => {
  configure();
  process.env.REFLECT_LLM_BASE_URL = "https://test.invalid/v1";
  process.env.REFLECT_LLM_API_KEY = "test";
  process.env.REFLECT_LLM_MODEL = "test";
  const journal = "建模学会了无人机叶片、投影曲线和放样，我很有成就感。晚上把无人机零件基本建完，还去了健身，今天很有成效。音乐计划不知道什么时候开始，不能忘了。";
  let modelCalls = 0;
  let searchCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/quota")) {
      return Response.json({ Data: [{ RemainingQuota: 10 }] });
    }
    if (String(url).includes("chat/completions")) {
      modelCalls++;
      const body = JSON.parse(String(options?.body));
      const prompt = body.messages[1].content as string;
      const payload = modelCalls === 1
        ? {
            cleanedJournal: journal,
            signals: [{
              kind: "question",
              text: "音乐计划何时开始",
              evidence: "音乐计划不知道什么时候开始，不能忘了",
              weight: 0.9,
              searchWorthy: false,
              unresolved: true,
              wantsHelp: false,
            }],
            highlight: {
              heading: "今日闪耀瞬间",
              text: "你学会了三个建模功能，也把无人机零件基本完成了。",
              evidence: "建模学会了无人机叶片、投影曲线和放样",
            },
          }
        : {};
      assert.ok(prompt.includes(journal));
      return Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] });
    }
    searchCalls++;
    return Response.json({ Code: 0, Data: { Items: [item] } });
  };

  const outcome = await runReflection({ ...context, journal });
  const cards = (outcome.result as unknown as { cards?: Array<{ type: string }> }).cards ?? [];
  assert.equal(searchCalls, 0);
  assert.ok(modelCalls <= 2);
  assert.ok(cards.some((card) => card.type === "daily_highlight"));
});

test("weekly periods are anchored to the first real journal", () => {
  assert.equal(latestCompletedWeeklyPeriod("2026-09-01", "2026-09-06"), null);
  assert.deepEqual(latestCompletedWeeklyPeriod("2026-09-01", "2026-09-07"), {
    periodStart: "2026-09-01",
    periodEnd: "2026-09-07",
  });
  assert.deepEqual(latestCompletedWeeklyPeriod("2026-09-01", "2026-09-14"), {
    periodStart: "2026-09-08",
    periodEnd: "2026-09-14",
  });
});

test("weekly echo does not invent a pattern from only two recorded days", async () => {
  configure();
  const response = await weeklyPOST(new Request("http://localhost/api/reflect/weekly", {
    method: "POST",
    body: JSON.stringify({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-07",
      journals: [
        { date: "2026-09-01", content: "今天完成了无人机叶片。" },
        { date: "2026-09-04", content: "今天去健身了。" },
      ],
    }),
  }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.recordedDays, 2);
  assert.deepEqual(result.patterns, []);
});

test("a matching favorite can appear even when the day needs no search", async () => {
  configure();
  process.env.REFLECT_LLM_BASE_URL = "https://test.invalid/v1";
  process.env.REFLECT_LLM_API_KEY = "test";
  process.env.REFLECT_LLM_MODEL = "test";
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({
    favoriteIndex: 1,
    favoriteConnection: "你以前收藏的建模经验，正好照见今天学会的新技能。",
    resonanceIndex: null,
    actionIndex: null,
  }) } }] });
  const favoriteItem = {
    title: "第一次做无人机建模的记录",
    contentType: "answer",
    contentId: "favorite-1",
    contentText: "从叶片开始练习，逐步熟悉投影曲线和放样。",
    url: "https://www.zhihu.com/question/1/answer/2",
    commentCount: 0,
    voteUpCount: 12,
    authorName: "测试作者",
    authorBadgeText: "",
    authorityLevel: "",
    editTime: 0,
    rankingScore: 0,
  };
  const { result } = await composeReflection({
    context: { ...context, journal: "今天学会了无人机叶片建模，很有成就感。" },
    signals: [],
    moment: { heading: "今日闪耀瞬间", text: "学会了新的建模方法。", evidence: "学会了无人机叶片建模" },
    candidates: [],
    favorites: [{ item: favoriteItem, savedAt: 1_700_000_000 }],
    signal: new AbortController().signal,
  });
  const card = result.cards?.[0];
  assert.ok(card && card.type === "past_collection");
  assert.equal(card.source.origin, "favorite");
  assert.equal(card.source.url, favoriteItem.url);
});

test("OAuth session cookie is encrypted, expires, and rejects tampering", () => {
  const secret = "test-cookie-secret";
  const sealed = sealSession({ accessToken: "oauth-token", expiresAt: Date.now() + 60_000 }, secret);
  assert.ok(!sealed.includes("oauth-token"));
  assert.equal(openSession(sealed, secret)?.accessToken, "oauth-token");
  assert.equal(openSession(sealed, "wrong-secret"), null);
  const tamperAt = Math.floor(sealed.length / 2);
  const replacement = sealed[tamperAt] === "A" ? "B" : "A";
  const tampered = `${sealed.slice(0, tamperAt)}${replacement}${sealed.slice(tamperAt + 1)}`;
  assert.equal(openSession(tampered, secret), null);
  assert.equal(openSession(sealSession({ accessToken: "old", expiresAt: Date.now() - 1 }, secret), secret), null);
});

test("history seed counts stay varied and ordinary highlights remain sticker copy", () => {
  const counts: number[] = demoHistorySeeds.map((seed) => seed.tomatoes);
  assert.ok(counts.every((count) => count >= 1 && count <= 12));
  assert.ok([1, 5, 12].every((count) => counts.includes(count)));
  assert.equal(new Set(counts).size, counts.length);

  const result = {
    ...reflectionTemplate,
    cards: [{
      type: "daily_highlight" as const,
      heading: "今日闪耀瞬间" as const,
      text: "终于把困扰很久的问题想明白了",
      evidence: "今天终于想明白了这个问题",
    }],
  };
  assert.equal(reflectionTheme(result), "终于把困扰很久的问题想明白了");
});
