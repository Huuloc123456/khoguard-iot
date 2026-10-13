import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { root, local } from './local-config.mjs';

// M16: runs every automated check in the order the services require and writes .local/verify-all.json.
// Needs the project broker and MySQL running; the normal backend, Vite and Wokwi ESP-C01 must be stopped. --skip=a,b skips named steps.
const skip=new Set((/^--skip=(.+)$/.exec(process.argv[2] ?? '')?.[1] ?? '').split(',').filter(Boolean));
const npm=process.platform==='win32' ? 'npm.cmd' : 'npm';
const results=[];
function run(name,command,args,timeout=300000) {
  if (skip.has(name)) {results.push({name,status:'skipped'});console.log(`- ${name}: bỏ qua (--skip)`);return Promise.resolve();}
  return new Promise(resolve=>{
    const started=Date.now(), child=spawn(command,args,{cwd:root,windowsHide:true,shell:process.platform==='win32'});
    let out='';child.stdout.on('data',d=>{out+=d;});child.stderr.on('data',d=>{out+=d;});
    const timer=setTimeout(()=>child.kill(),timeout);
    child.on('close',code=>{
      clearTimeout(timer);
      const lines=out.trim().split(/\r?\n/).filter(l=>!/^\s*$/.test(l)), summary=(lines.find(l=>/^# pass \d+/.test(l)) ?? lines.find(l=>/PASS|passed|fail/i.test(l) && !/^\s+at |Subtest/.test(l)) ?? lines.at(-1) ?? '').slice(0,200);
      results.push({name,status:code===0 ? 'pass':'fail',seconds:Math.round((Date.now()-started)/1000),summary});
      console.log(`- ${name}: ${code===0 ? 'ĐẠT':'LỖI'} (${Math.round((Date.now()-started)/1000)} s) ${summary}`);
      resolve();
    });
  });
}
const script=name=>[npm,['run','-s',name]];
async function withService(command,args,probe,work) {
  const child=spawn(command,args,{cwd:root,stdio:'ignore',windowsHide:true});
  try {
    const end=Date.now()+20000; while (Date.now()<end && !await probe()) await delay(300);
    await work();
  } finally {const e=once(child,'exit');child.kill('SIGINT');await e;}
}
const up=url=>()=>fetch(url,{signal:AbortSignal.timeout(1000)}).then(r=>r.ok,()=>false);
if (await up('http://127.0.0.1:3001/api/health')()) {console.error('Dừng backend đang chạy trước khi chạy verify:all.');process.exit(1);}
console.log('Kiểm tra toàn bộ KhoGuard (không in secret):');
await run('unit (npm test)',npm,['test','--silent']);
if (spawnSync('g++',['--version']).status===0) {
  const dir=mkdtempSync(join(tmpdir(),'kg-cpp-'));
  for (const [name,file,std] of [['firmware controller (C++)','controller_test.cpp','c++17'],['firmware safety M09–M11 (C++)','safety_test.cpp','gnu++11']])
    await run(name,process.platform==='win32' ? 'cmd' : 'sh',process.platform==='win32' ? ['/c',`g++ -std=${std} firmware/test/${file} -o ${join(dir,'t.exe')} && ${join(dir,'t.exe')}`] : ['-c',`g++ -std=${std} firmware/test/${file} -o ${join(dir,'t')} && ${join(dir,'t')}`]);
} else results.push({name:'firmware C++ tests',status:'skipped',summary:'g++ không có trên PATH'});
for (const name of ['infra:mqtt:check','infra:db:check','infra:tls:check']) await run(name,...script(name));
await withService(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5173','--strictPort'],up('http://127.0.0.1:5173/'),()=>run('infra:secrets:check',...script('infra:secrets:check')));
await withService(process.execPath,['--env-file=.local/runtime.env','server/start.mjs'],up('http://127.0.0.1:3001/api/ready'),async()=>{
  for (const name of ['backend:check','telemetry:check','events:check','control:check','auth:check','reservations:check','writefault:check','demo:scenarios']) await run(name,...script(name));
});
for (const name of ['recovery:check','reports:check','load:test']) await run(name,...script(name));
const failed=results.filter(r=>r.status==='fail');
writeFileSync(join(local,'verify-all.json'),JSON.stringify({checked_at:new Date().toISOString(),results},null,2));
console.log(failed.length ? `KẾT QUẢ: ${failed.length} bước lỗi: ${failed.map(f=>f.name).join(', ')}` : `KẾT QUẢ: ${results.filter(r=>r.status==='pass').length} bước đạt, ${results.filter(r=>r.status==='skipped').length} bỏ qua.`);
process.exitCode=failed.length ? 1 : 0;
