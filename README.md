# Dot Console

Private source repository for the current Dot Console task dashboard. It includes
independently scrolling task cards, project-group counts and sync status, ordering
by the latest real task start, and factual progress/checkpoint/due/run reporting.

This is a locally modified **AGPL-3.0-only** derivative of
[graydeon/dot-panel](https://github.com/graydeon/dot-panel). Original source,
license and notices are preserved in `dot-panel-main/`. See [LICENSE](LICENSE),
[third-party notices](dot-panel-main/THIRD_PARTY_NOTICES.md), and
[snapshot provenance](PROVENANCE.json). The upstream commit in the provenance
file identifies the historical baseline, not this modified version.

## Clone, install and start

Prerequisites: Linux X11, Node.js 22.13+ (24 recommended), npm, Python 3.10+ and
Bash. Keep the nested layout: the outer launcher resolves `dot-panel-main/`
relative to itself. Use a new folder, without overwriting a working installation.

```sh
git clone https://gitea.embervale.cn/zihan/Dot-Console.git
cd Dot-Console/dot-panel-main
npm ci
npm run build
cp .dev.vars.example .dev.vars
npx --no-install wrangler d1 migrations apply DB --local
bash ../start.sh
```

The private repository requires your normal Gitea access. Do not put credentials
in the clone URL, committed files or command history. `npm ci` requires registry
access or a complete approved cache. The provided identity values are localhost
fixtures only. This repository creates no hosted deployment.

Open `http://127.0.0.1:8787/` for the task view, or `/dashboard` for the legacy
view. The first start has an empty task feed. To run just the local service:

```sh
bash ../start.sh --no-open --no-display
```

See [INSTALL.md](INSTALL.md) for ports, optional desktop startup, operating-system
limits and recovery instructions. Optional login startup changes the current
user's XDG configuration and must be chosen explicitly; it is not enabled by
cloning this repository.

## Report real progress

From `dot-panel-main/`, use `node local/report.mjs --help` and
[local/REPORTING.md](dot-panel-main/local/REPORTING.md). Reports and checkpoints
record observed facts. The tool does not automatically collect all assistant
tasks or install a scheduler. Runtime history is written to the ignored outer
`task-events.jsonl` file. No personal task history is included here.

## Checks

From `dot-panel-main/` after dependencies are installed:

```sh
node --test tests/local/*.test.mjs
npm test
npm run test:template
npm run test:recovery
npm run test:usage
npm run test:runtime
npm run build
python3 scripts/check-docs.py
python3 -m unittest discover -s tests -p 'test_desktop_start.py' -v
python3 -m unittest discover -s tests -p 'test_package_local.py' -v
```

The imported source was validated using an existing dependency tree checked
against the lockfile. A clean offline install was blocked by missing cached
`youch-core@0.3.3`; it is not claimed as a passing fresh-install check. Historical
upstream release documents and nested `.github/workflows/` are retained as
source context, not an active Gitea deployment or a claim that hosted CI ran.

## Source boundary

The application and portable launcher are unchanged from the verified
local-review ZIP, SHA-256
`3f777480833c4175765f2a279725af8806adb35a2989e7ac4629831beea463e0`.
The packaging-test synthetic fixture was updated to include the required reporting
and project-identity files; no application behavior changed during this import.
The source/package manifests were regenerated after this fixture-only correction.
Their publication field describes the source-package build step, not this private
repository import. Repository-level README, ignore rules and license copy are
additional packaging files. Owner-specific project labels remain in source.

Excluded: credentials and non-example environment files; task-event history;
`.wrangler`, databases and runtime state; logs and process markers; dependency
trees; generated `dist`; private QA generators, screenshots and local backups.
Original PNG/ICO/SVG brand assets remain included. The root `.gitignore` protects
these categories during normal development; inspect every staged change before
sharing.
