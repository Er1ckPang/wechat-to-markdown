from pathlib import Path
import json,zipfile,hashlib
root=Path(__file__).resolve().parent.parent
app=root/'outputs/wx2md-local-v1.2.1';outputs=root/'outputs'
excluded={'node_modules','data','logs','archives','outputs','.git','.staging'}
target_path=outputs/'wx2md-local-v1.2.1.zip'
with zipfile.ZipFile(target_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as target:
    for item in sorted(app.rglob('*')):
        relative=item.relative_to(app)
        if item.is_file() and not any(part in excluded for part in relative.parts):target.write(item,app.name+'/'+relative.as_posix())
    source=(app/'node_modules/single-file-core').resolve()
    for item in sorted(source.rglob('*')):
        if item.is_file():target.write(item,app.name+'/third-party-source/single-file-core/'+item.relative_to(source).as_posix())
with zipfile.ZipFile(target_path)as checked:
    names=checked.namelist();assert checked.testzip()is None
    assert json.loads(checked.read(app.name+'/package.json'))['version']=='1.2.1'
    assert not any('/data/'in n or '/archives/'in n or '/logs/'in n for n in names)
    for name in ['README.txt','public/guide.html','CHANGELOG.txt','src/archive.mjs','src/server.mjs','vendor/pngjs/LICENSE','LICENSE']:
        assert app.name+'/'+name in names
previous_files=0
with zipfile.ZipFile(outputs/'wx2md-local-v1.2.0.zip')as previous:
    for info in previous.infolist():
        if info.is_dir():continue
        item=outputs/info.filename
        if item.is_file() and not any(part in excluded for part in Path(info.filename).parts[1:]):
            assert item.read_bytes()==previous.read(info.filename),f'Previous source changed: {item}'
            previous_files+=1
for filename in ['screenshot.mjs','png-stream.mjs','html.mjs']:
    assert (app/'src'/filename).read_bytes()==(outputs/'wx2md-local-v1.2.0/src'/filename).read_bytes()
release={'version':'1.2.1','package':str(target_path),'bytes':target_path.stat().st_size,'sourceFiles':len(names),'sha256':hashlib.sha256(target_path.read_bytes()).hexdigest(),'v120SourceFilesUnchanged':previous_files,'screenshotAndHtmlComponentsUnchanged':True}
(root/'work/wx2md-v121-release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(release,ensure_ascii=False,indent=2))
