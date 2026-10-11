# Security

## Intended use

Dot Console Independent is a local, single-user status dashboard. Run it on a trusted machine with Node.js 24 and access it at `http://127.0.0.1:8788`. It is not designed as an authenticated multi-user service or an internet-facing deployment.

- Do not expose it using a reverse proxy, public preview, tunnel, shared network listener, or port forwarding.
- Loopback binding limits network reachability; it does not prevent other programs or users on the host from reaching the service.
- Task reports are assertions from a local reporter. They do not prove a task executed successfully or is still running.
- Resource readings describe the server host, not unrelated computers or cloud workloads.
- Browser viewing is read-only. A user-selected, explicitly confirmed import is the browser's state-changing exception.

## Data handling

The default data directory is `~/.local/share/dot-console-independent`. Use `DATA_DIR` to choose another private location outside the source tree. Use only one running server for a data directory. The service enforces this with an exclusive `server.lock` directory; it does not automatically remove a presumed stale lock. Do not use a shared network filesystem or a directory writable by untrusted users.

Do not put passwords, authentication tokens, payment details, private keys, or other secrets in task names, notes, stage labels, reports, or URLs. CLI arguments can be visible in shell history and process listings. Choose a trusted terminal and send only the information needed for the dashboard.

`state.json`, `state.bak`, and exported backups can contain private project information. Protect their filesystem permissions and storage, and review them before sharing. They are not encrypted by the application. Avoid placing them in source control, screenshots, bug reports, or release archives.

## Persistence and imports

State writes use bounded JSON (at most 1 MiB on disk including the trailing newline), atomic replacement, and a previous-good-state backup. A malformed state file blocks startup instead of being overwritten with an empty state. Follow the stop, inspect, restore, and restart procedure in the README. A backup can be older than the latest accepted report; export regularly when the records matter. After a crash, confirm all servers using that data directory are stopped before removing its empty `server.lock` directory with `rmdir` and restarting. Do not remove the lock of a running server.

Report deduplication retains only the latest 2,000 event IDs. Older reports can replay after leaving that window. Reporters must generate unique event IDs and avoid resending very old reports; this bounded retry protection is not an indefinite audit log.

Only import files whose source and contents you trust. Imports are merge-only and reject colliding project IDs. JSON parsing and input limits are not a substitute for reviewing the information in a file. Importing is not permission to execute any task described in that file.

## Reporting a vulnerability

No public security contact or hosted issue tracker is designated in this private working copy. Report a suspected vulnerability privately to the maintainer who supplied this copy, through an already verified communication channel. Do not invent a contact address or publish sensitive details in a public issue.

Include the version or source revision, Node.js version, operating system, a minimal reproduction using fictional data, expected and actual behavior, and the likely impact. Exclude credentials and real state files. A public release must designate a verified security contact before distribution.

## Scope and release review

This documentation does not claim a penetration test, security audit, legal clearance, or clean-room certification. Before public distribution, review the current implementation, dependency inventory, package contents, rights, and privacy behavior. No public release is performed by this project setup.

## 中文摘要

仅供受信任的本机环境使用，不要通过代理、隧道、端口转发或公开预览服务对外暴露。回环地址不能隔离同一机器上的其他程序。保持一个数据目录只由一个服务实例使用。状态文件和导出文件可能包含私人项目内容，应用不会对它们加密；不要提交到仓库或附在公开问题报告中。请使用虚构数据复现安全问题，并通过已确认的私下渠道联系提供此副本的维护者。
