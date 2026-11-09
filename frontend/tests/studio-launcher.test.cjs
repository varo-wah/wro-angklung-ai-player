const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const path = require('node:path');
for (const state of ['online', 'limited', 'offline', 'setup']) {
  test('Studio launcher routes and disables both versions: ' + state, async () => {
    const folder = path.join(__dirname, '../status-site');
    const dom = new JSDOM(fs.readFileSync(path.join(folder, 'index.html'), 'utf8'), {runScripts:'outside-only', url:'https://example.test'});
    try {
      dom.window.ANGKLOBOT_STATUS_CONFIG = {backendOrigin: state === 'setup' ? '' : 'https://mac.test'};
      dom.window.AbortController = AbortController;
      dom.window.fetch = async () => {
        if (state === 'offline') throw new Error('offline');
        return {ok:true,json:async()=>({status:state,services:{website:{available:true}}})};
      };
      dom.window.eval(fs.readFileSync(path.join(folder,'status.js'),'utf8'));
      await new Promise(resolve => setImmediate(resolve));
      for (const [id, route] of [['open-guest','/studio'], ['open-legacy','/control']]) {
        const link = dom.window.document.getElementById(id);
        const enabled = state === 'online' || state === 'limited';
        assert.equal(link.getAttribute('aria-disabled'), String(!enabled));
        assert.equal(link.getAttribute('href'), enabled ? 'https://mac.test' + route : '#');
        const event = new dom.window.MouseEvent('click', {cancelable:true});
        if (!enabled) assert.equal(link.dispatchEvent(event), false);
      }
    } finally {dom.window.close();}
  });
}
