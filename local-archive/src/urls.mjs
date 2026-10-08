import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export const siteNames = { wechat: '微信公众号', zhihu: '知乎', csdn: 'CSDN', cnblogs: '博客园', web: '普通网页' };
export function publicWebUrl(input) {
  let url;
  try { url = new URL(String(input).trim().replace(/&amp;/g, '&')); }
  catch { throw new Error('请输入完整的 http 或 https 文章链接。'); }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port
      || isIP(hostname) || !hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|lan|test|invalid)$/.test(hostname)) {
    throw new Error('仅支持公网网站的标准 http 或 https 链接。');
  }
  url.hash = '';
  return url;
}

export function articleSite(input) {
  const url = publicWebUrl(input);
  const host = url.hostname.toLowerCase();
  let platform = 'web', kind = 'article', itemId = '';
  if (host === 'mp.weixin.qq.com') {
    if (!/^\/s(?:\/|$)/.test(url.pathname)) throw new Error('请提供公众号单篇文章链接。');
    platform = 'wechat';
  } else if (host === 'zhuanlan.zhihu.com' || host === 'www.zhihu.com' || host === 'zhihu.com') {
    platform = 'zhihu';
    const post = host === 'zhuanlan.zhihu.com' && /^\/p\/(\d+)\/?$/.exec(url.pathname);
    const answer = /^\/(?:question\/\d+\/)?answer\/(\d+)\/?$/.exec(url.pathname);
    if (post) itemId = post[1];
    else if (answer) { kind = 'answer'; itemId = answer[1]; }
    else throw new Error('知乎请使用专栏文章 /p/… 或具体回答 /question/…/answer/… 链接。');
  } else if (host === 'blog.csdn.net' || host === 'm.blog.csdn.net') {
    platform = 'csdn';
    const match = /^\/[^/]+\/article\/details\/(\d+)\/?$/.exec(url.pathname);
    if (!match) throw new Error('CSDN 请使用 /作者/article/details/… 单篇文章链接。');
    itemId = match[1];
  } else if (host === 'www.cnblogs.com' || host === 'cnblogs.com') {
    platform = 'cnblogs';
    const match = /^\/[^/]+\/(?:p|articles)\/(\d+)(?:\.html)?\/?$/.exec(url.pathname);
    if (!match) throw new Error('博客园请使用 /作者/p/… 或 /作者/articles/… 单篇文章链接。');
    itemId = match[1];
  }
  return { platform, label: siteNames[platform], kind, itemId };
}

export function articleUrl(input) {
  const url = publicWebUrl(input);
  const site = articleSite(url.href);
  if (['wechat', 'zhihu', 'csdn', 'cnblogs'].includes(site.platform)) url.protocol = 'https:';
  if (url.hostname === 'zhihu.com') url.hostname = 'www.zhihu.com';
  if (url.hostname === 'm.blog.csdn.net') url.hostname = 'blog.csdn.net';
  if (url.hostname === 'cnblogs.com') url.hostname = 'www.cnblogs.com';
  url.port = '';
  url.hash = '';
  return url.href;
}

export function articleKey(input) {
  const url = new URL(articleUrl(input));
  const site = articleSite(url.href);
  if (['zhihu', 'csdn', 'cnblogs'].includes(site.platform)) return hash(`${site.platform}:${site.kind}:${site.itemId}`);
  const parameters = ['__biz', 'mid', 'idx', 'sn'];
  if (site.platform === 'wechat' && url.pathname === '/s' && parameters.every(name => url.searchParams.has(name))) {
    const key = new URL('https://mp.weixin.qq.com/s');
    for (const name of parameters) key.searchParams.set(name, url.searchParams.get(name));
    return hash(key.href);
  }
  if (site.platform === 'wechat' && url.pathname.startsWith('/s/')) return hash(url.origin + url.pathname);
  for (const name of [...url.searchParams.keys()]) if (/^utm_|^(?:spm|share_source|share_medium)$/i.test(name)) url.searchParams.delete(name);
  url.searchParams.sort();
  return hash(url.href);
}

export function hash(input) { return createHash('sha256').update(input).digest('hex'); }

export function extractArticleUrls(text) {
  const found = new Map();
  for (const match of String(text).replace(/&amp;/g, '&').matchAll(/https?:\/\/[^\s<>"'，。；！？、（）【】《》]+/gi)) {
    let candidate = match[0].replace(/[\]},.;!?]+$/, '');
    while (candidate.endsWith(')') && (candidate.match(/\)/g)?.length || 0) > (candidate.match(/\(/g)?.length || 0)) candidate = candidate.slice(0, -1);
    try { const url = articleUrl(candidate); const key = articleKey(url); if (!found.has(key)) found.set(key, url); } catch { /* 非文章链接 */ }
  }
  return [...found.values()];
}

export function resourceAllowed(input, fixtureOrigin, platform = 'wechat') {
  let url;
  try { url = new URL(input); } catch { return false; }
  if (['data:', 'blob:', 'about:'].includes(url.protocol)) return true;
  if (fixtureOrigin && url.origin === fixtureOrigin) return true;
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return false;
  if (platform !== 'wechat') { try { publicWebUrl(url.href); return true; } catch { return false; } }
  return ['weixin.qq.com', 'wx.qq.com', 'qpic.cn', 'qlogo.cn', 'gtimg.com']
    .some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
}

export function safeName(input, maxLength = 70) {
  const value = String(input || '未命名').normalize('NFC')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, maxLength) || '未命名';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) ? '_' + value : value;
}
