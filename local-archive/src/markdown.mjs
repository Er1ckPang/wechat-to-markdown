// Adapted from wx2md Community v0.3.0 (MIT), Copyright (c) 2026 望山.
// Original source and license are listed in THIRD_PARTY_NOTICES.txt.
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Marked } from '../vendor/marked.mjs';

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function bodyConverter() {
  const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*', strongDelimiter: '**' });
  turndown.use(gfm);
  turndown.keep(['sup', 'sub', 'u', 'math']);
  turndown.addRule('wechatSection', { filter: 'section', replacement: (content, node) => {
    let parent = node.parentNode;
    while (parent) { if (['TD', 'TH'].includes(parent.nodeName)) return content.trim(); parent = parent.parentNode; }
    return `\n\n${content.trim()}\n\n`;
  } });
  turndown.addRule('wechatTable', {
    filter: 'table', replacement: (_content, node) => {
      const rows = Array.from(node.querySelectorAll('tr'));
      const rowCells = row => Array.from(row.querySelectorAll('th,td'));
      const simple = rows.length > 0 && rowCells(rows[0]).length > 0 && rowCells(rows[0]).every(cell => cell.tagName === 'TH') && rows.every(row => rowCells(row).length === rowCells(rows[0]).length) && !node.querySelector('[colspan]:not([colspan="1"]),[rowspan]:not([rowspan="1"]),table,ul,ol,pre');
      if (!simple) return `\n\n${node.outerHTML}\n\n`; // Raw HTML retains merged cells and tables without headers.
      const cells = row => rowCells(row).map(cell => bodyConverter().turndown(cell.innerHTML).trim().replace(/\r?\n+/g, '<br>').replace(/(?<!\\)\|/g, '\\|'));
      const line = values => `| ${values.join(' | ')} |`;
      const separator = rowCells(rows[0]).map(cell => cell.getAttribute('align') === 'center' ? ':---:' : cell.getAttribute('align') === 'right' ? '---:' : '---');
      return `\n\n${[line(cells(rows[0])), line(separator), ...rows.slice(1).map(row => line(cells(row)))].join('\n')}\n\n`;
    }
  });
  turndown.addRule('wechatFormula', {
    filter: 'wx2md-formula', replacement: (_content, node) => {
      const tex = node.getAttribute('data-wx2md-tex') || node.textContent;
      return node.getAttribute('data-wx2md-display') === 'block' ? `\n\n$$\n${tex.trim()}\n$$\n\n` : `$${tex.trim().replace(/\s*\n\s*/g, ' ')}$`;
    }
  });
  turndown.addRule('wechatImage', {
    filter: 'img', replacement: (_content, node) => {
      const src = node.getAttribute('src') || '';
      return src ? `![${(node.getAttribute('alt') || '').replace(/[\[\]\r\n]/g, '')}](${src.replace(/ /g, '%20')})` : '';
    }
  });
  return turndown;
}

export function articleToMarkdown(article, savedAt = new Date()) {
  const turndown = bodyConverter();
  const metadata = { title: article.title, account: article.accountName || '', author: article.author || '',
    published_at: article.publishTime || '', source: article.sourceUrl, platform: 'wechat', saved_at: savedAt.toISOString() };
  const images = new Map();
  const body = turndown.turndown(article.html).trim().replace(/!\[([^\]\n]*)\]\((data:image\/[^)\s]+)\)/g, (_match, alt, src) => {
    if (!images.has(src)) images.set(src, `wx2md-image-${String(images.size+1).padStart(3,'0')}`);
    return `![${alt}][${images.get(src)}]`;
  });
  const references = [...images].map(([src,name]) => `[${name}]: ${src}`).join('\n');
  return `---\n${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n# ${article.title}\n\n${body}\n${references ? '\n<!-- 正文原图内嵌；无需图片目录。编辑正文时可折叠以下引用定义。 -->\n' + references + '\n' : ''}`;
}

export function renderMarkdown(markdown, formulas = []) {
  const normalize = tex => tex.trim().replace(/\s+/g, ' ');
  const formulaHtml = (tex, display) => {
    const formula = formulas.find(f => normalize(f.tex) === normalize(tex));
    const content = formula?.svg || `<code>${escape(tex)}</code>`;
    return display ? `<div class="formula display-formula">${content}</div>\n` : `<span class="formula inline-formula">${content}</span>`;
  };
  const parser = new Marked({ gfm: true });
  parser.use({ extensions: [
    { name: 'blockMath', level: 'block', start: source => source.indexOf('$$'), tokenizer(source) {
      const match = /^\$\$\s*\n([\s\S]+?)\n\$\$(?:\s*\n|$)/.exec(source);
      if (match) return { type: 'blockMath', raw: match[0], text: match[1] };
    }, renderer: token => formulaHtml(token.text, true) },
    { name: 'inlineMath', level: 'inline', start: source => source.indexOf('$'), tokenizer(source) {
      const match = /^\$([^$\n]+?)\$(?!\$)/.exec(source);
      if (match && formulas.some(f => normalize(f.tex) === normalize(match[1]))) return { type: 'inlineMath', raw: match[0], text: match[1] };
    }, renderer: token => formulaHtml(token.text, false) }
  ] });
  return parser.parse(markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));
}

