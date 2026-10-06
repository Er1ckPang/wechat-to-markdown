from pathlib import Path
import json,re,shutil,datetime
repo=Path(__file__).resolve().parents[2]
workspace=repo.parent.parent
app=repo/'local-archive'
upstream=repo/'docs/upstream-README.md'
if not upstream.exists():
    upstream.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(repo/'README.md',upstream)
readme='''# WeChat to Markdown — 个人本地归档版 v1.0.0.p

这是 Er1ckPang 仓库中的个人开发基线，功能冻结自已验证的 wx2md Local v1.2.1。`v1.0.0.p` 是重新整理后的版本名称，并非回退到早期 v1.0.0。

开发分支：`dev_p`。归档 tag：`v1.0.0.p`。整理日期：2026-10-06。

本仓库同时保留上游 Community v0.3.0 扩展源码，以及独立的 [local-archive/ 本地工具](local-archive/)。
原扩展介绍保存在 [docs/upstream-README.md](docs/upstream-README.md)；本地工具与商店产品不是同一安装包。

## 先读这些

- [完整开发记录](DEVELOPMENT_LOG.md)：需求演进、源码归属、版本变化、截图问题与修复、验证证据、开发入口和可见会话记录。
- [图文使用指南](local-archive/public/guide.html)：手动保存、文件说明、飞书接入、版本切换和 Mac 启动。
- [版本记录](local-archive/CHANGELOG.txt)：历史功能版本和当前基线的对应关系。
- [第三方归属与许可](local-archive/THIRD_PARTY_NOTICES.txt)：参考代码、依赖和许可证。

## 当前能做什么

粘贴一个或多个公众号文章链接，在当前电脑保存可编辑 Markdown、内嵌图片 HTML、手机和电脑两张无损长图，以及元信息。支持飞书自建应用的官方长连接，接收发给机器人的单聊文字／富文本链接。

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

## Windows 手动启动

安装 Node.js 22.13+（推荐 24 LTS）和 Edge 或 Chrome，进入 `local-archive/`，双击 **启动工具.cmd**。首次需安装依赖，浏览器地址为 <http://127.0.0.1:17880/>。

本机整理后入口为 `outputs/wx2md-local-v1.0.0.p/local-archive/启动工具.cmd`。关闭网页不会停止后台；停止按钮位于“保存设置”。页面底部和 `/health` 显示实际运行版本与目录。

源码安装与开发：

```sh
cd local-archive
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm start
```

修改 SingleFile bundle 输入时运行 `pnpm build`。Mac 安装 Node.js 与 Chrome 后运行 `chmod +x start-mac.command` 并启动；Mac 脚本尚未在用户设备实测。

## 飞书接入

创建企业自建应用并启用机器人；在本地页面填写 App ID / App Secret，订阅长连接事件 `im.message.receive_v1`，申请 `im:message.p2p_msg:readonly`，发布并把可用范围设为自己。给这个机器人单聊发送公众号链接即可。

本机已有连接配置已迁移；没有把凭据写入 Git。模拟消息和过滤逻辑通过测试，实际消息投递需使用自己的应用验收。当前未实现微信个人聊天监听、开机自动启动或家庭服务器部署。

## 二次开发入口

| 文件 | 职责 |
|---|---|
| `local-archive/src/archive.mjs` | 资源获取、原图本地保存、Markdown／SingleFile HTML、双长图、校验与原子落盘 |
| `local-archive/src/extract.mjs` | 正文副本清理、标题、字体语义、表格、公式提取 |
| `local-archive/src/markdown.mjs` | Turndown 与 GFM 转换、LaTeX、复杂表格、预览清理 |
| `local-archive/src/screenshot.mjs` | 排版、视口采集、实际滚动坐标、重叠校验、栏外裁剪 |
| `local-archive/src/png-stream.mjs` | PNG 像素行流式无损编码 |
| `local-archive/src/store.mjs` / `worker.mjs` | SQLite 队列、消息与文章去重、失败状态和重启恢复 |
| `local-archive/src/feishu.mjs` | 官方 SDK 长连接与发送人／消息类型过滤 |
| `local-archive/src/server.mjs` | 127.0.0.1 服务、令牌、配置和归档文件白名单 |
| `local-archive/public/` | 中文操作页面与指南 |
| `development/scripts/` | 历史研究、诊断、验证、迁移和打包脚本的参考副本 |

保持原网页用于 HTML 和 PNG，清洗后的正文副本用于 MD。不要把 MD 重排版结果当成原网页备份。图片下载失败应保留原地址并给出提示，不能静默丢图。

## 版本、数据和历史档案

Git tag 和界面版本使用 `v1.0.0.p` / `1.0.0.p`；npm 要求合法 SemVer，所以 `local-archive/package.json` 的 `version` 是 `1.0.0-p`，`releaseVersion` 是 `1.0.0.p`。健康接口、启动器和新归档的元信息读取显示版本。

本机只保留这一套可编辑工作目录。旧开发目录、原始研究和测试产物在工作区 `history/` 中以 ZIP 保留；旧版源码 ZIP 也在其中。文章与最新配置、任务库迁入当前 `local-archive/`，任务中的旧路径已修正。旧文章的生成版本和内容不会伪造为新版本。

Git 只保存源码、文档、测试和公开依赖源码。`data/`、`archives/`、`logs/`、数据库、凭据、真实文章和私人历史 ZIP 不进入仓库。私有历史包含旧配置及文章，只在本机保存。

## 许可和已验证边界

参考项目为 [wangshan9870/wechat-to-markdown](https://github.com/wangshan9870/wechat-to-markdown)，Community v0.3.0，审计提交 `68b7337ae246e6ab328e16961dcd500ff7297466`。原扩展保持 MIT；本地工具因使用 SingleFile Core，按 AGPL-3.0-or-later 提供，原 MIT 署名与依赖许可保留。SingleFile 完整源码在 `local-archive/third-party-source/single-file-core/`。

Windows 手动归档已实测。MoE 示例包含 19 个标题、3 张表格、3 处公式、16 张图片；最新 MD 本地图片断网显示和原始字节校验通过。手机版 1296×67515、电脑版 2154×49296；长图完整覆盖且接缝检查通过。当前基线的浏览器、队列、消息和截图回归共 6 项通过。

Markdown 保留内容结构，字体、颜色和间距以 HTML 为准。复杂表格和公式需要阅读器支持 HTML 与数学语法。视频、音频和互动组件仅保存静态可见内容；访问验证可能需要人工处理。
'''
(repo/'README.md').write_text(readme,encoding='utf-8')
(app/'README.md').write_text('''# wx2md Local v1.0.0.p

本目录是可运行的本地工具。完整使用、二次开发和数据说明见 [仓库 README](../README.md)，开发过程见 [DEVELOPMENT_LOG.md](../DEVELOPMENT_LOG.md)。

Windows 双击 `启动工具.cmd`；开发安装运行 `pnpm install --frozen-lockfile --ignore-scripts`、`pnpm test`、`pnpm start`。
MD 图片位于同级 `images/`；HTML 图片内嵌，手机和电脑长图各一张。
''',encoding='utf-8')
history='''# 完整开发记录：WeChat to Markdown 个人本地归档版

整理日期：2026-10-06（Asia/Shanghai）。当前基线：`v1.0.0.p`。开发分支：`dev_p`。

本记录根据实际源码、历史版本、研究文件、测试报告和可见会话整理。正文解释需求、方案、变化与证据；附录保留可见用户／助手消息和执行摘要。工具输出和诊断产物由本机历史 ZIP 保留。本记录不包含凭据或内部推理。

## 1. 需求和实施范围

最初要求微信公众号文章保存到本地并保留原格式，随后增加可编辑 Markdown。进一步要求本地实现 wx2md，接收微信／飞书消息后自动保存 MD、HTML 与长截图，先在当前电脑验证，再考虑家庭服务器。用户有 Windows、Mac 和飞书账号，最初尚未创建飞书应用。

选择先做手动保存和飞书官方长连接。依据是微信个人桌面监听依赖客户端、交互桌面、窗口和第三方工具；飞书长连接不需要公网回调地址。现已实现本地 UI、持久队列和机器人收件适配器；微信个人聊天监听、家庭服务器部署和 Mac 实测未完成。

## 2. 参考源码与调查结论

- WeChat to Markdown：`wangshan9870/wechat-to-markdown`，Community v0.3.0，审计 commit `68b7337ae246e6ab328e16961dcd500ff7297466`，MIT，Copyright 2026 望山。
- 公开源码属于 Community 核心 MVP，不能由其推断商业浏览器插件全部功能。原内容采集、正文清洗和 Turndown 转换可本地复用。
- SingleFile Core 1.6.19 用于保存原页面 DOM、CSS、图片和字体；必须接入受控资源下载桥，单独保存 `page.content()` 不足以离线保存资源。
- Playwright 用独立临时浏览器读取文章；未读取用户现有浏览器配置。Windows 优先 Edge／Chrome。
- 图片必须处理 data-src、延迟加载、下载失败、实际类型与资源跳转。仅接受公众号 URL，资源限定微信相关域名。
- 微信消息路线调查包含 wxauto 桌面自动化、公众号官方回调、企业微信应用、微信客服。它们是不同消息范围，企业应用回调不能代表读取任意私人聊天。

原调查产物包括 wx2md-audit-content/export、wechat-ingress-research、官方页面摘录和交互流程图；这些完整原件收进本机历史 ZIP。上游扩展源码在本仓库根目录保留，本地实现位于 local-archive/。

## 3. 版本演进

| 阶段 | 日期 | 变化与结果 |
|---|---|---|
| 初始研究 | 2026-09-30 | 比较 SingleFile HTML、PDF 与长图；补充 MD 和本地图片；审计开源源码和消息接入范围 |
| Local v1.0.0 | 2026-09-30 | 手动 URL 保存、SingleFile HTML、MD＋本地原图、长截图、中文 UI、SQLite 队列与飞书适配器；真实文章验证 |
| v1.1.0 | 2026-10-06 | 默认 3 倍 PNG；HTML 原图点击／下载与内嵌副本；MD 字体语义、标题、上下标、复杂表格、LaTeX；辅助阅读页和独立版本目录 |
| v1.1.1 | 2026-10-06 | 修复整页高 DPR 截图重复、错位和多个作者栏；实际滚动坐标拼接、重叠验证、悬浮栏排除、宽表格展开、流式 PNG |
| v1.2.0 | 2026-10-06 | 精简五个标题命名文件；MD 和 HTML 图片内嵌；手机与电脑两种长图；宽表格换行、裁掉文章栏外空白；动态阅读页不落盘 |
| v1.2.1 | 2026-10-06 | 按用户补充恢复 MD 的 images/ 原图目录和相对路径；HTML 继续内嵌；保留两种长图与五个标题命名文件 |
| v1.0.0.p | 2026-10-06 | 将 v1.2.1 功能冻结为个人基线；两份主文档、历史压缩归档、数据迁移、Git 开发分支和 tag |

v1.0.0.p 的重命名是整理和归档，不是功能回退。npm 版本为 1.0.0-p，显示版本为 1.0.0.p，Git tag 为 v1.0.0.p。用户最终指定分支名 dev_p。

## 4. 初版的实现

HTTP 服务绑定 127.0.0.1:17880，页面取得随机本机令牌后提交写入请求；Host、Origin 和跨站请求检查拒绝来自其他站点的操作。任务先写 SQLite，串行 worker 启动采集；URL 和消息 ID 分别去重，处理中的任务在重启后恢复。

浏览器打开公众号 URL，确认 #js_content 存在并处理访问验证；将 data-src 图片设为 eager，分段滚动并等待图片和字体。随后从正文克隆提取结构用于 MD，从原页面交给 SingleFile 保存原格式 HTML。每次先写 staging，验证成功后整体 rename 到独立文章目录；失败清理限定 staging 路径。

HTML／PNG 的原页面和 MD 的清洗副本分开，防止正文清洗破坏原格式。资源允许列表、重定向验证、单资源大小限制和失败提示从初版沿用。

## 5. Markdown 与 HTML 的改进

用户指出 MD 与原文不一致、HTML 图片无法单独打开。转换前识别 computed bold／italic 等语义，以及明确的独立视觉标题；保留标题层级、段落、列表、链接、上下标与代码。普通有表头且规则的表格转换为 GFM，单元格内换行保留为 br；合并单元格、嵌套和复杂表格保留原 HTML table，避免拆散。

从 data-formula、data-latex、TeX annotation 和可用 MathJax 源提取 LaTeX；行内用 $…$，独立公式用 $$…$$，没有 TeX 源时保留 MathML。MD 的结构与内容尽量一致，字体、颜色和复杂间距仍应以原格式 HTML 为准。

v1.1.0 曾保存 local-original HTML、SingleFile HTML、MD 阅读页、长图阅读页、原图列表和 images/。v1.2.0 精简为五个文件并内嵌 MD 图片；用户随后要求恢复 MD 本地引用，形成 v1.2.1 的最终结构。

当前 MD 图片按原始字节保存到 images/001.jpg 等路径，重复图片复用文件。HTML 继续使用单独的 data URI 映射，不会被 MD 本地路径替换；纯 HTML/CSS 原图查看层支持原始尺寸和下载。metadata 同时记录图片路径、尺寸、大小、SHA-256 与失败原因。

## 6. 长截图问题、诊断与修复

v1.1.0 为提高清晰度使用高 DPR 整页截图。最初只核对 PNG 尺寸，未发现实际图像内容错误。用户给出 MoE 文章 original.png，明确指出上下错位、重复部分和多个公众号作者栏。对照正常浏览画面后确认：高分辨率超长页面的整页采集出现重复和错位，尺寸正确不等于内容正确。

v1.1.1 改为从已保存的离线 HTML 逐屏采集，排版稳定后滚动。每次读取浏览器实际 scrollX／scrollY，按真实坐标裁掉重叠；特别处理底部滚动被限制导致实际位置不同的情况。相邻画面比较重叠区像素，不一致会重试或报错。正文外的 fixed／sticky 浮动作者栏隐藏，正文内 sticky 变为 static，顶部正常署名只保留一次。

先前为了保留宽表格全部列而扩大整张图画布，造成右侧空白。v1.2.0 改为手机 432×768 与电脑 1280×720 各自排版；窄窗口下宽表格换行，保留所有列，电脑图裁掉文章栏外空白。长图高度由正文决定，不强制把整篇图压成 9:16 或 16:9。各保存一个 PNG，不另保存逐屏临时文件或分段文件。

PNG 使用 pngjs 解码视口像素，按像素行流式无损编码，避免整张长图 RGBA 常驻内存。默认 3 倍设备像素，可选 1/2/3/4 倍；不二次缩放或有损压缩。源图片自身的分辨率限制仍然存在。超过单张 50 万像素行、尺寸不稳定或无法可靠排版时明确失败。

## 7. 真实验证证据

主要示例是用户提供的 MoE 公众号链接，正文含 19 个标题、3 张表格（9／8／9 行）、3 处公式、16 张图片，第一张表格有 6 列。

- v1.1.1：1623×66030，逐屏合成完整覆盖；28 处上下和 29 处横向重叠检查，最大平均差为 0；最终 PNG 对正常视口独立抽样验证。
- v1.2.0：手机 1296×67515、电脑 2154×49296；所有表格列和结尾完整，不扩大横向画布；12 个独立重采样区域中 11 个完全相同，电脑一处仅 1 个像素差 1 个色阶，其他像素一致。
- v1.2.1：MD 原图本地保存 16 个，相对引用 16 个，无 Base64；SHA-256 与此前原图相同，HTTP 原图读取、HTML 独立断网显示、MD 断网显示和完整双 PNG 通过。MD 为 28958 字节，相比内嵌版更便于编辑。
- 回归检查涵盖 URL 校验、持久队列／消息与文章去重、重启恢复、飞书单聊过滤、原格式 HTML、MD 表格与公式、真实浏览器双 PNG、30 个不同颜色正文块无重复／丢失、六列表格和底部完整。
- 当前 v1.0.0.p 基线：6 项本地测试通过。版本显示和启动器读取 releaseVersion；当前服务、全部迁移后的记录和本地图片入口另行核对。

原始验证 JSON、页面截图、原始与修复图的对照、像素抽样结果和各版本 ZIP 保留在本机历史压缩包。Git 开发记录仅包含开发事实与公开源代码，不上传真实文章、截图正文和私人配置。

## 8. 本地整理与迁移

停止 v1.2.1 前等待队列空闲，停止后复制最新配置和 SQLite；正常关闭确保 WAL 已归并。将各版本 archives 中的完整文章目录复制到当前 local-archive/archives，逐文件校验，不覆盖不同来源的同名目录。更新任务库 output_dir 指向新目录，保留旧任务状态、生成版本和元信息。

旧版本源码 ZIP 原样保留。开发工作区、历史应用目录、原始研究资料、诊断和测试产物写入本机私有历史 ZIP；清单记录每个文件的大小和 SHA-256，逐个比对 ZIP 内容后才移除原目录。压缩包可恢复源码和私人配置，后者不会上传 GitHub。

本地最终仅保留 outputs/wx2md-local-v1.0.0.p 这一可编辑工作目录；history/ 保留压缩包。当前服务在 local-archive/ 下运行，之前文章通过迁移后路径访问。

## 9. GitHub 归档

目标仓库：Er1ckPang/wechat-to-markdown；开发分支：dev_p；tag：v1.0.0.p。从原 main 审计提交建立新分支，保留上游扩展和官网文件。新本地工具放在 local-archive/，历史辅助脚本放在 development/scripts/，整理／验证工具放在 development/maintenance/。

现有上游根 LICENSE 保持 MIT，本地子项目单独提供 AGPL-3.0-or-later，参考项目署名保留；完整 SingleFile 依赖源码和许可随源码提供。data/、archives/、logs/、真实文章及私人 ZIP 不进入 Git。提交前检查暂存清单和真实凭据匹配，不将授权 token 写入源码或文档。

推送开发分支与 annotated tag 后，重新读取远端 ref，核对 tag 对应的提交。没有改写 main，也没有部署原官网。本次用户明确授权上传，因此根 AGENTS 的“不自动 push”不会阻止此次有授权的推送。

## 10. 后续开发建议

新增消息来源应调用现有队列，不要让回调等待网页采集；先实现纯文本链接，再分别处理卡片与合并转发。微信适配器需核对实际客户端与桌面状态，不能把飞书或企业微信应用权限当作私人聊天监听权限。

截图修改优先检查真实坐标、底部限制、宽表格、fixed／sticky、字体和图片加载，以及独立像素抽样，不仅检查文件尺寸。资源保存修改应检查格式识别、失败回退、重复资源复用、原始字节与离线显示。

迁移时先停止服务，再复制数据；旧数据库使用绝对路径，移动文章目录时必须同步修正记录。tag 固定可复现基线；后续开发继续提交 dev_p，并用新 tag 记录阶段结果，不移动已有 tag。

## 附录：可见开发会话和执行摘要

以下按时间顺序整理历史可见消息；个人路径使用占位符，凭据被移除。消息中的工具推荐、套餐等研究结果反映当时的调查，不属于当前代码的产品承诺。详细工具输出请对照本机历史产物。

'''
data=json.loads((workspace/'development-archive-preparation.json').read_text(encoding='utf-8'))
def clean(text):
    text=re.sub(r'<in-app-browser-context[\s\S]*?</in-app-browser-context>','',text)
    text=re.sub(r'gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+','[GitHub 凭据已移除]',text)
    for value in ['C:/Users/hwblue2026/Documents/Codex/2026-09-30/ban','C:\\Users\\hwblue2026\\Documents\\Codex\\2026-09-30\\ban',str(workspace)]:text=text.replace(value,'${WORKSPACE}')
    text=re.sub(r'C:(?:\\+|/+)Users(?:\\+|/+)hwblue2026(?:\\+|/+)','${USER_HOME}/',text,flags=re.I)
    return text.strip()
