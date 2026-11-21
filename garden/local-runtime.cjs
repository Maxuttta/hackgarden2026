const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const endpoint='http://127.0.0.1:11434';
async function available(){try{return (await fetch(endpoint+'/api/version',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}}
async function startLocalRuntime(root){
 const directory=path.join(root,'runtime','ollama'),exe=path.join(directory,'ollama.exe');
 if(await available())return true;
 try{await fs.access(exe);}catch{return false;}
 await fs.mkdir(path.join(directory,'profile'),{recursive:true});
 const child=spawn(exe,['serve'],{cwd:directory,windowsHide:true,detached:false,stdio:'ignore',env:{...process.env,...(process.platform==='win32'?{USERPROFILE:path.join(directory,'profile')}:{}),OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_MODELS:path.join(directory,'models')}});
 child.on('error',()=>{});child.unref();
 for(let i=0;i<20;i++){if(await available())return true;await new Promise(resolve=>setTimeout(resolve,500));}
 return false;
}
module.exports={startLocalRuntime};
