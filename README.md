# WeChat to Markdown — Windows / Mac 多网站本地归档版 v1.2.0.p

当前版本基于 v1.1.0.p 增加知乎专栏／回答、CSDN、博客园与普通文章网页的自动保存，手动和飞书消息共用适配器。归档格式沿用此前版本：MD＋本地原图、内嵌 HTML、手机与电脑两张无损长图，以及 metadata。Windows 与 Mac 安装、检查、后台启动与停止入口继续可用。

特性分支：`feat/multi-site-archive`，基于 `feat/macos-support` 的 v1.1.0.p / `8331642`。历史基线 tag：`v1.0.0.p`。当前软件版本：`v1.2.0.p`，日期：2026-10-08。

本仓库同时保留上游 Community v0.3.0 扩展源码，以及独立的 [local-archive/ 本地工具](local-archive/)。
原扩展介绍保存在 [docs/upstream-README.md](docs/upstream-README.md)；本地工具与商店产品不是同一安装包。

## 先读这些

- [完整开发记录](DEVELOPMENT_LOG.md)：需求演进、源码归属、版本变化、截图问题与修复、验证证据、开发入口和可见会话记录。
- [图文使用指南](local-archive/public/guide.html)：手动保存、文件说明、飞书接入、版本切换和 Mac 启动。
- [Mac 安装与启动指南](local-archive/MAC_GUIDE.md)：Node 安装、首次安装、四个启动文件、诊断、迁移文章与排障。
- [多网站保存指南](local-archive/SITES_GUIDE.md)：支持链接、消息触发、目录、排版、访问限制、验证范围与新增适配器。
- [版本记录](local-archive/CHANGELOG.txt)：历史功能版本和当前基线的对应关系。
- [第三方归属与许可](local-archive/THIRD_PARTY_NOTICES.txt)：参考代码、依赖和许可证。

## 当前能做什么

粘贴公众号、知乎专栏或具体回答、CSDN、博客园及其他普通文章网页链接，在当前电脑保存可编辑 Markdown、内嵌图片 HTML、手机和电脑两张无损长图，以及元信息。支持混合多个站点，飞书官方长连接接收发给机器人的单聊文字／富文本链接后使用同一保存流程。

知乎问题列表须改为具体回答链接。普通网页依靠语义正文识别，首页、列表、登录页与交互应用不保证可保存。HTTP 403 或访问限制显示需要人工确认；不会冒充保存完成。范围见 [多网站指南](local-archive/SITES_GUIDE.md)。

```text
local-archive/archives/
  公众号名称/
    日期_文章标题_短ID/
      文章标题.md
      文章标题.html
      文章标题_手机.png
      文章标题_电脑.png
      文章标题_metadata.json
      images/
        001.jpg
        002.png
```

- MD 使用 `![图片](images/001.jpg)`，图片保存原始字节。移动或备份 MD 时连同 `images/` 一起保存。
- HTML 内嵌图片与样式，可单文件断网阅读；点击图片可查看原始尺寸和下载。
- 手机窗口 432×768（9:16），电脑窗口 1280×720（16:9）。比例指阅读窗口；长图高度由文章长度决定。
- 默认 3 倍设备像素，PNG 无损编码；逐屏采集、按实际滚动坐标裁剪重叠并校验接缝。电脑图裁掉文章栏外空白，手机宽表格在阅读宽度内换行。
- JSON 记录来源、版本、文件路径、图片校验值、两种截图的尺寸与覆盖检查、失败资源和离线检查。
- 公众号目录结构沿用上图；新站点增加网站目录，例如 `archives/CSDN/作者/日期_文章标题_短ID/`。metadata 增加站点、文章／回答类型及提取方式。
- 新站点保留选中正文及主要字体、颜色、间距、代码样式，去除导航、推荐、评论、悬浮工具条，使用统一阅读容器；公众号继续沿用原页面。

## Windows 手动启动

安装 Node.js 22.13+（推荐 24 LTS）和 Edge 或 Chrome，进入 `local-archive/`，双击 **启动工具.cmd**。首次需安装依赖，浏览器地址为 <http://127.0.0.1:17880/>。

本机整理后入口为 `outputs/wx2md-local-v1.2.0.p/local-archive/启动工具.cmd`。关闭网页不会停止后台；停止按钮位于“保存设置”。页面底部和 `/health` 显示实际运行版本与目录。

源码安装与开发：

```sh
cd local-archive
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm start
```

修改 SingleFile bundle 输入时运行 `pnpm build`；修改 Mac 或多网站指南后运行 `pnpm build:guides`。

## Mac 首次安装与启动

