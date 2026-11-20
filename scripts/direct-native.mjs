import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer as netServer} from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {createEntry,defaults} from '../packages/shared/model.ts';
import {qaConfirmation} from './native-approval.mjs';
const profile=path.resolve('.build/qa',crypto.randomUUID());await mkdir(profile,{recursive:true});
const socket=netServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const report={at:new Date().toISOString(),profile:'isolated UUID QA profile',checks:{},directSteps:0};
let server,child,browser,page,chrome;
const ipc=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
async function bounded(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Routine execution did not complete without a dialog')),15000);})]);}finally{clearTimeout(timer);}}
async function direct(action,args,task){const plan=await ipc('action_prepare',{action,args,taskId:task});assert.equal(plan.requiresConfirmation,false);const result=await bounded(ipc('action_execute',{id:plan.id}));report.directSteps++;return result;}
try{
 server=await createServer({configFile:'apps/desktop/vite.config.ts'});await server.listen();
 child=spawn(path.resolve(process.env.JARVIS_TEST_EXECUTABLE??'.build/target/debug/jarvis-desktop.exe'),[],{windowsHide:true,stdio:'ignore',env:{...process.env,JARVIS_ENABLE_TEST_PROFILE:'1',JARVIS_QA_DATA_DIR:profile,WEBVIEW2_USER_DATA_FOLDER:path.join(profile,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`}});
 const deadline=Date.now()+30000;for(;;){if(child.exitCode!==null)throw Error('QA process exited');try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1000});page=browser.contexts().flatMap(c=>c.pages())[0];if(page)break;await browser.close();browser=null;}catch{}if(Date.now()>deadline)throw Error('No isolated native page');await new Promise(r=>setTimeout(r,100));}
 await page.locator('main h1').waitFor();await ipc('monitor_windowed');
 const item=createEntry('task',{title:'Direct native fixture'}),project=createEntry('project',{title:'Isolated direct project'});
 const root=path.join(profile,'project');await mkdir(root);await writeFile(path.join(root,'source.ts'),'export const fixture = true;\n');
 let db=new DatabaseSync(path.join(profile,'jarvis.db'));db.prepare('INSERT INTO project_grants VALUES(?,?,?)').run(project.id,root,new Date().toISOString());db.prepare('INSERT INTO records VALUES(?,?,?,?,?)').run(project.id,project.kind,project.createdAt,project.updatedAt,JSON.stringify(project));
 assert.equal(JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('profilePurpose').value),'qa');db.close();report.checks.qaDatabaseMarked=true;
 const task=(await ipc('user_task_begin',{scopes:[{action:'record_put',resource:'new:task'},{action:'record_put',resource:'record:'+item.id},{action:'settings_save',resource:'preferences'},{action:'project_copy',resource:'project:'+project.id},{action:'app_window_control',resource:'app:chrome'}]})).id;
 await direct('record_put',{record:item,expectedUpdatedAt:null},task);
 const changed={...item,done:true,updatedAt:new Date().toISOString()};await direct('record_put',{record:changed,expectedUpdatedAt:item.updatedAt},task);
 await direct('settings_save',{settings:{...defaults,lowPower:true}},task);
 assert.equal((await ipc('records_list')).find(r=>r.id===item.id).done,true);assert.equal((await ipc('settings_get')).lowPower,true);report.checks.multiStepRoutineTaskWithoutPrompts=true;
 const copy=await direct('project_copy',{id:project.id,source:'source.ts',destination:'copy.ts'},task);assert.equal(copy.verified,true);assert.equal(await readFile(path.join(root,'copy.ts'),'utf8'),await readFile(path.join(root,'source.ts'),'utf8'));
 await assert.rejects(()=>ipc('action_prepare',{action:'project_copy',args:{id:project.id,source:'source.ts',destination:'copy.ts'},taskId:task}));
 await assert.rejects(()=>ipc('action_prepare',{action:'project_copy',args:{id:project.id,source:'source.ts',destination:'../outside.ts'},taskId:task}));report.checks.copyVerifiedAndOverwriteTraversalRejected=true;
 const notice=createEntry('notification',{title:'QA task notification',projectId:item.id});const noticeTask=(await ipc('user_task_begin',{scopes:[{action:'record_put',resource:'new:notification'},{action:'record_put',resource:'record:'+notice.id}]})).id;await direct('record_put',{record:notice,expectedUpdatedAt:null},noticeTask);await direct('record_put',{record:{...notice,done:true,updatedAt:new Date().toISOString()},expectedUpdatedAt:notice.updatedAt},noticeTask);await ipc('user_task_cancel',{id:noticeTask});report.checks.notificationTaskLinkWithoutProjectGrant=true;
 const risky=[['record_delete',{id:item.id,expectedUpdatedAt:changed.updatedAt}],['record_put',{record:{...changed,title:'Overwritten content'},expectedUpdatedAt:changed.updatedAt}],['settings_save',{settings:{...defaults,lowPower:true,onlineAiConsent:true}}],['settings_save',{settings:{...defaults,lowPower:true,excludedPaths:['C:\\Private']}}],['gmail_send',{to:'qa@example.invalid',subject:'Never sent',body:'Never sent'}],['system_action',{action:'shutdown'}]];
 for(const [action,args] of risky){const plan=await ipc('action_prepare',{action,args,taskId:task});assert.equal(plan.requiresConfirmation,true);assert.ok(!plan.summary.includes('"settings":'));await ipc('action_cancel',{id:plan.id});}
 const proposal=await ipc('action_prepare',{action:'settings_save',args:{settings:{...defaults,lowPower:false}}});assert.equal(proposal.requiresConfirmation,true);await ipc('action_cancel',{id:proposal.id});report.checks.highImpactAndIndependentProposalsProtected=true;
 await assert.rejects(()=>ipc('action_prepare',{action:'app_window_control',args:{application:'vscode',operation:'open'},taskId:task}));await assert.rejects(()=>ipc('action_prepare',{action:'shell',args:{command:'anything'},taskId:task}));report.checks.scopeAndShellBoundary=true;
 const deletion=await ipc('action_prepare',{action:'record_delete',args:{id:item.id,expectedUpdatedAt:changed.updatedAt},taskId:task});
 await Promise.all([assert.rejects(()=>ipc('action_execute',{id:deletion.id})),qaConfirmation(child,'record_delete',true)]);assert.ok((await ipc('records_list')).some(r=>r.id===item.id));report.checks.realProtectedDialogCancellation=true;
 await page.reload();await page.locator('main h1').waitFor();await ipc('monitor_windowed');
 await page.getByLabel('Ask JARVIS').fill('add task Direct UI fixture');await page.getByRole('button',{name:'Send command'}).click();
 await expect.poll(async()=>(await ipc('records_list')).some(r=>r.title==='Direct UI fixture'),{timeout:15000}).toBe(true);report.checks.trustedUiCommandWithoutDialog=true;
 await page.getByRole('button',{name:'Tasks & Reminders',exact:true}).click();await page.getByRole('checkbox',{name:'Complete Direct UI fixture'}).check();await expect.poll(async()=>(await ipc('records_list')).find(r=>r.title==='Direct UI fixture')?.done).toBe(true);report.checks.uiMetadataUpdateWithoutDialog=true;
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Low-power mode',{exact:true}).uncheck();await page.getByRole('button',{name:/Save preferences/}).click();await expect(page.getByText('Preferences saved.',{exact:true})).toBeVisible();report.checks.uiCosmeticPreferencesWithoutDialog=true;
 await page.getByRole('button',{name:'Code Assistant',exact:true}).click();await page.locator(`[data-project="${project.id}"]`).click();await page.locator('[data-file="source.ts"]').click();await page.getByLabel('Ask JARVIS').fill('copy this file to ui-copy.ts');await page.getByRole('button',{name:'Send command'}).click();await expect.poll(async()=>{try{return await readFile(path.join(root,'ui-copy.ts'),'utf8');}catch{return '';}}).toBe('export const fixture = true;\n');report.checks.uiCopyWithoutDialog=true;
 chrome=await chromium.launchPersistentContext(path.join(profile,'chrome'),{channel:'chrome',headless:false});await chrome.pages()[0].goto('about:blank');await ipc('monitor_windowed');
 await page.getByLabel('Ask JARVIS').fill('Show me Chrome');await page.getByRole('button',{name:'Send command'}).click();await expect.poll(async()=>(await ipc('records_list')).some(r=>r.kind==='message'&&r.body?.includes('Windows verified focus for Chrome')),{timeout:15000}).toBe(true);report.checks.actualChromeFocusWithoutDialog=true;
 await ipc('monitor_windowed');await page.getByLabel('Ask JARVIS').fill('Minimize it');await page.getByRole('button',{name:'Send command'}).click();await expect.poll(async()=>(await ipc('records_list')).some(r=>r.kind==='message'&&r.body?.includes('Windows verified minimize for Chrome')),{timeout:15000}).toBe(true);report.checks.contextualFollowupWithoutDialog=true;
 // A scripted DOM event is not a trusted user action and cannot mint a token.
 await ipc('monitor_windowed');await page.getByLabel('Ask JARVIS').fill('add task Untrusted event fixture');const declined=qaConfirmation(child,'record_put',true);await page.evaluate(()=>document.querySelector('#command-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await declined;assert.ok(!(await ipc('records_list')).some(r=>r.title==='Untrusted event fixture'));report.checks.untrustedDomEventNotAutoApproved=true;
 const prepared=await ipc('action_prepare',{action:'project_copy',args:{id:project.id,source:'source.ts',destination:'revoked.ts'},taskId:task});db=new DatabaseSync(path.join(profile,'jarvis.db'));db.prepare('DELETE FROM project_grants WHERE id=?').run(project.id);db.close();await assert.rejects(()=>ipc('action_execute',{id:prepared.id}));report.checks.revokedProjectStopsPreparedAction=true;
 const pending=await ipc('action_prepare',{action:'record_put',args:{record:createEntry('task',{title:'Never applied'}),expectedUpdatedAt:null},taskId:task});await ipc('user_task_cancel',{id:task});await assert.rejects(()=>ipc('action_execute',{id:pending.id}));report.checks.taskCancellation=true;
 const history=await ipc('action_history');assert.ok(history.some(r=>r.authorization==='direct-user'&&r.status==='completed'));assert.ok(!JSON.stringify(history).includes(task));assert.equal(await ipc('database_integrity'),'ok');report.checks.auditNoCapabilityLeakAndIntegrity=true;
}catch(error){report.failure=String(error);process.exitCode=1;if(page)report.lastResponse=await page.locator('.message.assistant').last().textContent({timeout:1000}).catch(()=>null);}
finally{child?.kill();await chrome?.close().catch(()=>{});await browser?.close().catch(()=>{});await server?.close();await mkdir('docs/verification',{recursive:true});await writeFile('docs/verification/direct-native.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
