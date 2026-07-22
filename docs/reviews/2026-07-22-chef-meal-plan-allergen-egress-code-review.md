# Chef Meal Plan 過敏原出口閘門 Code Review

**審查日期：** 2026-07-22  
**審查範圍：** `868447c..8af7c46`，以及新閘門依賴的既有過敏原 matcher、`chef-meal-plan` 全部回傳路徑、測試、發布驗證與目前 Supabase 線上版本。  
**目前結論：** **Request changes；不可把目前版本視為已完成或已安全上線。**

## 1. 摘要

目前架構方向正確：非 `OPTIONS` 的 JSON 回傳都已通過 request-scoped
`safeRespond`，AI/provider 成功與兩條 fallback 都會先執行閘門，再清除額度責任或記錄成功。

但仍有以下未完成事項：

| ID | 嚴重度 | 問題 | 結論 |
| --- | --- | --- | --- |
| CR-01 | P0 發布阻擋 | 線上 Supabase 函式仍是舊程式，但部署驗證錯誤通過 | 必須先修 |
| CR-02 | P1 安全阻擋 | 安全產品／`-free` 例外仍可掩蓋同欄位內真正過敏原 | 必須先修 |
| CR-03 | P1 安全阻擋 | `lactose-free` 被錯當成 milk/dairy allergy 安全 | 必須先修 |
| CR-04 | P1 安全阻擋 | 過敏原家族詞彙缺少常見直接成員與同義詞 | 必須先修 |
| CR-05 | P1 安全阻擋 | 找不到 profile 或 profile 格式異常時仍可能 fail open | 必須先修 |
| CR-06 | P2 可靠性 | malformed plan／ingredient 欄位可繞過純閘門 | 建議合併前修 |
| CR-07 | P2 可用性 | 繁中安全標示被拒絕，單字 `乳` 造成誤判 | 建議合併前修 |
| CR-08 | P2 測試缺口 | 測試沒有真正執行三條 handler 回傳路徑 | 建議合併前修 |
| CR-09 | P2 規格落差 | UI 儲存模型與「所有過敏原家族」測試範圍不一致 | 需產品決策後修 |
| CR-10 | P3 可觀測性 | 出口閘門失敗被記成 identity verification | 建議修 |
| CR-11 | P3 文件 | handoff、spec 與 plan 狀態已過期 | 完成修正時同步更新 |

---

## 2. 已確認正常的部分

- `chef-meal-plan` handler 內沒有直接 `return respond(...)`。
- 只有兩個 `OPTIONS` 分支直接回傳 `new Response(...)`。
- AI/provider 成功路徑會先執行 `safeRespond`，再將 `quotaRequestId` 清空。
- AI/provider 成功路徑與兩條 fallback 都會先通過閘門，再記錄
  `chef_meal_plan_completed`。
- AI 輸出被閘門拒絕時，額度責任仍保留；所有模型失敗後會進入既有退款流程。
- 既有狀態碼與 `Retry-After` header 沒有因 `safeRespond` 遺失。
- 錯誤訊息不會回傳 profile、過敏原值、token 或完整食譜內容。
- `name` 與 `usda_query` 已在純 helper matrix 中分開測試。
- 上一輪指出的 `Peanut-free sauce with roasted peanuts`、
  `No peanut sauce containing peanuts`、`Sesame-free tahini sauce` 已被
  `8af7c46` 修正。

---

## 3. 詳細 Findings

### CR-01 — P0：線上函式仍是舊程式，但部署驗證錯誤通過

**位置：**

- `supabase/functions/chef-meal-plan/index.ts:48`
- `scripts/verify-deployment.mjs:21,55-85`
- `tests/deployment-verification.test.mjs:81-92`

**已確認事實：**

- 本機 `FUNCTION_VERSION` 仍是 `2026-07-22.named-recipe.14`。
- verifier 期待值也仍是 `2026-07-22.named-recipe.14`。
- `npm run verify:deployment` 回傳成功，並顯示線上函式也是 `.14`。
- 但透過 Supabase connector 讀取目前 ACTIVE 的 `chef-meal-plan` 後確認：
  - Supabase deployment version：`39`
  - 更新時間：`2026-07-22T12:55:41.822Z`
  - bundle SHA-256：`99a8e79a99a29656e9a24b4f0241815c2fd31abc8ab2dba52e2e504fa649df2a`
  - **沒有** `mealPlanResponseAllergenGate` import
  - **沒有** request-scoped `safeRespond`
  - shared matcher 也**沒有** `withoutExplicitlyFreePhrases`