for index,turn in enumerate(reversed(data['turns']),1):
    date=datetime.datetime.fromtimestamp(turn['startedAt'],datetime.timezone(datetime.timedelta(hours=8))).isoformat()
    history+=f'\n### 会话阶段 {index} · {date}\n\n'
    commands=[]
    for item in turn['items']:
        if item['type']=='userMessage':
            text='\n'.join(c.get('text','')for c in item.get('content',[])if c.get('type')=='text');history+='**用户**\n\n'+clean(text)+'\n\n'
        elif item['type']=='agentMessage':history+='**助手（'+item.get('phase','')+'）**\n\n'+clean(item.get('text',''))+'\n\n'
        elif item['type']=='commandExecution':commands.append((clean(item.get('command','')),item.get('status'),item.get('exitCode')))
    if commands:
        history+='<details><summary>此阶段执行摘要</summary>\n\n'
        for command,status,code in commands:history+=f'状态：{status}；退出码：{code}\n\n```powershell\n{command}\n```\n\n'
        history+='</details>\n\n'
history+='''\n### 当前整理阶段 · 2026-10-06

用户要求完整开发记录和 README、本地仅保留当前版本、更名为 v1.0.0.p，并上传开发代码到指定 GitHub 仓库。随后明确分支名为 dev_p，tag 保持 v1.0.0.p；授权凭据没有写入记录。
本次执行包括独立目录准备、版本映射、依赖安装、6 项本地测试、文章与任务路径迁移、历史 ZIP 校验、源代码凭据检查、提交、分支与 tag 推送和远端 ref 核对。最终提交和整理清单见 development/release-manifest.json 与本机 history/ 内压缩清单。
'''
(repo/'DEVELOPMENT_LOG.md').write_text(history,encoding='utf-8')
print(json.dumps({'readmeBytes':(repo/'README.md').stat().st_size,'developmentLogBytes':(repo/'DEVELOPMENT_LOG.md').stat().st_size,'visibleStages':len(data['turns'])}))
