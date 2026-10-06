from pathlib import Path
root = Path(__file__).resolve().parent.parent
guide = root / 'outputs/wx2md-local-v1.1.0/public/guide.html'
text = guide.read_text(encoding='utf-8')
def replace(old, new):
    global text
    if old not in text:
        raise ValueError('Guide section not found: ' + old[:60])
    text = text.replace(old, new)
replace('WX2MD LOCAL · 使用指南 · 2026-09-30', 'WX2MD LOCAL v1.1.0 · 使用指南 · 2026-10-06')
replace('<a href="#developer">维护与源码</a>', '<a href="#upgrade">版本与升级</a><a href="#developer">维护与源码</a>')
replace('<strong>wx2md-local</strong> 工具目录', '<strong>wx2md-local-v1.1.0</strong> 工具目录')
replace('<strong>Markdown、原格式 HTML、长截图</strong>', '<strong>Markdown 阅读、原格式 HTML、清晰长截图</strong>')
replace('<h3>重新保存</h3>', '<h3>截图清晰度</h3><p>默认按 <strong>3 倍设备分辨率</strong> 直接渲染保存无损 PNG，430 px 手机排版得到 1290 px 宽的图片。可在“保存设置”选择 1、2、3 或 4 倍；较高倍数会增大文件和内存占用。点击记录中的“清晰长截图”，在阅读页选择 <strong>100% 像素</strong> 查看细节，避免图片查看器把整张长图缩到一屏。源图片本身的细节不会因提高截图倍数而增加。</p><h3>重新保存</h3>')
replace('      article.md\n      original.html\n      original.png\n      metadata.json', '      article.md\n      markdown.html\n      original.html\n      original-singlefile.html\n      original.png\n      screenshots.html\n      images.html\n      metadata.json')
replace('正文、标题、列表、表格、代码块等 Markdown 内容。图片使用', '保留正文、标题层级、列表、表格、代码块、上下标及可识别的样式粗体。公式从原文提取 LaTeX，用 <code>$…$</code>/<code>$$…$$</code> 保存；没有 TeX 源的 MathML 保留原标签。合并单元格等复杂表格保留 HTML table。图片使用')
replace('直接从原网页保存 DOM、CSS 与图片，图片和样式内嵌，双击用浏览器查看。不会用 Markdown 重新排版生成。', '直接保存原网页 DOM 与 CSS，样式内嵌，正文图片引用 <code>images/</code> 本地原文件。双击用浏览器查看，点击正文图片可单独打开原图；可右键另存图片。移动时连同图片目录一起移动。')
replace('原网页在所选宽度下的长截图。如果页面极长或单张截图失败，会得到', '原网页在所选宽度和清晰度下的无损长截图。默认 3 倍分辨率。如果页面极长或单张截图失败，会保留清晰度并得到')
replace('<tr><td><code>metadata.json</code>', '<tr><td><code>markdown.html</code></td><td>离线 Markdown 阅读预览。无需安装编辑器，正文图片可离线显示；公式优先显示原文矢量图。页面顶部可下载可编辑 MD 文件。没有原文 SVG 的 LaTeX 会显示其源文本，支持数学公式的编辑器可进一步渲染。</td></tr><tr><td><code>original-singlefile.html</code></td><td>图片和样式内嵌的单文件 HTML，便于只携带一个文件。单独查看原图时使用 <code>original.html</code> 或 <code>images.html</code>。</td></tr><tr><td><code>screenshots.html</code></td><td>清晰长截图阅读页，支持阅读宽度、100% 像素和 PNG 下载；超长文章按顺序显示所有分段。</td></tr><tr><td><code>images.html</code></td><td>本地原图列表。显示源图尺寸，支持单独打开和下载。图片按获取到的原始字节保存，不重新压缩。</td></tr><tr><td><code>metadata.json</code>')
replace('文章链接、保存时间、网页宽度、文件校验值、离线检查结果和缺失资源提示。', '工具版本、文章链接、保存时间、网页宽度、截图倍率、PNG 实际尺寸、图片尺寸、文件校验值、正文结构统计、离线检查与缺失资源提示。')
replace('Markdown 保存内容结构，无法保存原文章的颜色、字号和自由排版。', 'Markdown 尽量保留内容结构；颜色、字体、间距、复杂嵌套排版不能保证与原网页相同。需要核对原样式时查看 HTML。Markdown 编辑器应启用数学公式与内嵌 HTML 支持；不同编辑器的渲染效果仍会不同。')
replace('静态图片中的公式会作为本地图片保留。', '静态图片中的公式仍作为本地图片保留，原文 SVG 公式会在离线阅读预览中显示。')
replace('<tr><td>飞书已连接但收不到链接</td>', '<tr><td>长图缩成一整条，看不清</td><td>使用记录中的“清晰长截图”阅读页，选择“100% 像素”；可在设置中提高截图倍数后重新保存。正文原图请从 HTML 点击打开，或使用“原图列表”。</td></tr><tr><td>HTML 图片点不开</td><td>旧版 HTML 使用内嵌图片且没有独立查看功能。点击“重新保存”生成新版；使用 original.html 并保留 images/。original-singlefile.html 侧重单文件携带。</td></tr><tr><td>Markdown 打开后只是文本</td><td>点击“Markdown 阅读”查看排版后的内容；MD 文件是可编辑源文件，需用支持 Markdown 的阅读器打开。公式和复杂表格分别需要数学公式、内嵌 HTML 支持。</td></tr><tr><td>飞书已连接但收不到链接</td>')
replace('<section id="developer">', '<section id="upgrade"><h2>版本与升级</h2><p>本次更新为 <strong>v1.1.0（2026-10-06）</strong>，程序保存在独立的 <code>wx2md-local-v1.1.0</code> 文件夹，更新说明见 <code>CHANGELOG.txt</code>。旧 <code>wx2md-local</code> 为 v1.0.0，程序、设置与归档均保留。</p><p>当前电脑已在停止旧版后复制原设置与任务数据库到新版。原文章仍在原目录，新版保存记录可以访问；新文章默认保存在新版目录下。已有文件不会自动重写，你提供的示例文章已另外生成新版归档。</p><ol><li>同一电脑只运行一个版本。切换前在本地页面选择“保存设置 → 停止本地工具”，再双击相应版本目录的启动文件。</li><li>以后每次更新使用 <code>wx2md-local-v版本号</code> 新目录，并记录版本与日期，不覆盖旧目录。</li><li>手动迁移时先停止旧程序，再将 <code>data/config.json</code> 和 <code>data/jobs.sqlite</code> 复制到新版 <code>data/</code>。旧记录使用归档的绝对路径，应保留原文章目录。</li><li>在新版保存设置中调整新文章的保存位置；配置文件和数据库含个人运行数据，不随源码 ZIP 公开打包。</li></ol></section>\n\n<section id="developer">')
replace('wx2md Local 1.0.0 · 本地源码与归档工具', 'wx2md Local 1.1.0 · 本地源码与归档工具')
guide.write_text(text, encoding='utf-8')
print('v1.1.0 guide updated')
