# Fix: Gemini 模型 404 導致所有生成落入 fallback（2026-07-16）

> 本文件由 Claude（Claude Code）撰寫，記錄一次 production hotfix 的完整內容，
> 供後續接手的 agent（Codex）或開發者同步狀態。

## 症狀

使用者在正式站（chef-jarvis.pages.dev）生成餐點時，一律看到
「Gemini 暫時忙碌，Jarvis 已準備一份份量完整的備用食譜」——
即每一次生成都觸發 `fallbackPlan`，AI 生成從未成功。

## 根本原因

Supabase Edge Function `chef-meal-plan` 的 log（Dashboard → Edge Functions →
chef-meal-plan → Logs，2026-07-16 19:17）顯示：

```
WARNING  Gemini request failed gemini-2.5-flash-lite 404
WARNING  Gemini request failed gemini-2.5-flash      404
```

兩個模型都回 **HTTP 404（模型不存在）**，因此重試迴圈耗盡後回傳 fallback。

對照 Google 官方文件：

- `gemini-2.5-flash` 與 `gemini-2.5-flash-lite` 已列入退役清單
  （最早關閉日 2026-10-16），官方指定替代模型分別為
  `gemini-3.5-flash` 與 `gemini-3.1-flash-lite`。
  （來源：https://ai.google.dev/gemini-api/docs/deprecations）
- 本專案的 GEMINI_API_KEY 屬於 2026-07 新建立的 Google 專案；Google 慣例會
  對「新專案」直接封鎖已宣告退役的模型，所以呼叫 2.5 系列直接得到 404，
  不需等到正式關閉日。

## 修改內容

**唯一改動：`supabase/functions/chef-meal-plan/index.ts` 第 1683 行**

```diff
-    for (const model of ["gemini-2.5-flash-lite", "gemini-2.5-flash"]) {
+    for (const model of ["gemini-3.1-flash-lite", "gemini-3.5-flash"]) {
```

順序維持「便宜快速的先試、失敗再升級」的原設計：
`gemini-3.1-flash-lite`（取代 2.5-flash-lite）→ `gemini-3.5-flash`（取代 2.5-flash）。

沒有改動任何其他程式碼、prompt、驗證邏輯或前端。

## 部署

- 已透過 Supabase Dashboard 的 Edge Function 編輯器將同樣的改動部署到
  production（project `mylcykwmwlnjlclodmuo`，帳號 kefanz76@gmail.com）。
- 本 repo 內的原始碼已同步修改（見上方 diff），**尚未 commit**，
  請 Codex 依慣例走 commit / PR 流程把這個改動收進版本控制，
  以免下次從 repo 重新部署時把舊模型名蓋回去。

## 驗證方式

登入正式站生成一次餐點：

- 成功：畫面出現完整 AI 食譜（不再有「Gemini 暫時忙碌」的 fallback 提示），
  且 Edge Function log 中不再出現 `Gemini request failed ... 404`。
- 若仍失敗：檢查 log 中新的錯誤碼（429 = 額度、400 = 請求格式）。

## 後續建議（非本次改動）

1. **把模型清單改成環境變數**（例如 `GEMINI_MODELS`，逗號分隔），
   之後模型再退役時只需改 Secrets、不用改程式碼重新部署。
2. 2026-10-16 前留意 Google 的下一輪退役公告。
3. fallback 訊息可依失敗原因區分（404/429/timeout），
   讓使用者與開發者更快分辨問題（已在先前 code review 中提過）。
