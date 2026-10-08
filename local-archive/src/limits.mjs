export const MAX_BATCH_SIZE = 100;
export const DEFAULT_CONCURRENCY = 2;
export const MAX_CONCURRENCY = 4;
export function validateBatch(urls) {
  if (urls.length > MAX_BATCH_SIZE) throw new Error(`每次最多提交 ${MAX_BATCH_SIZE} 个不同的文章链接，请拆分为多次提交。`);
  return urls;
}
export function concurrency(value = DEFAULT_CONCURRENCY) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > MAX_CONCURRENCY) throw new Error('并发保存数请选择 1 至 4 篇。');
  return result;
}
// Other jobs may fetch and generate MD/HTML while one job creates both long PNGs.
export class CaptureSlot {
  constructor() { this.active = 0; this.waiters = []; }
  async run(callback) {
    if (this.active) await new Promise(resolve => this.waiters.push(resolve)); else this.active = 1;
    try { return await callback(); }
    finally { const next = this.waiters.shift(); if (next) next(); else this.active = 0; }
  }
}
