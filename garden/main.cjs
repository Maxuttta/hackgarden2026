const {app,BrowserWindow,dialog,ipcMain,safeStorage,Menu,shell}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {execute}=require('./workflow.cjs'),{services,endpoint}=require('./services.cjs'),{demoFiles,demoCatalog,validateCatalog}=require('./scanners.cjs'),{readProject}=require('./io.cjs');
const {resolveCatalog,isDemoCatalog}=require('./catalog.cjs');
const profile=process.argv.find(a=>a.startsWith('--profile-dir='));
if(profile) app.setPath('userData',path.resolve(profile.slice(14)));
if(!profile){
  if(!app.requestSingleInstanceLock())app.exit(0);
  app.on('second-instance',()=>{const win=BrowserWindow.getAllWindows()[0];if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
}
let files=demoFiles,catalog=demoCatalog,cfg={endpoint:'http://127.0.0.1:11434/api/chat',model:'',hook:'',key:''},busy=false,server;
const store=()=>path.join(app.getPath('userData'),'connections.bin');
let projectFolder=null,sourceSaving=false,projectName='Учебный Kotlin-проект',projectId='demo',workspaceStore,restoreWarning='',catalogName=null;
function catalogInfo(){return {name:catalogName??(projectId==='demo'?'Учебный':'Встроенный Maven'),count:catalog.length};}
function workspaceState(){return {id:projectId,name:projectName,folder:projectFolder,files,catalog,catalogName};}
function applyWorkspace(state){files=state.files;catalog=state.catalog;catalogName=state.catalogName;projectFolder=state.folder;projectName=state.name;projectId=state.id;}
async function installWorkspace(state){await workspaceStore.save(state);applyWorkspace(state);}
function projectCatalog(){return catalogName?{catalog,catalogName}:{catalog:resolveCatalog(),catalogName:null};}
const ollamaUrl='http://127.0.0.1:11434/api/chat';
async function localModels(){
  const response=await fetch(new URL('/api/tags',ollamaUrl),{redirect:'error',signal:AbortSignal.timeout(1800)});
  if(!response.ok)throw Error('Ollama недоступна');
  const {models}=await response.json();
  return models.map(m=>m.name).filter(name=>typeof name==='string');
}
app.whenReady().then(async()=>{
  if(!profile)await require('./local-runtime.cjs').startLocalRuntime(path.join(__dirname,'..'));
  try{cfg={...cfg,...JSON.parse(safeStorage.decryptString(await fs.readFile(store())))};}catch(err){
    if(err.code==='ENOENT'&&!profile){
      try{
        cfg.model=(await localModels()).find(name=>/^qwen.*:/.test(name))||'';
      }catch{}
    }
  }
  if(!profile){
    const marker=path.join(__dirname,'..','runtime','ollama','connect-qwen.flag');
    try{
      await fs.access(marker);
      const models=await localModels();
      if(models.includes('qwen2.5:0.5b')){
        cfg={...cfg,endpoint:ollamaUrl,model:'qwen2.5:0.5b',key:''};
        await fs.writeFile(store(),safeStorage.encryptString(JSON.stringify(cfg)));
        await fs.unlink(marker);
      }
    }catch{}
  }
  workspaceStore=new (require('./workspace-store.cjs').WorkspaceStore)(path.join(app.getPath('userData'),'workspace.bin'),text=>safeStorage.encryptString(text),bytes=>safeStorage.decryptString(bytes));
  try{
    const saved=await workspaceStore.load();
    if(saved){
      if(saved.catalogName===undefined)saved.catalogName=isDemoCatalog(saved.catalog)?null:'Импортированный SCA';
      saved.catalog=resolveCatalog(saved.catalog,{demo:saved.id==='demo',custom:!!saved.catalogName});
      if(saved.folder){try{saved.files=await readProject(saved.folder);}catch{saved.folder=null;saved.name+=' (сохранённый снимок)';}}
      applyWorkspace(saved);
    }else await workspaceStore.save(workspaceState());
  }catch{restoreWarning='Не удалось восстановить последний проект. Предыдущее сохранение не изменено.';console.error(restoreWarning);}
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
  const sendTelegramReport=report=>reportClient.send(report,{includeJson:cfg.includeTelegramJson===true});
  ipcMain.handle('garden:sendReport',(_,report)=>sendTelegramReport(report));
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
  ipcMain.handle('garden:settings',()=>({model:cfg.model,endpoint:cfg.endpoint,hasHook:!!cfg.hook,hasKey:!!cfg.key,hasHookKey:!!cfg.hookKey,autoSendTelegram:cfg.autoSendTelegram===true,includeTelegramJson:cfg.includeTelegramJson===true}));
  ipcMain.handle('garden:localModels',localModels);
  ipcMain.handle('garden:configure',async(_,v)=>{
    const target=endpoint(v.endpoint).href;
    const keepKey=!v.reset&&!v.clearKey&&cfg.endpoint===target;
    const nextHook=v.reset||v.localDelivery?'':v.hook?endpoint(v.hook).href:cfg.hook;
    const next={...cfg,model:v.model.trim(),endpoint:target,
      autoSendTelegram:typeof v.autoSendTelegram==='boolean'?v.autoSendTelegram:cfg.autoSendTelegram===true,
      includeTelegramJson:typeof v.includeTelegramJson==='boolean'?v.includeTelegramJson:cfg.includeTelegramJson===true,
      hook:nextHook,
      hookKey:v.reset||v.localDelivery||v.clearHookKey?'':v.hookKey||(nextHook===cfg.hook?cfg.hookKey:''),
      key:v.reset?'':v.key||(keepKey?cfg.key:'')};
    await fs.writeFile(store(),safeStorage.encryptString(JSON.stringify(next)));cfg=next;
  });
  ipcMain.handle('garden:import',async(_,kind)=>{
    if(busy||githubImporting||sourceSaving)throw Error('Дождитесь окончания текущей операции');
    const result=await dialog.showOpenDialog(win,kind==='catalog'?{properties:['openFile'],filters:[{name:'Справочник',extensions:['json']}]}:{properties:['openDirectory']});
    if(result.canceled)return null;
    const p=result.filePaths[0];
    if(kind==='catalog')await installWorkspace({...workspaceState(),catalogName:path.basename(p),catalog:validateCatalog(JSON.parse(await fs.readFile(p,'utf8')))});
    else await installWorkspace({id:crypto.randomUUID(),name:path.basename(p),folder:p,files:await readProject(p),...projectCatalog()});
    return {name:path.basename(p),count:kind==='catalog'?catalog.length:Object.keys(files).length};
  });
  let githubImporting=false;
  ipcMain.handle('garden:github',async(_,options)=>{
    if(busy||githubImporting||sourceSaving)throw Error('Дождитесь окончания текущей операции');
    githubImporting=true;
    try{
      const imported=await require('./github.cjs').importGithub(options);
      await installWorkspace({id:crypto.randomUUID(),name:imported.name,folder:null,files:imported.files,...projectCatalog()});
      return {name:imported.name,count:Object.keys(files).length,commit:imported.commit};
    }finally{githubImporting=false;}
  });
  ipcMain.handle('garden:projectInfo',()=>({id:projectId,name:projectName,local:!!projectFolder,warning:restoreWarning,catalog:catalogInfo()}));
  ipcMain.handle('garden:files',()=>Object.keys(files).sort());
  ipcMain.handle('garden:source',(_,file)=>{
    if(typeof file!=='string'||!Object.hasOwn(files,file))throw Error('Файл отсутствует в текущем проекте');
    return files[file];
  });
  ipcMain.handle('garden:saveSource',async(_,input)=>{
    if(busy||githubImporting||sourceSaving)throw Error('Дождитесь окончания текущей операции');
    sourceSaving=true;
    try{const nextFiles={...files};const result=await require('./source-edit.cjs').saveSource(nextFiles,projectFolder,input);await installWorkspace({...workspaceState(),files:nextFiles});return result;}
    finally{sourceSaving=false;}
  });
  const revealedSnapshots=new Map();
  async function revealProjectFile(file){
    if(typeof file!=='string'||!Object.hasOwn(files,file))throw Error('Файл отсутствует в текущем проекте.');
    const id=projectId,folder=projectFolder,currentFiles=files;
    if(!folder&&!revealedSnapshots.has(id)){
      const base=path.join(app.getPath('userData'),'source-snapshots');await fs.mkdir(base,{recursive:true});
      revealedSnapshots.set(id,await fs.mkdtemp(path.join(base,'project-')));
    }
    const {sourcePath,revealFile}=require('./reveal-file.cjs');
    const target=await sourcePath(currentFiles,folder,file,revealedSnapshots.get(id));
    const script=app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','garden','select-in-explorer.vbs'):undefined;
    await revealFile(target,shell,{script});
  }
  ipcMain.handle('garden:reveal',(_,file)=>revealProjectFile(file));
  ipcMain.handle('garden:fileMenu',(_,file)=>{
    if(typeof file!=='string'||!Object.hasOwn(files,file))throw Error('Файл отсутствует в текущем проекте.');
    const id=projectId;
    Menu.buildFromTemplate([{
      label:'Показать в проводнике',
      click:async()=>{
        if(id!==projectId||!Object.hasOwn(files,file))return;
        try{await revealProjectFile(file);}catch(error){dialog.showErrorBox('Не удалось показать файл',error.message);}
      }
    }]).popup({window:win});
  });
  ipcMain.handle('garden:run',async(_,graph)=>{
    if(busy||githubImporting||sourceSaving)throw Error('Дождитесь окончания текущей операции');busy=true;
    try{
      let changed=false,latest=files;
      if(projectFolder){
        latest=await readProject(projectFolder);
        changed=Object.keys(latest).length!==Object.keys(files).length||Object.keys(latest).some(key=>latest[key]!==files[key]);
      }
      const result=await execute(graph,latest,catalog,services(cfg,localHook),s=>win.webContents.send('garden:status',s));
      files=latest;
      let telegramDelivery;
      if(result.ok&&cfg.autoSendTelegram===true){
        win.webContents.send('garden:status',{phase:'telegram'});
        try{
          const queued=await sendTelegramReport({project:projectName,findings:result.findings});
          telegramDelivery={queued:true,id:queued.id,formats:queued.formats};
        }catch(error){
          telegramDelivery={queued:false,error:error.message};
        }
      }
      return {...result,telegramDelivery,sourceChanged:changed,fileCount:Object.keys(files).length};
    }finally{busy=false;}
  });
  await win.loadFile(path.join(__dirname,'index.html'));
});
app.on('window-all-closed',()=>{server?.close();app.quit();});
