from pathlib import Path
import json
from PIL import Image, ImageChops, ImageStat
Image.MAX_IMAGE_PIXELS=None
root=Path(__file__).resolve().parent.parent
report_path=root/'work/wx2md-v120-verification.json'
report=json.loads(report_path.read_text(encoding='utf-8'))
checks=[]
for profile in ('mobile','desktop'):
    points=[p for p in report['proofs'] if p['profile']==profile]
    with Image.open(points[0]['finalPng']) as source:
        source.load()
        for point in points:
            with Image.open(point['expected']) as expected:
                expected.load()
                height=min(point['height'],source.height-point['top'])
                actual=source.crop((0,point['top'],point['width'],point['top']+height)).convert('RGB')
                normal=expected.crop((point['left'],0,point['left']+point['width'],height)).convert('RGB')
                diff=ImageChops.difference(actual,normal)
                stat=ImageStat.Stat(diff)
                maximum=max(channel[1]for channel in diff.getextrema())
                channels=diff.split()
                maximum_channel=ImageChops.lighter(ImageChops.lighter(channels[0],channels[1]),channels[2])
                changed=sum(maximum_channel.histogram()[1:])
                fraction=changed/(point['width']*height)
                # Independent browser renders can differ by 1 LSB at isolated
                # antialiased pixels. Require all geometry and almost all pixels exact.
                assert maximum<=1 and fraction<0.00001,f'{profile} y={point["top"]} mismatch: max {maximum}, changed {changed}, mean {stat.mean}'
                checks.append({'profile':profile,'top':point['top'],'width':point['width'],'height':height,'maxPixelDifference':maximum,'changedPixels':changed,'changedFraction':fraction,'meanChannelDifference':stat.mean})
        # Inspectable crops of the source, never altering the archive PNG.
        sample=source.crop((0,0,source.width,min(source.height,2100)))
        sample.save(root/f'work/proof-v120/{profile}-top-native.png')
report['checks']['independentPixelSamples']=len(checks)
report['checks']['independentPixelMaxDifference']=max(c['maxPixelDifference']for c in checks)
report['independent_pixel_checks']=checks
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'samples':len(checks),'maxPixelDifference':report['checks']['independentPixelMaxDifference'],'profiles':{p:[c for c in checks if c['profile']==p]for p in ('mobile','desktop')}},ensure_ascii=False,indent=2))
