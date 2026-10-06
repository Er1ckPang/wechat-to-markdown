from pathlib import Path
root=Path(__file__).resolve().parent.parent
app=root/'outputs/wx2md-local-v1.1.1'
file=app/'src/html.mjs';text=file.read_text(encoding='utf-8')
old='<a href="images.html">查看原图</a><span>${scale} 倍分辨率 · 无损 PNG · 向下滚动阅读</span>'
assert old in text
text=text.replace(old,'<a href="images.html">查看原图</a>${downloads}<span>${scale} 倍分辨率 · 无损 PNG · 连续拼接，向下滚动阅读</span>')
file.write_text(text,encoding='utf-8')
file=app/'public/index.html';text=file.read_text(encoding='utf-8').replace('v1.1.0','v1.1.1').replace('使用指南 ↗','指南与文件说明 ↗')
text=text.replace('截图按所选倍数直接采集为无损 PNG；','截图按所选倍数逐屏采集并检查接缝；自动移除悬浮工具栏、展开横向表格，再保存为无损 PNG；')
file.write_text(text,encoding='utf-8')
file=app/'THIRD_PARTY_NOTICES.txt';text=file.read_text(encoding='utf-8').replace('wx2md Local 1.1.0','wx2md Local 1.1.1')
text=text.replace('5. Other dependencies','5. pngjs 7.0.0\n   https://github.com/pngjs/pngjs\n   MIT License. Unmodified source is in vendor/pngjs, including LICENSE.\n   Used to decode viewport PNG pixels and losslessly stream the final image.\n\n6. Other dependencies')
file.write_text(text,encoding='utf-8')
file=app/'CHANGELOG.txt';text=file.read_text(encoding='utf-8')
entry='''1.1.1 — 2026-10-06

修复高分辨率长图的重复、错位与缺内容
  高分辨率超长网页的单次整页采集存在画面错误，旧检查只核对尺寸。
  改为从已保存的离线原网页逐屏采集，原文与图片保持稳定。
  按浏览器实际滚动位置裁剪重叠区并合成，正确处理底部滚动被限制的情况。
  每处上下/左右接缝比较重叠像素；校验失败会明确报错，避免假装保存成功。
  保存时移除正文外悬浮作者工具栏；顶部正常的标题和署名保留一次。
  展开横向滚动表格并采集全部列，保留主正文的原阅读宽度。
  输出 PNG 可能宽于阅读宽度，metadata.json 记录最终尺寸与覆盖检查。
  PNG 采用像素行流式无损编码，不保存逐屏临时文件到归档目录。
  超长文章按需分段；screenshots.html 中无额外间隙地连续展示。

文件说明与版本管理
  使用指南补充每个文件的用途、依赖，以及只保留某种格式时的组合。
  新版在 wx2md-local-v1.1.1 独立目录，保留 1.1.0 和 1.0.0 及其归档。
  新增 pngjs 7.0.0 的源码和 MIT 许可，其他依赖版本保持不变。

'''
text=text.replace('1.1.0 — 2026-10-06',entry+'1.1.0 — 2026-10-06',1)
file.write_text(text,encoding='utf-8')
file=app/'README.txt';text=file.read_text(encoding='utf-8')
text=text.replace('wx2md Local 1.1.0','wx2md Local 1.1.1').replace('wx2md-local-v1.1.0','wx2md-local-v1.1.1')
text=text.replace('旧 wx2md-local（1.0.0）保留。','旧 wx2md-local-v1.1.0 与 wx2md-local（1.0.0）均保留。')
text=text.replace('430 px 手机排版在默认 3 倍清晰度下输出 1290 px 宽的 PNG。','430 px 手机排版按 3 倍像素采集；横向表格展开时图片可能更宽。\n截图从离线原网页逐屏采集，去除悬浮作者工具栏，按实际滚动位置拼接。\n上下和左右接缝的重叠像素会自动检查，PNG 保留原采集像素，不缩放。')
text+='''
为什么有多个文件：
  article.md、original.html、original.png 是三种正文格式。
  original-singlefile.html 是可单独携带的 HTML 副本。
  markdown.html、images.html、screenshots.html 是方便阅读的预览页面。
  images/ 是共享的本地原图；metadata.json 是保存信息与校验记录。

如果只保留一种格式：
  可编辑 Markdown：保留 article.md + images/。
  原排版且可打开原图：保留 original.html + images/。
  单文件 HTML：只保留 original-singlefile.html 即可离线阅读。
  长图：保留 original.png；若分段则保留全部 original-001.png 等。
  预览页面不是正文的唯一副本，但需对应图片/PNG 文件才能显示媒体。
  metadata.json 建议保留，便于核对来源、日期、版本与截图接缝。
  本工具不会主动删除已有文件；最方便的备份方式是保留整篇文章目录。
'''
file.write_text(text,encoding='utf-8')
file=app/'public/guide.html';text=file.read_text(encoding='utf-8')
text=text.replace('v1.1.0','v1.1.1').replace('wx2md Local 1.1.0','wx2md Local 1.1.1').replace('wx2md-local-v1.1.0','wx2md-local-v1.1.1')
text=text.replace('每篇文章得到什么','每个文件是什么')
text=text.replace('默认按 <strong>3 倍设备分辨率</strong> 直接渲染保存无损 PNG，430 px 手机排版得到 1290 px 宽的图片。','默认按 <strong>3 倍设备分辨率</strong> 逐屏采集，检查相邻画面的重叠像素后按实际滚动坐标拼接为无损 PNG。顶部正常署名保留，正文外的悬浮作者工具栏不进入截图。横向滚动表格会展开并采集所有列，所以图片可能宽于 430 × 3 像素，主正文仍按原阅读宽度排版。')
text=text.replace('长截图记录当前宽度下可见的排版。有横向滚动的宽表格时，截图只包含当前可见列；打开离线 HTML 可横向滚动，Markdown 也保留完整表格。原页面固定在底部的工具栏可能出现在截图中。','长截图从已保存的离线网页采集，避免页面动态变化引起拼接错位。底部会按实际可滚动位置裁剪，避免重复末段。横向滚动表格展开后采集完整列；HTML 保持原排版，可以横向滚动。较宽或特别长的页面会按需生成多个 PNG，截图阅读页连续展示所有分段。')
text=text.replace('截图倍率、PNG 实际尺寸、图片尺寸、文件校验值、正文结构统计、离线检查与缺失资源提示。','截图倍率、PNG 实际尺寸、图片尺寸、文件校验值、正文结构统计、逐屏覆盖范围与接缝检查、离线检查与缺失资源提示。')
marker='<h3>检查一次离线效果</h3>'
explanation='''<h3>为什么文件比以前多</h3><p><code>article.md</code>、<code>original.html</code> 与 PNG 是三种正文；<code>original-singlefile.html</code> 是方便单文件携带的 HTML 副本；另外三个 HTML 是阅读、浏览原图和查看长图的辅助页面。它们不会额外复制一整套原图，通常共同引用 <code>images/</code>。单文件 HTML 因内嵌图片，会占用额外空间。</p><h3>只保留一种格式时，需要哪些文件</h3><table><thead><tr><th>用途</th><th>需一起保留</th></tr></thead><tbody><tr><td>编辑 Markdown</td><td><code>article.md</code> + <code>images/</code></td></tr><tr><td>原排版 HTML，并可点击原图</td><td><code>original.html</code> + <code>images/</code></td></tr><tr><td>只携带一个 HTML 文件</td><td><code>original-singlefile.html</code>，图片已内嵌</td></tr><tr><td>只保存长图</td><td><code>original.png</code>，或全部分段 <code>original-001.png</code> 等</td></tr><tr><td>离线 Markdown 阅读页</td><td><code>markdown.html</code> + <code>images/</code>；下载 MD 按钮另需 <code>article.md</code></td></tr><tr><td>原图列表</td><td><code>images.html</code> + <code>images/</code></td></tr><tr><td>长图阅读页</td><td><code>screenshots.html</code> + 对应的全部 PNG</td></tr></tbody></table><p><code>metadata.json</code> 记录来源、日期、版本与校验信息，不是正文，建议保留。最方便的备份方式仍是复制整篇文章目录。本工具不会主动删除旧文件；辅助页面中的跳转链接需要对应的文件存在。</p>'''
assert marker in text;text=text.replace(marker,explanation+marker)
text=text.replace('旧 <code>wx2md-local</code> 为 v1.0.0，程序、设置与归档均保留。','旧 <code>wx2md-local-v1.1.0</code> 与 <code>wx2md-local</code>（v1.0.0）的程序、设置与归档均保留。')
text=text.replace('<tr><td>长图缩成一整条，看不清</td>', '<tr><td>旧长图重复、上下错位或出现多个作者栏</td><td>v1.1.1 已改为逐屏采集与接缝校验，并排除悬浮作者工具栏。旧文件不会自动改写，点击“重新保存”生成新归档；你提供的示例已另存新版。</td></tr><tr><td>长图缩成一整条，看不清</td>')
file.write_text(text,encoding='utf-8')
print('Updated v1.1.1 guide, file explanations, source notices and continuous screenshot viewer.')
