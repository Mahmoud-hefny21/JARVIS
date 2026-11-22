// Safe local install: a new build replaces the working JARVIS only after it proves it starts and stays up.
// 1. smoke-launch the fresh build in an isolated QA profile; 2. install silently over the old version (data kept);
// 3. launch the installed app and check it stays up; 4. on any failure, reinstall the last good installer.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('.build');
const built = path.join(root, 'target/release/jarvis-desktop.exe');
const setup = path.join(root, 'target/release/bundle/nsis/JARVIS_0.1.0_x64-setup.exe');
const lastGood = path.join(root, 'rollback/JARVIS-last-good-setup.exe');
const installed = path.join(process.env.LOCALAPPDATA, 'JARVIS/jarvis-desktop.exe');
const wait = ms => new Promise(r => setTimeout(r, ms));
const stopAll = () => spawnSync('taskkill', ['/IM', 'jarvis-desktop.exe', '/F'], { stdio: 'ignore' });

// Only the throwaway smoke copy has its error output captured; the real app keeps no pipe to this script
// (a closed pipe would make Rust's eprintln! panic after the script exits).
async function staysUp(exe, env, seconds, capture = false) {
  const log = [];
  const child = spawn(exe, [], { env: { ...process.env, ...env }, stdio: capture ? ['ignore', 'ignore', 'pipe'] : 'ignore', detached: !capture });
  child.stderr?.on('data', d => log.push(String(d)));
  let exited = null;
  child.on('exit', code => { exited = code; });
  await wait(seconds * 1000);
  const text = log.join('');
  const ok = exited === null && !/panicked|Failed to setup app/.test(text);
  return { ok, child, text, exited };
}

function install(file) {
  stopAll();
  const r = spawnSync(file, ['/S'], { stdio: 'ignore' });
  return r.status === 0;
}

if (!existsSync(built) || !existsSync(setup)) { console.error('Build first: npm run build:windows'); process.exit(1); }

// 1. Smoke test in an isolated profile (never touches personal data).
const qa = path.join(root, 'qa', randomUUID());
mkdirSync(qa, { recursive: true });
const smoke = await staysUp(built, { JARVIS_ENABLE_TEST_PROFILE: '1', JARVIS_QA_DATA_DIR: qa }, 12, true);
try { smoke.child.kill(); } catch { /* already gone */ }
if (!smoke.ok) { console.error(`Smoke test failed (exit ${smoke.exited}). The working JARVIS was not touched.\n${smoke.text.slice(-1500)}`); process.exit(1); }
console.log('1/3 smoke test passed (isolated profile stayed up)');

// 2. Install over the working version; data folders are kept by the installer.
if (!install(setup)) { console.error('Installer failed; reinstalling last good version'); if (existsSync(lastGood)) install(lastGood); process.exit(1); }
console.log('2/3 installed');

// 3. The installed app must start and stay up with the real profile.
stopAll();
const live = await staysUp(installed, {}, 15);
if (!live.ok) {
  console.error(`Installed JARVIS did not stay up (exit ${live.exited}). Rolling back.\n${live.text.slice(-1500)}`);
  if (existsSync(lastGood) && install(lastGood)) { spawn(installed, [], { detached: true, stdio: 'ignore' }).unref(); console.error('Rolled back to the last good version.'); }
  process.exit(1);
}
live.child.unref();
mkdirSync(path.dirname(lastGood), { recursive: true });
copyFileSync(setup, lastGood);
console.log(`3/3 installed JARVIS is running; saved as last good (${(readFileSync(setup).length / 1048576).toFixed(2)} MB)`);
process.exit(0);
