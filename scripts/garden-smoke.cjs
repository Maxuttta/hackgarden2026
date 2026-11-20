const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function checkWorkspace(page) {
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    run: document.querySelector('#run').getBoundingClientRect().right
  }));
  assert.equal(layout.viewport, 900);
  assert.ok(layout.document <= layout.viewport, 'The workspace must fit the window width');
  assert.ok(layout.run <= layout.viewport, 'The run button must be visible without scrolling');

  await page.keyboard.press('Control+k');
  assert.ok(await page.locator('#blockSearch').evaluate(field => field === document.activeElement),
    'Ctrl+K should focus the block search field');

  const settings = page.locator('#settings');
  await settings.focus();
  await page.keyboard.press('Enter');
  await page.locator('#modal[open]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#modal').waitFor({state: 'hidden'});
  assert.ok(await settings.evaluate(button => button === document.activeElement),
    'Closing settings should restore keyboard focus');


  const output=page.locator('[data-kind=manual] [data-port=next]');
  const input=page.locator('[data-kind=sca] [data-port=in]');
  async function pull(from,to,cancel=false){
    const a=await from.boundingBox(),b=await to.boundingBox();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});
    await page.locator('.cable-preview').waitFor({state:'attached',timeout:3000});
    if(cancel)await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal(await page.locator('.cable-preview').count(),0);
  }
  await pull(output,input,true);
  assert.match(await page.locator('#summary').innerText(),/5 связей/);
  await pull(output,input);
  assert.match(await page.locator('#summary').innerText(),/6 связей/);
  await pull(output,input);
  assert.match(await page.locator('#summary').innerText(),/6 связей/);
  await page.keyboard.press('Control+z');
  await page.locator('#zoomOut').click();await pull(input,output);
  assert.match(await page.locator('#summary').innerText(),/6 связей/);
  await page.keyboard.press('Control+z');
  await output.click();await input.click();
  const graph = await page.evaluate(() => JSON.parse(localStorage.getItem('garden.graph')));
  assert.ok(graph.edges.some(edge => edge.from === graph.nodes[0].id &&
    edge.to === graph.nodes[2].id && edge.port === 'next'), 'New connection was not saved');
}

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'garden-smoke-'));
  let app;
  try {
    app = await _electron.launch({args: [path.resolve('.'), '--profile-dir=' + dir]});
    const page = await app.firstWindow();
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setContentSize(900, 680));
    await page.waitForFunction(() => innerWidth === 900);
    await page.locator('.node').first().waitFor();
    assert.ok(await page.locator('#tryCheck').isVisible());
    await checkWorkspace(page);
    await page.keyboard.press('Control+Enter');
    await page.locator('.finding').first().waitFor();
    assert.equal(await page.locator('.finding').count(), 3);
    const payload = JSON.parse(await fs.readFile(path.join(dir, 'last-webhook.json'), 'utf8'));
    assert.equal(payload.count, 3);
    await page.locator('#inspectFirst').click();
    await page.locator('.code-line.highlighted').waitFor();
    await page.locator('#nextFinding').click();
    await page.getByText('Находка 2 из 3',{exact:true}).waitFor();
    await page.locator('#backReport').click();
    await page.locator('#history').click();
    await page.locator('#report button').first().click();
    assert.equal(await page.locator('.finding').count(), 3);
    const project=path.join(dir,'training'),source=path.join(project,'application.yml');
    await fs.mkdir(project);await fs.writeFile(source,'password: "training-only"');
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},project);
    await page.locator('#folder').click();await page.waitForFunction(()=>document.querySelector('#project').textContent==='training');
    await page.locator('#run').click();await page.locator('#inspectFirst').waitFor();
    assert.equal(await page.locator('.finding').count(),1);
    await fs.writeFile(source,'password: ${DB_PASSWORD}');
    await page.locator('#run').click();await page.getByText('По выбранным правилам находок нет.',{exact:true}).waitFor();
    assert.equal(await page.locator('.finding').count(),0);
    console.log('Electron: запуск, связи, разбор находок, история, доставка и повторная проверка исправленного файла прошли');
  } finally {
    await app?.close();
    await fs.rm(dir, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
