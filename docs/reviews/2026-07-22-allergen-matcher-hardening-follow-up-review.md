# Chef Meal Plan 過敏原安全修正 Follow-up Code Review

**審查日期：** 2026-07-22  
**審查基準：** `dbdad0f..1062088`  
**受審 commit：** `1062088 fix: harden allergen matcher and egress schemas`  
**審查方式：** 規格逐項比對、完整測試、額外直接 probe；本文件完成後不再修改產品程式。  
**結論：** **Request changes；目前不可合併或部署。**

## 1. 本輪已完成的改善

`1062088` 已修正上一輪的一部分問題：

- 安全標示改為移除片段後重新掃描，不再直接豁免整個 ingredient 欄位。
- `lactose-free` 已與 milk／dairy allergy 分流。
- 補上 `soybean`、`salmon`、`cod`、`crayfish`、`langoustine`、
  `groundnut`、`semolina` 等已重現的 family vocabulary。
- 新增繁中／簡中 `無／无／不含` 基本安全標示處理。
- 移除 bare `乳` 的 dairy substring 判斷，`乳酸`、`乳酸鈣` 不再誤判。
- final gate 已對 profile 與 ingredient schema 做較嚴格驗證。
- final gate 已納入 gluten／lactose 類醫療性 dietary preferences，並排除
  vegan／vegetarian／halal 等非本次出口閘門範圍的偏好。
- 本輪 focused tests 23/23、named-recipe tests 72/72、完整測試 211/211 通過。

測試全綠仍不足以證明安全，因為獨立審查的額外 probe 找到以下尚未被測試涵蓋的
實際繞過案例。

## 2. 阻擋 Findings

### FR-01 — Critical：安全產品 regex 可跨未列舉連接詞或標點吞掉真實過敏原

**位置：**

- `supabase/functions/_shared/named-recipe-integrity.js:126-139`

`withoutLabeledDairyFreeProducts` 允許安全標籤後再接 0～2 個英文單字，只排除一小組
連接詞。這是有限黑名單；新連接詞、一般動詞或被 normalization 移除的標點仍可能
被當成安全產品名稱的一部分，導致後方真正的 allergen 一起被刪除。

**已直接重現為錯誤放行：**

- `Dairy-free sauce including milk`
- `Dairy-free spread has butter`
- `Dairy-free recipe includes milk`
- `Dairy-free sauce, milk`
- `Non-dairy sauce, milk`

**風險：** final egress gate 可能序列化含 milk／butter 的餐點給 dairy allergy 使用者。

**建議修法：**

- 不要用「最多幾個單字 + 連接詞黑名單」推測安全產品片段。
- 僅清除可證明的完整安全產品 phrase，例如明確列舉的
  `dairy-free yogurt`、`non-dairy cheese`；無法確定 phrase 邊界時 fail closed。
- normalization 不應先消滅可用來界定片段的標點，或需保留 token boundary metadata。
- 對上列每個案例分別測試 `name` 與 `usda_query`。

**驗收標準：** 單獨、完整的安全產品可通過；同欄位只要仍有另一個真實 dairy
occurrence，就拒絕整份 plan。
現在又是出了什麼問題？修改
### FR-02 — Critical：被否定的安全標示仍被當成安全標示移除

**位置：**

- `supabase/functions/_shared/named-recipe-integrity.js:67-87`
- `supabase/functions/_shared/named-recipe-integrity.js:126-139`

目前 matcher 只尋找 `<allergen>-free`、`no <allergen>`、`無<allergen>` 等片段，
沒有判斷這個安全聲明本身是否被 `not`、`並非` 等語意否定。

**已直接重現為錯誤放行：**

- `Not peanut-free sauce`
- `Not gluten-free bread`
- `Not dairy-free milk`
- `This is not dairy-free milk`
- `not free from peanuts`
- 中文同型案例：`並非無花生…`

**風險：** 明確表示「不是無過敏原」的文字會被反向理解為安全。

**建議修法：**

- 安全標示清除前先偵測否定範圍；被否定或語意不確定時不得清除。
- 健康安全 gate 無法可靠解析否定範圍時，應 fail closed。
- 英文與繁中／簡中否定型態都要有 regression tests。

**驗收標準：** 上列所有否定安全標示都必須 BLOCK；真正的
`peanut-free`、`gluten-free`、`無花生` 基本案例仍可通過。

### FR-03 — Important：plant-based analogue 有相同的片段邊界繞過

**位置：**

- `supabase/functions/_shared/named-recipe-integrity.js:96-113`

plant-based／meatless analogue 使用與 FR-01 類似的有限連接詞黑名單。final allergen
gate 按規格不處理 vegan／vegetarian，但這個 shared matcher 仍被較早的 recipe
validation 使用，因此不能放任回歸。

**已直接重現為 shared matcher 錯誤判定無衝突：**

- `Plant-based sauce including chicken`
- `Plant-based sauce includes chicken`
- `Plant-based sauce but chicken`
- `Meatless sauce including beef`

