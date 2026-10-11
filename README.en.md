# Dot Console

[简体中文](README.md) | **English**

**Keep multiple projects, factual task progress, and machine resources in one local dashboard.**

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](LICENSE)
[![Node.js: 22.13+](https://img.shields.io/badge/Node.js-22.13%2B-green.svg)](dot-panel-main/package.json)

Dot Console is a task dashboard for personal and AI-assisted development workflows. It groups explicitly reported events by project and shows the current stage, latest results, next steps, blockers, and verification timestamps, alongside compact memory, disk, and CPU readings. It is designed to stay open on a Linux desktop or cloud desktop while you follow work across multiple projects.

## Features

| Feature | Description |
| --- | --- |
| Project grouping | Summarizes running, waiting, blocked, pending-confirmation, completed, and canceled tasks; orders projects using actual task-start events. |
| Independent task cards | Each project card scrolls independently and displays task stages, latest results, next steps, and blockers. |
| Progress and verification | Separates substantive progress from explicit checks. Overdue verification displays a neutral reminder rather than automatically failing a task. |
| Factual reporting CLI | Supports `start`, `milestone`, `checkpoint`, `blocked`, `complete`, `cancel`, `due`, and `run`. |
| Incremental synchronization | Reads local events about every 2.5 seconds, with deduplication, reconnect retries, and resets when the event file changes. |
| Resource monitoring | Displays memory, filesystem usage, and CPU. Unavailable measurements and expired readings appear as unknown. |
| Local startup | Includes a portable launcher, health checks, and optional Linux X11 display settings and desktop-login startup. |
| Original dashboard | `/dashboard` retains upstream project, decision, calendar, usage, and layout modules; their data requires separate configuration. |

The current task interface updates continuously. The earlier pause control has been removed.

## How it works

```text
Human / Agent / Your own script
        | Explicitly calls local/report.mjs
        v
Local task-events.jsonl
        | Read-only event endpoint
        v
Dot Console project and task dashboard
```

The dashboard displays reports that have actually been written. It does not automatically scan every agent session, schedule work, or execute tasks. Connection status describes data synchronization; verifying that a task is still running requires explicit evidence. `run` can observe only the command process it starts itself.

Services bind to `127.0.0.1` by default for single-user local use. This repository publishes source code. Task records, databases, environment configuration, and personal dashboard data created at runtime stay local and are excluded by `.gitignore`. Never use localhost fixture identities in a public deployment.

## Quick start

The desktop startup workflow targets **Linux X11**. Requirements: Node.js **22.13+** (24 recommended), npm, Python **3.10+**, and Bash. `xrandr` and `xdg-open` are optional desktop tools. Complete desktop installation on macOS, Windows, and Wayland has not been validated.

```sh
git clone https://github.com/AshWood97/Dot-Console.git
cd Dot-Console/dot-panel-main
npm ci
npm run build
cp .dev.vars.example .dev.vars
npx --no-install wrangler d1 migrations apply DB --local
bash ../start.sh --no-open --no-display
```

Open [http://127.0.0.1:8787/](http://127.0.0.1:8787/) on the machine running the service. A new installation starts with no task records. The original dashboard is available at `/dashboard`.

Run `bash ../start.sh` to also attempt an advertised 16:10 display mode and open the browser. Dependencies and build output are not bundled; `npm ci` needs access to the npm registry. See [INSTALL.en.md](INSTALL.en.md) for ports, foreground operation, login startup, and recovery.

## Report your first task

Run these commands inside `dot-panel-main/`. Keep the same project and task identifiers in subsequent reports; reuse `--id` when retrying the same report. Report the example results only after you have actually completed the corresponding steps.

```sh
node local/report.mjs start --project Example --task build \
  --id example-build-start --title 'Build the example project' \
  --message 'Started the project build' --stage 'Building'

node local/report.mjs milestone --project Example --task build \
  --id example-build-result --message 'Verified that the build succeeded' \
  --done 'Build output generated' --next 'Inspect the page'

node local/report.mjs checkpoint --project Example --task build \
  --id example-build-check --evidence 'Inspected the generated page'

node local/report.mjs complete --project Example --task build \
  --id example-build-complete --message 'Page inspection completed' \
  --done 'Build and page inspection completed'
```

Reports default to `task-events.jsonl` in the repository root. Set `DOT_CONSOLE_EVENTS` or use `--file` to select another location. See the [reporting guide](dot-panel-main/local/REPORTING.md) for additional fields, blockers, command wrapping, and verification rules.

## Technology and layout

The frontend uses React 19, TypeScript, and Vite. The local gateway and reporting tools use Node.js. The original dashboard backend uses Cloudflare Workers, D1, and Drizzle ORM. Desktop startup and source-packaging tools use Python and Bash.

```text
Dot-Console/
├── README.md                 # Chinese project guide
├── README.en.md              # English project guide
├── INSTALL.md                # Chinese installation guide
├── INSTALL.en.md             # English installation guide
├── LICENSE                   # GNU AGPL v3
├── PROVENANCE.json           # Source and version boundaries
├── PACKAGE_CONTENTS.json     # Source-package integrity manifest
├── start.sh                  # Resolves the nested source location
└── dot-panel-main/
    ├── src/                  # React UI and resource monitoring
    ├── local/                # Gateway, events, reporting, desktop startup
    ├── lib/                  # Project identity, task aggregation, shared logic
    ├── worker/               # Original dashboard Worker / MCP backend
    ├── db/ & drizzle/        # Database schema and migrations
    ├── tests/                # Regression tests
    ├── scripts/              # Validation, build, and packaging tools
    └── agent-skills/          # Upstream setup, maintenance, widget guides
```

Keep the `dot-panel-main/` directory: the outer launcher depends on that layout. Customize project names and aliases in the [project identity registry](dot-panel-main/lib/project-identity.mjs). Source retains name mappings from the original environment, without those projects' actual task histories.

## Development and verification

Publication preparation on 2026-10-11 used macOS, Node 24.19.0, and Python 3.12. A fresh `npm ci`, production build, main tests, widget template tests, database recovery rehearsal, and Worker runtime checks passed. Local regressions passed 103 tests, with one original-host private-history test skipped. Usage tracking passed 24 tests, source packaging passed 14 tests, and documentation integrity checks passed. Desktop startup passed 11 of 12 tests: disabling autostart failed because the script uses GNU `sed -i` syntax, which differs from macOS BSD sed. This verification establishes neither macOS desktop installation support nor fresh evidence of actual Linux desktop-login behavior.

Run inside `dot-panel-main/`:

```sh
npm run test:local
npm test
npm run test:template
npm run test:recovery
npm run test:runtime
npm run test:usage
npm run build
python3 scripts/check-docs.py
python3 -m unittest discover -s tests -p 'test_desktop_start.py' -v
python3 -m unittest discover -s tests -p 'test_package_local.py' -v
```

Source integrity checks read `SOURCE_MANIFEST.json`. Refresh source hashes and package manifests after changing included source or documentation. The nested `.github/workflows/` files are retained upstream files; their location means they do not automatically run as this repository's GitHub Actions workflows. Upstream releases and historical platform checks do not establish new releases or platform certification for this project.

## Provenance and license

This repository was migrated from the Dot Console `main` branch on Gitea, preserving its commit history. The application-source baseline for GitHub publication is `3e5da01`, including resource monitoring and the simplified console header. See [PROVENANCE.json](PROVENANCE.json).

Dot Console is a modified version of [graydeon/dot-panel](https://github.com/graydeon/dot-panel). It retains upstream source, copyright notices, and **GNU AGPL version 3 only (`AGPL-3.0-only`)**. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](dot-panel-main/THIRD_PARTY_NOTICES.md). The current combined application, including its modifications, remains under AGPL; dependencies retain their own licenses.

A permissive license such as 0BSD cannot replace the license of inherited upstream code without appropriate authorization from the relevant copyright holders. Changing the repository's license file alone would not grant that authorization. See [upstream AGPL section 5](https://github.com/graydeon/dot-panel/blob/main/LICENSE) and the [GNU licensing FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#Consider).

This project is not officially affiliated with OpenAI, ChatGPT, or Cloudflare. Submit issues and suggestions through [GitHub Issues](https://github.com/AshWood97/Dot-Console/issues). See [SECURITY.md](dot-panel-main/SECURITY.md) for deployment identity and data-handling boundaries.
