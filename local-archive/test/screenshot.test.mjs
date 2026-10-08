import test from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from '../src/browser.mjs';
import { PNG } from 'pngjs';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { captureScreenshot } from '../src/screenshot.mjs';

test('GIF/WebP/APNG 长图固定原像素首帧，原始动图字节不变，接缝和结尾完整', {timeout:120000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'wx2md-animation-test-')),browser=await launchBrowser();
 try{
  const page=await browser.newPage({viewport:{width:256,height:480},deviceScaleFactor:2});
  const originals=await Promise.all(['gif','webp','png'].map(async type=>({type,bytes:await readFile(new URL(`./fixtures/animated/two-frames.${type}`,import.meta.url))})));
  await writeFile(path.join(directory,'fixture.html'),`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>html,body{margin:0}img{width:256px;height:1024px;display:block}</style><div id="js_content">${originals.map(o=>`<img src="data:image/${o.type};base64,${o.bytes.toString('base64')}">`).join('')}<p id="end">完整结尾</p></div>`);
  await page.goto(pathToFileURL(path.join(directory,'fixture.html')).href);
  const result=await captureScreenshot(page,directory,[],2,()=>{},{stem:'animations',fitToViewport:true,singleFile:true});
  assert.equal(result.check.complete,true);assert.equal(result.check.layout.frozenAnimatedImages.length,3);assert.equal(result.check.maxOverlapDifference,0);assert.ok(result.check.verticalChecks>5);
  for(const record of result.check.layout.frozenAnimatedImages){assert.equal(record.frame,0);assert.equal(record.width,64);assert.equal(record.height,256);}
  const output=PNG.sync.read(await readFile(path.join(directory,result.files[0])));
  for(let y=100;y<6000;y+=180){const pixel=(y*output.width+240)*4;assert.deepEqual([...output.data.subarray(pixel,pixel+3)],[255,0,0],`第 ${y} 行应为首帧红色`);}
  for(const original of originals)assert.deepEqual(await readFile(new URL(`./fixtures/animated/two-frames.${original.type}`,import.meta.url)),original.bytes);
  assert.ok((await page.locator('#end').evaluate(e=>e.getBoundingClientRect().bottom))*2<=output.height);
 }finally{await browser.close();if(path.dirname(directory)===os.tmpdir()&&path.basename(directory).startsWith('wx2md-animation-test-'))await rm(directory,{recursive:true,force:true});}
});

test('超宽公式SVG等比例缩放，嵌套不换行代码完整换行，两种长图保持全部矢量与结尾', {timeout:120000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'wx2md-vector-test-'));const browser=await launchBrowser();
 try{
  for(const [stem,viewport]of Object.entries({mobile:{width:432,height:768},desktop:{width:1280,height:720}})){
   const page=await browser.newPage({viewport,deviceScaleFactor:2});
   const code='  const long_name = '+ 'long_identifier_'.repeat(50)+';';
   await page.setContent(`<style>html,body{margin:0}.rich_media_area_primary_inner{max-width:680px;width:calc(100% - 40px);margin:auto}#js_content{overflow:hidden}pre{padding:16px}pre code,pre span{white-space:pre!important}</style><main class="rich_media_area_primary_inner"><h1 id="activity-name">公式测试</h1><div id="js_content"><section data-formula="a+b" style="overflow:hidden"><svg id="wide-formula" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 200" style="width:2000px;height:200px;max-width:300%!important"><rect width="2000" height="200" fill="#235e43"/></svg></section><pre><code><span>${code}</span></code></pre><p id="late-layout" style="height:900px">中间段落</p><p id="end">全部正文结尾</p></div></main><script>setTimeout(()=>document.querySelector('#late-layout').style.height='1100px',250)</script>`);
   const result=await captureScreenshot(page,directory,[],2,()=>{},{stem,fitToViewport:true,cropToArticle:true,singleFile:true});
   assert.equal(result.check.complete,true);assert.equal(result.check.maxOverlapDifference,0);assert.equal(result.check.layout.fittedVectors,1);
   assert.equal(await page.locator('#late-layout').evaluate(e=>e.getBoundingClientRect().height),1100);
   const size=await page.locator('#wide-formula').evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,viewBox:e.getAttribute('viewBox'),page:document.documentElement.scrollWidth,content:document.querySelector('#js_content').clientWidth}));
   assert.ok(size.width<=size.content);assert.ok(Math.abs(size.width/size.height-10)<0.05);assert.equal(size.viewBox,'0 0 2000 200');assert.equal(size.page,viewport.width);
   assert.equal(await page.locator('pre').innerText(),code);assert.equal(await page.locator('pre span').evaluate(e=>getComputedStyle(e).whiteSpace),'pre-wrap');
   assert.ok((await page.locator('#end').evaluate(e=>e.getBoundingClientRect().bottom))*2<=result.check.pixelHeight);
   await page.close();
  }
 }finally{await browser.close();if(path.dirname(directory)===os.tmpdir()&&path.basename(directory).startsWith('wx2md-vector-test-'))await rm(directory,{recursive:true,force:true});}
});