**建議修法與驗收：** 採用可證明的 analogue phrase 白名單與明確 token boundary；
上列案例均須回傳 restriction conflict，而 `plant-based chicken` 本身仍可通過 vegan
restriction。

### FR-04 — Important：`{ plan: null }` 被當成沒有 plan 而原樣放行

**位置：**

- `supabase/functions/_shared/named-recipe-integrity.js:334-359`

目前 `body.plan == null` 同時涵蓋兩種不同狀態：

1. 一般 error／clarification body 根本沒有 `plan` key；
2. response 明確含有 malformed `plan: null`。

第二種狀態現在會被原樣序列化，違反 malformed plan fail-closed。

**建議修法：**

- 先用 own-property 檢查區分「沒有 plan key」與「有 plan key 但值錯誤」。
- 沒有 plan key 的 error／clarification response 維持 pass-through。
- 只要存在 `plan` key，null、undefined、array、primitive 或 schema 不合都必須拒絕。

**驗收標準：** `{ error: ... }` 可正常回傳；`{ plan: null }`、
`{ plan: undefined }` 與其他 malformed plan 一律 fail closed。

## 3. 上一輪仍未處理的事項

以下問題不在 `1062088` 的 Task 1 範圍內，仍需後續修正：

| ID | 嚴重度 | 未完成事項 |
| --- | --- | --- |
| RR-01 | P0 | 本機與 verifier 仍使用 `.14`；production Supabase function 尚未證明包含最新 gate，舊版仍可能 false-positive 通過 deployment verifier。 |
| RR-02 | P1 | handler 仍以 `profileRow || {}` 建立 profile；應在生成前驗證 missing／malformed row 並直接回 503，而不是等 response gate 才失敗。 |
| RR-03 | P2 | 尚未執行真實 AI/provider success、unconfigured fallback、models-failed fallback 的 response-boundary tests；目前主要是 helper matrix 與 source contract。 |
| RR-04 | P2 | onboarding 尚未提供自訂過敏原輸入與完整保存／編輯／去重流程。 |
| RR-05 | P3 | egress rejection 的 `failure_stage` 仍可能被記為 `identity_verification`，尚未加入 `egress_validation`。 |
| RR-06 | P3 | handoff、spec、implementation plan、測試數與部署狀態文件仍未全面同步。 |

## 4. 建議處理順序

1. 先以 TDD 修正 FR-01、FR-02；這兩項仍可讓過敏原實際穿過 final gate。
2. 修正 FR-03、FR-04，保護 shared matcher 與 malformed response boundary。
3. 在 handler 讀取 profile 後立即 runtime validation；missing／malformed profile 回 503。
4. 增加可執行的真實 response-boundary 測試，逐條驗證三條 plan 回傳路徑、退款與 completion log ordering。
5. 完成 UI 自訂過敏原輸入與 medical dietary preferences 的保存契約。
6. 新增 `egress_validation` 診斷 stage，更新所有安全文件。
7. 最後 bump 唯一版本、部署 Supabase Edge Function，再以線上 source／行為驗證，不能只比較舊 `.14` 字串。

## 5. 完整驗收清單

- [ ] FR-01 的五個 dairy 片段邊界案例全部 BLOCK。
- [ ] FR-02 的英文與中文否定安全標示全部 BLOCK。
- [ ] FR-03 的 plant-based／meatless 邊界案例全部回報衝突。
- [ ] `{ plan: null }` 與所有帶 `plan` key 的 malformed body fail closed。
- [ ] 真正、單獨的安全標示與安全 analogue 仍可通過。
- [ ] missing／malformed profile 在模型生成前回 503。
- [ ] 三條真實 plan response path 都有 execution-level tests。
- [ ] unsafe metered response 會退款，且不記錄 completion。
- [ ] onboarding 可保存、重新載入、編輯與去重自訂過敏原。
- [ ] egress failure 使用 `failure_stage: egress_validation`。
- [ ] focused tests、完整 `npm test`、`npm run check`、Deno check、`git diff --check` 全部通過。
- [ ] function version 已 bump，verifier 不會對舊 `.14` 誤報成功。
- [ ] Supabase ACTIVE source 與 authenticated live behavior 都證明包含最新安全閘門。
- [ ] handoff、spec、plan 與 code review 文件狀態一致。

## 6. 驗證證據

- `node --test tests/named-recipe-pipeline.test.mjs`：72/72 通過。
- `npm test`：211/211 通過。
- `git diff --check dbdad0f..1062088`：通過。
- 額外 direct probes：重現 FR-01～FR-04；這些案例目前尚未進入正式測試。
- 受審 commit 僅修改 matcher 與 named-recipe tests；未修改 handler、UI、版本、部署或文件狀態。

## 7. 最終 Verdict

**Ready to merge：No**  
**Ready to deploy：No**

`1062088` 確實修掉上一輪多個已知漏洞，但新的獨立 probe 證明 final gate 仍可被片段
邊界與否定語意繞過。測試 211/211 通過不等於安全 invariant 已成立；完成
FR-01～FR-04、真實 response-boundary tests、profile fail-closed 與線上部署驗證前，
不可宣稱「使用者過敏原家族絕不出現在 ingredients」。
