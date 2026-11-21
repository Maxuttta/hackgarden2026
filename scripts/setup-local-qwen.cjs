const path=require('node:path'),fs=require('node:fs/promises');
const root=path.resolve(__dirname,'..');
(async()=>{
 if(!await require('../garden/local-runtime.cjs').startLocalRuntime(root))throw Error('Не удалось запустить Ollama');
 console.log('Ollama started; downloading qwen2.5:0.5b');
 const response=await fetch('http://127.0.0.1:11434/api/pull',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'qwen2.5:0.5b',stream:true}),signal:AbortSignal.timeout(900000)});
 if(!response.ok)throw Error('Ollama pull HTTP '+response.status);
 let buffer='',last='';
 for await(const chunk of response.body){
   buffer+=Buffer.from(chunk).toString('utf8');let end;
   while((end=buffer.indexOf('\n'))>=0){
     const row=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
     if(row.error)throw Error(row.error);
     const state=row.total?row.status+' '+Math.floor((row.completed||0)/row.total*10)*10+'%':row.status;
     if(state!==last){console.log(state);last=state;}
   }
 }
 const cfg={endpoint:'http://127.0.0.1:11434/api/chat',model:'qwen2.5:0.5b'};
 const {scan,demoFiles}=require('../garden/scanners.cjs');
 const result=await require('../garden/services.cjs').services(cfg).explain(scan('secrets',demoFiles));
 console.log('Analyzer AI result:',JSON.stringify({detail:result.detail,advice:result.rows[0]?.advice}));
 if(!result.rows.some(row=>row.advice))throw Error('Модель установлена, но рекомендация не прошла проверку приложения');
 await fs.writeFile(path.join(root,'runtime','ollama','connect-qwen.flag'),'qwen2.5:0.5b');
 console.log('Qwen installed and verified. Restart Cyber Garden to activate.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