test('逐屏拼接保留每段颜色和底部、去除悬浮作者栏、保留横向内容', {timeout:120000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'wx2md-pixel-test-'));
 const browser=await launchBrowser();
 try{
  const page=await browser.newPage({viewport:{width:170,height:900},deviceScaleFactor:3});
  const colors=Array.from({length:30},(_,i)=>[(i*41+19)%256,(i*67+31)%256,(i*29+43)%256]);
  const blocks=colors.map((color,i)=>`<div id="band-${i}" style="height:400px;background:rgb(${color.join(',')})">唯一内容 ${i}</div>`).join('');
  await page.setContent(`<style>html,body{margin:0}#js_content{width:170px}.wide{width:170px;overflow:auto}.inside{width:240px;height:80px;background:linear-gradient(to right,red,blue)}</style><header>正文顶部作者，只出现一次</header><aside id="floating" style="position:fixed;bottom:0;background:red;height:60px;width:100%">悬浮作者栏</aside><div id="js_content">${blocks}<div class="wide"><div class="inside"></div></div><p id="ending">完整正文结尾</p></div>`);
  const result=await captureScreenshot(page,directory,[],3);
  assert.equal(result.files.length,1);
  assert.equal(result.check.complete,true);
  assert.ok(result.check.pixelHeight>36000);
  assert.ok(result.check.pixelWidth>=720);
  assert.ok(result.check.verticalChecks>10);assert.ok(result.check.horizontalChecks>10);
  assert.equal(await page.locator('#floating').evaluate(e=>getComputedStyle(e).display),'none');
  const image=PNG.sync.read(await readFile(path.join(directory,result.files[0])));
  const points=await page.locator('[id^=band-]').evaluateAll(list=>list.map(e=>{const r=e.getBoundingClientRect();return {x:20,y:r.top+200};}));
  for(const [i,point]of points.entries()){
   const offset=(Math.round(point.y*3)*image.width+Math.round(point.x*3))*4;
   assert.deepEqual([...image.data.subarray(offset,offset+3)],colors[i],`正文块 ${i} 不应重复、错位或丢失`);
  }
  const ending=await page.locator('#ending').evaluate(e=>e.getBoundingClientRect().bottom);
  assert.ok(ending*3<=image.height);
  assert.equal(result.check.tiles[0].top,0);
  assert.equal(result.check.tiles.at(-1).bottom,image.height);
  for(let i=1;i<result.check.tiles.length;i++)assert.equal(result.check.tiles[i-1].bottom,result.check.tiles[i].top);
 }finally{
  await browser.close();
  const target=path.resolve(directory);
  if(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('wx2md-pixel-test-'))await rm(target,{recursive:true,force:true});
 }
});

test('手机与电脑分别排版，宽表格保留六列，裁掉电脑两侧页面空白', {timeout:120000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'wx2md-profile-test-'));
 const browser=await launchBrowser();
 try{
  const outputs={};
  for(const [profile,viewport]of Object.entries({mobile:{width:432,height:768},desktop:{width:1280,height:720}})){
   const page=await browser.newPage({viewport,deviceScaleFactor:2});
   await page.setContent(`<style>html,body{margin:0}.rich_media_area_primary_inner{max-width:677px;margin:20px auto;width:calc(100% - 40px)}table{width:800px;table-layout:fixed}td{min-width:120px;border:1px solid black}#js_content{overflow:hidden}p{margin:0;padding:0;height:900px;background:#9edabc}</style><main class="rich_media_area_primary_inner"><h1 id="activity-name">标题仅一次</h1><div id="js_content"><p>第一段</p><table><tr>${Array.from({length:6},(_,i)=>`<td>第 ${i+1} 列 LongUnbrokenContent</td>`).join('')}</tr></table><p>最后一段</p><div id="end">完整结尾</div></div></main><aside style="position:fixed;bottom:0">浮动作者栏</aside>`);
   const result=await captureScreenshot(page,directory,[],2,()=>{},{stem:profile,fitToViewport:true,cropToArticle:true,singleFile:true});
   outputs[profile]=result.check;
   assert.equal(result.check.complete,true);assert.equal(result.check.maxOverlapDifference,0);
   assert.equal(result.check.layout.fittedTables,1);
   const bounds=await page.locator('table').evaluate(e=>({right:e.getBoundingClientRect().right,contentRight:document.querySelector('#js_content').getBoundingClientRect().right,cells:e.rows[0].cells.length,scrollWidth:document.documentElement.scrollWidth}));
   assert.equal(bounds.cells,6);assert.ok(bounds.right<=bounds.contentRight+1);assert.equal(bounds.scrollWidth,viewport.width);
   const image=PNG.sync.read(await readFile(path.join(directory,result.files[0])));
   const point=await page.locator('p').first().evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.left+10,y:r.top+300};});
   const x=Math.round((point.x-result.check.layout.crop.left)*2),y=Math.round(point.y*2),index=(y*image.width+x)*4;
   assert.deepEqual([...image.data.subarray(index,index+3)],[158,218,188]);
   assert.ok((await page.locator('#end').evaluate(e=>e.getBoundingClientRect().bottom))*2<=image.height);
   await page.close();
  }
  assert.equal(outputs.mobile.pixelWidth,864);
  assert.equal(outputs.desktop.pixelWidth,1436);
  assert.ok(outputs.desktop.pixelWidth>outputs.mobile.pixelWidth);
 }finally{
  await browser.close();
  const target=path.resolve(directory);
  if(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('wx2md-profile-test-'))await rm(target,{recursive:true,force:true});
 }
});