// Browser-side allowlist: Markdown renderers do not sanitize arbitrary raw HTML.
export function sanitizeMarkdownHtml(html) {
  const container = document.createElement('div'); container.innerHTML = html;
  const allowed = new Set('a p br hr h1 h2 h3 h4 h5 h6 strong b em i del s u sup sub blockquote ul ol li pre code table caption colgroup col thead tbody tfoot tr th td img div span input math mrow mi mn mo mtext mspace ms msqrt mroot mfrac msub msup msubsup munder mover munderover mtable mtr mtd semantics annotation mpadded mphantom menclose mfenced svg g path use defs rect circle ellipse line polyline polygon title desc'.split(' '));
  const attributes = new Set('href src alt title colspan rowspan align start type checked disabled display xmlns viewbox d transform fill stroke stroke-width x y x1 x2 y1 y2 cx cy r rx ry width height points id encoding mathvariant accent accentunder columnalign rowalign'.split(' '));
  for (const element of [...container.querySelectorAll('*')]) {
    if (!allowed.has(element.localName.toLowerCase())) { element.remove(); continue; }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name === 'class' && ['span', 'div'].includes(element.localName)) { element.className = element.className.split(/\s+/).filter(c => ['formula', 'inline-formula', 'display-formula'].includes(c)).join(' '); continue; }
      if (name === 'style' && element.localName === 'svg') {
        const values = ['vertical-align', 'width', 'height'].map(key => [key, element.style.getPropertyValue(key)]).filter(([,value]) => /^-?[\d.]+(?:ex|em|px|%)$/.test(value));
        element.removeAttribute('style'); values.forEach(([key,value]) => element.style.setProperty(key, value)); continue;
      }
      if (!attributes.has(name) || name.startsWith('on')) { element.removeAttribute(attribute.name); continue; }
      if (name === 'src' && !/^(?:images\/\d+\.(?:png|jpg|gif|webp|svg|avif|bmp)$|data:image\/|https?:\/\/)/i.test(attribute.value)) element.removeAttribute(attribute.name);
      if (name === 'href' && !/^(?:https?:\/\/|#|images\/\d+\.(?:png|jpg|gif|webp|svg|avif|bmp)$)/i.test(attribute.value)) element.removeAttribute(attribute.name);
    }
    if (element.localName === 'input') { element.type = 'checkbox'; element.disabled = true; }
    if (element.localName === 'a') { element.target = '_blank'; element.rel = 'noopener noreferrer'; }
  }
  return container.innerHTML;
}

export function markdownPreview(article, html) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline';"><title>${escape(article.title)} · Markdown 阅读</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;color:#26392e;background:#f1f3ee;font:16px/1.85 "Segoe UI","Microsoft YaHei",sans-serif}main{max-width:900px;margin:24px auto;padding:30px 44px;background:white;border:1px solid #dde5db;border-radius:8px;overflow-wrap:anywhere}nav{font-size:13px;display:flex;gap:18px;border-bottom:1px solid #e1e8de;padding-bottom:16px}a{color:#28604a}h1{font-size:28px;line-height:1.5}h2{font-size:23px;margin-top:1.8em}h3{font-size:19px;margin-top:1.6em}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;font-size:14px;display:block;overflow:auto}td,th{border:1px solid #d3ddce;padding:9px 12px;min-width:70px}th{background:#edf3e8}blockquote{margin:20px 0;padding:8px 20px;border-left:4px solid #a8bd9e;background:#f4f7f1}pre{padding:18px;background:#f4f6f2;border-radius:6px;overflow:auto;font-size:13px}code{font-family:Consolas,monospace}.formula svg{color:currentColor}.display-formula{text-align:center;overflow:auto;padding:12px 0}.note{font-size:12px;color:#74816f}@media(max-width:600px){body{background:white}main{border:0;margin:0;padding:20px}h1{font-size:24px}}</style></head><body><main><nav><a href="article.md" download>下载 MD 文件</a><a href="original.html">原格式 HTML</a><a href="images.html">本地原图</a></nav><p class="note">Markdown 阅读预览 · 公式优先使用原文矢量图显示；MD 文件保留可编辑的 LaTeX。</p><article>${html}</article></main></body></html>`;
}