支持 macOS 14+、Apple Silicon 与 Intel 64 位。先从 [Node 官方下载页](https://nodejs.org/en/download) 安装 macOS 版 Node.js 24 LTS，再进入 `local-archive/`：

```sh
chmod +x *.command scripts/mac-common.sh
bash install-mac.command
bash start-mac.command
```

以后双击 `start-mac.command`；停止用 `stop-mac.command`，检查用 `doctor-mac.command`。安装入口会检测现有浏览器，缺失时下载匹配版本的 Chromium。后台使用独立进程，关闭启动窗口后继续运行；端口冲突、旧目录服务和启动失败均会给出提示。详细步骤见 [Mac 指南](local-archive/MAC_GUIDE.md)。

原生自动测试覆盖 Windows、Apple Silicon Mac 和 Intel Mac，状态见 [GitHub Actions](https://github.com/Er1ckPang/wechat-to-markdown/actions/workflows/local-archive.yml)。具体用户设备和飞书账号仍需现场验收。

## 飞书接入

创建企业自建应用并启用机器人；在本地页面填写 App ID / App Secret，订阅长连接事件 `im.message.receive_v1`，申请 `im:message.p2p_msg:readonly`，发布并把可用范围设为自己。给这个机器人单聊发送上述任一站点的文章链接即可。

本机已有连接配置已迁移；没有把凭据写入 Git。模拟消息和过滤逻辑通过测试，实际消息投递需使用自己的应用验收。当前未实现微信个人聊天监听、开机自动启动或家庭服务器部署。

## 二次开发入口

| 文件 | 职责 |
|---|---|
| `local-archive/src/archive.mjs` | 资源获取、原图本地保存、Markdown／SingleFile HTML、双长图、校验与原子落盘 |
| `local-archive/src/extract.mjs` | 正文副本清理、标题、字体语义、表格、公式提取 |
| `local-archive/src/sites.mjs` / `urls.mjs` | 链接与站点识别、专用正文选择、指定回答隔离、通用语义正文和去重 |
| `local-archive/src/network.mjs` | 页面与资源的公网地址及 DNS 检查 |
| `local-archive/src/markdown.mjs` | Turndown 与 GFM 转换、LaTeX、复杂表格、预览清理 |
| `local-archive/src/screenshot.mjs` | 排版、视口采集、实际滚动坐标、重叠校验、栏外裁剪 |
| `local-archive/src/png-stream.mjs` | PNG 像素行流式无损编码 |
| `local-archive/src/store.mjs` / `worker.mjs` | SQLite 队列、消息与文章去重、失败状态和重启恢复 |
| `local-archive/src/feishu.mjs` | 官方 SDK 长连接与发送人／消息类型过滤 |
| `local-archive/src/server.mjs` | 127.0.0.1 服务、令牌、配置和归档文件白名单 |
| `local-archive/public/` | 中文操作页面与指南 |
| `development/scripts/` | 历史研究、诊断、验证、迁移和打包脚本的参考副本 |

公众号保持原网页用于 HTML 和 PNG；新增站点使用保留正文样式的阅读容器，三种输出来自同一个选中正文。清洗后的副本用于 MD；图片失败保留原地址并给出提示。

## 版本、数据和历史档案

当前界面版本使用 `1.2.0.p`；npm 要求合法 SemVer，所以 `local-archive/package.json` 的 `version` 是 `1.2.0-p`，`releaseVersion` 是 `1.2.0.p`。原基线 tag `v1.0.0.p` 保留当时的源码。健康接口、启动器和新归档的元信息读取显示版本。

本机只保留这一套可编辑工作目录。旧开发目录、原始研究和测试产物在工作区 `history/` 中以 ZIP 保留；旧版源码 ZIP 也在其中。文章与最新配置、任务库迁入当前 `local-archive/`，任务中的旧路径已修正。旧文章的生成版本和内容不会伪造为新版本。

Git 只保存源码、文档、测试和公开依赖源码。`data/`、`archives/`、`logs/`、数据库、凭据、真实文章和私人历史 ZIP 不进入仓库。私有历史包含旧配置及文章，只在本机保存。

## 许可和已验证边界

参考项目为 [wangshan9870/wechat-to-markdown](https://github.com/wangshan9870/wechat-to-markdown)，Community v0.3.0，审计提交 `68b7337ae246e6ab328e16961dcd500ff7297466`。原扩展保持 MIT；本地工具因使用 SingleFile Core，按 AGPL-3.0-or-later 提供，原 MIT 署名与依赖许可保留。SingleFile 完整源码在 `local-archive/third-party-source/single-file-core/`。

Windows 手动归档已实测；新增 Mac 安装、启动与原生自动测试。MoE 示例包含 19 个标题、3 张表格、3 处公式、16 张图片；最新 MD 本地图片断网显示和原始字节校验通过。手机版 1296×67515、电脑版 2154×49296；长图完整覆盖且接缝检查通过。原有 6 项浏览器、队列、消息和截图测试沿用，新增 4 项跨平台运行与端口保护测试。

仓库根目录的上游测试共 45 项通过，扩展构建通过。`vitest.config.ts` 限定上游测试目录，避免把本地工具的 Node.js 测试误当成 Vitest 测试。此前迁移复核了 8 条任务、9 个文章目录、238 个文件，以及 8 份 MD 和 171 个图片引用；原基线清单见 [development/release-manifest.json](development/release-manifest.json)。

本次新增多站点浏览器归档、混合链接、DNS、公网边界、指定回答与列表／验证页／付费提示拒绝测试。本地共 19 项回归；博客园和 MDN 中文文档真实在线保存通过，知乎和 CSDN 在当前网络返回 403，已验证其人工确认提示，但未将其称为真实在线归档通过。原生跨平台结果记录在 [本次版本清单](development/releases/v1.2.0.p.json)。

Markdown 保留内容结构，字体、颜色和间距以 HTML 为准。复杂表格和公式需要阅读器支持 HTML 与数学语法。视频、音频和互动组件仅保存静态可见内容；访问验证可能需要人工处理。
