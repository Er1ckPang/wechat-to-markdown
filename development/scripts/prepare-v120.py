from pathlib import Path
import shutil, json
root=Path(__file__).resolve().parent.parent
old=root/'outputs/wx2md-local-v1.1.1'; new=root/'outputs/wx2md-local-v1.2.0'
if new.exists(): raise RuntimeError('Version folder already exists')
new.mkdir()
for item in old.iterdir():
    if item.name in {'node_modules','data','archives','logs','.git','outputs','.staging'}: continue
    if item.is_dir(): shutil.copytree(item,new/item.name)
    else: shutil.copy2(item,new/item.name)
pkg=json.loads((new/'package.json').read_text(encoding='utf-8'))
pkg['version']='1.2.0'
(new/'package.json').write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
notice=new/'THIRD_PARTY_NOTICES.txt'
notice.write_text(notice.read_text(encoding='utf-8').replace('wx2md Local 1.1.1','wx2md Local 1.2.0'),encoding='utf-8')
print('Created separate v1.2.0 source directory. Existing versions unchanged.')
