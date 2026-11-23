import {localIntent,type Settings} from './model.ts';
import {informationalRequest,normalizeUtterance} from './understanding.ts';
export type Scope={action:string;resource:string};
// These are capabilities for the explicit request, not a general auto-approve
// switch. Model output never adds scopes or broadens these targets.
export function directScopes(input:string,context:{currentId?:string|null;previousId?:string|null},projectId:string|undefined,presets:Settings['workspacePresets'],installedApps:{name:string;appId:string}[]=[]):Scope[]{
  const intent=localIntent(input),text=normalizeUtterance(input);
  if(intent?.action==='skill-save')return [{action:'skill_save',resource:'new:verified-skill'}];
  if(/\b(?:show|add|open) (?:the )?(?:recent )?(?:research|research results)(?: panel)?(?: in| on) (?:the )?overview\b|\b(?:hide|remove|close) (?:the )?(?:recent )?(?:research|research results)(?: panel)? from (?:the )?overview\b/.test(text))return [{action:'settings_save',resource:'preferences'}];
  if(intent?.action==='browser-read')return [{action:'browser_page_read',resource:'browser-active'}];
  if(intent?.action==='browser-scroll')return [{action:'browser_page_scroll',resource:'browser-active'}];
  if(intent?.action==='browser-link')return [{action:'browser_link_activate',resource:'browser-active'}];
  if(intent?.action==='browser-button'||intent?.action==='browser-fill')return [{action:'browser_control',resource:'browser-active'}];
  if(informationalRequest(input))return [];
  if(intent?.action==='preference')return [{action:'settings_save',resource:'preferences'}];
  if(/\b(?:show|add|open) (?:the )?(?:recent )?activity(?: panel)?\b/.test(text)||/\b(?:hide|remove|close) (?:the )?(?:recent )?activity(?: panel)?(?: from (?:the )?overview)?\b/.test(text)||/\b(?:show|add|open) (?:the )?(?:high priority|urgent|overdue|priority queue)(?: tasks?)?(?: panel)?\b|\bshow (?:me )?(?:my )?(?:high priority|urgent|overdue) tasks\b|\b(?:hide|remove|close) (?:the )?(?:high priority|urgent|overdue|priority queue)(?: tasks?)?(?: panel)? from (?:the )?overview\b/.test(text))return [{action:'settings_save',resource:'preferences'}];
  if(/\b(?:hide|clear) (?:everything|all panels|all widgets)|\b(?:restore|show|bring back) (?:everything|all panels|overview panels)|\b(?:keep|pin) (?:this|that|it) visible|\b(?:put|move) (?:this|that|it) (?:on|to) (?:the )?(?:left|right)\b|\b(?:show|focus|bring up|add|open) (?:me )?(?:my )?(?:recent )?(?:cpu|ram|system resources|system monitor|metrics|project|projects|project progress|tasks|reminders|schedule|briefing|security|profile|development tools|activity)(?: panel)?(?: in| on)?(?: the)? overview?\b|\b(?:hide|remove|close) (?:the )?(?:recent )?activity(?: panel)? from (?:the )?overview\b|(?:اخفي.*(?:كل|الكل)|(?:رجع|اظهر|اعرض).*(?:اللوحات|كل حاجه)|(?:خلي|سيب).*(?:ده|دي|دا).*(?:ظاهر|باين)|(?:حط|انقل).*(?:ده|دي|دا).*(?:يمين|شمال))/.test(text))return [{action:'settings_save',resource:'preferences'}];
  if(/\b(don't|do not|never|cancel|stop)\b|متفتحش|ما تفتحش|مش عايز/.test(text))return [];
  if(intent?.action==='task'||intent?.action==='remember')return [{action:'record_put',resource:'new:'+(intent.action==='task'?'task':'memory')}];
  // The shopping list is one note: created the first time, then only its lines change (see action_policy.rs).
  // Contacts and birthdays are saved as notes; a WhatsApp message is only prepared (WhatsApp waits for Send).
  if(intent?.action==='contact-save'||intent?.action==='birthday')return [{action:'record_put',resource:'new:memory'}];
  if(intent?.action==='whatsapp')return [{action:'open_website',resource:'whatsapp-send'}];
  if(intent?.action==='directions')return [{action:'open_website',resource:'maps-route'}];
  // An exam: one new calendar event plus up to three study reminders.
  if(intent?.action==='exam')return [{action:'record_put',resource:'new:event'},{action:'record_put',resource:'new:task'}];
  if(intent?.action==='shopping-add'||intent?.action==='shopping-clear')return [{action:'record_put',resource:'new:memory'},{action:'record_put',resource:'shopping-list'}];
  if(intent?.action==='monitor')return [{action:'settings_save',resource:'preferences'}];
  if(intent?.action==='workspace'){
    const preset=presets.find(p=>p.name.toLowerCase()===intent.text?.toLowerCase());
    return preset?[{action:'settings_save',resource:'preferences'},...preset.placements.filter(p=>p.application!=='jarvis').map(p=>({action:'app_window_control',resource:'app:'+p.application}))]:[];
  }
  const website=input.trim().match(/^(?:open|visit|go to|navigate to)\s+(https?:\/\/\S+)$/i);
  if(website){try{return [{action:'open_website',resource:'website:'+new URL(website[1]).href}];}catch{return [];}}
  if(/\b(open|launch|start)\b|^افتح/.test(text)){
    const knownAppMention=!!intent&&(intent.action==='chrome'||intent.action==='vscode'||intent.action==='windows-security')||/\b(chrome|google chrome|vs\s*code|vscode|jarvis)\b/.test(text);
    const matches=installedApps.filter(item=>!knownAppMention&&item.name.length>=3&&text.includes(normalizeUtterance(item.name)));
    if(matches.length===1)return [{action:'installed_app_open',resource:'installed-app:'+matches[0].appId}];
  }
  if(/^copy\s+.+\s+to\s+.+$/i.test(input.trim())&&projectId)return [{action:'project_copy',resource:'project:'+projectId}];
  const apps=new Set<string>();
  if(intent?.action==='chrome'||/\bchrome\b|كروم/.test(text))apps.add('chrome');
  if(intent?.action==='vscode'||/\b(vs\s*code|vscode)\b|فيجوال/.test(text))apps.add('vscode');
  if(!apps.size&&/\b(it|this|that|previous|other one)\b|ده|دي|السابق/.test(text)){
    const id=/\b(previous|other one)\b|السابق/.test(text)?context.previousId:context.currentId;
    if(id==='app:chrome'||id==='app:vscode')apps.add(id.slice(4));
  }
  if(intent?.action==='windows-security')apps.add('windows-security');
  if(!intent&&!/\b(open|show|move|put|focus|bring|launch|minimize|restore)\b|افتح|وريني|انقل|حط|صغر|رجع/.test(text))return [];
  return [...apps].flatMap(app=>[{action:'app_window_control',resource:'app:'+app},{action:'system_action',resource:'app:'+app}]);
}
