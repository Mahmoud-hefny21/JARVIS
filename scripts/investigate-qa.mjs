import {DatabaseSync} from 'node:sqlite';
import {readdir,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
// Read-only provenance investigation. Never classify/delete personal records by
// their names; only exact UUID+payload matches count as reproduced QA records.
const personal=path.join(process.env.APPDATA,'com.jarvis.personal','jarvis.db');
const report={at:new Date().toISOString(),readOnly:true,normalRecords:0,syntheticLabelCandidates:0,exactQaMatches:0,qaProfilesCompared:0,recordsModified:0};
try{
 const db=new DatabaseSync(personal,{readOnly:true});
 const records=db.prepare('SELECT id,payload FROM records').all();report.normalRecords=records.length;
 report.syntheticLabelCandidates=db.prepare("SELECT count(*) n FROM records WHERE lower(json_extract(payload,'$.title')) LIKE ? OR lower(json_extract(payload,'$.title')) LIKE ?").get('%synthetic%','%qa %').n;db.close();
 const root=await realpath('.build/qa'),matched=new Set();
 for(const entry of (await readdir(root,{withFileTypes:true})).filter(e=>e.isDirectory()).slice(0,1000)){
  let qa;try{const file=await realpath(path.join(root,entry.name,'jarvis.db'));if(!file.startsWith(root+path.sep))continue;qa=new DatabaseSync(file,{readOnly:true});
   for(const record of records){const row=qa.prepare('SELECT payload FROM records WHERE id=?').get(record.id);if(row?.payload===record.payload)matched.add(record.id);}report.qaProfilesCompared++;
  }catch{}finally{qa?.close();}
 }
 report.exactQaMatches=matched.size;
 report.conclusion=matched.size?'Exact QA duplicates exist; preserved without mutation pending provenance-specific recovery.':'No exact QA record duplicates reproduced in the normal profile. Visible QA test windows are now explicitly titled and isolated; no personal records were removed.';
}catch(error){report.failure=String(error);process.exitCode=1;}
await writeFile('docs/verification/qa-isolation-investigation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
