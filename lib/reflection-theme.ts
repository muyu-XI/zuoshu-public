import type { ReflectionRecord, ReflectionResult } from "@/types";
import { demoHistorySeeds } from "./mock-data";

export function demoHighlight(taskTitle: string): string | undefined {
  return demoHistorySeeds.find((seed) => seed.title === taskTitle)?.highlight;
}

export function reflectionTheme(
  result?: ReflectionResult,
  demoTask?: string,
  source?: ReflectionRecord["source"],
): string {
  if (!result) return "";
  const demoTheme = source === "mock" && demoTask ? demoHighlight(demoTask) : undefined;
  if (demoTheme) return shorten(demoTheme);
  const highlight = result.cards?.find((card) => card.type === "daily_highlight");
  if (highlight) return shorten(highlight.text);
  // Only the generated history fixtures use this exact summary and task pair.
  const legacyDemoHighlight = demoTask ? demoHighlight(demoTask) : undefined;
  if (legacyDemoHighlight && result.summary === `完成了${demoTask}。`)
    return shorten(legacyDemoHighlight);
  const resonance = result.resonance;
  if (resonance?.stickerTheme?.trim()) return shorten(resonance.stickerTheme);
  // Older saved reviews predate the dedicated sticker theme field.
  if (resonance?.title === "第一次做科研，一篇论文读一天正常吗？")
    return "第一次做科研，读得慢";
  const firstCard = result.cards?.[0];
  if (firstCard && "signal" in firstCard) return shorten(firstCard.signal);
  return shorten(resonance?.signal || resonance?.title || result.summary);
}

function shorten(text: string): string {
  const characters = Array.from(text.trim().replace(/\s+/g, " "));
  return characters.length > 14 ? `${characters.slice(0, 13).join("")}…` : characters.join("");
}
