import { test, expect } from '@playwright/test';
import { createEntry } from '../../packages/shared/model';

test('centerpiece globe visibly rotates while respecting motion-saving preferences', async ({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/#dashboard');
  const surface=page.locator('.globe-surface');
  await expect(surface).toHaveCSS('animation-name','globe-revolve');
  await expect(surface).toHaveCSS('animation-duration','48s');
  const before=await surface.evaluate(el=>getComputedStyle(el).transform);
  await expect.poll(()=>surface.evaluate(el=>getComputedStyle(el).transform),{timeout:3000}).not.toBe(before);

  await page.evaluate(()=>document.body.classList.add('low-power'));
  await expect(surface).toHaveCSS('animation-name','none');
  await page.evaluate(()=>document.body.classList.remove('low-power'));
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(surface).toHaveCSS('animation-name','none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(surface).toHaveCSS('animation-name','globe-revolve');
});

test('development tool icons and labels remain legible English text', async ({page})=>{
  await page.goto('/#dashboard');
  const tools=page.locator('[data-overview-panel="development-tools"]');
  await expect(tools).toContainText('Development environment');
  for(const label of ['VS','G','JS','Py','D','VS Code','Git','Node.js','Python','Docker'])
    await expect(tools.getByText(label,{exact:true})).toBeVisible();
});

test('populated overview fits every tested window without page or panel scrolling', async ({ page }) => {
  await page.goto('/#dashboard');
  await expect(page.locator('.overview-canvas')).toBeVisible();
  const dueAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const records = Array.from({ length: 3 }, (_, i) => [
    createEntry('task', { title: `Review a long synthetic project milestone ${i}`, dueAt }),
    createEntry('event', { title: `Synthetic appointment with a long description ${i}`, dueAt, body: 'A longer synthetic calendar description for layout coverage.' }),
    createEntry('project', { title: `Synthetic project with a long name ${i}` }),
  ]).flat();
  await page.evaluate(async records => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('jarvis-ui-development', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('records', 'readwrite'); for (const record of records) tx.objectStore('records').put(record); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  }, records);
  await page.reload();
  for (const [width, height] of [[2560,1440], [1920,1080], [1480,700], [1366,768], [1024,768], [860,640], [768,1024], [390,844], [320,568], [360,320], [568,320]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => {
      const main = document.querySelector('#content')!;
      const viewport = document.querySelector('.overview-viewport')!.getBoundingClientRect();
      const cards = [...document.querySelectorAll('.dashboard-stack > .panel')];
      const fits = cards.length === 8 && cards.every(card => {
        const box = card.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.left >= viewport.left - 1 && box.right <= viewport.right + 1 && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1 && card.scrollHeight <= card.clientHeight + 1 && card.scrollWidth <= card.clientWidth + 1;
      });
      return fits && main.scrollHeight <= main.clientHeight + 1 && main.scrollWidth <= main.clientWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
    }), { message: `all eight overview panels fit ${width}×${height}` }).toBe(true);
    if ([1366,390,568].includes(width)) await page.screenshot({ path: `test-results/overview-${width}x${height}.png` });
  }
});

test('overview panels can be dragged between columns and the arrangement survives reload', async ({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/#dashboard');
  const system=page.locator('[data-overview-panel="system-resources"]');
  const briefing=page.locator('[data-overview-panel="briefing"]');
  await system.locator('.panel-heading').dragTo(briefing);
  await expect.poll(()=>system.evaluate(el=>el.parentElement===document.querySelectorAll('.dashboard-stack')[1])).toBe(true);
  await page.reload();
  await expect.poll(()=>page.locator('[data-overview-panel="system-resources"]').evaluate(el=>el.parentElement===document.querySelectorAll('.dashboard-stack')[1])).toBe(true);
});

test('recent activity is an on-demand local-only panel and its preference survives reload',async({page})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/#dashboard');
  const row=createEntry('activity',{title:'Synthetic local activity fixture',body:'Visible only in this local preview test.'});
  const tasks=[createEntry('task',{title:'Due medium task',priority:'medium',dueAt:new Date(Date.now()-3600000).toISOString()}),createEntry('task',{title:'Due high task',priority:'high',dueAt:new Date(Date.now()-3600000).toISOString()}),createEntry('task',{title:'Future high task',priority:'high',dueAt:new Date(Date.now()+3600000).toISOString()})];
  await page.evaluate(async records=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('jarvis-ui-development',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});await new Promise<void>((resolve,reject)=>{const tx=db.transaction('records','readwrite');for(const record of records)tx.objectStore('records').put(record);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();},[row,...tasks]);
  await page.reload();
  await expect(page.locator('[data-overview-panel="tasks"] .task-row')).toHaveCount(3);
  const shownTasks=await page.locator('[data-overview-panel="tasks"] .task-row').evaluateAll(rows=>rows.map(row=>row.textContent??''));
  expect(shownTasks.findIndex(text=>text.includes('Due high task'))).toBeLessThan(shownTasks.findIndex(text=>text.includes('Due medium task')));
  expect(shownTasks.findIndex(text=>text.includes('Due medium task'))).toBeLessThan(shownTasks.findIndex(text=>text.includes('Future high task')));
  await page.getByLabel('Ask JARVIS').fill('Show high priority tasks');
  await page.getByRole('button',{name:'Send command'}).click();
  const priority=page.locator('[data-overview-panel="priority"]');
  await expect(priority).toBeVisible();
  await expect(priority).toContainText('Due high task');
  const urgent=await priority.locator('.task-row').evaluateAll(rows=>rows.map(row=>row.textContent??''));
  expect(urgent[0]).toContain('Due high task');
  await page.getByLabel('Ask JARVIS').fill('Show me CPU and RAM');
  await page.getByRole('button',{name:'Send command'}).click();
  await page.getByLabel('Ask JARVIS').fill('Put it on the right');
  await page.getByRole('button',{name:'Send command'}).click();
  await page.getByLabel('Ask JARVIS').fill('Show recent activity');
  await page.getByRole('button',{name:'Send command'}).click();
  const activity=page.locator('[data-overview-panel="activity"]');
  await expect(activity).toBeVisible();
  await expect(activity).toContainText('Synthetic local activity fixture');
  await expect.poll(()=>activity.evaluate(el=>el.parentElement===document.querySelectorAll('.dashboard-stack')[0])).toBe(true);
  await expect(page.locator('.overview-canvas .core-column')).toBeVisible();
  for(const [width,height] of [[1920,1080],[1480,700],[1366,768],[1024,768],[768,1024],[390,844],[360,320],[568,320]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
    const layout=await page.evaluate(()=>{const viewport=document.querySelector('.overview-viewport')!.getBoundingClientRect(),cards=[...document.querySelectorAll<HTMLElement>('.dashboard-stack > .panel')].map(card=>{const box=card.getBoundingClientRect();return {id:card.dataset.overviewPanel,rect:{left:Math.round(box.left),right:Math.round(box.right),top:Math.round(box.top),bottom:Math.round(box.bottom)},client:[card.clientWidth,card.clientHeight],scroll:[card.scrollWidth,card.scrollHeight],inViewport:box.left>=viewport.left-1&&box.right<=viewport.right+1&&box.top>=viewport.top-1&&box.bottom<=viewport.bottom+1};});return {cards,viewport:[viewport.width,viewport.height],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]};});
    expect(layout.cards,`all ten cards fit ${width}x${height}: ${JSON.stringify(layout)}`).toHaveLength(10);
    expect(layout.cards.filter(card=>!card.inViewport||card.scroll[0]>card.client[0]+1||card.scroll[1]>card.client[1]+1),`no card clipping at ${width}x${height}: ${JSON.stringify(layout)}`).toEqual([]);
    expect(layout.document[0]).toBeLessThanOrEqual(width+1);expect(layout.document[1]).toBeLessThanOrEqual(height+1);
  }
  await page.reload();
  await expect(page.locator('[data-overview-panel="activity"]')).toBeVisible();
  await expect(page.locator('[data-overview-panel="priority"]')).toBeVisible();
  await page.getByLabel('Ask JARVIS').fill('Hide activity panel from overview');
  await page.getByRole('button',{name:'Send command'}).click();
  await expect(page.locator('[data-overview-panel="activity"]')).toHaveCount(0);
});

test('fullscreen opens the Workshop HUD and exits using Escape or its button', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/#chat');
  const enter = page.getByRole('button', { name: 'Enter overview fullscreen', exact: true });
  expect(await enter.evaluate(button => button.previousElementSibling?.getAttribute('aria-label'))).toBe('Notifications');
  await enter.click();
  await expect(page.locator('.workshop')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exit overview fullscreen', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.screenshot({ path: 'test-results/workshop-fullscreen.png' });
  await page.keyboard.press('Escape');
  await expect(enter).toBeVisible();
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await enter.click();
  await page.getByRole('button', { name: 'Exit overview fullscreen', exact: true }).click();
  await expect(enter).toBeVisible();
  await expect(page.locator('.workshop')).toBeVisible();
});

test('natural overview requests focus, pin, and hide cards while retaining the core', async ({ page }) => {
  await page.goto('/#dashboard');
  const canvas = page.locator('.overview-canvas');
  async function ask(text: string) {
    await page.getByLabel('Ask JARVIS').fill(text);
    await page.getByRole('button', { name: 'Send command' }).click();
  }
  await ask('Show me CPU and RAM');
  await expect(canvas).toHaveAttribute('data-overview-focus', 'system-resources');
  await expect(canvas.locator('[data-overview-panel="system-resources"]')).toHaveCSS('opacity', '1');
  expect(await canvas.locator('[data-overview-panel="system-resources"]').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(await canvas.locator('[data-overview-panel="security"]').evaluate(el => el.getBoundingClientRect().height));
  await ask('Keep this visible');
  await expect(canvas.locator('[data-overview-panel="system-resources"]')).toHaveAttribute('data-overview-panel', 'system-resources');
  await expect(canvas).toHaveAttribute('data-overview-pinned', 'system-resources');
  await expect.poll(() => canvas.locator('[data-overview-panel="system-resources"]').evaluate(el => getComputedStyle(el, '::after').content)).toBe('"PINNED"');
  await ask('Put it on the right');
  await expect(canvas.locator('[data-overview-panel="system-resources"]')).toHaveAttribute('data-overview-panel', 'system-resources');
  await expect.poll(()=>canvas.locator('[data-overview-panel="system-resources"]').evaluate(el => el.parentElement === document.querySelectorAll('.dashboard-stack')[1])).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const viewport = document.querySelector('.overview-viewport')!.getBoundingClientRect();
    return [...document.querySelectorAll('.dashboard-stack > .panel')].length === 8 && [...document.querySelectorAll('.dashboard-stack > .panel')].every(card => { const box = card.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.left >= viewport.left - 1 && box.right <= viewport.right + 1 && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1; });
  })).toBe(true);
  await ask('Hide everything');
  await expect(canvas).toHaveAttribute('data-overview-hidden', 'true');
  await expect(canvas.locator('.core-column')).toBeVisible();
  await expect.poll(() => canvas.locator('.dashboard-stack').evaluateAll(els => els.every(el => getComputedStyle(el).visibility === 'hidden'))).toBe(true);
  await page.getByRole('button', { name: 'Restore overview panels' }).click();
  await expect(canvas).toHaveAttribute('data-overview-hidden', 'false');
  await expect(canvas).toHaveAttribute('data-overview-focus', '');
  await expect.poll(() => canvas.locator('.dashboard-stack').evaluateAll(els => els.every(el => getComputedStyle(el).visibility === 'visible'))).toBe(true);
  await ask('\u0648\u0631\u064a\u0646\u064a \u0627\u0644\u0645\u0639\u0627\u0644\u062c \u0648\u0627\u0644\u0631\u0627\u0645');
  await expect(canvas).toHaveAttribute('data-overview-focus', 'system-resources');
  await ask('\u062d\u0637 \u062f\u0647 \u0639\u0644\u0649 \u0627\u0644\u064a\u0645\u064a\u0646');
  await expect.poll(()=>canvas.locator('[data-overview-panel="system-resources"]').evaluate(el => el.parentElement === document.querySelectorAll('.dashboard-stack')[1])).toBe(true);
});

