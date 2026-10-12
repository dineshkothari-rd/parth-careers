> Current product identity: **Parth Careers**, part of **Parth Software Labs**. See [branding record](docs/BRANDING.md). Older technical aliases below remain for compatibility. Product readiness is under review.

# JobPilot

JobPilot is a human-in-the-loop Career Operating System. It helps a person move from profile and resume setup through job discovery, application preparation, tracking, interviews, learning, and evidence—without claiming actions or facts it cannot verify.

Last reconciled: 2026-10-08 (source and automated checks; external acceptance is separate)

## Overview

JobPilot combines deterministic career tooling with optional AI assistance. Supabase provides authentication and owner-scoped persistence; Next.js supplies the web application and APIs; Vercel runs the scheduled Autopilot preparation worker.

## Current revenue and launch status

Customers can purchase configured monthly subscriptions and posting packages; the founder constraint is zero provider-subscription spend before launch. Live mode exists behind explicit activation, but production payment/email/calendar credentials and real acceptance are pending. Current Vercel Hobby hosting is non-commercial; migrate to an eligible free commercial host before collecting revenue. No paid upgrades were purchased.

[Current 41-feature status](docs/product/PRODUCTION-PROGRESS.md) · [Revenue setup and safety](docs/development/REVENUE-FOUNDATION.md) · [Complete implementation reference](docs/IMPLEMENTATION-REFERENCE.md) · [UI assessment and competitor R&D](docs/ux-audit.md).

Local layout review: after starting the development server, open `/design-preview`. Its five illustrative screens make no account changes; the route returns 404 in production.

## Core capabilities

- Google sign-in, profile, career preferences, and resume management
- Deterministic job matching, saved jobs, and manual opportunities
- Resume parsing, ATS guidance, tailoring, and export
- Human-reviewed application preparation, tracking, follow-up, and interview planning
- Scheduled Autopilot package preparation—never silent employer submission
- Interview preparation and private practice sessions
- Learning paths, JobPilot completion records, and evidence portfolio
- My Day and dashboard next-action guidance

See [the feature inventory](docs/product/FEATURES.md) for exact status and limitations.

## Trust principles

- Prepared is not submitted. Only explicit user confirmation records submission.
- Suggestions are not candidate facts; JobPilot does not invent experience, skills, outcomes, or market data.
- External AI output is untrusted, validated, bounded, and replaceable by deterministic fallback.
- JobPilot completion records are not third-party certificates or identity verification.
- Sensitive employer answers and final submission remain under user control.

## High-level architecture

The Next.js App Router contains pages and route handlers. Domain logic currently lives mainly under `lib/`; some authenticated browser pages also access Supabase directly through RLS. Supabase PostgreSQL stores application data, Supabase Auth provides sessions, and a private service-role boundary supports scheduled work and server-validated learning/practice writes.

Detailed architecture: [docs/architecture/README.md](docs/architecture/README.md).

## Tech stack

- Next.js 16.3.8 and React 19.2.8
- TypeScript 5.9, Tailwind CSS 4, Base UI
- Supabase Auth, PostgreSQL, RLS, and Storage
- Vercel hosting and daily cron
- Optional OpenAI-compatible and YouTube providers

## Getting started

Prerequisites: Node.js20+ and npm. Use the existing free Supabase cloud project; no local Docker/database.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Resume upload depends on the private `resumes` Storage migration. Verify the cloud bucket and apply new migrations only after review. See [the Storage design](docs/design/resume-storage-reproducibility.md).

Full setup: [docs/development/SETUP.md](docs/development/SETUP.md).

## Environment setup

Configure the public Supabase URL/key and canonical site URL. Server-only secrets enable background Autopilot, privileged learning/practice storage, optional external AI, and optional YouTube search. Never expose server secrets with a `NEXT_PUBLIC_` prefix.

Variable reference: [docs/development/ENVIRONMENT.md](docs/development/ENVIRONMENT.md).

## Supabase setup

Applied migrations are production-sensitive and must never be renamed, rewritten, deleted, or squashed. New schema work requires a new migration. SQL security acceptance uses a reviewed disposable cloud target; never reset the shared owner database.

See [database architecture](docs/database/README.md) and [migration workflow](docs/development/MIGRATIONS.md).

## Development commands

```sh
npm run dev
npm run lint
npm run build
node --test $(git ls-files | grep '.test.mjs')
git diff --check
```

## Testing / quality gate

The verified baseline includes passing Node tests, ESLint, TypeScript, a fresh local Supabase reset, nine SQL security files, and Supabase database checks. The production build is part of the gate; the latest sandbox run was blocked by an OS-level port permission error. The four Phase 2 migrations are intentionally local-only pending human production approval. Test counts are observations, not permanent requirements.

Details: [docs/development/TESTING.md](docs/development/TESTING.md).

## Deployment overview

Vercel hosts the application and calls `/api/cron/autopilot` daily at 03:00 UTC. Supabase hosts Auth, PostgreSQL, RLS, and Storage. Google OAuth must use the Supabase callback followed by JobPilot's `/auth/callback` route.

Deployment checklist: [DEPLOYMENT.md](DEPLOYMENT.md).

## Documentation index

Start at [docs/README.md](docs/README.md) for product, architecture, API, database, security, AI, workflow, development, ADR, and historical documentation.

## Security notes

All user APIs authenticate server-side; user-owned data is protected by RLS; service-role keys remain server-only. `learning_answer_keys` is intentionally service-role only. Supabase leaked-password protection is unavailable on the current Free plan and is an accepted platform limitation.

See [docs/security/README.md](docs/security/README.md).

## Known limitations

- Authentication UI currently supports Google OAuth, not email/password.
- Resume parsing supports text PDFs, not OCR/image-only files.
- New Phase 2 database/Storage migrations await production approval.
- Application records store current state, not complete transition history.
- Follow-up text is generated but no email is sent.
- Autopilot prepares packages but does not submit employer forms.
- Market-demand data is reported as insufficient when no reliable source exists.
- Browser E2E, accessibility, and real-device extension verification remain limited.
