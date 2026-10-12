# Supabase migration workflow

Last reconciled: 2026-10-08 (source and automated checks; external acceptance is separate)

Migration history is production-sensitive. The current chain is synchronized through `20261008004447`. Always inspect the target migration history and exact dry run before applying any subsequent schema change.

## Non-negotiable rules

- Never rename, rewrite, delete, reorder, or squash an applied migration.
- Never fix a historical migration in place.
- Every future schema, function, grant, RLS, trigger, index, or Storage-policy change uses a new migration.
- Never push a migration automatically; show and review the exact change first.

## Safe workflow

1. Inspect current migrations and remote/local history.
2. Discover current CLI syntax with `npx supabase migration --help` and relevant subcommand help.
3. Create the file with the Supabase CLI, for example `npx supabase migration new descriptive_name`.
4. Add the smallest forward-only SQL change.
5. Add/update SQL security tests for ownership, privileges, constraints, and privileged functions.
6. Use a reviewed disposable cloud database; no local runtime:

   ```sh
   # Local database reconstruction removed; validate migrations on a disposable cloud target.
   ```

7. Run:

   ```sh
   # Run the retained rollback SQL fixtures only on a reviewed disposable cloud target.
   ```

8. Inspect migration list and diff. Run relevant advisors.
9. Dry-run the production push using the current CLI-supported flag discovered via `--help`.
10. Present the planned SQL/result for explicit deployment approval.

## Security review

RLS and grants are separate. Review browser table privileges, owner policies, `USING` plus `WITH CHECK` for updates, Storage privileges, `SECURITY DEFINER`, fixed search paths, default function `EXECUTE`, service-role boundaries, and rollback/retry behavior.

## Current accepted baseline

Jobs RLS, immutable ownership, hardened `set_updated_at`, restricted `handle_new_user`, and service-role-only answer keys are deployed. The answer-key advisor INFO is intentional. Resume Storage, application lifecycle, and core-table least-privilege changes are implemented in new local migrations and must not be pushed without human approval.
