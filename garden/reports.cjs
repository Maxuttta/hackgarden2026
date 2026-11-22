const DEFAULT_SERVER='http://127.0.0.1:8787';
function serverUrl(raw=DEFAULT_SERVER){
 const url=new URL(raw);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Укажите локальный сервер: http://127.0.0.1:8787');
 return url.origin;
}
class ReportClient{
 constructor(load,save,fetchImpl=fetch){this.load=load;this.save=save;this.fetch=fetchImpl;}
 async request(account,route,{body,method='GET',authenticated=true}={}){
  if(authenticated&&!account.token)throw Error('Войдите в аккаунт для отправки отчётов');
  let response;
  try{response=await this.fetch(serverUrl(account.base)+route,{method,redirect:'error',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+account.token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});}
  catch{throw Error('Сервер отчётов недоступен. Запустите server и проверьте адрес.');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=Error(response.status===401&&authenticated?'Сессия истекла. Войдите в аккаунт снова.':typeof data.error==='string'?data.error:'Ошибка сервера отчётов');error.status=response.status;throw error;}
  return data;
 }
 async status(){
  const account=this.load()||{};
  if(!account.token)return {loggedIn:false,base:account.base||DEFAULT_SERVER,login:account.login||''};
  try{
   const me=await this.request(account,'/api/me');
   return {loggedIn:true,base:account.base,login:account.login,telegramChats:me.sessions.filter(s=>s.kind==='telegram').length,expires:me.sessions.find(s=>s.id===me.sessionId)?.expires};
  }catch(error){
   if(error.status!==401)throw error;
   await this.save({...account,token:''});
   return {loggedIn:false,base:account.base,login:account.login,expired:true};
  }
 }
 async login({base,login,password}){
  const account={base:serverUrl(base),login};
  const result=await this.request(account,'/api/login',{method:'POST',authenticated:false,body:{login,password}});
  account.login=result.user.login;account.token=result.token;
  try{await this.save(account);}catch(error){await this.request(account,'/api/logout',{method:'POST'}).catch(()=>{});throw error;}
  return this.status();
 }
 async logout(){
  const account=this.load()||{};
  if(account.token){try{await this.request(account,'/api/logout',{method:'POST'});}catch(error){if(error.status!==401)throw error;}}
  await this.save({...account,token:''});
 }
 code(){return this.request(this.load()||{},'/api/telegram/code',{method:'POST'});}
 async send(report,{includeJson=false}={}){
  const account={...this.load()};
  const me=await this.request(account,'/api/me');
  if(!me.sessions.some(s=>s.kind==='telegram'))throw Error('Сначала подключите Telegram: откройте «Telegram» и получите код входа для бота.');
  if(!report||!Array.isArray(report.findings))throw Error('Сначала выполните проверку');
  const title='Cyber Garden · '+String(report.project||'Проверка проекта').slice(0,150);
  return this.request(account,'/api/reports',{method:'POST',body:{title,findings:report.findings,...(includeJson?{includeJson:true}:{})}});
 }
}
module.exports={ReportClient,serverUrl};
