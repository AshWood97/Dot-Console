# Provenance and release boundary

Recorded for this new working copy on 2026-10-11.

## Origin

Dot Console Independent is freshly authored from the requirements supplied for this implementation. Old Console / Dot Panel source files, documentation, assets, repository history, and user records were not inspected or used for this work. This directory is a new implementation, not a migration or redistribution of a previously inspected project.

This is a factual description of the work's input boundary, not a claim of legal clearance, verified ownership of all possible rights, or clean-room certification. A new implementation and a permissive license do not by themselves settle copyright, trademark, patent, contractual, or other rights questions. Rights review remains pending before public distribution. No publication is part of this work.

## Project material

- Application and CLI: newly authored implementation of the supplied local-dashboard requirements.
- Browser interface: newly authored HTML, CSS, and JavaScript, using browser capabilities rather than bundled third-party runtime packages.
- Documentation: newly written for this implementation, with fictional sample names and identifiers.
- Fixtures and examples: must contain fictional, non-private data only.
- License: the standard Zero-Clause BSD license text, verified against the Open Source Initiative page below, with the requested project copyright line.

## Platform references

These official platform and license references were consulted or verified for this project documentation. They describe platform behavior or the license, not an upstream application design. Referencing documentation does not relicense that documentation or the platform itself.

- [Node.js 24 documentation](https://nodejs.org/docs/latest-v24.x/api/)
- [Node.js 24 file system API](https://nodejs.org/docs/latest-v24.x/api/fs.html)
- [Node.js 24 test runner](https://nodejs.org/docs/latest-v24.x/api/test.html)
- [MDN Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [MDN Node.textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent)
- [Open Source Initiative: Zero-Clause BSD](https://opensource.org/license/0bsd)

## Dependencies and licenses

The application has no third-party runtime dependencies. It uses Node.js built-ins and APIs provided by the browser. Node.js, browsers, development tools, and their components are separate software with their own licenses. The project's 0BSD license does not replace those licenses.

`LICENSE` contains the canonical 0BSD permission and warranty terms. The project copyright line is `Copyright (c) 2026 Dot Console contributors`. The file expresses the intended license for rights the contributors can grant; it does not certify ownership or grant rights belonging to someone else.

## Before public distribution

An authorized maintainer must review and record:

1. The origin and licensing of the final source, assets, and any subsequently added dependency.
2. The rights to distribute the project and use its name and other identifiers.
3. The actual package/archive contents, using an explicit file allowlist.
4. The absence of private state, exported data, credentials, unrelated files, or third-party material without permission.
5. A verified security contact and the results and limits of release testing.
6. Explicit approval for the destination and act of publication.

No legal review, trademark clearance, security audit, or public release is asserted here.

## 中文摘要

此目录的内容根据本次需求重新编写，未检查或使用旧 Console / Dot Panel 的源码、历史、文档、资产或私人记录。运行时仅使用 Node.js 内置模块及浏览器 API，无第三方运行时依赖。0BSD 文本已与 OSI 官方页面核对。上述记录不是法律审查结论，也不是洁净室认证；公开分发前仍需完成来源、权利、依赖、发布内容和隐私审查，并获得明确发布授权。

## Repository-history boundary (private replacement, 2026-10-11)

This independently authored implementation is being placed in the existing private `zihan/Dot-Console` repository as a new normal commit. The earlier repository history is retained unchanged. The previous head was `3e5da0172d7b97a2dfc69095a1db6363f43a4eb5`; that commit and its ancestors contain the older AGPL-3.0-only derivative of `graydeon/dot-panel`. Their original licenses, copyright notices, and obligations remain applicable to those historical files. The current tree's 0BSD license does not relicense earlier commits or any third-party material.

The origin statements above describe the independent implementation phase. Preparing this repository replacement subsequently required checking the old repository's metadata, file inventory, history, and license boundary. No legacy implementation code was copied or merged into this tree. The old application is removed from the current tree, not erased from Git history. This private source update is not authorization for a public release.

中文：本次将独立重写版本作为普通新提交放入现有私有仓库，保留旧提交历史。旧版本及其历史文件仍受原 AGPL-3.0-only 许可和相关声明约束；新版 0BSD 不追溯重许可旧提交。独立实现阶段完成后，仅为替换提交检查旧仓库元信息、文件清单、历史和许可边界，未复制或合并旧实现代码。公开发布仍需另行审查和授权。
