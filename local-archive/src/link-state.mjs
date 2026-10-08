import { articleUrl, articleKey } from './urls.mjs';
import { inspectArticlePage } from './sites.mjs';

export class InvalidArticleError extends Error {
  name = 'InvalidArticleError';
  constructor(message, details = {}) { super(message); this.details = details; }
}
export class NeedsManualError extends Error { name = 'NeedsManualError'; }

// Browser-side: error panels only. Never classify an article quoting these words.
export function inspectLinkState({ platform, httpStatus = 200 }) {
  const body = document.querySelector('#js_content, [data-wx2md-body]');
  if (platform === 'wechat' && body && (body.innerText.trim() || body.querySelector('img'))) return { state: 'article' };
  const visible = e => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const text = (document.body?.innerText || '').trim();
  const panel = [...document.querySelectorAll('#js_msg, .weui-msg, .weui-msg__text-area, .page_msg, .msg_content, .tips')].find(visible);
  const message = (panel?.innerText || text.slice(0, 1600)).split(/\s+/).join(' ').trim();
  if (platform === 'wechat' && /(?:公众号|账号).{0,16}已迁移|该公众号已迁移/.test(message + document.title)) {
    const candidates = [...document.querySelectorAll('#js_access_msg, a[href]')].filter(a => a.id === 'js_access_msg' || /^(?:访问文章|查看文章|继续访问|前往文章)$/.test(a.textContent.trim()));
    return { state: 'migrated', target: candidates[0]?.getAttribute('href') || '', message: '该公众号已迁移' };
  }
  if (httpStatus === 404 || httpStatus === 410) return { state: 'invalid', reason: httpStatus === 410 ? 'gone' : 'not_found', message: `文章链接已失效（HTTP ${httpStatus}）。` };
  if (httpStatus === 429 || /访问(?:过于|太)频繁|操作(?:过于|太)频繁|请求过于频繁|too many requests/i.test(message) && text.length < 2000) return { state: 'throttled', message: '网站暂时限制访问频率，请稍后重试。' };
  if (platform === 'wechat' && (/^\/mp\/(?:wappoc_appmsgcaptcha|verify)(?:\/|$)/.test(location.pathname) || /环境异常|完成验证|安全验证|验证码/.test(message) && text.length < 2000)) return { state:'verification', message:'微信要求访问验证，文章链接未失效。' };
  if (platform === 'wechat') {
    const errors = [
      ['deleted', /(?:该|此)?(?:内容|文章)已被(?:发布者|作者)删除|(?:该|此)?(?:内容|文章)已(?:被)?删除/],
      ['expired', /(?:链接|页面|文章)已(?:经)?(?:过期|失效)|链接无效/],
      ['copyright', /(?:内容|文章).{0,24}(?:涉嫌侵权|侵权投诉|侵犯.{0,12}著作权)/],
      ['account_removed', /(?:公众号|账号)已(?:自主|被)?(?:注销|封禁)/],
      ['removed', /(?:内容|文章).{0,32}(?:违规|违反相关法律|违反相关规定|无法查看|已被屏蔽|已被下架)|原文不存在|文章不存在/],
    ];
    for (const [reason, pattern] of errors) if (pattern.test(message)) return { state: 'invalid', reason, message: `文章链接已失效：${message.slice(0, 240)}` };
  }
  return { state: 'unknown' };
}

export function migrationTarget(input, current, fixtureOrigin) {
  let target;
  try { target = new URL(input, current); } catch { throw new NeedsManualError('公众号已迁移，但新文章链接无效，请人工确认。'); }
  if (fixtureOrigin && target.origin === fixtureOrigin) { target.hash = ''; return target.href; }
  if (target.hostname !== 'mp.weixin.qq.com') throw new NeedsManualError('公众号迁移链接不是微信文章地址，请人工确认。');
  try { return articleUrl(target.href); } catch { throw new NeedsManualError('公众号已迁移，但没有可识别的新文章链接，请人工确认。'); }
}

