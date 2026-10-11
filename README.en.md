# Dot Console

[简体中文](README.md#中文) | **English**

**An independently rewritten local dashboard for multiple projects, factual task reports, and machine resources.**

[![License: 0BSD](https://img.shields.io/badge/License-0BSD-blue.svg)](LICENSE)
[![Node.js: 24+](https://img.shields.io/badge/Node.js-24%2B-green.svg)](package.json)

Dot Console uses Node.js 24 built-ins with no third-party runtime dependencies. Report projects and tasks through a local CLI or API, then view their status, stages, results, blockers, next steps, and resource measurements in the browser. Each project has its own scrollable card, with grouping, search, status filters, and ordering by real task starts.

The current independent implementation uses **0BSD**. Historical legacy commits retain their original AGPL-3.0-only licensing.


### Run and test

Use Node.js 24. From the project directory, run `npm start`, then open <http://127.0.0.1:8795> in a browser on that same machine. The server binds to loopback only. No runtime dependency installation is needed. Run `npm test` in another terminal.

The dashboard records reported state. Opening or refreshing it does not start an assistant, execute a task, or connect to a cloud service. A reported status is not independent verification that an external task is running. Resource information describes the machine hosting this server, not another computer or an assistant's cloud tasks.

### Local data

`DATA_DIR` defaults to `~/.local/share/dot-console-independent`, outside the source tree. Override it when starting the server:

```sh
DATA_DIR="$HOME/.local/share/dot-console-independent-demo" npm start
```

Keep real data out of source control and release packages. Persistence uses bounded JSON, with a maximum on-disk size of 1 MiB including the trailing newline. Its structure has `version: 1`, a `revision`, and a `projects` array containing nested `tasks`. `state.json` is atomically replaced on writes; `state.bak` retains the previous good state. This is a recovery aid, not a historical archive or a replacement for exported backups.

### Report projects and tasks

With the server running, report fictional sample data from another terminal:

```sh
node cli.mjs project '{"id":"demo","name":"Example","group":"Personal"}'
node cli.mjs task demo '{"id":"task-1","title":"Example","status":"running","stage":"Implementation","eventId":"unique-report-id"}'
node cli.mjs check demo task-1
node cli.mjs export /absolute/path/dot-console-backup.json
```

Keep project and task IDs stable. Give each new task report a unique `eventId`. The last 2,000 event IDs form a bounded deduplication window: an identical replay is deduplicated, and a conflicting replay is rejected. Older events outside that window can be accepted again. Reporters must keep IDs unique and avoid resending very old reports.

An ordinary `running` report does not count as a restart. Explicit `restart: true` is required for restart lifecycle and ordering updates. `node cli.mjs check PROJECT_ID TASK_ID` only records `lastCheckedAt`: it does not change task status, stage, or restart ordering, and it does not inspect an external process.

### Export, import, and recovery

Use `node cli.mjs export BACKUP.json` or `GET /api/export` for portable backups. Exports contain your recorded data; store and share them accordingly. `node cli.mjs import BACKUP.json` performs a merge and rejects colliding project IDs instead of overwriting existing projects. To restore a complete export in isolation, start with a new empty data directory and import there. Browser imports require a file selection and explicit confirmation; ordinary browsing does not mutate task state.

Malformed persisted state stops startup instead of silently resetting data. To recover:

1. Stop the server and any other process writing to the same data directory.
2. Preserve the damaged file and inspect `state.bak` for the expected previous good state.
3. When satisfied, copy `state.bak` to `state.json`.
4. Restart with the same `DATA_DIR`, inspect the recovered records, and make an export.

Never replace state files while the service is running. Recovery loses changes made after the backup. Preserve both files for investigation if the backup is invalid too.

An exclusive `server.lock` directory inside `DATA_DIR` prevents simultaneous server instances. A crash can leave it behind; the application never automatically removes a presumed stale lock. First verify that every server using that data directory has stopped, then use `rmdir /actual/data/directory/server.lock` to remove the empty lock directory and restart. Never remove a live server’s lock or delete the data directory as a recovery shortcut.

### Local HTTP API

The CLI uses the local server. Send JSON for write requests. IDs in paths must be URL-encoded when necessary.

| Method | Path | Body / purpose |
| --- | --- | --- |
| GET | `/api/state` | Read current project and task state |
| GET | `/api/resources` | Read resource information for the server's host |
| GET | `/api/export` | Export portable state |
| POST | `/api/projects` | Project object, e.g. `{"id":"demo","name":"Example","group":"Personal"}` |
| POST | `/api/projects/:id/tasks` | Task report object, including its stable task ID and report event ID |
| POST | `/api/projects/:id/tasks/:taskId/check` | `{}`; update `lastCheckedAt` only |
| POST | `/api/import` | `{"mode":"merge","data":EXPORTED_STATE}`; reject collisions |

Treat a non-success response as a failed operation and inspect its error before retrying. For a safe network retry of a task report, resend the same event ID and identical payload.

### Security, contribution, and license

This is a trusted-local-machine application. Do not expose it through a public listener, proxy, tunnel, or preview service. Loopback is not isolation from other local software. See [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

The current implementation was independently rewritten from requirements and is published under **0BSD**. It permits use, commercial use, modification, and distribution without attribution or source-disclosure conditions. The current source tree no longer contains the legacy Console / Dot Panel implementation or its assets. Earlier commits keep their original AGPL-3.0-only terms. See [PROVENANCE.md](PROVENANCE.md) for recorded origin, publication checks, and the history boundary.

The newly authored project material is offered under [0BSD](LICENSE). Runtime and browser software retain their own licenses.

## Optional fictional demo

A new installation is empty. This explicit command inserts four labeled fictional projects. Use a separate test DATA_DIR instance; it does not execute real work.

```sh
node demo.mjs --confirm-demo
```

Set `DOT_CONSOLE_URL=http://127.0.0.1:8796` for a separate demo instance on port 8796.

## Existing repository history

The current source tree is the independent **0BSD** implementation imported from Gitea commit `91abfa8`. The GitHub repository is public. Earlier legacy commits remain in history under their original **AGPL-3.0-only** license; the current `LICENSE` applies to the independent implementation and does not relicense those earlier files. See [the repository-history boundary](PROVENANCE.md#repository-history-boundary).
