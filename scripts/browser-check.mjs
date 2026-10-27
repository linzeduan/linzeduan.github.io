import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?(process.env.PLAYWRIGHT_MODULE.match(/^[A-Z]:/i)?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:process.env.PLAYWRIGHT_MODULE):'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const out=process.env.QA_DIR||'qa-output';await mkdir(out,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});const errors=[];page.on('pageerror',err=>errors.push(err.message));await page.goto('http://127.0.0.1:4173/');await page.locator('.life-areas').waitFor();
 assert.equal(await page.locator('.area').count(),3);for(const word of ['富裕人生','近况','灵感','项目'])assert.ok(!(await page.locator('body').innerText()).includes(word));
 await page.screenshot({path:out+'/overview-desktop.png',fullPage:true});await page.locator('[data-habit=move]').click();assert.equal(await page.locator('[data-habit=move]').getAttribute('aria-pressed'),'true');await page.reload();assert.equal(await page.locator('[data-habit=move]').getAttribute('aria-pressed'),'true');
 for(const id of ['health','investment','learning']){
  await page.locator('[data-nav='+id+']').click();await page.locator('.domain-heading').waitFor();await page.locator('.domain-heading [data-add]').click();assert.equal(await page.locator('select[name=type]').inputValue(),id);await page.locator('input[name=title]').fill('测试'+id);await page.locator('textarea[name=body]').fill('<script>安全文本</script>');await page.locator('#record-form button[type=submit]').click();assert.equal(await page.locator('.record-card h3').innerText(),'测试'+id);await page.reload();assert.equal(await page.locator('.record-card h3').innerText(),'测试'+id);
 }
 await page.locator('.reading-entry').click();await page.locator('.principle').first().waitFor();assert.equal(await page.locator('.principle').count(),18);await page.locator('[data-random]').click();assert.equal(await page.locator('.principle.highlight').count(),1);await page.screenshot({path:out+'/beliefs-desktop.png',fullPage:true});await page.locator('[data-system-nav=discipline]').click();await page.locator('[data-copy-principles]').waitFor();assert.equal(await page.locator('.native-chapter').count(),6);assert.equal(await page.locator('iframe').count(),0);
 await page.goto('http://127.0.0.1:4173/#systems/wealth');assert.equal(await page.locator('#ledger-month').count(),0);await page.goto('http://127.0.0.1:4173/#overview');await page.locator('.life-areas').waitFor();await page.locator('#theme-toggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.screenshot({path:out+'/overview-dark.png',fullPage:true});
 await page.locator('#theme-toggle').click();
 for(const width of [390,320,768,1024]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(250);await page.goto('http://127.0.0.1:4173/#overview');await page.locator('.life-areas').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow at '+width);
  if(width===390){assert.ok((await page.locator('.sidebar').boundingBox()).x<0);await page.screenshot({path:out+'/overview-mobile.png',fullPage:true});await page.locator('#menu-toggle').click();assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'true');await page.locator('[data-nav=investment]').click();await page.locator('.domain-heading').waitFor();assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'false');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/investment-mobile.png',fullPage:true});}
 }
 await page.evaluate(()=>{localStorage.setItem('zhongtai.records.v1','broken');});await page.reload();await page.locator('.top-actions [data-add]').click();await page.locator('input[name=title]').fill('不能覆盖');await page.locator('#record-form button[type=submit]').click();assert.ok((await page.locator('#form-error').innerText()).includes('未能保存'));assert.equal(await page.evaluate(()=>localStorage.getItem('zhongtai.records.v1')),'broken');
 assert.deepEqual(errors,[]);console.log('Browser checks passed: all three journals, reload persistence, daily checks, native reading, hidden ledger, dark mode, mobile navigation, 320/390/768/1024 layouts and failed-storage protection.');
}finally{await browser.close();}
