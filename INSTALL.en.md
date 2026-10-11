# Install and run Dot Console

[简体中文](INSTALL.md) | **English**

Dot Console is distributed as source. The desktop workflow targets Linux X11 and requires Node.js 22.13+ (24 recommended), npm, Python 3.10+, and Bash. Install dependencies and generate build output locally.

## Installation

Clone into a new directory rather than overwriting an existing running installation:

```sh
git clone https://github.com/AshWood97/Dot-Console.git
cd Dot-Console/dot-panel-main
npm ci
npm run build
cp .dev.vars.example .dev.vars
npx --no-install wrangler d1 migrations apply DB --local
bash ../start.sh --no-open --no-display
```

For a source ZIP created by `scripts/package-local.py`, extract it, enter `dot-console-local-review/dot-panel-main/`, and start with `npm ci`. Both installation methods require the relative layout of the outer `start.sh` and inner `dot-panel-main/` directory.

Fixture identities are for localhost development only. A fresh installation uses a new local database and has no task records; it does not import the author's task history. Write reports using `node local/report.mjs`. See the [reporting guide](dot-panel-main/local/REPORTING.md).

## Addresses and ports

| Address / port | Purpose |
| --- | --- |
| `http://127.0.0.1:8787/` | Project and task dashboard |
| `http://127.0.0.1:8787/dashboard` | Original dashboard |
| `127.0.0.1:8788` | Local Worker backend |
| `127.0.0.1:9229` | Worker debugger |

Open the browser on the machine running the service. If the desktop and command executor have separate localhost namespaces, start the service in the target desktop's terminal. Reports default to the outer `task-events.jsonl`, excluded by Git; override the file using `DOT_CONSOLE_EVENTS` or the CLI's `--file` option.

## Startup options

Run inside `dot-panel-main/`:

```sh
bash ../start.sh                          # Check/start, attempt display setup, open browser
bash ../start.sh --no-open --no-display   # Check/start service only
bash ../start.sh --foreground --no-open --no-display  # Keep a new service in the foreground
bash ../start.sh --open                   # Explicitly request another browser open
```

The launcher reuses a healthy service. It reports an occupied, unhealthy port without killing the existing process. `--foreground` affects only a newly started service; it does not take over an existing one. A service started in the default background mode continues after the launcher exits.

Display setup selects only a 16:10 mode already advertised by `xrandr`, preferring 1280×800. If no suitable mode is available, it leaves the display unchanged. It creates no custom modes. Without X11 or `xdg-open`, use service-only mode and open the URL manually. Complete desktop installation on Windows, macOS, and Wayland has not been validated.

`--open` may create an additional window or tab. Ordinary repeated calls use a machine-local marker to suppress duplicate open requests; that marker does not establish that the browser tab is still open.

## Optional desktop-login startup

After verifying your local installation, enable login startup if desired:

```sh
bash local/install-desktop.sh --enable
```

To disable future login startup:

```sh
bash local/install-desktop.sh --disable
```

Enabling writes a current-user XDG autostart entry and immediately runs the startup flow once; the installer refuses to overwrite an unmanaged entry. Disabling reversibly sets `Hidden=true`. It does not stop services, close tabs, or reset the display.

Only desktop environments that process XDG autostart consume this entry. Consumption by the original cloud desktop, automatic opening after reboot, and remote-viewer reconnect hooks have not been verified. Rerun the installer after moving the checkout.

## Source and integrity

This project is an AGPL-3.0-only derivative of [Dot Panel](https://github.com/graydeon/dot-panel). Preserve its license, copyright notices, and third-party notices. See the outer `PROVENANCE.json` and inner `dot-panel-main/SOURCE_MANIFEST.json`. File hashes provide integrity checks.

See [README.en.md](README.en.md) for development checks. Generate and validate a separate source package from the inner directory:

```sh
python3 scripts/package-local.py --output /absolute/new/output-directory
python3 scripts/package-local.py --validate /absolute/new/output-directory/dot-console-local-review.zip
```

The packager reads the current selected source and excludes dependencies, build output, non-example environment files, task records, databases, logs, and machine-local state. Packaging neither installs services nor publishes anything over the network. Provenance fields in a generated package describe that local packaging operation.
