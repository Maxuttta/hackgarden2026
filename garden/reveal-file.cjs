const fs=require('node:fs/promises'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const runFile=promisify(execFile);
function contained(root,target){
 const relative=path.relative(root,target);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Файл находится вне папки проекта.');
}
async function sourcePath(files,folder,file,snapshotRoot){
 if(typeof file!=='string'||!Object.hasOwn(files,file))throw Error('Файл отсутствует в текущем проекте.');
 if(!file||file.includes('\\')||file.includes(':')||file.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Недопустимый путь файла.');
 const root=await fs.realpath(folder||snapshotRoot),target=path.resolve(root,file);contained(root,target);
 if(folder){const real=await fs.realpath(target);contained(root,real);return real;}
 await fs.mkdir(path.dirname(target),{recursive:true});contained(root,await fs.realpath(path.dirname(target)));
 // Replace the snapshot atomically rather than following an existing file link.
 const temporary=target+'.'+require('node:crypto').randomUUID()+'.tmp';
 try{await fs.writeFile(temporary,files[file],{flag:'wx'});await fs.rename(temporary,target);}
 finally{await fs.unlink(temporary).catch(()=>{});}
 return target;
}
async function revealFile(target,shell,{platform=process.platform,launch=runFile,windows=process.env.SystemRoot||'C:\\Windows',script=path.join(__dirname,'select-in-explorer.vbs')}={}){
 if(platform!=='win32'){shell.showItemInFolder(target);return;}
 try{
   await launch(path.join(windows,'System32','cscript.exe'),['//NoLogo',script,target],{windowsHide:true,timeout:10000});
 }catch(error){
   if(error.code===4)throw Error('Проводник не подтвердил выделение файла.');
   if(error.code===3)throw Error('Файл перемещён или удалён.');
   throw Error('Не удалось выполнить выделение файла в Проводнике.',{cause:error});
 }
}
module.exports={sourcePath,revealFile};
