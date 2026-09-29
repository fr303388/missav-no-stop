/* =====================================================================
 * src/content.js — 執行於 ISOLATED world，作為 popup / service worker
 * 與頁面主世界之間的橋樑（傳遞設定 + 指令 + 狀態）
 * ===================================================================== */
(() => {
  'use strict';

  const D = globalThis.__KA_DEFAULTS__ || {};
  if (window.__KA_bridge__) return;
  window.__KA_bridge__ = true;

  let config = Object.assign({}, D);
  const waiters = new Map();

  const toPage = (type, data) => {
    try { window.postMessage(Object.assign({ __ka: 'keepalive', dir: 'ext', type }, data || {}), '*'); } catch (_) {}
  };
  const push = () => toPage('config', { config: Object.assign({}, config) });

  /* 先用預設值握手，再讀取真實設定補一次 */
  push();
  try {
    chrome.storage.local.get({ config: D }, (res) => {
      config = Object.assign({}, D, (res && res.config) || {});
      push();
    });
  } catch (_) {}

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.config) {
        config = Object.assign({}, D, changes.config.newValue || {});
        push();
      }
    });
  } catch (_) {}

  /* 頁面主世界 -> 這裡 */
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.__ka !== 'keepalive' || d.dir !== 'page') return;

    if (d.type === 'hello') {
      push();
    } else if (d.type === 'status') {
      const w = waiters.get(d.id);
      if (w) { waiters.delete(d.id); try { w(d.status || { installed: false }); } catch (_) {} }
      try { chrome.runtime.sendMessage({ type: 'ka:status', status: d.status }).catch(() => {}); } catch (_) {}
    } else if (d.type === 'toggleEnabled') {
      config.enabled = !config.enabled;
      try { chrome.storage.local.set({ config: config }); } catch (_) {}
      push();
    }
  });

  /* popup / service worker -> 頁面主世界 */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;

    if (msg.type === 'ping') {
      const id = Math.random().toString(36).slice(2);
      waiters.set(id, sendResponse);
      toPage('ping', { id: id });
      setTimeout(() => {
        if (waiters.has(id)) { waiters.delete(id); sendResponse({ installed: false }); }
      }, 1500);
      return true;   // 保持非同步回應
    }

    if (msg.type === 'cmd') {
      toPage('cmd', { cmd: msg.cmd });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'getConfig') {
      sendResponse(config);
      return true;
    }

    return false;
  });
})();
