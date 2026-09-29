# missav no stop

分頁切到背景、視窗失去焦點、甚至鎖定畫面時，**網頁影片不會被暫停**。
純本地運作的 Chrome 擴充功能（Manifest V3），沒有任何資料上傳。

> 通用工具：任何用「可見度／失焦事件」或 `pause()` 來停播的網站都適用，不限於單一網站。

需要 **Chrome / Edge 111 以上**（用到 `world: "MAIN"` 內容腳本）。

原始碼：<https://github.com/fr303388/missav-no-stop>

---

## 一、安裝（載入未封裝項目）

1. 開啟 `chrome://extensions`（Edge 是 `edge://extensions`）
2. 右上角開啟 **「開發人員模式」**
3. 點 **「載入未封裝項目」**
4. 選擇整個資料夾（若從 GitHub 下載，解壓縮後選該資料夾）：

```
C:\Users\ANGEL\Documents\預設專案\missav-no-stop
```

5. 完成後建議把擴充功能釘選到工具列。之後修改檔案，只要在擴充功能頁面按「重新載入」並重新整理目標頁面即可。

從 GitHub 取得原始碼：

```bash
git clone https://github.com/fr303388/missav-no-stop.git
```

> 這是「未封裝項目」，Chrome 只會在你載入時發出一次提示，之後不會再跳出安裝警告。

---

## 二、使用

直接開啟影片播放，之後切到別的分頁 / 切換視窗，影片就會繼續播。

點工具列圖示可開啟面板：

| 選項 | 說明 |
| --- | --- |
| **總開關** | 一次關閉／開啟所有行為（快捷鍵 `Alt+Shift+P`） |
| 阻擋可見度／失焦事件 | 網站收不到 `visibilitychange`、`blur`、`pagehide`、`freeze`，所以不會知道「你離開了」 |
| 阻擋 `pause()` 呼叫 | 就算網站直接呼叫 `video.pause()` 也會被忽略 |
| 背景時自動恢復播放 | 每秒巡檢一次，被停掉的影片自動 `play()` |
| 播放失敗時靜音重試 | 瀏覽器自動播放政策擋下時，先靜音再重試（畫面會變無聲） |
| 允許我手動暫停 | 你自己按暫停鈕時，2.5 秒內的暫停會正常生效（不會被強制繼續） |
| 阻擋 `load()` | 進階：某些網站用 `load()` 來重置影片；開啟可能影響切換畫質 |
| 背景計時器保活 | 進階：送出極小音量訊號，降低 Chrome 對背景分頁計時器的節流 |
| 顯示頁面內小徽章 | 頁面右下角顯示「播放中 x/y」，點一下可切換開關 |

面板頂端會顯示目前分頁的實況，例如
`example.com · 影片 1 個，播放中 1 · 已擋下 3 次暫停呼叫`。
看到「已擋下 N 次暫停呼叫」就代表確實有發揮作用。

---

## 三、運作原理

| 檔案 | 角色 |
| --- | --- |
| `manifest.json` | MV3 設定；`src/page.js` 以 **MAIN world + document_start** 注入 |
| `src/defaults.js` | 共用預設設定（content script / page script / SW / popup） |
| `src/page.js` | **核心**：在頁面主世界偽裝 `document.visibilityState` / `hidden` / `hasFocus()`，攔截 `addEventListener('visibilitychange'|'blur'…)`、`onvisibilitychange`、`pause()`、`load()`，並在背景自動恢復播放 |
| `src/content.js` | ISOLATED world 橋樑：把面板／快捷鍵的設定與指令傳給頁面，回報狀態 |
| `background.js` | Service worker：安裝初始化、工具列徽章、`Alt+Shift+P` 快捷鍵 |
| `popup/` | 設定面板 UI |
| `tools/smoke-test.js` | `node tools/smoke-test.js`：用假 DOM 驗證核心邏輯 |
| `tools/make-icons.ps1` | 重新產生圖示 |

採用「偽裝 + 攔截」而不是「輪詢重播」，所以即使網站是在 `setTimeout` 或事件迴呼裡暫停，也不會有 1 秒的延遲。

---

## 四、疑難排解

- **還是會停？** 先按 `F5` 重新整理頁面（安裝／更新擴充功能後，舊分頁不會自動套用），再看面板的「已擋下 N 次暫停呼叫」計數有沒有增加。
- **沒有聲音？** 網站把音量設為 0 就不會發聲音，屬於網站本身的行為。
- **切回去時畫面不順？** Chrome 會節流背景分頁的計時器。若網站用 `requestAnimationFrame` 算畫面，開啟「背景計時器保活」通常會改善。
- **想自己暫停卻停不下來？** 開啟「允許我手動暫停」；若網站的暫停是延遲 3 秒才執行，請改用影片原生控制項，或暫時關閉「阻擋 pause() 呼叫」。
- **只想在某個網站生效？** 到 `chrome://extensions` → 這項擴充功能 → **詳細資料** → 「網站存取權」設成「只在點擊時」或指定網站。
- **不想它在所有網站跑？** 同上，權限改成「當你點一下時」。
- **重新產生圖示**：`powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1`
