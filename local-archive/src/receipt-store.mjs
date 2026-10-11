import { randomUUID } from 'node:crypto';

export const terminalStates = new Set(['completed','partial','invalid','needs_manual','failed']);

// Receipt subscriptions and the outbox use the same database transaction as
// inbound messages. A shared archive can serve several independent senders.
export class ReceiptStore {
  constructor(store) {
    this.store = store; this.db = store.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feishu_receipts (
        id TEXT PRIMARY KEY, source_message_id TEXT UNIQUE NOT NULL,
        app_id TEXT NOT NULL, reply_message_id TEXT NOT NULL, sender_id TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'waiting', rejection TEXT, created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
        last_error TEXT, sent_at TEXT);
      CREATE TABLE IF NOT EXISTS feishu_receipt_jobs (
        receipt_id TEXT NOT NULL, job_id TEXT NOT NULL, position INTEGER NOT NULL,
        reused INTEGER NOT NULL, PRIMARY KEY(receipt_id,position));
      CREATE INDEX IF NOT EXISTS receipt_jobs_job ON feishu_receipt_jobs(job_id);
      CREATE INDEX IF NOT EXISTS receipts_pending ON feishu_receipts(app_id,state,next_attempt_at);
      CREATE TABLE IF NOT EXISTS feishu_receipt_parts (
        receipt_id TEXT NOT NULL, position INTEGER NOT NULL, uuid TEXT UNIQUE NOT NULL,
        text TEXT NOT NULL, sent_message_id TEXT, PRIMARY KEY(receipt_id,position));
      UPDATE feishu_receipts SET state='pending' WHERE state='sending';
    `);
  }
  attach(messageId, details, jobs, rejection = null) {
    if (!details.appId || !details.replyMessageId || messageId !== 'feishu:' + details.replyMessageId) throw new Error('飞书回执缺少来源信息。');
    const id = randomUUID();
    this.db.prepare('INSERT INTO feishu_receipts(id,source_message_id,app_id,reply_message_id,sender_id,rejection,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(id,messageId,details.appId,details.replyMessageId,details.senderId || '',rejection,new Date().toISOString());
    jobs.forEach(({job,duplicate},position)=>this.db.prepare('INSERT INTO feishu_receipt_jobs VALUES(?,?,?,?)').run(id,job.id,position,Number(!!duplicate)));
    return id;
  }
  reject(messageId, details, reason) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare('SELECT id FROM received_messages WHERE id=?').get(messageId)) { this.db.exec('COMMIT'); return {duplicate:true}; }
      const id = this.attach(messageId,details,[],reason);
      this.db.prepare('INSERT INTO received_messages VALUES(?,?)').run(messageId,new Date().toISOString());
      this.db.exec('COMMIT'); return {duplicate:false,receiptId:id};
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  waiting(appId) {
    return this.db.prepare(`SELECT r.* FROM feishu_receipts r WHERE r.app_id=? AND r.state='waiting'
      AND (r.rejection IS NOT NULL OR NOT EXISTS (
        SELECT 1 FROM feishu_receipt_jobs s JOIN jobs j ON j.id=s.job_id
        WHERE s.receipt_id=r.id AND j.status NOT IN ('completed','partial','invalid','needs_manual','failed')))
      ORDER BY r.created_at,r.rowid LIMIT 20`).all(appId);
  }
  jobs(id) {
    return this.db.prepare('SELECT job_id,reused FROM feishu_receipt_jobs WHERE receipt_id=? ORDER BY position').all(id)
      .map(row=>({...this.store.get(row.job_id),reused:!!row.reused}));
  }
  freeze(id, jobs, texts) {
    if (!texts.length) throw new Error('回执内容为空。');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const ready = jobs.every(job=>{const current=this.store.get(job.id);return current && terminalStates.has(current.status) && current.updated_at===job.updated_at;});
      if (!ready || !this.db.prepare("UPDATE feishu_receipts SET state='pending' WHERE id=? AND state='waiting'").run(id).changes) {this.db.exec('COMMIT');return false;}
      texts.forEach((text,position)=>this.db.prepare('INSERT INTO feishu_receipt_parts VALUES(?,?,?,?,NULL)').run(id,position,randomUUID(),text));
      this.db.exec('COMMIT');return true;
    } catch(error) { this.db.exec('ROLLBACK');throw error; }
  }
  due(appId, now) { return this.db.prepare("SELECT * FROM feishu_receipts WHERE app_id=? AND state='pending' AND next_attempt_at<=? ORDER BY created_at,rowid LIMIT 20").all(appId,now); }
  claim(id) { return this.db.prepare("UPDATE feishu_receipts SET state='sending',attempts=attempts+1 WHERE id=? AND state='pending' RETURNING *").get(id); }
  parts(id) { return this.db.prepare('SELECT * FROM feishu_receipt_parts WHERE receipt_id=? ORDER BY position').all(id); }
  sentPart(id, position, messageId) { this.db.prepare('UPDATE feishu_receipt_parts SET sent_message_id=? WHERE receipt_id=? AND position=?').run(messageId,id,position); }
  sent(id) {
    if (this.parts(id).some(part=>!part.sent_message_id)) throw new Error('回执分段尚未全部送达。');
    this.db.prepare("UPDATE feishu_receipts SET state='sent',last_error=NULL,sent_at=? WHERE id=?").run(new Date().toISOString(),id);
  }
  failed(id, error, nextAttempt) { this.db.prepare("UPDATE feishu_receipts SET state='pending',last_error=?,next_attempt_at=? WHERE id=?").run(error,nextAttempt,id); }
  retry(appId) { this.db.prepare("UPDATE feishu_receipts SET next_attempt_at=0 WHERE app_id=? AND state='pending'").run(appId); }
  status(appId) {
    const counts=Object.fromEntries(this.db.prepare('SELECT state,count(*) AS count FROM feishu_receipts WHERE app_id=? GROUP BY state').all(appId).map(row=>[row.state,row.count]));
    return {waiting:counts.waiting || 0,pending:counts.pending || 0,sending:counts.sending || 0,sent:counts.sent || 0,
      lastError:this.db.prepare("SELECT last_error FROM feishu_receipts WHERE app_id=? AND state!='sent' AND last_error IS NOT NULL ORDER BY rowid DESC LIMIT 1").get(appId)?.last_error || '',
      lastSentAt:this.db.prepare('SELECT max(sent_at) AS at FROM feishu_receipts WHERE app_id=?').get(appId).at};
  }
}
