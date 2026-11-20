import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer as netServer} from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {approvedIpc} from './native-approval.mjs';
import {defaults} from '../packages/shared/model.ts';
const profile=path.resolve('.build/qa',crypto.randomUUID());await mkdir(profile,{recursive:true});
const socket=netServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const report={at:new Date().toISOString(),scope:'actual Windows outer physical bounds; UUID test profile',checks:[],limitations:['Single/three-monitor layouts and disconnect are synthetic regression cases; physical topology is not changed.','Real microphone wake and tray-menu clicking require human verification; their shared native placement path is exercised.']};
let child,browser,server,page;
const ipc=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
async function manipulate(mode,args=[]){
  const helper=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/qa-window.ps1'),'-TargetPid',String(child.pid),'-ParentPid',String(process.pid),'-Mode',mode,...args],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  await new Promise((resolve,reject)=>{let error='';helper.stderr.on('data',b=>error+=b);helper.on('error',reject);helper.on('exit',code=>code===0?resolve():reject(Error(error)));});
}
async function launch(){
  child=spawn(path.resolve(process.env.JARVIS_TEST_RELEASE?'.build/target/release/jarvis-desktop.exe':'.build/target/debug/jarvis-desktop.exe'),[],{windowsHide:true,stdio:'ignore',env:{...process.env,JARVIS_ENABLE_TEST_PROFILE:'1',JARVIS_QA_MULTI_INSTANCE:'1',JARVIS_QA_DATA_DIR:profile,WEBVIEW2_USER_DATA_FOLDER:path.join(profile,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`}});
  const deadline=Date.now()+30000;
  for(;;){if(child.exitCode!==null)throw Error('Isolated JARVIS exited before startup');try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1000});const pages=browser.contexts().flatMap(c=>c.pages());if(pages.length){page=pages[0];break;}await browser.close();browser=null;}catch{}if(Date.now()>deadline)throw Error('Native WebView2 did not create a page');await new Promise(r=>setTimeout(r,150));}
  await page.locator('main h1').waitFor();
}
const inside=(r,a)=>r.x>=a.x&&r.y>=a.y&&r.x+r.width<=a.x+a.width&&r.y+r.height<=a.y+a.height;
async function check(name,fullscreen,key){
  await expect.poll(async()=>{
    const g=await ipc('window_geometry');const a=fullscreen?g.selected:g.selected.workArea;
    return g.fullscreen===fullscreen&&(!key||g.selected.key===key)&&inside(g.outer,a)&&(!fullscreen||(g.outer.x===a.x&&g.outer.y===a.y&&g.outer.width===a.width&&g.outer.height===a.height));
  },{timeout:10000}).toBe(true);
  report.checks.push({name,...await ipc('window_geometry')});
}
try{
  if(!process.env.JARVIS_TEST_RELEASE){server=await createServer({configFile:'apps/desktop/vite.config.ts'});await server.listen();}
  await launch();
  await check('startup',false);
  const monitors=await ipc('monitor_list');report.monitors=monitors;
  for(const m of monitors){
    await approvedIpc(page,child,'settings_save',{settings:{...defaults,monitorKey:m.key,backupEnabled:false}});
    await check('selected windowed display',false,m.key);
    await ipc('monitor_fullscreen',{key:m.key});await check('wake/fullscreen shared path',true,m.key);
    await page.reload();await page.locator('main h1').waitFor();
    if(m===monitors[0]){await expect(page.locator('.sidebar')).toBeHidden();await page.screenshot({path:`docs/verification/positioning${process.env.JARVIS_TEST_RELEASE?'-release':''}-fullscreen.png`});}
    await page.keyboard.press('Escape');await check('Escape restore',false,m.key);
    await ipc('monitor_fullscreen',{key:m.key});await check('repeat fullscreen',true,m.key);
    await ipc('monitor_windowed');await check('restore shared path',false,m.key);
    await manipulate('minimize');await expect.poll(()=>ipc('plugin:window|is_minimized',{label:'main'})).toBe(true);
    await ipc('monitor_windowed');await check('minimized restore',false,m.key);
    await manipulate('hide');await ipc('monitor_windowed');await check('hidden reveal shared tray path',false,m.key);
    await manipulate('displace',['-Left',String(m.x-Math.floor(m.width/2)),'-Top',String(m.y)]);await check('automatic offscreen repair',false,m.key);
  }
  await ipc('monitor_fullscreen',{key:'-999999,-999999'});await check('unavailable selected monitor falls back',true,monitors.find(m=>m.primary)?.key);
  await ipc('monitor_windowed');await check('fallback windowed',false);
  await page.screenshot({path:`docs/verification/positioning${process.env.JARVIS_TEST_RELEASE?'-release':''}-windowed.png`});
  await approvedIpc(page,child,'settings_save',{settings:{...defaults,monitorKey:monitors[0].key,backupEnabled:false}});
  await check('persist selected display',false,monitors[0].key);
  const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;await browser.close();browser=null;
  await launch();await check('startup after saved selection',false,monitors[0].key);
}catch(error){report.failure=String(error);process.exitCode=1;if(page){report.lastGeometry=await ipc('window_geometry').catch(()=>null);await page.screenshot({path:'test-results/positioning-native-failure.png'}).catch(()=>{});}}
finally{child?.kill();await browser?.close().catch(()=>{});await server?.close();await mkdir('docs/verification',{recursive:true});await writeFile(`docs/verification/window-placement${process.env.JARVIS_TEST_RELEASE?'-release':''}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:report.checks.map(c=>({name:c.name,key:c.selected.key,outer:c.outer})),failure:report.failure,limitations:report.limitations},null,2));}
