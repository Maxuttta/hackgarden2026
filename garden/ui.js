const $=id=>document.getElementById(id);
const kinds={
 custom:['Пользовательская проверка','Мои блоки','#e7b36a','search'],
 manual:['Старт по кнопке','Запуск','#83c99b','play'], schedule:['По расписанию','Запуск','#83c99b','clock'],
 secrets:['Поиск секретов','Проверки','#e7b36a','key'], sca:['Зависимости Gradle','Проверки','#85b6ec','layers'],
 sast:['Анализ Kotlin','Проверки','#bd9def','fileCode'], condition:['Условие','Логика','#f1b780','git'],
 ai:['Объяснение AI','Результаты','#c6a1ef','spark'], notify:['HTTP webhook','Результаты','#81c9c7','send']
};
const defaultKinds=['manual','secrets','sca','sast','ai','notify'];
const initial={nodes:defaultKinds.map((type,i)=>({id:'n'+i,type,x:42+(i<3?i:5-i)*262,y:i<3?44:218})),edges:defaultKinds.slice(1).map((_,i)=>({from:'n'+i,to:'n'+(i+1),port:'next'}))};
function read(k,d){try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}}
let graph=structuredClone(read('garden.graph',initial)),runs=read('garden.history',[]),pending=null,busy=false,states={},lastMinute='',armed=false;
const help='Перетащите связь между выходом и входом или нажмите на них по очереди.';
function note(text){$('hint').textContent=text;$('hint').title=text;}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const past=[],future=[];
let snapshot=JSON.stringify(graph);
function updateUndo(){
 $('undo').disabled=busy||!past.length;$('redo').disabled=busy||!future.length;
}
function persist(){
 const next=JSON.stringify(graph);
 if(next!==snapshot){past.push(snapshot);if(past.length>40)past.shift();future.length=0;snapshot=next;}
 localStorage.setItem('garden.graph',snapshot);updateUndo();
}
function restore(from,to){
 if(busy||!from.length)return;
 to.push(snapshot);snapshot=from.pop();graph=JSON.parse(snapshot);pending=null;states={};armed=false;
 localStorage.setItem('garden.graph',snapshot);updateUndo();draw();note(from===past?'Изменение отменено.':'Изменение возвращено.');
}
$('undo').onclick=()=>restore(past,future);$('redo').onclick=()=>restore(future,past);updateUndo();
const card={w:190,h:80};
let zoom=1,autoFit=true;
const portNames={in:'Вход',next:'Выход',yes:'Да',no:'Нет'};
const isStart=type=>type==='manual'||type==='schedule';
function insertionSlots(){
 const slots=[];
 for(const from of graph.nodes){
   for(const port of from.type==='condition'?['yes','no']:['next']){
     const edges=graph.edges.filter(e=>e.from===from.id&&e.port===port);
     const label=kinds[from.type][0]+(from.type==='condition'?' · '+portNames[port]:'');
     if(!edges.length)slots.push({from,port,label:'После «'+label+'»'});
     for(const edge of edges){
       const to=graph.nodes.find(n=>n.id===edge.to);
       if(to)slots.push({from,port,edge,to,label:label+' → '+kinds[to.type][0]});
     }
   }
 }
 return slots;
}
function placement(slot,x,y){
 const anchor=slot?.from,other=slot?.to;
 const left=x??(anchor?(other?(anchor.x+other.x)/2:anchor.x+250):42);
 const top=y??(anchor?(other?(anchor.y+other.y)/2:anchor.y):44);
 const fits=(x,y)=>x>=4&&y>=4&&graph.nodes.every(n=>Math.abs(n.x-x)>=card.w+12||Math.abs(n.y-y)>=card.h+12);
 if(fits(left,top))return {x:left,y:top};
 // Search nearby rows first to keep the new block close to its connection.
 for(let step=1;step<=graph.nodes.length+1;step++){
   for(const [dx,dy] of [[0,step],[0,-step],[step,0],[-step,0]]){
     const x=left+dx*244,y=top+dy*106;
     if(fits(x,y))return {x,y};
   }
 }
 let nextRow=44;
 while(!fits(42,nextRow))nextRow+=106;
 return {x:42,y:nextRow};
}
function add(type,x,y,definition){
 if(busy)return;
 showGraph();
 const start=graph.nodes.find(n=>isStart(n.type));
 if(isStart(type)&&start){
   if(start.type===type){edit(start);return;}
   modal('<h2>Изменить способ запуска?</h2><p>«'+kinds[start.type][0]+'» → «'+kinds[type][0]+'». Все связи сохранятся.</p><button id="confirmInsert">Заменить старт</button>');
   $('confirmInsert').onclick=()=>{
     if(busy)return;
     start.type=type;delete start.time;armed=false;pending=null;states={};
     persist();draw();$('modal').close();edit(start);
   };
   return;
 }
 if(graph.nodes.length>=64){note('В сценарии уже 64 блока. Удалите один перед добавлением.');return;}
 const slots=insertionSlots();
 const attach=slot=>{
   if(busy)return;
   const n={id:crypto.randomUUID(),type,...placement(slot,x,y),...(type==='custom'?{definition:structuredClone(definition||{title:'Моя проверка',needle:'',path:'',severity:'medium',fix:'',caseSensitive:false})}:{})};
   const roots=isStart(type)?graph.nodes.filter(node=>!graph.edges.some(e=>e.to===node.id)):[];
   graph.nodes.push(n);
   if(slot){
     if(slot.edge){
       slot.edge.from=n.id;
       slot.edge.port=type==='condition'?'yes':'next';
     }
     graph.edges.push({from:slot.from.id,port:slot.port,to:n.id});
   }
   for(const root of roots)graph.edges.push({from:n.id,port:'next',to:root.id});
   pending=null;states={};persist();draw();
   const added=$('nodes').querySelector('[data-node-id="'+n.id+'"]');
   added?.scrollIntoView({block:'nearest',inline:'nearest'});added?.focus({preventScroll:true});
   note('Добавлен блок «'+kinds[type][0]+'». Ctrl + Z — отменить.');
   if(type==='schedule'||type==='condition'||type==='custom')edit(n);
 };
 if(isStart(type)||!slots.length){attach(null);return;}
 let preferred=slots.findIndex(s=>s.to?.type==='ai');
 if(type==='notify'||preferred<0)preferred=slots.findIndex(s=>!s.edge);
 if(x!==undefined){
   const distance=s=>Math.hypot(x-s.from.x,y-s.from.y);
   preferred=slots.indexOf(slots.reduce((best,s)=>distance(s)<distance(best)?s:best));
 }
 const options=slots.map((s,i)=>'<option value="'+i+'" '+(i===preferred?'selected':'')+'>'+esc(s.label)+'</option>').join('');
 modal('<h2>Добавить блок «'+kinds[type][0]+'»</h2><label>Место в сценарии<select id="insertPosition">'+options+'</select></label><p>Связи будут созданы автоматически.</p><button id="confirmInsert">Добавить в сценарий</button>');
 $('confirmInsert').onclick=()=>{if(busy)return;const slot=slots[Number($('insertPosition').value)];$('modal').close();attach(slot);};
}
function palette(){
 const query=$('blockSearch').value.trim().toLocaleLowerCase();
 $('palette').replaceChildren();let group='',items;
 for(const [type,[title,category,accent,icon]] of Object.entries(kinds)){
   if(type==='custom')continue;
   if(!(title+' '+category+' '+type).toLocaleLowerCase().includes(query))continue;
   if(category!==group){
     const section=document.createElement('details');section.open=true;
     const heading=document.createElement('summary');heading.className='palette-group';heading.innerHTML=iconSvg('chevronRight')+esc(category);
     items=document.createElement('div');section.append(heading,items);$('palette').append(section);group=category;
   }
   const button=document.createElement('button');
   button.innerHTML=iconSvg(icon)+esc(title);button.style.setProperty('--accent',accent);button.draggable=true;
   button.title=isStart(type)?'Настроить способ запуска: '+title:'Выбрать место для блока «'+title+'»';
   button.ondragstart=e=>e.dataTransfer.setData('text/plain',type);button.onclick=()=>add(type);items.append(button);
 }
 const presetHeading=document.createElement('h3');presetHeading.textContent='Шаблоны проверок';$('palette').append(presetHeading);
 for(const definition of gardenBlockPresets){
   if(!(definition.title+' '+definition.needle).toLocaleLowerCase().includes(query))continue;
   const button=document.createElement('button');button.textContent=definition.title;button.title=definition.fix;button.onclick=()=>add('custom',undefined,undefined,definition);$('palette').append(button);group='Шаблоны проверок';
 }
 const customHeading=document.createElement('h3');customHeading.textContent='Мои блоки';$('palette').append(customHeading);
 for(const definition of read('garden.customBlocks',[])){
   if(!definition||typeof definition.title!=='string'||!definition.title.toLocaleLowerCase().includes(query))continue;
   const row=document.createElement('div'),button=document.createElement('button'),editButton=document.createElement('button');
   button.textContent=definition.title;button.title='Добавить мой блок';button.onclick=()=>add('custom',undefined,undefined,definition);
   editButton.textContent='✎';editButton.title='Изменить или удалить мой блок';editButton.onclick=()=>editCustomBlock(null,definition);
   row.append(button,editButton);$('palette').append(row);group='Мои блоки';
 }
 $('noMatches').hidden=!!group;
}
$('blockSearch').oninput=palette;palette();
$('viewport').ondragover=e=>e.preventDefault();
$('viewport').ondrop=e=>{
 e.preventDefault();const type=e.dataTransfer.getData('text/plain'),r=$('canvas').getBoundingClientRect();
 if(Object.hasOwn(kinds,type))add(type,Math.max(4,(e.clientX-r.left)/zoom-card.w/2),Math.max(4,(e.clientY-r.top)/zoom-card.h/2));
};
function viewportLayout(){
 const v=$('viewport'),w=Math.max(260,...graph.nodes.map(n=>n.x+card.w+40)),h=Math.max(130,...graph.nodes.map(n=>n.y+card.h+36));
 if(autoFit)zoom=Math.min(1.15,Math.max(.12,Math.min((v.clientWidth-18)/w,(v.clientHeight-48)/h)));
 const left=Math.max(0,(v.clientWidth-w*zoom)/2),top=Math.max(0,(v.clientHeight-42-h*zoom)/2);
 Object.assign($('canvas').style,{width:w+'px',height:h+'px',left:left+'px',top:top+'px',transform:'scale('+zoom+')'});
 Object.assign($('spacer').style,{width:Math.ceil(w*zoom+left)+'px',height:Math.ceil(h*zoom+top+42)+'px'});
 $('zoomValue').value=Math.round(zoom*100)+'%';
}
function changeZoom(factor){autoFit=false;zoom=Math.min(2,Math.max(.15,zoom*factor));viewportLayout();}
$('zoomIn').onclick=()=>changeZoom(1.2);$('zoomOut').onclick=()=>changeZoom(1/1.2);
$('fit').onclick=()=>{autoFit=true;viewportLayout();$('viewport').scrollTo(0,0);};
new ResizeObserver(viewportLayout).observe($('viewport'));
function orientation(n,other,fallback){
 if(!other)return fallback;
 const dx=other.x-n.x,dy=other.y-n.y;
 if(Math.abs(dy)>Math.abs(dx))return dy>0?'bottom':'top';
 return dx>=0?'right':'left';
}
function portMap(){
 const byId=new Map(graph.nodes.map(n=>[n.id,n])),ports=new Map();
 for(const n of graph.nodes){
   const items={},incoming=graph.edges.find(e=>e.to===n.id);
   const input=orientation(n,byId.get(incoming?.from),'left');
   const names=[...(['manual','schedule'].includes(n.type)?[]:['in']),...(n.type==='condition'?['yes','no']:['next'])];
   for(const name of names){
     const edge=graph.edges.find(e=>e.from===n.id&&e.port===name);
     let side=name==='in'?input:orientation(n,byId.get(edge?.to),input==='right'?'left':'right');
     if(name!=='in'&&side===input&&names.includes('in'))side=input==='top'?'bottom':'top';
     const t=name==='yes'?.27:name==='no'?.73:.5;
     const direction={left:[0,t,-1,0],right:[1,t,1,0],top:[t,0,0,-1],bottom:[t,1,0,1]}[side];
     const [fx,fy,dx,dy]=direction;items[name]={x:fx*card.w,y:fy*card.h,dx,dy,side};
   }
   ports.set(n.id,items);
 }
 return ports;
}
function wires(){
 const byId=new Map(graph.nodes.map(n=>[n.id,n])),ports=portMap();
 for(const button of $('nodes').querySelectorAll('[data-port]')){
   const pos=ports.get(button.closest('.node').dataset.nodeId)?.[button.dataset.port];
   if(pos){button.style.left=pos.x+'px';button.style.top=pos.y+'px';}
 }
 $('edges').innerHTML=graph.edges.map(e=>{
   const a=byId.get(e.from),b=byId.get(e.to),out=ports.get(e.from)?.[e.port],input=ports.get(e.to)?.in;
   if(!out||!input)return '';
   const x=a.x+out.x,y=a.y+out.y,X=b.x+input.x,Y=b.y+input.y;
   const bend=Math.min(100,Math.max(28,Math.hypot(X-x,Y-y)*.43));
   const arrowX=X+input.dx*14,arrowY=Y+input.dy*14;
   const angle=Math.atan2(-input.dy,-input.dx)*180/Math.PI;
   const arrow='<path d="m-4 -3 5 3-5 3" fill="none" stroke="#a2adbd" stroke-width="1.6" transform="translate('+arrowX+' '+arrowY+') rotate('+angle+')"/>';
   let path='M '+x+' '+y+' C '+(x+out.dx*bend)+' '+(y+out.dy*bend)+' '+(X+input.dx*bend)+' '+(Y+input.dy*bend)+' '+X+' '+Y;
   // Parallel branches along one row must stay visible past intervening cards.
   if(out.dx&&input.dx&&Math.abs(Y-y)<card.h/2){
     const between=graph.nodes.filter(n=>n!==a&&n!==b&&n.x<Math.max(X,x)&&n.x+card.w>Math.min(X,x)&&n.y<Math.max(Y,y)+4&&n.y+card.h>Math.min(Y,y)-4);
     if(between.length){
       const cards=[a,b,...between],top=Math.min(...cards.map(n=>n.y))-19;
       const lane=top>=5?top:Math.max(...cards.map(n=>n.y+card.h))+19;
       path='M '+x+' '+y+' h '+(out.dx*18)+' V '+lane+' H '+(X+input.dx*18)+' V '+Y+' H '+X;
     }
   }
   return arrow+'<path fill="none" stroke="#768397" stroke-width="2" stroke-linejoin="round" d="'+path+'"/>';
 }).join('');
}
function portRef(button){return {id:button.closest('.node').dataset.nodeId,port:button.dataset.port};}
function edgeBetween(a,b){
 if((a.port==='in')===(b.port==='in'))return null;
 const [source,target]=a.port==='in'?[b,a]:[a,b];
 return {from:source.id,port:source.port,to:target.id};
}
function connectionIssue(edge){
 if(!edge)return 'Соедините выход со входом.';
 if(edge.to===edge.from)return 'Выберите другой блок.';
 if(graph.edges.some(e=>e.from===edge.from&&e.port===edge.port&&e.to===edge.to))return 'Эта связь уже существует.';
 const seen=new Set([edge.to]);
 for(const id of seen){
   if(id===edge.from)return 'Эта связь замкнёт сценарий в цикл.';
   for(const e of graph.edges)if(e.from===id)seen.add(e.to);
 }
 return '';
}
function markPorts(){
 for(const button of $('nodes').querySelectorAll('.port')){
   const ref=portRef(button),edge=pending&&edgeBetween(pending,ref),issue=edge&&connectionIssue(edge);
   button.classList.toggle('connect-target',!!edge&&!issue);
   button.classList.toggle('unavailable',!!issue);
   button.title=issue||button.getAttribute('aria-label');
   button.closest('.node').classList.toggle('selected',pending?.id===ref.id);
 }
}
function finishConnection(end){
 const edge=edgeBetween(pending,end),issue=connectionIssue(edge);
 if(!issue){graph.edges.push(edge);states={};persist();}
 pending=null;draw();note(issue||'Связь добавлена.');
}
function selectPort(button){
 if(busy)return;
 const ref=portRef(button);
 if(pending&&edgeBetween(pending,ref)){finishConnection(ref);return;}
 const deselect=pending?.id===ref.id&&pending.port===ref.port;
 pending=deselect?null:ref;markPorts();
 if(!pending){note(help);return;}
 const target=$('nodes').querySelector('.connect-target');
 if(target){note('Выберите подсвеченный порт. Esc — отменить.');target.focus({preventScroll:true});}
 else{pending=null;markPorts();note('Подходящего порта нет. Проверьте направление и существующие связи.');}
}
let cableGesture=null;
function startCable(event,button){
 if(busy||!event.isPrimary||event.button!==0)return;
 cableGesture={pointer:event.pointerId,button,startX:event.clientX,startY:event.clientY,dragging:false};
 button.setPointerCapture(event.pointerId);
}
function underPointer(event){
 return document.elementFromPoint(event.clientX,event.clientY)?.closest('#nodes .port');
}
function updateCable(event){
 const g=cableGesture;
 if(!g||event.pointerId!==g.pointer)return;
 if(!g.dragging){
   if(Math.hypot(event.clientX-g.startX,event.clientY-g.startY)<4)return;
   g.dragging=true;pending=portRef(g.button);markPorts();
   g.path=document.createElementNS('http://www.w3.org/2000/svg','path');
   g.path.classList.add('cable-preview');$('edges').append(g.path);
   note('Отпустите на подсвеченном порте. Esc — отменить.');
 }
 const target=underPointer(event),valid=target?.classList.contains('connect-target');
 if(g.target!==target){g.target?.classList.remove('drop-target');g.target=target;}
 if(valid)target.classList.add('drop-target');
 const canvas=$('canvas').getBoundingClientRect(),origin=g.button.getBoundingClientRect(),snap=valid&&target.getBoundingClientRect();
 const x=(origin.left+origin.width/2-canvas.left)/zoom,y=(origin.top+origin.height/2-canvas.top)/zoom;
 const X=((snap?snap.left+snap.width/2:event.clientX)-canvas.left)/zoom,Y=((snap?snap.top+snap.height/2:event.clientY)-canvas.top)/zoom;
 const mid=(x+X)/2;
 g.path.setAttribute('d','M '+x+' '+y+' C '+mid+' '+y+' '+mid+' '+Y+' '+X+' '+Y);
}
function stopCable(cancelled,event){
 const g=cableGesture;
 if(!g||(event&&event.pointerId!==g.pointer))return;
 cableGesture=null;
 if(g.button.hasPointerCapture(g.pointer))g.button.releasePointerCapture(g.pointer);
 if(!g.dragging)return;
 g.path.remove();g.target?.classList.remove('drop-target');
 const target=!cancelled&&underPointer(event);
 if(target&&pending)finishConnection(portRef(target));
 else{pending=null;draw();note('Соединение отменено.');}
}
document.addEventListener('pointermove',updateCable);
document.addEventListener('pointerup',e=>stopCable(false,e));
document.addEventListener('pointercancel',e=>stopCable(true,e));
document.addEventListener('lostpointercapture',e=>stopCable(true,e));
window.addEventListener('blur',()=>stopCable(true));
function draw(){
 if(cableGesture){cableGesture.path?.remove();cableGesture=null;pending=null;}
 $('nodes').replaceChildren();$('summary').textContent=graph.nodes.length+' '+plural(graph.nodes.length,['блок','блока','блоков'])+' · '+graph.edges.length+' '+plural(graph.edges.length,['связь','связи','связей']);
 for(const n of graph.nodes){
   const [baseTitle,group,accent,icon]=kinds[n.type],title=n.type==='custom'?(n.definition?.title||baseTitle):baseTitle,d=document.createElement('div');
   d.className='node';d.dataset.kind=n.type;d.dataset.nodeId=n.id;d.dataset.state=states[n.id]||'';d.tabIndex=0;
   d.setAttribute('aria-label',title+' · настройки');d.title='Настроить блок «'+title+'»';
   Object.assign(d.style,{left:n.x+'px',top:n.y+'px'});d.style.setProperty('--accent',accent);
   d.innerHTML='<span class="glyph">'+iconSvg(icon)+'</span><div class="caption"><small>'+esc(states[n.id]||group)+'</small><b>'+esc(title)+'</b></div>';
   const names=[...(['manual','schedule'].includes(n.type)?[]:['in']),...(n.type==='condition'?['yes','no']:['next'])];
   for(const p of names){
     const b=document.createElement('button');b.className='port';b.dataset.port=p;
     b.setAttribute('aria-label',portNames[p]+' · '+title);b.title=portNames[p]+' · '+title;
     if(p==='yes'||p==='no')b.innerHTML='<span class="branch-label">'+portNames[p]+'</span>';
     b.onpointerdown=e=>startCable(e,b);b.onclick=()=>selectPort(b);d.append(b);
   }
   d.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.ctrlKey&&e.target===d){e.preventDefault();edit(n);}};
   d.onpointerdown=e=>{
     if(busy||e.button!==0||e.target.closest('button'))return;
     d.setPointerCapture(e.pointerId);const startX=e.clientX,startY=e.clientY,x=n.x,y=n.y;let moved=false;
     d.onpointermove=v=>{
       const dx=v.clientX-startX,dy=v.clientY-startY;if(!moved&&Math.abs(dx)+Math.abs(dy)<5)return;
       moved=true;n.x=Math.max(5,x+dx/zoom);n.y=Math.max(5,y+dy/zoom);d.style.left=n.x+'px';d.style.top=n.y+'px';wires();
     };
     d.onpointerup=()=>{d.onpointermove=null;d.onpointerup=null;if(moved){persist();viewportLayout();}else edit(n);};
     d.onpointercancel=()=>{d.onpointermove=null;d.onpointerup=null;persist();viewportLayout();};
   };
   $('nodes').append(d);
 }
 viewportLayout();wires();markPorts();
}
function plural(n,forms){return forms[n%10===1&&n%100!==11?0:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?1:2];}
function modal(html){$('form').innerHTML=html;$('form').querySelector('h2').id='dialogTitle';$('modal').showModal();}
function edit(n){
 if(busy)return;
 if(n.type==='custom'){editCustomBlock(n);return;}
 const filtering=['condition','sca','sast','secrets'].includes(n.type);
 const minimum=n.level||(n.type==='condition'?'high':'info');
 const select=filtering?'<label>Минимальный риск<select id="level">'+Object.keys(riskLabels).reverse().map(v=>'<option value="'+v+'" '+(v===minimum?'selected':'')+'>'+riskLabels[v]+'</option>').join('')+'</select></label>':'';
 const condition=n.type==='condition'?'<label>Минимум находок<input id="count" type="number" min="0" required value="'+esc(n.count??1)+'"></label><label>Путь к файлу · регулярное выражение<input id="pattern" placeholder="Любой файл" value="'+esc(n.pattern)+'"></label>':'';
 const schedule=n.type==='schedule'?'<label>Ежедневно по местному времени<input type="time" required id="time" value="'+esc(n.time||'14:00')+'"></label><small>Расписание действует, пока открыто приложение.</small>':'';
 const descriptions={manual:'Запускает сценарий по кнопке или сочетанию Ctrl + Enter.',condition:'Ветка «Да» выполняется, когда число подходящих находок достигает порога.',ai:'Объясняет найденные риски с помощью модели из настроек подключений.',notify:'Доставляет отчёт на адрес webhook из настроек подключений.'};
 const edges=graph.edges.filter(e=>e.from===n.id);
 const links=edges.map(e=>'<button title="Удалить связь" data-edge="'+graph.edges.indexOf(e)+'">'+portNames[e.port]+' → '+kinds[graph.nodes.find(v=>v.id===e.to).type][0]+' ×</button>').join('');
 const incoming=graph.edges.filter(e=>e.to===n.id);
 const bridge=incoming.length===1&&edges.length===1&&edges[0].port==='next'
   ?{from:incoming[0].from,port:incoming[0].port,to:edges[0].to}:null;
 modal('<h2>'+kinds[n.type][0]+'</h2>'+(descriptions[n.type]?'<p>'+descriptions[n.type]+'</p>':'')+select+condition+schedule+
 (edges.length?'<p>Исходящие связи</p>'+links:'')+'<hr><button id="apply">Сохранить</button><button id="remove">Удалить блок</button>');
 $('form').querySelectorAll('[data-edge]').forEach(b=>b.onclick=()=>{
   graph.edges.splice(+b.dataset.edge,1);persist();draw();$('modal').close();note('Связь удалена. Ctrl + Z — отменить.');
 });
 $('apply').onclick=()=>{
   try{
     if($('pattern')){
       try{new RegExp($('pattern').value);}catch{throw Error('Проверьте регулярное выражение для пути.');}
       if(!$('count').reportValidity())return;n.pattern=$('pattern').value;n.count=+$('count').value;
     }
     if($('level'))n.level=$('level').value;
     if($('time')){if(!$('time').reportValidity())return;n.time=$('time').value;armed=true;note('Расписание включено · '+n.time);}
     persist();draw();$('modal').close();
   }catch(e){alert(e.message);}
 };
 $('remove').onclick=()=>{
   graph.nodes=graph.nodes.filter(v=>v!==n);graph.edges=graph.edges.filter(e=>e.from!==n.id&&e.to!==n.id);
   if(bridge&&!graph.edges.some(e=>e.from===bridge.from&&e.port===bridge.port&&e.to===bridge.to))graph.edges.push(bridge);
   pending=null;states={};persist();draw();$('modal').close();
   note(bridge?'Блок удалён, соседние блоки соединены. Ctrl + Z — отменить.':'Блок удалён. Ctrl + Z — отменить.');
 };
}
const runProjects=new WeakMap();
const reportSending=new WeakSet();
const riskLabels={critical:'Критический',high:'Высокий',medium:'Средний',low:'Низкий',info:'Информация'};
function activeTab(id){
 for(const name of ['latest','history']){
   $(name).classList.toggle('active',name===id);$(name).setAttribute('aria-pressed',String(name===id));
 }
}
function emptyReport(icon,title,description){
 $('report').innerHTML='<div class="empty"><i>'+iconSvg(icon)+'</i><div><b>'+title+'</b><p>'+description+'</p></div></div>';
}
function report(r){
 activeTab('latest');
 $('resultCount').hidden=!r;
 if(!r){emptyReport('terminal','Отчёт появится после запуска','Нажмите «Запустить» или Ctrl + Enter, чтобы проверить проект.');return;}
 $('resultCount').textContent=r.findings.length;
 const ranks=Object.keys(riskLabels);
 const findings=[...r.findings].sort((a,b)=>ranks.indexOf(a.severity)-ranks.indexOf(b.severity));
 const live=runProjects.has(r)&&runProjects.get(r)===projectGeneration;
 const total=findings.length+' '+plural(findings.length,['находка','находки','находок']);
 const delivered=r.log.findLast(l=>l.state==='Готово'&&l.name===kinds.notify[0]);
 const log='<details class="log" '+(r.ok?'':'open')+'><summary>Журнал выполнения</summary>'+r.log.map(l=>'<p>'+esc(l.name||l.id)+' · '+esc(l.state)+' '+esc(l.detail)+'</p>').join('')+'</details>';
 $('report').innerHTML='<div class="report-head"><div><strong>'+(!r.ok?'Проверка остановлена':findings.length?total:'Проверка завершена')+'</strong><small>'+esc(r.project)+' · '+esc(new Date(r.time).toLocaleString())+'</small></div>'+
 (live&&findings.length?'<button id="inspectFirst">Разобрать находки '+iconSvg('chevronRight')+'</button>':'')+'</div>'+
 (delivered?'<div class="delivery">'+iconSvg('circleCheck')+esc(delivered.detail)+'</div>':'')+log+
 findings.map((f,i)=>'<details class="finding" '+(i===0?'open':'')+'><summary><span class="severity '+esc(f.severity)+'">'+esc(riskLabels[f.severity]||f.severity)+'</span><b>'+esc(f.title)+'</b><code>'+esc(f.file)+':'+esc(f.line)+'</code></summary><p>'+esc(f.fix)+' '+esc(f.reference)+'</p>'+(f.advice?'<p><b>AI</b>　'+esc(f.advice)+'</p>':'')+'</details>').join('')+
 (!findings.length&&r.ok?'<p>По выбранным правилам находок нет.</p>':'');
 const actions=document.createElement('div');actions.className='report-send';
 const sendButton=document.createElement('button');sendButton.id='sendTelegram';sendButton.innerHTML=iconSvg('send')+'Отправить в Telegram';sendButton.disabled=reportSending.has(r);
 const feedback=document.createElement('small');feedback.id='sendTelegramStatus';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 actions.append(sendButton,feedback);$('report').querySelector('.report-head').after(actions);
 sendButton.onclick=async()=>{
   if(reportSending.has(r))return;
   reportSending.add(r);sendButton.disabled=true;feedback.textContent='Отправляем отчёт…';
   try{
     const account=await garden.reportAccount();
     if(!account.loggedIn){feedback.textContent='Войдите в аккаунт, затем нажмите отправку ещё раз.';await openReportAccount();return;}
     const result=await garden.sendReport(r);
     feedback.textContent='Отчёт сохранён и поставлен в очередь Telegram. Доставка обычно занимает до 15 секунд.';
     feedback.title='Отчёт '+result.id;note('Отчёт передан серверу для отправки PDF в Telegram.');
   }catch(error){feedback.textContent=connectionError(error);}
   finally{reportSending.delete(r);sendButton.disabled=false;}
 };
 if(live){
   if($('inspectFirst'))$('inspectFirst').onclick=()=>inspectFinding(r,findings,0);
   $('report').querySelectorAll('.finding code').forEach((code,index)=>{
     const {line}=findings[index],link=document.createElement('button');
     link.className='jump-source';link.textContent=code.textContent;link.title='Открыть строку '+line;
     link.onclick=e=>{e.preventDefault();inspectFinding(r,findings,index);};code.replaceChildren(link);
   });
 }
 $('report').scrollTop=0;
}
async function run(){
 if(hasUnsavedSources()){note('Сначала сохраните изменения кода (Ctrl+S) или отмените их.');return;}
 if(busy||importing)return;
 hideFirstCheck();showGraph();
 showPane('report',true);busy=true;updateUndo();states={};pending=null;draw();$('run').disabled=true;$('run').querySelector('span').textContent='Проверяем…';
 activeTab('latest');$('resultCount').hidden=true;note('Идёт проверка…');renderProgress();
 try{
   const r=await garden.run(graph);
   if(r.sourceChanged){
     $('filecount').textContent=r.fileCount+' '+plural(r.fileCount,['файл','файла','файлов']);
     await loadTree();
   }
   runProjects.set(r,projectGeneration);r.project=$('project').textContent;
   r.log.forEach(l=>l.name=kinds[graph.nodes.find(n=>n.id===l.id).type][0]);runs.unshift(r);runs=runs.slice(0,20);report(r);
   note(r.ok?'Проверка завершена.':'Проверка остановлена. Подробности в журнале.');
   while(runs.length){try{localStorage.setItem('garden.history',JSON.stringify(runs));break;}catch{runs.pop();}}
 }catch(e){
   const reason=e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
   note(reason);emptyReport('alert','Не удалось запустить проверку',esc(reason));
   const back=document.createElement('button');back.textContent='Вернуться к схеме';
   back.onclick=()=>{showPane('report',false);showGraph();focusPalette();};$('report').querySelector('.empty p').after(back);
 }finally{busy=false;updateUndo();$('run').disabled=false;$('run').querySelector('span').textContent='Запустить';}
}
function renderProgress(){
 const total=graph.nodes.length,finished=Object.values(states).filter(v=>v==='Готово'||v==='Пропущен').length;
 const current=graph.nodes.find(n=>states[n.id]==='Выполняется');
 const text=current?kinds[current.type][0]:'Подготовка проверки';
 $('report').innerHTML='<div class="run-progress" role="status"><b>'+esc(text)+'</b><span>'+finished+' из '+total+' блоков завершено</span>'+
 '<progress aria-label="Ход проверки" max="'+Math.max(1,total)+'" value="'+finished+'"></progress>'+
 (current?.type==='ai'?'<small>Ожидаем пояснения модели. Находки уже собраны.</small>':'')+'</div>';
}
garden.status(s=>{
 states[s.id]=s.state;draw();const n=graph.nodes.find(n=>n.id===s.id);
 if(busy&&$('latest').classList.contains('active'))renderProgress();
 if(n&&s.state==='Выполняется')note('Выполняется блок «'+kinds[n.type][0]+'»…');
});
$('run').onclick=run;$('latest').onclick=()=>{if(!busy)report(runs[0]);};
$('history').onclick=()=>{
 activeTab('history');$('report').replaceChildren();
 if(!runs.length)emptyReport('clock','История пока пуста','Здесь сохраняются последние 20 запусков.');
 runs.forEach(r=>{
   const b=document.createElement('button');b.className='history-row';
   b.innerHTML=iconSvg(r.ok?'circleCheck':'alert')+esc(r.project)+'<small>'+esc(new Date(r.time).toLocaleString())+' · '+r.findings.length+' '+plural(r.findings.length,['находка','находки','находок'])+'</small>';
   b.onclick=()=>report(r);$('report').append(b);
 });
};
document.addEventListener('keydown',e=>{
 if($('modal').open||e.repeat)return;
 if(e.ctrlKey&&e.code==='KeyK'){e.preventDefault();focusPalette();}
 if(e.ctrlKey&&['KeyZ','KeyY'].includes(e.code)&&!e.target.closest('input,textarea,select')){
   e.preventDefault();if(e.code==='KeyY'||e.shiftKey)restore(future,past);else restore(past,future);
 }
 if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();run();}
 if(e.key==='Escape'&&(pending||cableGesture)){stopCable(true);pending=null;draw();note(help);}
});
for(const kind of ['folder','catalog'])$(kind).onclick=async()=>{
 if(busy||importing)return;
 if(kind==='folder'&&!confirmDiscardSources())return;
 importing=true;$('run').disabled=true;
 try{
   const imported=await garden.import(kind);
   if(!imported)return;
   if(kind==='folder'){
     hasProjectFolder=true;hideFirstCheck();$('project').textContent=imported.name;
     $('filecount').textContent=imported.count+' '+plural(imported.count,['файл','файла','файлов']);
     await loadTree();showPane('report',false);
     note('Проект открыт. Нажмите «Запустить», чтобы проверить файлы.');
   }else{
     $('catalogName').textContent=imported.name+' · '+imported.count+' '+plural(imported.count,['запись','записи','записей']);
     note('Справочник подключён. Следующая проверка зависимостей использует его.');
   }
 }catch(e){note(e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}
 finally{importing=false;$('run').disabled=false;}
};
const localModelEndpoint='http://127.0.0.1:11434/api/chat';

function connectionError(error){
 const reason=error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
 if(/fetch failed|ECONNREFUSED|timed?\s*out/i.test(reason))return 'Сервис не ответил. Проверьте адрес и убедитесь, что модель запущена.';
 if(/HTTP 401|HTTP 403/.test(reason))return 'Сервис отклонил запрос. Проверьте ключ и доступ к модели.';
 if(/HTTP 404/.test(reason))return 'Сервис не нашёл модель или адрес API. Проверьте настройки подключения.';
 if(/invalid url/i.test(reason))return 'Проверьте адрес сервиса. Нужен полный URL.';
 return reason;
}
async function openConnections(fromGenerator=false){
 const c=await garden.settings().catch(e=>{note(connectionError(e));return null;});
 if(!c)return;
 const local=c.endpoint===localModelEndpoint||c.endpoint==='http://localhost:11434/api/chat';
 const originalProvider=c.model?(local?'local':'api'):'rules';
 modal('<h2>Подключения</h2><label>Объяснение находок<select id="provider"><option value="rules">Рекомендации правил</option><option value="local">Ollama на этом компьютере</option><option value="api">Другой сервер модели</option></select></label>'+
   '<small id="providerHint"></small><div id="modelPanel"><label id="addressLabel">Адрес API модели<input id="endpoint" type="url" placeholder="https://…/v1/chat/completions"></label>'+
   '<label>Название модели<input id="model" list="localOptions" autocomplete="off" placeholder="Введите название"><datalist id="localOptions"></datalist></label>'+
   '<small id="modelHint" role="status"></small><div id="keyPanel"><label>API-ключ<input id="key" type="password" autocomplete="new-password"></label>'+
   '<label id="clearLabel"><input type="checkbox" id="clearKey"> Удалить сохранённый ключ</label></div></div>'+
   '<hr><label>Куда отправлять отчёт<select id="delivery"><option value="local">На этот компьютер</option><option value="webhook">На адрес команды (webhook)</option></select></label>'+
   '<div id="hookPanel"><label>Адрес webhook<input id="hook" type="password" autocomplete="new-password"></label>'+
   '<label>Токен сессии сервера отчётов (если требуется)<input id="hookKey" type="password" autocomplete="new-password"></label>'+
   '<label><input id="clearHookKey" type="checkbox"> Удалить сохранённый токен webhook</label></div><small id="deliveryHint"></small>'+
   '<p id="connectionFeedback" role="alert"></p><button id="apply">Сохранить</button>'+
   (fromGenerator?'<button id="backToPrompt">К описанию</button>':''));
 const provider=$('provider'),model=$('model'),endpoint=$('endpoint'),key=$('key'),hook=$('hook'),delivery=$('delivery'),feedback=$('connectionFeedback');
 const names={local:local?c.model:'',api:local?'':c.model};
 let current=originalProvider;
 provider.value=originalProvider;delivery.value=c.hasHook?'webhook':'local';
 endpoint.value=local?'':c.endpoint;
 function updateKey(){
   const retained=c.hasKey&&endpoint.value.trim()===c.endpoint;
   key.placeholder=retained?'Ключ сохранён':'Если требуется сервером';
   $('clearLabel').hidden=!retained;
 }
 function updateProvider(){
   const choice=provider.value;
   if(current!=='rules')names[current]=model.value;
   current=choice;model.value=names[choice]||'';
   $('modelPanel').hidden=choice==='rules';$('addressLabel').hidden=choice!=='api';$('keyPanel').hidden=choice!=='api';
   $('providerHint').textContent={rules:'Демо и проверка проекта готовы к запуску.',local:'Описания найденных рисков обрабатываются на этом компьютере.',api:'Сервер модели получает описания найденных рисков.'}[choice];
   const list=$('localOptions'),hint=$('modelHint');list.replaceChildren();hint.textContent='';
   if(choice==='local'){
     hint.textContent='Ищем установленные модели…';
     garden.localModels().then(items=>{
       if(!list.isConnected||provider.value!=='local')return;
       for(const name of items){const opt=document.createElement('option');opt.value=name;list.append(opt);}
       if(!model.value&&items.length===1)model.value=items[0];
       hint.textContent=items.length?'Выберите установленную модель или введите её название.':'В Ollama пока нет моделей. Добавьте модель и укажите её название.';
     }).catch(()=>{if(list.isConnected&&provider.value==='local')hint.textContent='Запустите Ollama и укажите название установленной модели.';});
   }
 }
 function updateDelivery(){
   $('hookPanel').hidden=delivery.value==='local';hook.placeholder=c.hasHook?'Адрес сохранён':'https://…';
   $('hookKey').placeholder=c.hasHookKey?'Токен сохранён':'Токен из локального сервера отчётов';
   $('deliveryHint').textContent=delivery.value==='local'?'Встроенный HTTP-приёмник сохранит отчёт на этом компьютере.':'Блок HTTP webhook отправит JSON-отчёт на этот адрес.';
 }
 model.value=c.model;updateProvider();updateDelivery();updateKey();
 provider.onchange=updateProvider;delivery.onchange=updateDelivery;endpoint.oninput=updateKey;
 if(fromGenerator)$('backToPrompt').onclick=()=>openGenerator();
 $('apply').onclick=async()=>{
   feedback.textContent='';
   if(provider.value!=='rules'&&!model.value.trim()){feedback.textContent='Укажите название модели.';model.focus();return;}
   if(provider.value==='api'&&(!endpoint.value.trim()||!endpoint.reportValidity())){feedback.textContent='Введите полный адрес API.';endpoint.focus();return;}
   if(delivery.value==='webhook'&&!c.hasHook&&!hook.value.trim()){feedback.textContent='Укажите адрес webhook команды.';hook.focus();return;}
   const button=$('apply');button.disabled=true;
   try{
     await garden.configure({model:provider.value==='rules'?'':model.value.trim(),endpoint:provider.value==='local'?localModelEndpoint:provider.value==='api'?endpoint.value.trim():c.endpoint,
       key:provider.value==='api'?key.value.trim():'',clearKey:provider.value==='api'&&$('clearKey').checked,
       hook:hook.value.trim(),hookKey:$('hookKey').value.trim(),clearHookKey:$('clearHookKey').checked,localDelivery:delivery.value==='local'});
     if(!button.isConnected||!$('modal').open)return;
     if(fromGenerator)await openGenerator();else $('modal').close();note('Подключения сохранены.');
   }catch(e){feedback.textContent=connectionError(e);}finally{button.disabled=false;}
 };
}
$('settings').onclick=()=>openConnections();

async function openReportAccount(){
 modal('<h2>Отчёты в Telegram</h2><p>Войдите в аккаунт локального сервера. После проверки нажмите «Отправить в Telegram» в отчёте.</p>'+
 '<p id="reportAccountStatus" role="status">Проверяем подключение…</p><div id="reportLoginPanel" hidden>'+
 '<form id="reportLoginForm"><label>Сервер<input id="reportServer" type="url" required value="http://127.0.0.1:8787"></label>'+
 '<label>Логин<input id="reportLogin" autocomplete="username" required></label><label>Пароль<input id="reportPassword" type="password" autocomplete="current-password" required></label>'+
 '<button type="submit" id="reportSignIn">Войти</button></form></div>'+
 '<div id="reportConnectedPanel" hidden><p id="reportTelegramState"></p><div class="report-account-actions"><button id="reportPair">Получить код для бота</button><button id="reportRefresh">Обновить статус</button><button id="reportSignOut">Выйти</button></div>'+
 '<pre id="reportPairCode" hidden></pre></div><p id="reportAccountError" role="alert"></p>');
 const root=$('reportAccountStatus');
 async function refresh(){
   const account=await garden.reportAccount();if(!root.isConnected)return;
   $('reportAccountStatus').textContent=account.loggedIn?'Аккаунт: '+account.login+(account.expires?' · вход до '+new Date(account.expires).toLocaleString():''):account.expired?'Сессия истекла. Войдите снова.':'Войдите в аккаунт сервера отчётов.';
   $('reportLoginPanel').hidden=account.loggedIn;$('reportConnectedPanel').hidden=!account.loggedIn;
   $('reportServer').value=account.base;$('reportLogin').value=account.login;
   if(account.loggedIn)$('reportTelegramState').textContent=account.telegramChats?'Telegram подключён. Активных чатов: '+account.telegramChats:'Telegram ещё не подключён. Получите код и отправьте команду своему боту.';
 }
 async function action(button,fn){
   button.disabled=true;$('reportAccountError').textContent='';
   try{await fn();}catch(error){if(root.isConnected)$('reportAccountError').textContent=connectionError(error);}finally{button.disabled=false;}
 }
 $('reportLoginForm').onsubmit=event=>{
   event.preventDefault();const credentials={base:$('reportServer').value.trim(),login:$('reportLogin').value.trim(),password:$('reportPassword').value};$('reportPassword').value='';
   action($('reportSignIn'),async()=>{await garden.reportLogin(credentials);await refresh();});
 };
 $('reportRefresh').onclick=()=>action($('reportRefresh'),refresh);
 $('reportSignOut').onclick=()=>action($('reportSignOut'),async()=>{await garden.reportLogout();if(!root.isConnected)return;$('reportPairCode').textContent='';$('reportPairCode').hidden=true;await refresh();});
 $('reportPair').onclick=()=>action($('reportPair'),async()=>{
   const result=await garden.reportCode();if(!root.isConnected)return;
   $('reportPairCode').textContent='/login '+result.code+'\nОтправьте команду своему боту в личном чате.\nКод действует до '+new Date(result.expires).toLocaleTimeString();$('reportPairCode').hidden=false;
 });
 try{await refresh();}catch(error){if(root.isConnected){$('reportAccountStatus').textContent='Не удалось подключиться к серверу';$('reportAccountError').textContent=connectionError(error);$('reportLoginPanel').hidden=false;}}
}
$('telegramAccount').onclick=()=>openReportAccount();
$('saveGraph').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(graph,null,2)],{type:'application/json'}));a.download='workflow.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$('loadGraph').onclick=()=>{if(!busy)$('json').click();};$('json').onchange=async e=>{try{const g=JSON.parse(await e.target.files[0].text());if(!Array.isArray(g.nodes)||g.nodes.length>64||!Array.isArray(g.edges)||g.edges.length>256||g.nodes.some(n=>!Object.hasOwn(kinds,n.type)||typeof n.id!=='string'||!Number.isFinite(n.x)||!Number.isFinite(n.y))||g.edges.some(a=>!g.nodes.some(n=>n.id===a.from)||!g.nodes.some(n=>n.id===a.to)))throw Error('Некорректная схема');graph=g;armed=false;states={};pending=null;persist();draw();}catch(err){note(err.message);}e.target.value='';};
setInterval(()=>{const now=new Date(),minute=now.toTimeString().slice(0,5),key=now.toDateString()+minute;if(armed&&lastMinute!==key&&graph.nodes.some(n=>n.type==='schedule'&&n.time===minute)){lastMinute=key;run();}},1000);
draw();report(runs[0]);

