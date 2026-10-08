import { renderJobs } from './job-ui.js';
const $ = id => document.getElementById(id), form = $('filters');
let token='', query=new URLSearchParams(location.search), result, lastJobs='', lastFacets='', sequence=0, controller, toastTimer;
function toast(text) { $('toast').textContent=text; $('toast').className='error'; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,6500); }
async function api(url,data,signal) {
  const response=await fetch(url,{signal,headers:{'Content-Type':'application/json','X-Wx2md-Token':token},...(data!==undefined?{method:'POST',body:JSON.stringify(data)}:{})});
  const value=await response.json(); if(!response.ok)throw new Error(value.error || '查询失败'); return value;
}
function fillForm() { form.reset(); for(const key of ['status','site','source','account'])form.elements.namedItem(key).dataset.facetReady=''; for(const [key,value]of query)if(form.elements.namedItem(key))form.elements.namedItem(key).value=value; }
function navigate(next,replace=false) { query=next; (replace?history.replaceState:history.pushState).call(history,null,'',location.pathname+(query.size?'?'+query:'')); void refresh(); }
function move(page) { const next=new URLSearchParams(query); next.set('page',page); navigate(next); }
function facetOptions(facets) {
  if(lastFacets===JSON.stringify(facets))return; lastFacets=JSON.stringify(facets);
  for(const [key,rows]of Object.entries(facets)) {
    const select=form.elements.namedItem(key), selected=select.dataset.facetReady ? select.value : query.get(key) || '';
    const first=select.options[0].cloneNode(true); select.replaceChildren(first);
    for(const row of rows){const option=document.createElement('option');option.value=row.value;option.textContent=`${row.label} (${row.count})`;select.append(option);}
    if(selected && !rows.some(row=>row.value===selected)){const option=document.createElement('option');option.value=selected;option.textContent=selected+' (0)';select.append(option);}
    select.value=selected; select.dataset.facetReady='1';
  }
}
async function refresh() {
  const current=++sequence; controller?.abort(); controller=new AbortController(); $('jobs').setAttribute('aria-busy','true');
  try {
    const [records,status]=await Promise.all([api('/api/jobs?'+query,undefined,controller.signal),api('/api/status',undefined,controller.signal)]);
    if(current!==sequence)return; result=records; facetOptions(records.facets);
    // A completion or retry may reduce the last page; keep navigation truthful.
    if(Number(query.get('page') || 1)!==records.page){query.set('page',records.page);history.replaceState(null,'',location.pathname+'?'+query);}
    $('service-text').textContent=`共 ${records.total} 条记录 · ${status.worker.active} 篇正在保存 · ${status.stats.pending || 0} 篇等待`;
    $('service-version').textContent=`正在运行 · v${status.version}`;
    $('result-summary').textContent=`匹配 ${records.matched} 条 · 本页 ${records.jobs.length} 条`;
    $('query-note').textContent=records.capped?`筛选匹配超过 ${records.maxRecords} 条，当前排序可查看前 ${records.maxRecords} 条。请缩小时间或其他筛选条件查看更多；数据库中的记录不会删除。`:'筛选在完整数据库中执行。每页只加载当前记录，最多可查看 10000 条匹配结果。';
    const key=JSON.stringify(records.jobs);
    if(lastJobs!==key){lastJobs=key;renderJobs(records.jobs,{container:$('jobs'),count:$('job-count'),empty:'没有符合条件的保存记录。可以清空或调整筛选条件。',api,refresh,onError:toast});}
    $('page-label').textContent=`第 ${records.page} / ${records.pages} 页`; $('prev').disabled=records.page<=1; $('next').disabled=records.page>=records.pages;
    $('jump-page').max=records.pages; $('jump-page').value=records.page; $('records-error').hidden=true;
  } catch(error) {if(error.name!=='AbortError' && current===sequence){$('records-error').hidden=false;$('records-error').textContent=error.message;$('service-text').textContent='查询未完成，请检查筛选条件或确认本地工具仍在运行。';}}
  finally{if(current===sequence)$('jobs').setAttribute('aria-busy','false');}
}
form.onsubmit=event=>{event.preventDefault();const next=new URLSearchParams();for(const [key,value]of new FormData(form))if(value)next.set(key,String(value));navigate(next);};
$('clear-filters').onclick=()=>{form.reset();navigate(new URLSearchParams());}; $('reload').onclick=()=>void refresh();
$('prev').onclick=()=>result && move(result.page-1); $('next').onclick=()=>result && move(result.page+1);
$('jump-form').onsubmit=event=>{event.preventDefault();if(result)move(Math.max(1,Math.min(result.pages,Number($('jump-page').value) || 1)));};
window.onpopstate=()=>{query=new URLSearchParams(location.search);fillForm();lastFacets='';void refresh();};
fillForm();
try{token=(await (await fetch('/api/session')).json()).token;await refresh();setInterval(()=>{if(!document.hidden)void refresh();},5000);}catch(error){toast(error.message);}
