// Runs in the capture browser against the saved HTML, without changing the source page.
export function linkLocalImages({ html, mapping, embedded = false }) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('base').forEach(node => node.remove());
  doc.querySelectorAll('meta[http-equiv="content-security-policy" i]').forEach(node => node.remove());
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline' data:; font-src data:;";
  doc.head.append(policy);
  let linked = 0;
  const originals = new Map();
  doc.querySelectorAll('[data-wx2md-body] img, #js_content img').forEach(image => {
    const candidates = [image.getAttribute('data-sf-original-src'), image.getAttribute('data-src'), image.getAttribute('src')];
    const source = candidates.find(value => value && mapping[value]);
    if (!source) return;
    const localPath = mapping[source];
    image.setAttribute('src', localPath);
    image.removeAttribute('srcset'); image.removeAttribute('data-src'); image.removeAttribute('loading');
    if (embedded && !originals.has(source)) originals.set(source, { key: String(originals.size + 1).padStart(3, '0'), src: localPath });
    const imageKey = embedded ? originals.get(source).key : localPath;
    image.setAttribute('data-wx2md-original-image', imageKey);
    const existingAnchor = image.closest('a');
    const anchor = existingAnchor || doc.createElement('a');
    if (!existingAnchor) {
      // display:contents preserves the original image's box and paragraph layout.
      anchor.style.setProperty('display', 'contents');
      image.replaceWith(anchor); anchor.append(image);
    } else if (anchor.getAttribute('href')) anchor.setAttribute('data-wx2md-original-href', anchor.getAttribute('href'));
    anchor.href = embedded ? `#wx2md-original-${imageKey}` : localPath;
    anchor.target = embedded ? '_self' : '_blank'; anchor.rel = 'noopener noreferrer';
    if (embedded && !doc.getElementById(`wx2md-source-${imageKey}`)) anchor.id = `wx2md-source-${imageKey}`;
    anchor.title = '打开本地原图，可查看原始尺寸或另存图片';
    linked++;
  });
  if (embedded) {
    const style = doc.createElement('style');
    style.textContent = '.wx2md-original{display:none!important;position:fixed!important;inset:0!important;overflow:auto!important;background:white!important;z-index:2147483647!important;margin:0!important;padding:0!important}.wx2md-original:target{display:block!important}.wx2md-original>nav{position:sticky;top:0;background:white;padding:12px 20px;font:14px/1.7 sans-serif;border-bottom:1px solid #ddd;z-index:1}.wx2md-original>nav a{margin-right:24px;color:#28604a}.wx2md-original>img{display:block!important;width:auto!important;height:auto!important;max-width:none!important;max-height:none!important;margin:20px!important}';
    doc.head.append(style);
    for (const {key,src} of originals.values()) {
      const overlay = doc.createElement('section'); overlay.className = 'wx2md-original'; overlay.id = `wx2md-original-${key}`;
      const nav = doc.createElement('nav');
      const close = doc.createElement('a'); close.href = `#wx2md-source-${key}`; close.textContent = '返回文章'; nav.append(close);
      const save = doc.createElement('a'); save.href = src; save.download = `原图-${key}`; save.textContent = '保存原图 ↓'; nav.append(save);
      nav.append(doc.createTextNode('原始尺寸 · 未重新压缩'));
      const image = doc.createElement('img'); image.src = src; image.alt = `正文原图 ${key}`;
      overlay.append(nav,image); doc.body.append(overlay);
    }
  }
  const archiveInfo = doc.createElement('meta'); archiveInfo.name = 'wx2md-local-images'; archiveInfo.content = embedded ? 'embedded-original-bytes' : 'images/'; doc.head.append(archiveInfo);
  return { html: '<!DOCTYPE html>\n' + doc.documentElement.outerHTML, linked };
}

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const policy = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline';";