function useTemplate(g){
 graph=structuredClone(g);pending=null;states={};armed=false;persist();draw();$('modal').close();note('Схема загружена. Можно изменить блоки или запустить проверку.');
}
let generatorText='';
async function openGenerator(){
 if(busy)return;
 const c=await garden.settings().catch(e=>{note(connectionError(e));return null;});if(!c)return;
 modal('<h2>Сценарий по описанию</h2><label>Что и когда нужно проверить?<input id="prompt" maxlength="1200" placeholder="Каждое утро в 09:00 искать секреты и отправлять отчёт"></label>'+
   '<small id="modelStatus"></small><p id="feedback" role="status"></p><button id="make"></button>'+
   (c.model?'<button id="changeModel">Сменить модель</button>':''));
 const prompt=$('prompt'),button=$('make'),feedback=$('feedback');
 prompt.value=generatorText;button.textContent=c.model?'Создать схему':'Выбрать модель';
 $('modelStatus').textContent=c.model?'Модель · '+c.model:'Для генерации выберите локальную Ollama или сервер модели.';
 const configure=()=>{generatorText=prompt.value;openConnections(true);};
 if(c.model)$('changeModel').onclick=configure;
 let draft=null;
 prompt.oninput=()=>{generatorText=prompt.value;draft=null;feedback.textContent='';button.textContent=c.model?'Создать схему':'Выбрать модель';};
 prompt.onkeydown=e=>{if(e.key==='Enter'&&!button.disabled){e.preventDefault();button.click();}};
 button.onclick=async()=>{
   if(!c.model){configure();return;}
   if(draft){useTemplate(draft);generatorText='';return;}
   if(!prompt.value.trim()){feedback.textContent='Опишите проверку одним предложением.';prompt.focus();return;}
   generatorText=prompt.value;prompt.disabled=true;button.disabled=true;feedback.textContent='Модель собирает сценарий…';
   try{
     draft=await garden.generate(generatorText);
     if(!button.isConnected||!$('modal').open)return;
     feedback.textContent=draft.nodes.map(n=>kinds[n.type][0]).join(' → ');button.textContent='Применить схему';
   }catch(e){feedback.textContent=connectionError(e);}finally{button.disabled=false;prompt.disabled=false;}
 };
 prompt.focus();
}
$('generate').onclick=()=>openGenerator();
async function templates(action='list',item){
 try{
 const {items,library}=await garden.library(action,item);
 const codeTemplates=gardenBlockPresets.map((definition,i)=>({title:definition.title,description:'Потенциальный риск: буквальный поиск «'+definition.needle+'»; результат требует проверки контекста.',graph:{nodes:[{id:'start',type:'manual',x:42,y:44},{id:'check',type:'custom',definition:structuredClone(definition),x:304,y:44},{id:'ai',type:'ai',x:566,y:44}],edges:[{from:'start',to:'check',port:'next'},{from:'check',to:'ai',port:'next'}]}}));
 const list=[...codeTemplates,{title:'Проверка Kotlin-проекта',description:'Секреты, зависимости и правила Spring с доставкой отчёта.',graph:initial},...items];
 if($('modal').open)$('modal').close();
 modal('<h2>Библиотека шаблонов</h2><small>'+esc(library)+'</small><p><button id="choose">Выбрать общую папку…</button></p>'+list.map((t,i)=>'<p><button data-template="'+i+'">'+esc(t.title)+'</button><br><small>'+esc(t.description)+'</small></p>').join('')+'<hr><label>Название текущего сценария<input id="templateName" maxlength="100"></label><label>Что он проверяет<input id="description" maxlength="500"></label><button id="publish">Опубликовать в папке</button>');
 $('choose').onclick=()=>templates('choose');
 $('publish').onclick=()=>templates('publish',{title:$('templateName').value,description:$('description').value,graph});
 $('form').querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>useTemplate(list[+b.dataset.template].graph));
 }catch(e){alert(e.message);}
}
$('templates').onclick=()=>{if(!busy)templates();};
$('ci').onclick=()=>{
 const yaml=[
 'name: Kotlin security workflow','on: [push, pull_request]','permissions:','  contents: read','jobs:','  scan:','    runs-on: ubuntu-latest','    steps:','      - uses: actions/checkout@v4','      - uses: actions/setup-node@v4','        with:','          node-version: 22','      - name: Check training project','        env:','          REPORT_WEBHOOK: ${{ secrets.REPORT_WEBHOOK }}','          LLM_ENDPOINT: ${{ vars.LLM_ENDPOINT }}','          LLM_MODEL: ${{ vars.LLM_MODEL }}','          LLM_KEY: ${{ secrets.LLM_KEY }}','        run: node garden/cli.cjs . workflow.json advisories.json > security-report.json','      - uses: actions/upload-artifact@v4','        if: always()','        with:','          name: security-report','          path: security-report.json'].join('\n');
 modal('<h2>GitHub Actions</h2><p>В учебный репозиторий поместите каталог garden, экспорт схемы workflow.json и справочник advisories.json. Для доставки добавьте секрет REPORT_WEBHOOK.</p><p>Сохраните файл задания в .github/workflows. Критическая находка остановит сборку.</p><button id="downloadCi">Скачать security.yml</button>');
 $('downloadCi').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([yaml]));a.download='security.yml';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
};

