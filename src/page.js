/* =====================================================================
 * src/page.js — 執行於「頁面主世界 (MAIN world)」，document_start 就注入
 * 負責偽裝可見度、攔截 pause()、背景自動恢復播放
 * ===================================================================== */
(() => {
  'use strict';

  const D = globalThis.__KA_DEFAULTS__ || {};

  const send = (type, data) => {
    try {
      window.postMessage(Object.assign({ __ka: 'keepalive', dir: 'page', type }, data || {}), '*');
    } catch (_) { /* ignore */ }
  };

  /* 已經注入過（例如分頁重新載入 / 擴充功能更新後再次注入）
     舊的監聽器仍然活著，只需要重新握手取得設定即可 */
  if (window.__KA_installed__) {
    const hello = () => send('hello');
    const on2 = globalThis.__KA_on;
    if (on2) on2(document, 'visibilitychange', hello, true);
    hello();
    return;
  }
  window.__KA_installed__ = true;

  const state = Object.assign({}, D);

  /* -------------------- 保存原生方法（繞過所有偽裝） -------------------- */
  const native = {
    visibilityState: Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState'),
    hidden: Object.getOwnPropertyDescriptor(Document.prototype, 'hidden'),
    webkitVisibilityState: Object.getOwnPropertyDescriptor(Document.prototype, 'webkitVisibilityState'),
    webkitHidden: Object.getOwnPropertyDescriptor(Document.prototype, 'webkitHidden'),
    hasFocus: Document.prototype.hasFocus,
    addEventListener: EventTarget.prototype.addEventListener,
    removeEventListener: EventTarget.prototype.removeEventListener,
    pause: HTMLMediaElement.prototype.pause,
    load: HTMLMediaElement.prototype.load
  };
  const on = (target, type, fn, opts) => native.addEventListener.call(target, type, fn, opts);
  globalThis.__KA_on = on;   // 讓重複注入時仍能掛原生監聽器

  const realVisibility = () => {
    try { if (native.visibilityState) return native.visibilityState.get.call(document); } catch (_) {}
    try { if (native.webkitVisibilityState) return native.webkitVisibilityState.get.call(document); } catch (_) {}
    return 'visible';
  };
  const isHidden = () => realVisibility() === 'hidden';

  const medias = () => Array.prototype.slice.call(document.querySelectorAll('video, audio'));

  let blockedPauses = 0;
  let blockedLoads = 0;
  let mutedFallback = false;
  let wasPlaying = new WeakSet();
  let watchTimer = null;

  /* -------------------- 使用者手勢（允許自己按暫停） -------------------- */
  let lastGesture = 0;
  const markGesture = () => {
    lastGesture = Date.now();
    if (state.keepTimerAlive && keepAliveCtx && keepAliveCtx.state === 'suspended') {
      keepAliveCtx.resume().catch(() => {});
    }
  };
  ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click', 'wheel'].forEach((t) => on(window, t, markGesture, true));
  const recentGesture = () => state.allowUserPause && (Date.now() - lastGesture) < 2500;

  /* -------------------- 恢復播放 -------------------- */
  const resume = (el) => {
    if (!el || el.ended) return;
    let p = null;
    try { p = el.play(); } catch (_) { p = null; }
    if (p && typeof p.then === 'function') {
      p.then(() => { mutedFallback = false; })
        .catch(() => {
          /* NotAllowedError：自動播放政策 -> 靜音後再試一次 */
          if (state.muteFallback && !el.muted) {
            try { el.muted = true; mutedFallback = true; } catch (_) {}
            try { const q = el.play(); if (q && q.catch) q.catch(() => {}); } catch (_) {}
          }
        });
    }
  };

  /* -------------------- 攔截 pause() -------------------- */
  HTMLMediaElement.prototype.pause = function () {
    if (state.enabled && state.blockPause) {
      const el = this;
      if (!el.ended && el.readyState > 0 && !recentGesture()) {
        blockedPauses++;
        updateBadge();
        return undefined;               // 吃掉這次暫停
      }
    }
    return native.pause.apply(this, arguments);
  };

  /* -------------------- 攔截 load()（部分網站用來「重置」影片） -------------------- */
  HTMLMediaElement.prototype.load = function () {
    if (state.enabled && state.blockEvents && state.blockLoad) {
      blockedLoads++;
      return undefined;
    }
    return native.load.apply(this, arguments);
  };

  /* -------------------- 攔截可見度 / 失焦事件 -------------------- */
  const shouldBlock = (type, target) => {
    if (!state.enabled || !state.blockEvents) return false;
    switch (type) {
      case 'visibilitychange':
      case 'webkitvisibilitychange':
      case 'freeze':
      case 'pagehide':
        return true;
      case 'blur':
        return target === window || target === document;
      default:
        return false;
    }
  };

  EventTarget.prototype.addEventListener = function (type) {
    if (typeof type === 'string' && shouldBlock(type, this)) return undefined;
    return native.addEventListener.apply(this, arguments);
  };
  EventTarget.prototype.removeEventListener = function (type) {
    if (typeof type === 'string' && shouldBlock(type, this)) return undefined;
    return native.removeEventListener.apply(this, arguments);
  };

  /* 可見度改變時刷新狀態（必須在 netGuard 之前註冊） */
  on(window, 'visibilitychange', () => {
    send('hello');
    tick();
  }, true);

  /* 保險網：直接截斷原生事件，避免網站用 capture 階段掛的監聽器 */
  const netGuard = (e) => {
    if (state.enabled && state.blockEvents) {
      try { e.stopImmediatePropagation(); } catch (_) {}
    }
  };
  on(window, 'visibilitychange', netGuard, true);
  on(window, 'webkitvisibilitychange', netGuard, true);
  on(window, 'blur', netGuard, true);
  on(window, 'pagehide', netGuard, true);
  on(window, 'freeze', netGuard, true);

  /* -------------------- 偽裝 document 屬性 -------------------- */
  const defineFake = (prop, value) => {
    try { Object.defineProperty(document, prop, { configurable: true, get: () => value }); }
    catch (_) { try { delete document[prop]; } catch (__) {} }
  };
  const undefine = (prop, desc) => {
    try { delete document[prop]; } catch (_) {}
    if (desc) { try { Object.defineProperty(document, prop, desc); } catch (_) {} }
  };

  const HANDLER_PROPS = ['onvisibilitychange', 'onwebkitvisibilitychange', 'onblur', 'onpagehide', 'onfreeze'];
  const guardHandlerProps = (fake) => {
    [window, document].forEach((obj) => {
      HANDLER_PROPS.forEach((p) => {
        if (fake) {
          try { Object.defineProperty(obj, p, { configurable: true, get: () => null, set: () => {} }); } catch (_) {}
        } else {
          try { delete obj[p]; } catch (_) {}
        }
      });
    });
  };

  const applyVisibility = () => {
    const fake = state.enabled && state.blockEvents;
    if (fake) {
      defineFake('visibilityState', 'visible');
      defineFake('hidden', false);
      defineFake('webkitVisibilityState', 'visible');
      defineFake('webkitHidden', false);
      document.hasFocus = () => true;
    } else {
      undefine('visibilityState', native.visibilityState);
      undefine('hidden', native.hidden);
      undefine('webkitVisibilityState', native.webkitVisibilityState);
      undefine('webkitHidden', native.webkitHidden);
      document.hasFocus = native.hasFocus;
    }
    guardHandlerProps(fake);
  };

  /* -------------------- 背景計時器保活（可選） -------------------- */
  let keepAliveCtx = null;
  const startKeepAlive = () => {
    if (keepAliveCtx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      keepAliveCtx = new AC();
      const osc = keepAliveCtx.createOscillator();
      const gain = keepAliveCtx.createGain();
      gain.gain.value = 0.0001;           // 幾乎聽不見
      osc.connect(gain);
      gain.connect(keepAliveCtx.destination);
      osc.start();
      if (keepAliveCtx.state === 'suspended') keepAliveCtx.resume().catch(() => {});
    } catch (_) { keepAliveCtx = null; }
  };
  const stopKeepAlive = () => {
    try { if (keepAliveCtx) keepAliveCtx.close(); } catch (_) {}
    keepAliveCtx = null;
  };

  /* -------------------- 頁面內小徽章（可選） -------------------- */
  let badgeHost = null;
  let badgeBtn = null;
  let badgeRetry = 0;
  const BADGE_CSS = `
    :host { all: initial; }
    .badge { position: fixed; right: 14px; bottom: 14px; z-index: 2147483647;
      display: flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 999px;
      background: rgba(15,15,20,.85); color: #7ee787; border: 1px solid rgba(255,255,255,.2);
      font: 500 12px/1.2 system-ui, "Segoe UI", "Microsoft JhengHei", sans-serif;
      cursor: pointer; box-shadow: 0 4px 18px rgba(0,0,0,.4); }
    .badge.off { color: #ff7b72; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; }
  `;
  const mountBadge = () => {
    if (badgeHost) return true;
    const root = document.documentElement || document.body;
    if (!root) return false;
    badgeHost = document.createElement('div');
    const shadow = badgeHost.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = BADGE_CSS;
    badgeBtn = document.createElement('button');
    badgeBtn.className = 'badge';
    badgeBtn.type = 'button';
    shadow.appendChild(style);
    shadow.appendChild(badgeBtn);
    badgeBtn.addEventListener('click', () => send('toggleEnabled'));
    root.appendChild(badgeHost);
    return true;
  };
  const updateBadge = () => {
    const want = !!(state.enabled && state.showBadge);
    if (!want) {
      if (badgeHost && badgeHost.parentNode) badgeHost.parentNode.removeChild(badgeHost);
      badgeHost = null; badgeBtn = null;
      return;
    }
    if (!mountBadge()) {
      if (badgeRetry++ < 20) setTimeout(updateBadge, 500);
      return;
    }
    badgeRetry = 0;
    const list = medias();
    const playing = list.filter((m) => !m.paused && !m.ended).length;
    if (!state.enabled) badgeBtn.className = 'badge off';
    else badgeBtn.className = 'badge';
    const label = !state.enabled ? '已關閉（點擊開啟）'
      : list.length === 0 ? '未偵測到影片'
      : playing > 0 ? `播放中 ${playing}/${list.length}${mutedFallback ? '（已靜音）' : ''}`
      : '已暫停';
    if (badgeBtn.textContent !== label) {
      badgeBtn.textContent = '';
      const dot = document.createElement('span');
      dot.className = 'dot';
      badgeBtn.appendChild(dot);
      badgeBtn.appendChild(document.createTextNode(label));
    }
  };

  /* -------------------- 巡檢：背景自動恢復播放 -------------------- */
  const tick = () => {
    if (!state.enabled || !state.autoResume) return;
    const list = medias();
    if (isHidden()) {
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m.paused && !m.ended) {
          wasPlaying.add(m);
        } else if (m.paused && !m.ended && wasPlaying.has(m)) {
          resume(m);
        }
      }
    } else {
      wasPlaying = new WeakSet();
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m.paused && !m.ended) wasPlaying.add(m);
      }
    }
    updateBadge();
  };

  /* -------------------- 套用 / 還原全部設定 -------------------- */
  const applyAll = () => {
    applyVisibility();
    if (state.enabled) {
      if (!watchTimer) watchTimer = setInterval(tick, 1000);
    } else if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
      wasPlaying = new WeakSet();
    }
    if (state.enabled && state.keepTimerAlive) startKeepAlive();
    else stopKeepAlive();
    updateBadge();
    send('applied', { state: Object.assign({}, state) });
  };

  /* -------------------- 狀態回報 / 指令 -------------------- */
  const status = () => {
    const list = medias();
    return {
      installed: true,
      total: list.length,
      playing: list.filter((m) => !m.paused && !m.ended).length,
      paused: list.filter((m) => m.paused && !m.ended).length,
      muted: list.some((m) => m.muted),
      blockedPauses: blockedPauses,
      blockedLoads: blockedLoads,
      mutedFallback: mutedFallback,
      hidden: isHidden(),
      host: location.host || '(about:blank)',
      state: Object.assign({}, state)
    };
  };

  const runCommand = (cmd) => {
    const list = medias();
    if (cmd === 'resume') list.forEach((m) => { if (!m.ended) resume(m); });
    else if (cmd === 'mute') list.forEach((m) => { m.muted = true; });
    else if (cmd === 'unmute') list.forEach((m) => { m.muted = false; });
    else if (cmd === 'badge') updateBadge();
  };

  on(window, 'message', (e) => {
    const d = e.data;
    if (!d || d.__ka !== 'keepalive' || d.dir !== 'ext') return;
    if (d.type === 'config') {
      Object.assign(state, D, d.config || {});
      applyAll();
    } else if (d.type === 'cmd') {
      runCommand(d.cmd);
    } else if (d.type === 'ping') {
      send('status', { id: d.id, status: status() });
    }
  });

  /* -------------------- 啟動 -------------------- */
  applyAll();
  send('hello');
  [200, 800, 2000].forEach((t) => setTimeout(() => send('hello'), t));
})();
