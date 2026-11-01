# Authentication flow

Last verified: 2026-11-01

## Entry condition

An unauthenticated visitor chooses Google sign-in at `/auth/login`, or requests a protected page and is redirected there by `proxy.ts` with a safe `next` path.

## Steps

```mermaid
sequenceDiagram
  participant U as User
  participant J as JobPilot
  participant S as Supabase Auth
  participant G as Google
  U->>J: Continue with Google
  J->>S: signInWithOAuth(callback)
  S->>G: OAuth authorization
  G->>S: Provider callback
  S->>J: /auth/callback?code=...
  J->>S: exchangeCodeForSession
  J->>J: Check profile/preferences
  J-->>U: Profile or safe requested route
```

Routes: `/auth/login`, `/auth/callback`, requested protected route. API call: Supabase Auth SDK; no JobPilot JSON API.

Database effects: `handle_new_user` creates `profiles`; callback reads `profiles` and `job_preferences`. Security: canonical callback origin, internal-only `next`, server code exchange, protected-page proxy, and server-side API authentication.

Failure states: provider cancellation, missing/invalid code, missing production site URL, session exchange failure, or profile read failure. Failures return to Login with a stable code; they do not expose provider details.

Exit condition: an authenticated session exists and the user reaches Profile when required fields/preferences are incomplete, otherwise the safe requested route or Dashboard. Current UI supports Google OAuth, email/password sign-in, confirmation and password recovery.


## Production login incident — 1 November 2026

**Scope:** urgent repair of `oauth_callback_failed` on `https://parth-careers.vercel.app`. Vercel and Supabase logs both report `code challenge does not match previously saved code verifier`. The shared fixed PKCE verifier can be replaced by an overlapping OAuth/confirmation/recovery start. Browser callbacks previously carried no flow selector and the server exchanged only `code`.

