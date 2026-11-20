import {spawn} from 'node:child_process';
import path from 'node:path';
export function qaConfirmation(child,action,cancel=false){
  if(!child?.pid||child.exitCode!==null)throw new Error('QA process is not running');
  const helper=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/qa-confirm.ps1'),'-TargetPid',String(child.pid),'-ParentPid',String(process.pid),'-Action',action,...(cancel?['-Cancel']:[])],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  return new Promise((resolve,reject)=>{let error='';helper.stdout.on('data',b=>process.stdout.write(b));helper.stderr.on('data',b=>error+=b.toString());helper.once('error',reject);helper.once('exit',code=>code===0?resolve():reject(new Error('QA dialog verification failed: '+error)));});
}
export async function approvedIpc(page,child,name,args={}){
  const invoke=(name,args={})=>page.evaluate(({name,args})=>window.__TAURI_INTERNALS__.invoke(name,args),{name,args});
  if(!['record_put','record_delete','settings_save','backup_create','project_write','automation_save','automation_delete'].includes(name))return invoke(name,args);
  if(['record_put','record_delete'].includes(name)){const id=args.record?.id??args.id;const old=(await invoke('records_list')).find(r=>r.id===id);args={...args,expectedUpdatedAt:old?.updatedAt??null};}
  const plan=await invoke('action_prepare',{action:name,args});
  console.log('QA awaiting approved action:',name);
  const confirmation=qaConfirmation(child,name);const [result]=await Promise.all([invoke('action_execute',{id:plan.id}),confirmation]);return result;
}
