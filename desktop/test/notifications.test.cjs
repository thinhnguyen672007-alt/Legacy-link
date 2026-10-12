const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createNotifications, toastXML} = require('../notifications.cjs');
test('Windows activation routes once by opaque tag even after timeout; unknown old tags ignored', () => {
  const instances = []; let handler, clicks = 0;
  class Fake extends EventEmitter {
    static isSupported() {return true;}
    static handleActivation(h) {handler = h;}
    constructor(options) {super(); this.options = options; instances.push(this);}
    show() {this.emit('show');} close() {}
  }
  const toast = createNotifications(Fake, {platform:'win32', icon:'icon', iconURL:'file:///icon', failed:()=>assert.fail()});
  toast('test','body',()=>clicks++);
  const n = instances[0]; n.emit('close');
  toast.activateURL(`legacylink-notify://notification/${n.options.id}`);
  handler({type:'click',arguments:`type=click&tag=${n.options.id}`});
  n.emit('click'); assert.equal(clicks,1);
  toast.activateURL('https://evil/notification/' + n.options.id);
  toast.activateURL('legacylink-notify://notification/' + n.options.id + '?device=evil');
  handler({type:'click',arguments:'type=click&tag=unknown'}); assert.equal(clicks,1);
  let generation = 1; const original = generation;
  toast('old session','body',()=>{if(generation === original) clicks++;});
  generation++;
  handler({type:'click',arguments:`tag=${instances[1].options.id}`}); assert.equal(clicks,1);
});
test('toast XML escapes device content and embeds explicit activation tag', () => {
  const xml = toastXML('safe-id','<device & "name">',"value's",'file:///a&b');
  assert.match(xml,/activationType="protocol" launch="legacylink-notify:\/\/notification\/safe-id"/);
  assert.match(xml,/&lt;device &amp; &quot;name&quot;&gt;/);
  assert.match(xml,/value&apos;s/);
  assert.match(xml,/file:\/\/\/a&amp;b/);
});
test('macOS uses native notifications and clicks restore the dashboard exactly once', () => {
  let instance, clicks = 0;
  class MacNotification extends EventEmitter {
    static isSupported() {return true;}
    constructor(options) {super(); this.options = options; instance = this;}
    show() {this.emit('show');} close() {}
  }
  const toast = createNotifications(MacNotification, {platform: 'darwin', icon: 'icon', failed: () => assert.fail()});
  toast('Machine alarm', 'HIGH · OVERHEAT', () => clicks++);
  assert.equal(instance.options.toastXml, undefined);
  instance.emit('click'); instance.emit('click');
  assert.equal(clicks, 1);
});

test('failed native delivery returns false with the OS reason', async () => {
  const reasons = [];
  class Fake extends EventEmitter {
    static isSupported() {return true;}
    show() {this.emit('failed', {}, 'Permission denied');}
    close() {}
  }
  const toast = createNotifications(Fake, {platform: 'darwin', failed: reason => reasons.push(reason)});
  assert.equal(await toast('alarm', 'body', () => {}), false);
  assert.deepEqual(reasons, ['Permission denied']);
});
test('missing native confirmation times out instead of silently succeeding', async () => {
  let closed = false;
  class Fake extends EventEmitter {
    static isSupported() {return true;}
    show() {} close() {closed = true;}
  }
  const reasons = [];
  const toast = createNotifications(Fake, {platform: 'darwin', timeout: 5, failed: reason => reasons.push(reason)});
  assert.equal(await toast('alarm', 'body', () => {}), false);
  assert.ok(closed);
  assert.match(reasons[0], /permissions/);
});
test('unsupported OS and constructor errors return a diagnostic without crashing', async () => {
  for (const supported of [false, true]) {
    class Fake {
      static isSupported() {return supported;}
      constructor() {throw new Error('Native initialization failed');}
    }
    const reasons = [];
    const toast = createNotifications(Fake, {platform: 'darwin', failed: reason => reasons.push(reason)});
    assert.equal(await toast('alarm', 'body', () => {}), false);
    assert.equal(reasons.length, 1);
  }
});
