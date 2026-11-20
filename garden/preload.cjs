const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('garden',{
  files:()=>ipcRenderer.invoke('garden:files'),
  source:file=>ipcRenderer.invoke('garden:source',file),
  reveal:file=>ipcRenderer.invoke('garden:reveal',file),
  library:(a,i)=>ipcRenderer.invoke('garden:library',a,i),
  generate:p=>ipcRenderer.invoke('garden:generate',p),
  run:g=>ipcRenderer.invoke('garden:run',g),
  import:k=>ipcRenderer.invoke('garden:import',k),
  settings:()=>ipcRenderer.invoke('garden:settings'),
  localModels:()=>ipcRenderer.invoke('garden:localModels'),
  configure:v=>ipcRenderer.invoke('garden:configure',v),
  status:cb=>ipcRenderer.on('garden:status',(_,s)=>cb(s))
});
