import { timeToEnglish, fixFrancoVerb, PHRASES } from './vocabulary.ts';
import { findSite, findTool, englishAppName } from './sites.ts';
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
  lowPower: z.boolean().default(false), reducedMotion: z.boolean().default(false), oneScreen: z.boolean().default(true), prayerReminders: z.boolean().default(true), prayerLead: z.number().int().min(0).max(60).default(15), conversationMinutes: z.number().int().min(1).max(30).default(5), dnd: z.boolean().default(false),
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
  // "Mute": no voice until "unmute" (replies still on screen, still listening). "Shut up": stop the sentence now, keep listening.
  if (/^(?:mute|mute yourself|mute jarvis|voice off|ektem sotak|اكتم صوتك|اتكتم)$/u.test(t)) return { action: 'mute' };
  if (/^(?:be quiet|quiet|shut up|silence|stop talking|stop|enough|hush|اسكت|بس اسكت|خلاص اسكت|بس|uskut|eskot|osko?t|bas|khalas eskot)$/u.test(t)) return { action: 'hush' };
  // "I need to focus": silent mode, no voice and no listening until he calls "JARVIS" or ends it.
  if (/^(?:i need to focus|let me focus|silent mode|go silent|(?:ana )?(?:m7tag|me7tag|mehtag|7a?ab2a?) a?ra?kk?e?z|(?:انا |أنا )?محتاج (?:اركز|أركز)|سيبني اركز|خليك صامت)$/u.test(t)) return { action: 'focus', text: '0' };
  // "Open my WhatsApp Web (in Chrome)": well-known sites by name; anything else goes to the AI, which answers with the address.
  const siteMatch = t.match(/^(?:open|launch|go to|bring up|pull up|start)\s+(?:up\s+)?(?:my\s+|the\s+)?(.+?)(?:\s+(?:web|website|site|page))?(?:\s+(?:in|on|from|with)\s+(?:my\s+)?(?:chrome|the browser|browser|edge))?$/);
  if (siteMatch) { const url = siteUrl(siteMatch[1]); if (url) return { action: 'site', text: url }; }
  // "I want to design a poster" / "3ayz a3mel poster" / "عايز احول pdf لوورد": open the best tool for it.
  const goal = text.match(/^(?:i (?:want|need) to|i wanna|i'd like to|help me|(?:ana )?(?:3ayz|3ayez|3awz|3awez|me7tag|m7tag)|(?:انا )?(?:عايز|عاوز|محتاج))\s+(.{3,160})$/iu);
  if (goal) { const tool = findTool(goal[1]); if (tool) return { action: 'site', text: tool.url }; }
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
  // "Remove your day from the screen", "clear the screen", "شيل ده", "shil el card", "e2felo".
  if(/^(?:remove|close|hide|clear|dismiss|take(?: off| away| down)?|get rid of)\s+(?:.{0,40}\s)?(?:from|off) (?:the |my |your )?(?:screen|display)$|^(?:remove|hide|dismiss|clear) (?:it|that|this|the card|this card|your day|everything|all)$|^clear (?:the |my )?screen$|^(?:shil|sheel|ashil|sheil|اشيل|شيل|امسح|اقفل|اقفله|اقفلها)\s*(?:da|dah|deh|di|el card|el screen|kol 7aga|ده|دي|الكارت|الشاشة|كل حاجة)?$|^(?:e2felo|e2felha|2felo|e2fel|e2fel da|close|اقفله|اقفلها)$|^delete (?:ده|دي|da|dah|deh)$/u.test(t))return {action:'show-close'};
  if(/^(?:close|hide|clear|dismiss) (?:the |that )?(?:display|screen|card|it|that|الشاشة|الشاشه|العرض|الكارت|ده|دي|el screen|el card)$|^(?:e2fel|2fel|eqfel) (?:el )?(?:screen|display|da|deh)$|^(?:اقفل|اخفي) (?:الشاشة|العرض|ده|دي)$/u.test(t))return {action:'show-close'};
  if(/^(?:(?:the )?prayer times?(?: today)?|salah times|(?:when is )?(?:the )?next prayer|mawa3ee?d el sala[ah]?|mawa3id el salah|el sala(?:h)? el gaya emta|(?:مواعيد|اوقات|أوقات) الصلا[ةه]|الصلا[ةه] الجاي[ةه] امتى)$/u.test(t))return {action:'prayer'};
  if(/^(?:(?:the )?qibla(?: direction)?|where is (?:the )?qibla|el qe?bla fe+n|el qibla fe+n|القبل[ةه] فين|اتجاه القبل[ةه])$/u.test(t))return {action:'qibla'};
  if(/^(?:(?:what is )?(?:the |today's )?hijri date(?: today)?|el tarikh el hegry|التاريخ الهجري|النهارد[ةه] كام هجري)$/u.test(t))return {action:'hijri'};
  if(/^(?:(?:the )?(?:dollar|usd|euro|riyal|exchange|currency) (?:rate|price)s?(?: today)?|exchange rates?|(?:el )?dollar b ?kam|el dollar bekam|(?:el )?3omla|(?:سعر )?الدولار(?: بكام)?(?: النهارد[ةه])?|سعر العمل[ةه])$/u.test(t))return {action:'rates',text:'fx'};
  if(/^(?:(?:the )?gold (?:price|rate)s?(?: today)?|(?:el )?dahab b ?kam|el dahab bekam|(?:سعر )?(?:الدهب|الذهب)(?: بكام)?(?: النهارد[ةه])?)$/u.test(t))return {action:'rates',text:'gold'};
  if(/^(?:(?:the )?egypt(?:'s)? (?:match|game|national team)(?: score)?|(?:when is )?egypt'?s? next (?:match|game)|match masr(?: emta)?|mat?ch el montakhab(?: emta)?|el montakhab(?: kam kam)?|ماتش (?:مصر|المنتخب)(?: امتى| كام كام)?|المنتخب(?: كام كام)?)$/u.test(t))return {action:'football'};
  const zakat=t.match(/^(?:zakat|zaka|zakah|زكا[ةه])(?:\s+(?:on|of|3ala|ala|على))?\s*([\d.,٠-٩]+)?\s*(?:k|الف|alf|thousand)?\s*(?:egp|pounds?|geneh|gneh|جنيه)?$/u);
  if(zakat)return {action:'zakat',text:(zakat[1]??'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/,/g,'')+(/\b(?:k|alf|thousand)\b|الف/u.test(t)?'k':'')};
  const ayah=t.match(/^(?:quran|qur'?an|ayah|aya|ayet|آي[ةه]|قرآن|القرآن)\s+(\d{1,3})\s*[:\s]\s*(\d{1,3})$/u);
  if(ayah)return {action:'quran',text:ayah[1]+':'+ayah[2]};
  if(/^(?:ayat?(?: el| al)?[ -]?kursi|ayatul kursi|آي[ةه] الكرسي)$/u.test(t))return {action:'quran',text:'2:255'};
  if(/^(?:(?:the |next |upcoming )?(?:holidays?|occasions?)|(?:el )?(?:agazat|agaza el gaya)|(?:when is )?(?:ramadan|eid|the eid|eid al[- ]?(?:fitr|adha)|arafah|ashura|sham el[- ]?nessim)|ramadan emta|el 3eed emta|3eed emta|(?:الاجازات|الأجازات|الإجازات)(?: الجاي[ةه])?|(?:رمضان|العيد|عيد الفطر|عيد الاضحى|عيد الأضحى|شم النسيم)(?: امتى)?)$/u.test(t))return {action:'occasions'};
  // Shopping list: add, show, clear.
  const shopAdd=t.match(/^(?:add|put|zawed|zawwed|zwd|7ot|حط|ضيف|زود)\s+(.{1,80}?)\s+(?:to|on|in|3al|3ala|fel|على|علي|ل|لل|في)\s*(?:the |my |el |ال)?(?:shopping list|shopping|list el (?:7agat|shopping)|qaymet el moshtarayat|list|ليست[ةه]|قايم[ةه] المشتريات|قائم[ةه] المشتريات|المشتريات|مشتريات)$/u);
  if(shopAdd)return {action:'shopping-add',text:shopAdd[1].trim()};
  if(/^(?:(?:show|read|what's on|whats on)(?: me)? (?:the |my )?shopping list|(?:my |the )?shopping list|e3rdli (?:el )?(?:shopping|list)|(?:qaymet|el) moshtarayat|(?:قايم[ةه]|قائم[ةه]) المشتريات|وريني المشتريات)$/u.test(t))return {action:'shopping-show'};
  if(/^(?:clear|empty|reset) (?:the |my )?shopping list|i bought (?:it all|everything)|ashtarit kol 7aga|امسح (?:قايم[ةه] )?المشتريات|اشتريت كل حاج[ةه]$/u.test(t))return {action:'shopping-clear'};
  // Timers and alarms.
  const timerWords=t.replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const timer=/\b(?:timer|ta?ymer)\b|تايمر|مؤقت/u.test(timerWords)&&timerWords.match(/(\d{1,3})\s*(seconds?|secs?|sanya|sawany|ثاني[ةه]|ثواني|minutes?|mins?|d2aye2|da2aye2|da2i2a|de2i2a|da2ay2|دقايق|دقيق[ةه]|دقائق|hours?|sa3a|sa3at|ساع[ةه]|ساعات)/u);
  if(timer){const unit=/^(?:s|ث)/u.test(timer[2])?1:/^(?:h|sa3|ساع)/u.test(timer[2])?3600:60;const name=timerWords.replace(timer[0],'').replace(/\b(?:set|start|a|an|for|timer|taymer|tymer|e3mel|a3mel|ely|el)\b|تايمر|مؤقت|اعمل|لـ?|على/gu,'').replace(/\s+/g,' ').trim();return {action:'timer',text:JSON.stringify({seconds:Number(timer[1])*unit,name:name.slice(0,40)})};}
  const alarm=t.match(/^(?:wake me up|set an alarm|alarm|sa7+eeny|sa7+eny|sa7any|sa7eny|صحيني|صحّيني|اعمل منب[هة]|منب[هة])(?=\s|$)\s*(?:at|for|el sa3a|الساع[ةه])?\s*(.{1,40})$/u);
  if(alarm)return {action:'alarm',text:alarm[1].trim()};
  if(/^(?:(?:cancel|stop|delete|turn off) (?:the |my |all )?(?:timers?|alarms?)|(?:el8y|elghy|2fel|e2fel) el (?:timer|alarm|monabeh)|(?:الغي|إلغي|اقفل|وقف) (?:التايمر|المنب[هة]))$/u.test(t))return {action:'timer-cancel'};
  // Media and volume (Windows media keys).
  if(/^(?:pause|play|resume|pause (?:the )?(?:music|song|video)|play (?:the )?music|resume (?:the )?music|wa2+af el (?:aghnya|aghneya|music|mazzika)|wa2+af|kamel el music|وقف (?:الأغني[ةه]|الاغني[ةه]|المزيكا|الموسيقى)|شغل المزيكا|كمل)$/u.test(t))return {action:'media',text:'playpause'};
  if(/^(?:next|skip|next (?:song|track)|skip (?:this )?(?:song|track)|elly ba3do|el aghnya elly ba3daha|اللي بعده|الأغني[ةه] اللي بعدها|التالي)$/u.test(t))return {action:'media',text:'next'};
  if(/^(?:previous|previous (?:song|track)|last (?:song|track)|elly 2ablo|اللي قبله|الأغني[ةه] اللي قبلها)$/u.test(t))return {action:'media',text:'previous'};
  const vol=t.match(/^(?:(?:set (?:the )?)?volume(?: to)?|(?:el )?sot|الصوت)\s*(\d{1,3})\s*%?$/u);
  if(vol)return {action:'volume',text:String(Math.min(100,Number(vol[1])))};
  if(/^(?:volume up|louder|turn (?:it |the volume )?up|3al+y el sot|3ly el sot|ارفع الصوت|علي الصوت|على الصوت|عل[يى] الصوت)$/u.test(t))return {action:'volume',text:'up'};
  if(/^(?:volume down|quieter|turn (?:it |the volume )?down|wat+y el sot|wa6y el sot|wa6+i el sot|وطي الصوت|اخفض الصوت|قلل الصوت)$/u.test(t))return {action:'volume',text:'down'};
  if(/^(?:mute (?:the )?(?:pc|computer|laptop|sound|volume|speakers)|ekt[e]?m el sot|اكتم الصوت|اقفل الصوت)$/u.test(t))return {action:'volume',text:'mute'};
  // Quick notes.
  const note=text.match(/^(?:note|take a note|note that|write down|sagel|sagal|seggel|ekteb|ektb|سجل|سجّل|اكتب|دون)(?:\s+(?:en|that|ان|إن|ملاحظ[ةه]|note))?\s+(.{2,500})$/iu);
  if(note&&!/(?:raqam|ra2am|rakam|رقم|number)\s+\S+.*[\d٠-٩]{8,}/iu.test(text))return {action:'remember',text:note[1].trim()};
  // Routines.
  if(/^(?:good ?night(?:,? jarvis)?|night jarvis|tesba7 (?:3ala|3la|ala) (?:5eer|khir|khair|5er)|ana hanam|تصبح على خير|انا هنام|أنا هنام)$/u.test(t))return {action:'goodnight'};
  const focus=t.replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).match(/^(?:study time|start studying|focus(?: mode)?|focus for|wa2t el mozakra|ha?zaker|هذاكر|وقت المذاكر[ةه]|ركز)(?:\s+(?:for\s+)?(\d{1,3})\s*(?:minutes?|mins?|d2aye2|da2aye2|دقيق[ةه]|دقايق))?$/u);
  if(focus)return {action:'focus',text:String(Number(focus[1]??45))};
  if(/^(?:stop focus(?:ing)?|end focus|focus off|khalas mozakra|خلصت مذاكر[ةه])$/u.test(t))return {action:'focus-end'};
  // Study: summarize a lecture file, quiz, flashcards, dictionary, GPA, exams.
  if(/^(?:summari[sz]e (?:a |this |my |the )?(?:pdf|file|document|lecture|chapter|notes)|lak+h?a?s (?:el |li |ly )?(?:pdf|file|lecture|mo7adra|el mo7adra)|لخص(?:لي| لي)? (?:ال)?(?:ملف|محاضر[ةه]|pdf|بي دي اف|شابتر))$/u.test(t))return {action:'study-summary'};
  const quiz=t.match(/^(?:quiz me|make (?:me )?a quiz|test me|e3mel(?:ly|li)? quiz|e3melly emte7an|امتحني|اعمل(?:لي)? كويز)(?:\s+(?:on|about|fe|في|عن)\s+(.{2,80}))?$/u);
  if(quiz)return {action:'study-quiz',text:quiz[1]??''};
  const cards=t.match(/^(?:(?:make|create) (?:me )?flash ?cards|flash ?cards|e3mel(?:ly|li)? flash ?cards|اعمل(?:لي)? فلاش ?كارد(?:ز)?)(?:\s+(?:on|about|for|fe|في|عن)\s+(.{2,80}))?$/u);
  if(cards)return {action:'study-cards',text:cards[1]??''};
  const define=text.match(/^(?:what does (.{2,40}?) mean|define (.{2,40})|meaning of (.{2,40})|ya3ni (?:eh|eih) (.{2,40})|يعني (?:ايه|إيه|اي) (.{2,40})|معنى (?:كلم[ةه] )?(.{2,40}))[?؟.]?$/iu);
  if(define)return {action:'define',text:(define[1]??define[2]??define[3]??define[4]??define[5]??define[6]).trim()};
  const gpa=text.match(/^(?:calculate (?:my )?gpa|gpa|my gpa|el gpa|احسب(?:لي)? (?:المعدل|الجي بي ايه))\s*[:,-]?\s*(.+)$/iu);
  if(gpa)return {action:'gpa',text:gpa[1]};
  const exam=text.match(/^(?:my\s+)?(.{2,40}?)\s+(?:exam|final|midterm|quiz)\s+(?:is\s+)?(?:on\s+)?(.{3,40})$|^(?:emte7an|imti7an|امتحان)\s+(.{2,40}?)\s+(?:yom|يوم|on)\s+(.{3,40})$/iu);
  if(exam)return {action:'exam',text:JSON.stringify({subject:(exam[1]??exam[3]).trim(),when:(exam[2]??exam[4]).trim()})};
  // Privacy and memory.
  if(/^(?:go private|private mode(?: on)?|privacy mode|wad3 (?:5as|khas)|وضع خاص|خليك خاص)$/u.test(t))return {action:'private-on'};
  if(/^(?:private (?:mode )?off|stop private mode|end private mode|exit private mode|(?:el8y|elghy) el wad3 el (?:5as|khas)|الغي الوضع الخاص|اقفل الوضع الخاص)$/u.test(t))return {action:'private-off'};
  if(/^(?:forget (?:that|it|the last (?:thing|note|memory))|ensa (?:da|dah|deh|keda|dy)|انس[اى]? (?:ده|دي|كده))$/u.test(t))return {action:'forget-last'};
  if(/^(?:what do you know about me|what do you remember about me|who am i|my profile|enta 3aref eh 3an+y|(?:انت|إنت) (?:تعرف|عارف) (?:عني|عنى) (?:ايه|إيه))$/u.test(t))return {action:'about-me'};
  // People: contacts, WhatsApp messages (prepared, never sent automatically), birthdays.
  const digits=(s:string)=>s.replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const contact=digits(text).match(/^(?:save|add|sagel|sagal|seggel|سجل|سجّل|احفظ)\s+(?:the\s+)?(?:(?:phone\s+)?number\s+(?:of|for)\s+|raqam\s+|ra2am\s+|rakam\s+|رقم\s+)?(.{2,30}?)(?:'s)?(?:\s+(?:number|raqam|رقم))?\s*(?:is|:|=)?\s*(\+?\d[\d\s-]{7,16}\d)$/iu);
  if(contact)return {action:'contact-save',text:JSON.stringify({name:contact[1].trim(),phone:contact[2].replace(/[\s-]/g,'')})};
  const number=t.match(/^(?:what(?:'s| is) (.{2,30}?)'?s? (?:phone )?number|(?:raqam|ra2am|rakam) (.{2,30}?)(?: eh| kam)?|رقم (.{2,30}?)(?: ايه| كام)?)\??$/u);
  if(number)return {action:'contact-find',text:(number[1]??number[2]??number[3]).trim()};
  const wa=text.match(/^(?:send|text|message|whatsapp|ab3at|eb3at|ib3at|ابعت|إبعت|ابعتلي)\s+(?:a\s+(?:whatsapp\s+)?message\s+)?(?:to\s+|le\s+|li\s+|l\s+|ل|لـ\s*)?(.{2,30}?)[:,]?\s+(?:(saying|that|en|enn|eny|enny|إن|ان|إني|اني|انه|قوله|2olo|olo)\s+)?["“']?(.{1,300}?)["”']?$/iu);
  if(wa&&!/\b(?:e-?mail|mail|gmail)\b|ايميل|إيميل|بريد/iu.test(text)){const me=/^(?:إني|اني)$/u.test(wa[2]??'')?'أنا ':/^(?:eny|enny)$/i.test(wa[2]??'')?'ana ':'';return {action:'whatsapp',text:JSON.stringify({name:wa[1].replace(/^(?:to|le|li)\s+/i,'').trim(),message:me+wa[3].trim()})};}
  const bday=digits(text).match(/^(?:(.{2,30}?)'s birthday is (?:on )?(.{3,20})|(?:3eed|3id|eid) milad (.{2,30}?) (?:yom |fe |on )?(.{3,20})|عيد ميلاد (.{2,30}?) (?:يوم |في )?(.{3,20}))$/iu);
  if(bday)return {action:'birthday',text:JSON.stringify({name:(bday[1]??bday[3]??bday[5]).trim(),when:(bday[2]??bday[4]??bday[6]).trim()})};
  const tr=text.match(/^(?:translate|targem|targim|ترجم|ترجملي)\s+["“']?(.{1,400}?)["”']?(?:\s+(?:to|into|l|le|lel|لل|ل|الى|إلى|لـ)\s*(english|arabic|french|german|spanish|انجليزي|إنجليزي|عربي|فرنساوي|el english|el 3araby|3araby|english|engelizy))?$/iu);
  if(tr)return {action:'translate',text:JSON.stringify({text:tr[1].trim(),to:(tr[2]??'').toLowerCase()})};
  // Programming (read-only): git status and today's changes of an authorized project.
  const git=t.match(/^(?:git status|what (?:did i change|changed) today|what changed in (?:my )?code(?: today)?|git log today|eh elly et8ayar enharda)(?:\s+(?:in|for|fe|في)\s+(.{2,40}))?$/u);
  if(git)return {action:'git',text:git[1]??''};
  if(/^(?:i am iron ?man|i'm iron ?man|ana iron ?man|أنا ايرون مان)$/u.test(t))return {action:'easter-egg'};
  // Voice ID: learn the owner's voice, then answer only him.
  if(/^(?:learn my voice|learn to recogni[sz]e my voice|teach you my voice|enroll my voice|set up voice id|e3raf sotey|e3raf soty|(?:ات|ا)?علم صوتي|اعرف صوتي|اتعرف على صوتي)$/u.test(t))return {action:'voice-enroll'};
  if(/^(?:listen (?:only )?to me(?: only)?|only listen to me|voice (?:id|lock) on|esma3 leya bas|isma3ni ana bas|اسمعني (?:انا|أنا) بس|اسمع صوتي بس)$/u.test(t))return {action:'voice-lock',text:'on'};
  if(/^(?:listen to everyone|voice (?:id|lock) off|esma3 kolo|اسمع الكل|اسمع كل الناس)$/u.test(t))return {action:'voice-lock',text:'off'};
  // Directions: "give me location to MIU", "how do I get to Cairo Festival City", "wadini el gam3a", "اوصل ازاي للجامعة".
  const route=text.match(/^(?:(?:can you |please )?(?:give|show|send) me (?:the )?(?:location|directions|route|way|map) (?:to|of|for)|(?:get |show )?directions to|(?:the )?(?:route|way) to|navigate to|take me to|how (?:do i|can i|to) (?:get|go) to|(?:give me |show me )?(?:the )?location of|where is the location of|wadini|waddini|wa2eny|wasalni|el taree2 (?:le|l|li)|(?:a|e)wsal ezay (?:le|l)?|ازاي (?:اروح|أروح|اوصل|أوصل)|(?:اوصل|أوصل) ازاي|وديني|ودّيني|خدني|الطريق (?:لـ?|ل|الى|إلى))\s*(.{2,60}?)[?.!؟]*$/iu);
  if(route)return {action:'directions',text:route[1].replace(/^(?:the|el|al)\s+/i,'').trim()};
  if(/^(?:take me home|(?:i want to )?go home|wadini el beit|روحني|عايز اروح البيت)$/iu.test(t))return {action:'directions',text:'home'};
  // PC control. "Sha8al/شغل" + Wi-Fi/Bluetooth must win over "play".
  const tn=t.replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const bright=tn.match(/^(?:(?:set |make |put )?(?:the )?(?:screen )?brightness (?:to |at )?(\d{1,3}) ?%?|(?:el )?(?:edaa?ya|e?daa2a|brightness) (\d{1,3})|(?:ال)?(?:اضاءة|إضاءة|سطوع) (\d{1,3}))$/u);
  if(bright)return {action:'pc',text:'brightness:'+(bright[1]??bright[2]??bright[3])};
  if(/^(?:(?:increase|raise|turn up) (?:the )?brightness|brightness up|brighter|(?:3alli|3ally|zawed|zawwed) el (?:edaa?ya|e?daa2a|brightness)|(?:علي|على|زود) (?:ال)?(?:اضاءة|إضاءة))$/u.test(t))return {action:'pc',text:'brightness:up'};
  if(/^(?:(?:decrease|lower|turn down|reduce|dim) (?:the )?(?:brightness|screen)|brightness down|dimmer|(?:watti|wati|wa6y|2allel|alel) el (?:edaa?ya|e?daa2a|brightness)|(?:وطي|قلل) (?:ال)?(?:اضاءة|إضاءة))$/u.test(t))return {action:'pc',text:'brightness:down'};
  if(/^(?:(?:turn on |enable |switch to |go )?dark (?:mode|theme)(?: on)?|(?:sha8al|shaghal) (?:el )?dark mode|(?:شغل )?(?:الوضع الليلي|الوضع الداكن|الدارك مود))$/u.test(t))return {action:'pc',text:'dark:on'};
  if(/^(?:(?:turn on |enable |switch to |go )?light (?:mode|theme)(?: on)?|dark mode off|(?:turn off|disable) dark mode|(?:2fel|e2fel|a2fel) (?:el )?dark mode|(?:اقفل|الغي) (?:الوضع الليلي|الدارك مود)|الوضع الفاتح)$/u.test(t))return {action:'pc',text:'dark:off'};
  const radio=t.match(/^(?:turn |switch )?(on|off) (?:the )?(wi-?fi|wireless|bluetooth)$|^(?:turn |switch )?(?:the )?(wi-?fi|bluetooth) (on|off)$|^(sha8al|shaghal|2fel|e2fel|a2fel|open|close|شغل|اقفل|افصل) (el |ال)?(wi-?fi|bluetooth|واي ?فاي|بلوتوث)$/u);
  if(radio){const on=radio[1]??radio[4]??radio[5];const dev=radio[2]??radio[3]??radio[7];return {action:'pc',text:(/blue|بلوتوث/u.test(dev)?'bluetooth':'wifi')+':'+(/^(?:on|sha8al|shaghal|open|شغل)$/u.test(on)?'on':'off')};}
  if(/^(?:(?:take|grab) (?:a )?screen ?shot|screen ?shot|screen capture|capture (?:the|my) screen|e5od screen ?shot|(?:خد |اعمل )?سكرين ?شوت|صور الشاشة)$/u.test(t))return {action:'pc',text:'screenshot'};
  if(/^(?:tidy|clean ?up|organi[sz]e|sort|arrange) (?:up )?(?:my |the )?downloads?(?: folder)?$|^(?:ratteb|rateb|nadaf|nadaff) el downloads?$|^(?:رتب|نظم|نضف) (?:فولدر )?(?:ال)?(?:داونلود|داونلودز|تنزيلات)$/u.test(t))return {action:'pc',text:'tidy-downloads'};
  if(/^(?:clean|clear|delete|remove) (?:up )?(?:the |my )?(?:temp|temporary|junk)(?: files)?$|^free (?:up )?(?:some )?(?:disk )?space$|^nadaf el (?:gehaz|laptop|temp)$|^(?:نضف الجهاز|امسح الملفات المؤقتة|نضف الملفات المؤقتة)$/u.test(t))return {action:'pc',text:'clean-temp'};
  const find=t.match(/^(?:find|search for|look for|locate|where(?:'s| is)) (?:my |the |a )?(?:file|files|document|pdf|folder|presentation|sheet) (?:called |named |about )?(.{2,60})$|^(?:find|locate) (?:my |the )?(.{2,50}) (?:file|pdf|document|folder|presentation|slides)$|^(?:dawar|dawarli|dawwar) (?:3la|3ala) (?:file |malaf |el file )?(.{2,50})$|^(?:دور|دورلي|دوّر) على (?:ملف |فايل |الملف )?(.{2,50})$|^search for (?:ملف|الملف|فايل|file) (.{2,50})$/u);
  if(find)return {action:'find-file',text:(find[1]??find[2]??find[3]??find[4]??find[5]).trim()};
  const openFile=t.match(/^open (?:my |the )?(?:file|document|pdf|presentation) (?:called |named )?(.{2,60})$|^(?:efta7|eftah) (?:el )?(?:file|malaf) (.{2,50})$|^افتح (?:ملف|الملف|فايل) (.{2,50})$/u);
  if(openFile)return {action:'open-file',text:(openFile[1]??openFile[2]??openFile[3]).trim()};
  // News and media.
  const news=t.match(/^(?:(?:the |today'?s |latest |any )?news|headlines|what'?s (?:in )?the news|what'?s happening(?: in (?:egypt|the world))?|news (?:about|on) (.{2,40})|(?:el )?(?:akhbar|a5bar)(?: (?:el )?(.{2,40}?))?(?: eh| a)?|(?:ايه )?(?:ال)?(?:اخبار|أخبار)(?: (.{2,40}?))?(?: ايه)?)$/u);
  if(news)return {action:'news',text:(news[1]??news[2]??news[3]??'').replace(/^(?:el|al) /,'').trim()};
  if(/^(?:summari[sz]e|sum up|tl;?dr|give me (?:a )?summary of) (?:this|the|that) (?:page|article|tab|website|site|video)$|^(?:lakhas|la5as|la5asly|lakhasly) (?:el )?(?:safha|page|maqal|video|article)(?: de| da)?$|^لخص(?:لي)? (?:الصفحة|المقال|الفيديو|ده|دي)(?: دي| ده)?$/u.test(t))return {action:'summarize-page'};
  const play=t.match(/^(?:play|put on|sha8al|shaghal|شغل|شغّل|شغللي)\s+(?:some |me |li |لي )?(.{2,60})$/u);
  // 'شغل X' reaches here as 'open X': a name in Arabic (not an app such as الإعدادات) means something to play.
  const playAr=t.match(/^open ((?!ال)[؀-ۿ].{1,59}|.*(?:قرآن|قران|راديو|اغاني|أغاني|موسيقى|مزيكا|بودكاست).*)$/u);
  if(playAr)return {action:'play',text:playAr[1].trim()};
  if(play&&play[1]==='music')return {action:'play',text:'relaxing music'};
  if(play&&!/^(?:it|that|this)$|^(?:the )?(?:next|previous)/.test(play[1]))return {action:'play',text:play[1].trim()};
  // Money: expenses, budget, subscriptions and savings goals, in pounds.
  const spent=tn.match(/^(?:i )?(?:spent|paid|spend) (\d+(?:\.\d+)?) ?(?:pounds?|egp|le|gneh|geneh)? ?(?:on|for) (.{2,40})$|^(?:sraft|sarraft|dafa3t|dafaat) (\d+(?:\.\d+)?) ?(?:geneh|gneh|ginih|gnih|pound|le)? ?(?:3la|3ala|f|fe|fel|3al) (.{2,40})$|^(?:صرفت|دفعت) (\d+(?:\.\d+)?) ?(?:جنيه|ج)? ?(?:على|في|ع|عال|فى) ?(.{2,40})$/u);
  if(spent)return {action:'expense',text:(spent[1]??spent[3]??spent[5])+'|'+(spent[2]??spent[4]??spent[6]).trim()};
  if(/^(?:how much (?:did i|have i) spen[dt](?: (?:this|so far this) (?:month|week)| today)?|(?:show )?my (?:expenses|spending)(?: this month)?|(?:ana )?sraft kam(?: el shahr da)?|(?:انا )?صرفت كام(?: الشهر ده)?|مصاريفي|مصاريف الشهر)$/u.test(t))return {action:'spending'};
  const budget=tn.match(/^(?:(?:set )?my (?:monthly )?budget (?:is |to )?|set (?:a )?budget (?:of |to )?|budget )(\d+)(?: (?:pounds?|egp))?$|^(?:el )?budget (?:bta3y )?(\d+)$|^(?:الميزانية|ميزانيتي)(?: الشهرية)? (\d+)$/u);
  if(budget)return {action:'budget',text:budget[1]??budget[2]??budget[3]};
  const sub=tn.match(/^(?:add (?:a )?subscription|new subscription|subscription) (.{2,30}?) (\d+)(?: (?:pounds?|egp|a month|monthly|per month))*(?: (?:on|every) (?:the )?(\d{1,2})(?:st|nd|rd|th)?)?$|^(?:ishtirak|eshterak|اشتراك) (.{2,30}?) (\d+)(?: (?:geneh|جنيه))?(?: (?:yom|يوم) (\d{1,2}))?$/u);
  if(sub)return {action:'subscription',text:(sub[1]??sub[4]).trim()+'|'+(sub[2]??sub[5])+'|'+(sub[3]??sub[6]??'')};
  if(/^(?:(?:show |list )?my subscriptions|subscriptions|el eshterakat|ishtirakaty|اشتراكاتي|الاشتراكات)$/u.test(t))return {action:'subscriptions'};
  const saveGoal=tn.match(/^(?:i want to save|save up|savings goal(?: of)?|new savings goal) (\d+)(?: (?:pounds?|egp))? (?:for|to buy) (?:a |an |the )?(.{2,40})$|^(?:3ayez|3ayz|3awz) a?(?:7awesh|hawesh|a7awesh) (\d+) (?:l|le|li|3shan|3ashan) (.{2,40})$|^(?:عايز|عاوز) (?:احوش|أحوش) (\d+) (?:ل|عشان|علشان) ?(.{2,40})$/u);
  if(saveGoal)return {action:'goal',text:(saveGoal[1]??saveGoal[3]??saveGoal[5])+'|'+(saveGoal[2]??saveGoal[4]??saveGoal[6]).trim()};
  const saved=tn.match(/^i (?:saved|put aside|added) (\d+)(?: (?:pounds?|egp))?(?: (?:for|to|towards?) (?:the |my )?(.{2,40}))?$|^(?:7awesht|hawesht|a7awesht) (\d+)(?: (?:l|le|3shan) (.{2,40}))?$|^(?:حوشت|وفرت) (\d+)(?: (?:ل|عشان) ?(.{2,40}))?$/u);
  if(saved)return {action:'saved',text:(saved[1]??saved[3]??saved[5])+'|'+(saved[2]??saved[4]??saved[6]??'').trim()};
  if(/^(?:(?:show )?my (?:savings|goals|savings goals)|how much (?:have i|did i) save[d]?|ana 7awesht kam|(?:انا )?حوشت كام|تحويشتي|اهدافي)$/u.test(t))return {action:'goals'};
  // His course files: the folder JARVIS reads lecture material from.
  if(/^(?:open (?:my )?(?:courses?|lectures?|study)(?: folder| files)?|(?:my )?courses folder|(?:efta7|open) (?:el )?(?:mawad|mo7adrat|المواد|المحاضرات)|افتح (?:فولدر |ملف )?(?:المواد|المحاضرات))$/u.test(t))return {action:'courses'};
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
export function parseTaskWhen(input: string, now = new Date()): { title: string; dueAt?: string; recurrence?: 'daily' | 'weekly' | 'monthly' } {
  // Speech-to-text writes small numbers as words ("in two minutes", "half an hour").
  const NUMBERS: Record<string, string> = { a: '1', an: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', fifteen: '15', twenty: '20', thirty: '30', forty: '40', 'forty five': '45', fifty: '50' };
  let text = timeToEnglish(input).trim().replace(/[.!?،؟]+$/u, '')
    .replace(/\bin half an hour\b/i, 'in 30 minutes')
    .replace(/\bin (a|an|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty five|forty|fifty) (minute|minutes|min|hour|hours)\b/i, (_, n: string, unit: string) => `in ${NUMBERS[n.toLowerCase()]} ${unit}`)
    .replace(/\bat (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i, (_, n: string) => `at ${({ eleven: '11', twelve: '12' } as Record<string, string>)[n.toLowerCase()] ?? NUMBERS[n.toLowerCase()]}`);
  let day: Date | null = null, hour: number | null = null, minute = 0;
  // Repetition: "every day", "every week", "every month", "every sunday" (weekday handled below as the first day).
  let recurrence: 'daily' | 'weekly' | 'monthly' | undefined;
  { const r = text.match(/\b(?:every ?day|daily|each day)\b|\bevery (?:week|weekly)\b|\bweekly\b|\bevery month\b|\bmonthly\b|\bevery (?=(?:sun|mon|tues|wednes|thurs|fri|satur)day\b)/i);
    if (r) { recurrence = /day|daily/i.test(r[0]) && !/every (?=\w+day)/i.test(r[0]) ? 'daily' : /month/i.test(r[0]) ? 'monthly' : 'weekly'; text = (text.slice(0, r.index) + ' ' + text.slice(r.index! + r[0].length)).replace(/\s+/g, ' ').trim(); } }
  const take = (re: RegExp) => { const m = text.match(re); if (m) text = (text.slice(0, m.index) + ' ' + text.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').trim(); return m; };
  let m = take(/\bin (\d{1,3}) (minute|minutes|min|hour|hours)\b/i);
  if (m) { const d = new Date(now.getTime() + Number(m[1]) * (m[2].startsWith('h') ? 3600000 : 60000)); return { title: tidy(text), dueAt: d.toISOString() }; }
  // Calendar dates: "December 20", "20 December", "20th of Dec", "20/12" (day first, as in Egypt).
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthIndex = (w: string) => MONTHS.indexOf(w.slice(0, 3).toLowerCase());
  const dated = (month: number, date: number) => { const d = new Date(now.getFullYear(), month, date); if (d.getMonth() !== month) return null; if (d.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) d.setFullYear(d.getFullYear() + 1); return d; };
  const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  let dm: RegExpMatchArray | null;
  if ((dm = take(new RegExp('\\b(?:on\\s+)?' + MONTH_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b', 'i')))) day = dated(monthIndex(dm[1]), Number(dm[2]));
  else if ((dm = take(new RegExp('\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MONTH_RE + '\\b', 'i')))) day = dated(monthIndex(dm[2]), Number(dm[1]));
  else if ((dm = take(/\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/))) day = dated(Number(dm[2]) - 1, Number(dm[1]));
  if (day) { /* a calendar date was given */ }
  else if (take(/\b(?:the )?day after tomorrow\b/i)) { day = new Date(now); day.setDate(day.getDate() + 2); }
  else if (take(/\b(tomorrow|tmrw)\b|بكر[ةه]/iu)) { day = new Date(now); day.setDate(day.getDate() + 1); }
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
  if (!day && recurrence) { day = new Date(now); day.setHours(hour ?? 9, minute, 0, 0); if (day <= now) day.setDate(day.getDate() + (recurrence === 'weekly' ? 7 : 1)); }
  if (!day) return { title: tidy(text) };
  day.setHours(hour ?? 9, minute, 0, 0);
  return { title: tidy(text), dueAt: day.toISOString(), ...(recurrence ? { recurrence } : {}) };
}
function tidy(text: string) { const t = text.replace(/\s+(?:on|at|by|يوم|yom)$/iu, '').trim(); return t.charAt(0).toUpperCase() + t.slice(1); }

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
  return findSite(name);
}

/** Franco-Arabic and Arabic command words → the English verbs the command system understands. */
const COMMAND_WORDS: [RegExp, string][] = [
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:efta[7h](?:ly|li|lia)?|eft7(?:ly|li)?|aft[a]?[7h](?:ly|li)?|ftah|ifta[7h]|افتح|افتحلي|افتح لي|شغل|شغلي|شغّل|sha[g8]h?al|sha8l|shaghal)(?:\s+(?:li|ly|lia|لي))?\s+/iu, 'open '],
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:e2fel|2fel|ekfel|i2fel|اقفل|اقفلي|سكر)\s+/iu, 'close '],
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:emsa[7h]|im?sa7|امسح|احذف|شيل)\s+/iu, 'delete '],
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:dawar(?: 3la| ala)?|dawwar|دور على|دور|ابحث عن)\s+/iu, 'search for '],
  [/^(?:(?:ya |hey )?jarvis[,.!\s]+)?(?:fakkarny|fakarny|fakkarni|fakarni|fakrny|fkrny|fakerni|fakerny|ftakarny|فكرني|فكّرني|ذكرني|افتكرلي)\s+(?:(?:en|enny|eni|b|bel|be|ان|إن|إني|اني|بال|ب)\s+)?/iu, 'remind me to '],
];
// Franco = Egyptian Arabic in Latin letters: digits standing for letters (3=ع, 7=ح, 2=ء, 5=خ, 8=غ) inside words,
// or at least two common Franco words. Plain English with numbers ("2 apples") is not Franco.
const FRANCO_WORDS=new Set(['ana','enta','enti','ezayak','ezayek','ezay','eh','eih','leh','fen','feen','emta','keda','kda','msh','mesh','mish','bokra','bukra','enharda','naharda','delwa2ty','dlw2ty','3ayz','3ayez','3awz','3amel','3amla','a3mel','e3mel','e3ml','ya','yala','yalla','tamam','5alas','khalas','ma3lesh','fakkarny','fakarny','faker','eftah','2fel','e2fel','sha8al','shaghal','3andy','3ndy','3andak','kam','meen','min','ahsan','awy','oly','2oly','2ol','kalem','ezzay','lesa','lessa','bas','bs','wala','walla','gamed','7aga','haga','kollo','kol','el','b','bekam','bkam','fen','emta','masr','montakhab','qebla','qibla','dahab','salah','sala','mawa3eed','mawa3id','e3rdli','warini','eftah','3ala','3an','ba3d','2abl','abl','sa3a','enaharda','bokra','gaya','gay','kam']);
const STRONG_FRANCO=new Set(['emta','fen','feen','ezay','ezayak','ezayek','leh','bekam','bkam','3ayz','3ayez','3awz','msh','mesh','keda','kda','delwa2ty','enharda','naharda','bokra','e3rdli','warini','eftah','fakkarny','fakarny','ba3d','e3mel','a3mel','3amel','yalla','tamam','5alas','ma3lesh','2oly','oly']);
export function wantsEgyptianArabic(input: string): boolean {
  if (/[\u0600-\u06FF]/.test(input)) return true;
  const words = input.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (words.some(w => /[a-z][2378]|[2378][a-z]/.test(w) && !/^\d+(st|nd|rd|th|am|pm|k|m|gb|mb|s)$/.test(w))) return true;
  // Some words are Franco on their own ("ramadan emta", "el gym fen").
  if (words.some(w => STRONG_FRANCO.has(w))) return true;
  return words.filter(w => FRANCO_WORDS.has(w)).length >= 2;
}
// "open الآلة الحاسبة" → "open Calculator", so the installed-app lookup finds it.
function withAppName(text: string): string {
  const m = text.match(/^(open|launch|start)\s+(.+)$/i);
  const app = m ? englishAppName(m[2]) : null;
  return app ? `${m![1]} ${app}` : text;
}
export function translateCommandWords(input: string): string {
  const text = fixFrancoVerb(input.trim());
  for (const [re, phrase] of PHRASES) if (re.test(text)) return text.replace(re, phrase);
  for (const [re, verb] of COMMAND_WORDS) if (re.test(text)) return withAppName(text.replace(re, verb).replace(/\b(?:el|al)\s+/i, '').replace(/^open (?:el|al)-?/i, 'open '));
  return withAppName(text);
}
