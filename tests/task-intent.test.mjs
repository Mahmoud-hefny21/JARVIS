import test from 'node:test';
import assert from 'node:assert/strict';
import {directScopes} from '../packages/shared/task-intent.ts';
import {defaults} from '../packages/shared/model.ts';
import {localIntent} from '../packages/shared/model.ts';
test('explicit tasks have bounded target scopes and no ambient AI authorization',()=>{
 const scope=(text,context={},project)=>directScopes(text,context,project,defaults.workspacePresets);
 assert.deepEqual(scope('add task Review changes'),[{action:'record_put',resource:'new:task'}]);
 assert.deepEqual(scope('remember Chrome configuration'),[{action:'record_put',resource:'new:memory'}]);
 assert.ok(scope('Please show Chrome').every(s=>s.resource==='app:chrome'));
 assert.ok(scope('Put it on monitor two',{currentId:'app:vscode'}).every(s=>s.resource==='app:vscode'));
 for(const text of ["Don't open Chrome",'How do I open Chrome?','Find problems in Chrome','Cancel','Fix security settings'])assert.deepEqual(scope(text),[]);
 assert.deepEqual(scope('copy this file to copied.ts',{},'known-project'),[{action:'project_copy',resource:'project:known-project'}]);
 assert.deepEqual(scope('visit https://example.com/docs'),[{action:'open_website',resource:'website:https://example.com/docs'}]);
 assert.deepEqual(scope('show it',{currentId:'file:known'}),[]);
});
test('saving a verified skill note requires only a task-scoped local SQLite write',()=>{
 assert.deepEqual(localIntent('JARVIS, save verified skill.'),{action:'skill-save'});
 assert.deepEqual(localIntent('show saved skills'),{action:'skill-list'});
 assert.deepEqual(directScopes('save verified skill',{},undefined,defaults.workspacePresets),[{action:'skill_save',resource:'new:verified-skill'}]);
 assert.deepEqual(directScopes('show saved skills',{},undefined,defaults.workspacePresets),[]);
});
test('browser link actions require an explicit exact label and stay scoped to the active browser',()=>{
 const scope=text=>directScopes(text,{},undefined,defaults.workspacePresets);
 assert.deepEqual(localIntent('Jarvis, click the link "Privacy Policy"'),{action:'browser-link',text:'privacy policy'});
 assert.deepEqual(localIntent('follow link Contact support'),{action:'browser-link',text:'contact support'});
 assert.deepEqual(scope('open the link Help'),[{action:'browser_link_activate',resource:'browser-active'}]);
 assert.deepEqual(scope('How do I click the link Help?'),[]);
 assert.equal(localIntent('click the link'),null);
 assert.equal(localIntent('click the link "bad\nlabel"'),null);
});
test('web research requires a clear bounded request and receives no action scope',()=>{
 assert.deepEqual(localIntent('Research the latest Microsoft WebView2 deployment guidance'),{action:'research',text:'the latest Microsoft WebView2 deployment guidance'});
 assert.deepEqual(localIntent('Jarvis, search the web for official Windows UI Automation documentation'),{action:'research',text:'official Windows UI Automation documentation'});
 assert.deepEqual(directScopes('look up current Bun documentation',{},undefined,defaults.workspacePresets),[]);
 assert.deepEqual(localIntent('search all projects for research'),{action:'project-search',text:'research'});
 assert.equal(localIntent('research'),null);
});
test('browser buttons and labeled fields stay in one confirmation-gated browser scope',()=>{
 const scope=text=>directScopes(text,{},undefined,defaults.workspacePresets);
 assert.deepEqual(localIntent('Jarvis, click the button "Continue"'),{action:'browser-button',text:'continue'});
 assert.deepEqual(scope('press button Submit'),[{action:'browser_control',resource:'browser-active'}]);
 assert.deepEqual(localIntent('Fill field "Search" with "JARVIS setup"'),{action:'browser-fill',text:'{"label":"Search","value":"JARVIS setup"}'});
 assert.deepEqual(scope('type field "Email" with "sir@example.com"'),[{action:'browser_control',resource:'browser-active'}]);
 assert.equal(localIntent('Fill field "Search" with "bad\nvalue"'),null);
});
test('a multi-step workspace authorizes only saved ordinary placements',()=>{
 const scopes=directScopes('launch workspace Coding',{},undefined,[{id:crypto.randomUUID(),name:'Coding',placements:[{application:'chrome',monitor:'one'},{application:'vscode',monitor:'two'},{application:'jarvis',monitor:'one'}]}]);
 assert.deepEqual(scopes,[{action:'settings_save',resource:'preferences'},{action:'app_window_control',resource:'app:chrome'},{action:'app_window_control',resource:'app:vscode'}]);
 assert.ok(!scopes.some(s=>['project_write','record_delete','gmail_send','credential_set'].includes(s.action)));
});
test('catalog app launch authorization is exact and only follows a clear user request',()=>{
 const catalog=[{name:'Calculator',appId:'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'}];
 assert.deepEqual(directScopes('Please open Calculator',{},undefined,defaults.workspacePresets,catalog),[{action:'installed_app_open',resource:'installed-app:Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'}]);
 assert.ok(directScopes('open Chrome',{},undefined,defaults.workspacePresets,[{name:'Google Chrome',appId:'Chrome.Profile'}]).every(s=>s.resource==='app:chrome'));
 assert.deepEqual(directScopes('How do I open Calculator?',{},undefined,defaults.workspacePresets,catalog),[]);
 assert.deepEqual(directScopes('Open an unknown app',{},undefined,defaults.workspacePresets,catalog),[]);
 assert.deepEqual(directScopes('open Duplicate',{},undefined,defaults.workspacePresets,[...catalog,{name:'Duplicate',appId:'First.App!Main'},{name:'Duplicate',appId:'Second.App!Main'}]),[]);
});
