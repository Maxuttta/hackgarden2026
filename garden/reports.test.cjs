const {test}=require('node:test'),assert=require('node:assert/strict');
const {ReportClient,serverUrl}=require('./reports.cjs');
const token='private-session-token';
function fixture(){
 let stored,linked=true,expired=false,unavailable=false;const calls=[];
 const client=new ReportClient(()=>stored,async value=>{stored=value;},async(url,options)=>{
  if(unavailable)throw Error('network');
  calls.push({url,...options});
  const route=new URL(url).pathname;
  if(route==='/api/login'){
   const body=JSON.parse(options.body);
   return {ok:body.password==='correct-password',status:body.password==='correct-password'?200:401,json:async()=>body.password==='correct-password'?{user:{login:'tester'},token}:{error:'Неверный логин или пароль'}};
  }
  if(expired)return {ok:false,status:401,json:async()=>({error:'expired'})};
  assert.equal(options.headers.Authorization,'Bearer '+token);
  let data={};
  if(route==='/api/me')data={sessionId:'app',sessions:[{id:'app',kind:'web',expires:10000},...(linked?[{kind:'telegram',id:'chat'}]:[])]};
  if(route==='/api/reports')data={id:'saved-report'};
  if(route==='/api/telegram/code')data={code:'one-time-code',expires:10000};
  return {ok:true,json:async()=>data};
 });
 return {client,calls,stored:()=>stored,setLinked:value=>{linked=value;},expire:()=>{expired=true;},disconnect:()=>{unavailable=true;}};
}
const credentials={base:'http://127.0.0.1:8787',login:'tester',password:'correct-password'};
test('report client restricts server addresses to local HTTP origins',()=>{
 assert.equal(serverUrl(),'http://127.0.0.1:8787');assert.equal(serverUrl('http://localhost:1234/'),'http://localhost:1234');
 for(const url of ['https://evil.example','http://127.0.0.1:8787/other','http://user:password@localhost:8787','http://localhost:8787/?token=secret','file:///local','http://127.0.0.1.evil.example'])assert.throws(()=>serverUrl(url));
});
test('app login stores only session credentials; public status never exposes the token',async()=>{
 const f=fixture();assert.equal((await f.client.status()).loggedIn,false);
 await assert.rejects(f.client.login({...credentials,password:'incorrect'}),/Неверный логин/);
 assert.equal(f.stored(),undefined);
 const status=await f.client.login(credentials);
 assert.equal(status.telegramChats,1);assert.equal(status.login,'tester');
 assert.equal(f.stored().token,token);assert.equal(f.stored().password,undefined);
 assert.ok(!JSON.stringify(status).includes(token));
 assert.equal(f.calls[1].headers.Authorization,undefined);
 assert.equal((await f.client.code()).code,'one-time-code');
 await f.client.logout();assert.equal(f.stored().token,'');assert.equal((await f.client.status()).loggedIn,false);
});
test('direct send includes selected report, supports empty reports, and requires a linked Telegram session',async()=>{
 const f=fixture();await f.client.login(credentials);
 const findings=[{title:'Риск',severity:'high',file:'Config.kt',line:4}];
 assert.equal((await f.client.send({project:'Проект',findings})).id,'saved-report');
 const sent=JSON.parse(f.calls.find(x=>x.url.endsWith('/api/reports')).body);
 assert.deepEqual(sent,{title:'Cyber Garden · Проект',findings});
 await f.client.send({project:'Без находок',findings:[]});
 f.setLinked(false);const previous=f.calls.filter(x=>x.url.endsWith('/api/reports')).length;
 await assert.rejects(f.client.send({findings}),/Сначала подключите Telegram/);
 assert.equal(f.calls.filter(x=>x.url.endsWith('/api/reports')).length,previous);
});
test('revoked sessions are cleared; unavailable server preserves credentials and reports an actionable error',async()=>{
 const f=fixture();await f.client.login(credentials);f.expire();
 const status=await f.client.status();assert.equal(status.expired,true);assert.equal(f.stored().token,'');
 await assert.rejects(f.client.send({findings:[]}),/Войдите в аккаунт/);
 const offline=fixture();await offline.client.login(credentials);offline.disconnect();
 await assert.rejects(offline.client.status(),/Сервер отчётов недоступен/);assert.equal(offline.stored().token,token);
});
