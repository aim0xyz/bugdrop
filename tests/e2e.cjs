/* Run with Playwright >= 1.58 and its full Chromium installed (see CONTRIBUTING.md). */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results'); fs.mkdirSync(output, {recursive:true});
(async () => {
 const server = fork(path.join(root,'demo/server.cjs'), [], {env:{...process.env,PORT:'4174'},silent:true});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Demo server exited '+code)));});
 const profile = fs.mkdtempSync(path.join(os.tmpdir(),'bugdrop-e2e-'));
 let context;
 try {
  context = await chromium.launchPersistentContext(profile, {channel:'chromium',headless:true,viewport:{width:1440,height:1100}, args:[`--disable-extensions-except=${root}/extension`,`--load-extension=${root}/extension`,'--enable-unsafe-extension-debugging']});
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = worker.url().split('/')[2];
  const page = context.pages()[0]; await page.goto('http://127.0.0.1:4174/');
  const session = await context.browser().newBrowserCDPSession();
  const {targetInfos} = await session.send('Target.getTargets', {filter:[{type:'tab',exclude:false}]});
  const targetInfo = targetInfos.find(t=>t.url.startsWith('http://127.0.0.1:4174'));
  assert.ok(targetInfo, 'demo tab target');
  // This invokes the actual extension action, granting activeTab. No test-only host permissions.
  await session.send('Extensions.triggerAction',{id,targetId:targetInfo.targetId});
  let popup;
  for(let i=0;i<30;i++){popup=context.pages().find(p=>p.url().endsWith('/popup.html'));if(popup)break;await new Promise(r=>setTimeout(r,100));}
  if(!popup) { console.log('Action granted; opening popup document for automation.'); popup=await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`); await page.bringToFront(); }
  await popup.locator('#start').click();
  await popup.locator('#stop').waitFor({state:'visible',timeout:10000});
  await page.bringToFront();
  await page.locator('#email').fill('sensitive-person@example.com');
  await page.locator('#password').fill('password-never-store-789');
  await page.locator('#checkout').click();
  await page.locator('#result').filter({hasText:'Something went wrong'}).waitFor();
  await page.locator('#xhr').click(); await page.locator('#runtime').click(); await page.locator('#secret').click(); await page.locator('#route').click();
  const control = await context.newPage(); await control.goto(`chrome-extension://${id}/review.html`);
  const command = async (type,data={}) => {
   const response = await control.evaluate(async args=>await chrome.runtime.sendMessage(args),{type,...data});
   assert.equal(response.ok,true,response.error);return response.data;
  };
  let captured;
  for(let i=0;i<40;i++){captured=await command('GET');if(captured.events.some(e=>e.kind==='navigation'))break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(captured.recording,'SPA navigation must retain capture');
  assert.ok(captured.events.some(e=>e.kind==='network'&&e.status===503),'fetch failure');
  assert.ok(captured.events.some(e=>e.kind==='network'&&e.status===401),'XHR failure');
  assert.ok(captured.events.some(e=>e.kind==='error'&&e.message.includes('Cart total')),'runtime error');
  const raw=JSON.stringify(captured);
  for(const secret of ['sensitive-person@example.com','password-never-store-789','demo-secret-value','private@example.com','demo-private-query'])assert.ok(!raw.includes(secret),'Leaked '+secret);
  await page.bringToFront(); await command('SCREENSHOT');
  await command('STOP');
  const count=(await command('GET')).events.length;
  await page.locator('#checkout').click();
  assert.equal((await command('GET')).events.length,count,'stop must detach capture');
  await control.reload();
  await control.locator('#report').waitFor({state:'visible'});
  assert.ok(await control.locator('#copy').isDisabled(),'review gate');
  await control.locator('#title').fill('Checkout fails instead of opening the payment step');
  await control.locator('#expected').fill('Continue to a payment screen after clicking checkout.');
  await control.locator('#actual').fill('An error appears. The checkout request returns HTTP 503.');
  await control.locator('#save').click();
  await control.locator('#saved').filter({hasText:'Saved locally'}).waitFor();
  await control.locator('#toast').waitFor({state:'hidden'});
  await control.screenshot({path:path.join(output,'review.png'),fullPage:true});
  await control.screenshot({path:path.join(output,'preview.png')});
  const before=(await command('GET')).events.length;
  await control.locator('.remove').last().click();
  assert.equal((await command('GET')).events.length,before-1);
  await control.locator('#reviewed').check();
  assert.ok(await control.locator('#copy').isEnabled());
  await control.locator('#copy').click();
  await control.locator('#toast').filter({hasText:'Copied. Paste into your coding agent.'}).waitFor();
  const downloadPromise=control.waitForEvent('download');await control.locator('#json').click();const download=await downloadPromise;await download.saveAs(path.join(output,'report.json'));
  const portable=JSON.parse(fs.readFileSync(path.join(output,'report.json'),'utf8'));assert.equal(portable.schemaVersion,1);assert.ok(!('tabId'in portable));assert.ok(portable.screenshot.startsWith('data:image/jpeg'));
  const mdPromise=control.waitForEvent('download');await control.locator('#markdown').click();await(await mdPromise).saveAs(path.join(output,'report.md'));assert.ok(fs.readFileSync(path.join(output,'report.md'),'utf8').includes('HTTP 503'));
  await control.locator('#remove-image').click();assert.equal((await command('GET')).screenshot,null);assert.ok(await control.locator('#copy').isDisabled());
  // Restart through action grant, then ensure a full reload ends capture.
  const current=await command('GET');await command('DELETE',{id:current.id});
  await page.bringToFront();await session.send('Extensions.triggerAction',{id,targetId:targetInfo.targetId});
  const tabs=await control.evaluate(()=>chrome.tabs.query({}));const tab=tabs.find(t=>t.url?.startsWith('http://127.0.0.1:4174'));
  await command('START',{tabId:tab.id});await page.reload();
  for(let i=0;i<30;i++){captured=await command('GET');if(!captured.recording)break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(captured.recording,false);assert.ok(captured.stopReason.includes('navigated'));
  await command('DELETE',{id:captured.id});assert.equal(await command('GET'),null);
  console.log('PASS: real activeTab grant, capture, fetch/XHR/errors, input omission, redaction, SPA route, screenshot, stop, review, removal, JSON/Markdown, full navigation, deletion.');
 } finally { await context?.close();server.kill();fs.rmSync(profile,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1});
