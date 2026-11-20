import {readdir,stat,readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
const report={at:new Date().toISOString(),scope:'Measured assets and isolated native SQLite benchmark; not an idle-memory or speech-quality claim.',assets:[],nativeDatabase:null};
for(const name of await readdir('dist/desktop/assets')){const file='dist/desktop/assets/'+name;const bytes=await readFile(file);report.assets.push({name,bytes:(await stat(file)).size,gzipBytes:gzipSync(bytes).length});}
const child=spawn(process.execPath,['scripts/native.mjs','test','database_benchmark','--','--ignored','--nocapture'],{stdio:['ignore','pipe','inherit']});let out='';for await(const chunk of child.stdout){out+=chunk;process.stdout.write(chunk);}const code=await new Promise(resolve=>child.on('close',resolve));const match=out.match(/DATABASE_BENCHMARK (\{[^\n]+\})/);if(match)report.nativeDatabase=JSON.parse(match[1]);await writeFile('docs/measurements.json',JSON.stringify(report,null,2));if(code!==0||!match)process.exitCode=1;
