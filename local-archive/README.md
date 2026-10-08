# wx2md Local v1.3.0.p

本目录是可运行的本地工具。完整使用、二次开发和数据说明见 [仓库 README](../README.md)，开发过程见 [DEVELOPMENT_LOG.md](../DEVELOPMENT_LOG.md)。

Windows 双击 `启动工具.cmd`；开发安装运行 `pnpm install --frozen-lockfile --ignore-scripts`、`pnpm test`、`pnpm start`。
Mac 首次运行 `install-mac.command`，以后运行 `start-mac.command`；详细安装、停止和排障见 [Mac 指南](MAC_GUIDE.md) 或 [离线 HTML 指南](public/mac-guide.html)。
MD 图片位于同级 `images/`；HTML 图片内嵌，手机和电脑长图各一张。

手动输入和飞书消息支持公众号、知乎专栏／具体回答、CSDN、博客园及可识别的普通文章网页；链接范围、排版与访问限制见 [多网站指南](SITES_GUIDE.md) 或 [离线指南](public/sites-guide.html)。

首页显示摘要和活跃任务；完整记录在 [保存记录页](http://127.0.0.1:17880/records.html)，支持分类、组合筛选、排序、分页和跳转，最多查询10000条匹配结果。MD／HTML保留原始动图；长图固定首帧以保证接缝一致。

采集浏览器微信验证超时时，在日常浏览器正常打开文章、滚动加载图片后保存 MHTML，或用 SingleFile 保存内嵌 HTML。首页展开“从普通浏览器导入”，填写实际链接并选择单文件（最多64 MB），后台断网生成同样输出。失败记录的入口可继续原任务；迁移文章填新链接。详见[导入指南](public/guide.html#browser-import)。导入副本位于私有 `data/browser-imports/`，普通完整网页的资源文件夹不支持直接导入。