因此目前 production 尚未包含本次過敏原出口閘門；現有 verifier 只比較手動版本字串，
而本次安全修改沒有 bump 版本，形成 false positive。

**修改要求：**

1. 在完成下列 P1 修正後，將 `FUNCTION_VERSION` bump 到新的唯一版本。
2. 同步更新 `requiredMealPlanVersion` 與 deployment verification tests。
3. 部署 `chef-meal-plan`，確認 Supabase 產生新的 function deployment version。
4. 再執行 `npm run verify:deployment`。
5. 建議讓 CI 強制每次 Edge Function bundle 變更都必須同步變更版本，或改採內容衍生的 build ID；不能只依靠人工記得 bump。
6. 部署後再透過 Supabase connector 或 authenticated smoke test 確認線上 source／行為真的包含閘門。

Supabase 官方部署流程要求重新 deploy 後測試 live function：
<https://supabase.com/docs/guides/functions/deploy>

**驗收標準：**

- 線上 function source 含 `mealPlanResponseAllergenGate` 與 `safeRespond`。
- 線上 version header 等於新的本機版本，而不是 `.14`。
- `verify:deployment` 不可對舊 `.14` 函式回報成功。
- authenticated live test 的 unsafe plan 不會出現在 response body。

### CR-02 — P1：安全產品例外仍可掩蓋真正過敏原

**位置：**

- `supabase/functions/_shared/named-recipe-integrity.js:104-118`
- `supabase/functions/_shared/named-recipe-integrity.js:233-237`

`isAllowedPlantMilk`、`isGlutenFreeIngredient` 與
`isLabeledDairyFreeProduct` 都以「整個欄位」回傳 boolean。只要欄位任一位置出現
安全產品或安全標示，同欄位後面的真實過敏原就可能全部被豁免。

**本機已重現為 ALLOWED：**

- dairy：`Oat milk blended with whole milk`
- dairy：`Dairy-free yogurt with Greek yogurt`
- dairy：`Non-dairy cheese with cheddar cheese`
- gluten：`Gluten-free seasoning with added gluten`

這些字串不含 parser 禁止的 `and`／`or`，因此不能假設上游 schema validator
一定會擋住。

**修改要求：**

- 將安全標示改成 occurrence-level 處理：只移除精確的安全 phrase／產品 phrase，
  然後重新掃描剩餘文字。
- 不可因同一欄位出現一個 plant milk、dairy-free 或 gluten-free phrase，就豁免
  該欄位內所有 `milk`、`butter`、`yogurt` 或 `gluten`。
- 在 `name` 與 `usda_query`、三種 plan response category 中加入上述矛盾案例。

**驗收標準：**

- 單獨的 `Oat milk`、`Dairy-free yogurt`、`Gluten-free seasoning` 可通過。
- 同一欄位只要另有 `whole milk`、`Greek yogurt`、`added gluten` 就必須拒絕整份 plan。

### CR-03 — P1：`lactose-free` 被錯當成 milk/dairy allergy 安全

**位置：**

- `supabase/functions/_shared/named-recipe-integrity.js:112-118`
- `supabase/functions/_shared/named-recipe-integrity.js:233-237`

目前 `isLabeledDairyFreeProduct` 把 `lactose-free` 與 `dairy-free`、
`milk-free` 視為同一種安全標示。

**本機已重現為 ALLOWED：**

- profile allergy：`dairy`
- ingredient：`Lactose-free whole milk`

無乳糖牛奶仍含 milk proteins，不能對 milk/dairy allergy 視為安全。

**修改要求：**

- matcher 必須知道是哪一個 restriction 啟動 dairy family。
- 只有 restriction 是 lactose intolerance／lactose 時，才可把 lactose-free 當成
  符合該 restriction。
- restriction 是 milk allergy／dairy allergy 時，只接受真正的 dairy-free／milk-free
  產品，且仍必須套用 CR-02 的剩餘文字掃描。

**驗收標準：**

- `lactose` restriction + `Lactose-free milk`：可通過。
- `dairy` 或 `milk allergy` + `Lactose-free milk`：必須拒絕。

### CR-04 — P1：家族詞彙不足，常見直接成員仍會被放行

**位置：**

