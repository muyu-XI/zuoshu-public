import { bigrams, sourceTextFrom } from "./text";
import type { Candidate } from "./types";

/** 仅为模型准备材料；保留原句、原顺序，省略处显式分隔。 */
export function selectPassages(candidate: Candidate, stage: "rerank" | "synthesis"): string {
  const max = stage === "rerank" ? 1200 : 2500;
  const opening = stage === "rerank" ? 200 : 300;
  const text = sourceTextFrom(candidate.item.contentText);
  if (text.length <= max) return text;

  // 长段按句子分组；没有句号的超长句才按字符切分。
  const units: string[] = [];
  for (const paragraph of text.split(/\n+/).filter(Boolean)) {
    let chunk = "";
    for (const sentence of paragraph.match(/[^。！？!?；;]+[。！？!?；;]*|[。！？!?；;]+/g) ?? [paragraph]) {
      if (chunk && chunk.length + sentence.length > opening) {
        units.push(chunk);
        chunk = "";
      }
      if (sentence.length > opening) {
        for (let offset = 0; offset < sentence.length; offset += opening) {
          units.push(sentence.slice(offset, offset + opening));
        }
      } else {
        chunk += sentence;
      }
    }
    if (chunk) units.push(chunk);
  }

  const needles = [candidate.signal.text, candidate.signal.evidence, candidate.query.text]
    .map((value) => new Set(bigrams(value)));
  const ranked = units.map((unit, index) => {
    const grams = new Set(bigrams(unit));
    const score = needles.reduce((sum, needle) => {
      if (!needle.size) return sum;
      let hits = 0;
      for (const gram of needle) if (grams.has(gram)) hits++;
      return sum + hits / needle.size;
    }, 0);
    return { index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen = new Set<number>();
  const seen = new Set<string>();
  let used = 0;
  const add = (index: number) => {
    const unit = units[index];
    if (!unit || chosen.has(index) || seen.has(unit)) return;
    // 为段间换行与省略标识预留预算。
    const cost = unit.length + (chosen.size ? 5 : 0);
    if (used + cost > max) return;
    chosen.add(index);
    seen.add(unit);
    used += cost;
  };
  for (let index = 0; index < units.length && used < opening; index++) add(index);
  const relevant = ranked.filter(({ index, score }) => score > 0 && !chosen.has(index))
    .slice(0, stage === "rerank" ? 3 : 5);
  for (const { index } of relevant) add(index);
  if (stage === "synthesis") {
    for (const { index } of relevant) {
      add(index - 1);
      add(index + 1);
    }
  }
  const ordered = [...chosen].sort((a, b) => a - b);
  return ordered.map((index, position) => {
    const previous = ordered[position - 1];
    const separator = position === 0 ? "" : index === previous + 1 ? "\n\n" : "\n[…]\n";
    return separator + units[index];
  }).join("");
}
