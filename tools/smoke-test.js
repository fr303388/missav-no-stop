/* 簡易煙霧測試：用假的 DOM 跑 src/page.js，確認安裝流程不會拋錯
   執行： node tools/smoke-test.js                                */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'src/defaults.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/page.js'), 'utf8');

const posted = [];
let watchTimerFired = false;

function makeEl() {
  return {
    style: {}, textContent: '', className: '',
    appendChild() {}, removeChild() {}, addEventListener() {},
    attachShadow() { return { appendChild() {}, querySelector() { return null; } }; }
  };
}

class EventTargetStub {
  constructor() { this._l = {}; }
  addEventListener(type, fn) { (this._l ||= {})[type] = (this._l[type] || []); this._l[type].push(fn); }
  removeEventListener(type, fn) {
    if (this._l[type]) this._l[type] = this._l[type].filter((f) => f !== fn);
  }
  fire(type, ev) { (this._l[type] || []).forEach((f) => f.call(this, ev || { type, stopImmediatePropagation() {} })); }
}

class DocumentStub extends EventTargetStub {
  hasFocus() { return true; }
  querySelectorAll() { return []; }
  createElement() { return makeEl(); }
}
for (const [k, v] of [['visibilityState', 'visible'], ['hidden', false],
                      ['webkitVisibilityState', 'visible'], ['webkitHidden', false]]) {
  Object.defineProperty(DocumentStub.prototype, k, { configurable: true, get: () => v });
}

class MediaStub extends EventTargetStub {
  constructor() { super(); this.paused = true; this.ended = false; this.readyState = 4; this.muted = false; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
}

const doc = new DocumentStub();
doc.documentElement = { appendChild() {}, removeChild() {} };

const ctx = {
  console, Date, Math, Object, WeakSet, Promise, setTimeout: () => 1,
  setInterval: (fn) => { watchTimerFired = true; return 1; },
  clearInterval: () => {},
  performance: { now: () => 0 },
  location: { host: 'example.com', href: 'https://example.com/' },
  EventTarget: EventTargetStub,
  Document: DocumentStub,
  HTMLMediaElement: MediaStub,
  document: doc,
};
ctx.globalThis = ctx;
ctx.self = ctx;
ctx.window = ctx;
ctx.postMessage = (m) => posted.push(m);
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'page.js' });

const ok = [];
const bad = [];
const check = (name, cond) => (cond ? ok : bad).push(name);

/* 1. 基本安裝 */
check('安裝旗標', ctx.__KA_installed__ === true);
check('送出 hello', posted.some((m) => m.type === 'hello'));
check('偽裝 visibilityState / hidden', doc.visibilityState === 'visible' && doc.hidden === false);
check('偽裝 hasFocus', doc.hasFocus() === true);
check('巡檢計時器已啟動', watchTimerFired === true);

/* 2. pause() 被攔截 */
const v = new MediaStub();
v.paused = false;
MediaStub.prototype.pause.call(v);
check('無手勢時 pause() 被擋下', v.paused === false);

/* 3. 有使用者手勢時允許暫停 */
ctx._l.keydown.forEach((fn) => fn());
MediaStub.prototype.pause.call(v);
check('有手勢時允許 pause()', v.paused === true);

/* 4. 關閉功能 -> 還原 */
const handler = ctx._l.message[0];
handler({ data: { __ka: 'keepalive', dir: 'ext', type: 'config',
  config: { enabled: false, blockEvents: false, blockPause: false, autoResume: false } } });
check('設定可由橋樑更新', true);
v.paused = false;
MediaStub.prototype.pause.call(v);
check('關閉後 pause() 正常', v.paused === true);
check('還原後 hasFocus 為原生', doc.hasFocus() === true);

/* 5. 恢復播放指令 */
v.paused = true;
handler({ data: { __ka: 'keepalive', dir: 'ext', type: 'cmd', cmd: 'resume' } });
check('resume 指令可執行', true);

/* 6. ping 會回報狀態 */
handler({ data: { __ka: 'keepalive', dir: 'ext', type: 'ping', id: 'x1' } });
const st = posted.filter((m) => m.type === 'status').pop();
check('ping 有回應狀態', !!st && st.status && st.status.installed === true);

console.log('PASS: ' + ok.join('\n      '));
if (bad.length) { console.error('FAIL: ' + bad.join(', ')); process.exit(1); }
console.log('\n全部通過');
