import { chromium } from 'playwright';

export function browserChannels(browser = 'auto', platform = process.platform) {
  if (browser !== 'auto') {
    if (!['chrome', 'msedge', 'chromium'].includes(browser)) throw new Error('浏览器设置无效，请使用 auto、chrome、msedge 或 chromium。');
    return [browser];
  }
  return platform === 'win32' ? ['msedge', 'chrome', 'chromium'] : ['chromium', 'chrome', 'msedge'];
}

export async function launchBrowser({ showBrowser = false, browser = process.env.WX2MD_BROWSER || 'auto' } = {}, launch = options => chromium.launch(options)) {
  const failures = [];
  for (const channel of browserChannels(browser)) {
    try { return await launch({ ...(channel === 'chromium' ? {} : { channel }), headless: !showBrowser, timeout: 15000 }); }
    catch (error) { failures.push(`${channel}: ${error.message}`); }
  }
  const help = process.platform === 'darwin'
    ? '请运行 install-mac.command 安装浏览器，再运行 doctor-mac.command 检查。'
    : '请安装 Edge/Chrome，或在工具目录运行 node node_modules/playwright/cli.js install chromium。';
  throw new Error(`没有可用的 Chromium、Chrome 或 Edge。${help}`, { cause: new Error(failures.join('\n')) });
}
