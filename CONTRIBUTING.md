# Contributing

This is a newly authored, local-only implementation. Public distribution and rights review are pending. Preparing a change does not authorize publishing the repository, a package, a preview, or any user data.

## Development

1. Use Node.js 24.
2. Work only in this project's source tree.
3. Use a separate disposable `DATA_DIR` outside the tree for manual testing.
4. Run `npm test` before submitting a change. State which checks passed, failed, or were not run.
5. If behavior or an interface changes, update the README and relevant tests with the same change.

```sh
DATA_DIR="$HOME/.local/share/dot-console-independent-dev" npm start
npm test
```

The application uses Node.js built-ins and browser APIs with no third-party runtime dependencies. Prefer small changes within that architecture. Adding a dependency, copied code, font, icon, image, or other asset requires a provenance and license review. Do not silently add network services or telemetry.

## Source and provenance boundaries

- Implement from the project's requirements and standard platform documentation.
- Do not inspect, copy, adapt, or import old Console / Dot Panel source, repository history, documentation, assets, branding, or sample data as part of this work.
- Keep source references and any newly introduced third-party material documented in `PROVENANCE.md`.
- Use fictional examples. Never copy a user's task history, filesystem paths, private messages, screenshots, or configuration into fixtures or documentation.
- Disclose any source uncertainty. Do not describe this process as legal clearance or a certified clean-room process.

## Behavioral invariants to preserve

- The server stays loopback-only. Viewing the dashboard never launches assistants or tasks.
- Data stays outside the source tree. Invalid startup state fails visibly rather than being erased.
- Writes preserve a previous good backup and use atomic replacement. Persisted JSON is at most 1 MiB including its final newline.
- The exclusive data-directory lock prevents multiple servers from sharing state. Never infer that a lock is stale and automatically remove it.
- Stable task IDs identify tasks. Stable event IDs make identical report retries idempotent; conflicting replays fail within the retained 2,000-event window. Document bounded retention honestly; it is not permanent replay protection.
- An ordinary running report does not restart a task or reset restart ordering. Restart behavior requires `restart: true`.
- A check updates `lastChecked` only, without task lifecycle, stage, or ordering changes.
- Imports require explicit intent, validate before saving, and reject collisions rather than silently overwriting records.
- Browser import requires visible confirmation. Canceling does not import.
- Display values as data, never executable markup. Treat all imported and reported text as untrusted.
- Resource labels clearly describe the server host.

Tests for changes should include relevant malformed input, repeated requests, conflicting event IDs, out-of-order reports, import collisions, canceled browser actions, and persistence failures, rather than only a successful flow.

## Before any authorized release

Finish rights review and verify license notices. Review an explicit package file allowlist and the actual package/archive inventory. Keep state, backups, exports, credentials, development logs, screenshots containing private information, and unrelated files out of the package. Keep the package private until an authorized maintainer explicitly approves a release. A passing test suite does not establish ownership or publication rights.

## 中文摘要

使用 Node.js 24 和源码目录之外的测试数据目录。保持零第三方运行时依赖；修改后运行 `npm test` 并同步文档。不要检查或复用旧 Console / Dot Panel 的代码、历史、文档或资产。测试和文档只使用虚构数据。保护事件去重、明确重启、只更新时间的检查、无冲突合并和安全持久化行为。公开发布前必须另行完成权利及发布包审查。
