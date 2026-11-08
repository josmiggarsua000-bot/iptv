import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5186','--strictPort'],{stdio:'pipe'});let browser;
try{
 await new Promise(resolve=>vite.stdout.on('data',data=>{if(data.toString().includes('5186'))resolve()}));
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const [tv,viewport] of [[false,{width:390,height:844}],[false,{width:360,height:800}],[false,{width:844,height:390}],[false,{width:800,height:1280}],[true,{width:960,height:540}],[true,{width:1280,height:720}],[true,{width:1920,height:1080}],[true,{width:640,height:360}]].filter(([,size])=>!process.env.ANDROID_TEST_WIDTH||size.width===Number(process.env.ANDROID_TEST_WIDTH))){
  const page=await browser.newPage({viewport});
  await page.route('https://appassets.androidplatform.net/native/state',route=>route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:'null'}));
  await page.addInitScript(tv=>{window.NexoNative={isTv:()=>!tv,getDisplayMode:()=>localStorage.getItem('testMode')||'',setDisplayMode:value=>{localStorage.setItem('testMode',value);return true},stateChunk:()=> 'ok',request:(id,method,raw)=>{const args=JSON.parse(raw);if(method==='play')window.testPlayback=args;queueMicrotask(()=>window.__nexoReply({id,ok:method!=='fetch',result:method==='stateBegin'?'test-token':null,error:'Prueba sin conexión al proveedor'}));}};},tv);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5186');await page.waitForSelector('#startup-intro',{state:'detached'});
  await page.locator('#display-mode-dialog[open]').waitFor();if(tv){await page.locator('[data-display-mode="phone"]').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>document.activeElement.dataset.displayMode),'tv');await page.keyboard.press('Enter');}else await page.locator('[data-display-mode="phone"]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('testMode')),tv?'tv':'phone');await page.reload();await page.waitForSelector('#startup-intro',{state:'detached'});assert.equal(await page.locator('#display-mode-dialog').evaluate(el=>el.open),false);assert.equal(await page.locator('html').evaluate((el,tv)=>el.classList.contains(tv?'android-tv':'android-phone'),tv),true);
  if(tv){await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'picker-add');await page.keyboard.press('Enter');}else await page.locator('#picker-add').click();
  await page.locator('[data-type="m3u-file"]').click();await page.locator('#account-name').fill(tv?'Cuenta Android TV':'Cuenta de mi celular');await page.locator('#playlist-file').setInputFiles({name:'fixture.m3u',mimeType:'text/plain',buffer:Buffer.from('#EXTM3U\n#EXTINF:-1 group-title="TV",Canal Android\nhttps://example.invalid/live/u/p/1.ts\n#EXTINF:-1 group-title="TV",Canal dos\nhttps://example.invalid/live/u/p/2.ts'+Array.from({length:160},(_,i)=>`\n#EXTINF:-1 group-title="Categoría ${i}",Canal extra ${i}\nhttps://example.invalid/live/u/p/${i+3}.ts`).join('')+'\n#EXTINF:-1 group-title="Cine",Película de prueba\nhttps://example.invalid/movie/u/p/1001.mp4\n#EXTINF:-1 group-title="Series",Serie de prueba S01E01\nhttps://example.invalid/series/u/p/1002.mp4')});await page.locator('#account-submit').click();await page.waitForSelector('#account-dialog',{state:'hidden'});
  assert.equal(await page.locator('.app').isVisible(),true);if(tv){const summary=await page.locator('.account-summary').boundingBox();assert.ok(summary.y+summary.height<=viewport.height+1,JSON.stringify({viewport,summary}));const bounds=await page.locator('.account-portals').boundingBox();assert.ok(bounds.y+bounds.height<=viewport.height+1,JSON.stringify({viewport,bounds}));assert.equal(await page.locator('.account-portals').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4);}await page.screenshot({path:`artifacts/android-${tv?'tv-'+viewport.width:'celular'}-inicio.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({path:`artifacts/android-${tv?'tv-'+viewport.width:'celular'}-inicio.png`,fullPage:true});
  if(tv){await page.locator('[data-open="live"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.dataset.open),'movie');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');}else await page.locator('[data-open="live"]').click();if(!tv){
    for(const section of ['live','movie','series','epg']){
      if(section!=='live'){await page.locator('[data-view="home"]').click();await page.locator(`[data-open="${section}"]`).click();}
      const nav=await page.locator('.sidebar').boundingBox(),main=await page.locator('main').boundingBox();
      assert.ok(nav.height<180,`Phone ${section}: navigation too tall ${nav.height}`);assert.ok(main.y<190,`Phone ${section}: content below screen ${main.y}`);
      assert.ok(main.x>=0&&main.x+main.width<=viewport.width+1,`Phone ${section}: horizontal overflow`);
      await page.screenshot({path:`artifacts/android-phone-${section}.png`,fullPage:true});
    }
    await page.locator('[data-view="home"]').click();await page.locator('[data-open="live"]').click();
  }const play=page.getByRole('button',{name:'Reproducir Canal Android',exact:true});
  if(tv){
   await play.focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Reproducir Canal dos');await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Reproducir Canal Android');
   assert.equal(await page.locator('.favorite').first().evaluate(el=>el.tabIndex),-1);
   assert.notEqual(await play.locator('..').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
   await page.keyboard.down('Enter');await page.waitForTimeout(750);await page.keyboard.up('Enter');await page.waitForFunction(()=>document.querySelector('.favorite')?.getAttribute('aria-pressed')==='true');assert.equal(await page.evaluate(()=>window.testPlayback),undefined);
   await page.keyboard.down('Enter');await page.waitForTimeout(750);await page.keyboard.up('Enter');await page.waitForFunction(()=>document.querySelector('.favorite')?.getAttribute('aria-pressed')==='false');
   await play.focus();await page.keyboard.press('Enter');
  }else await play.click();
  await page.waitForFunction(()=>window.testPlayback?.item?.name==='Canal Android');assert.equal(await page.evaluate(()=>window.testPlayback.queue.length),162);assert.equal(await page.locator('.android-open-player').isVisible(),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Android UI: teléfono vertical/horizontal, tablet, 162 canales y categorías, cuatro secciones visibles, TV, D-pad y favoritos: OK');
}finally{await browser?.close();vite.kill()}
