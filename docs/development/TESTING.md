# Testing and quality gates

Last reconciled: 2026-10-08 (source and automated checks; external acceptance is separate)

## Test layers

### Node tests

Domain and selected route behavior use the built-in Node test runner. Coverage includes matching-related career logic, ATS, AI fallback, application trust boundaries, Autopilot idempotency, interviews/timezones, learning/answer keys, practice, portfolio, My Day, URLs and UI-source assertions.

```sh
node --test $(rg --files lib scripts -g '*.test.mjs')
node scripts/check-documentation.mjs
```

The verified 2026-09-27 Phase 2 observation was 86 passing tracked tests plus the focused new lifecycle test file. Counts will evolve and are not a quality requirement.

### Static checks and production build

```sh
npm run lint
npm run build
git diff --check
```

The production build is also a TypeScript/Next.js integration gate and must generate the expected routes without errors. The latest sandbox run reached Turbopack but was blocked by the environment from creating a process/binding a port (`Operation not permitted`); TypeScript and lint passed independently.

### Cloud schema and SQL security

```sh
# Local database reconstruction removed; validate migrations on a disposable cloud target.
# Run the retained rollback SQL fixtures only on a reviewed disposable cloud target.
```

The verified Phase 2 baseline is nine SQL files, nine tests, PASS. They use deterministic seed accounts and roll back synthetic changes. A fresh reset confirms the complete migration chain, including the private Resume Storage bucket and policies.

### Database release checks

For schema work also review source/remote migration lists, run a production push dry run, and run relevant Supabase advisors. Do not automatically push.

## Browser/manual gaps

No general automated browser E2E framework is installed. Real OAuth, private resume Storage, installed extension permissions, microphone/speech compatibility, external embeds, responsive widths, keyboard behavior and production smoke tests remain explicit manual release checks until justified automation is approved.

## Failure policy

Fix failures caused by the proposed change. Never delete or weaken a test to make a refactor pass. Record environment/provider limitations separately from code failures.

## Latest validation

Billing completion batch: 229 Node tests, 28 SQL security files, complete reconstruction, lint and TypeScript-inclusive webpack production build pass. For this environment use `npx next build --webpack` if Turbopack process/port restrictions apply. Later targeted notification/billing/account checks: 39 pass. Documentation coverage verifies source inventory and repository links; it cannot assert provider receipt, legal adequacy or every user journey. Browser checks use the existing local server with no production accounts modified.

Final current Node command (`node --test $(rg --files lib scripts -g "*.test.mjs")`): **228 tests pass**. The previous 229-count validation is retained as historical evidence; current reproducible source-suite count is 228. Documentation coverage: 66 handlers / 106 HTTP methods, 63 table creation references, 35 settings, 90 runnable check files, all 41 original feature rows and 375 repository links pass.