$('githubImport').onclick=()=>{
 if(busy||importing||!confirmDiscardSources())return;
 modal('<h2>Импорт проекта из GitHub</h2><p>Используйте учебные репозитории, разрешённые для проверки. Загружаются исходники и конфигурации без выполнения кода.</p>'+
 '<label>Ссылка на репозиторий<input id="githubUrl" type="url" placeholder="https://github.com/owner/repository" autocomplete="off"></label>'+
 '<label>Ветка или коммит (необязательно)<input id="githubBranch" maxlength="200" placeholder="По умолчанию — основная ветка"></label>'+
 '<label>Токен для приватного репозитория (необязательно)<input id="githubToken" type="password" autocomplete="off" maxlength="512"></label>'+
 '<p><small>Токен отправляется только GitHub и не сохраняется. Вход в аккаунт браузера не используется. Импорт создаёт снимок проекта; для обновления повторите импорт.</small></p>'+
 '<p id="githubStatus" role="status"></p><button id="githubSubmit">Импортировать</button>');
 $('githubUrl').focus();
 $('githubSubmit').onclick=async()=>{
   if(busy||importing)return;
   const button=$('githubSubmit'),status=$('githubStatus');
   const options={url:$('githubUrl').value.trim(),branch:$('githubBranch').value.trim(),token:$('githubToken').value.trim()};
   $('githubToken').value='';importing=true;$('run').disabled=true;button.disabled=true;
   status.textContent='Загрузка проекта из GitHub…';
   try{
     const imported=await garden.importGithub(options);
     hasProjectFolder=false;hideFirstCheck();$('project').textContent=imported.name;
     $('filecount').textContent=imported.count+' '+plural(imported.count,['файл','файла','файлов']);
     await loadTree();showGraph();showPane('project',true);showPane('report',false);
     if(button.isConnected)$('modal').close();
     note('Импортирован '+imported.name+' · '+imported.commit.slice(0,7)+'. Нажмите «Запустить».');
   }catch(e){
     const message=e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
     status.textContent=message;note(message);
   }finally{options.token='';importing=false;$('run').disabled=false;button.disabled=false;}
 };
};

