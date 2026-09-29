/* =====================================================================
 * background.js — service worker：安裝初始化、徽章、快捷鍵
 * ===================================================================== */
importScripts('src/defaults.js');

const DEFAULTS = self.__KA_DEFAULTS__ || {};
const lastStatus = new Map();   // tabId -> status（暫存 60 秒）

const getConfig = async () => {
  const res = await chrome.storage.local.get({ config: DEFAULTS });
  return Object.assign({}, DEFAULTS, res.config || {});
};
const setConfig = async (patch) => {
  const next = Object.assign({}, await getConfig(), patch);
  await chrome.storage.local.set({ config: next });
  return next;
};

async function updateBadge() {
  const cfg = await getConfig();
  if (!cfg.enabled) {
    await chrome.action.setBadgeBackgroundColor({ color: '#6e7681' });
    await chrome.action.setBadgeText({ text: 'OFF' });
    await chrome.action.setTitle({ title: 'missav no stop：已關閉' });
    return;
  }

  await chrome.action.setBadgeText({ text: '' });
  let playing = 0;
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const st = tabs[0] ? lastStatus.get(tabs[0].id) : null;
    if (st) playing = st.playing || 0;
  } catch (_) { /* 查不到就算了 */ }
  await chrome.action.setTitle({
    title: 'missav no stop：開啟中' + (playing ? `（${playing} 個影片播放中）` : '')
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const res = await chrome.storage.local.get({ config: null });
  if (!res.config) await chrome.storage.local.set({ config: Object.assign({}, DEFAULTS) });
  await updateBadge();
});

chrome.runtime.onStartup.addListener(() => { updateBadge(); });

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'ka:status' && sender.tab) {
    lastStatus.set(sender.tab.id, msg.status || {});
    setTimeout(() => {
      if (lastStatus.get(sender.tab.id) === msg.status) lastStatus.delete(sender.tab.id);
    }, 60000);
    updateBadge();
  }
  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-enabled') return;
  const cfg = await getConfig();
  await setConfig({ enabled: !cfg.enabled });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.config) updateBadge();
});
