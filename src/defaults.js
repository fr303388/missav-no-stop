/* 預設設定：會同時被 content script、page script、service worker、popup 共用 */
globalThis.__KA_DEFAULTS__ = {
  enabled: true,          // 總開關
  blockEvents: true,      // 阻擋 visibilitychange / blur / freeze / pagehide
  blockPause: true,       // 阻擋 video.pause() / audio.pause()
  autoResume: true,       // 隱藏時自動把被停掉的影片恢復播放
  muteFallback: true,     // 自動播放被拒時，靜音後重試
  allowUserPause: true,   // 允許你「自己」按暫停
  blockLoad: false,       // 阻擋 load()（可能影響切換畫質，預設關）
  keepTimerAlive: false,  // 背景計時器保活（極小音量），預設關
  showBadge: false        // 頁面右下角小徽章
};
