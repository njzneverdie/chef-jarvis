# Chef Jarvis 開發歷程與風險改善紀錄

> 最後更新：2026-07-17<br>
> 正式網站：<https://chef-jarvis.pages.dev/><br>
> GitHub：<https://github.com/njzneverdie/chef-jarvis>

## 我為什麼做 Chef Jarvis

一般食譜網站通常從「菜名」開始，給每個人同一份食譜；但真正下廚時，每個人的目標完全不同。健身使用者在意蛋白質與熱量，有人需要避開過敏原，有人只想用冰箱現有的食材，也有人沒有烤箱或氣炸鍋。

Chef Jarvis 的出發點是：**讓食譜適應使用者，而不是要求使用者自己適應食譜。**

我希望它不只是生成一段文字，而是完成一條可以真的拿去煮的旅程：

```text
個人目標與庫存
  → 產生精確食譜
  → 確認安全的食材替換
  → 建立購物清單
  → 買完一鍵入庫
  → Chef Mode 引導烹飪
  → 記錄營養、扣除庫存、留下評分
```

## 我如何建立這個產品

### 架構

```text
Cloudflare Pages
  └─ Vanilla JavaScript Web App / PWA
       └─ Supabase
            ├─ Auth
            ├─ Postgres + Row Level Security
            └─ Edge Functions
                 ├─ chef-meal-plan → Gemini
                 └─ chef-usda-nutrition → USDA FoodData Central
```

瀏覽器只持有 Supabase publishable key。Gemini、USDA 金鑰都放在 Edge Function secrets，兩個函式都要求有效 JWT。使用者資料以 `user_id` 配合 RLS 隔離。

### 營養目標

基礎代謝採用 Mifflin–St Jeor 公式：

$$
\mathrm{BMR} = 10m + 6.25h - 5a + s,
\qquad
s = \begin{cases}
+5 & \text{男性} \\
-161 & \text{女性}
\end{cases}
$$

再乘活動係數並依目標調整：

$$
\mathrm{kcal} = \mathrm{BMR}\times f_{activity}+\Delta_{goal}
$$

蛋白質優先配置，脂肪使用總熱量比例，碳水補足剩餘熱量。程式會拒絕空白、`NaN`、不合理的自訂值，也不允許碳水計算成負數。

## 從 Code Review 到可用產品

### 1. 計時器：從互相打架到真正能在廚房使用

最早的碼表永遠停在 `00:01`。原因不是顯示問題，而是 `app.js` 每秒把所有計時器減一，`chef-mode.js` 又同時把 stopwatch 加一，兩個 tick loop 在修改同一份狀態。

後續修正包括：

- 統一依 `countdown` / `stopwatch` 模式更新。
- 每個料理步驟保存自己的時間，不再所有步驟都使用同一個倒數。
- 不再替「閱讀菜單」或一般敘述建立假計時器。
- 步驟數量不再固定為六步；AI 應該產生幾步就顯示幾步。
- 步驟卡上的計時器可以直接開始，且與右側計時器同步更新。
- 倒數完成會停止、播放聲音、顯示通知並可語音播報。
- 沒有執行中的計時器時停止 interval；運作時只更新既有 DOM 的時間文字。
- localStorage 寫入改成節流，減少低階手機耗電與畫面重建。
- 完成最後一步後立即重新 render，避免殘留按鈕產生幽靈狀態。

### 2. 食材：從「雞肉」變成可採買的精確規格

早期 AI 只會回傳「雞肉、蔬菜、調味料」，這對購物與營養計算沒有實際用途。現在每個 ingredient 都要求：

- 精確名稱，例如「去骨去皮雞胸肉」，而不是「雞肉」。
- `quantity`、`unit`、`preparation` 分開保存。
- 使用克、毫升、茶匙、湯匙、顆、片等可執行單位。
- 每個調味料都獨立列出，不接受「適量調味料」。
- grocery list 保留份量與單位；可換算單位才合併。
- 小於 100 ml 的液體在賣場顯示時反向轉成湯匙／茶匙。
- 一週餐期合併清單時依實際 servings 比例縮放。

