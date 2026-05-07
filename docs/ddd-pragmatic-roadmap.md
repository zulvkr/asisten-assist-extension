# DDD + Pragmatic Roadmap

Date: 2026-05-07
Scope: AsistenAssist (WXT + Vue + TypeScript)

## Objective

Reduce operational risk and improve change velocity by clarifying domain boundaries, isolating integrations, and adding a small but high-value test safety net.

## Priority Tiers

### P0 - Critical Risk + Immediate ROI (Week 1)

#### P0.1 Centralize runtime configuration

- Problem: hardcoded IDs/keys/base URLs are duplicated and scattered.
- Outcome: one typed source of truth for all integration config.
- Files to add:
  - src/config/runtimeConfig.ts (or config/runtimeConfig.ts to match current layout)
- Files to update:
  - entrypoints/background.ts
  - composables/marginTableApi.ts
  - utils/pemasukanApi.ts
  - components/stockCheckerCron.ts
- Acceptance criteria:
  - No API key/hospital ID literals outside config module.
  - Config parser validates required keys and throws readable startup errors.

#### P0.2 Introduce integration clients + error policy

- Problem: fetch logic and headers are duplicated with inconsistent error behavior.
- Outcome: consistent timeout, status handling, and normalized errors.
- Files to add:
  - services/integration/httpClient.ts
  - services/integration/errors.ts
  - services/integration/assistClient.ts
  - services/integration/destyClient.ts
  - services/integration/marginSheetClient.ts
- Files to update:
  - entrypoints/background.ts
  - composables/destyOmniStockApi.ts
  - composables/marginTableApi.ts
- Acceptance criteria:
  - All integration calls use shared client wrappers.
  - Each failed request produces consistent typed error data.

#### P0.3 Remove hidden global dependency for margin data

- Problem: window.marginData creates implicit coupling and mutation risk.
- Outcome: explicit dependency passing with typed structures.
- Files to add:
  - domain/margin/marginTypes.ts
  - domain/margin/marginLookup.ts
- Files to update:
  - composables/marginTableApi.ts
  - components/modifyTableObat.ts
  - components/modifyTableBhp.ts
  - components/modifyRestockReturn.ts
  - components/stockCheckerCron.ts
- Acceptance criteria:
  - No direct reads of window.marginData in domain or UI modifiers.
  - Margin lookup APIs receive typed rows as parameters.

#### P0.4 Add minimal high-value tests

- Problem: no automated safety net for key business rules.
- Outcome: fast confidence for refactors.
- Files to add:
  - vitest.config.ts
  - tests/compareStockLevels.test.ts
  - tests/getSoldItemsByDate.test.ts
  - tests/validateDateRangeLimit.test.ts
  - tests/hitunganHarianCalculations.test.ts
- Files to update:
  - package.json (test scripts)
- Acceptance criteria:
  - CI/local command runs tests in under 10 seconds.
  - Tests cover happy path + 2 edge cases per module.

### P1 - Structural Improvement (Week 2)

#### P1.1 Define bounded contexts and app services

- Contexts:
  - Stock Reconciliation
  - Daily Revenue Summary
  - UI Augmentation
- Files to add:
  - domain/stock-reconciliation/
  - domain/daily-revenue/
  - application/stock-comparison/FetchStockComparisonUseCase.ts
  - application/pemasukan/FetchPemasukanUseCase.ts
- Files to update:
  - entrypoints/background.ts (thin message router only)
- Acceptance criteria:
  - background.ts has routing only, no orchestration logic.
  - use case modules depend on ports/interfaces, not browser globals.

#### P1.2 Build anti-corruption layer (ACL) adapters

- Problem: external schemas leak into domain logic.
- Outcome: domain receives normalized, stable models.
- Files to add:
  - adapters/assist/toDomain.ts
  - adapters/desty/toDomain.ts
  - adapters/margin/toDomain.ts
- Acceptance criteria:
  - Domain modules do not import external API DTO types.
  - Mapping edge cases are unit tested.

#### P1.3 Deduplicate token probing behavior

- Problem: Assist and Desty token probing duplicate storage-key search and diagnostics.
- Outcome: reusable probe engine + provider-specific extraction.
- Files to add:
  - composables/tokenProbe/commonProbe.ts
- Files to update:
  - composables/assistTokenManager.ts
  - composables/destyOmniTokenManager.ts
  - entrypoints/content.ts
  - entrypoints/desty.content.ts
- Acceptance criteria:
  - Shared probe utility used by both providers.
  - Provider files are mostly configuration and mapping.

### P2 - Maintainability and Model Clarity

#### P2.1 Tighten TypeScript model safety

- Replace broad any usage with narrow types and type guards.
- Add small utility types for optional API branches.
- Acceptance criteria:
  - Significant reduction of "as any" usage in modified modules.

#### P2.2 Consolidate table modifier duplication

- Extract common margin-column table decorator with strategy hooks.
- Acceptance criteria:
  - One shared table decoration engine used by Obat and BHP modifiers.

#### P2.3 Add lightweight ADRs

- Files to add:
  - docs/adr/0001-bounded-contexts.md
  - docs/adr/0002-integration-error-policy.md
  - docs/adr/0003-margin-data-lifecycle.md
- Acceptance criteria:
  - Architecture decisions are explicit and discoverable.

## Two-Week Execution Plan

### Week 1 (P0)

1. Day 1: Add runtime config module and migrate constants.
2. Day 2: Add shared http/integration error handling.
3. Day 3: Refactor margin flow away from window global.
4. Day 4: Add vitest and core domain tests.
5. Day 5: Stabilization pass, lint/compile, fix regressions.

### Week 2 (P1)

1. Day 6-7: Move orchestration into application use cases.
2. Day 8: Add ACL mappers for Assist/Desty/Margin.
3. Day 9: Unify token probing logic.
4. Day 10: regression tests + docs + handoff notes.

## Suggested Target Folder Layout

- domain/
  - stock-reconciliation/
  - daily-revenue/
  - margin/
- application/
  - stock-comparison/
  - pemasukan/
- adapters/
  - assist/
  - desty/
  - margin/
- services/
  - integration/
- config/
- tests/
- docs/
  - adr/

## Metrics to Track

- Duplicated integration code blocks: target -60%.
- Hardcoded secrets/constants outside config: target 0.
- Core domain test coverage (statement): target >= 75% for selected modules.
- Mean time to implement a stock-comparison rule change: target -30%.

## Rollout Notes

- Sequence matters: do P0 before deep structural changes.
- Avoid big-bang refactor: merge in small vertical slices.
- Keep user behavior unchanged while moving boundaries.
