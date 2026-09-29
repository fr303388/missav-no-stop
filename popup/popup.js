/* =====================================================================
 * popup/popup.js — 設定與狀態面板
 * ===================================================================== */
(() => {
  'use strict';

  const DEFAULTS = globalThis.__KA_DEFAULTS__ || {};
  const $ = (sel) => document.querySelector(sel);
  const statusBox = $('#status');
  const master = $('#enabled');
  const boxes = Array.prototype.slice.call(document.querySelectorAll('.options input[data-key]'));

  let tab = null;
  let pollTimer = null;

  const store = {
    async get() {
      const res = await chrome.storage.local.get({ config: DEFAULTS });
      return Object.assign({}, DEFAULTS, res.config || {});
    },
    async set(cfg) {
      await chrome.storage.local.set({ config: cfg });
    }
  };

  const activeTab = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  };

  const askPage = (msg) => new Promise((resolve) => {
    if (!tab) return resolve(null);
    try {
      chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 }, (res) => {
        void chrome.runtime.lastError;   // 沒有 content script 時會有錯誤，忽略
        resolve(res || null);
      });
    } catch (_) { resolve(null); }
  });

  function renderStatus(st) {
    if (!st) {
      statusBox.innerHTML = '此頁面無法套用（<b>chrome://</b>、網頁商店、PDF 檢視器等內部頁面）。';
      return;
    }
    if (st.installed === false) {
      statusBox.innerHTML = '尚未偵測到影片或腳本未就緒，請按「重新載入此頁」後再試一次。';
      return;
    }
    const parts = [];
    parts.push(`<b>${escapeHtml(st.host || '')}</b>`);
    parts.push(`影片 ${st.total} 個，播放中 <span class="tag">${st.playing}</span>${st.paused ? `，已暫停 ${st.paused}` : ''}`);
    if (st.blockedPauses) parts.push(`已擋下 ${st.blockedPauses} 次暫停呼叫`);
    if (st.mutedFallback) parts.push(`<span class="tag">已靜音以持續播放</span>`);
    if (st.hidden) parts.push('目前分頁在背景中');
    statusBox.innerHTML = parts.join(' · ');
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  async function refresh() {
    const st = await askPage({ type: 'ping' });
    renderStatus(st);
  }

  function bindSwitch(input, key) {
    input.addEventListener('change', async () => {
      const cfg = await store.get();
      cfg[key] = input.checked;
      await store.set(cfg);
      await refresh();
    });
  }

  async function init() {
    const cfg = await store.get();
    master.checked = !!cfg.enabled;
    boxes.forEach((b) => { b.checked = !!cfg[b.dataset.key]; bindSwitch(b, b.dataset.key); });

    master.addEventListener('change', async () => {
      const cur = await store.get();
      cur.enabled = master.checked;
      await store.set(cur);
      await refresh();
    });

    tab = await activeTab();
    await refresh();
    pollTimer = setInterval(refresh, 1000);
  }

  $('#resume').addEventListener('click', async () => {
    $('#resume').disabled = true;
    await askPage({ type: 'cmd', cmd: 'resume' });
    setTimeout(async () => { await refresh(); $('#resume').disabled = false; }, 400);
  });

  $('#reload').addEventListener('click', async () => {
    if (!tab) return;
    await chrome.tabs.reload(tab.id);
    window.close();
  });

  $('#reset').addEventListener('click', async () => {
    await store.set(Object.assign({}, DEFAULTS));
    await init();
  });

  window.addEventListener('unload', () => { if (pollTimer) clearInterval(pollTimer); });

  init();
})();
