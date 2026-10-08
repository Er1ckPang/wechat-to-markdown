// Browser-side adapters. The same selected body feeds MD, offline HTML and both screenshots.
export function inspectArticlePage(site) {
  const text = (...selectors) => selectors.map(s => document.querySelector(s)?.textContent?.trim()).find(Boolean) || '';
  const meta = name => document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content || '';
  const visible = e => {
    if (!e) return false;
    const display = getComputedStyle(e).display;
    return display !== 'none' && (e.getBoundingClientRect().width > 0 || (display === 'contents' && [...e.children].some(child => child.getBoundingClientRect().width > 0)));
  };
  const choose = selectors => selectors.map(s => [...document.querySelectorAll(s)].find(visible)).find(Boolean);
  let content, title = '', author = '', published = '', selector = '', confidence = 'site-adapter';
  if (site.platform === 'wechat') {
    selector = '#js_content'; content = choose([selector]);
    title = text('#activity-name', '.rich_media_title'); author = text('#js_name', '.rich_media_meta_nickname');
  } else if (site.platform === 'csdn') {
    selector = '#content_views, #article_content'; content = choose(['#content_views', '#article_content']);
    title = text('#articleContentId', '.title-article', 'h1'); author = text('.follow-nickName', '.article-info-box .user-name', '.profile-intro-name-box a');
    published = text('.article-info-box .time', '.article-header-box .time');
  } else if (site.platform === 'cnblogs') {
    selector = '#cnblogs_post_body'; content = choose([selector]);
    title = text('#cb_post_title_url', '.postTitle a', '#topics h1'); author = text('#Header1_HeaderTitle', '#blogTitle h2 a', '.postDesc a', '#footer a');
    published = text('#post-date');
  } else if (site.platform === 'zhihu') {
    title = text('.Post-Title', '.QuestionHeader-title', 'h1');
    published = text('.ContentItem-time', '.Post-Header .Post-Time');
    if (site.kind === 'answer') {
      const answers = [...document.querySelectorAll('.AnswerItem')];
      let answer = answers.find(e => e.getAttribute('data-answer-id') === site.itemId || e.querySelector(`a[href$="/answer/${site.itemId}"]`));
      answer ||= answers.find(e => { try { return String(JSON.parse(e.getAttribute('data-zop')).itemId) === site.itemId; } catch { return false; } });
      if (!answer && answers.length === 1) answer = answers[0];
      content = answer?.querySelector('[itemprop="text"], .RichContent-inner .RichText, .RichContent-inner');
      author = answer?.querySelector('.AuthorInfo-name, [itemprop="author"] [itemprop="name"]')?.textContent?.trim() || '';
      selector = '.AnswerItem';
    } else {
      selector = '.Post-RichTextContainer, .Post-RichText';
      content = choose(['.Post-RichTextContainer', '.Post-RichText', '.Post-Main .RichText']);
      author = text('.Post-Header .AuthorInfo-name', '.AuthorInfo-name');
    }
  } else {
    confidence = 'semantic-article';
    const selectors = ['[itemprop="articleBody"]', 'article', '.entry-content', '.post-content', '.article-content', 'main'];
    for (const s of selectors) {
      const candidates = [...document.querySelectorAll(s)].filter(e => {
        const length = e.textContent.trim().length;
        const links = [...e.querySelectorAll('a')].reduce((n, a) => n + a.textContent.length, 0);
        return visible(e) && length >= 120 && links / length < 0.35 && e.querySelectorAll('p,pre,blockquote').length >= 2;
      });
      if (candidates.length === 1) { content = candidates[0]; selector = s; break; }
      if (candidates.length > 1) break; // Listing pages must not silently become one combined article.
    }
    title = content?.querySelector('h1')?.textContent?.trim() || text('h1');
    author = meta('author') || text('[rel="author"]', '[itemprop="author"] [itemprop="name"]');
    published = meta('article:published_time') || document.querySelector('time[datetime]')?.getAttribute('datetime') || '';
  }
  const documents = [];
  const walk = (value, depth = 0) => {
    if (!value || depth > 8) return;
    if (Array.isArray(value)) return value.forEach(v => walk(v, depth + 1));
    if (typeof value === 'object') { documents.push(value); if (value['@graph']) walk(value['@graph'], depth + 1); }
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) { try { walk(JSON.parse(script.textContent)); } catch { /* Invalid publisher metadata is optional. */ } }
  const structured = documents.find(d => [d['@type']].flat().some(t => /^(?:Article|BlogPosting|NewsArticle|TechArticle|ScholarlyArticle)$/.test(t))) || {};
  const structuredAuthor = [structured.author].flat().map(a => typeof a === 'string' ? a : a?.name || '').filter(Boolean).join(', ');
  title ||= structured.headline || meta('og:title') || document.title;
  author ||= structuredAuthor || meta('author') || meta('og:article:author');
  published ||= structured.datePublished || meta('article:published_time');
  const length = content?.textContent?.trim().length || 0;
  const challenge = /^(?:403|404|访问验证|安全验证|安全检查|人机验证|Just a moment|Access Denied|Forbidden|Page Not Found|用户登录|登录(?:\s|$)|注册(?:\s|$)|Sign in\b|Log ?in\b)/i.test(document.title.trim())
    || (!!document.querySelector('form input[type="password"]') && !document.querySelector('article,[itemprop="articleBody"]'));
  const restricted = [...document.querySelectorAll('.Paywall, .paywall, .read-hide-content, #article_content .hide-article-box')]
    .some(e => visible(e) && /登录|付费|订阅|会员|购买|sign in|log ?in|subscribe|payment/i.test(e.textContent));
  const collapsed = !!content && (content.scrollHeight > content.clientHeight + 20 && ['hidden', 'clip'].includes(getComputedStyle(content).overflowY));
  return { ready: !!content && length >= (site.platform === 'wechat' ? 1 : 40) && !challenge,
    selector, contentIndex: selector ? [...document.querySelectorAll(selector)].indexOf(content) : -1,
    title: String(title || '未命名文章'), author: String(author || ''), published: String(published || ''),
    bodyLength: length, restricted, collapsed, confidence,
    interactive: !!content?.querySelector('video,audio,iframe,canvas') };
}