### 3. 食材替換：先確認，再建立購物清單

替換功能原本出現在 grocery list 之後，而且只改食材名稱，料理步驟仍可能寫著原本的肉類、溫度或計時器。這對過敏使用者尤其危險。

現在流程改成：

1. 食譜先顯示建議替換。
2. 使用者主動套用。
3. 同步更新 ingredients、grocery items、料理步驟與計時器。
4. 完成替換後才建立購物清單。

Edge Function 會檢查所有提到原食材完整名稱的步驟，要求 `step_updates` 全部覆蓋。若 Gemini 給了不完整替換，系統只移除那一筆不安全替換，不會因一筆替換失敗而丟掉整份正常食譜。前端也會再次驗證，形成雙層防護。

### 4. AI 回傳：從相信模型到把模型當成不可信輸入

這是整個專案最大的觀念轉變。即使要求 JSON，模型仍可能漏欄位、回傳字串型數值、不完整 timer，甚至在數值欄位中回傳 HTML。

目前的防護包含：

- Edge Function 端做 shape validation、數值 coercion、長度與範圍限制。
- 前端所有插入 HTML 的文字使用 escaping。
- timer 驗證失敗時只丟棄該 timer，不讓整份計畫失效。
- substitution 驗證失敗時只丟棄不安全替換。
- prompt 帶明確版本號，回應帶 request ID、模型、耗時與結果 metadata。
- 使用結構化 log，能分辨 AI 成功、fallback、圖片命中與執行時間。
- AI 圖片搜尋與生成流程平行處理，減少可避免的等待。
- 第一模型較短 timeout，失敗後快速切換第二模型。

### 5. 「AI 沒反應」的兩次重要事故

#### Gemini 模型 404

有一個版本的所有生成都落入 fallback。Edge Function log 顯示兩個舊模型都回傳 404。這不是前端按鈕壞掉，而是模型生命週期與新 Google 專案的可用模型不同。修正後改用可用模型，並保留模型 fallback。完整調查保存在 `CLAUDE-FIX-2026-07-16-gemini-404.md`。

這次讓我學到：模型名稱不能當成永遠不變的常數；需要版本、log、timeout 與替代模型，未來也應把模型清單移到環境設定。

#### Supabase CDN 啟動失敗

風險硬化部署後，正式煙霧測試發現頁面停在「正在開啟」。`app.js` 執行時 `window.supabase` 不存在，外部 CDN 在測試環境中被阻擋。

我沒有只加一個延遲掩蓋問題，而是：

- 將鎖定的 `@supabase/supabase-js@2.110.5` 瀏覽器 bundle 自行託管。
- 下載後核對 SHA-384。
- 新增 `boot.js`，確認 Supabase client 存在後才依序載入 App。
- 啟動失敗時顯示中英文錯誤與重新整理按鈕。
- CSP 收斂成 `script-src 'self'`，移除第三方 JavaScript 單點故障。

這個問題是在最後正式站產品測試才被抓到，也證明單元測試不能取代真實部署驗證。

### 6. USDA：從「查第一筆」到可解釋的營養佐證

中文 ingredient 直接查 USDA 英文資料庫幾乎不會命中，所以 AI 現在同時提供 `usda_query` 英文名稱。USDA Edge Function 也不再盲目選搜尋結果第一筆，而是：

- 一次取得多個候選並依 query token coverage 排名。
- 優先 Foundation、SR Legacy、FNDDS。
- 懲罰 fried、lunchmeat、rotisserie、breaded、with sauce 等不符合原食材的結果。
- 回傳實際匹配 description、data type 與 match score。
- 每位使用者有查詢配額，避免一個人刷完 USDA API 額度。

前端把 quantity/unit 換算成克數後計算整餐 USDA 營養，並與 AI 估算比較。熱量差異超過 35%、蛋白質差異超過 40%，或有低信心配對時，會顯示清楚警告，不再製造假精準。

