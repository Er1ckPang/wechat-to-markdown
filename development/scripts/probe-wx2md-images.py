from pathlib import Path
import json
from PIL import Image
root=Path.cwd()
r=json.loads((root/'work/wx2md-verification.json').read_text(encoding='utf-8'))
p=Path(r['actual_article']['outputDir'])
print(json.dumps([{'file':x.name,'size':list(Image.open(x).size)} for x in (p/'images').iterdir()],ensure_ascii=True))
print('html bytes', (p/'original.html').stat().st_size)
