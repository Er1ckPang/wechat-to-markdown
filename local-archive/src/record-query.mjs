import { siteNames } from './urls.mjs';
export const MAX_RECORDS = 10000;
export const STATUS_NAMES = { pending:'等待保存', processing:'正在保存', completed:'保存完成', partial:'已保存 · 有提示', invalid:'链接已失效', failed:'保存失败', needs_manual:'需要人工确认' };
export const SITE_NAMES = siteNames;
export const SOURCE_NAMES = { manual:'手动保存', feishu:'飞书消息', 'message-test':'消息入口测试', 'user-example':'示例文章', 'browser-import':'普通浏览器导入' };
const site = `COALESCE(NULLIF(json_extract(metadata,'$.site'),''),CASE WHEN url LIKE 'https://mp.weixin.qq.com/%' THEN 'wechat' WHEN url LIKE 'https://%.zhihu.com/%' OR url LIKE 'https://zhihu.com/%' THEN 'zhihu' WHEN url LIKE 'https://%.csdn.net/%' THEN 'csdn' WHEN url LIKE 'https://%.cnblogs.com/%' OR url LIKE 'https://cnblogs.com/%' THEN 'cnblogs' ELSE 'web' END)`;
const account = `COALESCE(NULLIF(json_extract(metadata,'$.account'),''),NULLIF(json_extract(metadata,'$.author'),''),'')`;
function integer(value, fallback, min, max, name) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${name}无效。`);
  return n;
}
function date(value, end = false) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期格式应为 YYYY-MM-DD。');
  const utc = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0,10) !== value) throw new Error('日期无效。');
  return new Date(utc.getTime() - 8*3600000 + (end ? 86400000 : 0)).toISOString();
}
export function compactJob(job) {
  if (!job.metadata) return job;
  const metadata = {};
  for (const key of ['site','site_name','account','author','tool_version','format_version','file_names','migrations','resolved_url','warnings','requires_verification','browser_import','markdown_viewer','image_gallery','html_files','screenshot_viewer','screenshots']) {
    if (job.metadata[key] !== undefined) metadata[key] = job.metadata[key];
  }
  return { ...job, metadata };
}
export function queryRecords(store, input = {}) {
  const where = [], values = [];
  const filters = { q:String(input.q || '').trim(), group:input.group || '', status:input.status || '', site:input.site || '', source:input.source || '', account:input.account || '', from:input.from || '', to:input.to || '', sort:input.sort || 'newest' };
  const groups = { saved:['completed','partial'], active:['pending','processing'], attention:['failed','invalid','needs_manual','partial'] };
  if (filters.group) {
    if (!Object.hasOwn(groups,filters.group)) throw new Error('记录分类无效。');
    where.push(`status IN (${groups[filters.group].map(()=>'?').join(',')})`); values.push(...groups[filters.group]);
  }
  if (filters.q.length > 300) throw new Error('搜索词最多 300 个字符。');
  if (filters.status && !Object.hasOwn(STATUS_NAMES, filters.status)) throw new Error('保存状态无效。');
  if (filters.site && !Object.hasOwn(SITE_NAMES, filters.site)) throw new Error('网站分类无效。');
  if (filters.q) {
    const literal = `%${filters.q.replace(/[\\%_]/g, c => '\\' + c)}%`;
    where.push(`(COALESCE(title,'') LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\' OR ${account} LIKE ? ESCAPE '\\' OR COALESCE(json_extract(metadata,'$.author'),'') LIKE ? ESCAPE '\\')`); values.push(literal,literal,literal,literal);
  }
  for (const [key, column] of [['status','status'],['site',site],['source','source'],['account',account]]) {
    if (filters[key]) { where.push(`${column}=?`); values.push(filters[key]); }
  }
  const start = date(filters.from), end = date(filters.to,true);
  if (start && end && start >= end) throw new Error('开始日期不能晚于结束日期。');
  if (start) { where.push('created_at>=?'); values.push(start); }
  if (end) { where.push('created_at<?'); values.push(end); }
  const orders = { newest:'created_at DESC,rowid DESC', oldest:'created_at,rowid', updated:'updated_at DESC,rowid DESC', title:"COALESCE(title,'') COLLATE NOCASE,rowid DESC" };
  if (!Object.hasOwn(orders,filters.sort)) throw new Error('排序方式无效。');
  const order = orders[filters.sort];
  const pageSize = integer(input.pageSize,50,1,100,'每页条数');
  let page = integer(input.page,1,1,MAX_RECORDS,'页码');
  const clause = where.length ? ' WHERE '+where.join(' AND ') : '';
  const matched = store.db.prepare('SELECT COUNT(*) AS n FROM jobs'+clause).get(...values).n;
  const accessible = Math.min(matched,MAX_RECORDS), pages = Math.max(1,Math.ceil(accessible/pageSize));
  page = Math.min(page,pages);
  const offset = (page-1)*pageSize, limit = Math.max(0,Math.min(pageSize,accessible-offset));
  const jobs = store.db.prepare(`SELECT * FROM jobs${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...values,limit,offset).map(row=>compactJob(store.decode(row)));
  const facet = (expression, names = {}) => store.db.prepare(`SELECT ${expression} AS value,COUNT(*) AS count FROM jobs GROUP BY value ORDER BY count DESC,value`).all().filter(row=>row.value).map(row=>({...row,label:names[row.value] || row.value}));
  return { jobs, matched, accessible, total:Object.values(store.stats()).reduce((a,b)=>a+b,0), page, pageSize, pages, maxRecords:MAX_RECORDS, capped:matched>MAX_RECORDS, filters,
    facets:{status:facet('status',STATUS_NAMES),site:facet(site,SITE_NAMES),source:facet('source',SOURCE_NAMES),account:facet(account)} };
}
