# 完整开发记录：WeChat to Markdown 个人本地归档版

基线整理：2026-10-06；当前更新：2026-10-08（Asia/Shanghai）。当前版本：`v1.3.0.p`，特性分支：`feat/link-health-batch-parallel`；原基线为 `v1.0.0.p` / `dev_p`。

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
- 整合后的仓库根目录：45 项上游测试和扩展构建通过。初次根目录 Vitest 扫描了本地 Node.js 测试，报 NoSuite；新增 vitest.config.ts 限定 tests/ 后分别运行两套测试，全部通过。
- 删除旧目录后再次验证：8 条任务、9 个文章目录、238 个文件迁移；8 份 MD、171 个本地图片引用及 55 个元信息文件大小检查通过，页面无脚本错误。

原始验证 JSON、页面截图、原始与修复图的对照、像素抽样结果和各版本 ZIP 保留在本机历史压缩包。Git 开发记录仅包含开发事实与公开源代码，不上传真实文章、截图正文和私人配置。

## 8. 本地整理与迁移

停止 v1.2.1 前等待队列空闲，停止后复制最新配置和 SQLite；正常关闭确保 WAL 已归并。将各版本 archives 中的完整文章目录复制到当前 local-archive/archives，逐文件校验，不覆盖不同来源的同名目录。更新任务库 output_dir 指向新目录，保留旧任务状态、生成版本和元信息。

旧版本源码 ZIP 原样保留。开发工作区、历史应用目录、原始研究资料、诊断和测试产物写入本机私有历史 ZIP；清单记录每个文件的大小和 SHA-256，逐个比对 ZIP 内容后才移除原目录。压缩包可恢复源码和私人配置，后者不会上传 GitHub。

历史总包为 development-history-2026-09-30-to-2026-10-06.zip，391824320 字节；1139 个文件逐个校验，另保留 5 个原版源码 ZIP。清理旧 Git 研究目录时遇到 Windows 只读文件，恢复清理前重新核对压缩内容及剩余源文件；只在明确允许的旧目录内解除只读并删除。可重装的 node_modules 和 Python 缓存不收进历史包。

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


### 会话阶段 1 · 2026-09-30T09:42:30+08:00

**用户**

帮我调研并给出将微信公众号文章保存到本地的方法，要求保留原格式

**助手（commentary）**

我会查一下可行的方法，重点比较图片、排版的保留效果，以及保存后能否离线查看。

**助手（commentary）**

目前更适合保留原排版的是“完整网页归档”，PDF 和长截图可作为补充。另外，常见推荐中的 wechat-article-exporter 已在今年 7 月宣布停止维护，旧教程里的批量下载功能不能直接当作可用方案。

**助手（final_answer）**

**推荐用 SingleFile 保存为单个 HTML 文件；如果要求视觉上与保存时的页面一致，再补存一张整页长截图。** PDF 更适合打印，但分页可能改变原排版。

我查阅了项目文档和浏览器官方说明，以下以 **Windows + Edge** 为例。

| 方法 | 原格式保留效果 | 适用场景 |
|---|---|---|
| **SingleFile → HTML** | 保留网页样式，并把图片等资源嵌入文件；文字可搜索、复制 | 日常离线阅读、长期保存 |
| **整页长截图** | 固定保存当时的视觉外观；文字成为图片 | 最看重版式、配色、位置 |
| **打印 → PDF** | 通常能保留图文和颜色，但会分页，可能改变换行或裁切图片 | 打印、批注、发送文件 |