export function expandPublicArticle(site) {
  if (!['zhihu', 'csdn'].includes(site.platform)) return false;
  const candidates = document.querySelectorAll('.ContentItem-rightButton, .RichContent-inner button, .btn-readmore');
  for (const button of candidates) {
    if (site.platform === 'zhihu' && site.kind === 'answer') {
      const answer = button.closest('.AnswerItem');
      if (answer && document.querySelectorAll('.AnswerItem').length > 1) {
        let matching = answer.getAttribute('data-answer-id') === site.itemId || !!answer.querySelector(`a[href$="/answer/${site.itemId}"]`);
        try { matching ||= String(JSON.parse(answer.getAttribute('data-zop')).itemId) === site.itemId; } catch { /* Other answer. */ }
        if (!matching) continue;
      }
    }
    if (!/^(?:展开阅读全文|展开全文|阅读全文|展开|Read more)$/i.test(button.textContent.trim())) continue;
    if (getComputedStyle(button).display === 'none' || !button.getBoundingClientRect().width) continue;
    // Follow the site's normal reading control; never remove a login/payment gate.
    if (button.closest('.Paywall,.paywall,.read-hide-content') || button.getAttribute('type') === 'submit') continue;
    button.click(); return true;
  }
  return false;
}

export function prepareArticlePage({ site, info }) {
  if (site.platform === 'wechat') { document.querySelector('#js_content').setAttribute('data-wx2md-body', ''); return; }
  let original;
  if (site.platform === 'zhihu' && site.kind === 'answer') {
    const answers = [...document.querySelectorAll('.AnswerItem')];
    let answer = answers.find(e => e.getAttribute('data-answer-id') === site.itemId || e.querySelector(`a[href$="/answer/${site.itemId}"]`));
    answer ||= answers.find(e => { try { return String(JSON.parse(e.getAttribute('data-zop')).itemId) === site.itemId; } catch { return false; } });
    if (!answer && answers.length === 1) answer = answers[0];
    original = answer?.querySelector('[itemprop="text"], .RichContent-inner .RichText, .RichContent-inner');
  } else original = document.querySelectorAll(info.selector)[info.contentIndex];
  if (!original) throw new Error('已识别的正文发生变化，请重新保存。');
  const content = original.cloneNode(true);
  const originalNodes = [original, ...original.querySelectorAll('*')], copies = [content, ...content.querySelectorAll('*')];
  const properties = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-align', 'text-decoration', 'white-space', 'vertical-align', 'list-style-type', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-bottom'];
  originalNodes.forEach((node, i) => {
    const copy = copies[i], style = getComputedStyle(node);
    if (!copy?.style || ['svg', 'path', 'math', 'script', 'style'].includes(node.localName)) return;
    for (const property of properties) copy.style.setProperty(property, style.getPropertyValue(property));
    if (node.localName === 'img') {
      const lazy = node.getAttribute('data-original') || node.getAttribute('data-actualsrc') || node.getAttribute('data-src');
      const src = lazy || node.currentSrc || node.getAttribute('src');
      if (src) { copy.setAttribute('src', new URL(src, document.baseURI).href); copy.setAttribute('data-src', copy.getAttribute('src')); }
      copy.removeAttribute('srcset'); copy.loading = 'eager';
      copy.style.setProperty('max-width', '100%'); copy.style.setProperty('height', 'auto');
      const renderedWidth = node.getBoundingClientRect().width;
      if (renderedWidth > 0) copy.style.setProperty('width', `${Math.round(renderedWidth)}px`);
    }
  });
  content.querySelectorAll('script,iframe,noscript,button,nav,aside,[role="navigation"],.toc,.table-of-contents,#comments,.hljs-ln-numbers,.line-numbers-rows,.code-toolbar,.hljs-button,.copy-btn,.article-copyright,.blog-footer-bottom,.ContentItem-actions,.RichContent-actions,[data-type="ad"]').forEach(e => e.remove());
  content.querySelectorAll('picture source[srcset]').forEach(e => e.remove());
  for (const pre of content.querySelectorAll('pre')) {
    const lines = [...pre.querySelectorAll('.hljs-ln-code')];
    if (lines.length) { const code = document.createElement('code'); code.textContent = lines.map(line => line.textContent).join('\n'); code.className = pre.querySelector('code')?.className || ''; pre.replaceChildren(code); }
  }
  const repeatedTitle = content.querySelector('h1');
  if (repeatedTitle?.textContent.trim() === info.title.trim()) repeatedTitle.remove();
  content.setAttribute('data-wx2md-body', '');
  content.style.setProperty('display', 'block', 'important'); content.style.setProperty('width', '100%', 'important');
  content.style.setProperty('max-width', 'none', 'important'); content.style.setProperty('min-width', '0', 'important');
  content.style.setProperty('height', 'auto', 'important'); content.style.setProperty('max-height', 'none', 'important');
  content.style.setProperty('overflow', 'visible', 'important'); content.style.setProperty('padding', '0', 'important');
  const main = document.createElement('main'); main.setAttribute('data-wx2md-article', '');
  const header = document.createElement('header'); header.setAttribute('data-wx2md-header', '');
  const heading = document.createElement('h1'); heading.textContent = info.title;
  const byline = document.createElement('p'); byline.textContent = [site.label, info.author, info.published].filter(Boolean).join(' · ');
  header.append(heading, byline); main.append(header, content);
  document.body.replaceChildren(main);
  document.querySelectorAll('base,meta[http-equiv="refresh" i]').forEach(e => e.remove());
  document.title = info.title;
  const style = document.createElement('style');
  style.textContent = 'html,body{margin:0!important;padding:0!important;width:100%!important;min-width:0!important;background:#fff!important;overflow-x:hidden!important}[data-wx2md-article]{display:block!important;box-sizing:border-box!important;width:100%!important;max-width:920px!important;margin:0 auto!important;padding:24px 20px!important;color:#222;background:white;font:16px/1.8 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}[data-wx2md-header]{display:block!important;position:static!important;width:auto!important;margin:0 0 24px!important;padding:0!important}[data-wx2md-header] h1{font:700 26px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;margin:0 0 12px!important;overflow-wrap:anywhere!important}[data-wx2md-header] p{font:14px/1.7 sans-serif!important;color:#777!important;margin:0!important}[data-wx2md-body]{box-sizing:border-box!important;overflow-wrap:anywhere!important}[data-wx2md-body] img{max-width:100%!important;height:auto!important}[data-wx2md-body] pre{max-width:100%!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;overflow:visible!important}[data-wx2md-body] :is(code,pre) span{white-space:inherit!important}[data-wx2md-body] :is(table,figure){max-width:100%!important;margin-left:0!important;margin-right:0!important}';
  document.head.append(style);
}
