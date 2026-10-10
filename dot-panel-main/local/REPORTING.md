# Timely, factual task reporting

## What “timely” means

- When a worker observes a meaningful result, stage change, blocker, cancellation
  or overall completion, write it immediately. Product target: within 1 minute
  of the observation. The CLI returns `lateByMs` for observation/report pairs
  beyond this target. A separately supplied observation can differ from the
  underlying event occurrence time.
- While a task is running or queued, aim to inspect real evidence at least every
  5 minutes. At exactly 5 minutes since the last explicit verification, it is due
  for another check. Existing reports with no explicit verification use their
  latest progress time as a grace period, while still saying verification is
  unrecorded. Missing/future clocks are due with an unknown/clock-skew reason.
- `checkpoint` means “I just inspected this evidence”, not “new progress”. It
  cannot set stages, results, metrics, blockers or lifecycle. It cannot create a
  task, revive completed/canceled work or reorder projects. Old observations do
  not advance clocks. Restarts need fresh verification for the new run.
- The page polls the local event feed about every 2.5 seconds while connected.
  This is transport sync only. It never proves the worker is still operating.
  The active task's compact line separates progress from explicit task/process
  verification. “待核实” is neutral and never changes task status to failure.

These are operational targets, not a hard real-time service guarantee. There is
no platform-wide task/tool hook, scheduler, agent wake guarantee or automatic
access to workers in this integration. A human/worker must call this interface
for work outside an explicitly wrapped process. Closing the page stops page
polling; it does not stop a separate running command or event writes.

## Install / configure

Included with this source tree; Node 22.13+ (Node 24 recommended), no new package,
service, network listener or credentials. After frontend changes run `npm run
build`; the local server serves the rebuilt files. If `local/events.mjs` or
`local/server.mjs` changed, restart that Console gateway once as well; otherwise
an old process may strip new fields or reject checkpoint records. Refresh the
page once after the new gateway is healthy. Never restart unrelated task servers.

```sh
REPORT=/absolute/path/dot-panel-main/local/report.mjs
# Optional; otherwise ../task-events.jsonl relative to the source tree is used.
export DOT_CONSOLE_EVENTS=/absolute/path/task-events.jsonl
node "$REPORT" help
node "$REPORT" due
```

`--file PATH` overrides the environment variable. Configuration is per command
or shell; no automatic startup job or external automation is installed. The
existing `local/emit.mjs` JSON interface remains supported and does not invent
verification evidence for legacy events.

## Worker integration

Call this at actual work boundaries, before long waits or handing results back.
Use the existing exact project/task key. Never create a second task merely to
update its phase. Keep stable IDs across retries; use a new ID for a correction.

```sh
node "$REPORT" start --project Example --task work --title 'Review build' \
  --message 'Started the requested code review' --stage 'Inspecting source'
node "$REPORT" milestone --project Example --task work --id work-test-1 \
  --message 'Scoped regression passed 12/12' --done '12 regression tests passed' \
  --next 'Inspect the browser result'
node "$REPORT" checkpoint --project Example --task work --id work-check-1 \
  --evidence 'Inspected the current test process; it has not exited'
node "$REPORT" blocked --project Example --task work --message 'Required input missing' \
  --blocker 'Waiting for the requested input'
node "$REPORT" complete --project Example --task work --message 'Requested scope verified' \
  --done 'Review and browser acceptance complete' --blocker null
```

`milestone` preserves current lifecycle unless explicitly changed. `start`,
`blocked`, `complete` and `cancel` are explicit lifecycle events. Omitted fields
retain their earlier value, including blockers; use `--blocker null` only after
actually resolving one. Checkpoint never clears one. Completed tasks require an
explicit `start` to restart, rather than a checkpoint or milestone.

For existing producers, pipe the same JSON object to `report.mjs report` instead
of `emit.mjs`. `report` is the low-level interface and trusts the supplied event's
explicit lifecycle. It records an explicit task observation using `timestamp`
(default: now) and `message` (first 500 characters as the evidence excerpt), or
accepts a supplied `verification` object. Supply the actual occurrence timestamp
for late results; never replace it with now to hide a late update. `reported_at`
is assigned at write time. An explicit `verification` contains `observed_at`,
`evidence` and `scope: task|process`; observation cannot be after report time.

`due` outputs a read-only JSON list. The caller must actually check those tasks,
then report real evidence or a real blocker/completion. It must not transform
this list into repetitive automatic “still running” messages.

## Optional own-command wrapper

```sh
node "$REPORT" run --project Example --task work --id own-test-run-1 \
  --label 'Scoped Node tests' -- node --test tests/local/events.test.mjs
```

An already-active task is required. The wrapper launches exactly the provided
command, reports actual process start, checks only that owned PID on a 5-minute
cadence when verification is due, and records process exit or cancellation. PID
existence is process liveness only, never proof of health, forward progress or
success. Process checks do not refresh the progress clock. Real process exits
are tool evidence; success/failure/cancel never completes, fails or cancels the
whole task. The worker must report the appropriate overall milestone separately.
No command output/arguments are copied into the event file. Use a safe label.

SIGINT/SIGTERM relays termination to the owned process group (Windows: child),
with a 5-second kill fallback. Wrapper exit code follows the command; canceled
runs return 130. A stable run ID refuses duplicate launches and uses a local
0600 lock. A crash can leave a lock: inspect the owned command and prior events
before explicitly removing that specific lock or choosing a new run ID. Never
blindly retry side-effectful commands. No wrapper guarantee survives force-kill,
machine shutdown or storage failure; an overdue card will then ask for checking.

## Storage, compatibility and verification

Append-only JSONL, localhost read-only feed, no network or platform session
inspection. Same-ID events are deduplicated by writer/readers. Concurrent writer
races may leave duplicate physical JSONL lines, but are delivered/reduced once.
The bounded reader and writer reject growth over 16 MiB; explicitly archive the
file when necessary. Payloads and checkpoint evidence are bounded. Never write
private prompts, credentials or logs. Keep user-visible factual summaries only.

Legacy event fields, append-order factual corrections, preserved test provenance,
project identities, launch ordering, fixed cards and pause behavior remain.
Substantive progress time is the newest event occurrence time; verified activity
is the newest explicit observation time. Late evidence does not make an old
occurrence look fresh. Pause freezes events and relative ages; network collection
continues and Resume applies the latest data. Terminal tasks do not show freshness.

Validation: `node --test tests/local/*.test.mjs`, `npm run build`, plus the existing
main/template/runtime/recovery/usage regression suites. Tests include exact time
boundaries, unknown/future/older clocks, restarts, duplicates, terminal/blocked
states, paused display, process start/exit/failure/cancel and read-only due output.
