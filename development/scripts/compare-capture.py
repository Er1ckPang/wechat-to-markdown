from PIL import Image, ImageDraw, ImageChops, ImageStat
from pathlib import Path
import json
root=Path(__file__).resolve().parent.parent
reports=json.loads((root/'work/capture-diagnosis.json').read_text(encoding='utf-8'))
for report in reports:
    original=Image.open(report['png']).convert('RGB')
    board=Image.new('RGB',(860, len(report['samples'])*330),'#eef1e8')
    draw=ImageDraw.Draw(board)
    comparisons=[]
    for index,sample in enumerate(report['samples']):
        viewport=Image.open(sample['file']).convert('RGB')
        top=round(sample['y']*report['scale'])
        saved=original.crop((0,top,viewport.width,top+viewport.height))
        diff=ImageChops.difference(saved,viewport)
        comparison={'css_y':sample['y'],'mean_pixel_difference':ImageStat.Stat(diff).mean}
        comparisons.append(comparison)
        saved.thumbnail((410,295)); viewport.thumbnail((410,295))
        board.paste(saved,(10,index*330+25)); board.paste(viewport,(440,index*330+25))
        draw.text((10,index*330+7),f'Saved PNG, CSS y={sample["y"]}',fill='black')
        draw.text((440,index*330+7),'Normal viewport screenshot',fill='black')
    file=root/'work/capture-diagnosis'/f'{report["id"]}-comparison.jpg'
    board.save(file)
    print(json.dumps({'title':report['title'],'png_size':original.size,'comparisons':comparisons,'file':str(file)},ensure_ascii=False))
