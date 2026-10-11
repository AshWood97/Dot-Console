# Passive status board

> Current behavior (2026-10-11): the pause control and “项目进展” subtitle were removed.
> Task data updates continuously. Compact hardware metrics are documented in
> [RESOURCES.md](RESOURCES.md). Pause/resume descriptions and validation below
> are historical evidence for the earlier UI, not current controls.


Local-only single-screen display, replacing the interactive chat timeline at `/`.
The existing dashboard remains at `/dashboard` but is not needed to read progress.

## Reporting

Continue piping one JSON object to `node local/emit.mjs`. All legacy required
fields remain unchanged. Events are appended to `../task-events.jsonl`.

Optional structured fields, each at most 140 characters:
- `stage`: current activity (recommend <= 28 Chinese characters)
- `done`: latest completed result (recommend <= 36 characters)
- `next`: next step (recommend <= 36 characters)
- `blocker`: explicit blocker, or null to clear an older blocker
- `summary`: concise recent-change sentence

Fields persist across events for the same `project` + `task` pair. Omitted fields
mean not updated. Unknown legacy fields are not guessed from message text.
Only `kind=status` or `kind=confirmation` updates task lifecycle status. A passing
test does not complete the task. Keep the same task key when updating a task.

Optional `metrics.tests` is `{passed,total,scope,source}`. Counts must refer to
the same explicit suite/run, passed <= total, both integers, with provenance.
There is no token-speed, total-token, ETA, or percentage inference.
`started_at` can be retained for future integrations but is not currently rendered.

The timestamp shown per task is the event timestamp, labelled “上报”; API poll time
is shown separately in the footer. Ten minutes without a report means “暂无新上报”,
never that the task is stuck. A lost feed preserves cards and explicitly says it
is reconnecting. Refresh every 2.5 seconds, backoff to 15 seconds after errors.

## Portrait project display (2026-10-10)

Projects are persistent equal-width portrait cards. There is no special full-row
tool group. A 250px minimum column permits four project groups at the actual
1096px viewport, then naturally reduces the column count as the host narrows.
The preferred 3:4 ratio (2:3 on tall hosts) never caps content height. Long content
grows the card and page; no internal clipping or automatic rotation is used.
Repository labels are explicit known associations, not live repository sync.

`src/project-model.ts` owns the precise display registry. A版审核 / DramaFlow A,
CutsceneDaily / 行业日报, and Dot Panel / Dot Console aliases normalize on read.
The original JSONL is never rewritten. Unknown names receive independent
`legacy:<name>` identities. No fuzzy matching or title/stage inference is used.

Events are deduplicated by event ID and reduced in append order using canonical
project ID + task ID. A test/tool event cannot complete the task. Existing A版
history reused one task key; it remains one historical combined task rather than
invented phase tasks. Known short task labels are scoped to canonical project ID.

Every task remains in its project, including completed siblings of running work.
Project badges show simultaneous counts; there is no single project lifecycle
that could mask blocked work. A running task with a blocker still displays it.
Task counts and simultaneous status badges live inside each project. The top
header contains only identity. Blockers and confirmation instructions are shown
inside the relevant task in its own project, with no global risk/idle banner.
Feed-wide sync errors and invalid-record warnings remain in the footer.

All active tasks are retained, with natural scrolling when content exceeds the
viewport. There is no ellipsis, line clamp, fixed-count cutoff or fixed card
height. Completed siblings use visible compact result summaries inside any multi-task
project, with the same rules applied to every project.

## Verification

- Production TypeScript / Vite build passed.
- Local event/server/UI/project suite: 45 tests, including exact aliases,
  independent unknown projects, mixed lifecycle counts, same-task aliases,
  repeated event IDs, same-time/late corrections, non-clipping CSS, running
  tasks with blockers, project-scoped confirmation instructions, equal portrait
  cards and no global status/risk banners.
- Original application suite: 38 assertions; template: 8; usage: 24 tests.
  Runtime and recovery suites also passed.
- Real cloud browser: 1096 × 533 shows all four project columns (about 255px
  each) and both business blockers in the first screen. While the layout task
  is running, content is 636px tall because all tool history is retained. The
  terminal/idle fixture fits exactly 533px. Cards have no clipping.
- 1280 × 800 and 1440 × 900: four columns, no page overflow. 900px: three
  columns; 768px: two; 390px: one. Narrow layouts scroll vertically.
- Mixed and eight-project/sixteen-task stress fixtures retain every task with
  no horizontal overflow or clipped card content. Stress height: 1936px.
- `node tests/local/layout-fixtures.mjs` creates temporary local-only QA HTML in
  dist after a build, including actual, narrow, mixed-state and stress cases.
  It never modifies the event stream. Rebuild to remove all generated fixtures.

## Start

Run `bash ../start.sh` on the cloud desktop terminal. The shell and desktop browser
may use different localhost namespaces. Do not assume a server started in another
executor can be reached by this browser. Private address: http://127.0.0.1:8787/.
No external publication, credential creation, model calls, or system resolution
changes were performed.

## Unified reading refinement (2026-10-10)

Four portrait project columns are retained. Actual task states appear as an outline symbol plus visible Chinese text; color is supplemental. Project headers count reported tasks and unresolved attention items separately (overlapping counts, not additive totals). All unresolved blockers/confirmations and their next actions are displayed in the owning project's attention area, without truncation. Ordinary task rows show actual stage/results; no inferred progress, execution duration, trend, cost or token telemetry is shown.

Body text is 14px, supporting text 12–13px and project/stage headings 16px. Longer groups and narrow windows scroll naturally. Initial task ordering favors active work; subsequent status updates do not reorder existing task rows. New task rows append while their unresolved risks appear in the group's attention area. Browser native scroll anchoring is retained; content-height changes can still shift nearby content. This is not a promise of zero pixel displacement.

