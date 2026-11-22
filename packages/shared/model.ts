import { z } from 'zod';
export const Kind = z.enum(['task', 'memory', 'project', 'event', 'message', 'activity', 'notification', 'draft']);
export const RecordSchema = z.object({
  id: z.uuid(), kind: Kind, title: z.string().trim().min(1).max(240), body: z.string().max(32000).default(''),
  createdAt: z.iso.datetime({offset:true}), updatedAt: z.iso.datetime({offset:true}), done: z.boolean().default(false),
  priority: z.enum(['low', 'medium', 'high']).default('medium'), dueAt: z.string().max(40).default(''),
  endAt:z.string().max(40).default(''),allDay:z.boolean().default(false),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'), projectId: z.union([z.uuid(), z.literal('')]).default(''),
  role: z.enum(['user', 'assistant', '']).default(''), notifiedAt: z.string().max(40).default(''),
});
export type Entry = z.infer<typeof RecordSchema>;
export type EntryKind = Entry['kind'];
export const WeatherSchema=z.object({temperature:z.number().finite().min(-150).max(150),description:z.string().max(160),at:z.iso.datetime({offset:true}),forecast:z.string().max(16000).optional()});
const WorkspacePlacementSchema=z.object({application:z.enum(['chrome','vscode','jarvis']),monitor:z.enum(['one','two','three','1','2','3','left','center','right'])});
export const WorkspacePresetSchema=z.object({id:z.uuid(),name:z.string().trim().min(1).max(60),placements:z.array(WorkspacePlacementSchema).min(1).max(3)}).refine(p=>new Set(p.placements.map(x=>x.application)).size===p.placements.length,'An application may appear only once in a workspace');
export type WorkspacePreset=z.infer<typeof WorkspacePresetSchema>;
export const OverviewPanelIdSchema=z.enum(['profile','system-resources','security','development-tools','briefing','projects','schedule','tasks','activity','priority','research']);
export type OverviewPanelId=z.infer<typeof OverviewPanelIdSchema>;
export const OverviewLayoutSchema=z.object({
  version:z.literal(1).default(1),
  sides:z.partialRecord(OverviewPanelIdSchema,z.enum(['left','right'])).default({}),
  order:z.array(OverviewPanelIdSchema).max(11).refine(ids=>new Set(ids).size===ids.length,'Overview panel order must be unique').default([]),
  pinned:OverviewPanelIdSchema.nullable().default(null),
  hidden:z.boolean().default(false),
  extras:z.array(z.enum(['activity','priority','research'])).max(3).refine(ids=>new Set(ids).size===ids.length,'Overview panels must be unique').default([]),
}).strict().default({version:1,sides:{},order:[],pinned:null,hidden:false,extras:[]});
export type OverviewLayout=z.infer<typeof OverviewLayoutSchema>;
export const SettingsSchema = z.object({
  name: z.string().trim().min(1).max(60).default('Sir'), role: z.string().max(100).default('Personal workspace'),
  interests: z.string().max(240).default('Development, learning, and everything in between.'),
  lowPower: z.boolean().default(false), reducedMotion: z.boolean().default(false), dnd: z.boolean().default(false),
  quietStart: z.number().int().min(0).max(23).default(22), quietEnd: z.number().int().min(0).max(23).default(7),
  sttEngine:z.enum(['sapi','whisper']).default('sapi'),
  wakeWordEnabled:z.boolean().default(true),
  ttsEngine:z.enum(['windows','piper']).default('windows'), piperExecutable:z.string().max(320).default(''), piperModel:z.string().max(320).default(''), piperConfig:z.string().max(320).default(''),
  language: z.enum(['en-US', 'en-GB', 'ar-EG']).default('en-US'), speak: z.boolean().default(false), voice: z.string().max(200).default(''),
  latitude: z.number().min(-90).max(90).default(30.0444), longitude: z.number().min(-180).max(180).default(31.2357),
  location: z.string().max(80).default('Cairo'), weatherEnabled: z.boolean().default(false),
  aiMode: z.enum(['compatible','chatgpt','claude','hybrid']).default('compatible'),
  aiUrl: z.string().max(300).default(''), aiModel: z.string().max(100).default(''), onlineAiConsent: z.boolean().default(false),
  googleClientId: z.string().max(240).default(''), backupEnabled: z.boolean().default(true), backupKeep: z.number().int().min(1).max(30).default(7),
  logRetentionDays: z.number().int().min(7).max(365).default(30), briefingHour: z.number().int().min(0).max(23).default(8), briefingEnabled: z.boolean().default(false),
  autostart: z.boolean().default(false), minimizeToTray: z.boolean().default(true),
  // Stable across display reconnects: physical monitor origin in Windows coordinates.
  monitorKey: z.string().max(32).default('primary'),
  excludedPaths: z.array(z.string().trim().min(3).max(320)).max(32).default([]),
  workspacePresets: z.array(WorkspacePresetSchema).max(8).default([]).refine(p=>new Set(p.map(x=>x.name.toLowerCase())).size===p.length,'Workspace names must be unique'),
  overviewLayout:OverviewLayoutSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;
export const defaults = SettingsSchema.parse({});
export function createEntry(kind: EntryKind, values: Partial<Entry> = {}): Entry {
  const now = new Date().toISOString();
  return RecordSchema.parse({ id: crypto.randomUUID(), kind, title: 'Untitled', createdAt: now, updatedAt: now, ...values });
}
export function quiet(settings: Settings, now = new Date()) {
  if (settings.dnd) return true;
  const h = now.getHours();
  return settings.quietStart === settings.quietEnd ? false : settings.quietStart < settings.quietEnd ? h >= settings.quietStart && h < settings.quietEnd : h >= settings.quietStart || h < settings.quietEnd;
}
// Quiet hours suppress unattended speech only. A user speaking to JARVIS is an
// explicit request for a spoken answer and should never be silently ignored.
export function shouldSpeakResponse(settings: Settings, directVoiceRequest = false, now = new Date()) {
  return directVoiceRequest || (settings.speak && !quiet(settings, now));
}
export function voiceStopRecovery(wakeRequested: boolean, mode: 'wake' | 'ptt' | ''): 'rearm' | 'attention' | 'idle' {
  if (!wakeRequested) return 'idle';
  return mode === 'ptt' ? 'rearm' : 'attention';
}
export function shouldRetryWithWhisper(sttEngine: 'sapi' | 'whisper', installed: boolean, attempted: boolean): boolean {
  return sttEngine === 'sapi' && installed && !attempted;
}
export function shouldUseWhisperForDictation(sttEngine: 'sapi' | 'whisper', language: string, installedRecognizers: string[], whisperInstalled: boolean): boolean {
  if (!whisperInstalled) return false;
  if (sttEngine === 'whisper') return true;
  return !installedRecognizers.includes(language);
}
export function spokenFailureMessage(error: unknown): string {
  const message=(error instanceof Error?error.message:String(error)).replace(/\s+/g,' ').trim();
  return (message||'The request could not be completed.').slice(0,320);
}
export function nextDue(due: string, recurrence: Entry['recurrence'], now = new Date()): string {
  const d = new Date(due);
  if (!Number.isFinite(d.getTime()) || recurrence === 'none') return '';
  const anchorDay = d.getDate();
  do { if (recurrence === 'monthly') { d.setDate(1); d.setMonth(d.getMonth() + 1); const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(anchorDay, end)); } else d.setDate(d.getDate() + (recurrence === 'weekly' ? 7 : 1)); } while (d <= now);
  return d.toISOString();
}
export function localIntent(input: string): { action: string; text?: string } | null {
  // Speech-to-text adds punctuation ("Add task, buy milk."); drop it after a leading command phrase so instant commands still match.
  const text = input.trim().replace(/^(?:hey |ok |okay )?jarvis[,.!\s]+/i, '').replace(/^((?:please )?(?:add (?:a )?task|remind me to|remember(?: that)?|open|show(?: me)?|search(?: for)?))\s*[,:;.\-]+\s*/i, '$1 ').replace(/^please\s+/i, '').replace(/^add a task/i, 'add task').trim();
  const t = text.toLowerCase().replace(/[.!?]+$/, '');
  if (['save skill','save a skill','save verified skill','save a verified skill','remember skill'].includes(t)) return { action: 'skill-save' };
  if (['list skills','list saved skills','show skills','show saved skills','what are my skills'].includes(t)) return { action: 'skill-list' };
  const powerPreference=t.match(/^(?:turn|switch) (on|off) (?:the )?(low power(?: mode)?|battery saver|reduced motion(?: mode)?)$/)||t.match(/^(enable|disable) (low power(?: mode)?|battery saver|reduced motion(?: mode)?)$/);
  if(powerPreference){const enabled=powerPreference[1]==='on'||powerPreference[1]==='enable';const key=/reduced motion/.test(powerPreference[2])?'reducedMotion':'lowPower';return {action:'preference',text:`${key}=${enabled}`};}
  if(/^(?:شغل|فعّل|فعل) (?:وضع )?توفير الطاقة$/.test(t))return {action:'preference',text:'lowPower=true'};
  if(/^(?:اقفل|عطل|الغِ) (?:وضع )?توفير الطاقة$/.test(t))return {action:'preference',text:'lowPower=false'};
  if(/^(?:فعل|فعّل) تقليل الحركة$/.test(t))return {action:'preference',text:'reducedMotion=true'};
  if(/^(?:عطل|الغِ) تقليل الحركة$/.test(t))return {action:'preference',text:'reducedMotion=false'};
  const preferredName=text.match(/^(?:call me|set my name to) ([^\r\n]{1,60})$/i);
  if(preferredName)return {action:'preference',text:`name=${preferredName[1].trim()}`};
  const browserScroll=t.match(/^scroll (up|down) (?:on )?(?:the )?(?:(?:current|active) )?(?:browser )?(?:page|tab|website)$/)||t.match(/^scroll (up|down) (?:on )?(?:the )?(?:browser )?(?:page|tab)$/);
  if(browserScroll)return {action:'browser-scroll',text:browserScroll[1]};
  const browserLink=t.match(/^(?:click|open|follow|activate) (?:the )?(?:link|hyperlink) (?:["“]([^"”\r\n]{1,160})["”]|([^\r\n]{1,160}))$/i);
  if(browserLink){const label=(browserLink[1]??browserLink[2]??'').trim();if(label&&!/[\u0000-\u001f\u007f]/.test(label))return {action:'browser-link',text:label};}
  const browserButton=t.match(/^(?:click|press|activate) (?:the )?button (?:["“]([^"”\r\n]{1,120})["”]|([^\r\n]{1,120}))$/i);
  if(browserButton){const label=(browserButton[1]??browserButton[2]??'').trim();if(label&&!/[\u0000-\u001f\u007f]/.test(label))return {action:'browser-button',text:label};}
  const browserFill=text.match(/^(?:fill|enter|type) (?:the )?(?:form )?field ["“]([^"”\r\n]{1,120})["”] with ["“]([^"”\r\n]{0,2000})["”]$/i);
  if(browserFill&&!/[\u0000-\u001f\u007f]/.test(browserFill[1]+browserFill[2]))return {action:'browser-fill',text:JSON.stringify({label:browserFill[1],value:browserFill[2]})};
  if(/^(?:read|show me|what(?:'s| is) on) (?:the )?(?:(?:current|active) )?(?:browser )?(?:page|tab|website|this page)$/.test(t)||/^(?:اقرا|اقرأ|وريني).*(?:الصفحة|صفحة المتصفح)$/.test(t))return {action:'browser-read'};
  const appName = '(chrome|google chrome|vs code|vscode)';
  const displayName = '(one|two|three|1|2|3|left|center|right)';
  // Flexible spoken placement: "switch Chrome in monitor two", "put this tab on screen 1", "send the browser to display left".
  const placed = t.match(/^(?:(move|switch|put|send|throw|take|open|show)\s+)?(?:the\s+|my\s+)?(google chrome|chrome|vs code|vscode|visual studio code|code|this tab|this window|the browser|browser|this|it)\s+(?:back\s+)?(?:to|in|into|on|onto)\s+(?:the\s+)?(?:monitor|display|screen)\s+(one|two|three|won|to|too|1|2|3|left|center|right)$/)
    || t.match(/^(move|switch|put|send|open)\s+(?:the\s+|my\s+)?(google chrome|chrome|vs code|vscode|code|this tab|the browser|browser)\s+(?:to\s+)?(?:the\s+)?(one|two|three|1|2|3|left|center|right)\s+(?:monitor|display|screen)$/);
  const ordinal = t.match(/^(?:(move|switch|put|send|throw|take|open|show)\s+)?(?:the\s+|my\s+)?(google chrome|chrome|vs code|vscode|visual studio code|code|this tab|this window|the browser|browser|this|it)\s+(?:back\s+)?(?:to|in|into|on|onto)\s+(?:the\s+|my\s+)?(first|main|primary|second|other|third)\s+(?:monitor|display|screen)$/);
  if (ordinal) {
    const where = ({ first: 'one', main: 'one', primary: 'one', second: 'two', other: 'two', third: 'three' } as Record<string, string>)[ordinal[3]];
    return { action: 'app-window', text: `${/code/.test(ordinal[2]) ? 'vscode' : 'chrome'}|${ordinal[1] === 'open' ? 'open' : 'move'}|${where}` };
  }
  if (placed) {
    const app = /code/.test(placed[2]) ? 'vscode' : 'chrome';
    const where = ({ won: 'one', to: 'two', too: 'two' } as Record<string, string>)[placed[3]] ?? placed[3];
    return { action: 'app-window', text: `${app}|${placed[1] === 'open' ? 'open' : 'move'}|${where}` };
  }
  const appOpen = t.match(new RegExp(`^open\\s+${appName}\\s+on\\s+(?:monitor|display)\\s+${displayName}$`));
  if (appOpen) return { action: 'app-window', text: `${appOpen[1].includes('code') ? 'vscode' : 'chrome'}|open|${appOpen[2]}` };
  const appMove = t.match(new RegExp(`^move\\s+${appName}\\s+to\\s+(?:monitor|display)\\s+${displayName}$`));
  if (appMove) return { action: 'app-window', text: `${appMove[1].includes('code') ? 'vscode' : 'chrome'}|move|${appMove[2]}` };
  const appFront = t.match(new RegExp(`^(?:bring|focus)\\s+${appName}(?:\\s+to the front)?$`));
  if (appFront) return { action: 'app-window', text: `${appFront[1].includes('code') ? 'vscode' : 'chrome'}|focus|` };
  const appState = t.match(new RegExp(`^(minimize|restore)\\s+${appName}$`));
  if (appState) return { action: 'app-window', text: `${appState[2].includes('code') ? 'vscode' : 'chrome'}|${appState[1]}|` };
  const monitor = t.match(/^(?:(?:switch|move|put|open|show)\s+(?:(?:jarvis|yourself)\s+)?(?:fullscreen\s+)?(?:to\s+)?(?:on\s+)?(?:monitor|display)\s+(one|two|three|1|2|3|left|center|right)|(?:switch|move)\s+to\s+(?:monitor|display)\s+(one|two|three|1|2|3|left|center|right))$/);
  if (monitor) return { action: 'monitor', text: monitor[1] ?? monitor[2] };
  const commands: Record<string, string> = { 'open chrome': 'chrome', 'open vs code': 'vscode', 'open vscode': 'vscode', 'lock my pc': 'lock', 'lock windows': 'lock', 'sleep': 'sleep', 'restart': 'restart', 'shut down': 'shutdown', 'check my battery': 'status', 'system status': 'status', 'افتح كروم': 'chrome', 'افتح فيجوال ستوديو كود': 'vscode', 'اقفل الكمبيوتر': 'lock', 'حالة البطارية': 'status' };
  if (commands[t]) return { action: commands[t] };
  if (/^remember\s+/i.test(text)) return { action: 'remember', text: text.replace(/^remember\s+/i, '') };
  const del = t.match(/^(?:delete|remove|cancel|clear|drop)\s+(?:the\s+|my\s+)?(?:task|reminder|todo)?\s*(.*?)(?:\s+(?:task|reminder))?$/) || t.match(/^(?:امسح|احذف|الغي|شيل)\s+(?:التاسك|المهمة|مهمة|تاسك)?\s*(.*)$/u);
  if (del && /task|reminder|todo|تاسك|مهمة|المهمة|التاسك|^(?:delete|remove|cancel) (?:it|that|this)$/u.test(t)) return { action: 'task-delete', text: del[1].trim() };
  const done = t.match(/^(?:complete|finish|finished|done with|mark|tick off|check off|i (?:did|finished|completed))\s+(?:the\s+|my\s+)?(?:task\s+)?(.*?)(?:\s+(?:task|as done|as complete|done))*$/) || t.match(/^(?:خلصت|خلّصت|عملت)\s+(.*)$/u);
  if (done && done[1].trim()) return { action: 'task-done', text: done[1].trim() };
  // "Mute" / "stop talking": silence immediately, wherever it is heard.
  if (/^(?:un-?mute|unmute yourself|you can talk|talk again|speak again|etkalem|itkalam|اتكلم)$/u.test(t)) return { action: 'unmute' };
  if (/^(?:mute|be quiet|quiet|shut up|silence|stop talking|stop|enough|hush|اسكت|بس اسكت|خلاص اسكت|uskut|eskot)$/u.test(t)) return { action: 'mute' };
  // "Open my WhatsApp Web (in Chrome)": well-known sites by name; anything else goes to the AI, which answers with the address.
  const siteMatch = t.match(/^(?:open|launch|go to|bring up|pull up|start)\s+(?:up\s+)?(?:my\s+|the\s+)?(.+?)(?:\s+(?:web|website|site|page))?(?:\s+(?:in|on|from|with)\s+(?:my\s+)?(?:chrome|the browser|browser|edge))?$/);
  if (siteMatch) { const url = siteUrl(siteMatch[1]); if (url) return { action: 'site', text: url }; }
  // "What am I working on?" in English, Franco-Arabic and Arabic.
  if (/^(?:what (?:am|was) i (?:working on|doing)|what have i been (?:working on|doing)|what was i just doing|where was i|ana kont ba3mel eh|ana ba3mel eh|kont ba3mel eh)$/.test(t) || /(?:كنت بعمل ايه|بعمل ايه|كنت فين)/u.test(t)) return { action: 'working-on' };
  // Wake-up phrases work wherever they are heard (wake listener, conversation, or typed).
  if (/^(?:hey |ok )?(?:wake up,? jarvis|jarvis,? wake up|good morning,? jarvis|jarvis,? are you there|are you there,? jarvis|wake up)$/.test(t)) return { action: 'wake' };
  if (/^(?:hey |ok )?jarvis$/.test(t)) return { action: 'wake', text: 'instant' };
  // "Show me my tasks" / "what's next" / "read my mail": the hologram comes to the user, JARVIS summarises it.
  const pod = t.match(/^(?:show|show me|what are|what's|whats|what is|list|read|check|pull up|bring up)\s+(?:me\s+)?(?:my\s+|the\s+)?(tasks|task list|to ?dos?|schedule|calendar|agenda|next|mail|emails|inbox|weather)(?:\s+(?:today|now|for today))?$/)
    || (/^(?:what do i have(?: today)?|what's on my plate|whats on my plate|what's coming up|whats coming up)$/.test(t) ? ['', 'next'] : null);
  if (pod) { const k = pod[1]; return { action: 'pod', text: /task|todo/.test(k) ? 'tasks' : /mail|inbox/.test(k) ? 'comms' : k === 'weather' ? 'weather' : 'next' }; }
  if (/^(add task|remind me to)\s+/i.test(text)) return { action: 'task', text: text.replace(/^(add task|remind me to)\s+/i, '').replace(/\s*(?:ACTION|Say)\s*:[\s\S]*$/i, '').replace(/^[,:;.\-\s]+/, '').replace(/[.!?]+$/, '') };
  if (/^recall\s+/i.test(text)) return { action: 'recall', text: text.replace(/^recall\s+/i, '') };
  if (['briefing', 'daily briefing', 'good morning'].includes(t)) return { action: 'briefing' };
  if (/^(continue (what i was working on|my work|where i left off)( yesterday)?|resume my work|work continuity)$/.test(t)) return { action: 'continuity' };
  if (/^(project intelligence|project status|which projects have unresolved issues|show unresolved project tasks)$/.test(t)) return { action: 'project-intelligence' };
  if (/^(suggestions|what should i focus on|anything i should address)$/.test(t)) return { action: 'suggestions' };
  const workspace=t.match(/^launch workspace\s+(.{1,60})$/);
  if(workspace)return {action:'workspace',text:workspace[1].trim()};
  const projectSearch=t.match(/^(?:search|find) all projects for\s+(.{2,200})$/);
  if(projectSearch&&!/[\r\n;&|`$<>]/.test(projectSearch[1]))return {action:'project-search',text:projectSearch[1].trim()};
  const research=text.match(/^(?:research|look up|search the web for)\s+([^\r\n]{3,500})$/i);
  if(research&&!/[\u0000-\u001f\u007f]/.test(research[1]))return {action:'research',text:research[1].trim()};
  if(/^(?:close|hide|clear|dismiss) (?:the |that )?(?:display|screen|card|it|that)$|^(?:e2fel|2fel|eqfel) (?:el )?(?:screen|display|da|deh)$|^(?:اقفل|اخفي) (?:الشاشة|العرض|ده|دي)$/u.test(t))return {action:'show-close'};
  // "Show me anything": English, Franco-Arabic and Arabic. Specific show-commands above win first.
  const show=text.match(/^(?:show(?: me)?|display|put up|pull up|bring up|(?:can you |could you )?show me|let me see|e3redli|e3rdli|e3rdly|3rdli|3rdly|warini|wareeni|wareny|warrini|وريني|ورّيني|اعرض(?:لي|ي لي)?|اعرضلي|عرضلي)\s+(?:(?:about|on|a|an|the)\s+)?([^\r\n]{2,200})$/iu);
  if(show&&!/[\u0000-\u001f\u007f]/.test(show[1]))return {action:'show',text:show[1].trim().replace(/[.!?؟]+$/u,'').replace(/\s+(?:on (?:the |my )?screen|please|for me|ala el screen|3al screen|على الشاشة)$/iu,'')};
  return null;
}
export function localInsight(records: Entry[], kind: 'continuity' | 'project-intelligence' | 'suggestions', now = new Date()): string {
  const recent = (rows: Entry[]) => [...rows].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const openTasks = recent(records.filter(r=>r.kind==='task'&&!r.done));
  const activities = recent(records.filter(r=>r.kind==='activity'));
  const stamp = (value:string) => new Date(value).toLocaleString();
  if (kind==='continuity') {
    const lines = [
      ...activities.slice(0,5).map(r=>`Activity: ${r.title} (${stamp(r.createdAt)})${r.body?` — ${r.body.slice(0,240)}`:''}`),
      ...openTasks.slice(0,5).map(r=>`Open task: ${r.title}${r.dueAt?` (due ${stamp(r.dueAt)})`:''}`),
    ];
    return lines.length?`From your local records (newest first):\n${lines.join('\n')}`:'I found no recent activity or open tasks in the saved local records.';
  }
  if (kind==='project-intelligence') {
    const projects=recent(records.filter(r=>r.kind==='project'));
    if(!projects.length)return 'No authorized projects are recorded locally yet.';
    return `Recorded authorized projects and linked open tasks:\n${projects.slice(0,30).map(p=>`• ${p.title}: ${openTasks.filter(t=>t.projectId===p.id).length} open task(s)`).join('\n')}\nThis reflects saved tasks only; it does not imply code issues were scanned.`;
  }
  const overdue=openTasks.filter(r=>r.dueAt&&new Date(r.dueAt).getTime()<now.getTime());
  const failures=new Map<string,number>();
  for(const row of activities) if(/\b(fail(?:ed|ure)?|error)\b/i.test(`${row.title} ${row.body}`)) failures.set(row.title,(failures.get(row.title)??0)+1);
  const repeated=[...failures].filter(([,count])=>count>1).slice(0,5);
  const lines=[...overdue.slice(0,5).map(r=>`Overdue task: ${r.title} (due ${stamp(r.dueAt)})`),...repeated.map(([title,count])=>`Repeated activity label: ${title} (${count} recorded entries)`)];
  return lines.length?`Possible priorities from local records:\n${lines.join('\n')}\nThese are observations only; no repair or task changes were made.`:'No overdue tasks or repeated failure labels appear in the saved local records.';
}
export function monitorIndex(target: string, count: number): number | null {
  if (!Number.isInteger(count) || count < 1) return null;
  const normalized = target.trim().toLowerCase();
  const numeric: Record<string, number> = { one: 0, two: 1, three: 2, '1': 0, '2': 1, '3': 2 };
  if (normalized in numeric) return numeric[normalized] < count ? numeric[normalized] : null;
  if (normalized === 'left') return 0;
  if (normalized === 'right') return count - 1;
  if (normalized === 'center' && count >= 3) return Math.floor(count / 2);
  return null;
}

const WEEKDAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
/** Splits a spoken task into a clean title and an optional due time ("buy milk tomorrow at 9" -> "Buy milk", tomorrow 09:00). */
export function parseTaskWhen(input: string, now = new Date()): { title: string; dueAt?: string } {
  // Speech-to-text writes small numbers as words ("in two minutes", "half an hour").
  const NUMBERS: Record<string, string> = { a: '1', an: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', fifteen: '15', twenty: '20', thirty: '30', forty: '40', 'forty five': '45', fifty: '50' };
  let text = input.trim().replace(/[.!?،]+$/u, '')
    .replace(/\bin half an hour\b/i, 'in 30 minutes')
    .replace(/\bin (a|an|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty five|forty|fifty) (minute|minutes|min|hour|hours)\b/i, (_, n: string, unit: string) => `in ${NUMBERS[n.toLowerCase()]} ${unit}`)
    .replace(/\bat (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i, (_, n: string) => `at ${({ eleven: '11', twelve: '12' } as Record<string, string>)[n.toLowerCase()] ?? NUMBERS[n.toLowerCase()]}`);
  let day: Date | null = null, hour: number | null = null, minute = 0;
  const take = (re: RegExp) => { const m = text.match(re); if (m) text = (text.slice(0, m.index) + ' ' + text.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').trim(); return m; };
  let m = take(/\bin (\d{1,3}) (minute|minutes|min|hour|hours)\b/i);
  if (m) { const d = new Date(now.getTime() + Number(m[1]) * (m[2].startsWith('h') ? 3600000 : 60000)); return { title: tidy(text), dueAt: d.toISOString() }; }
  if (take(/\b(tomorrow|tmrw)\b|بكر[ةه]/iu)) { day = new Date(now); day.setDate(day.getDate() + 1); }
  else if (take(/\btonight\b/i)) { day = new Date(now); hour = 20; }
  else if (take(/\btoday\b|النهارد[ةه]/iu)) day = new Date(now);
  else if ((m = take(new RegExp('\\b(?:next |on |this )?(' + WEEKDAYS.join('|') + ')\\b', 'i')))) {
    day = new Date(now); const target = WEEKDAYS.indexOf(m[1].toLowerCase());
    let diff = (target - day.getDay() + 7) % 7; if (diff === 0 || /next/i.test(m[0])) diff = diff || 7; day.setDate(day.getDate() + diff);
  }
  if ((m = take(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b|الساع[ةه] (\d{1,2})/iu))) {
    hour = Number(m[1] ?? m[4]); minute = Number(m[2] ?? 0);
    if (m[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12; if (m[3]?.toLowerCase() === 'am' && hour === 12) hour = 0;
    if (!m[3] && hour < 8) hour += 12; // "at 5" means 5 pm for everyday tasks
    if (!day) { day = new Date(now); day.setHours(hour, minute, 0, 0); if (day <= now) day.setDate(day.getDate() + 1); }
  }
  if (!day) return { title: tidy(text) };
  day.setHours(hour ?? 9, minute, 0, 0);
  return { title: tidy(text), dueAt: day.toISOString() };
}
function tidy(text: string) { const t = text.replace(/\s+(on|at|by)$/i, '').trim(); return t.charAt(0).toUpperCase() + t.slice(1); }

/** Picks the open task a spoken phrase refers to: best word overlap, or the newest task for "it"/"that"/empty. */
export function matchTask<T extends { title: string; createdAt: string }>(phrase: string, tasks: T[]): T | null {
  const words = phrase.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 1 && !['it', 'that', 'this', 'the', 'my', 'task'].includes(w));
  if (!words.length) return [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  let best: T | null = null, score = 0;
  for (const task of tasks) {
    const title = task.title.toLowerCase();
    const s = words.filter(w => title.includes(w)).length / words.length;
    if (s > score) { score = s; best = task; }
  }
  return score >= 0.5 ? best : null;
}

/** Spoken heads-ups in the assistant's voice: what is coming up next, said once per item and stage. */
export function headsUp(records: { id: string; kind: string; title: string; dueAt?: string; done?: boolean; createdAt?: string }[], now: Date, warned: Set<string>): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  for (const r of records) {
    if (!['task', 'event'].includes(r.kind) || r.done || !r.dueAt) continue;
    const mins = Math.round((Date.parse(r.dueAt) - now.getTime()) / 60000);
    const lead = r.kind === 'event' ? 10 : 5;
    // No "in 2 minutes" warning for something the user created a moment ago.
    const fresh = r.createdAt ? now.getTime() - Date.parse(r.createdAt) < 90000 : false;
    if (mins > 0 && mins <= lead && !fresh && !warned.has(r.id + ':soon')) out.push({ key: r.id + ':soon', text: `Sir, ${r.title} in ${mins} minute${mins === 1 ? '' : 's'}.` });
    else if (mins <= 0 && mins > -10 && !warned.has(r.id + ':now')) out.push({ key: r.id + ':now', text: `Sir, it's time. ${r.title}.` });
  }
  return out.slice(0, 2);
}

/** The once-a-day status line JARVIS says when it comes online. */
export function onlineGreeting(name: string, hour: number, openTasks: { title: string; dueAt?: string }[], nextEvent: { title: string; dueAt: string } | null, weather: { temperature: number; description: string } | null): string {
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  // Rotate between "sir" and the owner's name so the greeting never sounds scripted.
  const named = name.toLowerCase() !== 'sir';
  const openers = named ? [`${part}, sir. All systems are online.`, `Welcome back, ${name}. Your workspace is ready.`, `${part}, ${name}. At your service.`] : [`${part}, sir. All systems are online.`];
  const bits = [openers[new Date().getDate() % openers.length]];
  if (weather) bits.push(`It's ${Math.round(weather.temperature)} degrees and ${weather.description.toLowerCase()}.`);
  if (nextEvent) bits.push(`Next on your calendar: ${nextEvent.title} at ${new Date(nextEvent.dueAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`);
  bits.push(openTasks.length ? `You have ${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}${openTasks.length <= 2 ? ': ' + openTasks.map(t => t.title).join(' and ') : ''}.` : 'Your task list is clear.');
  return bits.join(' ');
}

/** Well-known websites by spoken name; free sites only, opened in the user's own browser. */
const SITES: [RegExp, string][] = [
  [/^(?:whats ?app(?: web)?|واتساب|واتس|الواتس)$/u, 'https://web.whatsapp.com'], [/^(?:you ?tube|يوتيوب|اليوتيوب)$/u, 'https://www.youtube.com'], [/^(?:g ?mail|my (?:e-?mail|inbox)|جيميل|الايميل)$/u, 'https://mail.google.com'], [/^(?:فيسبوك|الفيس)$/u, 'https://www.facebook.com'],
  [/^google$/, 'https://www.google.com'], [/^git ?hub$/, 'https://github.com'], [/^chat ?gpt$/, 'https://chatgpt.com'], [/^claude(?: ai)?$/, 'https://claude.ai'],
  [/^facebook$/, 'https://www.facebook.com'], [/^instagram$/, 'https://www.instagram.com'], [/^(?:twitter|x)$/, 'https://x.com'], [/^linked ?in$/, 'https://www.linkedin.com'],
  [/^netflix$/, 'https://www.netflix.com'], [/^spotify(?: web)?$/, 'https://open.spotify.com'], [/^(?:google )?drive$/, 'https://drive.google.com'],
  [/^(?:google )?calendar$/, 'https://calendar.google.com'], [/^(?:google )?maps$/, 'https://maps.google.com'], [/^(?:google )?translate$/, 'https://translate.google.com'],
  [/^outlook$/, 'https://outlook.live.com'], [/^stack ?overflow$/, 'https://stackoverflow.com'], [/^reddit$/, 'https://www.reddit.com'], [/^tik ?tok$/, 'https://www.tiktok.com'],
  [/^telegram(?: web)?$/, 'https://web.telegram.org'], [/^discord(?: web)?$/, 'https://discord.com/app'], [/^vercel$/, 'https://vercel.com/dashboard'], [/^figma$/, 'https://www.figma.com'],
];
export function siteUrl(name: string): string | null {
  const n = name.trim().toLowerCase().replace(/[.!?]+$/, '').replace(/(?:\s+(?:for me|please|now|real quick))+$/, '').replace(/\s+(?:web|website|site|page)$/, ' web').replace(/ web$/, (m) => m);
  for (const [re, url] of SITES) if (re.test(n)) return url;
  return null;
}

/** Franco-Arabic and Arabic command words → the English verbs the command system understands. */
const COMMAND_WORDS: [RegExp, string][] = [
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:efta[7h](?:ly|li|lia)?|eft7(?:ly|li)?|aft[a]?[7h](?:ly|li)?|ftah|ifta[7h]|افتح|افتحلي|افتح لي|شغل|شغلي|شغّل|sha[g8]h?al|sha8l|shaghal)(?:\s+(?:li|ly|lia|لي))?\s+/iu, 'open '],
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:e2fel|2fel|ekfel|i2fel|اقفل|اقفلي|سكر)\s+/iu, 'close '],
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:emsa[7h]|im?sa7|امسح|احذف|شيل)\s+/iu, 'delete '],
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:dawar(?: 3la| ala)?|dawwar|دور على|دور|ابحث عن)\s+/iu, 'search for '],
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:fakarny|fakkarni|فكرني)\s+/iu, 'remind me to '],
];
export function translateCommandWords(input: string): string {
  const text = input.trim();
  for (const [re, verb] of COMMAND_WORDS) if (re.test(text)) return text.replace(re, verb).replace(/\b(?:el|al)\s+/i, '').replace(/^open (?:el|al)-?/i, 'open ');
  return text;
}
