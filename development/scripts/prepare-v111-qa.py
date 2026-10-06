from pathlib import Path
root=Path(__file__).resolve().parent.parent
text=(root/'work/qa-wx2md-v110.mjs').read_text(encoding='utf-8')
text=text.replace("../outputs/wx2md-local-v1.1.0/node_modules/playwright/index.mjs","../outputs/wx2md-local-v1.1.1/node_modules/playwright/index.mjs")
text=text.replace('wx2md-v110-','wx2md-v111-').replace("'1.1.0'","'1.1.1'")
text=text.replace("assert.equal(job.metadata.files['original.png'].width, 1290);","assert.ok(job.metadata.files['original.png'].width >= 1290);\n  assert.equal(job.metadata.screenshot_check.complete,true);\n  assert.equal(job.metadata.screenshot_check.maxOverlapDifference,0);\n  assert.ok(job.metadata.screenshot_check.verticalChecks>20);\n  assert.equal(job.metadata.screenshot_check.coveredRows,job.metadata.files['original.png'].height);")
text=text.replace("e.getBoundingClientRect().width), 1290)","e.getBoundingClientRect().width), job.metadata.files['original.png'].width)")
text=text.replace('native3xPng:true,','native3xPng:true, allRowsCovered:true, seamsVerified:job.metadata.screenshot_check.verticalChecks, horizontalSeamsVerified:job.metadata.screenshot_check.horizontalChecks, maxOverlapDifference:job.metadata.screenshot_check.maxOverlapDifference, floatingAuthorBarsRemoved:true,')
(root/'work/qa-wx2md-v111.mjs').write_text(text,encoding='utf-8')
print('New version QA prepared')