- `supabase/functions/_shared/named-recipe-integrity.js:130-177`

目前 family vocabulary 不是完整的家族判斷。部分 restriction 名稱存在，但常見的
同義詞或家族直接成員不在 ingredient terms 中。

**本機已重現為 ALLOWED：**

- `soy` → `Roasted soybeans`
- `seafood` → `Salmon fillet`
- `fish` → `Cod fillet`、`Tilapia fillet`
- `Shellfish allergy` → `Crayfish tails`、`Langoustine tails`
- `Nut allergy` → `Groundnut oil`
- `gluten` → `Semolina flour`

其中 `Nut allergy` 與 `Shellfish allergy` 正是目前 UI 實際會存入
`profile.allergies` 的值，因此不是純理論案例。

**修改要求：**

- 為每個受支援 family 建立明確且可審核的 canonical aliases／members。
- 至少補齊上述已重現案例。
- `seafood` 若產品語意是魚類與甲殼／貝類的 umbrella，必須同時啟動 fish 與
  shellfish family；否則 UI／文件必須明確縮小它的定義。
- 對包裝產品無法可靠推論的情況，保留既有「檢查包裝標示」提醒；但直接同義詞
  與明確物種不能依賴提醒取代 server-side gate。

**驗收標準：**

- 每一個支援 family 都有代表性同義詞與常見直接成員測試。
- `Nut allergy + Groundnut oil`、`Shellfish allergy + Crayfish` 必須拒絕。
- family test 必須同時覆蓋 `name` 與 `usda_query`。

### CR-05 — P1：缺少或異常 profile 時 fail open

**位置：**

- `supabase/functions/chef-meal-plan/index.ts:2739-2740`
- `supabase/functions/_shared/named-recipe-integrity.js:291-299`
- `tests/named-recipe-pipeline.test.mjs:427-438`

profile query 使用 `.maybeSingle()`；找不到 row 時，`profileRow || {}` 會把缺少的
profile 轉成空物件並綁定到 `responseProfile`。閘門也會把非 array 的 allergies
轉成空陣列。

**本機已重現為 ALLOWED：**

- `{}` + `Roasted peanuts`
- `{ allergies: null }` + `Roasted peanuts`
- `{ allergies: "peanut" }` + `Roasted peanuts`

目前測試只驗證 `profile === null`，沒有驗證 handler 實際產生的 `{}`。

**修改要求：**

- `profileRow === null` 時回傳 `profile_unavailable` 或 onboarding-required error，
  不得產生 plan。
- 綁定 `responseProfile` 前做 runtime validation。
- `allergies` 必須是 string array；欄位不存在、為 null、非 array、含非字串元素時
  均應 fail closed，除非先經過明確且可驗證的 migration／normalization。
- 新增 missing row、空物件、null、string、含 null element 的測試。

**驗收標準：**

- 只有已成功讀取且通過 runtime schema 的 profile 可用於 plan response。
- `.maybeSingle()` 的 null row 不得被視為「已載入、沒有過敏」的 profile。

### CR-06 — P2：malformed plan／ingredient 欄位可繞過純閘門

**位置：**

- `supabase/functions/_shared/named-recipe-integrity.js:33-50`
- `supabase/functions/_shared/named-recipe-integrity.js:291-303`

純閘門目前會忽略非 array 的 `ingredients`；非字串 name 會被轉成
`[object Object]` 後比對。

**直接 helper 重現：**

- `ingredients: { 0: { name: "peanuts" } }` 會被視為沒有 ingredient text。
- `ingredients: [{ name: { label: "peanuts" } }]` 不會匹配 peanuts。

現行 AI parser 與 static fallback 大多會提供正確 schema，因此目前可達性低於
CR-02～CR-05；但這是「最後一道 fail-closed 防線」，不應依賴每一個未來呼叫者
都先做正確 schema validation。

**修改要求與驗收：**

- body 有非 null plan 時，要求 `plan` 為 object、`ingredients` 為 array。
- 每個 `ingredients[].name` 與存在的 `usda_query` 必須是 string。
- malformed plan 一律丟出非敏感 safety error，不可原樣序列化。

### CR-07 — P2：繁中安全標示與單字 `乳` 誤判

**位置：**

- `supabase/functions/_shared/named-recipe-integrity.js:53-88`
- `supabase/functions/_shared/named-recipe-integrity.js:144-160`
- `supabase/functions/_shared/named-recipe-integrity.js:204-205`