这些是根据各工具保存方式作出的比较，不代表每篇公众号文章都能完全还原。[SingleFile 项目说明](https://github.com/gildas-lormeau/SingleFile)、[Edge 截图说明](https://www.microsoft.com/en-us/edge/features/screenshot)、[Edge 打印说明](https://support.microsoft.com/en-us/edge/print-in-microsoft-edge)

**首选：用 SingleFile 保存完整网页。**

它把网页及相关资源打包进一个 `.html` 文件，适合保留原文的字体设置、颜色、段落、图片位置等样式。保存后可直接用浏览器打开。[官方说明](https://github.com/gildas-lormeau/SingleFile)

操作步骤：

1. 安装官方 [SingleFile Edge 扩展](https://microsoftedge.microsoft.com/addons/detail/efnbkdcfmcmnhlkaijjjmhjjgladedno)，或 [Chrome 扩展](https://chromewebstore.google.com/detail/singlefile/mpiodijhokgodhhofbcjdecpffjipkle)。
2. 在微信文章中复制链接，用 Edge 或 Chrome 打开，确认显示的是完整正文。
3. **从头到尾慢慢滚动一遍，等所有图片加载出来**，并展开需要保存的折叠内容。
4. 在扩展设置中开启 **“save content loaded while scrolling”**，即保存滚动时加载的内容。官方说明指出，这项功能能帮助保存延迟加载的图片，但不能保证适用于所有网站。[设置说明](https://github.com/gildas-lormeau/SingleFile/blob/master/src/ui/pages/help.html)
5. 点击 SingleFile 图标，保存生成的 HTML 文件。
6. **断开网络后重新打开文件**，检查文章末尾、图片、表格和特殊排版是否完整。

如果图片缺失，先确认在线页面本身已加载图片；若属于图片防盗链问题，可尝试开启 **“Network → pass ‘Referer’ header after a cross-origin request error”** 后重新保存。[官方 FAQ](https://github.com/gildas-lormeau/SingleFile/blob/master/faq.md)

HTML 会随窗口宽度重新换行，不同设备的字体也可能不同，因此它适合保留网页样式，无法保证跨设备显示时每个像素都相同。

**最看重外观：保存整页长截图。**

先加载完整文章，再在 Edge 中按 **`Ctrl + Shift + S` →“捕获整页”→ 保存**。这会把整篇页面的视觉外观保存为图片，包括超出当前屏幕的部分。[微软操作说明](https://www.microsoft.com/en-us/edge/features/screenshot)

长截图能固定保存当时的版式，但文字不能直接选择复制，动图和视频只留下静态画面。特别长的文章要检查底部是否截全。

**需要 PDF：使用浏览器打印。**

完整加载文章后，按 **`Ctrl + P` →“另存为 PDF”**，在更多设置中开启 **“背景图形”**，按需关闭页眉和页脚，并逐页检查预览。背景图形选项有助于保留底色和背景图片。[微软打印说明](https://support.microsoft.com/en-us/edge/print-in-microsoft-edge)

PDF 会引入分页，复杂图片、表格或装饰可能跨页，所以对“保留原格式”的要求较高时，建议同时保留 HTML。

如果要保存多篇，SingleFile 支持一次保存多个已打开的标签页。网上常见的 **wechat-article-exporter** 则已于 **2026 年 7 月 30 日宣布停止维护**，项目称其依赖的微信核心接口已关闭，旧教程里的自动同步公众号历史文章功能不宜继续作为当前方案推荐。[SingleFile 批量功能](https://github.com/gildas-lormeau/SingleFile#additional-notes)、[项目停止维护说明](https://github.com/wechat-article/wechat-article-exporter)

最后，视频、音频、投票、小程序等依赖微信服务的内容，不能靠静态网页归档保证完整离线运行；SingleFile 默认也会移除脚本。上述方法主要适用于**图文正文及其排版**。[官方 FAQ](https://github.com/gildas-lormeau/SingleFile/blob/master/faq.md)


### 会话阶段 2 · 2026-09-30T09:46:35+08:00

**用户**

能否在补充markdown版本的本地保存版本

**助手（commentary）**

可以。Markdown 适合搜索、编辑和放进笔记库，可以与保留原排版的 HTML 一起保存。我会补充图片也能离线查看的做法。

**助手（final_answer）**

可以，建议把保存方案补充为 **“原版 HTML＋Markdown＋本地图片”**：

- **HTML**：保留原网页排版，作为原版备份。
- **Markdown**：方便搜索、编辑、导入 Obsidian、思源或 Typora。
- **本地图片**：确保 Markdown 断网后仍能显示配图。

**Markdown 可以保留标题、段落、列表、引用等结构，但无法完整保留原文的字体、颜色、背景和复杂布局，因此应与 HTML 一起保存。**

可以使用专门面向公众号的 **WeChat to Markdown（wx2md）**。其官方说明支持导出 Markdown 和本地图片 ZIP，正文转换在浏览器本地完成。[功能说明](https://wx2md.com/faq/)

操作步骤：

1. 从 [官网](https://wx2md.com/) 安装 Chrome 扩展。
2. 用 Chrome 打开公众号文章，滚动到底部，等待图片加载完成。
3. 点击扩展，选择 **Markdown**，开启 **“下载文章图片”**，保存文件。[操作教程](https://wx2md.com/start/)
4. 如果同时下载了图片 ZIP，解压后**保持 Markdown 与图片的相对目录不变**；移动或备份时一起复制。[目录说明](https://wx2md.com/faq/)
5. 断网后用 Markdown 编辑器打开，核对正文、配图和表格。

尤其要检查图片下载失败提示：该工具会把失败图片保留为网络链接，这些图片仍需要联网才能查看。[官方排障说明](https://wx2md.com/support/)

目前免费版每月提供 **10 次单篇导出额度**，Markdown、HTML、PNG 和单篇图片 ZIP 共用额度。[免费额度说明](https://wx2md.com/faq/)


### 会话阶段 3 · 2026-09-30T10:11:39+08:00

**用户**

深入分析**WeChat to Markdown（wx2md）**  的实现机制：

1. 判断能否本地实现该功能？
2. 如何实现我把公众号文章链接通过微信发送给自己/某个人，后台自动完成md格式、html格式和长截图的保存？我有可用的家庭服务器，有windows也有mac

**助手（commentary）**

我会核实 wx2md 的源码和图片保存机制，并比较“微信发链接后自动归档”的几种接入方式。重点是哪些环节能在家庭服务器上完成，以及微信消息能否稳定触发后台任务。

**助手（commentary）**

我会用 walkthrough 技能生成一张可点击的实现流程图，方便查看源码环节和家庭服务器方案。源码分析也会区分公开 Community 版与商店完整版，避免把未公开功能当作已经验证的实现。

**助手（commentary）**

已确认 wx2md 的公开源码只覆盖核心 Markdown 导出和图片本地化，商店版的 HTML、PNG 等功能没有全部公开。三种格式都能另行在本地实现；目前需要重点核实的是微信收消息入口，以及抓到的页面能否完整显示。

**助手（commentary）**

源码里有个关键区别：Markdown 转换会主动清除排版属性；官网所说的“PNG 分享图片”也不能据此认定为原网页长截图。为满足你保留原格式的要求，HTML 和长截图应从加载完成的原网页生成，Markdown 再单独从正文转换。

**助手（commentary）**

接入方式已分清：发给文件传输助手或普通好友，需要 Windows 桌面端适配；发给专用公众号或微信客服，可以使用官方消息回调。这两类入口能共用归档服务，但前者依赖桌面微信运行，后者需要配置平台账号和可达的回调地址。

**助手（final_answer）**

**可以本地实现。对你的设备条件，我建议采用“Windows 微信收件端＋独立归档服务”：微信端只负责发现文章链接，家庭服务器负责生成 Markdown、本地图片、原版 HTML 和长截图。**

真正影响长期稳定性的环节，是**怎样从微信聊天中取得链接**。归档引擎可以跨 Windows、Mac 运行；个人微信桌面接入则依赖具体客户端版本和登录状态。

我已核查 wx2md 的公开源码，并生成了可离线打开的[源码与家庭服务器交互流程图](${WORKSPACE}/outputs/walkthrough-wechat-archive.html)。点击源码节点可查看实际代码和来源。

**1．wx2md 的实际实现机制**

本次核查对象是官方仓库 `wangshan9870/wechat-to-markdown`，公开核心为 **Community v0.3.0**。仓库明确说明：公开源码覆盖单篇 Markdown、图片 ZIP 和快捷保存；商店版的其他功能独立迭代。因此，商店版 HTML、PNG 的具体实现不能仅凭这份源码判断。[源码范围说明](https://github.com/wangshan9870/wechat-to-markdown/blob/68b7337ae246e6ab328e16961dcd500ff7297466/README.md#L1-L5)

它的工作链路如下：

| 环节 | 实际实现 | 对本地复现的意义 |
|---|---|---|
| 读取文章 | 在已打开的网页中找到 `#js_content`，读取标题、公众号、作者和时间 | 需要先取得可正常显示的文章页面 |
| 清洗正文 | 克隆正文，删除脚本、广告、部分嵌入内容，以及 `class/style/id` | 适合内容整理，会主动丢弃原排版 |
| 转换 Markdown | 使用 Turndown＋GFM，补充微信 `section`、图片转换规则 | 属于规则转换，核心无需大模型 |
| 保存图片 | 后台下载图片，成功后改成相对路径 | Markdown 与图片可以一起离线保存 |
| 导出文件 | 生成 `.md` 或 ZIP，调用浏览器下载接口 | 服务端需要改成直接写文件 |

提取依赖固定的网页元素，并不是调用微信的“文章导出 API”。图片优先读取 `data-src`，所以即使某张图尚未因滚动而显示，也可能取得它的地址；但这不能保证截图时图片已经显示。[文章提取代码](https://github.com/wangshan9870/wechat-to-markdown/blob/68b7337ae246e6ab328e16961dcd500ff7297466/src/content/extractor.ts#L17-L47)、[清洗与图片处理](https://github.com/wangshan9870/wechat-to-markdown/blob/68b7337ae246e6ab328e16961dcd500ff7297466/src/content/cleaner.ts#L3-L44)

Markdown 转换保留标题、列表、引用、表格等结构，并加入来源等元数据。公众号里用字体、颜色造出来的“视觉小标题”，未必会自动变成 Markdown 标题，后续需要针对样本补充规则。[转换实现](https://github.com/wangshan9870/wechat-to-markdown/blob/68b7337ae246e6ab328e16961dcd500ff7297466/src/core/markdown.ts#L19-L54)

图片下载成功后写入 `images/001.ext` 等路径；失败时仍保留网络地址并统计失败数量。**所以生成 ZIP 成功，并不等于图片已全部离线保存。** 当前导出还使用保存对话框，迁移到无人值守服务时应替换这一层。[后台导出代码](https://github.com/wangshan9870/wechat-to-markdown/blob/68b7337ae246e6ab328e16961dcd500ff7297466/src/background/index.ts#L20-L54)

公开代码采用 MIT 许可，可以复用并修改，保留对应版权与许可声明即可。无需依赖运营者的文章转换服务来实现自己的归档程序。[源码许可证](https://github.com/wangshan9870/wechat-to-markdown/blob/68b7337ae246e6ab328e16961dcd500ff7297466/LICENSE)

**2．“通过微信发链接后自动保存”有两条主要路线**

| 接入方式 | 是否符合你原来的发送习惯 | 运行条件 |
|---|---|---|
| **Windows 桌面适配器** | 可以监控文件传输助手或指定好友会话 | Windows 微信保持登录，需要维护桌面自动化兼容性 |
| **自有公众号官方回调** | 在微信里发给专用归档公众号 | 配置公众号消息推送、开发权限和可达回调地址 |
| **微信客服官方接口** | 在微信里发给专用客服会话 | 核实开通资格，配置应用与客服账号 |

**如果要保留“发给自己／某个好友”的习惯，采用 Windows 桌面适配器。**

基本流程是：

```text
手机微信发送链接
→ Windows 微信同步到指定会话
→ 适配器发现新链接
→ 向家庭服务器提交任务
→ 后台保存三种格式
```

可以参考 wxauto 项目的桌面自动化能力。当前文档区分免费 `wxauto4` 和 Plus `wxautox4`；其中 `AddListenChat`、文章卡片的 `LinkMessage.get_url()` 等能力标为 Plus，不能把旧教程里的“免费安装后即可完整监听”当成当前保证。[安装与兼容说明](https://docs.wxauto.org/docs/install.html)、[监听接口](https://docs.wxauto.org/docs/class/WeChat.html)、[消息对象接口](https://docs.wxauto.org/docs/class/Message.html)

这里有几个直接影响实现的细节：

- **初版先收纯文本文章 URL。** 转发的文章卡片需要另外提取 URL，小程序卡片、合并转发也应分别处理。
- 文件传输助手中的自发消息可能是 `SelfMessage`，不能照抄只处理好友消息的示例。监控指定好友会话时，也可从你自己的桌面端处理同步的发出消息。
- Windows 收件端应运行在已登录的用户桌面中。部分操作需要窗口前台、不能最小化；锁屏、注销、睡眠或远程桌面断开后的行为需要实测。
- wxauto 官方不支持 macOS；**Mac 可以承担归档服务，Windows 单独承担收件。**[消息类型说明](https://docs.wxauto.org/docs/class/Message.html)、[窗口操作要求](https://github.com/cluic/wxauto-mcp)、[平台 FAQ](https://docs.wxauto.org/docs/issues.html)

**如果更重视长期无人值守，采用专用公众号的官方回调。**

你在微信中把链接发送给自己的归档公众号，微信服务器把文本 `Content` 或链接 `Url` 推送到配置的回调地址。收件程序快速应答并把任务入队，归档程序随后处理。官方回调有超时重试机制，因此需要按消息编号去重，不能等截图完成后才应答。[官方接收消息文档](https://developers.weixin.qq.com/doc/subscription/guide/product/message/Receiving_standard_messages.html)

这条路线不需要常驻桌面微信，但要确认你账号后台的消息推送权限。当前开发配置已迁入微信开发者平台；个人主体启用 AppSecret 需要管理员实名，具体权限应在账号后台确认。可以先用官方测试号验证。[官方开发指南](https://developers.weixin.qq.com/doc/subscription/guide/dev/)、[配置迁移说明](https://developers.weixin.qq.com/doc/subscription/guide/dev/migration.html)

微信客服也是官方路线，不过接入稍复杂：回调只通知有消息，再通过 `sync_msg` 读取内容；要持久保存游标，该接口仅提供最近三天的消息。开通资格及应用配置需在实际后台核实。[官方读取消息接口](https://developer.work.weixin.qq.com/document/path/94670)

另外，**企业微信自建应用的消息回调覆盖的是发给应用的消息，不能据此监听任意个人好友或外部联系人的普通聊天。**[官方应用消息说明](https://developer.work.weixin.qq.com/document/path/90238)

**3．归档服务器应怎样实现**

我建议使用 **Node.js＋Playwright Chromium＋SQLite＋文件目录**。家庭使用先采用一个串行处理任务的 worker，暂时不需要复杂的队列集群。

任务处理过程：

1. **收件并去重。** 保存来源会话、消息标识和完整文章 URL；仅接收公众号文章地址。桌面工具的界面 ID 不能直接当作永久消息编号。
2. **加载原网页。** 验证页面确实有标题和正文。出现验证页面、删除提示或访问限制时，记录为待处理，避免把错误页面保存成成功结果。
3. **准备完整页面。** 固定阅读宽度，分段滚动，等待图片和字体加载。单纯等待几秒或等待网络空闲不足以证明内容完整。
4. **从原页面保存长截图。** Playwright 的 `fullPage: true` 可以捕获整个可滚动页面。[截图接口](https://playwright.dev/docs/screenshots)
5. **从正文副本生成 Markdown。** 在克隆上清洗和转换，下载图片并改写本地路径。
6. **从原页面保存离线 HTML。** 打包 CSS、图片等资源，然后校验三份输出并写入归档目录。

**关键是保留两个分支：原页面用于 HTML 和截图，清洗后的正文副本用于 Markdown。** 如果把 Markdown 重新渲染成 HTML 或图片，得到的是重新排版的版本，无法满足你原先的保留原格式要求。

HTML 可以使用 SingleFile 的核心库。源码支持在当前浏览器页面中调用 `getPageData`，因此可以和截图、正文提取共用一次加载会话；跨域资源下载需要接入资源下载桥。仅保存 `page.content()` 不会自动把外部图片和样式带进文件。[SingleFile 核心入口](https://github.com/gildas-lormeau/single-file-core/blob/169170d710c16973b3917d007ce653a4c5e465e3/single-file.js#L49-L113)、[官方资源桥实现](https://github.com/gildas-lormeau/single-file-cli/blob/bc3d67d4cd09138a270df15049bdf09e5739e1fa/lib/single-file-script.js#L82-L100)

建议每篇文章保存为：

```text
公众号名称／日期_文章标题_短ID／
├── article.md
├── original.html
├── original.png
├── metadata.json
└── images/
```

`metadata.json` 记录原始链接、抓取时间、阅读宽度、图片失败清单，以及每种格式的生成状态。只有正文和资源校验通过才标为完成；缺图应标为部分完成。HTML 和截图保存的是静态阅读效果，微信投票、小程序、视频播放等互动功能需要另外处理。

**针对你的设备，实施顺序建议如下：**

先在 Windows 上运行归档服务，用手动提交链接验证三种输出；再接入文件传输助手的纯文本链接；稳定后增加文章卡片解析。归档服务可以继续放在 Windows，也可以迁到常开的 Mac 或家庭服务器，Windows 只保留微信收件程序。

如果后续要求锁屏后、重启后也长期自动运行，再把收件入口换成公众号官方回调。没有公网可达地址时，可以使用反向隧道，或设置一个小型公网收件端，由家庭服务器主动取任务；正文处理和最终文件仍保存在家里。

本次已完成源码核查和流程图的离线交互验证；尚未在你的微信客户端版本、账号和具体文章上验证完整收件与归档链路。

<details><summary>此阶段执行摘要</summary>

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath '${USER_HOME}/.codex/skills/walkthrough/SKILL.md' -Raw"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath '${USER_HOME}/.codex/skills/walkthrough/references/html-patterns.md' -Raw"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$paths = @('"'${USER_HOME}/Documents/Codex/AGENTS.md','${USER_HOME}/Documents/Codex/2026-09-30/AGENTS.md','${WORKSPACE}/AGENTS.md'); foreach ("'$path in $paths) { if (Test-Path -LiteralPath $path) { Write-Output $path; Get-Content -LiteralPath $path -Raw } }; New-Item -ItemType Directory -Force -Path work,outputs | Out-Null; git clone --depth 1 https://github.com/wangshan9870/wechat-to-markdown.git work/wx2md-source; rg --files work/wx2md-source/src'
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$runtimeNode = '"'${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'; & "'$runtimeNode -e "for(const p of ['"'playwright','mermaid','react','react-dom','shiki']){try{console.log(p,require.resolve(p,{paths:['${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}))}catch{console.log(p,'unavailable')}}\"; Get-Command node,npm -ErrorAction SilentlyContinue | Select-Object Name,Source"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$env:Path = '"'${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;' + "'$env:Path; New-Item -ItemType Directory -Force -Path '"'work/walkthrough-build' | Out-Null; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' --dir work/walkthrough-build add react@18 react-dom@18 mermaid@11 shiki@3 esbuild"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' -e \"const b=require('./work/walkthrough-build/node_modules/esbuild'); console.log('esbuild',b.version);console.log('playwright',require('${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright').chromium.executablePath())\"; rg --files work -g '*nodes*.json' -g '*research*.json' -g '*audit*.json'"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "rg --files work -g '*nodes*.json' -g '*audit*.json' -g '*research*.json'; Test-Path -LiteralPath '${USER_HOME}/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath work/wx2md-nodes-content.json -Raw; Get-Content -LiteralPath work/wx2md-audit-content.json -Raw; @('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe') | ForEach-Object { [PSCustomObject]@{Path="'$_;Exists=(Test-Path -LiteralPath $_)} }'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "rg --files work -g '*nodes*.json' -g '*audit*.json' -g '*research*.json'"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content -LiteralPath work/wx2md-nodes-export.json -Raw'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' assemble.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' build.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' qa.cjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' assemble.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' build.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' qa.cjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "rg --files work -g '*ingress*.json'; Get-Content -LiteralPath work/wx2md-audit-export.json -Raw"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' -e \"const p=require('${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); (async()=>{const b=await p.chromium.launch({channel:'msedge'});const page=await b.newPage();await page.goto('file:///${WORKSPACE}/outputs/walkthrough-wechat-archive.html');await page.waitForSelector('svg');await page.getByRole('button',{name:'家庭服务器方案',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.mermaid-wrap svg')?.textContent.includes('持久任务')); console.log(await page.locator('.mermaid-wrap svg').textContent());console.log(await page.locator('.mermaid-wrap svg .edgeLabel').allTextContents());await b.close()})()\""
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' build.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' qa.cjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content -LiteralPath work/wechat-ingress-research.json -Raw'
```

</details>


### 会话阶段 4 · 2026-09-30T14:16:48+08:00

**用户**

请帮忙分阶段实现：

1. 先实现WeChat to Markdown（wx2md）  工具，并给出手动使用指南
2. 然后尝试搭建发送微信/飞书消息后自动保存的机制（先不用家庭服务器，在当前电脑上自动完成）

**助手（commentary）**

我会先做一个能在当前电脑上运行的本地保存工具，支持 Markdown、原格式 HTML 和长截图，并附手动使用指南。随后接入消息触发；我会先验证微信和飞书在这台电脑上的可用接入方式。

**助手（final_answer）**

第二阶段你更希望先接入哪种消息来源？
- 飞书：使用自建应用，适合后台自动运行
- 微信：使用当前电脑微信会话，需要保持登录

**用户**

<send_user_message_question_reply>
[{"questionItemId":"[\"request_user_input_async\",\"call_1ndbfajIXgroKohbnlsvGgkZ\",0]","question":"第二阶段你更希望先接入哪种消息来源？","answer":"判断哪个更简单、稳定"}]
</send_user_message_question_reply>

**助手（commentary）**

我建议先接飞书：自建应用的长连接可以在当前电脑直接接收消息，不需要公网地址。相比微信桌面会话监听，它更适合后台运行。我会把飞书接入模块一并做好；实际接通需要你在飞书后台创建应用并填写凭据。

**助手（final_answer）**

可以发一篇你想保存的公众号文章链接，供我验证实际效果；暂时没有的话，我会先用包含排版、表格和延迟加载图片的测试文章验证。

**用户**

<send_user_message_question_reply>
[{"questionItemId":"[\"request_user_input_async\",\"call_udGm9n9raZPh1IvZw48SYEjr\",0]","question":"可以发一篇你想保存的公众号文章链接，供我验证实际效果；暂时没有的话，我会先用包含排版、表格和延迟加载图片的测试文章验证。","answer":"[https://mp.weixin.qq.com/s/NfT-3GDq2sM2LNJlnXslYw](https://mp.weixin.qq.com/s/NfT-3GDq2sM2LNJlnXslYw)"}]
</send_user_message_question_reply>

**助手（commentary）**

工具会采用“粘贴链接 → 后台保存 → 查看结果”的操作方式。排版由原网页保存为 HTML 和长截图，Markdown 则单独提取正文并下载图片。我会用你提供的文章验证，尤其检查延迟加载图片和断网后的 HTML 显示。

**助手（commentary）**

你提供的文章已经保存出了三个版本，16 张正文图片全部下载成功，断网检查也确认 HTML 正文图片都能显示。检查还发现一个统计上报请求被误算成缺失资源；我会修正这个状态判断，再测试操作界面、重试和消息去重。

**助手（final_answer）**

你是否已有可创建自建应用的飞书工作区？凭据可以直接填进我做好的本地页面，不必发到聊天里。
- 有，我会在本地页面填写应用凭据
- 有飞书账号，但还没创建应用
- 暂时没有飞书，先使用手动保存

**用户**

<send_user_message_question_reply>
[{"questionItemId":"[\"request_user_input_async\",\"call_n11cAeg3uakEZUsUXq3XGF0N\",0]","question":"你是否已有可创建自建应用的飞书工作区？凭据可以直接填进我做好的本地页面，不必发到聊天里。","answer":"有飞书账号，但还没创建应用"}]
</send_user_message_question_reply>

**助手（commentary）**

飞书接入模块已经写好，实际接通还差创建应用这一步。我会在指南里列出所需权限和配置顺序；你创建后把凭据填入本地页面即可。当前工具已在这台电脑后台启动，我正在验证页面操作和重复消息处理。

**助手（commentary）**

页面保存、文章去重和模拟消息处理都已验证通过。示例文章的长截图约 2.2 万像素高，离线 HTML 的 16 张正文图片均能显示。接下来我会补测图片下载失败时的提示，并整理可下载的工具包；真实飞书收件仍需创建应用后验收。

**助手（final_answer）**

已完成可运行的 **wx2md 本地版**，并在当前 Windows 电脑后台启动。

- **第一阶段已完成**：粘贴文章链接，自动保存 Markdown、本地图片、原格式 HTML 和长截图。
- **第二阶段模块已完成，待账号接通**：选择飞书官方长连接，适合当前电脑后台运行，无需公网地址。真实消息收件还需要你创建飞书应用。[官方 SDK 说明](https://github.com/larksuite/node-sdk)

你提供的文章已实测保存成功：**16 张正文图片全部下载，离线 HTML 全部显示，长截图为 430 × 22,032 像素**。文章去重、消息去重和失败提示也已验证。

现在可以直接使用：

- [打开本地工具](http://127.0.0.1:17880)
- [手动使用与飞书配置指南](${WORKSPACE}/outputs/wx2md-local/public/guide.html)
- [查看示例文件与验证记录](${WORKSPACE}/outputs/wx2md-验证记录.html)
- [下载工具源码包](${WORKSPACE}/outputs/wx2md-local.zip)

飞书下一步：创建企业自建应用并启用机器人，把 App ID、App Secret 填入本地页面，再按指南配置单聊消息权限、长连接事件并发布。**凭据不必发到聊天里。**

关闭页面后后台仍运行；重启电脑后，双击 [启动工具.cmd](${WORKSPACE}/outputs/wx2md-local/启动工具.cmd) 即可继续使用。

<details><summary>此阶段执行摘要</summary>

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Location; rg --files -g AGENTS.md -g package.json -g README.md -g '*research*' -g '*audit*' -g '*guide*' -g '*wx2md*' ."
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath 'work/wx2md-source/src/core/markdown.ts'; Get-Content -LiteralPath 'work/wx2md-source/src/content/extractor.ts'; Get-Content -LiteralPath 'work/wx2md-source/src/content/cleaner.ts'; Get-Content -LiteralPath 'work/wx2md-source/package.json'; Get-Content -LiteralPath 'work/wx2md-source/LICENSE'"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --version; Get-Content -LiteralPath 'work/single-file-core-source/package.json'; Get-Content -LiteralPath 'work/single-file-cli-source/lib/single-file-script.js' -TotalCount 160; Get-Content -LiteralPath 'work/single-file-core-source/single-file.js' -TotalCount 140; Get-Content -LiteralPath 'work/single-file-cli-source/lib/single-file-util.js' -TotalCount 100; Get-Content -LiteralPath 'work/wechat-ingress-research.json' -TotalCount 40"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' view playwright version; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' view @larksuiteoapi/node-sdk version; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' view single-file-core version; rg -n 'normalizeOptions|removeScripts|removeFrames|blockImages|saveOriginal|compressHTML|removeHidden|maxResourceSize|onprogress' work/single-file-core-source/core/helper.js work/single-file-core-source/core/index.js"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "rg -n 'mp.weixin.qq.com/s|WSClient|long-connection' work/wx2md-source/README* work/wx2md-source/tests work/wx2md-source/site work/wx2md-source/docs; Get-Content -LiteralPath 'work/single-file-core-source/core/helper.js' -TotalCount 220; rg -n 'removeScripts|blockScripts|removeFrames|url:|saveRawPage|filenameTemplate' work/single-file-cli-source/options.js work/single-file-cli-source/*.js"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' install --ignore-scripts"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "rg -n 'blockScripts|removeScripts|removeFrames|removeHiddenElements|saveOriginalURLs|removeUnusedStyles|groupDuplicate|removeAlternative' work/single-file-cli-source/options.js work/single-file-core-source/core/index.js; rg -n 'class WSClient|start\\(|close\\(|getConnection|readyState|isConnected|connect' outputs/wx2md-local/node_modules/@larksuiteoapi/node-sdk/lib/index.js | Select-Object -Last 35; Get-Content -LiteralPath 'outputs/wx2md-local/node_modules/@larksuiteoapi/node-sdk/package.json' -TotalCount 65"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath 'work/single-file-cli-source/options.js' -TotalCount 220; Get-Content -LiteralPath 'outputs/wx2md-local/node_modules/@larksuiteoapi/node-sdk/types/ws-client/index.d.ts' -TotalCount 260; Get-Content -LiteralPath 'outputs/wx2md-local/node_modules/@larksuiteoapi/node-sdk/types/ws-client/types.d.ts' -TotalCount 250"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' scripts/build.mjs; rg --files node_modules/@larksuiteoapi/node-sdk/types | Select-Object -First 10; rg -n 'class WSClient|onConnected|onReconnecting|getConnectionStatus|close\\(' node_modules/@larksuiteoapi/node-sdk/types"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath 'outputs/wx2md-local/node_modules/@larksuiteoapi/node-sdk/types/index.d.ts' | Select-Object -Skip 321580 -First 210"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings work/test-real-archive.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Command node,npm,pnpm -ErrorAction SilentlyContinue | Select-Object Name,Source; Get-ChildItem -LiteralPath 'work/single-file-core-source' -Name | Select-String 'LICENSE|COPYING'; Get-Content -LiteralPath 'work/single-file-core-source/LICENSE' -TotalCount 15; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local/src/server.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local/src/archive.mjs"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Copy-Item -LiteralPath 'work/single-file-core-source/LICENSE' -Destination 'outputs/wx2md-local/LICENSE'; New-Item -ItemType Directory -Force -Path 'outputs/wx2md-local/licenses' | Out-Null; Copy-Item -LiteralPath 'work/wx2md-source/LICENSE' -Destination 'outputs/wx2md-local/licenses/wx2md-MIT.txt'; Copy-Item -LiteralPath 'outputs/wx2md-local/node_modules/@larksuiteoapi/node-sdk/LICENSE' -Destination 'outputs/wx2md-local/licenses/feishu-sdk-MIT.txt'; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/core.test.mjs test/archive.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Copy-Item -LiteralPath 'work/single-file-core-source/LICENSE' -Destination 'outputs/wx2md-local/LICENSE'; New-Item -ItemType Directory -Force -Path 'outputs/wx2md-local/licenses' | Out-Null; Copy-Item -LiteralPath 'work/wx2md-source/LICENSE' -Destination 'outputs/wx2md-local/licenses/wx2md-MIT.txt'; Copy-Item -LiteralPath 'outputs/wx2md-local/node_modules/@larksuiteoapi/node-sdk/LICENSE' -Destination 'outputs/wx2md-local/licenses/feishu-sdk-MIT.txt'"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/core.test.mjs test/archive.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& './outputs/wx2md-local/launch.ps1' -NoBrowser"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/qa-wx2md-app.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath 'outputs/wx2md-local/logs/errors.log' -Tail 15; Get-Content -LiteralPath 'outputs/wx2md-local/logs/runtime.log' -Tail 8; Get-ChildItem -LiteralPath 'outputs/wx2md-local/archives' -Directory | Select-Object Name; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local/public/app.js"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/core.test.mjs test/archive.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/package-wx2md.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -NoProfile -ExecutionPolicy Bypass -File '${WORKSPACE}/outputs/wx2md-local/launch.ps1' -NoBrowser"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' scripts/build.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$env:PYTHONIOENCODING = '"'utf-8'; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/package-wx2md.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$taskHealth = Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/health' -TimeoutSec 3; "'$taskHealth | ConvertTo-Json -Compress; Get-Item -LiteralPath '"'outputs/wx2md-local/启动工具.cmd','outputs/wx2md-local/public/guide.html','outputs/wx2md-local.zip','outputs/wx2md-验证记录.html' | Select-Object Name,Length; Get-Content -LiteralPath 'outputs/wx2md-local/logs/errors.log' -Tail 8"
```

</details>


### 会话阶段 5 · 2026-10-06T11:41:39+08:00

**用户**

## My request:
请给出说明，当前工具相对参考的开源代码修改了什么？（开源项目是哪个）

**助手（commentary）**

我会核对本地工具与参考项目的代码，说明哪些逻辑沿用、哪些做了修改，以及新增了哪些功能。

**助手（final_answer）**

当前工具是基于 **WeChat to Markdown（wx2md）Community 的本地改造版**，主要沿用了文章提取、正文清理和 Markdown 转换代码，新增了本地归档、原格式保存和消息接入功能。

参考项目是：

- **开源仓库**：[wangshan9870/wechat-to-markdown](https://github.com/wangshan9870/wechat-to-markdown)
- **参考版本**：Community v0.3.0
- **固定代码基线**：[提交 68b7337](https://github.com/wangshan9870/wechat-to-markdown/tree/68b7337ae246e6ab328e16961dcd500ff7297466)
- **原项目许可证**：MIT，版权署名为“望山”。

下面比较的是这一公开的 Community 版本。

**直接沿用并调整的代码**

| 原项目代码 | 当前本地代码 | 主要调整 |
|---|---|---|
| `content/extractor.ts`、`content/cleaner.ts` | [extract.mjs](${WORKSPACE}/outputs/wx2md-local/src/extract.mjs) | 合并提取与清理逻辑；调整作者、发布时间识别；将相对图片和正文链接转为完整地址；增加空正文、未加载图片和交互组件识别 |
| `core/markdown.ts` | [markdown.mjs](${WORKSPACE}/outputs/wx2md-local/src/markdown.mjs) | 保留 Turndown＋GFM 转换规则；适配本地图片路径；处理图片说明中的特殊字符；保存时间改为带时区信息的 ISO 格式 |

Markdown 的主要转换引擎仍然是 **Turndown＋GFM**，没有调用大模型，也没有重新开发一套转换引擎。

**主要新增和重写的部分**

| 能力 | 原 Community 版本 | 当前工具 |
|---|---|---|
| 运行方式 | Chrome 浏览器扩展，操作已打开的文章 | 本机后台程序＋中文操作页面，粘贴链接即可保存 |
| 输出格式 | Markdown，或 Markdown＋图片 ZIP | Markdown＋本地图片、原格式 HTML、长截图、保存记录 |
| 图片加载 | 提取 `data-src`，下载图片 | 自动滚动、等待图片加载，增加超时、重试和图片实际内容检查 |
| 原格式保存 | 正文副本会清除样式，供 Markdown 转换 | 另用原网页保存 HTML 和截图；清理后的副本只用于 Markdown |
| 文件写入 | 浏览器下载接口，弹出保存对话框 | 直接写入指定目录，检查完成后再提交整篇归档 |
| 任务管理 | 内存中的重复操作保护 | SQLite 持久队列、文章和消息去重、重启恢复、失败重试 |
| 消息入口 | 没有微信或飞书收件模块 | 新增飞书机器人长连接收件，支持单聊文本和富文本链接 |
| 使用界面 | 扩展弹窗、按钮和快捷键 | 新增保存记录、目录与宽度设置、飞书配置、启动脚本和使用指南 |

其中，[archive.mjs](${WORKSPACE}/outputs/wx2md-local/src/archive.mjs)、`store.mjs`、`worker.mjs`、`server.mjs`、`feishu.mjs` 和中文操作页面，都是为这次需求新增的实现。

**另外使用了两个现成的开源组件**

- [SingleFile Core](https://github.com/gildas-lormeau/single-file-core)：负责把原网页的样式、图片等资源保存进 HTML。使用其现有接口，未修改它的源码。
- [飞书官方 Node SDK](https://github.com/larksuite/node-sdk)：负责长连接和消息事件接收；链接提取、允许发送人名单、去重和入队逻辑由本地工具实现。

所有来源和版本已记录在 [第三方代码说明](${WORKSPACE}/outputs/wx2md-local/THIRD_PARTY_NOTICES.txt)。原 wx2md 的 MIT 声明保留；当前本地项目标记为 **AGPL-3.0-or-later**，并附带许可证。

此前已验证 Windows 手动归档及本地消息处理。**飞书真实账号收件和 Mac 运行尚未由我验收，微信桌面监听尚未实现。**

<details><summary>此阶段执行摘要</summary>

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath 'outputs/wx2md-local/THIRD_PARTY_NOTICES.txt'; Get-Content -LiteralPath 'outputs/wx2md-local/package.json'; Get-Content -LiteralPath 'outputs/wx2md-local/src/extract.mjs'; Get-Content -LiteralPath 'outputs/wx2md-local/src/markdown.mjs'"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath 'work/wx2md-source/src/content/extractor.ts'; Get-Content -LiteralPath 'work/wx2md-source/src/content/cleaner.ts'; Get-Content -LiteralPath 'work/wx2md-source/src/core/markdown.ts'; Get-Content -LiteralPath 'work/wx2md-source/src/background/index.ts'; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe' -C work/wx2md-source rev-parse HEAD; rg -n 'archiveArticle|launchBrowser|SingleFile|offline|imageExtension|screenshot|class Store|class Worker|class FeishuReceiver|parseFeishuMessage|server.listen|session|status|feishu|test\\(' outputs/wx2md-local/src outputs/wx2md-local/test outputs/wx2md-local/scripts/build.mjs"
```

</details>


### 会话阶段 6 · 2026-10-06T11:49:49+08:00

**用户**

## My request:
请新增一些改进：

1. 当前保存的长图太模糊，希望使用原始清晰度
2. 当前保存的html中的图片为什么不能单独打开？是否可以改进下

**助手（commentary）**

我会检查长截图的采集分辨率，以及 HTML 中图片的保存方式。然后提高截图清晰度，并让 HTML 图片可以单独查看和另存。

**助手（commentary）**

原因找到了：旧长图只有 430 像素宽，而文中的多数原图宽 1080 像素，细节在截图时被缩小了。HTML 则把图片内嵌进文件，且没有保留微信原来的点击放大功能。

我会默认改为 3 倍分辨率的 PNG，并增加“100% 像素”查看方式。HTML 正文图片将引用本地原图，支持单独打开；同时保留一个图片内嵌版，方便只携带单个 HTML 文件。

**用户**

3. md格式与原始文档不一致，能否保持尽量一致

此外，软件更新建议使用新的文件夹保存，并使用版本号记录

**助手（commentary）**

可以，我会把这两点一起纳入更新。Markdown 会重点改善标题层级、段落、图片顺序、表格和公式的保留；颜色、字号等自由排版仍需由 HTML 保留。

新版本会放进独立的版本号文件夹，并附上更新记录。我会恢复旧版程序文件，保留已有文章和设置。

**助手（commentary）**

Markdown 的主要损失也找到了：原文中的公式没有完整转换，表格单元格中的段落也会影响排版。我会补上公式和表格保留，并增加 Markdown 阅读预览。新版已放入独立的 `v1.1.0` 文件夹，旧版程序和已保存的文章均已保留。

**助手（commentary）**

新版已完成三项改动：长图默认按 3 倍分辨率直接采集；HTML 图片可点击打开本地原图；Markdown 保留公式、上下标和复杂表格，并提供阅读预览。接下来会用你给的文章验证清晰度、离线显示和点击图片的效果。

**助手（commentary）**

你给的文章已生成新版文件，16 张原图均保存成功，19 个标题、3 张表格和 3 处公式也已保留。测试发现，本地页面原有的隔离设置会阻止新加入的图片引用；直接双击 HTML 可以显示。我正在修正页面预览的这一处设置，然后继续验证图片打开和下载。

**助手（commentary）**

实际验证已通过：示例长图从 **430 × 22032** 提升到 **1290 × 66096 像素**；16 张原图的文件内容与旧版一致，没有二次压缩。HTML 在本地页面和直接双击打开时，都能点击查看原图并另存。新版 Markdown 的标题、完整表格和公式也已逐项核对。

**助手（commentary）**

新版指南和更新记录已整理好，超长文章的分段截图测试也通过了，每段都保留所选分辨率。旧版文件夹保持完整，新版沿用原设置和保存记录；你提供的示例文章另存了一份新版归档，便于对照查看。

**助手（final_answer）**

已完成 **v1.1.0**，保存于独立的 `wx2md-local-v1.1.0` 文件夹。旧版、原文章均保留，设置与保存记录已迁移。

- **长图更清晰**：默认直接采集 3 倍分辨率的无损 PNG。示例文章从 **430 × 22032** 提升至 **1290 × 66096 像素**，新增“100% 像素”查看方式。
- **HTML 原图可打开**：旧版图片内嵌且缺少查看入口。新版点击正文图片即可打开本地原图，支持另存；同时保留单文件 HTML。16 张原图均未重新压缩。
- **Markdown 更接近原文**：改善标题、段落、表格、公式和上下标，并新增阅读预览。示例文章已核对保留 **19 个标题、3 张完整表格、3 处公式**。颜色、字体和精确间距仍以 HTML 为准。

[打开新版工具](http://127.0.0.1:17880) · [使用指南](/${WORKSPACE}/outputs/wx2md-local-v1.1.0/public/guide.html) · [更新记录](/${WORKSPACE}/outputs/wx2md-local-v1.1.0/CHANGELOG.txt) · [下载新版源码包](/${WORKSPACE}/outputs/wx2md-local-v1.1.0.zip)

你提供的文章已另存新版；其他旧文章点击“重新保存”即可获得这些改进。

<details><summary>此阶段执行摘要</summary>

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath 'outputs/wx2md-local/src/archive.mjs'; Get-Content -LiteralPath 'outputs/wx2md-local/src/server.mjs'; Get-Content -LiteralPath 'outputs/wx2md-local/src/extract.mjs'; Get-Content -LiteralPath 'outputs/wx2md-local/test/archive.test.mjs'"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "rg -n 'width|show-browser|settings-form|files|screenshot|原格式|清晰|单独|图片|deviceScale|源码包|430' outputs/wx2md-local/public outputs/wx2md-local/README.txt work/package-wx2md.py work/qa-wx2md-app.mjs; Get-Content -LiteralPath 'work/wx2md-verification.json' -TotalCount 100; Get-Content -LiteralPath 'outputs/wx2md-local/package.json'; Get-Content -LiteralPath 'outputs/wx2md-local/data/config.json' -ErrorAction SilentlyContinue | ForEach-Object { if ("'$_ -notmatch '"'appSecret|appId') { "'$_ } }'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath 'outputs/wx2md-local/src/server.mjs' | Select-Object -Skip 35 -First 125; Get-Content -LiteralPath 'outputs/wx2md-local/public/app.js'; Get-Content -LiteralPath 'outputs/wx2md-local/public/index.html' -TotalCount 45; Get-Content -LiteralPath 'outputs/wx2md-local/test/archive.test.mjs'; Get-Content -LiteralPath 'work/package-wx2md.py' -TotalCount 135"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$taskProbePath = '"'work/probe-wx2md-images.py'; "'$taskProbeContent = @'"'
from pathlib import Path
import json
from PIL import Image
root=Path.cwd()
r=json.loads((root/'work/wx2md-verification.json').read_text(encoding='utf-8'))
p=Path(r['actual_article']['outputDir'])
print(json.dumps([{'file':x.name,'size':list(Image.open(x).size)} for x in (p/'images').iterdir()],ensure_ascii=True))
print('html bytes', (p/'original.html').stat().st_size)
'@; Set-Content -LiteralPath "'$taskProbePath -Value $taskProbeContent -Encoding utf8; & '"'${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' "'$taskProbePath; try { Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/health' -TimeoutSec 2 | ConvertTo-Json -Compress } catch { Write-Output 'local app is not running' }"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local/src/archive.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local/src/html.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local/public/app.js"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' install --frozen-lockfile --ignore-scripts"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/probe-article-layout.mjs"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$taskRuntimeModules = '"'${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'; Get-Item -LiteralPath \""'$taskRuntimeModules/markdown-it/package.json","$taskRuntimeModules/katex/package.json","$taskRuntimeModules/marked/package.json" -ErrorAction SilentlyContinue | ForEach-Object { $taskPkg = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json; [PSCustomObject]@{Name=$taskPkg.name;Version=$taskPkg.version} }; & '"'${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' -e \"const r=require('./work/article-layout-probe.json'); console.log(JSON.stringify({headings:r.headings.length,math:r.math,tables:r.tables}))\"; rg -n 'katex|latex|data-formula|math/tex|annotation' work/wx2md-source/test* -g '*.html'"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/prepare-wx2md-v110.py; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' view markdown-it version"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content work/article-layout-probe.json -TotalCount 35; Get-Content outputs/wx2md-local-v1.1.0/src/extract.mjs; Get-Content outputs/wx2md-local-v1.1.0/src/markdown.mjs'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content work/probe-article-layout.mjs; Get-Content outputs/wx2md-local-v1.1.0/package.json; Get-Content outputs/wx2md-local-v1.1.0/src/server.mjs'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content src/archive.mjs'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content src/html.mjs; Get-Content test/archive.test.mjs; Get-Content launch.ps1'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/probe-math.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content ${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked/package.json; Get-Content outputs/wx2md-local-v1.1.0/src/html.mjs; Get-Content outputs/wx2md-local-v1.1.0/test/archive.test.mjs'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.0/public/app.js; Get-Content outputs/wx2md-local-v1.1.0/README.md; Get-Content outputs/wx2md-local-v1.1.0/THIRD_PARTY_NOTICES.txt; Get-Content outputs/wx2md-local-v1.1.0/test/core.test.mjs'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Copy-Item -LiteralPath '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked/lib/marked.esm.js' -Destination 'outputs/wx2md-local-v1.1.0/vendor/marked.mjs'; Copy-Item -LiteralPath '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked/LICENSE.md' -Destination 'outputs/wx2md-local-v1.1.0/vendor/MARKED-LICENSE.md'"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/*.test.mjs"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/*.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "rg --files outputs/wx2md-local-v1.1.0 -g '"'!node_modules'"' -g '"'!vendor/singlefile.js'"' -g '"'!vendor/marked.mjs'"'; Get-Content outputs/wx2md-local-v1.1.0/README.txt; Get-Content outputs/wx2md-local-v1.1.0/public/guide.html"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/*.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.0/start-mac.command; Get-Content outputs/wx2md-local-v1.1.0/src/store.mjs; Get-Content work/package-wx2md.py; Get-Content work/qa-wx2md-app.mjs'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$taskStatusToken = (Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/api/session').token; "'$taskStatus = Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/api/status' -Headers @{'X-Wx2md-Token'="'$taskStatusToken}; [pscustomobject]@{busy=$taskStatus.busy;jobCount=$taskStatus.jobs.Count;statuses=($taskStatus.jobs.status -join '"', ');archiveDir="'$taskStatus.archiveDir;feishuState=$taskStatus.feishu.state;feishuConfigured=$taskStatus.config.feishu.hasSecret} | ConvertTo-Json'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$taskMigrationToken = (Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/api/session').token; "'$taskBefore = Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/api/status' -Headers @{'X-Wx2md-Token'="'$taskMigrationToken}; if ($taskBefore.busy) { throw '"'An archive task is active; leave the old service running.' }; Invoke-RestMethod -Uri 'http://127.0.0.1:17880/api/stop' -Method Post -Headers @{'X-Wx2md-Token'="'$taskMigrationToken} -ContentType '"'application/json' -Body '{}' | Out-Null; for ("'$taskPoll=0; $taskPoll -lt 30; $taskPoll++) { Start-Sleep -Milliseconds 300; try { Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/health' -TimeoutSec 1 | Out-Null } catch { break } }; "'$taskOldRoot = (Resolve-Path -LiteralPath '"'outputs/wx2md-local').Path; "'$taskNewRoot = (Resolve-Path -LiteralPath '"'outputs/wx2md-local-v1.1.0').Path; "'$taskNewData = Join-Path $taskNewRoot '"'data'; if (Test-Path -LiteralPath "'$taskNewData) { throw '"'New-version data already exists; do not overwrite.' }; New-Item -ItemType Directory -Path "'$taskNewData | Out-Null; Copy-Item -LiteralPath (Join-Path $taskOldRoot '"'data/jobs.sqlite') -Destination "'$taskNewData; $taskConfigPath = Join-Path $taskOldRoot '"'data/config.json'; if (Test-Path -LiteralPath "'$taskConfigPath) { $taskMigratedConfig = Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json; if ([IO.Path]::GetFullPath($taskMigratedConfig.archiveDir).TrimEnd('"'\\','/') -eq (Join-Path "'$taskOldRoot '"'archives')) { "'$taskMigratedConfig.archiveDir = Join-Path $taskNewRoot '"'archives' }; "'$taskMigratedConfig | Add-Member -NotePropertyName screenshotScale -NotePropertyValue 3 -Force; $taskMigratedConfig | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $taskNewData '"'config.json') -Encoding utf8 }; [pscustomobject]@{version='1.1.0';oldRecords="'$taskBefore.jobs.Count;width=$taskBefore.config.width;copiedSettings=$true;oldFilesPreserved=$true} | ConvertTo-Json'
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -NoProfile -ExecutionPolicy Bypass -File 'outputs/wx2md-local-v1.1.0/launch.ps1' -NoBrowser"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -NoProfile -ExecutionPolicy Bypass -File 'outputs/wx2md-local-v1.1.0/launch.ps1' -NoBrowser"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/qa-wx2md-v110.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/probe-v110-http.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$taskRestartToken = (Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/api/session').token; Invoke-RestMethod -Uri 'http://127.0.0.1:17880/api/stop' -Method Post -Headers @{'X-Wx2md-Token'="'$taskRestartToken} -ContentType '"'application/json' -Body '{}' | Out-Null; Start-Sleep -Milliseconds 1500; & 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -NoProfile -ExecutionPolicy Bypass -File 'outputs/wx2md-local-v1.1.0/launch.ps1' -NoBrowser"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/qa-wx2md-v110.mjs --existing"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content work/wx2md-v110-verification.json -TotalCount 85; Get-Content outputs/wx2md-local-v1.1.0/public/index.html'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/update-v110-guide.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -NoProfile -ExecutionPolicy Bypass -File 'outputs/wx2md-local-v1.1.0/launch.ps1' -NoBrowser; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' outputs/wx2md-local-v1.1.0/scripts/check-running.mjs"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/*.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/package-wx2md-v110.py"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local-v1.1.0/src/server.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local-v1.1.0/public/app.js; git status --short"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.0/logs/errors.log; Get-Content outputs/wx2md-local-v1.1.0/logs/runtime.log -Tail 3'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/*.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/qa-v110-release.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' -c 'from pathlib import Path; import zipfile,json; r=Path.cwd(); z=zipfile.ZipFile(r/\"outputs/wx2md-local.zip\"); mismatches=[n for n in z.namelist() if n.startswith(\"wx2md-local/\") and not n.startswith(\"wx2md-local/third-party-source/\") and not n.endswith(\"/\") and (not (r/\"outputs\"/n).exists() or (r/\"outputs\"/n).read_bytes()"'!=z.read(n))]; p=r/"outputs/wx2md-local-v1.1.0/start-mac.command"; print(json.dumps({"baseline_mismatches":mismatches,"mac_script_crlf":p.read_bytes().count(bytes([13,10]))})); assert not mismatches'"'"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/package-wx2md-v110.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$taskFinalToken = (Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/api/session').token; Invoke-RestMethod -Uri 'http://127.0.0.1:17880/api/stop' -Method Post -Headers @{'X-Wx2md-Token'="'$taskFinalToken} -ContentType '"'application/json' -Body '{}' | Out-Null; Start-Sleep -Milliseconds 1500; & 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -NoProfile -ExecutionPolicy Bypass -File 'outputs/wx2md-local-v1.1.0/launch.ps1' -NoBrowser; Invoke-RestMethod -Uri 'http://127.0.0.1:17880/health' | ConvertTo-Json"
```

</details>


### 会话阶段 7 · 2026-10-06T13:33:19+08:00

**用户**

## My request:
还是有些问题：

1. 截长图不是很完整，而且还有拼接错误
2. 新输出多了好多文件，请解释每个文件是什么

**助手（commentary）**

我会先核对当前长图，定位缺失和拼接错误的位置，再修复截图方式。同时把新增文件的用途、哪些需要一起保留，整理成一份说明。

**助手（final_answer）**

长图问题出在哪篇文章或哪个标题附近？例如“表格左右缺列”“底部缺内容”或“某张图上下错位”。我会先检查当前已保存的两篇文章。

**用户**

<send_user_message_question_reply>
[{"questionItemId":"[\"request_user_input_async\",\"call_NW0SG5nWv4ZCLQ6nBsUuZT56\",0]","question":"长图问题出在哪篇文章或哪个标题附近？例如“表格左右缺列”“底部缺内容”或“某张图上下错位”。我会先检查当前已保存的两篇文章。","answer":"上下错位，包含重复的部分、也包含多个公众号作者栏"}]
</send_user_message_question_reply>

**用户**

## My request:
可以参考这个文件："${WORKSPACE}\outputs\wx2md-local-v1.1.0\archives\吃果冻不吐果冻皮\2026-10-06_大模型的稀疏化革命：MoE 架构全景拆解_c9701f72\original.png"

**助手（commentary）**

我已查看你指出的这张图，并复现了问题：中后段的内容与正常阅读位置不一致，底部还重复出现了文章标题和作者区域。上一版验证只检查了尺寸和文件生成，漏掉了这类画面错误。我会改成逐屏采集，记录实际滚动位置后拼接，并核对每处接缝，避免重复或漏行。

**助手（commentary）**

新的采集方式已在这篇文章上通过接缝检查：从顶部到结尾逐屏保存，28 处上下接缝的重叠像素完全一致。悬浮作者工具栏已从截图中排除，顶部正常的文章署名保留；横向滚动表格也已展开，避免右侧列被截掉。修复会放在独立的 `v1.1.1` 文件夹。

**助手（commentary）**

这篇文章已在 `v1.1.1` 中重新保存：新版长图为 **1623 × 66030 像素**，宽度增加是为了包含表格右侧列。顶部、中段、底部和接缝附近的抽样画面，都与正常逐屏阅读的像素一致。文件说明也已加入指南，明确了正文文件、原图和辅助预览页各自的用途。

**助手（final_answer）**

已修复为 **v1.1.1**，并重新保存了这篇文章。新版按实际滚动位置逐屏拼接，排除悬浮作者栏；**28 处上下接缝均通过像素核对**。表格右侧列也已完整采集。旧版目录和旧图保留。

[查看修复后的长图](</${WORKSPACE}/outputs/wx2md-local-v1.1.1/archives/吃果冻不吐果冻皮/2026-10-06_大模型的稀疏化革命：MoE 架构全景拆解_07d9b716/screenshots.html>)

新增文件中，有些是正文，有些只是辅助查看页面：

| 文件 | 用途 |
|---|---|
| `article.md` | 可编辑的 Markdown 正文，需连同 `images/` 保存。 |
| `markdown.html` | Markdown 阅读预览，需 `images/`；方便直接用浏览器阅读。 |
| `original.html` | 原排版 HTML，点击图片可打开原图，需 `images/`。 |
| `original-singlefile.html` | 图片内嵌的 HTML 副本，可以单独携带。 |
| `original.png` | 无损长图；特别长的文章会生成多个 `original-001.png` 等分段。 |
| `screenshots.html` | 长图阅读页面，支持缩放、下载，需对应 PNG。 |
| `images/` | 本地原图，供 Markdown、HTML 和预览页面共同使用。 |
| `images.html` | 原图浏览与下载页面，需 `images/`。 |
| `metadata.json` | 文章来源、保存日期、版本、尺寸及完整性检查记录。 |

**最省事是保留整篇文章目录。** 如果只想携带一个离线阅读文件，使用 `original-singlefile.html`；只需要 Markdown，则保留 `article.md` 和 `images/`。

[新版指南及文件说明](/${WORKSPACE}/outputs/wx2md-local-v1.1.1/public/guide.html) · [下载 v1.1.1](/${WORKSPACE}/outputs/wx2md-local-v1.1.1.zip)

刷新本地工具页面后，可看到标注 **v1.1.1** 的新归档记录。

<details><summary>此阶段执行摘要</summary>

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.0/src/archive.mjs; Get-Content outputs/wx2md-local-v1.1.0/src/html.mjs; Get-Content work/wx2md-v110-verification.json -TotalCount 28'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "rg --files -g AGENTS.md -g '"'!node_modules'"' -g '"'!archives'"' -g '"'!data'"' -g '"'!vendor'"'"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$taskReadToken = (Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/api/session').token; "'$taskCurrentStatus = Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/api/status' -Headers @{'X-Wx2md-Token'="'$taskReadToken}; $taskCurrentStatus.jobs | Select-Object id,title,status,created_at,output_dir,@{Name='"'screenshots';Expression={"'$_.metadata.screenshots}},@{Name='"'warnings';Expression={"'$_.metadata.warnings}} | ConvertTo-Json -Depth 6'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.0/package.json; Get-Content outputs/wx2md-local-v1.1.0/test/archive.test.mjs; Get-Content outputs/wx2md-local-v1.1.0/public/app.js -TotalCount 50'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/diagnose-capture.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/compare-capture.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.0/src/worker.mjs; Get-Content outputs/wx2md-local-v1.1.0/README.txt -TotalCount 42; Get-Content work/prepare-wx2md-v110.py'
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$taskRuntimeModules = '"'${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'; 'pngjs','sharp','jimp','jpeg-js' | ForEach-Object { "'$taskPackagePath = Join-Path $taskRuntimeModules (Join-Path $_ '"'package.json'); if (Test-Path -LiteralPath "'$taskPackagePath) { Get-Content -LiteralPath $taskPackagePath -Raw -Encoding UTF8 | ConvertFrom-Json | Select-Object name,version,license } }; Get-Content outputs/wx2md-local-v1.1.0/node_modules/playwright-core/lib/server/screenshotter.js -TotalCount 265'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/prepare-v111.py; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' --dir outputs/wx2md-local-v1.1.1 install --ignore-scripts --prefer-offline"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.1/vendor/pngjs/lib/packer.js; Get-Content outputs/wx2md-local-v1.1.1/vendor/pngjs/lib/crc.js; Get-Content outputs/wx2md-local-v1.1.1/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/server/screenshotter.js -TotalCount 255'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/check-new-capture.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/*.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/compare-v111-proof.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/*.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/update-v111-text.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$taskUpgradeToken = (Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/api/session').token; "'$taskUpgradeState = Invoke-RestMethod -Uri '"'http://127.0.0.1:17880/api/status' -Headers @{'X-Wx2md-Token'="'$taskUpgradeToken}; if ($taskUpgradeState.busy) { throw '"'There is an active archive task.' }; Invoke-RestMethod -Uri 'http://127.0.0.1:17880/api/stop' -Method Post -Headers @{'X-Wx2md-Token'="'$taskUpgradeToken} -ContentType '"'application/json' -Body '{}' | Out-Null; Start-Sleep -Milliseconds 1500; "'$taskUpgradeOld = (Resolve-Path -LiteralPath '"'outputs/wx2md-local-v1.1.0').Path; "'$taskUpgradeNew = (Resolve-Path -LiteralPath '"'outputs/wx2md-local-v1.1.1').Path; "'$taskUpgradeData = Join-Path $taskUpgradeNew '"'data'; if (Test-Path -LiteralPath "'$taskUpgradeData) { throw '"'New data directory already exists.' }; New-Item -ItemType Directory -Path "'$taskUpgradeData | Out-Null; Copy-Item -LiteralPath (Join-Path $taskUpgradeOld '"'data/jobs.sqlite') -Destination "'$taskUpgradeData; $taskUpgradeConfig = Get-Content -LiteralPath (Join-Path $taskUpgradeOld '"'data/config.json') -Raw -Encoding UTF8 | ConvertFrom-Json; if ([IO.Path]::GetFullPath("'$taskUpgradeConfig.archiveDir).TrimEnd('"'\\','/') -eq (Join-Path "'$taskUpgradeOld '"'archives')) { "'$taskUpgradeConfig.archiveDir = Join-Path $taskUpgradeNew '"'archives' }; "'$taskUpgradeConfig | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $taskUpgradeData '"'config.json') -Encoding utf8; [pscustomobject]@{recordsCopied="'$taskUpgradeState.jobs.Count;settingsCopied=$true;oldArchivesPreserved=$true} | ConvertTo-Json; & '"'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -NoProfile -ExecutionPolicy Bypass -File 'outputs/wx2md-local-v1.1.1/launch.ps1' -NoBrowser"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/prepare-v111-qa.py; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/qa-wx2md-v111.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local-v1.1.1/src/screenshot.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local-v1.1.1/src/png-stream.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local-v1.1.1/public/app.js; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' --dir outputs/wx2md-local-v1.1.1 install --frozen-lockfile --ignore-scripts --prefer-offline"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/package-wx2md-v111.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' -c 'from pathlib import Path; import zipfile,json; root=Path.cwd(); package=zipfile.ZipFile(root/\"outputs/wx2md-local-v1.1.0.zip\"); mismatches=[n for n in package.namelist() if not n.endswith(\"/\") and not n.startswith(\"wx2md-local-v1.1.0/third-party-source/\") and (not (root/\"outputs\"/n).exists() or (root/\"outputs\"/n).read_bytes()"'!=package.read(n))]; print(json.dumps({"v110_source_unchanged":not mismatches,"mismatches":mismatches})); assert not mismatches'"'; & 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -NoProfile -ExecutionPolicy Bypass -File 'outputs/wx2md-local-v1.1.1/launch.ps1' -NoBrowser; Invoke-RestMethod -Uri 'http://127.0.0.1:17880/health' | Select-Object app,version | ConvertTo-Json"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/qa-v111-docs.mjs"
```

</details>


### 会话阶段 8 · 2026-10-06T13:52:01+08:00

**用户**

## My request:
再进行如下微调，发布v1.2.0版本：

1. 仅保留可编辑的md文件、图片内嵌html文件、无损长图和`metadata.json`  信息
2. 无损长图当前右侧有空白，请改为按照手机比例和电脑比例分别保存一个无损长图



此外，当前开启的是哪个版本的服务，如何更新为最新的？

**助手（commentary）**

我会将 `v1.2.0` 保存到独立文件夹，精简归档文件，并分别生成手机和电脑阅读比例的无损长图。先检查当前运行版本和截图布局，再切换到新版；已有文章和设置会保留。

**助手（commentary）**

目前运行的是 **v1.1.1**，我已通过服务接口确认。

新版将只生成 **5 个文件**：MD、图片内嵌 HTML、手机长图、电脑长图和 `metadata.json`。MD 的图片也会内嵌，取消单独的图片目录。手机和电脑将分别按 9:16、16:9 的阅读窗口重新排版；长图高度随文章长度变化。这样可以去掉上一版为展开宽表格而增加的右侧空白。

**用户**

## My request:
补充下，保留的文件使用文章标题明明

**用户**

## My request:
补充下，保留的文件使用文章标题命名

**助手（commentary）**

已加入文章标题命名：新版的5个文件将使用“文章标题.md”“文章标题.html”“文章标题_手机.png”“文章标题_电脑.png”和“文章标题_metadata.json”。标题中不能用于文件名的字符会自动替换。

**助手（commentary）**

已定位右侧空白的原因：上一版为了展开宽表格，增加了整张长图的宽度。新版会按手机、电脑窗口分别排版，宽表格在各自阅读宽度内换行，并裁掉电脑页面外侧的多余空白。接下来会核对两种长图的表格列、底部内容和拼接接缝。

**助手（commentary）**

新版的五文件归档已经通过浏览器测试：MD 和 HTML 内嵌了原图，超过10万像素行的长文章也分别保存为一张手机图、一张电脑图。原图查看和下载功能保留在 HTML 内。现在开始用你提供的 MoE 文章验证实际效果，然后切换当前服务到 v1.2.0。

**助手（commentary）**

服务已切换到 **v1.2.0**，原来的5条保存记录和设置已保留。MoE 文章的手机长图已生成，电脑长图接近完成；随后会对照正常浏览画面检查顶部、表格、公式、接缝和结尾。新版页面底部会显示实际运行版本。

**助手（commentary）**

MoE 文章已按新版重新保存，恰好生成5个标题命名文件。手机长图为 **1296 × 67515**，电脑长图为 **2154 × 49296**；表格列和结尾均完整，拼接接缝检查通过。MD、HTML 内嵌的16张图片与原图字节一致，断网显示和原图下载也已验证。

**助手（final_answer）**

已发布 **v1.2.0**，当前服务已从 v1.1.1 切换到新版。刷新[本地页面](http://127.0.0.1:17880/)即可使用，页面底部会显示运行版本。

每篇文章现在只保存5个文件，全部按标题命名：

| 文件 | 用途 |
|---|---|
| `文章标题.md` | 可编辑正文，图片内嵌 |
| `文章标题.html` | 原排版 HTML，图片和样式内嵌 |
| `文章标题_手机.png` | 手机阅读宽度的无损长图 |
| `文章标题_电脑.png` | 电脑阅读宽度的无损长图 |
| `文章标题_metadata.json` | 来源、版本、尺寸与校验信息 |

两种长图分别按 **9:16、16:9阅读窗口**重新排版，裁掉多余空白；最终高度随文章长度变化。你的 MoE 文章已重新保存，手机图为 **1296×67515**，电脑图为 **2154×49296**，表格、接缝和结尾检查通过。

旧版本、设置和文章均已保留。旧文章需点击“重新保存”才会生成新版文件组合。

[下载新版源码包](/${WORKSPACE}/outputs/wx2md-local-v1.2.0.zip) · [使用与升级指南](/${WORKSPACE}/outputs/wx2md-local-v1.2.0/public/guide.html) · [实测结果](/${WORKSPACE}/outputs/wx2md-v1.2.0-验证记录.html)

以后切换版本：**停止旧服务 → 双击新版目录的“启动工具.cmd” → 刷新页面并核对版本号**。

<details><summary>此阶段执行摘要</summary>

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.1/src/server.mjs; Get-Content outputs/wx2md-local-v1.1.1/public/app.js; Get-Content outputs/wx2md-local-v1.1.1/public/index.html; Get-Content outputs/wx2md-local-v1.1.1/launch.ps1'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Invoke-RestMethod -Uri 'http://127.0.0.1:17880/health' | ConvertTo-Json; Get-Content outputs/wx2md-local-v1.1.1/src/screenshot.mjs; Get-Content outputs/wx2md-local-v1.1.1/src/archive.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "rg --files -g AGENTS.md -g '"'!node_modules'"' -g '"'!archives'"'; Get-Content outputs/wx2md-local-v1.1.1/test/screenshot.test.mjs; Get-Content outputs/wx2md-local-v1.1.1/test/archive.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/probe-desktop-layout.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.1/src/archive.mjs | Select-Object -Skip 138; Get-Content outputs/wx2md-local-v1.1.1/src/server.mjs | Select-Object -Last 75; Get-Content outputs/wx2md-local-v1.1.1/src/markdown.mjs | Select-Object -First 63'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-ChildItem -Name outputs; Get-Content outputs/wx2md-local-v1.1.1/src/screenshot.mjs'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.1/src/archive.mjs; Get-Content outputs/wx2md-local-v1.1.1/src/server.mjs; Get-Content outputs/wx2md-local-v1.1.1/package.json'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content work/prepare-v111.py; Get-Content outputs/wx2md-local-v1.1.1/public/app.js; Get-Content outputs/wx2md-local-v1.1.1/public/index.html; Get-Content outputs/wx2md-local-v1.1.1/src/html.mjs; Get-Content outputs/wx2md-local-v1.1.1/test/screenshot.test.mjs; Get-Content outputs/wx2md-local-v1.1.1/src/urls.mjs'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.1/test/archive.test.mjs; Get-Content outputs/wx2md-local-v1.1.1/src/markdown.mjs; Get-Content outputs/wx2md-local-v1.1.1/README.md; Get-Content outputs/wx2md-local-v1.1.1/CHANGELOG.md; Get-Content work/package-wx2md-v111.py; Get-Content work/qa-wx2md-v111.mjs'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-ChildItem outputs/wx2md-local-v1.1.1 -Name; Get-Content outputs/wx2md-local-v1.1.1/CHANGELOG.txt; Get-Content outputs/wx2md-local-v1.1.1/README.txt; Get-Content outputs/wx2md-local-v1.1.1/launch.ps1; Get-Content outputs/wx2md-local-v1.1.1/THIRD_PARTY_NOTICES.txt; Get-ChildItem outputs/wx2md-local-v1.1.1/test -Name'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/prepare-v120.py; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' --dir outputs/wx2md-local-v1.2.0 install --offline --frozen-lockfile --ignore-scripts"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/refactor-v120.py; rg -n 'images/|article.md|original.html|captureScreenshot|fileNames|localPath|1.1.1' outputs/wx2md-local-v1.2.0/src/archive.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/update-v120-ui.py; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local-v1.2.0/src/archive.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local-v1.2.0/src/server.mjs; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --check outputs/wx2md-local-v1.2.0/src/html.mjs"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/update-v120-tests.py; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/*.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/update-v120-tests.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.1.1/public/guide.html; Get-Content outputs/wx2md-local-v1.1.1/src/store.mjs; Get-Content outputs/wx2md-local-v1.1.1/src/worker.mjs'
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/*.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/write-v120-docs.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/screenshot.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings work/switch-to-v120.mjs; & outputs/wx2md-local-v1.2.0/launch.ps1 -NoBrowser"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.2.0/src/archive.mjs | Select-Object -Skip 140 -First 130; Get-Content outputs/wx2md-local-v1.2.0/test/archive.test.mjs | Select-Object -Skip 22 -First 100; Get-Content work/wx2md-v120-current-job.json'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Invoke-RestMethod -Uri 'http://127.0.0.1:17880/health'; rg -n 'original-singlefile|images/|markdown.html|screenshots.html|网页宽度|metadata.json|1.1.1' outputs/wx2md-local-v1.2.0/public/guide.html outputs/wx2md-local-v1.2.0/README.txt outputs/wx2md-local-v1.2.0/public/index.html"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings work/qa-wx2md-v120.mjs"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/check-v120-pixels.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.2.0/logs/errors.log; Get-Content outputs/wx2md-local-v1.2.0/scripts/check-running.mjs; Get-Content outputs/wx2md-local-v1.2.0/src/png-stream.mjs'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/check-v120-pixels.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/package-wx2md-v120.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.2.0/public/style.css; Get-Content outputs/wx2md-local-v1.2.0/start-mac.command; Get-Content outputs/wx2md-local-v1.2.0/.gitignore'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File outputs/wx2md-local-v1.2.0/launch.ps1 -NoBrowser'
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File outputs/wx2md-local-v1.1.1/launch.ps1 -NoBrowser'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' work/qa-v120-release.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Item -LiteralPath outputs/wx2md-local-v1.2.0.zip,outputs/wx2md-v1.2.0-验证记录.html | Select-Object Name,Length; Invoke-RestMethod -Uri 'http://127.0.0.1:17880/health'"
```

</details>


### 会话阶段 9 · 2026-10-06T14:14:35+08:00

**用户**

## My request:
再修改一点点：

1. md保存时，图片还是和之前一样保存在images文件夹下面，使用本地引用的方式

**助手（commentary）**

我会把 Markdown 图片改回保存在 `images/` 文件夹，并使用相对路径引用；HTML 继续内嵌图片。按之前的版本管理方式，这次另存为 v1.2.1，验证后切换服务。

**助手（commentary）**

已改为 `![图片](images/001.jpg)` 这样的本地引用，原图直接写入 `images/`。正在验证断网阅读和整篇目录移动后的图片显示；以后备份 Markdown 时，需要把 MD 与 `images/` 一起保存。

**助手（commentary）**

验证通过：Markdown 的本地图片在断网和目录移动后均能显示。服务已切换到 **v1.2.1**，原来的7条记录和设置已保留；正在重新保存 MoE 示例，核对16张原图及新版输出。

**助手（final_answer）**

已完成并切换到 **v1.2.1**，刷新[本地页面](http://127.0.0.1:17880/)即可使用。

- MD 图片保存到 `images/`，使用 `![图片](images/001.jpg)` 的相对路径引用。
- HTML 继续内嵌图片，手机和电脑两张无损长图保留。
- MoE 示例已重新保存，16张本地图片断网显示验证通过。

**移动或备份 MD 时，请连同 `images/` 一起保存。** 其他旧文章点击“重新保存”即可采用新版格式。

[新版源码包](/${WORKSPACE}/outputs/wx2md-local-v1.2.1.zip) · [使用指南](/${WORKSPACE}/outputs/wx2md-local-v1.2.1/public/guide.html)

<details><summary>此阶段执行摘要</summary>

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-ChildItem -Name; Get-ChildItem outputs/wx2md-local-v1.2.0 -Name; Get-Content outputs/wx2md-local-v1.2.0/src/archive.mjs; Get-Content outputs/wx2md-local-v1.2.0/src/server.mjs; Get-Content outputs/wx2md-local-v1.2.0/src/markdown.mjs'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "rg --files -g AGENTS.md -g '*v120*' -g '"'!node_modules'"' -g '"'!archives'"' -g '"'!data'"'; Get-Content outputs/wx2md-local-v1.2.0/test/archive.test.mjs; Get-Content work/switch-to-v120.mjs; Get-Content outputs/wx2md-local-v1.2.0/README.txt; Get-Content outputs/wx2md-local-v1.2.0/public/guide.html | Select-Object -First 28"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/prepare-v121.py; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' --dir outputs/wx2md-local-v1.2.1 install --offline --frozen-lockfile --ignore-scripts"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/update-v121.py"
```

状态：failed；退出码：1

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/*.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "rg -n '内嵌|独立携带|目录|1.2.0|data URI|五个|5 个' outputs/wx2md-local-v1.2.1/public/guide.html outputs/wx2md-local-v1.2.1/public/index.html outputs/wx2md-local-v1.2.1/README.txt; Get-Content work/switch-to-v121.mjs | Select-Object -First 20"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings --test test/archive.test.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command 'Get-Content outputs/wx2md-local-v1.2.1/public/guide.html | Select-Object -Skip 12 -First 17; Get-FileHash -Algorithm SHA256 -LiteralPath outputs/wx2md-local-v1.2.0/src/screenshot.mjs,outputs/wx2md-local-v1.2.1/src/screenshot.mjs,outputs/wx2md-local-v1.2.0/src/html.mjs,outputs/wx2md-local-v1.2.1/src/html.mjs | Select-Object Path,Hash'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings work/switch-to-v121.mjs; if ("'$LASTEXITCODE -eq 0) { & outputs/wx2md-local-v1.2.1/launch.ps1 -NoBrowser }'
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' work/package-wx2md-v121.py"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "& '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --no-warnings work/qa-wx2md-v121.mjs"
```

状态：completed；退出码：0

```powershell
"${USER_HOME}/.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "powershell.exe -NoProfile -ExecutionPolicy Bypass -File outputs/wx2md-local-v1.2.1/launch.ps1 -NoBrowser; & '${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module -e \"const h=await(await fetch('http://127.0.0.1:17880/health')).json(); console.log(JSON.stringify(h));\""
```

</details>


### 当前整理阶段 · 2026-10-06

用户要求完整开发记录和 README、本地仅保留当前版本、更名为 v1.0.0.p，并上传开发代码到指定 GitHub 仓库。随后明确分支名为 dev_p，tag 保持 v1.0.0.p；授权凭据没有写入记录。
本次执行包括独立目录准备、版本映射、依赖安装、6 项本地测试、45 项上游测试、扩展构建、文章与任务路径迁移、历史 ZIP 校验、源代码凭据检查、提交、分支与 tag 推送和远端 ref 核对。发布身份和整理清单见 development/release-manifest.json 与本机 history/ 内压缩清单；最终提交以 Git tag 所指向的提交为准。


## Mac 特性阶段 · 2026-10-08

用户要求增加 Mac 支持与环境安装、软件启动指导，并在新的特性分支实现。建立 feat/macos-support，基于 dev_p / 3568b19；软件版本增加到 v1.1.0.p。

原 Mac 脚本只做 Node 检查、依赖安装和 nohup，未覆盖浏览器缺失、Finder 路径、端口冲突、并发启动、停止和诊断。现新增四个 command 入口与共享 Bash 3.2 初始化；LF 和执行权限由 Git 记录。安装采用锁文件，缺失时下载与当前 Playwright 匹配的 Chromium；已有浏览器实际启动成功即可复用。

采集浏览器选择集中到 browser.mjs：Windows 优先 Edge，Mac 优先匹配的 Chromium，再尝试 Chrome 与 Edge。所有浏览器回归测试使用同一选择策略。doctor 实测 SQLite 与 PNG 渲染；runtime 检查健康接口的目录、版本与端口，使用独立后台进程、启动锁、日志以及原有停止 API 的忙碌保护。不会通过端口查询强制杀其他进程。

MAC_GUIDE.md 是指南源文件，build:guides 生成可断网打开的 mac-guide.html；主使用页提供入口。指南涵盖 Node 官方安装器、Homebrew 路径、nvm、首次安装、启动停止、权限、网络、验证码、日志、睡眠和飞书消费者切换。Mac 不直接复制 Windows data，以避免绝对路径失效；文章与图片可以独立复制。

新增 GitHub Actions 工作流，矩阵为 windows-latest、macos-15（Apple Silicon）、macos-15-intel。运行锁定依赖安装、浏览器安装、完整归档和截图回归、Mac 原生首次安装与后台生命周期。实际结果以 Actions 为准，不将 Windows 模拟或语法检查称为用户 Mac 实测。

Windows 验证：本地 10 项（原 6 项加运行模块 4 项）通过，上游 45 项与构建通过。版本目录迁至 wx2md-local-v1.1.0.p，任务与文章绝对路径更新。迁移中的 Windows 依赖 junction 无法直接随目录移动，恢复目录后按锁文件重新安装依赖；文章与配置未改写内容。8 条任务、9 个文章目录、238 个文章文件、171 个 HTTP 图片引用已复核。旧源码 ZIP 移入 history，原基线 tag 保留。

原生验证于 2026-10-08 09:51（北京时间）完成：代码提交 bc1b20ad23554fc2d609e5025cacad346f9c7fde 在 Windows、Apple Silicon Mac 与 Intel Mac 的三项任务全部通过。两种 Mac 均完成首次安装、10 项归档与运行测试、构建、环境诊断、重复启动与重复停止。结果见 [Actions run 37714715001](https://github.com/Er1ckPang/wechat-to-markdown/actions/runs/37714715001)；发布清单记录该代码提交与实际结果，后续补充验证记录的提交只修改文档。

## 多网站特性阶段 · 2026-10-08

用户要求在当前 1.1.0.p 基础上支持知乎、CSDN、博客园等网站自动保存，新增特性分支并同步文档。以 833164274291ddaf48e200c5aa995b628cada2c7 为基线，在独立 wx2md-local-v1.2.0.p 目录建立 feat/multi-site-archive；不覆盖之前的 Mac 分支或基线 tag。

原流程将 URL、正文选择器和图片域名绑定到公众号。新增 urls.mjs 的站点识别、链接范围与分享去重，sites.mjs 的专用正文适配与通用语义正文，network.mjs 的公网地址及 DNS 检查。知乎回答按链接 ID 选择，只保存一个回答；问题列表须先取得具体回答链接。普通网页只尝试识别单篇正文，列表、登录、验证和明显受限页面不会冒充文章完成。手动输入、飞书文本／富文本和本地消息模拟均复用相同识别与队列逻辑。

公众号归档保持原页面。新增站点将选中正文及其主要样式放入阅读容器，移除导航、推荐、评论、复制按钮、代码行号；保留代码语言与可识别的知乎 ee、KaTeX／MathJax 数学源。MD、SingleFile HTML 和两种 PNG 都使用该选中正文，继续保存标题命名的五个文件及 images 原图目录。metadata 增加站点与提取说明；旧归档不改写。

实际博客园页面中的脚本改写 String.replace，导致直接注入 SingleFile 时出现 formatFilename 异常。修正为保留 DOM／CSS／来源 base URL 的无脚本独立页面，再执行归档库；自写测试页故意污染内置方法，覆盖这个回归。MDN 的 main 使用 display:contents，原可见性判断会误判为空；改为检查该类容器的可见子节点。真实博客园及 MDN 中文文档最终均完整保存、断网检查通过，两种 PNG 的覆盖与接缝检查通过。

当前网络对知乎和 CSDN 返回 HTTP 403，已验证人工确认状态与错误页不落盘，但不将其称为真实在线归档已通过。新增的自写站点测试验证专栏、指定回答、CSDN、博客园和普通网页的整条归档链路，覆盖原图字节、本地 MD、离线 HTML、公式、代码、双长图、混合消息持久入队与去重，以及公网边界／列表／验证／付费提示拒绝。Windows 本地共 19 项回归通过；上游 45 项和构建通过。跨平台实际结果以本次发布清单记录的 Actions 为准。

README、文字说明、主指南、Mac 指南和新 SITES_GUIDE.md 同步更新；build:guides 生成两个离线 HTML 指南，并修正其内部链接。当前电脑的数据迁移和历史压缩核对见本机 data 内私有记录；公开发布清单不包含凭据或真实文章。

原生验证于 2026-10-08 10:28（北京时间）完成：代码提交 bbf8be78a20644f7a0527cbd0146c866dcc3e5bc 的 Windows、Apple Silicon Mac、Intel Mac 三项任务全部成功，均完成 19 项回归，Mac 继续完成安装与后台生命周期检查。[Actions run 37717829085](https://github.com/Er1ckPang/wechat-to-markdown/actions/runs/37717829085) 与发布清单保留实际证据；后续记录提交只改开发日志与清单。

当前电脑切换为 1.2.0.p，8 条任务、9 个文章目录、238 个文件（约 414 MB）按 SHA-256 校验一致，飞书配置保持并重新连接。HTTP 下的 8 份 MD、171 个本地图片引用和 55 个元信息文件大小复核通过。操作页面与三份指南在 390／1100 像素宽度无溢出、无页面异常，站点指南内部链接可访问。旧版源码 ZIP 及私有运行记录 ZIP 移入 history，仅保留 1.2.0.p 可编辑目录。

## 链接健康、批量并发与故障修复阶段 · 2026-10-08

用户基于 v1.2.0.p 要求：识别失效链接并在网页提醒、自动跟随已迁移公众号、单次上限100篇、并发保存；随后补充 Attention 示例超宽长图报错和现有失败记录分析。以 245eb10713701b765a4625b971b3b2d468ec967b 为基线，新建 feat/link-health-batch-parallel，在独立 wx2md-local-v1.3.0.p 目录开发，未改动历史分支或 v1.0.0.p tag。

新增 link-state.mjs：在没有可读正文的错误面板识别删除、过期、侵权下架、违规及 HTTP404/410，避免把文章中引用的提示误判为失效；验证码、HTTP403/429分别作为人工确认或暂时限流。读取迁移提示页的 js_access_msg／访问文章链接，只接受有效微信文章地址，最多5次并检测循环。处理导航期间执行上下文变化，保留 original_url、resolved_url、link_state 和 migrations。实际迁移示例提供新的微信链接，但目标在当前网络进入验证页；没有宣称免验证完整保存成功，网页保留新链接供正常验证后重试。

单次上限统一为100个不同链接，手动批次使用事务，飞书收到超额消息时记录拒绝原因；101篇不部分入队。网页请求体上限提升到1MB，以容纳较长的100条文章链接。Worker同步领取任务再并发，避免重复处理；全局1–4篇（默认2），同域名最多2篇，约800ms启动间隔，网站限流后该域名新任务等待约60秒。截图管线互斥，MD／HTML／图片下载继续并发；排队等待截图不消耗该任务的采集超时。调低并发只影响后续领取，已开始任务正常完成。统计覆盖完整数据库；随后按第8项需求拆分首页与保存记录页，分类筛选后最多分页查看10000条。

超宽长图根因：长数学SVG使用 max-width:300%!important，嵌套代码 span/code 使用 white-space:pre，旧逻辑展开溢出后超过阅读宽度。修复截图阶段按 SVG viewBox 等比例缩放，保留全部矢量路径；整段代码及嵌套节点使用 pre-wrap／anywhere，不删代码。HTML与MD不受此截图换行影响。排版不再只比较两次尺寸，改为最多2.4秒内连续3次稳定后采集，保留覆盖及接缝保护。无法排版时报告溢出元素类型。

旧版 errors.log/runtime.log 没有保存这些任务错误，实际失败信息位于 SQLite jobs.error。升级前逐项检查16条未完成记录：6篇长图排版错误、3篇作者删除、6篇下架／无法查看、1篇迁移。自写回归覆盖 SVG、嵌套代码与延迟排版；真实 Attention 示例完成14张图离线显示、手机1296×57738与电脑2154×51534（初次修复验证）的整篇长图。其他旧失败页的排版对比和后续完整重试结果在本机 logs/failure-analysis，私有文章与完整URL不提交Git。

新增 diagnostics.mjs，将失败阶段、类型、堆栈写入私有 logs/failures.jsonl，隐藏临时访问token；网页展示简洁原因，不把堆栈作为普通使用提示。Worker 保存 failure_stage，后续排障可定位具体步骤。

Windows本地26项全回归通过（新改动继续运行对应回归）；包含100篇恰好一次调度、并发上限、长图互斥、失败隔离、限流、事务／101篇拒绝、迁移／失效分类和两个真实浏览器任务同时归档。100篇调度测试使用模拟归档，完整浏览器验证为双篇；不混淆两种证据。上游45项测试、TypeScript与Vite构建通过。原生Windows、Apple Silicon、Intel Mac结果以版本清单中的实际Actions记录为准。

切换旧服务前，暂停待领取任务并等正在保存的文章完成，正常停止后恢复持久队列再迁移。保留104条任务、43条已生成文件的记录、1216个文件（2,198,711,773字节）逐一SHA-256一致；飞书配置保持，路径更新到新目录。新服务默认并发2篇，网页与/health显示1.3.0.p；16条旧失败记录已重新入队，失效案例可得到明确状态，排版案例执行完整重试。101篇手动／模拟提交和非法并发5在实际服务被拒绝，既有配置不改变。待保存队列继续后台处理。
运行复核还发现8条旧记录仍指向移入 archives/.history 前的路径；文件本身已经在历史目录中，未丢失。新增维护脚本 repair-history-paths.py：仅对缺失路径查找同一 archives 下的 .history 候选，校验已有文件大小及SHA-256后修正数据库引用。8条记录、55个已登记文件复核通过，未移动或改写文章。此问题与文章抓取失败分别记录。

### 补充第7项：动图导致接缝失败

推理优化综述的实际任务在手机长图53%处报告“上下截图重叠区不一致”。浏览器响应及原图格式核对发现3张GIF；CSS禁用动画不能停止图片帧播放。只在临时截图DOM中检测GIF／WebP／PNG动画块，使用ImageDecoder解码frameIndex=0，在原naturalWidth／naturalHeight画布中无损固定帧，然后维持实际滚动与接缝校验。单文件HTML、MD本地图片、原始字节不改写。解码接口参考[WebCodecs ImageDecoder](https://w3c.github.io/webcodecs/#imagedecoder-interface)；采集使用项目原有Chromium／Edge浏览器，普通UI不要求用户浏览器提供该接口。

自写两帧红／蓝GIF、WebP和APNG测试，测试HTML禁用网络连接，断言各段保持首帧红色、原像素64×256、原始字节不变、全部行覆盖和结尾完整。实际用户示例重试completed，28张图片均断网显示，手机1296×64710、电脑2154×52617，两种长图接缝差异为0，metadata保留3张固定首帧记录。未降低或关闭接缝阈值。

### 补充第8项：首页摘要和独立保存记录页

首页保留全部记录、已生成文件、活跃任务、需关注四种摘要，卡片仅显示processing及pending，最多12条，其他等待任务可进记录页查找。新增records.html／records.js，抽取job-ui.js共用输出链接与重试操作。GET /api/status只返回活跃摘要，不再每1.8秒拉取300条完整metadata；GET /api/jobs保留本地令牌校验，SQLite参数绑定执行全库筛选。

record-query.mjs提供分类（已生成文件／活跃／需关注）、状态、网站、公众号／作者、来源、北京时间入队日期、关键词字面匹配及四种排序；20／50／100条分页，结果上限10000，精确匹配总数及截断提醒。筛选在截断前执行，数据库记录不删、不设10000存储限制。JSON返回共用卡片必要字段，排除庞大截图瓦片和文件校验信息；全文metadata继续保存在原归档及任务中。索引支持状态和时间查询，旧记录缺站点时从原URL分类。页码、筛选可收藏和后退恢复。

10005条自写任务验证100页无重复、上限外旧记录通过筛选可达、尾页不足整页、日期边界、字面%_、错误参数拒绝；真实浏览器验证首页只有活跃条目、筛选、下一页、跳转、清空、后退与空结果。实际105条记录页面在390／768／1100宽度无横向溢出或脚本错误，9条失效筛选和末页跳转通过。共30项不同本地回归通过（29项完整运行，再加入记录页浏览器回归后3项记录测试通过），最终原生流水线再执行完整30项。全库文件与MD引用检查见本机baseline-verification，私有报告不提交Git。
