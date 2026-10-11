# Provenance and licensing

Recorded on 2026-10-11 for the public Dot Console source repository.

## Independent implementation

The rewrite maintainer records this implementation as newly authored from the supplied requirements, without using legacy Console / Dot Panel source, documentation, assets, or private task records during implementation. The user confirmed the rewrite and requested review for the existing GitHub publication.

The source imported from Gitea is commit `91abfa828802779473aac403b85cba8bcc3e134c`, containing 19 application, test, and documentation files. Its root license and package metadata identify the independent implementation as **0BSD**.

For GitHub publication, the application and test source bytes are preserved from that commit. Documentation was updated for the public destination, complete English instructions, and the correct default port. `README.en.md` was added, and its inclusion in package metadata was recorded. The 0BSD license formatting was aligned with GitHub’s official template without changing its permission or warranty terms. No legacy implementation was merged into the current source tree.

Source review found only Node.js built-in and local-module imports, with no declared third-party runtime dependencies. No current implementation file has the same complete Git blob hash as a legacy implementation file at `3e5da01`. This comparison is a bounded source check; it does not independently prove authorship or constitute clean-room certification.

## Current license

The current independent application, CLI, browser interface, tests, and documentation are offered under the [Zero-Clause BSD license](LICENSE), identified as `0BSD`. It permits use, copying, modification, and distribution for any purpose, with or without a fee; it does not impose attribution or source-disclosure conditions. The complete permission and warranty terms in `LICENSE` control.

Node.js, browsers, development tools, and their components remain separately licensed software. The current license does not grant rights belonging to others or relicense material in older commits.

## Repository-history boundary

The normal Git history is preserved. Legacy snapshot `3e5da0172d7b97a2dfc69095a1db6363f43a4eb5` and its earlier commits contain the former AGPL-3.0-only derivative of `graydeon/dot-panel`. Those files retain their original licensing and notices. The later GitHub documentation commits for that legacy application also remain in history.

The current `LICENSE` applies to the independent implementation introduced by `91abfa8` and its current modifications. It does **not** retroactively relicense the legacy files. Users checking out older commits must read the license supplied by that revision. The historical source and license remain available at [the legacy snapshot](https://github.com/AshWood97/Dot-Console/tree/3e5da0172d7b97a2dfc69095a1db6363f43a4eb5).

## Publication checks

The public destination is [AshWood97/Dot-Console](https://github.com/AshWood97/Dot-Console), as requested by the repository owner. The Gitea repository is the source of the independent rewrite; this publication updates GitHub rather than changing Gitea visibility.

- Verified the current source inventory and runtime imports.
- Ran the 23-test suite with no failures or skips; checked JavaScript syntax.
- Scanned the rewrite snapshot and available history with Gitleaks; no secrets were found.
- Kept runtime state, exported task data, dependency folders, and private records out of tracked source.
- Retained the historical AGPL notices in their original revisions.
- Enabled GitHub private vulnerability reporting and updated the public security documentation.

See [TEST_REPORT.md](TEST_REPORT.md) for test results and limits. These checks document source publication preparation; they are not a formal legal opinion or security certification.

## Platform references

The rewrite documentation records these platform and license references:

- [Node.js 24 documentation](https://nodejs.org/docs/latest-v24.x/api/)
- [Node.js file system API](https://nodejs.org/docs/latest-v24.x/api/fs.html)
- [Node.js test runner](https://nodejs.org/docs/latest-v24.x/api/test.html)
- [MDN Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [MDN Node.textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent)
- [Open Source Initiative: Zero-Clause BSD](https://opensource.org/license/0bsd)

They describe the platform or license, not an upstream application's source. Referencing them does not relicense their documentation.

## 中文说明

当前 `main` 分支来自 Gitea `91abfa8` 的 19 文件独立重写版本，使用 **0BSD**。本次 GitHub 发布保持应用与测试代码不变，更新了中英文介绍、公开发布状态、安全报告入口和默认端口说明。新版不再包含旧 Console / Dot Panel 实现或资产，仅使用 Node.js 内置模块与浏览器 API。

维护者记录独立实现阶段未使用旧版源码；发布核查检查了当前文件、模块引用及完整文件哈希，23 项测试全部通过，源码和历史扫描未发现密钥。核查范围与测试记录见本文及 `TEST_REPORT.md`。

Git 历史中的旧版仍适用原 **AGPL-3.0-only** 许可，当前 0BSD 不追溯更改旧提交。下载当前独立版本请使用 `main`；使用历史提交请查看该提交自带的许可证。GitHub 已按仓库所有者的要求公开，Gitea 的可见性未作修改。