### 7. Pantry、Shopping、Weekly Plan 串成閉環

最早 pantry 只是一個孤立頁面，AI 完全看不到；shopping list 雖然寫得進資料庫，卻沒有頁面能查看。

現在已完成：

- 生成食譜前讀取 pantry 並送入 AI prompt。
- 專用購物清單頁，顯示完整數量與單位。
- 勾選項目、更新已選計數、刪除清單。
- 全部買完後一鍵加入 pantry。
- 同名且單位可換算時合併；不可換算時停止並提示，不再靜默建立重複庫存。
- 完成料理後依食譜用量扣除庫存，並提供 undo。
- 一週七天餐期、已存食譜排程、整週合併購物清單。
- 清單入庫後提供下一步 CTA，讓使用者直接回到烹飪流程。

### 8. 營養與回饋形成每天可使用的循環

完成料理後會寫入 `nutrition_logs`，並明確使用使用者本地日期，避免台灣凌晨被記到 UTC 前一天。首頁顯示今日已攝取／目標的 kcal、蛋白質、碳水與脂肪進度。

由於使用者不可能每餐都透過 Chef Mode 烹飪，也新增「快速記錄」：

- 從已存食譜直接記錄。
- 手動輸入估計營養。
- 自訂實際吃了幾份，不限制在食譜原本份數內。

完成料理後立即顯示評分視窗，不等待營養紀錄與扣庫存網路請求。評分包含 1–5 星與筆記，會在之後的 AI prompt 中以「使用者資料」區塊傳入，讓推薦逐步學習口味。

### 9. Chef Mode 的廚房體驗

- 料理步驟與計時器依食譜動態產生。
- 語音朗讀依中英文設定 `utterance.lang`。
- 語音控制支援「下一步／重複／開始計時」。
- 不認得的廚房背景聲音靜默忽略，不再用 toast 洗版。
- Jarvis 朗讀時暫停 recognition，避免自己觸發自己。
- Screen Wake Lock 防止煮菜時螢幕熄滅。
- 第一次進入顯示一次性免持提示。
- 開始另一道菜前確認，不會無聲覆蓋進行中的料理。
- localStorage 提供離線 fallback，`cooking_sessions` 同步跨裝置進度。
- 查詢最新 active session 使用複合索引 `(user_id, status, updated_at desc)`。

### 10. 中英文、導覽與無障礙

- 右上角可切換繁中／英文，並記住選擇。
- 首頁快速 prompt 會依目前語言填入，不再顯示中文卻送出英文。
- 補齊登入、營養驗證、配額與 Supabase 常見錯誤翻譯。
- 導覽分成「規劃、採買、烹飪與回顧」，降低七個平行分頁的認知負擔。
- 首次週計畫顯示三步驟說明。
- 動態表單 label 與 input 建立程式化關聯。
- disabled 按鈕有明顯視覺差異。
- onboarding 不允許用 Esc 意外跳過；一般 modal 可用 Esc 或背景關閉。

### 11. PWA、效能與供應鏈風險

- 加入 manifest、service worker、iOS apple-touch-icon 與 maskable PNG。
- App 圖示依原始手繪肌肉廚師構圖裁切，並壓縮 1024/512 圖片。
- 大型安裝圖示移出 SW 預快取，避免每次部署下載 1.6 MB。
- 自行託管字型，離線時不依賴 Google Fonts。
- JS/CSS 使用一致版本，透過同步 script 防止 SW、manifest、HTML 版本漂移。
- 非目前畫面不在登入時全部查詢；切換分頁才 lazy render。
- 主要集合查詢加入初始上限，降低資料成長後的載入風險。
- 資料匯出功能可下載 profile、pantry、recipes、shopping、weekly plan、nutrition、feedback 與 cooking sessions JSON。
- 設定 CSP、`X-Frame-Options`、`nosniff`、Referrer Policy 與 Permissions Policy。

## Debug 過程中最容易忽略的問題

