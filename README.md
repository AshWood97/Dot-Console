# Dot Console

**把多项目任务、真实进展和机器资源放在同一个本地看板里。**

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](LICENSE)
[![Node.js: 22.13+](https://img.shields.io/badge/Node.js-22.13%2B-green.svg)](dot-panel-main/package.json)

Dot Console 是面向个人和 AI 辅助开发工作流的任务控制台。它将明确上报的任务事件按项目聚合，展示当前阶段、最近结果、下一步、阻塞项和核实时间，并提供紧凑的内存、磁盘和 CPU 指标。适合在 Linux 桌面或云桌面中常驻，查看多个项目的执行情况。

**English:** Dot Console is a local task dashboard for personal and AI-assisted workflows. It groups explicitly reported task events by project and displays factual progress, checkpoints, blockers, and read-only resource metrics. It is an AGPL-3.0-only derivative of [Dot Panel](https://github.com/graydeon/dot-panel).

## 功能

| 功能 | 说明 |
| --- | --- |
| 项目分组 | 汇总进行中、等待、受阻、待确认、完成和取消的任务；依据真实启动事件排序。 |
| 独立任务卡片 | 每个项目卡片独立滚动，展示阶段、最近结果、下一步和阻塞原因。 |
| 进度与核实 | 区分实质进展和明确核实记录；过期记录提示“待核实”，不会自动判定任务失败。 |
| 事实上报 CLI | 支持 `start`、`milestone`、`checkpoint`、`blocked`、`complete`、`cancel`、`due` 和 `run`。 |
| 增量同步 | 页面约每 2.5 秒读取本地事件；支持去重、断线重试和事件文件更换后的同步重置。 |
| 资源监控 | 展示内存、文件系统用量和 CPU；缺少可靠测量范围或数据过期时显示未知。 |
| 本地启动 | 提供可移动的启动脚本、健康检查，以及可选的 Linux X11 显示设置和桌面登录启动。 |
| 原始仪表盘 | `/dashboard` 保留上游项目、决策、日历、用量和布局模块；数据需要另行配置。 |

当前任务界面持续更新，已经移除旧版的暂停更新按钮。

## 工作方式

```text
人工 / Agent / 自有脚本
        │ 显式调用 local/report.mjs
        ▼
本地 task-events.jsonl
        │ 只读事件接口
        ▼
Dot Console 项目与任务看板
```

控制台只展示实际写入的报告，不会自动扫描所有 Agent 会话，也不会自动调度或执行任务。页面的连接状态表示数据同步情况；任务是否仍在运行，需要明确的核实记录。`run` 仅能观察它自己启动的命令进程。

默认服务绑定 `127.0.0.1`，面向本机单用户使用。公开的是源码；运行后产生的任务记录、数据库、环境配置和个人看板数据保存在本地，由 `.gitignore` 排除。不要把 localhost 示例身份用于公网部署。

## 快速开始

桌面启动流程面向 **Linux X11**。需要 Node.js **22.13+**（建议 24）、npm、Python **3.10+** 和 Bash。`xrandr` 与 `xdg-open` 是可选桌面工具。macOS、Windows 和 Wayland 的完整桌面安装流程尚未验证。

```sh
git clone https://github.com/AshWood97/Dot-Console.git
cd Dot-Console/dot-panel-main
npm ci
npm run build
cp .dev.vars.example .dev.vars
npx --no-install wrangler d1 migrations apply DB --local
bash ../start.sh --no-open --no-display
```

在运行服务的同一台机器上打开 [http://127.0.0.1:8787/](http://127.0.0.1:8787/)。首次启动没有任务数据；原始仪表盘位于 `/dashboard`。

希望启动脚本同时尝试设置已支持的 16:10 显示模式并打开浏览器时，运行 `bash ../start.sh`。依赖和编译产物没有随仓库附带；`npm ci` 需要访问 npm registry。端口、前台运行、登录启动和恢复说明见 [INSTALL.md](INSTALL.md)。

## 上报第一条任务

在 `dot-panel-main/` 内执行，后续报告保持相同项目与任务标识；重试同一条报告时复用 `--id`。示例中的结果文字应在实际完成对应步骤后上报。

```sh
node local/report.mjs start --project Example --task build \
  --id example-build-start --title '构建示例项目' \
  --message '开始构建项目' --stage '构建中'

node local/report.mjs milestone --project Example --task build \
  --id example-build-result --message '已确认构建成功' \
  --done '构建产物已生成' --next '检查页面'

node local/report.mjs checkpoint --project Example --task build \
  --id example-build-check --evidence '已检查生成的页面'

node local/report.mjs complete --project Example --task build \
  --id example-build-complete --message '页面检查完成' \
  --done '构建与页面检查完成'
```

报告默认保存在仓库根目录的 `task-events.jsonl`；可以通过 `DOT_CONSOLE_EVENTS` 或 `--file` 指定其他位置。更多字段、阻塞处理、自有进程包装和核实规则见 [任务上报指南](dot-panel-main/local/REPORTING.md)。

## 技术栈与目录

前端使用 React 19、TypeScript 和 Vite；本地网关与报告工具使用 Node.js；原始仪表盘后端使用 Cloudflare Workers、D1 和 Drizzle ORM；桌面启动与源码打包工具使用 Python 和 Bash。

```text
Dot-Console/
├── README.md                 # 项目介绍
├── INSTALL.md                # 当前版本安装说明
├── LICENSE                   # GNU AGPL v3
├── PROVENANCE.json           # 来源与版本边界
├── PACKAGE_CONTENTS.json     # 源码包文件校验清单
├── start.sh                  # 根据自身位置启动嵌套源码
└── dot-panel-main/
    ├── src/                  # React 界面与资源监控
    ├── local/                # 网关、事件读写、上报和桌面启动
    ├── lib/                  # 项目身份、任务聚合与共享逻辑
    ├── worker/               # 原始仪表盘 Worker / MCP 后端
    ├── db/ & drizzle/        # 数据库 schema 与迁移
    ├── tests/                # 回归测试
    ├── scripts/              # 验证、构建与源码包工具
    └── agent-skills/          # 上游安装、维护和组件开发说明
```

保留 `dot-panel-main/` 这一层目录，外层启动脚本需要它。项目名称和别名可在 [项目身份映射](dot-panel-main/lib/project-identity.mjs) 中调整；源码保留了原使用环境的名称映射，不包含这些项目的实际任务历史。

## 开发与验证

2026-10-11 发布准备在 macOS、Node 24.19.0、Python 3.12 环境完成：全新 `npm ci`、生产构建、主测试、组件模板、数据库恢复和 Worker 运行时验证通过；本地回归 103 项通过，1 项依赖原机私有历史而跳过；用量工具 24 项、源码打包 14 项和文档完整性检查通过。桌面启动测试 11/12 通过，禁用自启动的测试因脚本使用 GNU `sed -i`、与 macOS BSD sed 语法不同而失败。这次验证没有建立 macOS 桌面安装支持，也没有重新验证真实 Linux 桌面登录行为。

在 `dot-panel-main/` 中运行：

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

源码完整性检查读取 `SOURCE_MANIFEST.json`；修改源码或文档后，需要同步更新文件哈希与包清单。嵌套的 `.github/workflows/` 是保留的上游文件，位于子目录，不会自动成为本仓库的 GitHub Actions 工作流。上游发行记录和历史平台验证不代表本项目的新发行或平台认证。

## 来源与许可证

本仓库从 Gitea 上的 Dot Console `main` 分支迁移，保留现有提交历史；GitHub 发布的源码基线为 `3e5da01`，包含资源监控更新和简化后的控制台标题。来源信息见 [PROVENANCE.json](PROVENANCE.json)。

Dot Console 是 [graydeon/dot-panel](https://github.com/graydeon/dot-panel) 的修改版本，保留上游源码、版权说明和 **GNU AGPL v3 only（AGPL-3.0-only）** 许可证。完整条款见 [LICENSE](LICENSE)，依赖与上游署名见 [THIRD_PARTY_NOTICES.md](dot-panel-main/THIRD_PARTY_NOTICES.md)。许可证同样适用于本项目的修改部分；第三方依赖保留各自许可证。

本项目与 OpenAI、ChatGPT 或 Cloudflare 没有官方隶属关系。问题和改进建议可提交至 [GitHub Issues](https://github.com/AshWood97/Dot-Console/issues)；部署身份与数据处理说明见 [安全说明](dot-panel-main/SECURITY.md)。
