const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {sourcePath,revealFile}=require('./reveal-file.cjs');
test('local files resolve to the original, snapshots contain the latest saved code',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'garden-reveal-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const files={'src/My File.kt':'original'};await fs.mkdir(path.join(root,'src'));await fs.writeFile(path.join(root,'src','My File.kt'),'on disk');
 const target=await sourcePath(files,root,'src/My File.kt');assert.equal(await fs.readFile(target,'utf8'),'on disk');
 const snapshot=await fs.mkdtemp(path.join(root,'snapshot-'));
 const copy=await sourcePath(files,null,'src/My File.kt',snapshot);assert.equal(await fs.readFile(copy,'utf8'),'original');
 files['src/My File.kt']='edited';assert.equal(await sourcePath(files,null,'src/My File.kt',snapshot),copy);assert.equal(await fs.readFile(copy,'utf8'),'edited');
 await assert.rejects(sourcePath({'../outside.kt':'bad'},null,'../outside.kt',snapshot));
 await assert.rejects(sourcePath(files,root,'missing.kt'));
});
test('Explorer selection waits for confirmation and reports a missing selection',async()=>{
 const target='C:\\Проекты\\My Project\\Main.kt';let finish;
 const selection=revealFile(target,null,{platform:'win32',launch:async(_command,args)=>{
   assert.equal(args.at(-1),target);
   await new Promise(resolve=>{finish=resolve;});
   throw Object.assign(Error('Selection timed out'),{code:4});
 }});
 const rejected=assert.rejects(selection,/не подтвердил выделение/);
 finish();await rejected;
});