**Fix:** the installed Supabase SDK's documented `auth.experimental.appendPkceFlowIdToRedirects` option appends `sb_flow_id`; callback forwards that exact selector. The SDK selects only the corresponding cookie slot. A present empty/invalid/unknown ID fails closed without falling back to another flow; an absent ID retains compatibility with existing links. Never remove PKCE, copy another flow's verifier, automatically replay a failed code, expose tokens, or relax account checks/RLS. Shared tabs still share their eventual browser session; the fix isolates pending verifiers, not tab identities. This SDK feature is experimental; keep lockfile/tests when upgrading. Reference: [Supabase PKCE overlapping flows](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

**Production routing check:** one synthetic OAuth start (no user login/email/account creation) and the resulting Supabase auth log retain the canonical callback, `next` and synthetic `sb_flow_id`. Google/email providers report enabled. No Supabase settings, schema, user data or credentials changed.

### Release evidence and gates

Environment: Apple Silicon macOS, Node24.21.0; local production build Next16.4.3; existing Vercel project `prj_Ot6AP8eMEzEMvvyqEybYW5jjVFbG`, team `team_nympTu9S1PETNzC57JNj8QlY`. User explicitly requested urgent production repair. No paid resources or external data upload.

| Gate | Status | Evidence / limits |
|---|---|---|
| RED reproduction | PASS | `node --experimental-strip-types --test lib/auth-callback.test.mjs`: old code fails flow-selector and real-SDK overlapping-flow tests |
| GREEN / regressions | PASS | `node --experimental-strip-types --test`:234tests pass after Next/DOMPurify patch; real SSR SDK/cookie jar, mocked token transport, two overlapping valid flows, invalid/empty/unknown selectors and legacy recovery |
| Lint / types | PASS | `npm run lint`; `tsc --noEmit`; lint repeated after development-only Zod patch |
| Production build | PASS | `NEXT_PUBLIC_SITE_URL=https://parth-careers.vercel.app NODE_OPTIONS=--max-old-space-size=2048 npm run build -- --webpack`; no code/context reductions |
| HTTP smoke | PASS | Local production `/auth/login`200, failed/cancelled callback307 to canonical login, unauthenticated `/dashboard`307; invalid callback issues no session cookie |
| Browser journey | PASS | Isolated Chromium, canonical HTTPS origin mapped to local production server: hydrated Google button, correct project/callback, flow selector and matching verifier cookie before redirect, zero page errors. External authorize request aborted; no Google account signed in |
| Independent security review | PASS | Separate read-only agent reviewed PKCE/redirect/access boundaries and dependency diff; no actionable new finding. Not a penetration-test claim |
| Auth/privacy/accessibility | PASS scoped | Internal redirect sanitizer, trusted exchange and user/account checks remain. Existing login labels/keyboard controls/error alerts unchanged; browser button works. No complete WCAG audit claimed |
| Dependency advisories | PASS critical/high | Existing critical Next and DOMPurify advisories patched; subsequent dev-only Zod high patched within existing range. Full audit:0critical/0high,16moderate development-only notices remain. No affected production packages in final audit |
| Production Google account completion | NOT TESTED | Requires an actual user's fresh sign-in/consent after deployment; no password, Google session or real confirmation/reset email used by tests |
| Load / p95 / p99 | NOT APPLICABLE | Narrow auth incident; two overlapping synthetic flows tested, no stress test or performance claim |
| Data migration / restore | NOT APPLICABLE | No schema/data mutation; no auth/session clearing or credential rotation. Full data restore not exercised |
| Public launch readiness | NOT READY (broader product) | This hotfix does not certify all Careers features, account recovery delivery, browser/device matrix or public launch acceptance |

Initial anonymous HTML-only smoke incorrectly expected client-rendered Google text in a static shell; corrected to validate the loading shell plus actual Chromium hydration. Initial direct localhost browser check exercised the existing localhost callback default; the canonical-origin test preserves the production callback assertion while mapping all app responses to the local build. Neither adjustment bypasses auth checks.

### Security findings and remediation

- **AUTH-01 / high availability impact:** overlapping login verifier mismatch, confirmed in production logs. Owner: Parth Software Labs. Matching flow selection repaired;234regressions and protocol/browser checks pass. Actual owner Google completion remains unverified.
- **DEP-01 / critical:** Next16.3.8 in affected ranges ([SVG image optimizer](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [cached typed arrays](https://github.com/advisories/GHSA-673q-mjm6-r5xr), Server Actions DoS). Remediation: pinned Next/eslint-config-next16.4.3; final audit no critical/high.
- **DEP-02 / critical:** DOMPurify3.4.12 ([template bypass](https://github.com/advisories/GHSA-cg2g-xh64-v4q7) and related notices). Remediation: pinned3.4.17, existing sanitizer configuration retained; build/types pass.
- **DEP-03 / high, dev-only:** Zod collection memory exhaustion via lint tooling. Updated existing transitive dependency within allowed range; lint and full audit retested, no high notices remain.

### Deployment, smoke and rollback

Prior active production deployment: `dpl_Hxf8EVGNoE4F39sxNbHisnYLCnyb` (`parth-careers-8925wz2td-dineshkothari-rds-projects.vercel.app`); the initial CLI project summary omitted Git-link metadata. Raw project/deployment metadata subsequently confirms both Careers and legacy JobPilot projects share this Git repository; use Git deployment for subsequent changes to avoid duplicate builds. Verify new deployment READY and canonical alias before declaring it deployed. Run canonical login rendering and Google-initiation cookie smoke after deployment. Rollback: use Vercel's rollback to this recorded deployment if the hotfix breaks service; that previous deployment contains the noted dependency advisories, so rollback is temporary incident recovery, not a security resolution. No schema rollback is needed. Actual traffic rollback/Google-account completion has not been exercised.


## Follow-up: legacy domain still starts login — 1 November 2026

Owner reports that login starts on `jobpilot-murex.vercel.app` and still fails on Careers. Initial PKCE hardening alone did not resolve this actual user journey. Both sites return200 and share Supabase project `brfonerzkmmtlehjzaeb`. Isolated browser shows the legacy copy creates its callback/verifier on the legacy origin. A controlled cancelled OAuth round-trip proves the canonical callback returns to canonical `/auth/callback` with its flow selector; requesting the old callback instead falls back to canonical root and loses the selector. This establishes the cross-origin cause without accessing a Google account. Current canonical Supabase routing works; do not add the deprecated site back to the allowlist.

The two Vercel projects are `parth-careers` (`prj_Ot6AP8eMEzEMvvyqEybYW5jjVFbG`) and legacy `jobpilot` (`prj_SV2kVbZfIxQOoHoFJNas2gSO4LxZ`), both owned by the verified team and Git-linked to repository1368459516. The first hotfix's active canonical deployment was `dpl_3G4Dma2HBuvBkwDm78uDQvtDzvgH`, READY from Git SHA96cc71c13e2199564d3e7eb62533cb2c41deca7e; the separately requested manual deployment was redundant. Legacy prior deployment: `dpl_471gVFDG8uyu36o7eGvfxpyFYAxf`.

### Canonical entry correction

`proxy.ts` now redirects GET/HEAD page requests on the three verified legacy production aliases to constant `https://parth-careers.vercel.app` **before session reads or login initialization**. Ordinary paths/query filters are retained. Legacy auth paths and code-bearing roots restart at clean Login with only a sanitized non-auth `next`; old code/flow/error parameters are discarded because cookies cannot transfer between hosts. An explicit empty fragment prevents browsers inheriting old token fragments. Old fragment anchors intentionally do not transfer. APIs, mutations, canonical host and arbitrary preview hosts retain existing behavior. The target origin is fixed, with pathname assigned separately, so a double-slash path cannot become an external redirect.

- **RED / PASS:** old proxy serves200 instead of required307 for legacy login. Independent review then identified fragment inheritance; stricter header regression fails before applying the empty-fragment fix.
- **GREEN / PASS:**235full Node tests; final targeted assertions include all three aliases, root, ordinary path/query, old callback credentials, unsafe `next`, synthetic old token fragment and `//evil` path. Lint/types pass.
- **Security / PASS scoped:** separate reviewer confirms no blocking open redirect, loop or access regression; fragment finding closed and independently retested with `node --test --test-name-pattern='legacy hosts' lib/auth-callback.test.mjs`. No real-account or invasive pentest performed.
- **DATA / NOT APPLICABLE:** no session transfer, user deletion, RLS change, credential rotation, schema or Supabase settings change.
- **OWNER GOOGLE COMPLETION / NOT TESTED:** verify a fresh sign-in after canonical entry deployment. Do not treat earlier browser-initiation smoke as completed Google authentication.

Git deployment must finish for **both projects** before checking the old bookmark again. Verify old Login redirects to canonical Login before Google starts; Google initiation must retain canonical origin, flow selector and same-origin verifier cookie. Test old root with a synthetic token fragment and confirm it is dropped. Keep production callback/unauthenticated API denial checks. Actual owner Google completion remains separate acceptance.