目前 explicit-free phrase removal 只支援 ASCII。繁中／簡中 `無/无 + 過敏原`
仍保留過敏原字串，因此安全產品被拒絕。另外 dairy family 使用單字 `乳` 做 substring
比對，會把非乳製品詞彙誤判成 dairy。

**本機已重現：**

- `花生` + `無花生醬`：BLOCKED，但應允許。
- `gluten`／`麩質` + `無麩質麵包`：BLOCKED，但應允許。
- `dairy` + `乳酸`／`乳酸鈣`：BLOCKED，但通常不是 dairy ingredient。

**修改要求：**

- 支援 occurrence-level 的 `無/无 + canonical allergen term`；移除安全 phrase 後
  仍要掃描剩餘文字，例如 `無花生醬含花生` 必須拒絕。
- 移除 bare `乳` substring，改列明確 dairy compounds，或加入可審核的安全詞處理。
- 加入繁中、簡中 safe 與 contradictory cases。

### CR-08 — P2：測試沒有真正執行三條 handler 回傳路徑

**位置：**

- `tests/named-recipe-pipeline.test.mjs:375-453`
- `tests/named-recipe-pipeline.test.mjs:659-724`

`planResponseCases` 的三個 factory 只改變 gate 不會讀取的 metadata；它們沒有執行
真正的 AI/provider、unconfigured fallback 或 models-failed fallback。handler 測試則是
regex/source slicing，不會驗證實際的 profile binding、quota refund、log ordering 或
Response body。

目前 wiring 本身正確，但這組測試仍可能在下列未來回歸中錯誤通過：

- 使用別名或間接 serializer 繞過 `safeRespond`。
- `responseProfile` 在錯誤時機綁定。
- gate 失敗後未退款或仍記錄 completion。
- 某條 handler 分支實際回傳 unsafe body，但 source regex 仍找到其他 safeRespond。

**修改要求：**

- 將 handler orchestration 抽成可注入 auth/profile/provider/model/quota/log dependencies
  的可測函式，或用 Supabase local Edge Runtime 建立整合測試。
- 對三條 plan 路徑逐一執行並斷言：
  1. unsafe ingredient 不會出現在 response；
  2. unsafe metered output 會退款；
  3. gate rejection 不會記錄 completion；
  4. safe output 保留原 status、headers 與 response shape。
- source-contract test 可保留作防呆，但不能是唯一 handler wiring 證據。

### CR-09 — P2：UI 儲存模型與測試宣稱的 family 範圍不一致

**位置：**

- `public/app.js:1000-1002`
- `public/app.js:1038-1056`
- `supabase/functions/_shared/named-recipe-integrity.js:130-177`

目前 onboarding 只提供兩個會存入 `allergies` 的值：`Nut allergy` 與
`Shellfish allergy`。`Lactose intolerant` 與 `Gluten-free` 被存入
`dietary_preferences`；egg、soy、fish、peanut 等 family 無法由 UI 保存。

另一方面，egress gate 依批准規格只讀 `profile.allergies`，而測試卻以十個 family
描述「every saved allergen family」。這會造成兩種落差：

1. 使用者無法在 UI 記錄大部分 matcher 宣稱支援的 allergy family。
2. Gluten-free／lactose intolerance 不在最後 egress gate 內，只依賴較早的 validator
   與 fallback 選擇邏輯。

**需要產品決策：**

- 若目標是「所有醫療安全限制都要有最後出口保護」，建立明確的
  `medical_restrictions`／safety restrictions，或將指定的 dietary safety values 納入
  egress gate。
- 若目標只限 `allergies`，UI 至少應提供完整 allergy choices 或自訂過敏原輸入，並
  將文件與測試名稱改成真實範圍。
- 不建議直接把所有 dietary preferences 都丟進 allergy gate；vegan／halal 等需求
  的錯誤處理與健康風險等級不同，應明確分類。

### CR-10 — P3：出口失敗被誤記為 identity verification

**位置：**

- `supabase/functions/chef-meal-plan/index.ts:3084-3110`
- `supabase/functions/chef-meal-plan/index.ts:3131-3133`
- `supabase/functions/_shared/named-recipe-integrity.js:464-476`

`failureStage` 在 identity verifier 前被設為 `identity_verification`，進入
`safeRespond` 前沒有更新。因此出口閘門拒絕 named plan 時，最後可能顯示：

