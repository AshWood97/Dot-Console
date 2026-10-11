# Dot Console

[中文](#中文) | [English](README.en.md)

**独立重写版 / Independent rewrite**

[![License: 0BSD](https://img.shields.io/badge/License-0BSD-blue.svg)](LICENSE)
[![Node.js: 24+](https://img.shields.io/badge/Node.js-24%2B-green.svg)](package.json)

本地项目与任务状态看板。使用 Node.js 24 内置模块，无第三方运行时依赖。项目和任务由本地报告接口更新，浏览器用于查看状态及明确确认后的备份导入。

A local project and task-status dashboard using Node.js 24 built-ins, with no third-party runtime dependencies. Local reporters update projects and tasks; the browser displays them and supports explicitly confirmed backup imports.

## 功能 / Features

| 功能 | Description |
| --- | --- |
| 多项目与分组 | Multiple projects and groups, with a separate scrollable task list for each project. |
| 真实报告 | Reported stages, results, blockers, and next steps; viewing the dashboard does not execute tasks. |
| 启动排序 | Recent task starts determine ordering; ordinary progress reports do not masquerade as restarts. |
| 搜索与筛选 | Search project and task text; filter by group or project status. |
| 核实时间 | Explicit check timestamps with fresh, stale, and unknown states. |
| 自动刷新 | Polls local snapshots and resource measurements about every three seconds. |
| 资源监控 | CPU, memory, and data-filesystem usage with clearly labeled host/container scope. |
| 持久化与备份 | Atomic local JSON writes, previous-good-state backup, export, and confirmed merge imports. |
| 零运行时依赖 | Node.js 24 built-ins and native browser HTML, CSS, and JavaScript. |

## 中文

### 启动与测试

需要 Node.js 24。在项目目录运行：

```sh
node --version
npm start
```

在同一台机器的浏览器打开 <http://127.0.0.1:8795>。服务只监听回环地址。无需安装运行时依赖。另一个终端可运行测试：

```sh
npm test
```

这是本地状态记录工具。打开页面、刷新页面或收到任务报告不会启动助手、运行任务或建立云端连接。界面中的任务状态来自报告内容，不代表看板独立验证了外部任务。资源信息对应运行服务的机器，不能据此推断其他机器或云端任务的资源使用量。

### 数据目录

默认数据目录为 `~/.local/share/dot-console-independent`，位于源码目录之外。可在启动时指定其他本地目录：

```sh
DATA_DIR="$HOME/.local/share/dot-console-independent-demo" npm start
```

请勿将真实数据放入源码、Git 仓库或发行包。数据以有大小及数量限制的 JSON 状态保存；磁盘 JSON（包括末尾换行）最多为 1 MiB。结构包含 `version: 1`、`revision` 和 `projects` 数组；每个项目包含自己的 `tasks`。`state.json` 通过原子替换保存，`state.bak` 保存上一份有效状态。备份并非完整历史记录，也不能代替定期导出。

### 本地报告 CLI

先保持服务运行，然后在另一个终端运行以下示例。示例只使用虚构数据：

```sh
node cli.mjs project '{"id":"demo","name":"Example","group":"Personal"}'
node cli.mjs task demo '{"id":"task-1","title":"Example","status":"running","stage":"Implementation","eventId":"unique-report-id"}'
node cli.mjs check demo task-1
node cli.mjs export "$HOME/dot-console-backup.json"
```

- 项目 ID 和任务 ID 用于稳定识别记录，报告同一项时应复用其 ID。
- 每个新任务报告使用新的 `eventId`。最近 2,000 个事件 ID 保留在有界去重窗口中：相同事件 ID、相同载荷的重试会去重；相同事件 ID、不同载荷会被拒绝。窗口之外的旧事件可能被再次接受，因此报告端应始终使用唯一 ID，且不要重发很久以前的事件。不要通过换 ID 来掩盖发送端错误。
- 普通 `running` 报告不会被当作重新启动。从非 running 状态进入 running 会记录一次启动；任务已处于 running 时，只有明确传入 `"restart": true` 才会记录重启并更新排序。
- `check` 仅记录 `lastCheckedAt`，不会更改任务状态、工作阶段或重启排序，也不会实际检查外部任务是否还在运行。

一次明确的重启报告示例：

```sh
node cli.mjs task demo '{"id":"task-1","title":"Example","status":"running","stage":"Implementation","restart":true,"eventId":"restart-report-2"}'
```

### 备份、导入与恢复

正常备份请使用 CLI `export` 或 `GET /api/export`。导出包含项目与任务记录，使用真实数据后应像其他私人文件一样保管。

```sh
node cli.mjs export "$HOME/dot-console-backup.json"
node cli.mjs import "$HOME/dot-console-backup.json"
```

导入仅支持合并；不会覆盖现有同 ID 的项目。发生 ID 冲突时导入被拒绝。要完整恢复到独立的新实例，请使用一个新的空数据目录启动服务，再导入备份。浏览器导入需要用户选取文件并明确确认，普通浏览操作不写入任务状态。

若 `state.json` 格式错误，服务会拒绝启动，不会悄悄清空数据。恢复流程：

1. 停止服务，并停止其他写入同一数据目录的进程。
2. 保留故障文件副本，检查 `state.bak` 是否为期望的上一份有效状态。
3. 确认后，把 `state.bak` 复制为 `state.json`。
4. 使用相同的 `DATA_DIR` 重新启动，核对项目和任务，再导出一份便携备份。

请勿在服务运行时手动覆盖状态文件。回退会丢失备份之后的更改；如备份也无效，请保留文件并调查原因。

服务通过数据目录中的独占 `server.lock` 目录防止多个实例同时写入。崩溃后该目录可能残留，服务不会自动删除它。先确认使用该数据目录的所有服务都已停止，再用 `rmdir /实际数据目录/server.lock` 删除空锁目录，然后重新启动。不要在服务仍运行时移除锁，也不要把删除整个数据目录当作修复手段。

### 安全与发布状态

服务面向受信任的单机使用。不要将它转发到公网、局域网共享入口或公共预览服务。回环监听不隔离同一机器上的其他程序。请参阅 [SECURITY.md](SECURITY.md)。

本项目当前版本为根据需求独立重写的实现，采用 **0BSD**，允许使用、商用、修改和分发，无署名或公开修改源码的要求。当前目录已移除旧 Console / Dot Panel 实现及其资产。Git 历史中的旧版仍保留原 AGPL-3.0-only 许可；新版许可证不追溯更改旧版。来源、发布检查和历史边界见 [PROVENANCE.md](PROVENANCE.md)。

## English

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

### Local HTTP API / 本地 HTTP API

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

## 可选虚构演示 / Optional fictional demo

初次启动为空。以下命令会明确写入 4 个带 DEMO 标签的虚构项目；建议只在独立测试数据目录实例运行。它不会运行真实任务。

A new installation is empty. This explicit command inserts four labeled fictional projects. Use a separate test DATA_DIR instance; it does not execute real work.

```sh
node demo.mjs --confirm-demo
```

Set `DOT_CONSOLE_URL=http://127.0.0.1:8796` for a separate demo instance on port 8796.

## Existing repository history

The current source tree is the independent **0BSD** implementation imported from Gitea commit `91abfa8`. The GitHub repository is public. Earlier legacy commits remain in history under their original **AGPL-3.0-only** license; the current `LICENSE` applies to the independent implementation and does not relicense those earlier files. See [the repository-history boundary](PROVENANCE.md#repository-history-boundary).

当前公开源码为 Gitea `91abfa8` 独立重写版本，使用 0BSD；历史旧版仍遵循 AGPL-3.0-only。下载当前版本时使用 `main` 分支，使用旧提交时请查看该提交自带的许可证。
