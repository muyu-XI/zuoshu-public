/** 轻量的中文友好文本工具：分句、归一化、字符二元组重叠度。 */

const SENTENCE_BREAK = /[。！？!?；;\n\r]+/;

const STOPWORDS = new Set([
  "今天",
  "昨天",
  "明天",
  "上午",
  "下午",
  "晚上",
  "中午",
  "早上",
  "后来",
  "中间",
  "然后",
  "但是",
  "不过",
  "因为",
  "所以",
  "感觉",
  "有点",
  "一些",
  "自己",
  "还是",
  "就是",
  "其实",
  "真的",
  "发现",
  "觉得",
  "比较",
  "非常",
  "特别",
  "几次",
  "最后",
  "看得",
  "看着",
  "看完",
  "开始",
  "完成",
  "我",
  "很",
  "那种",
  "这种",
  "一直",
  "什么",
  "有点",
  "了",
  "想",
  "又",
  "再",
  "都",
  "才",
]);

/** 去掉时间词、程度词和口头填充词，让主题短语更接近可检索的表达。 */
export function stripFillers(text: string): string {
  let result = text;
  for (const word of STOPWORDS) {
    result = result.split(word).join("");
  }
  return result;
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * 把知乎返回的 ContentText 整理成单行摘录。
 * 真实响应里带换行，且常常比卡片能容纳的长度长，所以压平空白后
 * 尽量在句子边界收尾，避免出现半句话。
 */
export function excerptFrom(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const window = flat.slice(0, max);
  const lastBreak = Math.max(
    window.lastIndexOf("。"),
    window.lastIndexOf("！"),
    window.lastIndexOf("？"),
    window.lastIndexOf("；"),
  );
  if (lastBreak >= Math.floor(max * 0.5)) {
    return window.slice(0, lastBreak + 1);
  }
  return `${window.trimEnd()}…`;
}

/** 清理知乎 ContentText 中的高亮标签，同时保留段落结构。 */
export function sourceTextFrom(text: string): string {
  return text
    .replace(/<\/?em>/gi, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 返回知乎 ContentText 的第一段，不截字、不改写。 */
export function firstParagraphFrom(text: string): string {
  const sourceText = sourceTextFrom(text);
  return sourceText.split(/\n+/).find((paragraph) => paragraph.trim()) ?? "";
}

/** 展开原文时，去掉已经作为摘要展示过的开头，避免连续读到两遍。 */
export function sourceTextAfterExcerpt(text: string, excerpt: string): string {
  const sourceText = sourceTextFrom(text);
  const summary = sourceTextFrom(excerpt);
  if (!sourceText || !summary) return sourceText;

  const escaped = Array.from(summary)
    .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*");
  const repeatedOpening = sourceText.match(new RegExp(`^\\s*${escaped}`));
  return repeatedOpening ? sourceText.slice(repeatedOpening[0].length).trimStart() : sourceText;
}

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_BREAK)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** 去掉空白与标点，保留中日韩字符、字母与数字，便于做重叠比较。 */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, "")
    .trim();
}

/**
 * 生成用于比较的「元」：
 *   - 汉字连续段取字符二元组（中文没有词边界，二元组是够用的近似）
 *   - 字母/数字连续段整体作为一个元
 *
 * 这一点很关键：如果对英文也取二元组，`gen0` 和 `generalistai` 会因为共享
 * `ge`/`en` 而被判为相关。按整段取元可以避免这类假匹配。
 */
export function bigrams(text: string): string[] {
  const normalized = normalizeForMatch(text);
  if (normalized.length === 0) return [];
  // 注意：这里必须用「非汉字段」而不是 [\p{L}\p{N}]，因为 \p{L} 本身包含汉字，
  // 否则字母数字分支会把紧随其后的整段中文一起吞掉。
  const runs = normalized.match(/[\p{Script=Han}]+|[^\p{Script=Han}]+/gu) ?? [];
  const grams: string[] = [];
  for (const run of runs) {
    if (/^[\p{Script=Han}]+$/u.test(run)) {
      if (run.length === 1) {
        grams.push(run);
      } else {
        for (let i = 0; i < run.length - 1; i += 1) {
          grams.push(run.slice(i, i + 2));
        }
      }
    } else if (run.length <= 32) {
      grams.push(run);
    } else {
      // 超长英文串退化为二元组，避免单个元过大导致重叠度恒为 0。
      for (let i = 0; i < run.length - 1; i += 2) {
        grams.push(run.slice(i, i + 2));
      }
    }
  }
  return grams;
}

/** 字符二元组的 Jaccard 相似度，0..1。用于模型不可用时的相关性近似。 */
export function lexicalOverlap(a: string, b: string): number {
  const setA = new Set(bigrams(a));
  const setB = new Set(bigrams(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

/** 命中任意一个关键词时返回第一个命中的词，否则返回 null。 */
export function firstHit(text: string, keywords: readonly string[]): string | null {
  for (const keyword of keywords) {
    if (text.includes(keyword)) return keyword;
  }
  return null;
}

/**
 * 把一句口语化的描述压成可以塞进检索框的主题短语。
 * 这是模型不可用时的降级手段，不追求语言学上的准确，但保证：
 * 去掉标点与填充词、不出现省略号、长度受控。
 */
export function topicPhrase(text: string, max = 12): string {
  const cleaned = stripFillers(text).trim();
  const parts = cleaned
    .split(/[，。！？、；：\s]+/)
    .map((part) => part.replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, ""))
    .filter((part) => part.length > 0);

  let result = "";
  for (const part of parts) {
    if (result && result.length + part.length > max) break;
    result += part;
    if (result.length >= max) break;
  }
  // 累积结果过短，说明开头几段都是填充词，改用最长的一段。
  if (result.length < 3 && parts.length > 0) {
    const longest = parts.reduce((a, b) => (b.length > a.length ? b : a), "");
    if (longest.length > result.length) result = longest;
  }
  if (!result) {
    result = cleaned.replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, "");
  }
  return result.slice(0, max);
}