test('research results panel displays local result text and persists its optional layout',async({page})=>{
 await page.setViewportSize({width:1366,height:768});await page.goto('/#dashboard');
 const row=createEntry('activity',{title:'Web research completed',body:'Verified synthetic research result. https://example.test/source'});
 await page.evaluate(async record=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('jarvis-ui-development',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});await new Promise<void>((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(record);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();},row);
 await page.reload();await page.getByLabel('Ask JARVIS').fill('Show research results in overview');await page.getByRole('button',{name:'Send command'}).click();
 const panel=page.locator('[data-overview-panel="research"]');await expect(panel).toContainText('Verified synthetic research result');await expect(panel).toContainText('Check cited sources');
 for(const request of ['Show recent activity','Show high priority tasks']){await page.getByLabel('Ask JARVIS').fill(request);await page.getByRole('button',{name:'Send command'}).click();}
 for(const [width,height] of [[1920,1080],[1480,700],[390,844],[360,320],[568,320]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
  const layout=await page.evaluate(()=>{const viewport=document.querySelector('.overview-viewport')!.getBoundingClientRect(),cards=[...document.querySelectorAll<HTMLElement>('.dashboard-stack > .panel')].map(card=>{const box=card.getBoundingClientRect();return {id:card.dataset.overviewPanel,bounds:[box.left,box.top,box.right,box.bottom],client:[card.clientWidth,card.clientHeight],scroll:[card.scrollWidth,card.scrollHeight],fit:box.left>=viewport.left-1&&box.right<=viewport.right+1&&box.top>=viewport.top-1&&box.bottom<=viewport.bottom+1&&card.scrollHeight<=card.clientHeight+1&&card.scrollWidth<=card.clientWidth+1};});return {cards,viewport:[viewport.width,viewport.height]};});
  if(layout.cards.length!==11||layout.cards.some(card=>!card.fit))throw new Error(JSON.stringify({width,height,...layout}));
 }
 await page.reload();await expect(page.locator('[data-overview-panel="research"]')).toContainText('Verified synthetic research result');
 await page.getByLabel('Ask JARVIS').fill('Hide research panel from overview');await page.getByRole('button',{name:'Send command'}).click();await expect(panel).toHaveCount(0);
});
