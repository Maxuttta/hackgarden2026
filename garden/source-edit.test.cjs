const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {saveSource}=require('./source-edit.cjs'),{scanCustom}=require('./custom.cjs');
const presets=require('./block-presets.js');
test('Редактор: сохраняет снимок и отклоняет неизвестный файл или старую версию',async()=>{
 const files={'App.kt':'old'};
 assert.equal((await saveSource(files,null,{file:'App.kt',expected:'old',source:'новый код'})).savedToDisk,false);
 assert.equal(files['App.kt'],'новый код');
 await assert.rejects(saveSource(files,null,{file:'App.kt',expected:'old',source:'lost'}));
 await assert.rejects(saveSource(files,null,{file:'../outside.kt',expected:'',source:''}));
});
test('Редактор: запись UTF-8 на диск, сокращение файла и защита от внешних изменений',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'garden-editor-'));
 try{
   const target=path.join(root,'App.kt');await fs.writeFile(target,'old long content');const files={'App.kt':'old long content'};
   const result=await saveSource(files,root,{file:'App.kt',expected:files['App.kt'],source:'код'});
   assert.equal(result.savedToDisk,true);assert.equal(await fs.readFile(target,'utf8'),'код');
   await fs.writeFile(target,'external');
   await assert.rejects(saveSource(files,root,{file:'App.kt',expected:'код',source:'overwrite'}),/другой программой/);
   assert.equal(await fs.readFile(target,'utf8'),'external');assert.equal(files['App.kt'],'код');
   const outside=path.join(root,'..','outside.kt');
   await assert.rejects(saveSource({'../outside.kt':''},root,{file:'../outside.kt',expected:'',source:'attack'}));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Пять шаблонов обнаруживают положительный пример и пропускают отрицательный',()=>{
 assert.equal(presets.length,5);
 for(const preset of presets){
   const file='src/test'+preset.path;
   assert.equal(scanCustom(preset,{[file]:preset.needle}).length,1);
   assert.equal(scanCustom(preset,{[file]:'val safe = true'}).length,0);
   assert.equal(scanCustom(preset,{'ignored.txt':preset.needle}).length,0);
 }
});
