# Verification report

Date: 2026-10-11 UTC. Node.js v24.19.0. This report concerns only the new independent implementation.

## Automated checks: passed

`npm test`: **23 tests passed, 0 failed**.

1. Project status precedence: running, failed, waiting, completed.
2. Summary counts projects once rather than counting tasks.
3. Check freshness distinguishes fresh, stale, unknown and clock mismatch.
4. Future timestamps are not described as current.
5. Text escaping preserves text without HTML control characters.
6. Missing resource values remain unavailable, never fabricated zero.
7. Text-only search includes task details.
8. Empty first installation and restart persistence.
9. Invalid/unknown fields, unsafe IDs, missing names and bad states rejected.
10. New starts/restarts order projects; ordinary progress/checks do not.
11. Event deduplication survives restart; conflicting reuse is rejected.
12. Export/import project-task roundtrip and atomic collision rejection.
13. Malformed import/startup preserves existing bytes and fails visibly.
14. Failed persistence does not change in-memory state.
15. API validation, Origin/Host protection and non-mutating polling.
16. Exclusive server data-directory lock and source-symlink rejection.
17. Import restores the event ledger and prevents duplicate report replay.
18. Future/overflow timestamps rejected on import.
19. Chunk-split UTF-8 Chinese input remains intact.
20. Invalid ports fail before acquiring a storage lock.
21. Missing start timestamps mean unknown, never an assertion that work never started.
22. Completed and waiting projects without start records display an unknown-start label.
23. Metric provenance labels preserve host fallback versus container/data-filesystem distinctions.

Syntax checks passed for server, CLI, demo reporter, and browser app.

An independent review additionally exercised an exact 1,048,576-byte state: persisted restart, compact CLI export, and import to an empty instance succeeded. Raw HTTP hostile Host, cross-origin and null-origin requests were rejected. Browser export now uses the same compact serialization. Release package contents were checked against an explicit source allowlist; runtime state, logs, dependencies, and private records are excluded.

## Real-browser verification

Verified in the cloud desktop browser with the new service on loopback port 8795:

- Fresh empty installation displayed no invented projects.
- Five current projects reported through the public API appeared live and survived reload.
- Search narrowed the view to 2 of 5; clearing restored all 5.
- Waiting-state filtering showed 3 of 5; clearing restored all 5.
- Canceling the import file chooser did not mutate state.
- The compact Chinese-first layout makes portrait project cards the main content at approximately 1164 × 744. Decorative landing-page content and oversized summary tiles were removed.
- Final browser refresh confirmed Dot Console branding and Chinese resource-provenance labels.
- A real window resize to 643 × 757 produced a two-column layout; measured document scroll width equaled the 643px client width, with no horizontally clipped content. The original wide window was restored.

No private project names, records, screenshots, or runtime files are included in this report or package.

The zoom shortcut had no effect; 200% zoom was **not** verified. Live disconnect/reconnect, keyboard-only import confirmation, the full successful browser-import path, and browser export-download roundtrip were not exercised in the real browser. API import/roundtrip/failure behavior is covered separately by automated tests.

## Deliberate limits

- Task status reflects reports; page polling does not execute or verify external tasks.
- No assistant-internals, quota, cloud-preview reconnect or desktop-resolution integration.
- Metrics use cgroup v2 limits when available; fallback host metrics are labeled. cgroup v1-specific accounting is not implemented.
- Deduplication retains the latest 2,000 event IDs; very old reports must not be retried.
- One server per DATA_DIR; crash recovery requires checking the old process is stopped before removing its lock.
- Imports merge and reject project-ID collisions; no destructive overwrite mode.
- 1 MiB persisted JSON state, 250 projects and 250 tasks per project, further constrained by the byte bound.
- Single-user, loopback-only deployment. Untrusted local processes are outside its security boundary.
- Rights/provenance review remains pending before public distribution; this is not legal or security certification.