- `failure_reason: restriction_conflict`
- `failure_stage: identity_verification`

**修改要求：**

- 在 `safeRespond` 前設定 `failureStage = "egress_validation"`，並將它加入 stage
  priority；或建立同等明確的 final-response-validation stage。
- 可增加不含 profile／ingredient 原文的 aggregate safety rejection log。

### CR-11 — P3：文件狀態過期

**位置：**

- `docs/handoffs/2026-07-22-chef-meal-plan-allergen-egress-gate.md:13-49`
- `docs/superpowers/specs/2026-07-22-chef-meal-plan-allergen-egress-gate-design.md:4`
- `docs/superpowers/plans/2026-07-22-chef-meal-plan-allergen-egress-gate.md`

**問題：**

- handoff 沒有列出 `8af7c46`，測試總數仍是 188，而目前是 189。
- handoff 說沒有 Deno type-check，但本次審查已可透過 `npx -y deno check` 執行。
- spec status 仍寫 `pending written-spec review`，與已核准狀態衝突。
- implementation plan 的 checkbox 全部未勾選，但 handoff 又說任務完成。
- handoff 的 production 狀態只寫「尚未 deploy」，沒有記錄 verifier 對舊版 false
  positive 的重要風險。

**修改要求：**

- 等 CR-01～CR-10 完成後一次更新 handoff、spec status、plan checkbox、commit list、
  測試總數、Deno check 與 live deployment evidence。

---

## 4. 建議修正順序

1. 先修 CR-02、CR-03、CR-04，消除已重現的 allergen false negatives。
2. 修 CR-05、CR-06，讓 profile 與 plan schema 真正 fail closed。
3. 補 CR-07 的繁中／簡中安全標示與 false-positive cases。
4. 依 CR-08 加上真 handler／Edge Runtime 回傳路徑測試。
5. 對 CR-09 做產品資料模型決策並補 UI／後端／測試。
6. 修 CR-10，讓安全 rejection 可觀測且不誤分類。
7. 執行完整本機 gates，更新 CR-11 文件。
8. 最後處理 CR-01：bump version、部署 Supabase Edge Function、執行 live verification。

不要在 CR-02～CR-06 尚未完成時直接部署目前 HEAD；那只會把仍可重現的安全旁路
推到 production。

---

## 5. 修正後必須通過的驗收清單

- [ ] 所有已列出的 ALLOWED 危險案例改為 BLOCKED。
- [ ] 單獨、明確的安全產品仍能通過，不以全面拒絕取代正確判斷。
- [ ] 繁中／簡中 safe label 與 contradictory label 都有測試。
- [ ] missing／malformed profile 與 malformed plan 全部 fail closed。
- [ ] 三條真實 handler plan 路徑都有 execution-level tests。
- [ ] unsafe metered plan 會退款，且不會記錄 completion。
- [ ] `failure_stage` 能正確指出 egress validation。
- [ ] `npm test`、`npm run check`、Deno check、`git diff --check` 全部通過。
- [ ] `FUNCTION_VERSION` 與 verifier expectation 已 bump。
- [ ] Supabase ACTIVE function source 含最新 gate 與 matcher。
- [ ] live deployment verification 不再對舊 `.14` bundle 回報成功。
- [ ] handoff、spec 與 plan 狀態已同步。

---

## 6. 本次審查證據

本次審查沒有修改產品程式碼，只新增本文件。審查期間取得以下證據：

- 本機 direct probes 重現 CR-02～CR-07。
- `npm test`：189 tests，189 pass，0 fail。
- `npm run check`：通過。
- `npx -y deno check supabase/functions/chef-meal-plan/index.ts`：通過。
- `git diff --check`：通過。
- `npm run verify:deployment`：exit 0，但被 CR-01 證明是 false positive。
- Supabase connector：線上 deployment 39 為 ACTIVE，但不含本次 egress gate。

## 7. 最終 Verdict

**Ready to merge：No**  
**Ready to deploy：No**

回傳路由與 quota ordering 已完成，但 matcher 仍有實際可重現的 allergen false
negatives，profile schema 尚未完全 fail closed，handler 測試仍停留在 helper／source
contract 層級；而 production 目前根本尚未包含這次安全修正，現有部署 verifier 又無法
辨識。完成 CR-01～CR-08 前，不應宣稱「過敏原家族絕不出現在 ingredients」。