The optional Pause updates control freezes displayed events and relative report ages while collection continues. The page prominently says the snapshot is not current and counts IDs absent from the snapshot, including after a server reset. Resume applies current collected records. It does not pause actual task execution. Missing timestamps are explicitly unknown. Retained test metrics show their own original report time and scope, never the later task-update time.

Validation: 56 local event/server/model/UI tests, main/template/recovery/runtime/usage suites, TypeScript+Vite build. Cloud Chromium actual 1096×533 (recovery changed the earlier 1104×537 window), 13 static browser fixtures including 390px/1280×800/8 projects/long labels/unknown timestamps/gray: no internal horizontal overflow. Native browser zoom 200% verified DPR2 and 548×266 CSS viewport, then restored 100%. Contrast calculations for nine primary text/background pairs were 4.67:1 or higher; this is not a whole-interface accessibility audit or human reading-time study.

## Equal cards with independent scrolling (2026-10-10)

This supersedes the earlier content-driven card height: every project now has the same breakpoint/viewport-derived height and grid-column width. At 1096×533, all five cards measure 254.75×469 CSS px. Project name, repository label and state/attention counts stay outside the independently scrollable body. The attention details and task rows are retained in full inside that body. A later grid row remains reachable through the outer page scroll.

Each content region is keyboard-focusable with a project-specific accessible label and visible focus ring. Native wheel scroll chaining is allowed at boundaries; no wheel listener, preventDefault, automatic scroll-to-top, or scroll trap is used. Existing keyed DOM elements retain their scroll positions during polling and pause/resume. A real update/resume preserved Dot's scrollTop=240; independently scrolling A did not change Dot. At A's bottom (271), another wheel moved the outer page from 0 to 240. Content edits/removals can still cause native anchor adjustment or maximum-scroll clamping.

Validation: 59 local tests plus main/template/recovery/runtime/usage and build. Real 200% (DPR2, 548×266 CSS viewport) gives equal 320px cards with keyboard-scrolling content; 390×844 gives equal 640px cards with focusable scrolling. Tall cards may require outer page scrolling in very short viewports. Eight-project/long-label fixtures retained equal dimensions and no internal horizontal overflow. Top sync metadata and pause/resume remain available.

## Project overview (2026-10-10)

The compact top report counts each displayed project exactly once: any running or queued task places its project in 进行中; otherwise only a nonempty group whose tasks are all completed with no remaining blocker is 已完成. Every other group is 暂停等待, including failed/needs_confirmation/canceled/unknown task states and an explicitly supplied empty group. An empty event feed has zero groups. Canceled is not reported as successfully completed; individual task labels retain 已取消. Counts are based on the frozen displayed snapshot while paused and resume with the latest collected data. Project attention/task counts remain independent and can overlap with lifecycle categories.

After the requested removal of the two redundant sentences, the project report fits in the existing top bar: at 1096×533 the header is 48px and every card is 469px high. On narrower screens the header wraps without reducing the text size. Card height follows the same viewport/breakpoint formula for every project. No stage count, event count or test count is used as a project count.

## Latest-start project ordering (2026-10-10)

Project order now supersedes the earlier registry-pinned order. A new task entering queued/running, or a previously non-active task entering queued/running again, records a launch. Queued-to-running is the same launch. Ordinary running progress, tool/test evidence, completion updates and replayed event IDs do not refresh it. Request events explicitly carrying queued/running can establish that lifecycle transition. A first evidence-only event does not invent a launch.

All-completed, blocker-free groups trail groups with active or unresolved work. Within each partition, the most recent valid launch timestamp sorts first, with reported_at used only when its event timestamp is invalid/missing. Undated launch history follows dated history and uses deduplicated append ordinal; a tie or no launch evidence retains the registry/first-observed fallback. The newest launch is derived from lifecycle transitions, never from the latest update field. Cancellation remains unresolved/waiting in the overview rather than successful completion.

Project IDs remain React keys, task-row ordering is unchanged, and pause freezes project order and overview counts together. A newly launched/restarted project may move once when the latest state is applied; routine progress does not continuously reshuffle it.

Browser verification found that keyed DOM reordering alone can reset scroll positions in Chromium. The final component records each project's scroll offset and restores it in a layout effect only when project order changes. A local interactive real-component fixture verified A scrollTop=207 both before and after B moves ahead on a new launch; ordinary A progress retains the B,A order. This restoration is project-keyed, not index-keyed, and does not write any real task events.

Final verification note: 65 local UI/model/event/server tests and the TypeScript/Vite build pass. Main/template/recovery and runtime crypto/auth pass. One full-suite run hit the existing Calendar compare-and-swap concurrency assertion (2 winners expected 1) in runtime-isolation. The isolated retry passed; runtime-sites and all 24 usage tests passed. The pre-change extracted source bundle also passed the same isolation test. The 21 checked worker, src/lib, migration, runtime-fixture/test and dependency-lock files are byte-identical to that baseline. This is a recorded intermittent concurrency-test failure, not a claim that the original whole-suite attempt was green or that all backend schedules are proven safe. No backend code was changed for this UI work.

## Timely reporting update (2026-10-10)

The new [factual reporting interface](REPORTING.md) supersedes earlier freshness
wording. `node local/report.mjs` supports report/milestone/checkpoint/due/run.
Active cards separately show substantive progress and verified task/process
activity; 5 minutes is the check target, never an automatic failure signal.
The old emit interface remains compatible. Read the guide for integration,
explicit own-process limits, retry IDs and configuration.
