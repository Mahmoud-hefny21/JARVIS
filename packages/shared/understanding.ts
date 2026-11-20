import { z } from 'zod';
import type { Entry } from './model';

export const EntitySchema=z.object({id:z.string().min(1).max(800),kind:z.enum(['application','project','file','task','memory']),label:z.string().max(600),projectId:z.string().optional(),path:z.string().max(600).optional(),at:z.string().optional()}).strict();
export type Entity=z.infer<typeof EntitySchema>;
export const ProposalSchema=z.object({operation:z.enum(['show','open','move','focus','minimize','restore']),entityId:z.string().max(800),monitor:z.enum(['one','two','three','left','center','right']).nullable()}).strict();
export type Proposal=z.infer<typeof ProposalSchema>;
export type Resolution={plan:Proposal;entity:Entity}|{question:string}|null;
export function informationalRequest(input:string){return /^(how\b|what\b|why\b|explain\b|tell me how\b|can i\b|should i\b|could i\b|ازاي|اشرح|ليه|ينفع)/.test(normalizeUtterance(input));}
export function normalizeUtterance(input:string){return input.normalize('NFKC').trim().toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[ً-ْ]/g,'').replace(/^(?:jarvis|جارفيس)[،,\s]+/i,'').replace(/[.!?؟]+$/,'').trim();}
export function recordEntities(records:Entry[]):Entity[]{return records.filter(r=>['project','task','memory'].includes(r.kind)).slice(0,500).map(r=>({id:r.id,kind:r.kind as Entity['kind'],label:r.title,projectId:r.projectId||undefined,at:r.updatedAt}));}
const apps:Entity[]=[{id:'app:chrome',kind:'application',label:'Chrome'},{id:'app:vscode',kind:'application',label:'VS Code'},{id:'app:jarvis',kind:'application',label:'JARVIS'}];
const monitorWords:Record<string,Proposal['monitor']>={one:'one',two:'two',three:'three','1':'one','2':'two','3':'three','١':'one','٢':'two','٣':'three',الاول:'one',الاولي:'one',واحد:'one',الثاني:'two',التاني:'two',التانيه:'two',التانية:'two',اتنين:'two',الثالث:'three',التالت:'three',التالته:'three',التالتة:'three',تلاته:'three',left:'left',right:'right',center:'center',الشمال:'left',اليمين:'right',الوسط:'center'};

