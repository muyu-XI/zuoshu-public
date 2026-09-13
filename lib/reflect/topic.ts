import type { DailyContext } from "@/types";
import { ALL_CUES } from "./lexicon";
import { bigrams, topicPhrase } from "./text";

/** 任务标题里的字符二元组有多大比例出现在文本里。 */
function containment(title: string, text: string): number {
  const titleGrams = new Set(bigrams(title));
  if (titleGrams.size === 0) return 0;
  const textGrams = new Set(bigrams(text));
  let hit = 0;
  for (const gram of titleGrams) {
    if (textGrams.has(gram)) hit += 1;
  }
  return hit / titleGrams.size;
}

/**
 * 从一段口语化描述里提炼主题短语，作为降级路径下检索词的锚点。
 *
 * 优先用当天的任务标题：任务标题本身就是简短的名词短语，
 * 比从日记里硬切要干净得多（「阅读 GEN-0」远好于「看GEN0慢想刷手机了」）。
 * 任务标题接不上时，才剥掉线索词后自行切分。
 */
export function topicFromText(
  text: string,
  context: DailyContext,
  max = 14,
): string {
  let best: { title: string; score: number } | null = null;
  for (const task of context.tasks) {
    const score = containment(task.title, text);
    if (!best || score > best.score) best = { title: task.title, score };
  }
  if (best && best.score >= 0.4) {
    const anchored = topicPhrase(best.title, max);
    if (anchored.length >= 2) return anchored;
  }

  let base = text;
  for (const cue of ALL_CUES) {
    base = base.split(cue).join("");
  }
  const stripped = topicPhrase(base, max);
  if (stripped.length >= 2) return stripped;
  return topicPhrase(text, max);
}
