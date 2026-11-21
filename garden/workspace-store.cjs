const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function validateWorkspace(state){
 if(!state||typeof state.id!=='string'||typeof state.name!=='string'||!state.files||typeof state.files!=='object'||Array.isArray(state.files)||Object.keys(state.files).length>1500||!Array.isArray(state.catalog))throw Error('Некорректное сохранение проекта');
 let size=0;
 for(const [file,source] of Object.entries(state.files)){
   if(typeof source!=='string'||!file||file.includes('\\')||file.includes(':')||file.startsWith('/')||file.split('/').some(p=>p==='..'||p==='.'||!p)||Buffer.byteLength(source)>2000000||(size+=Buffer.byteLength(source))>16000000)throw Error('Некорректный исходник в сохранении');
 }
 if(state.folder!==null&&(typeof state.folder!=='string'||!path.isAbsolute(state.folder)))throw Error('Некорректный путь проекта');
 return state;
}
class WorkspaceStore{
 constructor(file,encrypt,decrypt){this.file=file;this.encrypt=encrypt;this.decrypt=decrypt;}
 async save(state){
   validateWorkspace(state);
   const bytes=this.encrypt(JSON.stringify(state));
   const temporary=this.file+'.'+crypto.randomUUID()+'.tmp';
   await fs.mkdir(path.dirname(this.file),{recursive:true});
   try{
     const handle=await fs.open(temporary,'wx',0o600);
     try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
     await fs.rename(temporary,this.file);
   }finally{await fs.unlink(temporary).catch(()=>{});}
 }
 async load(){
   try{
     const stat=await fs.stat(this.file);if(stat.size>50000000)throw Error('Сохранённый проект слишком большой');
     return validateWorkspace(JSON.parse(this.decrypt(await fs.readFile(this.file))));
   }catch(error){if(error.code==='ENOENT')return null;throw error;}
 }
}
module.exports={WorkspaceStore,validateWorkspace};
