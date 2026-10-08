import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { articleUrl, articleKey } from './urls.mjs';
import { validateBatch } from './limits.mjs';
import { queryRecords, compactJob } from './record-query.mjs';

export class Store {
  constructor(filename) {
    mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, article_key TEXT NOT NULL, url TEXT NOT NULL,
        source TEXT NOT NULL, source_message_id TEXT, status TEXT NOT NULL,
        stage TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, title TEXT, output_dir TEXT,
        metadata TEXT, error TEXT);
      CREATE INDEX IF NOT EXISTS jobs_key ON jobs(article_key);
      CREATE INDEX IF NOT EXISTS jobs_created ON jobs(created_at);
      CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs(status,created_at);
      CREATE TABLE IF NOT EXISTS received_messages (id TEXT PRIMARY KEY, received_at TEXT NOT NULL);
    `);
    this.db.prepare("UPDATE jobs SET status='pending', stage='重新启动后继续保存', updated_at=? WHERE status='processing'").run(new Date().toISOString());
  }

  enqueue(url, source = 'manual', messageId = '', force = false) {
    url = articleUrl(url);
    const key = articleKey(url);
    if (!force) {
      const existing = this.db.prepare("SELECT * FROM jobs WHERE article_key=? AND status IN ('pending','processing','completed','partial') ORDER BY created_at DESC LIMIT 1").get(key);
      if (existing) return { job: this.decode(existing), duplicate: true };
    }
    const id = randomUUID(); const time = new Date().toISOString();
    this.db.prepare('INSERT INTO jobs(id,article_key,url,source,source_message_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, key, url, source, messageId, 'pending', time, time);
    return { job: this.get(id), duplicate: false };
  }

  enqueueMessage(messageId, urls, source) {
    validateBatch(urls);
    if (!messageId) throw new Error('消息缺少唯一 ID。');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare('SELECT id FROM received_messages WHERE id=?').get(messageId)) {
        this.db.exec('COMMIT'); return { duplicate: true, jobs: [] };
      }
      const jobs = urls.map(url => this.enqueue(url, source, messageId));
      this.db.prepare('INSERT INTO received_messages VALUES(?,?)').run(messageId, new Date().toISOString());
      this.db.exec('COMMIT'); return { duplicate: false, jobs };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  decode(row) { return row ? { ...row, metadata: row.metadata ? JSON.parse(row.metadata) : null } : null; }
  get(id) { return this.decode(this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id)); }
  enqueueBatch(urls, force = false) {
    validateBatch(urls); this.db.exec('BEGIN IMMEDIATE');
    try { const results = urls.map(url => this.enqueue(url, 'manual', '', force)); this.db.exec('COMMIT'); return results; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  list(limit = 300) { return this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit).map(row => this.decode(row)); }
  records(filters = {}) { return queryRecords(this, filters); }
  active() { return this.db.prepare("SELECT * FROM jobs WHERE status IN ('processing','pending') ORDER BY CASE status WHEN 'processing' THEN 0 ELSE 1 END,created_at,rowid LIMIT 12").all().map(row=>compactJob(this.decode(row))); }
  stats() { return Object.fromEntries(this.db.prepare('SELECT status, COUNT(*) AS count FROM jobs GROUP BY status').all().map(row => [row.status, row.count])); }
  pending() { return this.db.prepare("SELECT * FROM jobs WHERE status='pending' ORDER BY created_at, rowid").all().map(row => this.decode(row)); }
  claim(id) { return this.decode(this.db.prepare("UPDATE jobs SET status='processing', stage='准备保存', attempts=attempts+1, updated_at=? WHERE id=? AND status='pending' RETURNING *").get(new Date().toISOString(), id)); }
  next() { return this.decode(this.db.prepare("SELECT * FROM jobs WHERE status='pending' ORDER BY created_at LIMIT 1").get()); }
  update(id, fields) {
    const allowed = ['status', 'stage', 'attempts', 'title', 'output_dir', 'metadata', 'error'];
    const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
    entries.push(['updated_at', new Date().toISOString()]);
    this.db.prepare(`UPDATE jobs SET ${entries.map(([key]) => key + '=?').join(',')} WHERE id=?`)
      .run(...entries.map(([key, value]) => key === 'metadata' ? JSON.stringify(value) : value ?? null), id);
    return this.get(id);
  }
  retry(id) {
    const job = this.get(id);
    if (!job) throw new Error('任务不存在。');
    if (['pending', 'processing'].includes(job.status)) throw new Error('这个任务正在等待或保存中。');
    return this.update(id, { status: 'pending', stage: '准备重新保存', error: null, ...(job.status === 'invalid' ? { metadata: null } : {}) });
  }
  close() { this.db.close(); }
}
