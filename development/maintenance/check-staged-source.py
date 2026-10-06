"""Check staged source without printing credentials or personal config."""
from pathlib import Path
import json,re,subprocess

repo=Path(__file__).resolve().parents[2]
config=json.loads((repo/'local-archive/data/config.json').read_text(encoding='utf-8'))
private_values=[]
def collect(value):
    if isinstance(value,dict):
        for key,item in value.items():
            if isinstance(item,str)and len(item)>=8 and re.search(r'secret|token|password|app.?id',key,re.I):private_values.append(item.encode())
            collect(item)
    elif isinstance(value,list):
        for item in value:collect(item)
collect(config)
files=subprocess.check_output(['git','diff','--cached','--name-only','--diff-filter=ACMR','-z'],cwd=repo).decode().split('\0')
files=[name for name in files if name]
failures=[]
for name in files:
    if name.startswith(('local-archive/data/','local-archive/archives/','local-archive/logs/'))or any(part in {'node_modules','dist'}for part in Path(name).parts)or re.search(r'\.sqlite(?:-shm|-wal)?$|(?:^|/)\.env(?:\.|$)',name):
        failures.append({'file':name,'reason':'private runtime file'});continue
    data=subprocess.check_output(['git','show',':'+name],cwd=repo)
    if re.search(rb'gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}',data)or any(value in data for value in private_values):
        failures.append({'file':name,'reason':'credential match'})
print(json.dumps({'stagedFilesChecked':len(files),'violations':failures}))
if failures:raise SystemExit(1)
