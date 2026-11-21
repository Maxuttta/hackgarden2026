const {app,BrowserWindow,dialog,ipcMain,safeStorage,Menu,shell}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {execute}=require('./workflow.cjs'),{services,endpoint}=require('./services.cjs'),{demoFiles,demoCatalog,validateCatalog}=require('./scanners.cjs'),{readProject}=require('./io.cjs');
const profile=process.argv.find(a=>a.startsWith('--profile-dir='));
if(profile) app.setPath('userData',path.resolve(profile.slice(14)));
let files=demoFiles,catalog=demoCatalog,cfg={endpoint:'http://127.0.0.1:11434/api/chat',model:'',hook:'',key:''},busy=false,server;
const store=()=>path.join(app.getPath('userData'),'connections.bin');
let projectFolder=null;
const ollamaUrl='http://127.0.0.1:11434/api/chat';
async function localModels(){
  const response=await fetch(new URL('/api/tags',ollamaUrl),{redirect:'error',signal:AbortSignal.timeout(1800)});
  if(!response.ok)throw Error('Ollama недоступна');
  const {models}=await response.json();
  return models.map(m=>m.name).filter(name=>typeof name==='string');
}
app.whenReady().then(async()=>{
  try{cfg={...cfg,...JSON.parse(safeStorage.decryptString(await fs.readFile(store())))};}catch(err){
    if(err.code==='ENOENT'&&!profile){
      try{
        cfg.model=(await localModels()).find(name=>/^qwen.*:/.test(name))||'';
      }catch{}
    }
  }
  const secret=crypto.randomUUID();
  server=http.createServer(async(req,res)=>{
    if(req.method!=='POST'||req.url!=='/'+secret){res.writeHead(404).end();return;}
    try{
      const chunks=[];for await(const c of req) chunks.push(c);
      const body=JSON.parse(Buffer.concat(chunks));
      await fs.writeFile(path.join(app.getPath('userData'),'last-webhook.json'),JSON.stringify(body,null,2));
      res.writeHead(204).end();
    }catch{res.writeHead(500).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const localHook='http://127.0.0.1:'+server.address().port+'/'+secret;
  const reportClient=new (require('./reports.cjs').ReportClient)(()=>cfg.reportAccount,async account=>{
    const next={...cfg,reportAccount:account};
    await fs.writeFile(store(),safeStorage.encryptString(JSON.stringify(next)));cfg=next;
  });
  ipcMain.handle('garden:reportAccount',()=>reportClient.status());
  ipcMain.handle('garden:reportLogin',(_,credentials)=>reportClient.login(credentials));
  ipcMain.handle('garden:reportLogout',()=>reportClient.logout());
  ipcMain.handle('garden:reportCode',()=>reportClient.code());
  ipcMain.handle('garden:sendReport',(_,report)=>reportClient.send(report));
  Menu.setApplicationMenu(null);
  const win=new BrowserWindow({
    width:1440,height:940,minWidth:890,minHeight:600,backgroundColor:'#1e1f22',
    ...(process.platform==='win32'?{
      titleBarStyle:'hidden',
      titleBarOverlay:{color:'#26282c',symbolColor:'#e1e2e6',height:40}
    }:{}),
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,backgroundThrottling:false}
  });
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  let library=path.join(app.getPath('documents'),'Cyber Garden Templates');
  ipcMain.handle('garden:library',async(_,action,item)=>{
    if(action==='choose'){
      const pick=await dialog.showOpenDialog(win,{properties:['openDirectory']});
      if(!pick.canceled)library=pick.filePaths[0];
    }
    await fs.mkdir(library,{recursive:true});
    if(action==='publish'){
      require('./workflow.cjs').plan(item.graph);
      const title=String(item.title||'').trim().slice(0,100);
      if(!title)throw Error('Введите название шаблона');
      await fs.writeFile(path.join(library,crypto.randomUUID()+'.garden.json'),JSON.stringify({title,description:String(item.description||'').slice(0,500),graph:item.graph}),{flag:'wx'});
    }
    const items=[];
    for(const name of (await fs.readdir(library)).filter(n=>n.endsWith('.garden.json')).slice(0,100)){
      try{const p=path.join(library,name);if((await fs.stat(p)).size>128000)continue;
        const entry=JSON.parse(await fs.readFile(p,'utf8'));require('./workflow.cjs').plan(entry.graph);
        if(entry.graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)))items.push(entry);
      }catch{}
    }
    return {items,library};
  });
  ipcMain.handle('garden:generate',(_,prompt)=>require('./model.cjs').generate(require('./services.cjs').post,cfg,prompt));
  ipcMain.handle('garden:settings',()=>({model:cfg.model,endpoint:cfg.endpoint,hasHook:!!cfg.hook,hasKey:!!cfg.key,hasHookKey:!!cfg.hookKey}));
  ipcMain.handle('garden:localModels',localModels);
  ipcMain.handle('garden:configure',async(_,v)=>{
    const target=endpoint(v.endpoint).href;
    const keepKey=!v.reset&&!v.clearKey&&cfg.endpoint===target;
    const nextHook=v.reset||v.localDelivery?'':v.hook?endpoint(v.hook).href:cfg.hook;
    const next={...cfg,model:v.model.trim(),endpoint:target,
      hook:nextHook,
      hookKey:v.reset||v.localDelivery||v.clearHookKey?'':v.hookKey||(nextHook===cfg.hook?cfg.hookKey:''),
      key:v.reset?'':v.key||(keepKey?cfg.key:'')};
    await fs.writeFile(store(),safeStorage.encryptString(JSON.stringify(next)));cfg=next;
  });
  ipcMain.handle('garden:import',async(_,kind)=>{
    if(busy||githubImporting)throw Error('Дождитесь окончания текущей операции');
    const result=await dialog.showOpenDialog(win,kind==='catalog'?{properties:['openFile'],filters:[{name:'Справочник',extensions:['json']}]}:{properties:['openDirectory']});
    if(result.canceled)return null;
    const p=result.filePaths[0];
    if(kind==='catalog')catalog=validateCatalog(JSON.parse(await fs.readFile(p,'utf8')));
    else {files=await readProject(p);projectFolder=p;}
    return {name:path.basename(p),count:kind==='catalog'?catalog.length:Object.keys(files).length};
  });
  let githubImporting=false;
  ipcMain.handle('garden:github',async(_,options)=>{
    if(busy||githubImporting)throw Error('Дождитесь окончания текущей операции');
    githubImporting=true;
    try{
      const imported=await require('./github.cjs').importGithub(options);
      files=imported.files;projectFolder=null;
      return {name:imported.name,count:Object.keys(files).length,commit:imported.commit};
    }finally{githubImporting=false;}
  });
  ipcMain.handle('garden:files',()=>Object.keys(files).sort());
  ipcMain.handle('garden:source',(_,file)=>{
    if(typeof file!=='string'||!Object.hasOwn(files,file))throw Error('Файл отсутствует в текущем проекте');
    return files[file];
  });
  ipcMain.handle('garden:reveal',async(_,file)=>{
    if(!projectFolder||typeof file!=='string'||!Object.hasOwn(files,file))throw Error('Этот файл доступен только в примере');
    const target=path.join(projectFolder,file);
    await fs.access(target);
    shell.showItemInFolder(target);
  });
  ipcMain.handle('garden:run',async(_,graph)=>{
    if(busy||githubImporting)throw Error('Дождитесь окончания текущей операции');busy=true;
    try{
      let changed=false,latest=files;
      if(projectFolder){
        latest=await readProject(projectFolder);
        changed=Object.keys(latest).length!==Object.keys(files).length||Object.keys(latest).some(key=>latest[key]!==files[key]);
      }
      const result=await execute(graph,latest,catalog,services(cfg,localHook),s=>win.webContents.send('garden:status',s));
      files=latest;
      return {...result,sourceChanged:changed,fileCount:Object.keys(files).length};
    }finally{busy=false;}
  });
  await win.loadFile(path.join(__dirname,'index.html'));
});
app.on('window-all-closed',()=>{server?.close();app.quit();});
