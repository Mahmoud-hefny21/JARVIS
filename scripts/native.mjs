import {spawn} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
const root=path.resolve('.build');mkdirSync(path.join(root,'tmp'),{recursive:true});
const env={...process.env,CARGO_TARGET_DIR:path.join(root,'target'),TEMP:path.join(root,'tmp'),TMP:path.join(root,'tmp')};
if(existsSync(path.join(root,'rustup'))){env.RUSTUP_HOME=path.join(root,'rustup');env.CARGO_HOME=path.join(root,'cargo');}
env.PATH=path.join(homedir(),'.cargo','bin')+path.delimiter+env.PATH;
const processArgs=process.argv.slice(2);const child=spawn(path.join(homedir(),'.cargo','bin','cargo.exe'),[processArgs[0]??'test','--manifest-path','apps/desktop/src-tauri/Cargo.toml',...processArgs.slice(1)],{env,stdio:'inherit'});
child.on('exit',code=>process.exit(code??1));
