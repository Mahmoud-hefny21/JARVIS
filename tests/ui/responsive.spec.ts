import {test,expect} from '@playwright/test';

test('all twelve pages fit mixed-DPI logical viewports and keep controls reachable',async({page})=>{
  test.setTimeout(120000);
  const pages=['dashboard','chat','projects','code','security','emails','calendar','tasks','memory','system','history','settings'];
  for(const [width,height] of [[360,320],[640,360],[768,600],[1024,768],[1280,690],[1920,1040]]){
    await page.setViewportSize({width,height});
    for(const id of pages){
      await page.goto('/#'+id);await expect(page.locator('main h1')).toBeVisible();
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      const overflow=await page.locator('#content').evaluate(main=>main.scrollWidth>main.clientWidth+1);
      expect(overflow,`${id} content overflows at ${width}x${height}`).toBe(false);
      for(const selector of ['.topbar','.command-bar']){
        const box=await page.locator(selector).boundingBox();expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
        expect(box!.y+box!.height).toBeLessThanOrEqual(height+1);
      }
      if(width>760){
        const sidebar=await page.locator('.sidebar').boundingBox();expect(sidebar).not.toBeNull();
        expect(sidebar!.x).toBeGreaterThanOrEqual(0);expect(sidebar!.y).toBeGreaterThanOrEqual(0);
        expect(sidebar!.x+sidebar!.width).toBeLessThanOrEqual(width+1);expect(sidebar!.y+sidebar!.height).toBeLessThanOrEqual(height+1);
      }
      if(id==='settings'){
        const save=page.getByRole('button',{name:/Save preferences/});await save.scrollIntoViewIfNeeded();await expect(save).toBeInViewport();
      }
    }
  }
  await page.setViewportSize({width:390,height:320});await page.goto('/#tasks');
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  const nav=page.locator('.sidebar nav');
  expect(await nav.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await nav.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await expect(page.getByRole('button',{name:'Settings',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.locator('main h1')).toHaveText('Make it yours.');
  await expect(page.locator('body')).not.toHaveClass(/nav-open/);
  await page.setViewportSize({width:390,height:600});await page.goto('/#memory');
  await page.getByRole('button',{name:'Remember something'}).click();
  await page.getByLabel('Title',{exact:true}).fill('Long synthetic reference '+ 'x'.repeat(180));
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.locator('#content').evaluate(main=>main.scrollWidth<=main.clientWidth+1)).toBe(true);
  await page.screenshot({path:'test-results/responsive-memory.png'});
});
