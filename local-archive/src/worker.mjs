import { archiveArticle, NeedsManualError } from './archive.mjs';

export class Worker {
  constructor(store, getConfig) { this.store = store; this.getConfig = getConfig; this.busy = false; this.stopped = false; this.timer = null; this.currentId = null; }
  start() { this.timer = setInterval(() => this.kick(), 1500); this.kick(); }
  kick() {
    if (!this.stopped) setImmediate(() => this.run());
  }
  async run() {
    if (this.busy || this.stopped) return;
    const job = this.store.next();
    if (!job) return;
    this.busy = true; this.currentId = job.id;
    this.store.update(job.id, { status: 'processing', stage: '准备保存', attempts: job.attempts + 1 });
    try {
      const result = await archiveArticle(job, structuredClone(this.getConfig()), stage => this.store.update(job.id, { stage }));
      this.store.update(job.id, { status: result.status, stage: result.status === 'completed' ? '保存完成' : '保存完成，请查看提示', title: result.title, output_dir: result.outputDir, metadata: result.metadata, error: null });
    } catch (error) {
      this.store.update(job.id, { status: error instanceof NeedsManualError ? 'needs_manual' : 'failed', stage: '保存未完成', error: error.message.slice(0, 900) });
    } finally { this.busy = false; this.currentId = null; this.kick(); }
  }
  stop() { this.stopped = true; clearInterval(this.timer); }
}
