import {test,expect} from '@playwright/test';
test('natural requests clarify once and retain corrections across followups offline',async({page,context})=>{
 await page.goto('/#tasks');
 for(const title of ['Alpha review','Beta review']){
  await page.getByRole('button',{name:'Create task',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill(title);await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 }
 await context.setOffline(true);
 async function ask(text:string){await page.getByLabel('Ask JARVIS').fill(text);await page.getByRole('button',{name:'Send command'}).click();}
 await ask('Could you show it please');await expect(page.locator('#hud-reply .hud-jarvis')).toContainText('Which one:');
 await ask('the second');await expect(page.locator('main h1')).toHaveText('One thing at a time.');
 await ask('No, I meant the other one');await expect(page.locator('main h1')).toHaveText('One thing at a time.');
 await page.getByRole('button',{name:'AI Chat',exact:true}).click();await expect(page.locator('.message.assistant').last()).toContainText('Alpha review');
 await ask('show it');await expect(page.locator('main h1')).toHaveText('One thing at a time.');
 await page.getByRole('button',{name:'AI Chat',exact:true}).click();await expect(page.locator('.message.assistant').last()).toContainText('Alpha review');
});
