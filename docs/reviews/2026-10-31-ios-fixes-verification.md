# 2026-10-31 修正與驗證

## 已部署與安裝

- 正式網站：https://chef-jarvis.pages.dev 。本次 Pages deployment：https://2932173b.chef-jarvis.pages.dev 。前端檔案逐一雜湊比對通過。
- Edge：chef-meal-plan `2026-10-31.selection-first.26`；chef-usda-nutrition `2026-10-31.usda-energy.1`；chef-delete-account `2026-07-18.1`。OPTIONS 與本機預期版本一致。
- Xcode Release 實機、模擬器皆 BUILD SUCCEEDED。實機以既有 Personal Team 簽署，已重新安裝並啟動。APNs entitlement 已移除，保留本機計時通知。

## 使用者截圖問題的原因與修正

新份數／時間限制啟用後，舊備援固定兩份且至少 20 分鐘；選一份或 15 分鐘會被新限制攔下。這是整合遺漏，不應要求使用者調鬆條件。

- 模型輸出不符份數／時間時允許有界修復重試。
- 一般點選推薦的備援改為 10 分鐘、即食熟食材、免開火模板，食材和整份營養依所選份數一起縮放；經 shape、數值、限制驗證後回應。
- 明示「備用食譜」而不冒充 AI。風味、庫存偏好可能不同，summary 有揭露。
- 固定食材以英／繁／簡 aliases 過濾過敏原與不喜歡食材；輸出前移除 safety metadata，不污染 USDA query。沒有安全候選時仍拒絕。
- Gemini 全失敗後仍退款 quota；未設定 API key 時不消耗 quota。

## 本次自動檢查

| 檢查 | 結果 |
|---|---|
| Web／共享 domain Node tests | 242 passed |
| 實際 Edge handler stub tests | 8 passed |
| 原生 domain／Expo config tests | 13 passed |
| TypeScript | 通過 |
| Playwright 全套 | 16 passed；含專用帳號唯讀與 mock 回應情境，不能將全部視為真實 AI E2E |
| syntax、PWA 版本、正式部署比對 | 通過 |
| git diff --check | 通過 |
| 獨立唯讀 review | 已修正本輪發現的 P1/P2；最後回報未再發現具體 P1/P2，不代表所有平台驗收完成 |

## 真實服務與原生 UI 檢查

- USDA 兩食材 API 200；雞胸肉 Foundation 熱量 112 kcal/100g，不再漏掉 Atwater energy。
- Chicken and Rice 指定菜名曾失敗；minimal thinking 與標準菜名保留後單次 200。此為單次結果，尚未建立可靠度統計。
- 三個真實點選 API 案例：1份／30分鐘→10分鐘明示備援；1份／15分鐘→15分鐘 AI；4份／15分鐘→15分鐘 AI；皆 200，份數正確。
- 最新原生模擬器：無打字點一鍵推薦，1份／30分鐘→「薑絲牛肉拌飯」、20分鐘、1人份，沒有截圖錯誤。
- 進個人資料：常見過敏、飲食需求、不喜歡食材與設備為 checkbox；未變更或儲存測試帳號的飲食設定。回規劃後推薦仍在。
- 原生 USDA 按鈕實際查詢並顯示整餐計算 550 kcal、P40/C48/F21，沒有先前 transport error。
- 恢復舊測試烹飪、展開步驟佇列、直接跳步、查看完成回饋。略過回饋按完成，畫面顯示成功，料理進度結束，首頁更新 340 kcal、P33/C35/F8。
- 上項是測試流程，不代表實際食用。專用測試帳號新增一筆營養紀錄；未刪除帳號、未改密碼。之前的 QA 庫存／食譜／購物測試資料仍保留。

## 其他本次補齊

- 推薦／選項為帳號隔離的記憶體 state，切頁保留，換帳號清除；source-only 不寫磁碟。
- 不同食譜的 RecipeCard 使用標題與食材 fingerprint，避免新食譜沿用上一份的 USDA 本機結果。
- 完整 USDA 才取代營養記錄值；部分結果保留原估算，缺值顯示未知而非零。
- 週菜單份數點選；完成份數為 0.25–12 步進器；回饋星級點選且可略過，略過時不收心得，避免默默遺失。
- 步驟佇列／跳步、新倒數可重設、碼表可歸零；缺少原始 duration 的舊倒數不猜測重設值，須重新建立。
- 朗讀前中止辨識，避免聽到自身語音；首頁補齊四項巨量營養數字。

## 保留的產品差異與發布驗收

- 庫存採預覽、逐項確認扣除與 undo，不在完成時背景默默扣除。
- 料理完成需雲端寫入成功才結束；失敗保留進度供重試，避免先清空造成記錄遺失。
- 原生與 Web 的料理 timer schema 尚未統一；使用同一客戶端完成一場料理。食譜等一般資料可共用。
- 實機通知／鎖屏／麥克風、iPad、大字／VoiceOver、匯出 share sheet 內容、可丟棄帳號刪除仍是發布驗收，沒有以編譯通過冒充已測。
- 未送 App Store；Apple 付費會員與送審資料依原定後續處理。相機、HealthKit、採買結帳、訂閱是後續能力，沒有加入第一版承諾。