export async function evaluateStable(page, callback, argument) {
  const deadline = Date.now() + 10000;
  while (true) {
    try { return await page.evaluate(callback, argument); }
    catch (error) {
      if (!/Execution context was destroyed|Cannot find context with specified id/.test(error.message) || Date.now() >= deadline) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

export async function waitForReadableArticle(page, site, config, details, onStage = () => {}, httpStatus = 200) {
  try {
  let info = await evaluateStable(page, inspectArticlePage, site), announced = false;
  const deadline = Date.now() + (config.showBrowser ? 90000 : 12000);
  const verificationError = timedOut => {
    const error = new NeedsManualError(`${details.migrations?.length ? '公众号已迁移，' : ''}${timedOut ? '微信验证未在90秒内完成。' : '目标文章需要微信访问验证。'}请点击“打开浏览器验证并继续保存”，在弹出的采集浏览器中完成验证，工具会自动继续保存。未保存验证页面。`);
    error.details = { ...details, requires_verification:true, site:'wechat' }; return error;
  };
  while (!info.ready) {
    const state = await evaluateStable(page, inspectLinkState, { platform:site.platform, httpStatus });
    if (state.state === 'invalid') throw new InvalidArticleError(state.message, { ...details, reason:state.reason });
    if (state.state === 'throttled') { const error = new NeedsManualError(state.message); error.retryAfterMs = 60000; error.details = details; throw error; }
    if (state.state === 'verification') {
      details.requires_verification = true;
      if (!config.showBrowser) throw verificationError(false);
      if (!announced) { onStage('等待在采集浏览器中完成微信验证 · 最多90秒，验证后自动继续保存'); announced = true; }
    }
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(500); info = await evaluateStable(page, inspectArticlePage, site);
  }
  if (!info.ready) {
    if (details.requires_verification) throw verificationError(true);
    throw new NeedsManualError(`无法读取${site.label}的单篇文章正文。页面可能需要登录、验证或没有可识别的文章。可启用“显示采集浏览器”后重试；不保存登录或验证页面。`);
  }
  return info;
  } catch (error) {
    if (details.requires_verification && /Target (?:page, context or browser|closed)|has been closed|Browser closed/i.test(error.message)) {
      const manual = new NeedsManualError('微信验证窗口已关闭，保存未完成。可以从普通浏览器导入已正常打开的文章，或稍后再次验证。未保存验证页面。');
      manual.details = { ...details, requires_verification:true, site:'wechat' }; throw manual;
    }
    throw error;
  }
}

export async function resolveArticleLink(page, sourceUrl, site, config, onStage, options = {}) {
  const migrations = [], visited = new Set();
  let current = sourceUrl, response, referer;
  const identity = url => options.fixtureOrigin ? new URL(url).href.replace(/#.*$/, '') : articleKey(url);
  for (let hop = 0; hop <= 5; hop++) {
    const key = identity(current);
    if (visited.has(key)) throw new NeedsManualError('公众号迁移链接形成循环，已停止跳转，请人工确认。');
    visited.add(key);
    response = await page.goto(current, { waitUntil: 'domcontentloaded', timeout: 45000, ...(referer ? { referer } : {}) }).catch(async error => {
      if (!(await evaluateStable(page, inspectArticlePage, site)).ready) throw error;
    });
    let state = await evaluateStable(page, inspectLinkState, { platform: site.platform, httpStatus: response?.status() || 200 });
    if (state.state === 'unknown' && site.platform === 'wechat') {
      await page.waitForTimeout(350);
      state = await evaluateStable(page, inspectLinkState, { platform: site.platform, httpStatus: response?.status() || 200 });
    }
    if (state.state === 'invalid') throw new InvalidArticleError(state.message, { reason: state.reason, http_status: response?.status(), original_url: sourceUrl, resolved_url: page.url(), migrations });
    if (state.state === 'throttled') { const error = new NeedsManualError(state.message); error.retryAfterMs = 60000; throw error; }
    if (state.state !== 'migrated') return { response, migrations, state };
    if (!state.target) throw new NeedsManualError('已识别公众号迁移提示，但页面没有提供新的文章链接，请人工确认。');
    if (hop === 5) throw new NeedsManualError('公众号迁移超过 5 次，已停止跳转，请人工确认。');
    const target = migrationTarget(state.target, page.url(), options.fixtureOrigin);
    migrations.push({ from: page.url(), to: target, type: 'wechat_account_migration' });
    onStage(`公众号已迁移，正在打开新文章（第 ${migrations.length} 次）`);
    referer = page.url(); current = target;
  }
}
