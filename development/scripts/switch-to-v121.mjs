import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const next=path.join(root,'outputs/wx2md-local-v1.2.1');
const base='http://127.0.0.1:17880';
const health=await (await fetch(base+'/health')).json();
if(health.app!=='wx2md-local'||health.version!=='1.2.0')throw new Error('Expected v1.2.0 before migration');
const token=(await(await fetch(base+'/api/session')).json()).token;
const headers={'X-Wx2md-Token':token};
const status=await(await fetch(base+'/api/status',{headers})).json();
if(status.busy||status.jobs.some(j=>['pending','processing'].includes(j.status)))throw new Error('Wait for current tasks before migration');
const original=path.resolve(health.root);
if(original!==path.join(root,'outputs/wx2md-local-v1.2.0'))throw new Error('Unexpected original service directory');
try{await stat(path.join(next,'data/jobs.sqlite'));throw new Error('New version already has data; refusing overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(new URL('./wx2md-v121-migration-records.json',import.meta.url),JSON.stringify(status.jobs.map(j=>({id:j.id,outputDir:j.output_dir,status:j.status})),null,2));
const stopped=await fetch(base+'/api/stop',{method:'POST',headers});if(!stopped.ok)throw new Error('Could not stop original service');
for(let i=0;i<40;i++){
 await new Promise(r=>setTimeout(r,250));
 try{await fetch(base+'/health');}catch{break;}
 if(i===39)throw new Error('Original service still running');
}
const oldData=path.join(original,'data');
try{const wal=await stat(path.join(oldData,'jobs.sqlite-wal'));if(wal.size)throw new Error('Database WAL still contains changes; stop not complete');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(path.join(next,'data'),{recursive:true});
const config=JSON.parse(await readFile(path.join(oldData,'config.json'),'utf8'));
if(path.resolve(config.archiveDir)===path.join(original,'archives'))config.archiveDir=path.join(next,'archives');
delete config.width;
await writeFile(path.join(next,'data/config.json'),JSON.stringify(config,null,2),{mode:0o600});
await copyFile(path.join(oldData,'jobs.sqlite'),path.join(next,'data/jobs.sqlite'));
console.log(JSON.stringify({from:health.version,to:'1.2.1',recordsPreserved:status.jobs.length,archiveDir:config.archiveDir,oldServiceStopped:true,settingsCopied:true}));
