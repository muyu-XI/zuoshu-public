import type { ReflectionCard } from "@/types";

const cardPriority: Record<ReflectionCard["type"], number> = {
  daily_highlight: 0,
  past_collection: 1,
  resonance: 2,
  tomorrow_action: 3,
};

export function orderReflectionCards(cards: ReflectionCard[]): ReflectionCard[] {
  return [...cards].sort((left, right) =>
    cardPriority[left.type] - cardPriority[right.type]);
}