/** Bounded, session-only grounding. Nothing here grants access or persists a permission. */
export class ConversationContext {
  private current?:Entity;
  private previous?:Entity;
  private alternatives:Entity[]=[];
  private pending?:{operation:Proposal['operation'];monitor:Proposal['monitor'];query:string};
  private corrections=new Map<string,string>();
  private touched=0;
  private lastOperation:Proposal['operation']='show';
  private lastQuery='';
  private lastMonitor:Proposal['monitor']=null;
  private nextQuery?:string;
  private clock:()=>number;
  constructor(clock=()=>Date.now()){this.clock=clock;}
  clear(){this.current=undefined;this.previous=undefined;this.alternatives=[];this.pending=undefined;this.corrections.clear();this.touched=0;this.lastQuery='';this.lastOperation='show';this.lastMonitor=null;this.nextQuery=undefined;}
  private expire(){if(this.touched&&this.clock()-this.touched>10*60_000)this.clear();}
  observe(entity:Entity,plan?:Proposal,query?:string){this.expire();if(this.current?.id!==entity.id)this.previous=this.current;this.current=EntitySchema.parse(entity);if(plan){this.lastOperation=plan.operation;this.lastMonitor=plan.monitor;}if(query)this.lastQuery=this.nextQuery??normalizeUtterance(query);this.nextQuery=undefined;this.touched=this.clock();}
  snapshot(){this.expire();return {currentId:this.current?.id??null,previousId:this.previous?.id??null};}
  candidates(entities:Entity[]){this.expire();return [...apps,...entities].filter((e,i,rows)=>rows.findIndex(x=>x.id===e.id)===i).slice(0,520);}
  validate(proposal:unknown,entities:Entity[]):Resolution{
    const parsed=ProposalSchema.safeParse(proposal);if(!parsed.success)return {question:'Which item and action did you mean?'};
    const plan=parsed.data;const entity=this.candidates(entities).find(e=>e.id===plan.entityId);
    if(!entity)return {question:'Which authorized item did you mean?'};
    if(['move','focus','minimize','restore'].includes(plan.operation)&&entity.kind!=='application')return {question:'Which application should I control?'};
    if(plan.operation==='move'&&!plan.monitor)return {question:'Which monitor should I use?'};
    return {plan,entity};
  }
  resolve(input:string,entities:Entity[],now=new Date()):Resolution{
    this.expire();const t=normalizeUtterance(input).replace(/^(?:please\s+|could you\s+|can you\s+|would you\s+|ممكن\s+|لو سمحت\s+)/,'').replace(/\s+(?:please|لو سمحت)$/,'');
    if(informationalRequest(input))return null;
    if(/\b(don't|do not|never)\b|^(بلاش|متفتح|ما تفتح|مش عايز)/.test(t))return {question:'Okay, no action was taken.'};
    if(/^(clear (?:conversation )?context|forget these corrections|امسح سياق المحادثه|انسي التصحيحات)$/.test(t)){this.clear();return {question:'Session context and corrections cleared.'};}
    if(/[;&|`$<>\r\n]/.test(t))return null;
    if(/^(cancel|never mind|الغاء|خلاص سيبك)$/.test(t)){this.pending=undefined;this.alternatives=[];return {question:'Cancelled.'};}
    const all=this.candidates(entities);
    const monitorMatch=t.match(/(?:monitor|display|screen|شاشه|شاشة)\s+(\S+)/);
    const monitor=monitorMatch?monitorWords[monitorMatch[1]]??null:this.pending?.operation==='move'&&!this.pending.monitor?monitorWords[t]??null:null;
    const isCorrection=/^(no\b|not that|i meant|لا\b|مش ده|قصدي)/.test(t);
    const other=/(other one|other|التاني|التانيه|غيره)/.test(t);
    let operation:Proposal['operation']|undefined;
    if(/\b(move|put|place)\b|^(حط|تحط|انقل|تنقل|ودي)/.test(t))operation='move';
    else if(/\bminimi[sz]e\b|^صغر/.test(t))operation='minimize';
    else if(/\brestore\b|^رجع/.test(t))operation='restore';
    else if(/\bfocus\b|bring.*front|^هات.*قدام/.test(t))operation='focus';
    else if(/\bopen\b|^(افتح|تفتح)/.test(t))operation='open';
    else if(/\b(show|display|look at)\b|^(وريني|توريني|اعرض|شوف)/.test(t))operation='show';
    if(!operation&&(isCorrection||this.pending))operation=this.pending?.operation??this.lastOperation;
    if(!operation)return null;
    this.touched=this.clock();
    if(monitorMatch&&!monitor)return {question:'Which connected monitor did you mean?'};
    const chosenMonitor=monitor??this.pending?.monitor??(isCorrection?this.lastMonitor:null);
    const make=(entity:Entity):Resolution=>this.validate({operation,entityId:entity.id,monitor:chosenMonitor},entities);
    let matches:Entity[]=[];
    const app=t.match(/chrome|كروم|vs\s*code|vscode|فيجوال\s*ستوديو\s*كود|yourself|نفسك|jarvis|جارفيس/);
    if(app)matches=apps.filter(e=>e.id===(/chrome|كروم/.test(app[0])?'app:chrome':/code|كود/.test(app[0])?'app:vscode':'app:jarvis'));
    if(!matches.length){matches=entities.filter(e=>{const label=normalizeUtterance(e.label);const basename=label.split(/[\\/]/).pop()!;return label.length>=2&&(t.includes(label)||(e.kind==='file'&&basename.length>=2&&t.includes(basename)));});}
    if(!matches.length&&/yesterday|امبارح/.test(t)){
      const yesterday=new Date(now);yesterday.setDate(yesterday.getDate()-1);
      matches=entities.filter(e=>e.at&&new Date(e.at).toDateString()===yesterday.toDateString());
      if(!matches.length)return {question:'I found no authorized work record from yesterday. Which project or file did you mean?'};
    }
    if(!matches.length&&isCorrection&&other){matches=this.alternatives.filter(e=>e.id!==this.current?.id);if(matches.length===0&&this.previous)matches=[this.previous];}
    const remembered=this.corrections.get(t);
    if(matches.length>1&&remembered&&matches.some(e=>e.id===remembered))matches=matches.filter(e=>e.id===remembered);
    if(!matches.length&&this.pending){
      if(monitor&&this.pending.operation==='move'&&this.alternatives.length===1)matches=[this.alternatives[0]];
      const number=t.match(/^(?:the\s+)?(first|second|third|one|two|three|1|2|3|الاول|التاني|التالت)$/);
      if(number){const index=['first','one','1','الاول'].includes(number[1])?0:['second','two','2','التاني'].includes(number[1])?1:2;if(this.alternatives[index])matches=[this.alternatives[index]];}
      if(!matches.length)matches=this.alternatives.filter(e=>normalizeUtterance(e.label).includes(t));
    }
    if(!matches.length&&/previous one|السابق|اللي قبله/.test(t)&&this.previous)matches=[this.previous];
    if(!matches.length&&/\b(this|that|it)\b|الملف ده|الملف دا|وريني ده|حطه|انقله/.test(t)&&this.current)matches=[this.current];
    if(!matches.length&&remembered)matches=all.filter(e=>e.id===remembered);
    // File references cannot silently resolve to an application or a task.
    if(/\bfile\b|الملف/.test(t))matches=matches.filter(e=>e.kind==='file');
    matches=matches.filter(e=>all.some(x=>x.id===e.id));
    if(matches.length!==1){
      this.alternatives=matches.length?matches.slice(0,6):entities.filter(e=>/\bfile\b|الملف/.test(t)?e.kind==='file':['project','task'].includes(e.kind)).slice(0,6);
      this.pending={operation,monitor:chosenMonitor,query:t};
      return {question:this.alternatives.length?`Which one: ${this.alternatives.slice(0,3).map((e,i)=>`${i+1}. ${e.label.slice(0,70)}`).join(' / ')}?`:'Which authorized item did you mean?'};
    }
    if((isCorrection||this.pending)&& (this.pending?.query||this.lastQuery)){this.corrections.set(this.pending?.query||this.lastQuery,matches[0].id);if(this.corrections.size>24)this.corrections.delete(this.corrections.keys().next().value!);}
    if(this.pending)this.alternatives=this.alternatives.length?this.alternatives:matches;
    const result=make(matches[0]);
    if(result&&'question' in result){this.pending={operation,monitor:chosenMonitor,query:this.pending?.query||t};this.alternatives=[matches[0]];return result;}
    this.nextQuery=this.pending?.query||(isCorrection?this.lastQuery:t);
    this.pending=undefined;
    return result;
  }
}
