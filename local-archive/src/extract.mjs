// Browser-side extraction adapted from wx2md Community (MIT), Copyright (c) 2026 望山.
export function extractArticle() {
  const content = document.querySelector('#js_content');
  if (!content) throw new Error('没有找到文章正文。文章可能已删除、需要登录或需要在微信中验证。');
  const text = (...selectors) => selectors.map(s => document.querySelector(s)?.textContent?.trim()).find(Boolean) || '';
  const meta = name => document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content || '';
  const clone = content.cloneNode(true);
  const cloneElements = [...clone.querySelectorAll('*')];
  const pairs = [...content.querySelectorAll('*')].map((original, index) => [original, cloneElements[index]]);
  const formulas = [];
  const formulaSelector = '[data-formula],[data-latex],script[type^="math/tex"],math';
  for (const element of [...clone.querySelectorAll(formulaSelector)]) {
    if (!clone.contains(element) || element.parentElement?.closest(formulaSelector)) continue;
    const tex = (element.getAttribute('data-formula') || element.getAttribute('data-latex') || element.querySelector('annotation[encoding*="tex" i]')?.textContent || (element.tagName === 'SCRIPT' ? element.textContent : '')).trim();
    if (!tex) continue; // Keep native MathML when a TeX source is unavailable.
    const display = ['SECTION', 'DIV'].includes(element.tagName) || element.getAttribute('display') === 'block' || element.getAttribute('type')?.includes('mode=display');
    const svg = element.querySelector('svg')?.cloneNode(true);
    if (svg) {
      svg.querySelectorAll('script,foreignObject,image').forEach(e => e.remove());
      [svg, ...svg.querySelectorAll('*')].forEach(e => {
        for (const a of [...e.attributes]) {
          if (a.name.startsWith('on') || ((a.name === 'href' || a.name === 'xlink:href') && !a.value.startsWith('#'))) e.removeAttribute(a.name);
        }
      });
    }
    const index = formulas.length;
    formulas.push({ tex, display: !!display, svg: svg?.outerHTML || '' });
    const replacement = document.createElement('wx2md-formula');
    replacement.setAttribute('data-wx2md-index', index);
    replacement.setAttribute('data-wx2md-tex', tex);
    replacement.setAttribute('data-wx2md-display', display ? 'block' : 'inline');
    replacement.textContent = tex;
    element.replaceWith(replacement);
  }
  clone.querySelectorAll('script,style,iframe,noscript,.js_ad_link,.weapp_display_element,[data-type="ad"]').forEach(e => e.remove());
  const bodySizes = [...content.querySelectorAll('p')].filter(e => e.textContent.trim().length > 60).map(e => parseFloat(getComputedStyle(e).fontSize)).sort((a,b) => a-b);
  const bodySize = bodySizes[Math.floor(bodySizes.length / 2)] || 16;
  let inferredHeadings = 0;
  for (const [original, element] of pairs) {
    if (!clone.contains(element) || original.closest('svg,math,[data-formula],[data-latex],pre,code')) continue;
    const style = getComputedStyle(original);
    if (original.tagName === 'SPAN' && original.textContent.trim()) {
      const parentStyle = getComputedStyle(original.parentElement);
      for (const [tag, active] of [
        ['strong', Number(style.fontWeight) >= 600 && Number(parentStyle.fontWeight) < 600 && !original.closest('strong,b,h1,h2,h3,h4,h5,h6')],
        ['em', style.fontStyle === 'italic' && parentStyle.fontStyle !== 'italic' && !original.closest('em,i')],
        ['del', style.textDecorationLine.includes('line-through') && !original.closest('del,s,strike')],
        ['u', style.textDecorationLine.includes('underline') && !original.closest('u,a')]
      ]) if (active) { const wrapper = document.createElement(tag); wrapper.append(...element.childNodes); element.append(wrapper); }
    }
    if (['P', 'SECTION'].includes(original.tagName) && !original.closest('td,th,li,blockquote,h1,h2,h3,h4,h5,h6') && !original.querySelector('p,section,div,table,img,svg,math,wx2md-formula')) {
      const label = original.textContent.trim();
      const children = [...original.querySelectorAll('span,strong,b')];
      const size = Math.max(parseFloat(style.fontSize), ...children.map(e => parseFloat(getComputedStyle(e).fontSize)));
      const bold = Number(style.fontWeight) >= 600 || children.some(e => e.textContent.trim() === label && Number(getComputedStyle(e).fontWeight) >= 600);
      if (label && label.length <= 65 && bold && size >= bodySize * 1.2) {
        const heading = document.createElement(size >= bodySize * 1.4 ? 'h2' : 'h3');
        heading.append(...element.childNodes); element.replaceWith(heading); inferredHeadings++;
      }
    }
    if (['TD', 'TH'].includes(original.tagName) && ['center', 'right'].includes(style.textAlign)) element.setAttribute('align', style.textAlign);
  }
  const images = [];
  const originalImages = [...content.querySelectorAll('img')];
  clone.querySelectorAll('img').forEach(image => {
    const src = image.getAttribute('data-src') || image.getAttribute('src');
    if (!src) { image.remove(); return; }
    const absolute = new URL(src, location.href).href;
    image.setAttribute('src', absolute);
    image.removeAttribute('data-src'); image.removeAttribute('srcset');
    const originalImage = originalImages.find(original => new URL(original.getAttribute('data-src') || original.src, location.href).href === absolute);
    images.push({ src: absolute, alt: image.alt || '', width: originalImage?.naturalWidth || null, height: originalImage?.naturalHeight || null });
  });
  clone.querySelectorAll('a[href]').forEach(anchor => {
    try {
      const url = new URL(anchor.getAttribute('href'), location.href);
      if (['https:', 'http:'].includes(url.protocol)) anchor.setAttribute('href', url.href);
      else anchor.removeAttribute('href');
    } catch { anchor.removeAttribute('href'); }
  });
  clone.querySelectorAll('*').forEach(element => {
    for (const attribute of [...element.attributes]) {
      if (['class', 'style', 'id'].includes(attribute.name) || (attribute.name.startsWith('data-') && !attribute.name.startsWith('data-wx2md-')) || attribute.name.startsWith('on')) element.removeAttribute(attribute.name);
    }
  });
  return {
    title: text('#activity-name', '.rich_media_title') || meta('og:title') || document.title || '未命名文章',
    accountName: text('#js_name', '.rich_media_meta_nickname') || meta('og:article:author'),
    author: text('#js_author_name', '#js_author', '.rich_media_meta_text.rich_media_meta_author'),
    publishTime: text('#publish_time', '#js_publish_time') || meta('article:published_time'),
    sourceUrl: location.href, html: clone.innerHTML, images, formulas,
    structure: { headings: clone.querySelectorAll('h1,h2,h3,h4,h5,h6').length, inferredHeadings, tables: clone.querySelectorAll('table').length, formulas: formulas.length + clone.querySelectorAll('math').length },
    bodyTextLength: (clone.textContent || '').trim().length,
    interactive: !!content.querySelector('video,audio,iframe,mpvoice,mpvideo,mp-common-videosnap,.weapp_display_element'),
    unresolvedImages: [...content.querySelectorAll('img')].filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('data-src') || i.src)
  };
}