### `event.currentTarget` 經過 `await` 會變成 `null`

購物清單刪除、勾選、入庫與手動新增 pantry 曾出現「資料其實寫入，但畫面看起來沒反應」。根因是 async handler 在 `await` 後繼續讀 `event.currentTarget`。事件分派結束後它已被重設為 `null`。

所有這類 handler 現在都在第一個 `await` 之前保存：

```js
const button = event.currentTarget;
```

之後只使用局部變數。這個 bug 讓我再次確認：使用者看到的「沒有反應」不一定是 API 失敗，也可能是成功後的 UI 收尾拋錯。

### 自動行為必須可見且可撤銷

完成料理時自動記錄營養與扣庫存很方便，但如果只用一閃而過的 toast，使用者不會知道系統做了什麼。現在回饋流程會明確說明自動完成項目，庫存扣除也可以復原。

### Fallback 不能掩蓋真正的錯誤

Fallback 讓產品不會完全空白，但也曾讓模型 404 看起來像「AI 只是比較忙」。因此現在 log 會記錄 outcome、model、duration 與 request ID；前端仍可降級，但開發者能分辨 404、429、timeout 與 schema rejection。

## 驗證方式

目前自動測試涵蓋：

- 營養目標與日期。
- ingredient/grocery 單位與合併。
- substitutions 同步與安全檢查。
- timer 模式、每步時間、有效 cooking timer。
- USDA 總營養、match coverage 與差異警告。
- async DOM target 保存。
- quick log submit 時序。
- PWA 資產與 cache 規則。
- lazy rendering、雲端烹飪進度與資料匯出。
- Edge Function quota 與合約。

發布前執行：

```bash
npm test
npm run check
git diff --check
```

目前結果為 **42/42 測試通過**。另外會使用正式帳號完成瀏覽器煙霧測試，檢查首頁、語言、profile、Chef Mode、Edge Function 與 console error。測試產生的食譜、營養與烹飪紀錄會在完成後清除。

## 我學到的事情

1. **AI 功能首先是資料與驗證問題。** Prompt 寫得漂亮，不代表輸出可以直接信任。
2. **安全替換比看起來合理更重要。** ingredients、steps、timers、grocery 必須是同一份狀態。
3. **Fallback 是產品韌性，不是錯誤監控。** 使用者可以繼續，但團隊仍要看見根因。
4. **真實資料會揭露 AI 的假精準。** USDA grounding 必須同時顯示覆蓋率與不確定性。
5. **廚房裡的注意力比畫面空間珍貴。** 大按鈕、語音、wake lock 與一步一畫面比更多資訊重要。
6. **部署後測試不可省。** CDN 啟動事件只有在真實 CSP、SW 與正式網路環境下才出現。
7. **自動化要贏得信任，就必須可見、可解釋、可撤銷。**

## 仍需持續管理的風險

- 在 Supabase Dashboard 開啟 leaked password protection；這不是 repo 程式碼可以代替的設定。
- 將 Gemini 模型清單移到環境變數，並監控模型退役公告。
- 使用量成長後需要監控 AI 成本、fallback rate、USDA quota 與 Edge Function latency。
- 目前 Vanilla JS 全域狀態已接近維護上限；下一階段應導入 Vite + TypeScript 與模組化，而不是繼續增加 override。
- 補上完整 CI、Playwright 端到端測試、資料保留政策與帳號刪除流程。
- 圖片仍受 Wikimedia 搜尋品質影響；若產品擴大，需要建立授權明確的圖片來源或自有圖庫。

## 現在的 Chef Jarvis

Chef Jarvis 已經不再只是「輸入一句話，AI 回一份食譜」。它現在是一個把個人營養目標、精確食材、庫存、採買、引導烹飪、USDA 佐證、每日紀錄與口味學習串在一起的完整 Web App。

這一路最重要的改變不是增加了多少功能，而是我開始用產品角度面對每個失敗：使用者現在看到了什麼、能不能繼續、資料是否可信，以及下一次如何更快找到根因。
