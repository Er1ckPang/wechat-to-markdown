from pathlib import Path
import json,zipfile,hashlib,shutil,os,stat
repo=Path(__file__).resolve().parents[2];workspace=repo.parent.parent
history=workspace/'history';history.mkdir(exist_ok=True)
archive=history/'development-history-2026-09-30-to-2026-10-06.zip'
versions=['wx2md-local','wx2md-local-v1.1.0','wx2md-local-v1.1.1','wx2md-local-v1.2.0','wx2md-local-v1.2.1']
directories=[workspace/'outputs'/version for version in versions]+[workspace/'work']
extras=[workspace/'development-archive-preparation.json']+sorted(p for p in (workspace/'outputs').iterdir()if p.is_file())
excluded={'node_modules','__pycache__'}
entries=[]
def digest(data):return hashlib.sha256(data).hexdigest()
def check_target(p):
    p=p.resolve()
    allowed={str((workspace/'outputs'/version).resolve())for version in versions}|{str((workspace/'work').resolve())}
    if str(p)not in allowed or p==repo.resolve()or p in repo.resolve().parents:raise RuntimeError('Unsafe historical directory target')
    return p
for directory in directories:check_target(directory)
if archive.exists():
    # Resume cleanup from a fully verified manifest; never overwrite an archive.
    with zipfile.ZipFile(archive)as saved:
        manifest=json.loads(saved.read('ARCHIVE_MANIFEST.json'))
        if manifest.get('currentRelease')!='v1.0.0.p' or not manifest.get('privateArchive'):
            raise RuntimeError('Unexpected historical archive identity')
        entries=manifest['entries']
else:
 with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=3)as target:
    for directory in directories:
        for folder,children,files in os.walk(directory):
            children[:]=[name for name in children if name not in excluded]
            for name in sorted(files):
                p=Path(folder)/name;relative=p.relative_to(workspace).as_posix();data=p.read_bytes()
                target.writestr(relative,data,compress_type=zipfile.ZIP_STORED if p.suffix.lower()in {'.png','.jpg','.jpeg','.gif','.webp','.zip','.avif'}else zipfile.ZIP_DEFLATED)
                entries.append({'path':relative,'bytes':len(data),'sha256':digest(data)})
    for p in extras:
        data=p.read_bytes();relative=p.relative_to(workspace).as_posix();target.writestr(relative,data);entries.append({'path':relative,'bytes':len(data),'sha256':digest(data)})
    manifest={'createdOn':'2026-10-06','currentRelease':'v1.0.0.p','privateArchive':True,'excludes':['reinstallable node_modules','Python __pycache__'],'entries':entries}
    target.writestr('ARCHIVE_MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2).encode())
    target.writestr('READ_ME_FIRST.txt','私有开发历史归档。包含原研究、脚本、诊断、验证、旧代码、旧配置和文章；仅留本机，不上传 GitHub。\nARCHIVE_MANIFEST.json 记录每个保存文件的字节数和 SHA-256。\n当前可运行版本位于 outputs/wx2md-local-v1.0.0.p/local-archive，当前 README 和开发记录在仓库根目录。\n依赖缓存可通过锁文件重装。\n'.encode())
with zipfile.ZipFile(archive)as saved:
    assert saved.testzip()is None
    for item in entries:
        data=saved.read(item['path'])
        if len(data)!=item['bytes']or digest(data)!=item['sha256']:raise RuntimeError('Compressed file verification failed')
# Any surviving source must still match its saved entry before resumed deletion.
entry_by_path={item['path']:item for item in entries}
for directory in directories:
    for folder,children,files in os.walk(directory):
        children[:]=[name for name in children if name not in excluded]
        for name in files:
            p=Path(folder)/name;item=entry_by_path.get(p.relative_to(workspace).as_posix())
            if not item or digest(p.read_bytes())!=item['sha256']:
                raise RuntimeError('Historical source changed after compression')
for p in extras:
    if not p.exists():continue
    item=entry_by_path.get(p.relative_to(workspace).as_posix())
    if not item or digest(p.read_bytes())!=item['sha256']:
        raise RuntimeError('Historical loose file changed after compression')
# Keep the original release ZIPs separately and untouched, then remove their loose copies.
for p in extras:
    if p.suffix=='.zip':
        destination=history/p.name
        if not destination.exists():shutil.copy2(p,destination)
        if digest(p.read_bytes())!=digest(destination.read_bytes()):raise RuntimeError('Source release ZIP copy mismatch')
record={'release':'v1.0.0.p','historicalArchive':archive.name,'archiveBytes':archive.stat().st_size,'filesVerified':len(entries),'oldFoldersRemoved':versions+['work'],'releaseZipCount':len(list(history.glob('wx2md-local*.zip')))}
# Deletion is confined to the exact verified old workspace directories, after ZIP verification.
def remove_readonly(function,target,error):
    resolved=Path(target).resolve()
    if not any(resolved.is_relative_to(check_target(directory))for directory in directories):
        raise RuntimeError('Unsafe readonly cleanup target')
    if not isinstance(error,PermissionError):raise error
    os.chmod(resolved,stat.S_IREAD|stat.S_IWRITE)
    function(target)
for directory in directories:
    checked=check_target(directory)
    if checked.exists():shutil.rmtree(checked,onexc=remove_readonly)
for p in extras:
    if not p.exists():continue
    resolved=p.resolve()
    if resolved.parent not in {workspace.resolve(),(workspace/'outputs').resolve()}or not resolved.is_file():raise RuntimeError('Unsafe loose-file cleanup target')
    resolved.unlink()
(repo/'local-archive/data/history-archive.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(record))
