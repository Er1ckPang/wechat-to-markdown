"""Reconnect missing job paths to their existing .history folders without moving files."""
from pathlib import Path
import sqlite3, json, hashlib

repo = Path(__file__).resolve().parents[2]
app = repo / 'local-archive'
config = json.loads((app / 'data/config.json').read_text(encoding='utf8'))
archives = Path(config['archiveDir']).resolve()
db = sqlite3.connect(app / 'data/jobs.sqlite', timeout=5)
repairs = []
try:
    for jid, old, raw in db.execute("SELECT id,output_dir,metadata FROM jobs WHERE output_dir IS NOT NULL AND status NOT IN ('pending','processing')").fetchall():
        previous = Path(old).resolve()
        if previous.exists() or not previous.is_relative_to(archives):
            continue
        candidate = (archives / '.history' / previous.relative_to(archives)).resolve()
        if not candidate.is_relative_to(archives / '.history') or not candidate.is_dir():
            continue
        metadata = json.loads(raw or '{}')
        checked = 0
        for filename, info in metadata.get('files', {}).items():
            file = (candidate / filename).resolve()
            if not file.is_relative_to(candidate) or file.stat().st_size != info['bytes']:
                raise RuntimeError('Historical file size/path mismatch')
            with file.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            if info.get('sha256') and digest != info['sha256']:
                raise RuntimeError('Historical file checksum mismatch')
            checked += 1
        if not checked:
            raise RuntimeError('Historical folder has no verifiable output files')
        db.execute('UPDATE jobs SET output_dir=? WHERE id=? AND output_dir=?', (str(candidate), jid, old))
        repairs.append({'id': jid, 'from': old, 'to': str(candidate), 'filesVerified': checked})
    db.commit()
finally:
    db.close()
report = {'recordsRepaired': len(repairs), 'repairs': repairs, 'articleContentModified': False}
(app / 'data/history-path-repair.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'recordsRepaired': len(repairs), 'filesVerified': sum(r['filesVerified'] for r in repairs), 'articleContentModified': False}))
