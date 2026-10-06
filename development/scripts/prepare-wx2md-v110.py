from pathlib import Path
import shutil
import zipfile

root = Path(__file__).resolve().parent.parent
old = root / 'outputs' / 'wx2md-local'
new = root / 'outputs' / 'wx2md-local-v1.1.0'
if new.exists():
    raise RuntimeError('New version directory already exists; inspect before replacing.')
new.mkdir()
excluded = {'node_modules', 'data', 'logs', 'archives', 'outputs', '.git', '.staging'}
for item in old.iterdir():
    if item.name in excluded:
        continue
    if item.is_dir():
        shutil.copytree(item, new / item.name)
    else:
        shutil.copy2(item, new / item.name)
# Restore the 1.0.0 source from the delivered, unchanged baseline package.
with zipfile.ZipFile(root / 'outputs' / 'wx2md-local.zip') as package:
    for entry in package.infolist():
        relative = Path(entry.filename).relative_to('wx2md-local')
        if not relative.parts or relative.parts[0] == 'third-party-source' or entry.is_dir():
            continue
        target = (old / relative).resolve()
        if not target.is_relative_to(old.resolve()):
            raise RuntimeError('Unexpected package path')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(package.read(entry))
print('Version 1.1.0 copied; version 1.0.0 application source restored. Existing data and articles retained.')