export function imageGallery(article, images) {
  const cards = images.map((image, index) => `<article><a href="${escape(image.path)}" target="_blank" rel="noopener"><img src="${escape(image.path)}" alt="${escape(image.alt || '正文图片 ' + (index + 1))}" loading="lazy"></a><div><strong>图片 ${index + 1}</strong><span>${image.width && image.height ? `${image.width} × ${image.height} px · ` : ''}${(image.bytes / 1024).toFixed(0)} KB</span><a href="${escape(image.path)}" target="_blank" rel="noopener">打开原图 ↗</a><a href="${escape(image.path)}" download>另存原图 ↓</a></div></article>`).join('\n');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escape(policy)}"><title>${escape(article.title)} · 原图</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f4f4ef;color:#253a2d;font:14px/1.7 "Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1100px;margin:auto;padding:28px}h1{font-size:23px;line-height:1.5}p,span{color:#768275}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:22px}article{background:white;border:1px solid #dce3d9;border-radius:9px;overflow:hidden}article>a{display:flex;height:280px;align-items:center;justify-content:center;background:#edf1e9}img{max-width:100%;max-height:100%;object-fit:contain}article>div{padding:14px 18px}span{display:block;font-size:12px;margin:4px 0 12px}a{color:#28604a;margin-right:15px}header a{font-size:13px}@media(max-width:600px){main{padding:20px}.grid{grid-template-columns:1fr}}</style></head><body><main><header><a href="original.html">返回文章</a><a href="screenshots.html">查看长截图</a></header><h1>${escape(article.title)} · 本地原图</h1><p>保留下载到的原始图片字节，未重新压缩。点击图片可单独打开，或另存到其他位置。</p><section class="grid">${cards || '<p>没有成功保存的正文图片。</p>'}</section></main></body></html>`;
}

export function screenshotViewer(article, files, scale, imageGalleryUrl = 'images.html') {
  const images = files.map((file, index) => `<section style="margin:0"><img src="${escape(file)}" alt="${escape(article.title)} · ${index + 1}"></section>`).join('');
  const downloads = files.map((file,index) => `<a href="${escape(file)}" download>下载${files.length > 1 ? 'PNG ' + (index+1) : 'PNG'} ↓</a>`).join(' ');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escape(policy)}"><title>${escape(article.title)} · 清晰长截图</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#e9eee6;color:#253a2d;font:13px/1.6 "Segoe UI","Microsoft YaHei",sans-serif}.controls{position:sticky;top:0;background:#fff;border-bottom:1px solid #d6dfd0;padding:12px 22px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;z-index:2}.controls span{color:#6b7a6c;font-size:12px}.controls a{color:#28604a}.choice{position:absolute;opacity:0;pointer-events:none}label{cursor:pointer;border:1px solid #d6dfd0;border-radius:5px;padding:6px 12px}#fit:checked~.controls label[for=fit],#actual:checked~.controls label[for=actual]{background:#28604a;color:white;border-color:#28604a}.choice:focus-visible~.controls label{outline:2px solid #97b49b}main{padding:18px 24px;min-width:100%;width:max-content}section{margin:0 0 20px}img{display:block;height:auto;max-width:none;background:white}#fit:checked~main img{width:min(calc(100vw - 48px),960px)}#actual:checked~main img{width:auto}.part{display:flex;gap:18px;align-items:center;margin-bottom:8px;color:#6b7a6c}.part a{color:#28604a}h1{font-size:15px;margin:0;max-width:420px;font-weight:600;overflow-wrap:anywhere}@media(max-width:600px){.controls{padding:10px 16px;gap:10px}.controls span{width:100%}h1{display:none}}</style></head><body><input class="choice" type="radio" name="zoom" id="fit" checked><input class="choice" type="radio" name="zoom" id="actual"><header class="controls"><h1>${escape(article.title)}</h1><label for="fit">阅读宽度</label><label for="actual">100% 像素</label>${imageGalleryUrl ? `<a href="${escape(imageGalleryUrl)}">查看原图</a>` : ''}${downloads}<span>${scale} 倍分辨率 · 无损 PNG · 连续拼接，向下滚动阅读</span></header><main>${images}</main></body></html>`;
}
