from pathlib import Path
p=Path(__file__).resolve().parent.parent/'outputs/wx2md-local-v1.2.0/public/index.html'
s=p.read_text(encoding='utf-8')
s=s.replace('一条链接，同时保存 Markdown、含图片与样式的 HTML，以及原网页长截图。','一条链接，保存内嵌图片的 MD 与 HTML、手机和电脑两张无损长图。每篇只有 5 个文件，均按标题命名。')
s=s.replace('<label>网页宽度<select id="width"><option value="430">430 px · 手机阅读宽度</option><option value="768">768 px · 平板阅读宽度</option><option value="1280">1280 px · 电脑阅读宽度</option></select></label>','<div><label>两种阅读窗口</label><p>手机 432 × 768（9:16）<br>电脑 1280 × 720（16:9）</p></div>')
start=s.index('<p class="wide note">截图按所选倍数')
end=s.index('</p>',start)+4
s=s[:start]+'''<p class="wide note">分别在手机和电脑窗口中排版，宽表格在阅读宽度内换行，裁掉文章栏外多余空白，逐屏采集并检查接缝。保存无损 PNG，长图高度取决于文章长度。阅读长图时可选择“100% 像素”。MD 与 HTML 内嵌原图，不需要图片目录；点击 HTML 图片可按原始尺寸查看并下载。设置只影响之后保存的文章。</p><p class="wide note">当前程序目录：<span id="runtime-root"></span></p>'''+s[end:]
s=s.replace('<span>本地工具 · v1.1.1</span>','<span id="service-version">正在确认服务版本…</span>')
p.write_text(s,encoding='utf-8')
print('Updated five-file UI and live running-version display.')
