# Cloud desktop startup and restore

## Current verification, 2026-10-10

- Verified in the actual dot cloud desktop: `DUMMY0` reports **1280×800 (16:10)** after the bootstrap; a second invocation leaves it unchanged.
- Verified root HTML and the event API before opening the panel; the existing gateway PID remained `71` across both invocations. No duplicate gateway was started.
- Verified a new service can start in the separate headless executor namespace, then be reused. The test-owned service was stopped afterward; the actual visible gateway was not restarted.
- Installed the current-user XDG entry at `/home/agent/.config/autostart/dot-console.desktop`. **Writing this entry is not evidence that this managed cloud desktop consumes it.** `XDG_CURRENT_DESKTOP=XFCE` was present but no `xfce4-session` process was found. Desktop logout/reboot was deliberately not tested because it would interrupt ongoing work.
- No supported viewer reconnect event is available (the exposed automation event-source list is empty). Closing/reopening the cloud viewer does not necessarily start a desktop session. **Automatic opening on every viewer reconnect is not implemented or verified.** Page visibility changes and feed reconnects are not viewer reconnects.
- Normal `xdg-open` opened a separate Chromium window in this environment. The test window was closed and the original panel retained. Repeated ordinary bootstrap calls suppress additional open requests, but there is no tab inventory/URL deduplication inside the script. An explicit restore or a new session can open another window/tab.
- Cloud-computer recreation may remove the user configuration or source directory. Persistence across recreation is not established.

## Install and defaults

Applies to an authorized Linux X11 desktop with Python 3, Node 22.13+, existing project dependencies and a built `dist/` directory. No package download, root privilege, network/security setting, browser profile preference, custom display modeline, remote listener or tunnel is added.

Run from the **intended cloud desktop Terminal**, not the headless shell executor and not the user's Mac:

```sh
cd /workspace/shared/dot-panel/dot-panel-main
bash local/install-desktop.sh --enable
```

The installer writes an ordinary per-user XDG autostart entry, then runs the bootstrap once immediately. It refuses to overwrite an unmanaged entry. On Linux desktops that actually process XDG autostart, this entry requests the same behavior at desktop login. This platform's login consumption remains unverified as described above.

Defaults are one-shot: apply an advertised 16:10 mode, prefer 1280×800, verify the actual current mode, reuse/start and health-check the local panel, and ask the normal desktop browser opener to show it once. If 1280×800 is not advertised, retain an existing advertised 16:10 mode or select the nearest advertised one. If none exists, leave the display unchanged and report it. Only the primary/first connected output is adjusted. Wayland, macOS and Windows are not supported by this display step.

The backend stays bound to loopback. Health checks cover the event feed and built root page; they do not prove the legacy dashboard upstream is healthy. An occupied but unhealthy port is reported and left untouched. Startup waits at most 30 seconds, with no continuous focus or browser watchdog. Locks and open-request markers are machine-local under `/tmp`, not in the shared source tree. Kernel locks release when the bootstrap exits.

## Start or explicitly restore

The existing manual command remains supported:

```sh
bash /workspace/shared/dot-panel/start.sh
```

For a closed panel, explicitly request a new open attempt:

```sh
bash /workspace/shared/dot-panel/start.sh --open
```

The open-request marker is not proof that the tab still exists; `--open` bypasses it. It can produce a duplicate window/tab when one already exists. An assistant resuming an authorized cloud task can run the normal bootstrap at task start, and use its supported browser inventory to select the existing panel rather than blindly opening another. This is an explicit task recovery procedure, not an automatic viewer hook.

Use `--no-open` for service-only startup, `--no-display` to leave display unchanged, or `--foreground` to retain a newly started server in the foreground (Ctrl+C stops that server). The default detached service persists after the launcher exits. An already healthy service is reused even in foreground mode.

Environment alternatives: `DOT_CONSOLE_OPEN=0` and `DOT_CONSOLE_DISPLAY=0` skip those individual defaults for that invocation. No source-path stability is promised if the checkout is moved; rerun the installer at the new location.

## Disable

```sh
bash local/install-desktop.sh --disable
```

This sets `Hidden=true` in the managed XDG entry, reversibly disabling future desktop-login starts. It does not close tabs, kill an active server, or reset the display. Manual start remains available. No future browser-opening automation or polling job needs removal.

## Tests

```sh
python3 -m unittest discover -s tests -p 'test_desktop_start.py' -v
python3 -m py_compile local/desktop-start.py
bash -n local/install-desktop.sh /workspace/shared/dot-panel/start.sh
```

Twelve focused cases cover advertised/unsupported modes, display verification, headless fallback, repeated opens versus explicit restore, unhealthy occupied-port preservation, installer scope and reversible disable. Actual desktop evidence is retained in `../startup-verification.txt` outside the repository. Fresh service evidence is in `../startup-fresh-process.txt`.

## Reusable package boundary

These startup files belong to this local-console checkout. The existing skill-plugin packager archives an older pinned Git commit, so changing this checkout does **not** update an existing released ZIP or its provenance. Do not advertise the startup defaults as shipped in those old packages. A new release must intentionally include these files, the local gateway, built UI/dependency installation instructions and this environment/disable guidance, then regenerate its manifest and validate that exact package. Merely installing a skill does not run these scripts.

For a separate **private local source review/install bundle**, use
`python3 scripts/package-local.py --output /absolute/output-directory` after
freezing the source being reviewed. It includes the current UI and startup source
plus the sibling `start.sh`, regenerates current-source/package hashes, and needs
no Git history. Dependencies, generated UI, task history and private browser QA
pages are excluded. Follow [local bundle installation](../packaging/LOCAL-INSTALL.md)
to install dependencies and build after extraction. This does not replace or
publish the historical skills-plugin ZIP, or establish login/viewer-reconnect
behavior beyond the limits above.
