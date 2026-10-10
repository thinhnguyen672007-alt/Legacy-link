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
    show() {} close() {}
  }
  const toast = createNotifications(Fake, {platform:'win32', icon:'icon', iconURL:'file:///icon', failed:()=>assert.fail()});
  toast('test','body',()=>clicks++);
  const n = instances[0]; n.emit('close');
  handler({type:'click',arguments:`type=click&tag=${n.options.id}`});
  n.emit('click'); assert.equal(clicks,1);
  handler({type:'click',arguments:'type=click&tag=unknown'}); assert.equal(clicks,1);
  let generation = 1; const original = generation;
  toast('old session','body',()=>{if(generation === original) clicks++;});
  generation++;
  handler({type:'click',arguments:`tag=${instances[1].options.id}`}); assert.equal(clicks,1);
});
test('toast XML escapes device content and embeds explicit activation tag', () => {
  const xml = toastXML('safe-id','<device & "name">',"value's",'file:///a&b');
  assert.match(xml,/launch="type=click&amp;tag=safe-id"/);
  assert.match(xml,/&lt;device &amp; &quot;name&quot;&gt;/);
  assert.match(xml,/value&apos;s/);
  assert.match(xml,/file:\/\/\/a&amp;b/);
});
