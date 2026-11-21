const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require.resolve('./workbench.js'),'utf8').split('function persistSourceDrafts(){')[1];
function editor(storage,project='demo',source=async()=>'original'){
 const context={restoringSources:false,draftProjectId:project,sourceDrafts:new Map(),tabFiles:new Map(),editingFiles:new Set(),projectGeneration:1,
   localStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k),getItem:k=>storage.get(k)??null},
   read:(k,fallback)=>JSON.parse(storage.get(k)??JSON.stringify(fallback)),garden:{source},note:()=>{},openFile:async file=>{context.opened=file;}};
 vm.createContext(context);vm.runInContext('function persistSourceDrafts(){'+code,context);return context;
}
test('editor draft survives restart and preserves its original version for conflict detection',async()=>{
 const storage=new Map(),first=editor(storage);first.tabFiles.set('Main.kt','original');first.sourceDrafts.set('Main.kt','edited');
 assert.equal(first.persistSourceDrafts(),true);
 const restarted=editor(storage,'demo',async()=>'externally changed');await restarted.restoreSourceDrafts(['Main.kt'],1);
 assert.equal(restarted.sourceDrafts.get('Main.kt'),'edited');assert.equal(restarted.tabFiles.get('Main.kt'),'original');assert.equal(restarted.opened,'Main.kt');
 const otherProject=editor(storage,'other');await otherProject.restoreSourceDrafts(['Main.kt'],1);assert.equal(otherProject.sourceDrafts.size,0);
 restarted.sourceDrafts.clear();restarted.persistSourceDrafts();assert.equal(storage.has('garden.sourceDrafts.demo'),false);
});
test('closing during restoration does not erase stored drafts and stale reads cannot enter another project',async()=>{
 const storage=new Map(),first=editor(storage);first.tabFiles.set('Main.kt','original');first.sourceDrafts.set('Main.kt','edited');first.persistSourceDrafts();
 let resolve;const loading=editor(storage,'demo',()=>new Promise(r=>resolve=r));loading.restoringSources=true;
 loading.persistSourceDrafts();assert.equal(storage.has('garden.sourceDrafts.demo'),true);
 const pending=loading.restoreSourceDrafts(['Main.kt'],1);loading.projectGeneration=2;resolve('original');await pending;
 assert.equal(loading.sourceDrafts.size,0);
});
test('storage quota failure leaves the draft available in the editor',()=>{
 const current=editor(new Map());current.tabFiles.set('Main.kt','original');current.sourceDrafts.set('Main.kt','edited');
 current.localStorage.setItem=()=>{throw Error('quota');};assert.equal(current.persistSourceDrafts(),false);assert.equal(current.sourceDrafts.get('Main.kt'),'edited');
});
