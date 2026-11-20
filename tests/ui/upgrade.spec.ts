import {test,expect} from '@playwright/test';
test('new account and offline speech choices persist without starting services',async({page})=>{
  await page.goto('/#settings');
  await page.getByLabel('Intelligence connection').selectOption('chatgpt');
  await page.getByLabel('Speech engine').selectOption('whisper');
  await page.getByLabel('Ignored folders (one full Windows path per line)').fill('C:\\Private\\Personal\nD:\\Archive');
  await page.getByLabel('One preset per line: Name | app:monitor').fill('Coding Workspace | chrome:one, vscode:two, jarvis:three');
  await page.getByRole('button',{name:'Save preferences'}).click();await expect(page.getByText('Preferences saved.',{exact:true})).toBeVisible();await page.reload();
  await expect(page.getByLabel('Intelligence connection')).toHaveValue('chatgpt');
  await expect(page.getByLabel('Speech engine')).toHaveValue('whisper');
  await expect(page.getByLabel('Ignored folders (one full Windows path per line)')).toHaveValue('C:\\Private\\Personal\nD:\\Archive');
  await expect(page.getByLabel('One preset per line: Name | app:monitor')).toHaveValue('Coding Workspace | chrome:one, vscode:two, jarvis:three');
  await expect(page.getByLabel('Allow sending selected chat context to an online AI provider')).not.toBeChecked();
});
test('all-day calendar metadata survives editing and reload',async({page})=>{
  await page.goto('/#calendar');await page.getByRole('button',{name:'Add appointment'}).click();
  await page.getByLabel('Title',{exact:true}).fill('Synthetic all-day event');
  await page.getByLabel('Appointment time').fill('2026-11-20T00:00');
  await page.getByLabel('All-day event (end date is exclusive)').check();
  await page.getByLabel('End (optional)').fill('2026-11-22T00:00');
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Saved on your device.',{exact:true})).toBeVisible();await page.reload();
  await page.getByRole('button',{name:/Synthetic all-day event/}).click();
  await expect(page.getByLabel('All-day event (end date is exclusive)')).toBeChecked();
  await expect(page.getByLabel('End (optional)')).toHaveValue(/2026-11-22/);
});
