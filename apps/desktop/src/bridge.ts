import { invoke } from '@tauri-apps/api/core';
import {z} from 'zod';
import { Entry, RecordSchema, Settings, SettingsSchema, defaults } from '../../../packages/shared/model';
export const native = '__TAURI_INTERNALS__' in window;
export type Telemetry = { cpu: number|null; ramUsed: number; ramTotal: number; diskUsed: number|null; diskTotal: number|null; battery: number | null; charging: boolean | null; received: number; transmitted: number; temperature: number | null; sampledAt: string };
export type SecurityStatus = { defender: boolean | null; firewall: boolean | null; realTime: boolean | null; lastScan: string | null; error?: string };
export type Tool = { name: string; installed: boolean; running: boolean; version?: string };
export type ProjectInfo = { id: string; name: string; branch: string; changes: string; commits: string; files: string[]; error?: string };
const ScopesSchema=z.array(z.object({action:z.string().min(1).max(80),resource:z.string().min(1).max(2100)}).strict()).min(1).max(32);
export type TaskScope=z.infer<typeof ScopesSchema>[number];
const tasks=new Set<UserTask>();
export class UserTask {
  #id:string; #closed=false;
  constructor(id:string){this.#id=id;}
  async prepare(action:string,args:Record<string,unknown>){if(this.#closed)throw new Error('This user task was cancelled or completed.');return invoke<{id:string}>('action_prepare',{action,args,taskId:this.#id});}
  async close(){if(this.#closed)return;this.#closed=true;tasks.delete(this);await invoke('user_task_cancel',{id:this.#id});}
}
// No ambient/global task context: independently proposed work never inherits a
// token from an overlapping UI request or a delayed provider response.
export async function withUserTask<T>(event:Pick<Event,'isTrusted'>,scopes:TaskScope[],work:(task?:UserTask)=>Promise<T>):Promise<T>{
  if(!native||!event.isTrusted||!scopes.length)return work();
  const grant=await invoke<{id:string}>('user_task_begin',{scopes:ScopesSchema.parse(scopes)});
  const task=new UserTask(grant.id);tasks.add(task);
  try{return await work(task);}finally{await task.close().catch(()=>{});}
}
export async function cancelUserTasks(){await Promise.all([...tasks].map(t=>t.close().catch(()=>{})));}
export async function command<T = unknown>(name: string, args: Record<string, unknown> = {}, task?:UserTask): Promise<T> {
  if (!native) throw new Error('This feature needs the installed Windows app. Browser preview has no access to your PC.');
  const guarded = new Set(['speech_install','codex_disconnect','record_put','record_delete','settings_save','system_action','app_window_control','installed_app_open','open_website','browser_page_read','browser_page_scroll','browser_link_activate','browser_control','skill_save','project_revoke','open_project','credential_set','google_disconnect','gmail_send','google_event_save','backup_create','project_write','project_copy','automation_save','automation_delete']);
  if (name === 'record_put' && ['message','activity','notification'].includes(String((args.record as Entry)?.kind)) && !args.expectedUpdatedAt) return invoke<T>('record_log', {record:args.record});
  if (guarded.has(name)) {
    const plan = task?await task.prepare(name,args):await invoke<{id:string}>('action_prepare', {action:name,args});
    try { return await invoke<T>('action_execute', {id:plan.id}); }
    finally { await invoke('action_cancel',{id:plan.id}).catch(()=>{}); }
  }
  return invoke<T>(name, args);
}
// This isolated browser store exists only for UI development. Production always uses SQLite over IPC.
let previewDb: IDBDatabase;
async function previewStore() {
  if (previewDb) return previewDb;
  previewDb = await new Promise<IDBDatabase>((resolve, reject) => { const q = indexedDB.open('jarvis-ui-development', 1); q.onupgradeneeded = () => { q.result.createObjectStore('records', { keyPath: 'id' }); q.result.createObjectStore('settings'); }; q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
  return previewDb;
}
async function idb<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await previewStore();
  return new Promise((resolve, reject) => { const tx = db.transaction(store, mode); const q = run(tx.objectStore(store)); let result: T; q.onsuccess = () => { result = q.result; }; tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted')); });
}
export const repository = {
  async all(): Promise<Entry[]> { if(!native){const rows=await idb<unknown[]>('records','readonly',s=>s.getAll());return rows.map(row=>RecordSchema.parse(row));}const rows:Entry[]=[];for(let offset=0;;offset+=500){const page=await command<Entry[]>('records_list',{offset,limit:500});rows.push(...page.map(row=>RecordSchema.parse(row)));if(page.length<500)break;}return rows; },
  async put(entry: Entry, expectedUpdatedAt?: string,task?:UserTask) { const record = RecordSchema.parse(entry); if (native) await command('record_put', { record, expectedUpdatedAt:expectedUpdatedAt??null },task); else await idb('records', 'readwrite', s => s.put(record)); },
  async remove(id: string, expectedUpdatedAt?: string) { if (native) await command('record_delete', { id, expectedUpdatedAt:expectedUpdatedAt??null }); else await idb('records', 'readwrite', s => s.delete(id)); },
  async settings(): Promise<Settings> { const value = native ? await command('settings_get') : await idb('settings', 'readonly', s => s.get('preferences')); return SettingsSchema.parse({ ...defaults, ...(value as object ?? {}) }); },
  async saveSettings(settings: Settings,task?:UserTask) { const value = SettingsSchema.parse(settings); if (native) await command('settings_save', { settings: value },task); else await idb('settings', 'readwrite', s => s.put(value, 'preferences')); },
};
