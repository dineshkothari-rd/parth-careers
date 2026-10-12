# Resume Storage Reproducibility

**Status:** Implemented locally; production rollout pending
**Priority:** P0
**Last verified:** 2026-09-27

## Problem

The resume upload screen writes PDF files from the browser to a private Supabase Storage bucket named `resumes`, then inserts metadata into `public.resumes`. Migration `20260927115054_create_private_resume_storage.sql` reproduces this contract on a fresh local reset and safely configures an existing bucket without deleting objects. Migration `20260929072412_allow_resume_delete_lookup.sql` adds the operation-scoped owner lookup required by the Storage API's bulk-delete route without allowing listing or download.

## Current behavior

- Bucket: `resumes`.
- Object key: `<authenticated-user-id>/<random-uuid>.pdf`.
- Upload: authenticated browser client, exact browser MIME `application/pdf`, maximum `5 * 1024 * 1024` bytes (5 MiB), `upsert: false`.
- Metadata: original name, object path, size, MIME type, extracted text and parsed JSON are stored in `public.resumes`.
- Cleanup: if the metadata insert fails, the client attempts to remove the uploaded object; deleting a resume also attempts object removal.
- Access assumption: authenticated users can create and delete only objects under their own first path segment.
- Baseline: bucket configuration, restrictive guards, owner insert/delete policies, and denial tests are present locally.

## Implemented migration

Add one idempotent migration that:

1. Inserts or updates `storage.buckets` for `id = 'resumes'`, with `public = false`.
2. Sets the bucket file-size limit to `5 * 1024 * 1024` bytes, matching the current upload UI.
3. Restricts allowed MIME types to `application/pdf`.
4. Grants authenticated browser clients insert and delete only; current runtime has no object list/read/update flow.
5. Requires `bucket_id = 'resumes'` and `(storage.foldername(name))[1] = (select auth.uid())::text` for permitted operations.
6. Adds scoped restrictive guards so unrelated permissive policies cannot widen this bucket; service role still bypasses RLS.

Separate policies keep privileges reviewable. The bucket is private. A future download must add an owner-read policy or produce a signed URL through a trusted server after verifying `public.resumes.user_id`.

## Browser permissions

| Operation | Required | Ownership rule |
|---|---:|---|
| Upload PDF | Yes | First folder equals authenticated user ID |
| Read/list object | Only if the product exposes download or preview | Same prefix; do not make bucket public |
| Replace object | No for current random-key flow | Keep denied unless a real update flow requires it |
| Delete object | Yes | Same prefix |

Before implementing, confirm whether current SDK list or download calls exist. Omit permissions the runtime does not use.

## Rollout

1. Preserve the current 5 MiB byte limit in both client validation and bucket configuration.
2. Validate the migration in a disposable cloud database; local resets are removed.
3. Run database policy tests and manually upload and delete a PDF as two different test users.
4. Apply to staging and verify existing objects remain private and accessible to their owners.
5. Apply to production during a low-risk window; bucket creation and policies are additive and should not rewrite objects.
6. Re-run Supabase security and performance advisors and document intentional findings.

## Verification and remaining follow-up

- pgTAP verifies bucket privacy, size/MIME configuration, owner insert, cross-user/anonymous denial, update denial, and owner-only delete policy metadata.
- Supabase intentionally blocks direct SQL deletion from `storage.objects`, so production rollout must smoke-test owner deletion and cross-owner denial through the Storage API.
- A fresh local reset creates the bucket and policies without dashboard steps.
- Failed metadata insertion still uses the existing compensating object delete; orphan reconciliation remains deferred until monitoring proves it necessary.

## Open implementation decision

The database metadata row and Storage object cannot share a transaction. The existing compensating delete is the smallest viable approach. Add an orphan-reconciliation job only if monitoring shows cleanup failures; do not introduce one speculatively.
