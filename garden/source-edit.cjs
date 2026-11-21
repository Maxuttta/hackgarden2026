const fs=require('node:fs/promises'),path=require('node:path');
async function saveSource(files,root,input){
 const {file,source,expected}=input||{};
 if(typeof file!=='string'||!Object.hasOwn(files,file))throw Error('Файл отсутствует в текущем проекте');
 if(typeof source!=='string'||typeof expected!=='string'||Buffer.byteLength(source)>2000000)throw Error('Допускается текст до 2 МБ');
 if(files[file]!==expected)throw Error('Файл изменился. Откройте актуальную версию перед сохранением.');
 if(Object.entries(files).reduce((sum,[name,text])=>sum+Buffer.byteLength(name===file?source:text),0)>16000000)throw Error('Размер проекта превышает 16 МБ');
 if(root){
   const realRoot=await fs.realpath(root),target=await fs.realpath(path.resolve(root,file));
   const relative=path.relative(realRoot,target);
   if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Файл находится вне папки проекта');
   const handle=await fs.open(target,'r+');
   try{
     if(!(await handle.stat()).isFile())throw Error('Можно редактировать только обычные файлы');
     if(await handle.readFile('utf8')!==expected)throw Error('Файл изменён другой программой. Переоткройте проект перед сохранением.');
     const bytes=Buffer.from(source);let offset=0;
     while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,offset);offset+=bytesWritten;}
     await handle.truncate(bytes.length);await handle.sync();
   }finally{await handle.close();}
 }
 files[file]=source;
 return {source,savedToDisk:!!root};
}
module.exports={saveSource};
