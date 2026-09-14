# Mobile Tree Motion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the trees on Today and Orchard react naturally to loading, orchard pagination, scrolling, and touch gestures without blocking mobile scrolling.

**Architecture:** Keep each component's existing spring simulation and give it a small `sway` entry point. Route load, page changes, scroll velocity, touch movement, and mouse proximity through that entry point while respecting `prefers-reduced-motion` and visibility.

**Tech Stack:** Next.js 16 Client Components, React 19 effects, Pointer Events, `requestAnimationFrame`, Playwright CLI.

---

### Task 1: Today tree triggers

**Files:**
- Modify: `components/mascot/HarvestTree.tsx`

1. Add a clamped `sway` helper that starts the existing spring loop.
2. Trigger one gentle sway after mount.
3. Feed visible-page scroll deltas into `sway`.
4. Treat touch movement as a global passive gesture signal so it never prevents scrolling; retain local mouse proximity.
5. Reset all motion when reduced motion becomes active.

### Task 2: Orchard triggers

**Files:**
- Modify: `components/orchard/Orchard.tsx`

1. Add the same bounded spring impulse entry point.
2. Trigger a staggered-feeling global sway after data load and each page change.
3. Feed scroll and touch deltas into it without cancelling the browser gesture.
4. Preserve local mouse proximity and reduced-motion behavior.

### Task 3: Verification

**Files:**
- No source files added.

1. Run `npm run lint` and `npm test`.
2. In a mobile viewport, assert transforms appear after load, orchard pagination, and touch movement.
3. In a desktop viewport, assert mouse proximity still animates the orchard.
4. Emulate `prefers-reduced-motion: reduce` and assert no transforms are added.
5. Inspect the final diff to ensure only the two motion components and this plan changed.
