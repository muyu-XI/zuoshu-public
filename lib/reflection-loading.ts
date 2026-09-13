import { ACHIEVEMENT_CUES, DISTRESS_CUES } from "./reflect/lexicon";
import { firstHit } from "./reflect/text";

const neutralMessages = [
  "正在整理今天……",
  "正在分辨今天的重点",
  "正在看看什么值得留下",
  "正在把今天放进回顾",
];

const supportMessages = [
  "正在整理今天……",
  "正在听懂这份困难",
  "正在寻找走过相似道路的人",
  "正在看看明天能从哪一步开始",
];

const highlightMessages = [
  "正在整理今天……",
  "正在拾起值得记住的瞬间",
  "正在看看哪一刻最闪耀",
  "正在把今天好好收进回顾",
];

export const weeklyReflectionMessages = [
  "正在轻轻翻过这一周……",
  "正在把七天里的片段放在一起",
  "正在寻找反复出现的线索",
  "正在为下一周留下一句话",
];

export function dailyReflectionMessages(journal: string): string[] {
  if (firstHit(journal, DISTRESS_CUES)) return supportMessages;
  if (firstHit(journal, ACHIEVEMENT_CUES)) return highlightMessages;
  return neutralMessages;
}
