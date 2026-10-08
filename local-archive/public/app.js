const $ = id => document.getElementById(id);
let token = '', initialized = false, latest = null, lastJobs = '', refreshing = false, toastTimer;
const statusNames = { pending: '等待保存', processing: '正在保存', completed: '保存完成', partial: '已保存 · 有提示', failed: '保存失败', needs_manual: '需要人工确认' };
const feishuNames = { disabled: '飞书未启用', unconfigured: '飞书待配置', connecting: '飞书连接中', connected: '飞书已连接', reconnecting: '飞书正在重连', failed: '飞书连接失败', idle: '飞书待连接' };
function toast(text, error = false) { $('toast').textContent = text; $('toast').className = error ? 'error' : ''; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
async function api(url, data) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', 'X-Wx2md-Token': token }, ...(data !== undefined ? { method: 'POST', body: JSON.stringify(data) } : {}) });
  const value = await res.json(); if (!res.ok) throw new Error(value.error || '操作失败'); return value;
}
function element(tag, text, className) { const e = document.createElement(tag); if (text) e.textContent = text; if (className) e.className = className; return e; }
function actionButton(text, callback) { const button = element('button', text); button.type = 'button'; button.onclick = async () => { button.disabled = true; try { await callback(); await refresh(); } catch (error) { toast(error.message, true); } finally { button.disabled = false; } }; return button; }
function renderJobs(jobs) {
  if (lastJobs === JSON.stringify(jobs)) return; lastJobs = JSON.stringify(jobs);
  $('job-count').textContent = jobs.length; $('jobs').replaceChildren();
  if (!jobs.length) { $('jobs').append(element('div', '还没有保存记录。粘贴第一篇文章链接，开始建立本地收藏。', 'empty')); return; }
  for (const job of jobs) {
    const card = element('article', '', 'job'); card.dataset.jobId = job.id;
    const header = element('div', '', 'job-header');
    header.append(element('h3', job.title || '文章 · ' + new URL(job.url).hostname + new URL(job.url).pathname));
    const stateClass = ['failed', 'needs_manual'].includes(job.status) ? 'error' : job.status === 'partial' ? 'warning' : ['pending', 'processing'].includes(job.status) ? 'waiting' : '';
    header.append(element('span', statusNames[job.status] || job.status, 'badge ' + stateClass)); card.append(header);
    const source = { manual: '手动保存', feishu: '飞书消息', 'message-test': '消息入口测试', 'user-example': '示例文章' }[job.source] || job.source;
    card.append(element('div', `${new Date(job.created_at).toLocaleString('zh-CN')} · ${source}${job.metadata?.site_name ? ' · ' + job.metadata.site_name : ''}${job.metadata?.account ? ' · ' + job.metadata.account : ''}${job.metadata ? ' · ' + (job.metadata.tool_version ? 'v' + job.metadata.tool_version : '旧版归档') : ''}`, 'job-meta'));
    if (job.status === 'processing') card.append(element('div', job.stage + '…', 'stage'));
    if (job.error) card.append(element('p', job.error, 'error-text'));
    const actions = element('div', '', 'job-actions');
    if (job.output_dir) {
      if (job.metadata?.format_version >= 4) {
        const names = job.metadata.file_names;
        for (const [name,text] of [[names.markdown,'MD 文件'],[names.html,'内嵌 HTML'],[names.metadata,'保存信息']]) {
          const a = element('a',text + ' ↗'); a.href = `/files/${job.id}/${encodeURIComponent(name)}`; a.target = '_blank'; a.rel = 'noopener';
          if (name === names.markdown) a.download = name;
          actions.append(a);
        }
        for (const [profile,label] of [['mobile','手机长图'],['desktop','电脑长图']]) {
          const a = element('a',label + ' ↗'); a.href = `/view/${job.id}/${profile}`; a.target = '_blank'; a.rel = 'noopener'; actions.append(a);
        }
      } else {
      const files = [...(job.metadata?.markdown_viewer ? [[job.metadata.markdown_viewer, 'Markdown 阅读'], ['article.md', 'MD 文件']] : [['article.md', 'Markdown']]), ['original.html', '原格式 HTML'],
        ...(job.metadata?.image_gallery ? [[job.metadata.image_gallery, '原图列表']] : []),
        ...(job.metadata?.html_files?.includes('original-singlefile.html') ? [['original-singlefile.html', '单文件 HTML']] : []),
        ...(job.metadata?.screenshot_viewer ? [[job.metadata.screenshot_viewer, '清晰长截图']] : (job.metadata?.screenshots || ['original.png']).map((name, i, all) => [name, all.length > 1 ? `截图 ${i + 1}` : '长截图']))];
      for (const [name, text] of files) { const a = element('a', text + ' ↗'); a.href = `/files/${job.id}/${name}`; a.target = '_blank'; a.rel = 'noopener'; actions.append(a); }
      }
      actions.append(actionButton('打开文件夹', () => api(`/api/jobs/${job.id}/folder`, {})));
    }
    if (!['pending', 'processing'].includes(job.status)) actions.append(actionButton('重新保存', () => api(`/api/jobs/${job.id}/retry`, {})));
    const sourceLink = element('a', '原文 ↗'); sourceLink.href = job.url; sourceLink.target = '_blank'; sourceLink.rel = 'noopener'; actions.append(sourceLink); card.append(actions);
    if (job.metadata?.warnings?.length) {
      const details = element('details'); details.append(element('summary', `查看 ${job.metadata.warnings.length} 项保存提示`));
      const list = element('ul'); job.metadata.warnings.forEach(w => list.append(element('li', w))); details.append(list); card.append(details);
    }
    $('jobs').append(card);
  }
}
async function refresh() {
  if (refreshing) return; refreshing = true;
  try {
    latest = await api('/api/status');
    $('service-version').textContent = `正在运行 · v${latest.version}`;
    $('runtime-root').textContent = latest.root;
    $('service-text').textContent = latest.busy ? '后台正在保存文章' : '本地工具运行中';
    $('feishu-summary').textContent = feishuNames[latest.feishu.state] || latest.feishu.state;
    $('feishu-state').textContent = feishuNames[latest.feishu.state] || latest.feishu.state;
    const pending = latest.jobs.filter(j => j.status === 'pending').length;
    $('queue-note').textContent = pending ? `${pending} 篇等待保存` : '记录自动更新';
    $('connection-detail').className = 'connection-detail' + (latest.feishu.error ? ' error' : '');
    $('connection-detail').textContent = latest.feishu.error || (latest.feishu.lastEvent ? `${new Date(latest.feishu.lastEvent.at).toLocaleTimeString('zh-CN')} · ${latest.feishu.lastEvent.result}${latest.feishu.lastEvent.senderId ? ' · 发送人 ' + latest.feishu.lastEvent.senderId : ''}` : '接通后，这里会显示最后一条消息的接收情况。');
    $('secret-note').textContent = latest.config.feishu.hasSecret ? '凭据已在本机保存；留空会保留当前 Secret。' : '';
    if (!initialized) {
      $('archive-dir').value = latest.config.archiveDir; $('screenshot-scale').value = latest.config.screenshotScale || 3; $('show-browser').checked = latest.config.showBrowser;
      $('app-id').value = latest.config.feishu.appId; $('feishu-enabled').checked = latest.config.feishu.enabled; $('allowed-senders').value = latest.config.feishu.allowedSenders.join(', ');
      initialized = true;
    }
    renderJobs(latest.jobs);
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
$('settings-form').onsubmit = event => { event.preventDefault(); submit(event.submitter, async () => { await api('/api/config', { archiveDir: $('archive-dir').value, screenshotScale: Number($('screenshot-scale').value), showBrowser: $('show-browser').checked }); toast('保存设置已更新。'); }); };
$('feishu-form').onsubmit = event => { event.preventDefault(); submit(event.submitter, async () => {
  await api('/api/config', { feishu: { appId: $('app-id').value, appSecret: $('app-secret').value, allowedSenders: $('allowed-senders').value, enabled: $('feishu-enabled').checked } });
  $('app-secret').value = ''; toast('飞书设置已保存，请查看连接状态。');
}); };
$('reconnect').onclick = () => submit($('reconnect'), async () => { await api('/api/feishu/reconnect', {}); toast('正在重新连接飞书。'); });
$('simulate').onclick = () => submit($('simulate'), async () => { const result = await api('/api/simulate-message', { text: $('message-test').value }); toast(`消息提取成功：${result.jobs.length} 个链接已处理，已保存文章会自动去重。`); });
$('open-root').onclick = () => submit($('open-root'), () => api('/api/open-archive', {}));
$('stop').onclick = () => submit($('stop'), async () => { await api('/api/stop', {}); toast('本地工具已停止；双击启动文件可再次运行。'); });
try { token = (await (await fetch('/api/session')).json()).token; await refresh(); setInterval(refresh, 1800); } catch { toast('无法连接本地工具，请重新启动。', true); }
