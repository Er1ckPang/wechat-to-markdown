import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { captureScreenshot } from '../src/screenshot.mjs';

test('逐屏拼接保留每段颜色和底部、去除悬浮作者栏、保留横向内容', {timeout:120000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'wx2md-pixel-test-'));
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':'chrome',headless:true});
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
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':'chrome',headless:true});
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
