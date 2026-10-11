# Dot Console 安装与启动

**简体中文** | [English](https://github.com/AshWood97/Dot-Console/blob/main/INSTALL.en.md)

Dot Console 以源码形式发布。当前桌面启动流程面向 Linux X11，需要 Node.js 22.13+（建议 24）、npm、Python 3.10+ 和 Bash；依赖和编译产物需要在本机安装及生成。

## 安装

在新目录中克隆，不要覆盖已有运行目录：

```sh
git clone https://github.com/AshWood97/Dot-Console.git
cd Dot-Console/dot-panel-main
npm ci
npm run build
cp .dev.vars.example .dev.vars
npx --no-install wrangler d1 migrations apply DB --local
bash ../start.sh --no-open --no-display
```

如果使用 `scripts/package-local.py` 生成的源码 ZIP，解压后进入 `dot-console-local-review/dot-panel-main/`，从 `npm ci` 开始执行。两种方式都需要保留外层 `start.sh` 和内层 `dot-panel-main/` 的相对位置。

示例身份只用于 localhost 开发。首次安装使用新的本地数据库，任务列表为空；不会导入原作者的任务历史。任务报告通过 `node local/report.mjs` 写入，完整说明见 [上报指南](https://github.com/AshWood97/Dot-Console/blob/main/dot-panel-main/local/REPORTING.md)。

## 访问与端口

| 地址 / 端口 | 用途 |
| --- | --- |
| `http://127.0.0.1:8787/` | 项目与任务看板 |
| `http://127.0.0.1:8787/dashboard` | 原始仪表盘 |
| `127.0.0.1:8788` | 本地 Worker 后端 |
| `127.0.0.1:9229` | Worker 调试端口 |

在运行服务的同一台机器上打开浏览器。如果桌面和命令执行环境拥有不同的 localhost 命名空间，应在目标桌面的终端启动服务。任务报告默认存储在外层 `task-events.jsonl`，由 Git 忽略；可通过 `DOT_CONSOLE_EVENTS` 或 CLI 的 `--file` 指定文件。

## 启动选项

以下命令在 `dot-panel-main/` 内运行：

```sh
bash ../start.sh                          # 检查/启动服务，尝试设置显示模式并打开浏览器
bash ../start.sh --no-open --no-display   # 只检查/启动服务
bash ../start.sh --foreground --no-open --no-display  # 新服务在前台运行
bash ../start.sh --open                   # 明确再次请求打开页面
```

脚本复用已通过健康检查的服务；端口被占用且健康检查失败时会报告问题，不会结束占用它的进程。`--foreground` 只作用于本次新启动的服务；复用已有服务时不会接管它。默认启动的后台服务在启动脚本退出后继续运行。

显示步骤只选择 `xrandr` 已公布的 16:10 模式，优先 1280×800；没有合适模式时保持原状。它不会创建自定义显示模式。缺少 X11 或 `xdg-open` 时可以使用服务模式并手动打开 URL。Windows、macOS 和 Wayland 的完整桌面安装尚未验证。

`--open` 可能打开额外窗口或标签。普通重复调用使用本机标记抑制重复打开请求；该标记不代表浏览器标签仍然存在。

## 可选的桌面登录启动

在确认本机安装可用后，根据需要执行：

```sh
bash local/install-desktop.sh --enable
```

需要关闭未来的登录启动时执行：

```sh
bash local/install-desktop.sh --disable
```

启用会写入当前用户的 XDG autostart 条目，并立即运行一次启动流程；脚本拒绝覆盖非托管条目。禁用通过 `Hidden=true` 可逆关闭未来的登录启动，不会结束服务、关闭页面或重设显示模式。

只有实际处理 XDG autostart 的桌面环境才会使用该条目。原云桌面的登录消费行为、重启后的自动打开及远程查看器重连钩子没有得到验证；移动目录后需要重新执行安装脚本。

## 源码与校验

本项目是 [Dot Panel](https://github.com/graydeon/dot-panel) 的 AGPL-3.0-only 修改版本，请保留许可证、版权和第三方说明。来源见外层 `PROVENANCE.json`；源码清单见 `dot-panel-main/SOURCE_MANIFEST.json`。文件哈希用于完整性检查。

开发检查命令见仓库根目录 README。可在内层目录生成和检查独立源码包：

```sh
python3 scripts/package-local.py --output /absolute/new/output-directory
python3 scripts/package-local.py --validate /absolute/new/output-directory/dot-console-local-review.zip
```

打包脚本读取当前选定源码，排除依赖、编译产物、非示例环境文件、任务记录、数据库、日志和本机状态。打包本身不会安装服务或执行网络发布；生成包中的来源字段描述本次本地打包行为。
