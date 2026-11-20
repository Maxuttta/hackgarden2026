const bench=$('workbench');
const narrow=matchMedia('(max-width:1099px)');
const panes={project:!read('garden.hideProject',false),blocks:!narrow.matches&&!read('garden.hideBlocks',false),report:false};
const tabFiles=new Map();
let activeFile=null,sourceRows=[],projectGeneration=0,requestNumber=0,lastWindow='',chosenLine=0;
let review=null,hasProjectFolder=false,importing=false;
function hideFirstCheck(){
 $('firstCheck').hidden=true;localStorage.setItem('garden.firstCheckDone','1');
}
$('firstCheck').hidden=!!runs.length||!!localStorage.getItem('garden.firstCheckDone')||!!localStorage.getItem('garden.graph');
$('tryCheck').onclick=run;
$('hideGuide').onclick=hideFirstCheck;
$('pickProject').onclick=$('chooseFolder').onclick=()=>$('folder').click();
function displayPanes(){
 for(const [key,id,toggle] of [['project','projectPane','projectToggle'],['blocks','blockPane','blockToggle']]){
   bench.classList.toggle('hide-'+key,!panes[key]);$(id).hidden=!panes[key];$(toggle).setAttribute('aria-pressed',panes[key]);
 }
 document.querySelector('.dock').hidden=!panes.report;$('reportToggle').setAttribute('aria-pressed',panes.report);
}
function showPane(key,value){
 panes[key]=value;
 if(key!=='report'){
   localStorage.setItem(key==='project'?'garden.hideProject':'garden.hideBlocks',JSON.stringify(!value));
   if(value&&narrow.matches)panes[key==='blocks'?'project':'blocks']=false;
 }
 displayPanes();
}
narrow.onchange=()=>{
 if(narrow.matches&&panes.project&&panes.blocks)panes.blocks=false;
 else if(!narrow.matches){panes.project=!read('garden.hideProject',false);panes.blocks=!read('garden.hideBlocks',false);}
 displayPanes();
};
$('projectToggle').onclick=()=>showPane('project',!panes.project);
$('blockToggle').onclick=()=>showPane('blocks',!panes.blocks);
$('reportToggle').onclick=()=>showPane('report',!panes.report);
function focusPalette(){showPane('blocks',true);$('blockSearch').focus();$('blockSearch').select();}
$('searchShortcut').onclick=focusPalette;
function syncTabs(){
 document.querySelector('.editor').classList.toggle('code-visible',!!activeFile);
 $('workflowTab').setAttribute('aria-pressed',!activeFile);
 $('sourceView').hidden=!activeFile;
 $('findingReview').hidden=!activeFile||!review;
 document.querySelector('.graphbar').hidden=!!activeFile;document.querySelector('.stage').hidden=!!activeFile;
 $('openTabs').replaceChildren();
 for(const file of tabFiles.keys()){
   const group=document.createElement('span');group.className='source-tab'+(file===activeFile?' current':'');
   const open=document.createElement('button');open.innerHTML=iconSvg('fileCode')+esc(file.split('/').at(-1));open.title=file;
   open.onclick=()=>openFile(file);group.append(open);
   const close=document.createElement('button');close.textContent='×';close.title='Закрыть '+file;close.setAttribute('aria-label',close.title);
   close.onclick=()=>{tabFiles.delete(file);if(activeFile===file)showGraph();else syncTabs();};
   group.append(close);$('openTabs').append(group);
 }
 for(const row of $('tree').querySelectorAll('button'))row.classList.toggle('current',activeFile?row.dataset.file===activeFile:row.classList.contains('workflow-row'));
 $('crumb').textContent=$('project').textContent+'　›　'+(activeFile?activeFile.split('/').join('　›　'):'Сценарий проверки');
 $('crumb').title=activeFile||'Сценарий проверки';
}
function showGraph(){requestNumber++;review=null;activeFile=null;sourceRows=[];syncTabs();}
$('workflowTab').onclick=showGraph;$('workflowShortcut').onclick=showGraph;
const tokens=/(\/\/.*$|\/\*.*?(?:\*\/|$)|^\s*#.*$)|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(@[\w.]+)|\b(package|import|class|object|interface|fun|val|var|override|private|public|internal|if|else|return|true|false|null|when|for|in|as|is|data)\b|\b(\d+(?:\.\d+)*)\b|\b([\w]+)(?=\s*\()/g;
function highlight(line){
 if(line.length>4000)return esc(line);
 let html='',offset=0;
 for(const m of line.matchAll(tokens)){
   const cls=m[1]?'comment':m[2]?'string':m[3]?'annotation':m[4]?'kw':m[5]?'num':'func';
   html+=esc(line.slice(offset,m.index))+'<span class="'+cls+'">'+esc(m[0])+'</span>';offset=m.index+m[0].length;
 }
 return html+esc(line.slice(offset));
}
function renderLines(){
 if(!activeFile)return;
 const scroll=$('sourceScroll'),first=Math.max(0,Math.floor(scroll.scrollTop/23)-4);
 const end=Math.min(sourceRows.length,first+Math.ceil(scroll.clientHeight/23)+10);
 const key=activeFile+':'+first+':'+end+':'+chosenLine;
 if(lastWindow===key)return;lastWindow=key;
 const part=document.createElement('div');part.className='line-window';part.style.transform='translateY('+first*23+'px)';
 part.innerHTML=sourceRows.slice(first,end).map((line,i)=>'<div class="code-line'+(first+i+1===chosenLine?' highlighted':'')+'"><span class="number">'+(first+i+1)+'</span><span>'+highlight(line)+'</span></div>').join('');
 $('sourceLines').replaceChildren(part);
}
$('sourceScroll').onscroll=renderLines;
new ResizeObserver(renderLines).observe($('sourceScroll'));
async function openFile(file,line=0,context=null){
 const request=++requestNumber;
 try{
   const source=tabFiles.has(file)?tabFiles.get(file):await garden.source(file);
   if(request!==requestNumber)return;
   tabFiles.set(file,source);activeFile=file;sourceRows=source.split(/\r\n|\n|\r/);chosenLine=line;review=context;
   if(review)renderReview();
   syncTabs();$('filePath').textContent=file;$('sourceLines').style.height=sourceRows.length*23+'px';lastWindow='';
   $('sourceScroll').scrollTo(0,Math.max(0,(line-4)*23));renderLines();
   $('openTabs').querySelector('.current')?.scrollIntoView({block:'nearest',inline:'nearest'});
 }catch{if(request===requestNumber)note('Этот файл недоступен в текущем проекте.');}
}
function inspectFinding(result,findings,index){
 if(runProjects.get(result)!==projectGeneration){note('Снова проверьте этот проект, чтобы открыть актуальную строку.');return;}
 const finding=findings[index];
 showPane('report',false);
 openFile(finding.file,finding.line,{result,findings,index});
}
function renderReview(){
 const {result,findings,index}=review,f=findings[index],panel=$('findingReview');
 panel.innerHTML='<div class="review-nav"><button id="backReport">'+iconSvg('return')+'К отчёту</button><span>Находка '+(index+1)+' из '+findings.length+'</span><button id="previousFinding" aria-label="Предыдущая находка" title="Предыдущая находка">‹</button><button id="nextFinding" aria-label="Следующая находка" title="Следующая находка">›</button></div>'+
 '<div class="review-title"><span class="severity '+esc(f.severity)+'">'+esc(riskLabels[f.severity]||f.severity)+'</span><strong>'+esc(f.title)+'</strong></div><p><b>Как исправить</b>　'+esc(f.fix)+'</p>'+
 (f.advice?'<details><summary>Пояснение AI</summary>'+esc(f.advice)+'</details>':'')+
 (hasProjectFolder?'<div class="repair-actions"><button id="revealFinding">'+iconSvg('folderOpen')+'Показать файл в папке</button><small>После исправления нажмите «Запустить» ещё раз.</small></div>':'');
 if($('revealFinding'))$('revealFinding').onclick=async()=>{try{await garden.reveal(f.file);}catch{note('Файл перемещён или удалён. Запустите проверку, чтобы обновить проект.');}};
 $('previousFinding').disabled=index===0;$('nextFinding').disabled=index===findings.length-1;
 $('previousFinding').onclick=()=>inspectFinding(result,findings,index-1);
 $('nextFinding').onclick=()=>inspectFinding(result,findings,index+1);
 $('backReport').onclick=()=>{showGraph();showPane('report',true);report(result);$('inspectFirst')?.focus();};
}
function branch(title){
 const box=document.createElement('details');box.className='tree-dir';box.open=true;
 const summary=document.createElement('summary');
 summary.innerHTML='<span class="arrow">'+iconSvg('chevronRight')+'</span><span class="folder-icon">'+iconSvg('folder')+'</span>'+esc(title);
 const children=document.createElement('div');children.className='tree-children';box.append(summary,children);
 return {box,children};
}
async function loadTree(){
 const generation=++projectGeneration;
 tabFiles.clear();showGraph();$('tree').replaceChildren();
 try{
   const list=await garden.files();if(generation!==projectGeneration)return;
   const root=branch($('project').textContent);$('tree').append(root.box);
   const pathTree={dirs:new Map(),files:[]};
   for(const file of list){
     const parts=file.split('/'),name=parts.pop();let dir=pathTree;
     for(const part of parts){
       if(!dir.dirs.has(part))dir.dirs.set(part,{dirs:new Map(),files:[]});
       dir=dir.dirs.get(part);
     }
     dir.files.push({name,file});
   }
   function fill(tree,container,depth){
     for(const [title,subtree] of [...tree.dirs].sort(([a],[b])=>a.localeCompare(b))){
       const d=branch(title);d.box.open=list.length<=35||depth<1;container.append(d.box);fill(subtree,d.children,depth+1);
     }
     for(const {name,file} of tree.files.sort((a,b)=>a.name.localeCompare(b.name))){
       const b=document.createElement('button');b.className='tree-file';b.dataset.file=file;b.dataset.ext=name.split('.').pop();
       b.title=file;b.innerHTML='<span class="file-icon">'+iconSvg(name.endsWith('.kts')?'layers':name.endsWith('.kt')?'fileCode':'file')+'</span>'+esc(name);
       b.onclick=()=>openFile(file);container.append(b);
     }
   }
   fill(pathTree,root.children,0);
   const workflow=document.createElement('button');workflow.className='tree-file workflow-row';workflow.innerHTML='<span class="file-icon">'+iconSvg('git')+'</span>Сценарий проверки';workflow.onclick=showGraph;root.children.append(workflow);
   syncTabs();
 }catch{note('Не удалось загрузить список файлов проекта.');}
}
$('actionMenu').addEventListener('click',e=>{if(e.target.closest('button'))$('actionMenu').open=false;});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#actionMenu'))$('actionMenu').open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('actionMenu').open){$('actionMenu').open=false;$('actionMenu').querySelector('summary').focus();}});
displayPanes();loadTree();
