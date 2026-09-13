# Complete History Mocks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Replace the generic demo history with a fixed, complete 2026-09-03 through 2026-09-12 scenario set and show its 2026-09-03 through 2026-09-09 weekly review in the existing reflection page.

**Architecture:** Define one typed fixture as the source of truth for demo tasks, tomatoes, journals, daily reflections, settings, and the weekly reflection. Seed it idempotently from IndexedDB initialization, replacing only records positively identified as earlier demo data and never overwriting real journals on the same dates. Keep normal user weekly-review behavior unchanged, while allowing the seeded demo weekly record to render when no real weekly period exists.

**Tech Stack:** Next.js 16, React 19, TypeScript, Dexie/IndexedDB, Node test runner.

---

### Task 1: Model and verify the complete fixture

**Files:**
- Modify: `lib/mock-data.ts`
- Modify: `types/index.ts`
- Modify: `tests/reflect.test.ts`

**Steps:**
1. Add a failing fixture contract test for the exact date range, 31 tomatoes, daily non-empty data, card coverage, cross-day action, star, legacy v1 record, and seven-day weekly review.
2. Define deterministic fixture builders and typed seed records for all ten days.
3. Run `npm test` and confirm the fixture contract passes.

### Task 2: Replace demo data safely and idempotently

**Files:**
- Modify: `lib/db.ts`
- Modify: `tests/reflect.test.ts`

**Steps:**
1. Add a versioned demo-seed marker and deterministic record identifiers.
2. Remove only the previous generic demo records and their linked tasks/tomatoes.
3. Skip any target date containing a real journal or real reflection, then insert the complete fixture and weekly record.
4. Ensure tomato normalization does not truncate fixture sessions.
5. Run `npm test` and `npm run lint`.

### Task 3: Render the seeded weekly review without changing real-user behavior

**Files:**
- Modify: `components/reflection/WeeklyEcho.tsx`
- Modify: `types/index.ts`

**Steps:**
1. Prefer the existing real-journal weekly-period path.
2. When there is no completed real period, render the seeded demo weekly record with its demo journals.
3. Never auto-request or show refresh controls for the immutable demo record.
4. Run `npm test`, `npm run lint`, and `npm run build`.

### Task 4: Visual QA and handoff

**Files:**
- Verify: `/history`
- Verify: `/reflection`

**Steps:**
1. Start the app with a fresh browser storage profile.
2. Inspect all ten history days, key card states, tomato totals/minutes, the starred day, and the weekly reflection.
3. Check desktop and mobile layouts and capture screenshots for review.
4. Leave the branch uncommitted and unpushed for user approval.
