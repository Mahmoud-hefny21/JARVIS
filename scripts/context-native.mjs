import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer as createNetServer} from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {createEntry} from '../packages/shared/model.ts';

// Debug-only UUID profile. Never attach to the normal JARVIS or browser profile.
const profile=path.resolve('.build/qa',crypto.randomUUID());
await mkdir(profile,{recursive:true});
const report={at:new Date().toISOString(),profile,results:{},limitations:[]};
const probe=createNetServer();
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
let server,child,browser,controlledChrome,diagnosticPage;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  server=await createServer({configFile:'apps/desktop/vite.config.ts'});
  await server.listen();
  child=spawn(path.resolve(process.env.JARVIS_TEST_EXECUTABLE??'.build/target/debug/jarvis-desktop.exe'),[],{
    windowsHide:true,stdio:['ignore','ignore','pipe'],
    env:{...process.env,JARVIS_ENABLE_TEST_PROFILE:'1',JARVIS_QA_MULTI_INSTANCE:'1',JARVIS_QA_DATA_DIR:profile,
      WEBVIEW2_USER_DATA_FOLDER:path.join(profile,'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`}
  });
  let stderr='';child.stderr.on('data',data=>{stderr=(stderr+data).slice(-2000);});
  child.on('error',error=>{stderr=String(error);});
  const deadline=Date.now()+25000;
  for(;;){
    if(child.exitCode!==null)throw Error(`Isolated native process exited (${child.exitCode}): ${stderr}`);
    try {const response=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)});if(response.ok)break;}catch{}
    if(Date.now()>deadline)throw Error(`Isolated WebView2 CDP did not become available in 25 seconds; process exit=${child.exitCode}; ${stderr}`);
    await pause(200);
  }
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:10000});
  let page;
  const pageDeadline=Date.now()+20000;
  while(!(page=browser.contexts().flatMap(context=>context.pages())[0])) {
    if(Date.now()>pageDeadline)throw Error('WebView2 CDP is reachable but no native page was created in 20 seconds');
    await pause(100);
  }
  diagnosticPage=page;
  await page.locator('main h1').waitFor();
  const ipc=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
  assert.equal(await ipc('database_integrity'),'ok');
  // Seed only this runner's synthetic database; actual reads use native IPC.
  const root=path.join(profile,'synthetic-project');await mkdir(root);
  await writeFile(path.join(root,'example.ts'),'export const synthetic = true;\n');
  const project=createEntry('project',{title:'Synthetic context project'});
  const db=new DatabaseSync(path.join(profile,'jarvis.db'));
  db.prepare('INSERT INTO project_grants VALUES(?,?,?)').run(project.id,root,new Date().toISOString());
  db.prepare('INSERT INTO records(id,kind,created_at,updated_at,payload) VALUES(?,?,?,?,?)').run(project.id,project.kind,project.createdAt,project.updatedAt,JSON.stringify(project));
  db.close();
  const inspected=await ipc('project_inspect',{id:project.id});assert.ok(inspected);
  assert.equal(await ipc('project_read',{id:project.id,path:'example.ts'}),'export const synthetic = true;\n');
  await assert.rejects(()=>ipc('project_read',{id:project.id,path:'../jarvis.db'}));
  report.results.fileReadAndTraversal='passed on synthetic native project';
  report.results.monitors=await ipc('monitor_list');
  report.results.speech=await ipc('speech_status');
  await assert.rejects(()=>ipc('app_window_control',{application:'chrome',operation:'focus'}));
  await assert.rejects(()=>ipc('action_prepare',{action:'app_window_control',args:{application:'powershell',operation:'open'}}));
  report.results.directWindowBypassRejected=true;
  await page.reload();await page.locator('main h1').waitFor();
  await page.getByRole('button',{name:'Code Assistant',exact:true}).click();
  await page.locator(`[data-project="${project.id}"]`).click();
  await page.locator('[data-file="example.ts"]').click();
  async function ask(text){await page.getByLabel('Ask JARVIS').fill(text);await page.getByRole('button',{name:'Send command'}).click();}
  await ask('Show me that file');
  await expect.poll(async()=> (await ipc('records_list')).some(record=>record.kind==='message'&&record.body?.includes('Showing example.ts')),{timeout:15000}).toBe(true);
  await page.getByRole('button',{name:'AI Chat',exact:true}).click();
  await page.locator('.message.assistant').last().filter({hasText:'example.ts'}).waitFor();
  report.results.contextualFileReference=true;
  // A new headed Chrome owns a separate profile and a blank page. Never select
  // an existing user browser tab or navigate it to external services.
  controlledChrome=await chromium.launchPersistentContext(path.join(profile,'controlled-chrome'),{channel:'chrome',headless:false});
  await controlledChrome.pages()[0].goto('about:blank');
  for(const text of ['Could you show me Chrome please',...(report.results.monitors.length>=2?Array.from({length:4},()=>['Put it on monitor two','Move it to monitor one']).flat():[]),'Minimize it','Restore it']){
    const previous=await page.locator('.message.assistant').count();
    await ipc('monitor_windowed');
    await ask(text);
    await page.waitForFunction(count=>document.querySelectorAll('.message.assistant').length>count,previous);
    const reply=await page.locator('.message.assistant').last().textContent();
    assert.match(reply,/Windows verified/i);
    (report.results.contextualWindowActions??=[]).push({request:text,verified:true});
  }
  report.limitations.push('Only fixed browser window controls were exercised, not browser-page automation.','Microphone wake-up, audible playback and visual placement/quality on physical displays require manual testing.');
} catch(error) {
  report.failure=String(error);process.exitCode=1;
  report.lastResponse=await diagnosticPage?.locator('.message.assistant').last().textContent({timeout:1000}).catch(()=>null);
} finally {
  // Only the child launched by this runner is terminated.
  child?.kill();
  await controlledChrome?.close().catch(()=>{});
  await browser?.close().catch(()=>{});
  await server?.close();
  await mkdir('docs/verification',{recursive:true});
  await writeFile('docs/verification/context-native.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
