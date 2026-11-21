import { test, expect } from '@playwright/test';
test('local task, memory, profile and conversation survive reload without network',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#dashboard');await expect(page.getByRole('heading',{name:'Your personal universe.'})).toBeVisible();
  await page.getByRole('button',{name:'Tasks & Reminders',exact:true}).click();await page.getByRole('button',{name:'Create task',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Review synthetic release');await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('button',{name:'Review synthetic release',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'Review synthetic release',exact:true})).toBeVisible();await page.getByRole('checkbox',{name:'Complete Review synthetic release'}).check();await expect(page.getByRole('checkbox',{name:'Complete Review synthetic release'})).toBeChecked();
  await page.getByRole('button',{name:'Personal Memory',exact:true}).click();await page.getByRole('button',{name:'Remember something'}).click();await page.getByLabel('Title',{exact:true}).fill('Synthetic preference');await page.getByLabel('Details',{exact:true}).fill('Use local-first storage');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('heading',{name:'Synthetic preference'})).toBeVisible();
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Preferred name').fill('Alex');await page.getByLabel('Low-power mode',{exact:true}).check();await page.getByRole('button',{name:'Save preferences'}).click();await expect(page.locator('body')).toHaveClass(/low-power/);await page.reload();await expect(page.getByLabel('Preferred name')).toHaveValue('Alex');await expect(page.getByLabel('Low-power mode',{exact:true})).toBeChecked();await expect(page.locator('body')).toHaveClass(/low-power/);
  await context.setOffline(true);await page.getByLabel('Ask JARVIS').fill('recall synthetic');await page.getByRole('button',{name:'Send command'}).click();await expect(page.locator('#hud-reply .hud-jarvis')).toContainText('Use local-first storage');
  await page.getByLabel('Ask JARVIS').fill('add task Offline synthetic task');await page.getByRole('button',{name:'Send command'}).click();await expect(page.locator('#hud-reply .hud-jarvis')).toContainText('is on your list');await page.getByRole('button',{name:'Tasks & Reminders',exact:true}).click();await expect(page.getByRole('button',{name:'Offline synthetic task',exact:true})).toBeVisible();
  await context.setOffline(false);expect(errors).toEqual([]);
});
test('explicit natural-language self-configuration changes only local safe preferences',async({page})=>{
  await page.goto('/#dashboard');
  await page.getByLabel('Ask JARVIS').fill('Turn on low power mode');await page.getByRole('button',{name:'Send command'}).click();
  await expect(page.locator('body')).toHaveClass(/low-power/);
  await page.getByLabel('Ask JARVIS').fill('Call me Tony');await page.getByRole('button',{name:'Send command'}).click();await expect(page.locator('#hud-reply')).toHaveClass(/done/);
  await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByLabel('Preferred name')).toHaveValue('Tony');
  await expect(page.getByLabel('Low-power mode',{exact:true})).toBeChecked();
  await page.getByLabel('Ask JARVIS').fill('Turn off low power mode');await page.getByRole('button',{name:'Send command'}).click();
  await expect(page.locator('body')).not.toHaveClass(/low-power/);
});
test('every page renders, browser cannot execute PC actions, and narrow layout stays within viewport',async({page})=>{
  await page.goto('/#dashboard');for(const name of ['AI Chat','Projects','Code Assistant','Cybersecurity','Emails','Calendar','Tasks & Reminders','Personal Memory','System Control','Activity History','Settings','Dashboard']){await page.getByRole('button',{name,exact:true}).click();await expect(page.locator('main h1')).toBeVisible();}
  await page.getByRole('button',{name:'System Control',exact:true}).click();await page.getByRole('button',{name:'Open Chrome Allowlisted action'}).click();await expect(page.getByRole('status').filter({hasText:'This feature needs the installed Windows app'})).toBeVisible();
  for(const width of [1440,1024,768,390]){await page.setViewportSize({width,height:1000});await page.goto('/#dashboard');await expect(page.locator('main h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/dashboard-${width}.png`,fullPage:true});}
});
test('untrusted memory remains text and deletion requires confirmation',async({page})=>{
  await page.goto('/#memory');await page.getByRole('button',{name:'Remember something'}).click();await page.getByLabel('Title',{exact:true}).fill('<img src=x onerror=alert(1)>');await page.getByLabel('Details',{exact:true}).fill('<script>window.compromised=true</script>');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.record-card h2')).toHaveText('<img src=x onerror=alert(1)>');expect(await page.evaluate(()=>Boolean((window as any).compromised))).toBe(false);await page.locator('.record-card').getByRole('button',{name:'Delete',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('.record-card')).toHaveCount(1);
});
test('JARVIS opens on the Workshop HUD with live pods and the dashboard one click away',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.workshop')).toBeVisible();
  for(const pod of ['Next','System','Tasks','Comms'])await expect(page.getByRole('region',{name:pod})).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.getByLabel('Ask JARVIS').fill('show me my tasks');await page.getByRole('button',{name:'Send command'}).click();
  await expect(page.locator('.workshop')).toBeVisible();await expect(page.locator('#hud-reply .hud-jarvis')).toContainText('task');
  await page.locator('.ws-menu').click();await expect(page.getByRole('heading',{name:'Your personal universe.'})).toBeVisible();
});
