import { archiveArticle, NeedsManualError, InvalidArticleError } from './archive.mjs';
import { concurrency, CaptureSlot } from './limits.mjs';
import { recordFailure, friendlyError } from './diagnostics.mjs';

export class Worker {
  constructor(store, getConfig, { archive = archiveArticle, now = Date.now, startGap = 800, logFailure = recordFailure } = {}) {
    this.store = store; this.getConfig = getConfig; this.archive = archive; this.now = now; this.startGap = startGap;
    this.logFailure = logFailure;
    this.active = new Map(); this.hostReady = new Map(); this.captureSlot = new CaptureSlot();
    this.stopped = false; this.timer = null; this.wakeTimer = null; this.scheduled = false;
  }
  get busy() { return this.active.size > 0; }
  status() {
    return { active: this.active.size, concurrency: concurrency(this.getConfig().concurrency), screenshotActive: this.captureSlot.active,
      pausedHosts: [...this.hostReady].filter(([, at]) => at > this.now() + this.startGap).map(([host, at]) => ({ host, until: new Date(at).toISOString() })) };
  }
  start() { this.timer = setInterval(() => this.kick(), 1500); this.kick(); }
  kick() {
    if (this.stopped || this.scheduled) return;
    this.scheduled = true; setImmediate(() => { this.scheduled = false; this.run(); });
  }
  run() {
    if (this.stopped) return;
    clearTimeout(this.wakeTimer); this.wakeTimer = null;
    const limit = concurrency(this.getConfig().concurrency);
    let earliest = Infinity;
    for (const candidate of this.store.pending()) {
      if (this.active.size >= limit) break;
      const host = new URL(candidate.url).hostname;
      const onHost = [...this.active.values()].filter(job => new URL(job.url).hostname === host).length;
      if (onHost >= 2) continue;
      const ready = this.hostReady.get(host) || 0;
      if (ready > this.now()) { earliest = Math.min(earliest, ready); continue; }
      const job = this.store.claim(candidate.id);
      if (!job) continue;
      this.active.set(job.id, job); this.hostReady.set(host, this.now() + this.startGap);
      const config = structuredClone(this.getConfig());
      if (job.metadata?.verification_requested) config.showBrowser = true;
      this.process(job, config, host);
    }
    if (this.active.size < limit && earliest < Infinity) this.wakeTimer = setTimeout(() => this.kick(), Math.max(1, earliest - this.now()));
  }
  async process(job, config, host) {
    try {
      const result = await this.archive(job, config, stage => this.store.update(job.id, { stage }), { withCaptureSlot: callback => this.captureSlot.run(callback) });
      this.store.update(job.id, { status: result.status, stage: result.status === 'completed' ? '保存完成' : '保存完成，请查看提示', title: result.title, output_dir: result.outputDir, metadata: result.metadata, error: null });
    } catch (error) {
      if (error.retryAfterMs) this.hostReady.set(host, this.now() + error.retryAfterMs);
      const invalid = error instanceof InvalidArticleError;
      const failedStage = this.store.get(job.id).stage;
      await this.logFailure(job, error, failedStage).catch(() => {});
      this.store.update(job.id, { status: invalid ? 'invalid' : error instanceof NeedsManualError ? 'needs_manual' : 'failed',
        stage: invalid ? '文章链接已失效' : '保存未完成', error: friendlyError(error),
        metadata: { ...(job.metadata?.browser_import ? {browser_import:job.metadata.browser_import,browser_import_url:job.metadata.browser_import_url,migrations:job.metadata.migrations} : {}),...error.details, failure_stage: failedStage, link_state: invalid ? 'invalid' : error.details?.link_state || 'unknown' } });
    } finally { this.active.delete(job.id); this.kick(); }
  }
  stop() { this.stopped = true; clearInterval(this.timer); clearTimeout(this.wakeTimer); }
}
