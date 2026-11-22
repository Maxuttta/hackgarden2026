const {_electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {JsonRepository}=require('../server/store.cjs'),{ReportService}=require('../server/service.cjs'),{createServer}=require('../server/http.cjs');
(async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'garden-direct-reports-'));
 const repo=await new JsonRepository(path.join(directory,'data')).open();
 const service=new ReportService(repo),server=createServer(service,{port:0});
 let app;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const login='smoke-user',password='temporary-smoke-password';
  const user=await service.login(login,password,true),auth=await service.authenticate(user.token);
  const code=await service.createCode(auth);await service.link(code.code,12345);
  async function launch(){
   app=await _electron.launch({args:[path.resolve(__dirname,'..'),'--profile-dir='+path.join(directory,'profile')]});
   const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.locator('#telegramAccount').waitFor();return page;
  }
  let page=await launch();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#telegramAccount').click();
  await page.locator('#reportServer').fill(base);await page.locator('#reportLogin').fill(login);await page.locator('#reportPassword').fill(password);
  await page.locator('#reportSignIn').click();await page.locator('#reportConnectedPanel').waitFor({state:'visible'});
  assert.match(await page.locator('#reportTelegramState').innerText(),/Telegram подключён/);
  assert.equal(await page.locator('#reportPassword').inputValue(),'');
  await page.locator('#reportPair').click();await page.locator('#reportPairCode').waitFor({state:'visible'});
  assert.match(await page.locator('#reportPairCode').innerText(),/\/login [a-f0-9]{24}/);
  await page.keyboard.press('Escape');await page.keyboard.press('Control+Enter');await page.locator('#sendTelegram').waitFor();
  await page.locator('#sendTelegram').click();await page.waitForFunction(()=>document.getElementById('sendTelegramStatus')?.textContent.includes('в очереди отправки в Telegram'));
  let reports=await service.reports(auth);assert.equal(reports.length,1);assert.equal(reports[0].count,3);
  assert.equal(await repo.read(s=>s.deliveries.length),1);
  const pdfResponse=await fetch(base+'/api/reports/'+reports[0].id+'/pdf',{headers:{Authorization:'Bearer '+user.token}});
  assert.equal(pdfResponse.headers.get('content-type'),'application/pdf');assert.equal(Buffer.from(await pdfResponse.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  await app.close();app=null;page=await launch();
  await page.locator('#telegramAccount').click();await page.locator('#reportConnectedPanel').waitFor({state:'visible'});
  assert.match(await page.locator('#reportAccountStatus').innerText(),/smoke-user/);await page.keyboard.press('Escape');
  if(!await page.locator('#history').isVisible())await page.locator('#reportToggle').click();
  await page.locator('#history').click();await page.locator('.history-row').first().click();
  await page.locator('#sendTelegram').click();await page.waitForFunction(()=>document.getElementById('sendTelegramStatus')?.textContent.includes('в очереди отправки в Telegram'));
  assert.equal((await service.reports(auth)).length,2);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(900,680));
  await page.waitForFunction(()=>innerWidth===900);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await page.locator('#telegramAccount').isVisible());
  await fs.mkdir(path.resolve(__dirname,'../tmp'),{recursive:true});
  await page.screenshot({path:path.resolve(__dirname,'../tmp/direct-reports.png')});
  const tg=await service.telegramSession(12345);await service.revoke(auth,tg.id);
  await page.locator('#sendTelegram').click();await page.waitForFunction(()=>document.getElementById('sendTelegramStatus')?.textContent.includes('Сначала подключите Telegram'));
  assert.equal((await service.reports(auth)).length,2);
  await page.locator('#telegramAccount').click();await page.locator('#reportConnectedPanel').waitFor({state:'visible'});
  await page.locator('#reportSignOut').click();await page.locator('#reportLoginPanel').waitFor({state:'visible'});
  assert.equal((await service.sessions(auth)).filter(x=>x.kind==='web').length,1);
  assert.deepEqual(errors,[]);
  console.log('Electron direct reports: login, pairing, scan, send, PDF, persisted session, history, missing Telegram and logout passed. No Telegram messages sent.');
 }finally{
  await app?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await repo.close();await fs.rm(directory,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
