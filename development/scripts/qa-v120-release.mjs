import {chromium} from '../outputs/wx2md-local-v1.2.0/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 for(const url of ['http://127.0.0.1:17880/','http://127.0.0.1:17880/guide.html',pathToFileURL(fileURLToPath(new URL('../outputs/wx2md-v1.2.0-验证记录.html',import.meta.url))).href]){
  await page.goto(url);if(url.endsWith('17880/')){await page.locator('#service-version').getByText('正在运行 · v1.2.0',{exact:true}).waitFor();await page.getByRole('button',{name:'保存设置',exact:true}).click();}
  const size=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));assert.ok(size.width<=size.viewport+1,JSON.stringify({url,size}));
 }
 const app=fileURLToPath(new URL('../outputs/wx2md-local-v1.2.0/',import.meta.url));
 const health=await(await page.request.get('http://127.0.0.1:17880/health')).json();assert.equal(health.version,'1.2.0');assert.ok(health.root.includes('wx2md-local-v1.2.0'));
 assert.deepEqual(errors,[]);
 await writeFile(new URL('./wx2md-v120-release-ui.json',import.meta.url),JSON.stringify({mobileUi:true,mobileGuide:true,mobileReport:true,errors,health},null,2));
 console.log('Release, guide and settings fit 390 px mobile screen; live service v1.2.0; no UI errors.');
}finally{await browser.close();}
