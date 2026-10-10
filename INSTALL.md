# Dot Console local review/install bundle

This private source snapshot includes the current Dot Console UI, local read-only
task-feed gateway, desktop bootstrap, reversible XDG login installer, tests and
the portable outer `start.sh`. It is a locally modified AGPL-3.0-only version of
[Dot Panel](https://github.com/graydeon/dot-panel). Preserve the copyright,
`dot-panel-main/LICENSE` and `dot-panel-main/THIRD_PARTY_NOTICES.md`.

This is a source review/install bundle. It is not a new skills-plugin release,
hosted deployment or public-directory submission. Owner-specific project labels
remain in the source. Do not publish it without a separate source/privacy review.
Historical upstream release documents are retained as attribution/context; they
do not establish tests or platform acceptance for this modified snapshot.

## Prerequisites and clean local setup

Use a new folder on the intended Linux X11 desktop. Do not extract over a working
installation. Node 22.13+ (24 recommended), npm, Python 3.10+ and Bash are required.
The optional display/open steps use `xrandr` and `xdg-open` when available. No
dependencies or prebuilt UI are bundled. `npm ci` needs registry access and runs
the dependency installation described by the included lockfile; use your normal
approved software-installation process. No root privileges are required.

After extracting, run in a Terminal on that desktop:

```sh
cd dot-console-local-review/dot-panel-main
npm ci
npm run build
cp .dev.vars.example .dev.vars
npx --no-install wrangler d1 migrations apply DB --local
bash ../start.sh
```

The example identity is a localhost-only fixture. Never deploy it. The local
Worker uses a fresh `.wrangler/` database; this package contains no old dashboard
state. The app is at `http://127.0.0.1:8787/`; the legacy dashboard is at
`http://127.0.0.1:8787/dashboard`. Gateway/backend/inspector ports are 8787, 8788
and 9229 on loopback. An occupied but unhealthy gateway port is left untouched.

The feed starts empty because private event history is excluded. Reports may be
added explicitly using `node local/emit.mjs`, as described in
`dot-panel-main/local/PASSIVE-BOARD.md`. New reports live in
`dot-console-local-review/task-events.jsonl`, outside the source folder. The app
does not read assistant session files or automatically collect all tasks.

Paths in older local verification notes describe the original host. For this
extracted bundle use `bash ../start.sh` from `dot-panel-main`, or `bash start.sh`
from the bundle root. The launcher resolves its location and supports spaces.
Keep the bundle folder together. This source bundle is portable between supported
Linux environments; it is not an offline binary or a macOS/Windows installer.

## Desktop startup and its limits

Defaults make a one-shot attempt to select an advertised 16:10 display mode,
prefer 1280×800, verify the current mode, reuse/start the local service and ask
the desktop browser opener to display it. If no supported mode is advertised,
the display is unchanged. The original host verified 1280×800 and repeat-call
reuse. A different host still needs its own check.

Optional login startup, only after explicitly choosing it:

```sh
bash local/install-desktop.sh --enable
```

This writes a current-user XDG autostart entry and immediately runs the bootstrap.
It refuses to replace an unmanaged entry. Whether the original managed desktop
consumes the entry at login is unverified. Logout/reboot was not tested. This
is not a supported viewer-reconnect hook and does not guarantee an automatic
open whenever a remote viewer reconnects. Cloud-computer recreation can remove
the source and configuration. Moving the folder requires rerunning the installer.

```sh
bash ../start.sh --open       # Explicit restore; may create another tab/window
bash ../start.sh --no-open --no-display  # Service only
bash local/install-desktop.sh --disable # Reversibly set Hidden=true
```

Disabling does not kill the service, close tabs or reset the display. Open-request
markers only suppress repeated requests; they do not inventory browser tabs.
See `dot-panel-main/local/DESKTOP-STARTUP.md` for behavior and original-host
verification limits. Runtime locks, open markers and startup logs live under
machine-local `/tmp`, and are not part of the bundle.

## Review, integrity and reproducibility

`PROVENANCE.json` identifies the local snapshot boundary and historical upstream
baseline. `PACKAGE_CONTENTS.json` hashes all other entries; the regenerated
`dot-panel-main/SOURCE_MANIFEST.json` hashes current source, with no inherited
passing-test claims. Hashes detect changes but are not an authenticity signature.

**2026-10-10 installation limit:** an offline clean `npm ci` attempt could not
complete because `youch-core@0.3.3` was missing from the available npm cache
(`ENOTCACHED`). Clean dependency installation is **not a passing check** for this
delivery. Extracted-source regression uses a copy of the existing dependency
tree, checked against the lockfile, and must not be described as a fresh install.
A fresh machine needs access to the package registry or a complete approved cache.

From `dot-panel-main`:

```sh
python3 scripts/package-local.py --validate /absolute/path/dot-console-local-review.zip
python3 scripts/check-docs.py
python3 -m unittest discover -s tests -p 'test_package_local.py' -v
python3 -m unittest discover -s tests -p 'test_desktop_start.py' -v
node --test tests/local/*.test.mjs
npm test
npm run test:template
npm run test:recovery
npm run test:usage
npm run test:runtime
npm run build
```

Only the host-history-dependent test is allowed to skip when private history is
absent. All synthetic tests should still run. Python packaging tests need no
third-party dependencies. Test output and execution environment should accompany
any claims about this exact archive; a generated manifest alone is not a test pass.

To reproduce the source ZIP from an unchanged extracted bundle:

```sh
python3 scripts/package-local.py --output /absolute/new/output-directory
sha256sum /absolute/new/output-directory/dot-console-local-review.zip
```

The builder reads the current included files, uses sorted stored ZIP entries,
fixed timestamps and deterministic modes, and does not need Git or network.
It preserves source changes instead of using the historical plugin packager's
pinned commit. Repeated builds of identical source/launcher/instructions are
byte-identical. Packaging runs no services, installs nothing and publishes nothing.

Excluded: non-example environment files and common credential patterns; event
history; `.wrangler`, databases, runtime logs/state and markers; `node_modules`;
all `dist` output including private QA HTML; host-history QA generators; Git/host
configuration; backups, screenshots and prior delivery files. The check is a
bounded filename/content-pattern safeguard, not a comprehensive secret audit.
Original asset sources and notices remain included. Installed dependencies retain
their own licenses; consult those notices before redistributing generated binaries.
