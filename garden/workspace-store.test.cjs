const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {WorkspaceStore}=require('./workspace-store.cjs'),{saveSource}=require('./source-edit.cjs');
const key=crypto.randomBytes(32);
function encrypt(text){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]);}
function decrypt(bytes){const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');}
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'garden-workspace-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'workspace.bin');return {file,store:()=>new WorkspaceStore(file,encrypt,decrypt)};}
const state=()=>({id:'demo',name:'Example',folder:null,files:{'src/Main.kt':'fun main() {}'},catalog:[]});
test('edited snapshot survives a fresh store instance and repeated replacement',async t=>{
 const {file,store}=await fixture(t);assert.equal(await store().load(),null);
 const project=state();await store().save(project);
 await saveSource(project.files,null,{file:'src/Main.kt',expected:'fun main() {}',source:'fun main() { println("saved") }'});
 await store().save(project);
 assert.deepEqual(await store().load(),project);
 assert.equal((await fs.readFile(file)).includes(Buffer.from('println')),false);
});
test('encryption failure preserves the previous project',async t=>{
 const {file,store}=await fixture(t);await store().save(state());
 const failing=new WorkspaceStore(file,()=>{throw Error('unavailable');},decrypt);
 await assert.rejects(failing.save({...state(),name:'replacement'}),/unavailable/);
 assert.deepEqual(await store().load(),state());
});
test('damaged snapshot is reported without altering its contents',async t=>{
 const {file,store}=await fixture(t);const broken=Buffer.from('damaged');await fs.writeFile(file,broken);
 await assert.rejects(store().load());assert.deepEqual(await fs.readFile(file),broken);
});
test('unsafe paths cannot replace the saved workspace',async t=>{
 const {store}=await fixture(t);await store().save(state());
 for(const file of ['../outside.kt','/absolute.kt','C:/outside.kt','src\\outside.kt'])await assert.rejects(store().save({...state(),files:{[file]:'text'}}));
 assert.deepEqual(await store().load(),state());
});
