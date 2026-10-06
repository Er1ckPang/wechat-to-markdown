from pathlib import Path
from PIL import Image,ImageChops,ImageStat,ImageDraw
import json
root=Path(__file__).resolve().parent.parent
folder=root/'work/capture-v111-proof'; report=json.loads((folder/'proof.json').read_text(encoding='utf-8'))
image=Image.open(folder/report['files'][0]).convert('RGB')
board=Image.new('RGB',(840,320*len(report['samples'])),'#eef1e8');draw=ImageDraw.Draw(board)
checks=[]
for index,sample in enumerate(report['samples']):
    expected=Image.open(sample['file']).convert('RGB')
    x=round(sample['x']*3);y=round(sample['y']*3)
    actual=image.crop((x,y,x+expected.width,y+expected.height))
    difference=ImageStat.Stat(ImageChops.difference(actual,expected)).mean
    checks.append({'x':sample['x'],'y':sample['y'],'mean_difference':difference})
    assert max(difference)<0.05,checks[-1]
    actual.thumbnail((400,290));expected.thumbnail((400,290))
    board.paste(actual,(10,index*320+22));board.paste(expected,(430,index*320+22))
    draw.text((10,index*320+5),f'Corrected PNG, y={sample["y"]}',fill='black')
    draw.text((430,index*320+5),'Normal viewport, pixel match',fill='black')
board.save(folder/'comparison.jpg')
(folder/'pixel-check.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
print(json.dumps({'size':image.size,'samples':checks},ensure_ascii=False))
