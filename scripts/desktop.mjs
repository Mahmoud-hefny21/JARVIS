import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const bin = path.join(homedir(), '.cargo', 'bin');
if (!existsSync(path.join(bin, 'cargo.exe'))) { console.error('Rust is required. See README.md for the minimal MSVC toolchain setup.'); process.exit(1); }
const cli = path.resolve('node_modules/@tauri-apps/cli/tauri.js');
const buildRoot = path.resolve('.build');
mkdirSync(path.join(buildRoot,'tmp'),{recursive:true});
const child = spawn(process.execPath, [cli, process.argv[2] ?? 'dev', ...process.argv.slice(3)], { cwd: path.resolve('apps/desktop'), stdio: 'inherit', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, ...(existsSync(path.join(buildRoot,'rustup')) ? {RUSTUP_HOME:path.join(buildRoot,'rustup'),CARGO_HOME:path.join(buildRoot,'cargo')}:{}), CARGO_TARGET_DIR:path.join(buildRoot,'target'), TEMP:path.join(buildRoot,'tmp'), TMP:path.join(buildRoot,'tmp') } });
child.on('exit', code => process.exit(code ?? 1));
