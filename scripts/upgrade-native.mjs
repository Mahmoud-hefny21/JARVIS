import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createEntry,defaults} from '../packages/shared/model.ts';
import {approvedIpc,qaConfirmation} from './native-approval.mjs';
const profile=path.resolve('.build/qa',crypto.randomUUID());await mkdir(profile,{recursive:true});
const executable=path.resolve(process.env.JARVIS_TEST_EXECUTABLE??'.build/target/debug/jarvis-desktop.exe');
const env={...process.env,JARVIS_ENABLE_TEST_PROFILE:'1',JARVIS_QA_MULTI_INSTANCE:'1',JARVIS_QA_DATA_DIR:profile,WEBVIEW2_USER_DATA_FOLDER:path.join(profile,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9226 --remote-debugging-address=127.0.0.1',TEMP:path.resolve('.build/tmp'),TMP:path.resolve('.build/tmp')};
let child,browser,page,vite;
const report={at:new Date().toISOString(),scope:'real native IPC and native dialog interaction; isolated UUID profile; no human account/microphone',results:{}};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function startVite(){
 const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(1420,'127.0.0.1',()=>probe.close(resolve));});
 vite=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--config','apps/desktop/vite.config.ts','--host','127.0.0.1'],{windowsHide:true,stdio:'ignore'});
 const end=Date.now()+20000;for(;;){if(vite.exitCode!==null)throw Error('QA Vite server exited before startup');try{const response=await fetch('http://127.0.0.1:1420');if(response.ok)return;}catch{}if(Date.now()>end)throw Error('QA Vite server did not become ready');await wait(100);}
}
async function open(){child=spawn(executable,[],{env,windowsHide:true,stdio:'ignore'});const end=Date.now()+45000;for(;;){if(child.exitCode!==null)throw Error('QA executable exited; close the other JARVIS instance');try{browser=await chromium.connectOverCDP('http://127.0.0.1:9226',{timeout:1000});page=browser.contexts()[0].pages()[0];await page.locator('main h1').waitFor({timeout:5000});break;}catch(e){if(Date.now()>end)throw e;await wait(200);}}}
const ipc=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
const approved=(name,args)=>approvedIpc(page,child,name,args);
async function stop(){child?.kill();await browser?.close().catch(()=>{});await wait(900);}
try{
 await startVite();
 await open();
 for(const name of ['record_put','record_delete','settings_save','system_action','project_write'])await assert.rejects(()=>ipc(name,{}));
 await assert.rejects(()=>ipc('record_log',{record:createEntry('task',{title:'Must not bypass approval'})}));
 await assert.rejects(()=>ipc('action_prepare',{action:'shell',args:{command:'arbitrary'}}));
 report.results.unguardedWritesRejected=true;
 const memory=createEntry('memory',{title:'Synthetic native memory',body:'SQLite indexed preference'});
 const plan=await ipc('action_prepare',{action:'record_put',args:{record:memory,expectedUpdatedAt:null}});
 assert.equal((await ipc('records_list')).some(r=>r.id===memory.id),false);
 await ipc('action_cancel',{id:plan.id});await assert.rejects(()=>ipc('action_execute',{id:plan.id}));
 const declined=await ipc('action_prepare',{action:'record_put',args:{record:memory,expectedUpdatedAt:null}});
 const cancel=qaConfirmation(child,'record_put',true);await Promise.all([assert.rejects(()=>ipc('action_execute',{id:declined.id})),cancel]);
 assert.equal((await ipc('records_list')).some(r=>r.id===memory.id),false);report.results.cancelLeavesDataUnchanged=true;
 await approved('record_put',{record:memory});assert.equal((await ipc('memory_search',{query:'indexed'}))[0].id,memory.id);
 const first=await ipc('action_prepare',{action:'record_put',args:{record:{...memory,title:'Original scoped value'},expectedUpdatedAt:memory.updatedAt}});
 const ok=qaConfirmation(child,'record_put');await Promise.all([ipc('action_execute',{id:first.id,action:'system_action',args:{action:'shutdown'}}),ok]);
 assert.equal((await ipc('records_list')).find(r=>r.id===memory.id).title,'Original scoped value');await assert.rejects(()=>ipc('action_execute',{id:first.id}));report.results.scopeAndReplayEnforced=true;
 await assert.rejects(()=>ipc('action_prepare',{action:'record_delete',args:{id:memory.id,expectedUpdatedAt:'stale'}}));
 const stale=await ipc('action_prepare',{action:'record_delete',args:{id:memory.id,expectedUpdatedAt:memory.updatedAt}});
 await approved('record_put',{record:{...memory,title:'Changed during review',updatedAt:new Date().toISOString()}});
 let earlyConflict=false;const conflictExecution=ipc('action_execute',{id:stale.id}).then(()=>{throw Error('Stale approval unexpectedly executed')},error=>{earlyConflict=true;report.results.conflictMessage=String(error);});await wait(500);if(earlyConflict)await conflictExecution;else await Promise.all([conflictExecution,qaConfirmation(child,'record_delete')]);assert.ok((await ipc('records_list')).some(r=>r.id===memory.id));report.results.concurrentChangeRejected=true;
 const project=path.join(profile,'synthetic-project');await mkdir(project);await writeFile(path.join(project,'sample.rs'),'fn original() {}\n');const grant=crypto.randomUUID();
 let db=new DatabaseSync(path.join(profile,'jarvis.db'));db.prepare('INSERT INTO project_grants VALUES(?,?,?)').run(grant,project,new Date().toISOString());db.close();
 const source=await ipc('project_file',{id:grant,path:'sample.rs'});const changed=await approved('project_write',{id:grant,path:'sample.rs',expectedHash:source.hash,content:'fn reviewed() {}\n'});assert.ok(changed.backupId);assert.equal(await readFile(path.join(project,'sample.rs'),'utf8'),'fn reviewed() {}\n');
 await assert.rejects(()=>ipc('action_prepare',{action:'project_write',args:{id:grant,path:'../jarvis.db',expectedHash:source.hash,content:'bad'}}));report.results.reviewedEditAndTraversalBoundary=true;
 const rule={id:crypto.randomUUID(),title:'Synthetic read-only report',kind:'status',hour:0,enabled:true};await approved('automation_save',{rule});assert.equal((await ipc('automations_list')).length,1);await assert.rejects(()=>ipc('action_prepare',{action:'automation_save',args:{rule:{...rule,kind:'shell'}}}));await approved('automation_delete',{id:rule.id});assert.equal((await ipc('automations_list')).length,0);report.results.onlyReadOnlySchedules=true;
 report.results.diagnostics=await ipc('diagnostics');assert.equal(report.results.diagnostics.integrity,'ok');assert.equal(report.results.diagnostics.schemaVersion,2);
 report.results.codex=await ipc('codex_status');assert.equal(report.results.codex.connected,false);
 await approved('settings_save',{settings:{...defaults,aiMode:'chatgpt',onlineAiConsent:false,backupEnabled:false}});await assert.rejects(()=>ipc('ai_chat',{messages:[{role:'user',content:'must not send'}],memories:[]}));report.results.chatgptConsentBeforeInference=true;
 const pending=await ipc('action_prepare',{action:'record_delete',args:{id:memory.id,expectedUpdatedAt:(await ipc('records_list')).find(r=>r.id===memory.id).updatedAt}});
 const history=await ipc('action_history');assert.ok(history.some(r=>r.status==='completed'));assert.ok(!history.some(r=>String(r.status).startsWith('interrupted')));
 await stop();db=new DatabaseSync(path.join(profile,'jarvis.db'));const rows=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='actionHistory'").get().value);rows.push({id:crypto.randomUUID(),action:'synthetic-interruption',status:'started',at:new Date().toISOString()});db.prepare("UPDATE settings SET value=? WHERE key='actionHistory'").run(JSON.stringify(rows));db.close();
 await open();await assert.rejects(()=>ipc('action_execute',{id:pending.id}));const recovered=await ipc('action_history');assert.equal(recovered.filter(r=>String(r.status).startsWith('interrupted')).length,1);assert.equal(recovered.find(r=>r.id===first.id).status,'completed');report.results.restartInvalidatesApprovalsAndRecoversOnlyInterrupted=true;
 console.log(JSON.stringify(report,null,2));
}catch(error){report.failure=String(error);console.error(error);process.exitCode=1;}finally{await stop();vite?.kill();await mkdir('docs/verification',{recursive:true});await writeFile('docs/verification/upgrade-native.json',JSON.stringify(report,null,2)+'\n');}
