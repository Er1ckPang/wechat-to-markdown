from pathlib import Path
import shutil, json
root=Path(__file__).resolve().parent.parent
old=root/'outputs/wx2md-local-v1.1.0'; new=root/'outputs/wx2md-local-v1.1.1'
if new.exists(): raise RuntimeError('Version folder already exists')
new.mkdir()
for item in old.iterdir():
    if item.name in {'node_modules','data','archives','logs','.git','outputs','.staging'}: continue
    if item.is_dir(): shutil.copytree(item,new/item.name)
    else: shutil.copy2(item,new/item.name)
pkg=json.loads((new/'package.json').read_text(encoding='utf-8'))
pkg['version']='1.1.1'; pkg['dependencies']['pngjs']='file:vendor/pngjs'
(new/'package.json').write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
upstream=Path('${RUNTIME_DEPENDENCIES}/node/node_modules/pngjs')
vendored=new/'vendor/pngjs'; vendored.mkdir()
shutil.copytree(upstream/'lib',vendored/'lib')
for name in ['package.json','LICENSE','README.md']: shutil.copy2(upstream/name,vendored/name)
print('Created v1.1.1; v1.1.0 left unchanged. PNG library source and license included.')
