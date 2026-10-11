# Local task progress window

> Current behavior (2026-10-11): the pause control and “项目进展” subtitle were removed.
> Task data updates continuously. Compact hardware metrics are documented in
> [RESOURCES.md](RESOURCES.md). Pause/resume descriptions and validation below
> are historical evidence for the earlier UI, not current controls.


This addition runs only on the dot cloud computer's loopback interface. It does not publish a Site, create a repository, connect external chat, or expose an agent API.

## Start

From the project: `npm run build`, then `bash /workspace/shared/dot-panel/start.sh` in the cloud desktop Terminal.

The startup wrapper now performs a one-shot 16:10 attempt, health check, and normal desktop open. See [desktop startup and restore](DESKTOP-STARTUP.md) for installation, disable/restore commands, current verification, and the important unverified XDG/viewer-reconnect limits.

The gateway serves the built UI at `http://127.0.0.1:8787/`. The original dashboard remains at `/dashboard`; its existing worker runs locally on `127.0.0.1:8788` and is proxied by the gateway. The inspector remains local on 9229. No external listener or tunnel is configured.

The cloud browser and shell tool have separate localhost namespaces. Start the final visible service in the cloud desktop Terminal; the source and event file are shared.

## Report a real event

Pipe JSON to `node /workspace/shared/dot-panel/dot-panel-main/local/emit.mjs`:

```json
{"id":"stable-unique-report-id","project":"Project name","task":"stable-task-id","title":"Task title","kind":"status","status":"running","source":"manual","message":"A factual user-visible progress summary"}
```

Use a stable ID when retrying. Optional `timestamp` is the actual event time in ISO 8601; if unknown, omit it and the report time is used. `reported_at` defaults to the writer's current time. The UI displays date/time in UTC; exact ISO values are available in the event details.

Kinds: `request`, `status`, `tool`, `test`, `note`, `confirmation`.
Statuses: `queued`, `running`, `passed`, `failed`, `blocked`, `needs_confirmation`, `completed`, `canceled`.
Sources: `manual` (human/conversation report), `tool` (verified tool result).
Only status/confirmation events change the task's overall state. A passing test does not mark the entire task completed. Use a new event for corrections; duplicate IDs preserve the first report.

Events are append-only in `/workspace/shared/dot-panel/task-events.jsonl` (outside source/dist). The emitter strips unknown fields, validates shape/size, defaults to a private 0600 file, and preserves readability after an interrupted write. Feed readers deduplicate same-ID races. Do not append internal deliberation, prompts, session logs, credentials, or sensitive material not needed for the user-visible task.

This is curated tool/manual reporting. It is not automatic monitoring of all assistant tasks and does not read internal session files. The gateway exposes no HTTP write endpoint. It is local single-user development software, not a multi-user authentication boundary.

## Behavior

- Incremental 250-event pages using a cursor bound to the consumed event prefix
- Polls about every 2.5 seconds; 10-second request timeout; retry backoff up to 15 seconds
- Keeps existing data during disconnection; resumes after reconnect; resets on file replacement/truncation/correction
- Follows new events at the bottom; preserves scroll position while reading older events
- Task search/switching and all/test/attention filters
- Pause only pauses the window, never the actual task
- Read-only record dialog; confirmation events direct the user to the original conversation
- No pretend chat composer, token animation, cancellation, or approval API
- Host, Origin and Fetch-Site validation, no CORS, no-store, CSP, escaped React text, static realpath containment

The reader caps a file at 16 MiB and reports an explicit error rather than silently dropping history. Archive/rotate the event file deliberately when needed. It rereads the bounded local file per poll; response delivery is incremental. This MVP is not a high-volume log collector.

## Verification

`node --test tests/local/*.test.mjs`: 21 focused cases for validation, paging, reset, dedup, partial tails, localhost security, traversal/symlinks, polling cleanup/timeout/retry and safe React rendering.

Also verified: `npm test` (38 assertions), `npm run build`, `npm run test:runtime`, `npm run test:recovery`, `npm run test:template` (8 assertions), `npm run test:usage` (24 tests).

Browser checks: live curated events arriving; pause then resume catches up; stable IDs display once; task/filter navigation; reading earlier records remains at scrollTop 0 as a new event arrives; detail dialog Escape restores focus. Final reconnection and dashboard navigation are covered in the delivery notes.

Cloud browser chrome remained in a roughly 1188×848 window despite normal maximize/fullscreen actions. The page itself is full-width, compact and responsive. That earlier check did not change the display. The later desktop bootstrap verification selected and verified 1280×800; see DESKTOP-STARTUP.md.

Final browser reconnection was verified by stopping the local gateway: the UI visibly changed to “连接中断 · 自动重试”, retained records and scroll position, then returned to “实时连接” after the gateway restarted. The original `/dashboard` loaded its existing project data through the proxy and returned successfully to the task window. At delivery the task feed was live and the Dot Panel task was marked completed.

## Timely reporting update (2026-10-10)

The new [factual reporting interface](REPORTING.md) supersedes earlier freshness
wording. `node local/report.mjs` supports report/milestone/checkpoint/due/run.
Active cards separately show substantive progress and verified task/process
activity; 5 minutes is the check target, never an automatic failure signal.
The old emit interface remains compatible. Read the guide for integration,
explicit own-process limits, retry IDs and configuration.
