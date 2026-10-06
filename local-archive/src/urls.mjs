import { createHash } from 'node:crypto';

export function articleUrl(input) {
  let url;
  try { url = new URL(String(input).trim().replace(/&amp;/g, '&')); }
  catch { throw new Error('请输入完整的微信公众号文章链接。'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.hostname !== 'mp.weixin.qq.com'
      || url.username || url.password || (url.port && !['80', '443'].includes(url.port))
      || !/^\/s(?:\/|$)/.test(url.pathname)) {
    throw new Error('仅支持 mp.weixin.qq.com/s 开头的公众号文章链接。');
  }
  url.protocol = 'https:';
  url.port = '';
  url.hash = '';
  return url.href;
}

export function articleKey(input) {
  const url = new URL(articleUrl(input));
  const parameters = ['__biz', 'mid', 'idx', 'sn'];
  if (url.pathname === '/s' && parameters.every(name => url.searchParams.has(name))) {
    const key = new URL('https://mp.weixin.qq.com/s');
    for (const name of parameters) key.searchParams.set(name, url.searchParams.get(name));
    return hash(key.href);
  }
  if (url.pathname.startsWith('/s/')) return hash(url.origin + url.pathname);
  url.searchParams.sort();
  return hash(url.href);
}

export function hash(input) { return createHash('sha256').update(input).digest('hex'); }

export function extractArticleUrls(text) {
  const found = new Map();
  for (const match of String(text).replace(/&amp;/g, '&').matchAll(/https?:\/\/mp\.weixin\.qq\.com\/s(?:[/?][^\s<>"'，。；！？、）】》]*)?/gi)) {
    const candidate = match[0].replace(/[)\]},.;!?]+$/, '');
    try { const url = articleUrl(candidate); found.set(articleKey(url), url); } catch { /* 非文章链接 */ }
  }
  return [...found.values()];
}

export function resourceAllowed(input, fixtureOrigin) {
  let url;
  try { url = new URL(input); } catch { return false; }
  if (['data:', 'blob:', 'about:'].includes(url.protocol)) return true;
  if (fixtureOrigin && url.origin === fixtureOrigin) return true;
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return false;
  return ['weixin.qq.com', 'wx.qq.com', 'qpic.cn', 'qlogo.cn', 'gtimg.com']
    .some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
}

export function safeName(input, maxLength = 70) {
  const value = String(input || '未命名').normalize('NFC')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, maxLength) || '未命名';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) ? '_' + value : value;
}
