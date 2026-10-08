# Mac 环境安装与软件启动

适用版本：v1.3.0.p；特性分支：`feat/link-health-batch-parallel`。日期：2026-10-08。

支持 Apple Silicon（M 系列）和 Intel 64 位 Mac。系统至少 macOS 14 Sonoma，使用 Node.js 22.13+，建议安装 **Node.js 24 LTS**。这是当前 Playwright 的系统要求与本工具 SQLite 的运行要求。[Playwright 官方要求](https://playwright.dev/docs/intro#system-requirements)、[Node.js 下载](https://nodejs.org/en/download)。

## 1. 安装 Node.js

推荐打开 [Node.js 官方下载页](https://nodejs.org/en/download)，选择 24 LTS、macOS 和 Installer（`.pkg`），按安装器提示完成。架构按“苹果菜单 → 关于本机”中的芯片选择：M 系列选择 ARM64，Intel 选择 x64。关闭并重新打开终端，检查：

```sh
node --version
npm --version
```

看到 Node.js 24.x 和 npm 版本号即可。无需 Python、Docker 或完整 Xcode。

已经使用 Homebrew 的用户也可以运行 `brew install node@24`。启动文件会查找 Apple Silicon 的 `/opt/homebrew` 和 Intel 的 `/usr/local` 路径，不要求修改系统配置。Homebrew 自身的系统兼容范围可能更窄，旧系统或 Intel Mac 优先使用 Node 官方安装器。[Homebrew 官方安装说明](https://docs.brew.sh/Installation)。

如果 Node 通过 nvm 安装，先在可运行 `node --version` 的终端中按下方命令启动；Finder 的环境可能没有你的 nvm 路径。

## 2. 获取并解压工具

下载本次源码 ZIP，或在 [GitHub 特性分支](https://github.com/Er1ckPang/wechat-to-markdown/tree/feat/link-health-batch-parallel) 点击 **Code → Download ZIP**。解压到你的个人目录，例如“文稿”中，找到其中的 `local-archive/` 文件夹。

不要把 Windows 的 `node_modules/` 复制到 Mac。安装入口会为当前 Mac 下载正确的依赖和浏览器。软件源码 ZIP 已排除文章、凭据和运行数据。

## 3. 首次安装

用终端进入 `local-archive/`。可以先输入 `cd `（末尾保留空格），再把该文件夹拖入终端，按回车。然后运行：

```sh
chmod +x install-mac.command start-mac.command doctor-mac.command stop-mac.command scripts/mac-common.sh
bash install-mac.command
```

安装程序使用锁文件安装依赖。没有 pnpm 时，通过 Node 自带的 npx 运行固定版 pnpm；无需另外安装包管理器。它会实际尝试启动浏览器，已有可用 Chromium、Chrome 或 Edge 时直接使用；没有时下载与本版本匹配的 Chromium，不覆盖系统浏览器。[Playwright 浏览器说明](https://playwright.dev/docs/browsers)。

安装过程检查 Node、系统、SQLite、目录写入、浏览器启动、PNG 渲染和端口。首次需要联网，浏览器下载可能耗时数分钟。看到“环境已安装”即可。

## 4. 启动、保存和停止

以后双击 **start-mac.command**，或在终端运行：

```sh
bash start-mac.command
```

网页会自动打开 **http://127.0.0.1:17880/**。粘贴公众号、知乎、CSDN、博客园等文章链接，点击“保存文章”。默认写入 `local-archive/archives/`，也可在“保存设置”中改成你自己的目录。每篇仍是标题命名的 MD、内嵌 HTML、手机与电脑两张无损 PNG、metadata，以及 MD 的 `images/`。

后台启动后，关闭浏览器或启动终端窗口不会停止服务。再次启动会复用同目录、同版本的后台。若已经运行旧版或另一个目录，先在旧网页“保存设置 → 停止本地工具”中停止。

停止软件可以双击 **stop-mac.command**，也可以在网页里停止。正在保存文章时会拒绝停止，等文章完成后重试。电脑睡眠或关闭服务后无法接收飞书消息；唤醒后检查连接状态，必要时重新连接。

| 文件 | 用途 |
|---|---|
| `install-mac.command` | 首次安装依赖和采集浏览器，验证环境 |
| `start-mac.command` | 检查环境、后台启动、打开操作页面 |
| `doctor-mac.command` | 检查环境和端口，不改动文章 |
| `stop-mac.command` | 等待安全退出；不会强制结束保存任务 |

## 5. 常见问题

- **无法双击或提示没有权限**：用上面的 `chmod +x` 赋予这些启动文件执行权限，或直接用 `bash 文件名.command`。如果 macOS 拦截来自网络的文件，核对来源后按“系统设置 → 隐私与安全性”中的提示允许该文件；不要关闭系统整体保护。[Apple 官方说明](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac)。
- **找不到 Node.js**：重新打开终端检查 `node --version`；Homebrew 的 Node@24 路径由启动文件自动补充，nvm 用户从已启用 nvm 的终端启动。
- **浏览器缺失或下载失败**：重新运行 `bash install-mac.command`。也可安装 Chrome 后运行 `bash doctor-mac.command`。浏览器缓存一般在 `~/Library/Caches/ms-playwright/`；升级 Playwright 后需要匹配的新浏览器。[官方浏览器管理](https://playwright.dev/docs/browsers#managing-browser-binaries)。
- **提示旧版本正在运行**：打开已有网页，在“保存设置”里查看程序目录并停止旧服务。新启动器会检查目录和版本，不会误操作别的服务。
- **端口被占用**：先关闭占用 17880 端口的程序。诊断会区分本工具的另一版本和其他程序。
- **启动失败或环境正常但网页打不开**：运行 `bash doctor-mac.command`，查看 `logs/errors.log` 和 `logs/runtime.log`。启动异常会保留终端提示；超时不会显示成功。
- **访问公众号时出现验证码**：在网页的保存设置勾选“显示采集浏览器”，按原文章提示操作，再重试。

## 6. 从 Windows 转移文章和飞书配置

完整复制 `archives/` 即可保留文章；MD 必须连同同一目录的 `images/` 携带。HTML 与 PNG 可以独立打开。

Mac 首次启动使用新的 `data/`，在界面重新填写飞书凭据和 Mac 保存目录。不要直接复制 Windows 的配置与任务库，它们包含 Windows 绝对路径；仅复制文章目录不会自动导入旧任务列表。需要完整任务迁移时，应先备份、停止旧服务并专门重写路径。

Windows 与 Mac 使用同一个飞书应用时，先停止 Windows 接收端，再启用 Mac，避免消息被多个消费者分流。App ID、App Secret 只填本地界面，不放入 GitHub。

## 验证范围

Windows 真实浏览器回归覆盖 MD、HTML、双长图和离线图片。仓库新增 `Local archive cross-platform` 工作流，覆盖 Windows、Apple Silicon Mac（macos-15）与 Intel Mac（macos-15-intel），执行安装、浏览器归档、截图、后台启动、重复启动和停止测试。每次原生测试的实际状态以 GitHub Actions 结果为准。

你的 Mac 上仍需确认具体系统版本、网络、公众号访问验证及飞书应用权限。Mac 和 Windows 的系统字体可能不同，内容与输出格式一致，排版细节以各自浏览器呈现为准。
