const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.setDefaultTimeout(10000);
    const origin = process.env.STUDIO_TEST_ORIGIN || 'http://127.0.0.1:3011';
    const errors=[], requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>requests.push(r.url()));
    await page.goto(origin+'/');
    const legacy = page.getByRole('link',{name:/^Legacy interface/});
    await legacy.waitFor();
    assert.equal(new URL(page.url()).pathname,'/studio');
    assert(!requests.some(url=>url.includes('/api/robot/session')));
    assert.equal(await page.getByRole('link',{name:'Conduct',exact:true}).count(),0);
    await page.screenshot({path:'outputs/studio-v2-default.png'});
    await legacy.click();
    await page.getByRole('heading',{name:'Operator Workspace',exact:true}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/control');
    await page.getByRole('link',{name:'Studio v2',exact:true}).click();
    await legacy.waitFor();
    assert.equal(new URL(page.url()).pathname,'/studio');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    await legacy.click();
    await page.getByRole('heading',{name:'Operator Workspace',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS: Studio default, no automatic robot polling, legacy switch/return, deferred Conduct and mobile navigation.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