function editCustomBlock(node,preset){
 const rule=node?.definition||preset||{title:'',needle:'',path:'',severity:'medium',fix:'',caseSensitive:false};
 modal('<h2>'+ (node?'Настроить блок':'Создать или изменить блок')+'</h2><p>Собственное правило ищет текст в строках исходников. Сохраняется в «Мои блоки» и добавляется в сценарий.</p>'+
 '<label>Название<input id="customTitle" maxlength="100" value="'+esc(rule.title)+'"></label>'+
 '<label>Искомый текст (одна строка)<input id="customNeedle" maxlength="500" value="'+esc(rule.needle)+'"></label>'+
 '<label>Путь содержит (необязательно)<input id="customPath" maxlength="200" value="'+esc(rule.path)+'" placeholder="Например, .kt или src/main/"></label>'+
 '<label>Критичность<select id="customSeverity">'+Object.entries(riskLabels).map(([v,label])=>'<option value="'+v+'" '+(v===rule.severity?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
 '<label><input id="customCase" type="checkbox" '+(rule.caseSensitive?'checked':'')+'> Учитывать регистр</label>'+
 '<label>Рекомендация<textarea id="customFix" maxlength="1000">'+esc(rule.fix)+'</textarea></label>'+
 '<p id="customError" role="status"></p><button id="saveCustom">'+(node?'Сохранить блок':'Сохранить в библиотеку')+'</button>'+
 (node||preset?'<button id="deleteCustom">'+(node?'Удалить из сценария':'Удалить из библиотеки')+'</button>':''));
 $('saveCustom').onclick=()=>{
   const definition={title:$('customTitle').value.trim(),needle:$('customNeedle').value,path:$('customPath').value.trim(),severity:$('customSeverity').value,fix:$('customFix').value.trim(),caseSensitive:$('customCase').checked};
   if(!definition.title||!definition.needle.trim()||!definition.fix||/[\r\n]/.test(definition.needle)){$('customError').textContent='Заполните название, искомый текст и рекомендацию.';return;}
   let list=read('garden.customBlocks',[]).filter(v=>v.title!==(preset?.title||node?.definition?.title||definition.title)&&v.title!==definition.title);
   if(list.length>=50){$('customError').textContent='В библиотеке уже 50 блоков. Удалите ненужные.';return;}
   list.push(definition);localStorage.setItem('garden.customBlocks',JSON.stringify(list));
   if(node){node.definition=definition;states={};persist();draw();}
   $('blockSearch').value='';palette();showPane('blocks',true);$('modal').close();note('Блок «'+definition.title+'» сохранён в библиотеке.');
 };
 if($('deleteCustom'))$('deleteCustom').onclick=()=>{
   if(node){
     const incoming=graph.edges.filter(e=>e.to===node.id),outgoing=graph.edges.filter(e=>e.from===node.id);
     graph.nodes=graph.nodes.filter(n=>n!==node);graph.edges=graph.edges.filter(e=>e.from!==node.id&&e.to!==node.id);
     if(incoming.length===1&&outgoing.length===1)graph.edges.push({from:incoming[0].from,port:incoming[0].port,to:outgoing[0].to});
     states={};persist();draw();
   }else{localStorage.setItem('garden.customBlocks',JSON.stringify(read('garden.customBlocks',[]).filter(v=>v.title!==preset.title)));palette();}
   $('modal').close();note('Блок удалён.');
 };
}
$('createCustomBlock').onclick=()=>{if(!busy&&!importing)editCustomBlock(null);};
