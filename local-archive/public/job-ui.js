const statusNames = { pending: '等待保存', processing: '正在保存', completed: '保存完成', partial: '已保存 · 有提示', invalid: '链接已失效', failed: '保存失败', needs_manual: '需要人工确认' };
function element(tag, text, className) { const e = document.createElement(tag); if (text) e.textContent = text; if (className) e.className = className; return e; }
export function renderJobs(jobs, { container, count, empty, api, refresh, onError }) {
  const actionButton = (text, callback) => { const button = element('button', text); button.type = 'button'; button.onclick = async () => { button.disabled = true; try { await callback(); await refresh(); } catch (error) { onError(error.message); } finally { button.disabled = false; } }; return button; };
  count.textContent = jobs.length; container.replaceChildren();
  if (!jobs.length) { container.append(element('div', empty, 'empty')); return; }
  for (const job of jobs) {
    const card = element('article', '', 'job'); card.dataset.jobId = job.id;
    const header = element('div', '', 'job-header');
    header.append(element('h3', job.title || '文章 · ' + new URL(job.url).hostname + new URL(job.url).pathname));
    const stateClass = ['failed', 'needs_manual', 'invalid'].includes(job.status) ? 'error' : job.status === 'partial' ? 'warning' : ['pending', 'processing'].includes(job.status) ? 'waiting' : '';
    header.append(element('span', statusNames[job.status] || job.status, 'badge ' + stateClass)); card.append(header);
    const source = { manual: '手动保存', feishu: '飞书消息', 'message-test': '消息入口测试', 'user-example': '示例文章', 'browser-import':'普通浏览器导入' }[job.source] || job.source;
    card.append(element('div', `${new Date(job.created_at).toLocaleString('zh-CN')} · ${source}${job.metadata?.site_name ? ' · ' + job.metadata.site_name : ''}${job.metadata?.account ? ' · ' + job.metadata.account : ''}${job.metadata?.tool_version ? ' · v' + job.metadata.tool_version : job.metadata?.format_version ? ' · 旧版归档' : ''}`, 'job-meta'));
    if (job.metadata?.migrations?.length) {
      const note = element('p', job.output_dir && ['completed','partial'].includes(job.status) ? job.metadata.browser_import ? '公众号已迁移，已从普通浏览器文件保存新文章。' : '公众号已迁移，已自动转至新链接保存。' : job.metadata.requires_verification ? '已找到迁移后的新文章；可在普通浏览器正常打开后导入，或稍后完成采集浏览器验证。' : '公众号已迁移，已找到新链接；请查看当前保存提示。', 'migration-note');
      const link = element('a', '新文章 ↗'); link.href = job.metadata.resolved_url; link.target = '_blank'; link.rel = 'noopener'; note.append(' ', link); card.append(note);
    }
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
    if (['needs_manual','failed'].includes(job.status) && job.metadata?.requires_verification) {
      actions.append(actionButton('打开浏览器验证并继续保存', () => api(`/api/jobs/${job.id}/verify`, {})));
    }
    if (['needs_manual','failed'].includes(job.status)) {
      const imported = element('a','从普通浏览器导入'); imported.href = `/?importJob=${job.id}#browser-import`; actions.append(imported);
    }
    if (!['pending', 'processing'].includes(job.status)) actions.append(actionButton('重新保存', () => api(`/api/jobs/${job.id}/retry`, {})));
    const sourceLink = element('a', '原文 ↗'); sourceLink.href = job.url; sourceLink.target = '_blank'; sourceLink.rel = 'noopener'; actions.append(sourceLink); card.append(actions);
    if (job.metadata?.warnings?.length) {
      const details = element('details'); details.append(element('summary', `查看 ${job.metadata.warnings.length} 项保存提示`));
      const list = element('ul'); job.metadata.warnings.forEach(w => list.append(element('li', w))); details.append(list); card.append(details);
    }
    container.append(card);
  }
}
