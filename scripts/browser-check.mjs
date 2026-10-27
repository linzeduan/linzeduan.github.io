import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto('http://127.0.0.1:4173/#systems/beliefs');
 await page.locator('.principle').first().waitFor();assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('.principle').count(),18);
 assert.equal(await page.locator('#systems-toggle').getAttribute('aria-expanded'),'true');await page.locator('#systems-toggle').click();assert.equal(await page.locator('#systems-subnav').isVisible(),false);await page.locator('#systems-toggle').click();
 await page.locator('[data-random]').click();assert.equal(await page.locator('.principle.highlight').count(),1);
 await page.locator('[data-system-nav=discipline]').click();await page.locator('[data-copy-principles]').waitFor();assert.equal(await page.locator('.native-chapter').count(),6);
 await page.locator('[data-system-nav=wealth]').click();await page.locator('#ledger-month').waitFor();
 await page.locator('[data-add-account=cash]').first().click();await page.locator('dialog[open] input').fill('测试账户');await page.locator('dialog[open] button[type=submit]').click();
 await page.locator('[data-balance]').fill('1234.56');await page.locator('[data-balance]').press('Tab');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fuli-monthly-assets-v1')).months[JSON.parse(localStorage.getItem('fuli-monthly-assets-v1')).selected].accounts[0].cents===123456);
 await page.reload();await page.locator('[data-balance]').waitFor();assert.equal(await page.locator('[data-balance]').inputValue(),'1234.56');
 await page.locator('[data-new-month]').click();await page.locator('dialog[open] button[type=submit]').click();assert.equal(await page.locator('.ledger-account small').innerText(),'待更新');
 await page.locator('[data-balance]').fill('2000.00');await page.locator('[data-balance]').press('Tab');await page.locator('[data-view=history]').click();await page.locator('.ledger-chart').waitFor();assert.equal(await page.locator('tbody tr').count(),2);
 const legacy={version:1,selected:'2025-01',months:{'2025-01':{accounts:[{id:'legacy',group:'cash',name:'旧备份账户',cents:30050,reviewed:true}],source:true}}};
 await page.locator('[data-file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await page.locator('dialog[open] button[type=submit]').click();await page.locator('[data-view=accounts]').click();assert.equal(await page.locator('[data-balance]').inputValue(),'300.50');
 await page.locator('[data-system-nav=beliefs]').click();await page.locator('.principle').first().waitFor();await page.screenshot({path:process.env.QA_DIR+'/beliefs-desktop.png'});
 await page.locator('#theme-toggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.screenshot({path:process.env.QA_DIR+'/beliefs-dark.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#menu-toggle').click();await page.locator('[data-system-nav=wealth]').click();await page.locator('#ledger-month').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:process.env.QA_DIR+'/wealth-mobile.png'});
 await page.waitForFunction(()=>!document.body.classList.contains('nav-open'));await page.waitForTimeout(250);await page.screenshot({path:process.env.QA_DIR+'/wealth-mobile.png'});
 await page.evaluate(()=>localStorage.setItem('fuli-monthly-assets-v1','broken'));await page.reload();await page.locator('#ledger-month').waitFor();assert.ok((await page.locator('[role=status]').last().innerText()).includes('无法读取'));assert.equal(await page.evaluate(()=>localStorage.getItem('fuli-monthly-assets-v1')),'broken');
 assert.deepEqual(errors,[]);console.log('Browser checks passed: navigation, native reading, random focus, ledger editing/reload/months/history/import, corrupt-storage protection, dark mode and mobile overflow.');
}finally{await browser.close();}
