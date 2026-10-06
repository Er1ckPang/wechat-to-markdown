"""Write the public, data-free baseline manifest from verified local ledgers."""
from pathlib import Path
import hashlib,json,re,zipfile

repo=Path(__file__).resolve().parents[2]
workspace=repo.parent.parent
app=repo/'local-archive'
history=json.loads((app/'data/history-archive.json').read_text(encoding='utf-8'))
verification=json.loads((app/'data/baseline-verification.json').read_text(encoding='utf-8'))
archive=workspace/'history'/history['historicalArchive']
with archive.open('rb')as source:
    archive_hash=hashlib.file_digest(source,'sha256').hexdigest()
record={
    'release':'v1.0.0.p','date':'2026-10-06','displayVersion':'1.0.0.p',
    'npmVersion':'1.0.0-p','functionalBaseline':'wx2md Local v1.2.1',
    'repository':'https://github.com/Er1ckPang/wechat-to-markdown',
    'branch':'dev_p','tag':'v1.0.0.p',
    'upstreamBaseCommit':'68b7337ae246e6ab328e16961dcd500ff7297466',
    'commitIdentity':'Resolve the annotated Git tag; no self-referential commit hash is stored in this file.',
    'validation':{'upstreamTestsPassed':45,'localTestsPassed':6,'upstreamBuild':'passed','postCleanupRuntime':verification},
    'privateHistory':{key:history[key]for key in ['historicalArchive','archiveBytes','filesVerified','releaseZipCount']},
    'excludedFromGit':['local-archive/data/','local-archive/archives/','local-archive/logs/','real article content','credentials','private historical ZIPs','node_modules/','dist/'],
}
record['privateHistory']['sha256']=archive_hash
(repo/'development/release-manifest.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with zipfile.ZipFile(archive)as saved:
    text=saved.read('work/prepare-personal-baseline.py').decode('utf-8')
    for value in [str(workspace),str(workspace).replace('\\','/')]:text=text.replace(value,'${WORKSPACE}')
    text=re.sub(r'C:(?:\\+|/+)Users(?:\\+|/+)hwblue2026(?:\\+|/+)','${USER_HOME}/',text,flags=re.I)
    text=re.sub(r'gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}','[GitHub credential removed]',text)
    (repo/'development/scripts/prepare-personal-baseline.py').write_text(text,encoding='utf-8')
print(json.dumps({'publicManifest':'development/release-manifest.json','historicalFilesVerified':history['filesVerified']}))
