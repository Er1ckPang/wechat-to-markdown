import { renderJobs as renderRecordJobs } from './job-ui.js';
const $ = id => document.getElementById(id);
let token = '', initialized = false, latest = null, lastJobs = '', refreshing = false, toastTimer;
const statusNames = { pending: '等待保存', processing: '正在保存', completed: '保存完成', partial: '已保存 · 有提示', invalid: '链接已失效', failed: '保存失败', needs_manual: '需要人工确认' };
const feishuNames = { disabled: '飞书未启用', unconfigured: '飞书待配置', connecting: '飞书连接中', connected: '飞书已连接', reconnecting: '飞书正在重连', failed: '飞书连接失败', idle: '飞书待连接' };
function toast(text, error = false) { $('toast').textContent = text; $('toast').className = error ? 'error' : ''; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
async function api(url, data) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', 'X-Wx2md-Token': token }, ...(data !== undefined ? { method: 'POST', body: JSON.stringify(data) } : {}) });
  const value = await res.json(); if (!res.ok) throw new Error(value.error || '操作失败'); return value;
}
function element(tag, text, className) { const e = document.createElement(tag); if (text) e.textContent = text; if (className) e.className = className; return e; }
function renderJobs(jobs) {
  if (lastJobs === JSON.stringify(jobs)) return; lastJobs = JSON.stringify(jobs);
  renderRecordJobs(jobs, { container:$('jobs'), count:$('job-count'), empty:'当前没有正在保存或等待中的任务。', api, refresh, onError:text=>toast(text,true) });
}
async function refresh() {
  if (refreshing) return; refreshing = true;
  try {
    latest = await api('/api/status');
    $('service-version').textContent = `正在运行 · v${latest.version}`;
    $('runtime-root').textContent = latest.root;
    $('service-text').textContent = latest.busy ? `后台正在保存 ${latest.worker.active} 篇文章` : '本地工具运行中';
    $('feishu-summary').textContent = feishuNames[latest.feishu.state] || latest.feishu.state;
    $('feishu-state').textContent = feishuNames[latest.feishu.state] || latest.feishu.state;
    const pending = latest.stats.pending || 0;
    $('queue-note').textContent = `${pending} 篇等待 · 并发 ${latest.worker.active}/${latest.worker.concurrency}` + (latest.worker.pausedHosts.length ? ' · 网站限流，等待恢复' : '');
    const invalidCount = latest.stats.invalid || 0;
    $('link-alerts').hidden = !invalidCount;
    $('link-alerts').textContent = `有 ${invalidCount} 篇文章链接已失效，未保存错误页面。请在保存记录页筛选“链接已失效”查看原因；链接恢复后可重新保存。`;
    $('connection-detail').className = 'connection-detail' + (latest.feishu.error ? ' error' : '');
    $('connection-detail').textContent = latest.feishu.error || (latest.feishu.lastEvent ? `${new Date(latest.feishu.lastEvent.at).toLocaleTimeString('zh-CN')} · ${latest.feishu.lastEvent.result}${latest.feishu.lastEvent.senderId ? ' · 发送人 ' + latest.feishu.lastEvent.senderId : ''}` : '接通后，这里会显示最后一条消息的接收情况。');
    $('secret-note').textContent = latest.config.feishu.hasSecret ? '凭据已在本机保存；留空会保留当前 Secret。' : '';
    if (!initialized) {
      $('archive-dir').value = latest.config.archiveDir; $('screenshot-scale').value = latest.config.screenshotScale || 3; $('show-browser').checked = latest.config.showBrowser;
      $('concurrency').value = latest.config.concurrency;
      $('app-id').value = latest.config.feishu.appId; $('feishu-enabled').checked = latest.config.feishu.enabled; $('allowed-senders').value = latest.config.feishu.allowedSenders.join(', ');
      initialized = true;
    }
    renderJobs(latest.jobs);
    const stats = latest.stats, total = Object.values(stats).reduce((a,b)=>a+b,0);
    $('summary-total').textContent = total; $('summary-saved').textContent = (stats.completed || 0) + (stats.partial || 0);
    $('summary-active').textContent = (stats.pending || 0) + (stats.processing || 0);
    $('summary-attention').textContent = (stats.invalid || 0) + (stats.failed || 0) + (stats.needs_manual || 0) + (stats.partial || 0);
    $('active-note').textContent = (stats.pending || 0) + (stats.processing || 0) > latest.jobs.length ? '首页显示最前面的 12 个活跃任务；其余等待任务可在保存记录页查看。' : '已完成及需要处理的记录，请到保存记录页查看。';
  } catch { $('service-text').textContent = '本地工具已停止，请重新启动'; } finally { refreshing = false; }
}
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => {
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === button));
  document.querySelectorAll('.tab-panel').forEach(p => p.hidden = p.id !== 'tab-' + button.dataset.tab);
});
async function submit(button, callback) { button.disabled = true; try { await callback(); await refresh(); } catch (error) { toast(error.message, true); } finally { button.disabled = false; } }
$('save').onclick = () => submit($('save'), async () => {
  const result = await api('/api/jobs', { text: $('links').value }); const duplicate = result.results.filter(x => x.duplicate).length;
  toast(duplicate === result.results.length ? '这些文章已在保存记录中。' : `已加入 ${result.results.length - duplicate} 篇文章${duplicate ? `，跳过 ${duplicate} 篇重复文章` : ''}。`);
  $('links').value = '';
});
let importJob = new URL(location.href).searchParams.get('importJob') || '';
$('import-form').onsubmit = event => { event.preventDefault(); submit(event.submitter, async () => {
  const file = $('import-file').files[0];
  if (!file || file.size > 64*1024*1024) throw new Error('请选择不超过 64 MB 的单个网页文件。');
  const params = new URLSearchParams({url:$('import-url').value,filename:file.name,...(importJob ? {jobId:importJob} : {})});
  const response = await fetch('/api/browser-import?'+params,{method:'POST',headers:{'X-Wx2md-Token':token,'Content-Type':'application/octet-stream'},body:file});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '导入失败');
  $('import-form').reset(); importJob = ''; $('import-note').textContent = ''; toast('已加入导入任务。生成进度在首页显示，结果在保存记录页查看。');
}); };
$('settings-form').onsubmit = event => { event.preventDefault(); submit(event.submitter, async () => { await api('/api/config', { archiveDir: $('archive-dir').value, screenshotScale: Number($('screenshot-scale').value), concurrency: Number($('concurrency').value), showBrowser: $('show-browser').checked }); toast('保存设置已更新。'); }); };
$('feishu-form').onsubmit = event => { event.preventDefault(); submit(event.submitter, async () => {
  await api('/api/config', { feishu: { appId: $('app-id').value, appSecret: $('app-secret').value, allowedSenders: $('allowed-senders').value, enabled: $('feishu-enabled').checked } });
  $('app-secret').value = ''; toast('飞书设置已保存，请查看连接状态。');
}); };
$('reconnect').onclick = () => submit($('reconnect'), async () => { await api('/api/feishu/reconnect', {}); toast('正在重新连接飞书。'); });
$('simulate').onclick = () => submit($('simulate'), async () => { const result = await api('/api/simulate-message', { text: $('message-test').value }); toast(`消息提取成功：${result.jobs.length} 个链接已处理，已保存文章会自动去重。`); });
$('open-root').onclick = () => submit($('open-root'), () => api('/api/open-archive', {}));
$('stop').onclick = () => submit($('stop'), async () => { await api('/api/stop', {}); toast('本地工具已停止；双击启动文件可再次运行。'); });
try {
  token = (await (await fetch('/api/session')).json()).token; await refresh(); setInterval(refresh, 1800);
  if (importJob && /^[a-f0-9-]{36}$/.test(importJob)) {
    const job = await api('/api/jobs/'+importJob);
    $('import-url').value = job.resolved_url || job.url; $('import-note').textContent = '导入成功后会继续这条原任务，保留公众号迁移记录。';
    $('browser-import').open = true; $('browser-import').scrollIntoView();
  } else if (location.hash === '#browser-import') { $('browser-import').open = true; $('browser-import').scrollIntoView(); }
} catch { toast('无法连接本地工具，请重新启动。', true); }
