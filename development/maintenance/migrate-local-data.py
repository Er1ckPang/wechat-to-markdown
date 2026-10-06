from pathlib import Path
import json,shutil,sqlite3,urllib.request,time,hashlib
repo=Path(__file__).resolve().parents[2];workspace=repo.parent.parent
app=repo/'local-archive';old=workspace/'outputs/wx2md-local-v1.2.1'
base='http://127.0.0.1:17880'
def api(url,token=None,data=None):
    headers={'Content-Type':'application/json'}
    if token:headers['X-Wx2md-Token']=token
    request=urllib.request.Request(base+url,headers=headers,data=None if data is None else json.dumps(data).encode())
    with urllib.request.urlopen(request,timeout=10)as response:return json.load(response)
health=api('/health')
if health['version']!='1.2.1' or Path(health['root']).resolve()!=old.resolve():raise RuntimeError('Unexpected current runtime')
token=api('/api/session')['token'];status=api('/api/status',token)
if status['busy']or any(j['status']in ('pending','processing')for j in status['jobs']):raise RuntimeError('Wait for the queue to become idle before data migration')
if(app/'data/jobs.sqlite').exists():raise RuntimeError('Target database already exists; refusing overwrite')
api('/api/stop',token,{})
for i in range(40):
    time.sleep(.25)
    try:api('/health')
    except Exception:break
else:raise RuntimeError('Old service did not stop')
wal=old/'data/jobs.sqlite-wal'
if wal.exists()and wal.stat().st_size:raise RuntimeError('SQLite WAL not fully closed')
(app/'data').mkdir(parents=True)
shutil.copy2(old/'data/jobs.sqlite',app/'data/jobs.sqlite')
config=json.loads((old/'data/config.json').read_text(encoding='utf-8'))
if Path(config['archiveDir']).resolve()==(old/'archives').resolve():config['archiveDir']=str(app/'archives')
(app/'data/config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
versions=['wx2md-local','wx2md-local-v1.1.0','wx2md-local-v1.1.1','wx2md-local-v1.2.0','wx2md-local-v1.2.1']
mapping={};file_count=0;byte_count=0
def sha(p):
    h=hashlib.sha256()
    with p.open('rb')as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
for version in versions:
    source=workspace/'outputs'/version/'archives'
    if not source.exists():continue
    for account in sorted(source.iterdir()):
        if not account.is_dir()or account.name.startswith('.'):continue
        for article in sorted(account.iterdir()):
            if not article.is_dir():continue
            article=article.resolve()
            if source.resolve()not in article.parents:raise RuntimeError('Article path escapes source archive')
            target=app/'archives'/account.name/article.name
            if target.exists():raise RuntimeError('Duplicate archive destination; refusing overwrite')
            shutil.copytree(article,target)
            for item in article.rglob('*'):
                if item.is_file():
                    copy=target/item.relative_to(article)
                    if item.stat().st_size!=copy.stat().st_size or sha(item)!=sha(copy):raise RuntimeError('Archive copy verification failed')
                    file_count+=1;byte_count+=copy.stat().st_size
            mapping[str(article)]=str(target.resolve())
with sqlite3.connect(app/'data/jobs.sqlite')as db:
    jobs=db.execute('SELECT id,status,output_dir FROM jobs').fetchall();updated=0
    for identity,state,directory in jobs:
        if not directory:continue
        resolved=str(Path(directory).resolve())
        if resolved in mapping:
            db.execute('UPDATE jobs SET output_dir=? WHERE id=?',(mapping[resolved],identity));updated+=1
        elif any(Path(directory).resolve().is_relative_to((workspace/'outputs'/v).resolve())for v in versions):
            raise RuntimeError('Task references an unmigrated historical article')
        elif not Path(directory).is_dir():raise RuntimeError('Existing external archive directory missing')
    db.commit()
    if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Database integrity check failed')
record={'from':'1.2.1','to':'1.0.0.p','jobs':len(jobs),'pathsUpdated':updated,'articleDirectoriesCopied':len(mapping),'filesVerified':file_count,'bytesCopied':byte_count,'sourceToDestination':mapping,'oldArchivesPreservedUntilCompression':True}
(app/'data/reorganization.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in record.items()if k!='sourceToDestination'}))
