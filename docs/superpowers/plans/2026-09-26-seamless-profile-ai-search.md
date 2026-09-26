# Seamless Profile and AI Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make profile setup, reciprocal exchange, and natural-language people discovery feel immediate while preserving Peerdrop’s consent boundary.

**Architecture:** Keep catalog and profile data in the existing domain/API layers. Add a server-only AI ranking service over authorized direct-contact candidates, and refactor the existing exchange component into automatic creation plus replace-on-edit behavior.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-26-seamless-profile-ai-search-design.md`

## Global Constraints

- CampusGroups, directory data, events, and headshots remain clearly fictional demo data.
- AI receives only direct-contact data already authorized for the viewer; never hidden fields or second-degree people.
- Normal search and exchange still work without AI credentials.
- Preserve existing reciprocal confirmation and immutable snapshot semantics.

## Review Focus

- Existing databases upgrade without re-running migration 001.
- Legacy profile/snapshot fields do not break current UI.
- Rapid exchange-setting changes leave only the newest QR active.
- Model output cannot introduce unknown contacts or instructions from profile text.
- Missing/slow/malformed AI endpoints fall back without exposing secrets or blocking ordinary search.

---

### Task 1: Upgrade and profile controls

**Files:** migrations, domain types/validation, profile/catalog services, profile editor, unit/browser tests.

**Interfaces:** Produces sanitized profiles, hobby suggestions, searchable shared spaces, and a default directory avatar.

- [ ] Add failing tests for upgrade migration, removed fields, hobby normalization, and catalog suggestions.
- [ ] Implement incremental migration and legacy sanitization.
- [ ] Implement searchable bubble pickers and directory-photo treatment.
- [ ] Run targeted unit and browser tests.

### Task 2: Seamless QR lifecycle

**Files:** exchange component/domain helpers and exchange browser tests.

**Interfaces:** Consumes saved `default_share_fields`; produces an automatically created invite that is replaced after per-exchange edits.

- [ ] Add failing tests for automatic creation, truthful mandatory identity preview, and replacement after edits.
- [ ] Implement automatic creation and debounced cancel/recreate flow.
- [ ] Run exchange tests.

### Task 3: Privacy-safe AI search

**Files:** AI domain/service modules, route validation/handler, network UI, unit/browser tests.

**Interfaces:** Produces `POST /api/search/ai` with `{query}` → `{mode, results:[{connectionId,reason}]}`.

- [ ] Add failing tests for candidate minimization, unknown-ID rejection, ranking fallback, timeout/malformed responses, and route schema.
- [ ] Implement server-only candidate construction and OpenAI-compatible request.
- [ ] Implement Ask Peerdrop UI and reasoned results.
- [ ] Run AI and browser tests.

### Task 4: Final integration

**Files:** docs, CSS, full verification outputs.

**Interfaces:** Consumes Tasks 1–3 and produces the complete demo flow.

- [ ] Update product/technical/demo documentation and environment template.
- [ ] Run formatting, typecheck, unit/database tests, Playwright mobile/desktop tests, and production build.
- [ ] Inspect one desktop/mobile capture, fix material defects once, and request whole-diff review.
