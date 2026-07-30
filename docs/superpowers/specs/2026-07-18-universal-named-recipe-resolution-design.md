# Chef Jarvis 明確菜名食譜解析設計

日期：2026-07-18  
狀態：設計已由使用者逐段核准，待文件審查

## 1. 目標

當使用者輸入一個可辨識的公開料理名稱時，Chef Jarvis 必須取得或產生該料理的完整食譜，不得在未告知的情況下替換成其他菜色。

系統採混合式來源策略：

1. 優先查詢可信、結構化的第三方食譜來源。
2. 外部來源未命中、不可用或無法安全改編時，由 Gemini 產生同一道菜。
3. 所有來源都失敗時，明確顯示取得失敗，不回傳其他備援菜色。

第一個外部 provider 採用 TheMealDB，但所有 provider 必須透過統一介面接入，以便日後替換或增加其他授權來源。

## 2. 範圍

### 2.1 支援範圍

- 可辨識的公開料理名稱，例如肉燥飯、滷肉飯、Beef Bourguignon。
- 繁體中文、簡體中文、英文、常見拼音與地區別名。
- 高信心的常見錯字，例如「肉躁飯」。
- 外部英文食譜可翻譯、換算及結構化為 Chef Jarvis 格式。
- 外部食譜可依使用者過敏、飲食偏好、份量及設備安全改編，但必須保留料理核心特色。

### 2.2 不保證範圍

- 自創菜名、店家限定名稱或無法辨識的名稱不保證可直接取得食譜。
- 這類名稱必須要求使用者補充料理描述。
- 低信心名稱不能自行猜測，必須讓使用者從候選菜名中選擇。

## 3. 核心產品規則

### 3.1 明確菜名

- 明確菜名只能回傳同一道料理的食譜。
- 成功結果可以來自外部來源、安全改編的外部來源或 Gemini 生成。
- 所有路徑失敗時，顯示針對原菜名的明確錯誤。
- 不得回傳蔬菜飯碗、雞肉藜麥鍋或其他不相符的靜態 fallback。

### 3.2 廣泛需求

「推薦健康晚餐」「高蛋白晚餐」等廣泛需求維持既有邏輯：

- Gemini 可自由選擇符合條件的菜色。
- 應避免與近期食譜高度重複。
- Gemini 全部失敗時，可以使用明確標示的輪替備援食譜。

### 3.3 顯示名稱

- 系統以 canonical dish name 進行搜尋與比對。
- 使用者介面保留使用者原始輸入。
- 例如「肉躁飯」可解析為 canonical name「肉燥飯」，畫面仍顯示原始輸入，並可附上已辨識的標準名稱。

## 4. 架構

明確菜名請求採以下 pipeline：

```text
使用者輸入
→ Dish Resolver
→ Recipe Source Provider
→ Recipe Transformer
→ Recipe Personalizer
→ Recipe Validator / Repair
→ Recipe Persistence
→ 回傳
```

外部來源未命中或不可使用時：

```text
Recipe Source Provider miss
→ Gemini Recipe Generator
→ Recipe Validator / Repair
→ Recipe Persistence
→ 回傳
```

### 4.1 Dish Resolver

責任：

- 判斷請求是明確菜名或廣泛需求。
- 正規化繁簡體、英文、拼音、別名及高信心錯字。
- 產生 `original_request`、`display_name`、`canonical_dish_name` 與搜尋別名。
- 低信心時回傳 2 至 3 個候選菜名，停止食譜產生流程。

輸出至少包含：

```ts
type DishResolution = {
  requestType: "named_dish" | "broad_request";
  originalRequest: string;
  displayName: string;
  canonicalName: string;
  aliases: string[];
  confidence: number;
  clarificationCandidates: string[];
};
```

### 4.2 Recipe Source Provider

所有外部食譜來源實作統一介面：

```ts
interface RecipeSourceProvider {
  searchDish(canonicalName: string, aliases: string[]): Promise<RecipeSourceResult[]>;
  getRecipe(id: string): Promise<ExternalRecipe>;
  persistencePolicy(): RecipePersistencePolicy;
}
```

第一版實作 `TheMealDbProvider`。

Provider 必須：

- 在 Supabase Edge Function 內執行。
- 使用 server-side secret，不得把 key 暴露至公開前端。
- 回傳來源名稱、原始標題、來源 URL、provider ID 和完整度資訊。
- 宣告來源內容是否允許永久保存。

正式上線前必須確認正式 API key 及條款允許預定用途。TheMealDB 開發測試 key 不得被視為正式產品授權。

### 4.3 Recipe Source Matcher

外部搜尋結果必須經過同菜色比對：

- 標題或已知別名必須與 canonical dish 高度相符。
- 不能因為共享單一食材詞彙就視為同一道菜。
- 多筆候選依名稱相似度、資料完整度及安全相容性排序。
- 沒有高信心結果時回傳 provider miss，不選擇「最接近的菜」。

### 4.4 Recipe Transformer

責任：

- 將外部 provider 格式轉為 Chef Jarvis `MealPlan`。
- 拆分食材、份量、單位及 preparation。
- 翻譯成目前介面語言。
- 將外部步驟轉成結構化 steps 和 timers。
- 保留來源資訊及原始菜名。

Transformer 不得捏造來源未提供的關鍵事實。無法可靠結構化的外部食譜應被視為不可用，轉入 Gemini 同菜名生成路徑。

### 4.5 Recipe Personalizer

責任：

- 根據伺服器驗證的過敏、飲食偏好、份量和設備調整食譜。
- 替換食材時同步更新所有相關步驟、份量、計時器和營養估算。
- 保留料理的核心食材、技法或風味識別。
- 改編結果標示為「改編自來源食譜」。

若外部食譜無法在保留料理身份的前提下安全改編，必須放棄該來源，改由 Gemini 產生同一道菜。

### 4.6 Recipe Validator / Repair

驗證範圍：

- 菜色是否與明確請求一致。
- 過敏與飲食限制。
- 食材名稱、份量、單位和 preparation。
- 每個料理步驟引用的食材是否完整列出。
- substitutions 是否同步更新所有受影響步驟。
- 烹調時間與 timers 是否一致。

錯誤分級：

- 可修復：單一 timer 缺失、單位格式、可明確判定的步驟結構或欄位格式。
- 不可修復：菜色不符、含有未處理過敏原、核心食材缺失或資料無法可靠判定。

可修復錯誤只修復受影響欄位，修復後必須重新執行完整驗證。單一 timer 或格式錯誤不得立即淘汰整份其他部分合法的食譜。

### 4.7 Gemini Recipe Generator

啟動條件：

- Provider 無高信心結果。
- Provider 逾時或不可用。
- 外部食譜不完整。
- 外部食譜無法安全改編。
- 外部食譜無法通過不可修復驗證。

規則：

- 必須產生 canonical dish 指定的同一道料理。
- 不得改選其他菜色。
- 第一模型輸出有可修復錯誤時，帶著具體錯誤原因進行一次結構修復。
- 修復仍失敗後才嘗試第二模型。
- 第二模型仍失敗時回傳明確失敗，不使用其他菜色 fallback。

### 4.8 Recipe Persistence

新食譜保存來源欄位：

- `source_type`: `external | adapted | ai_generated`
- `source_provider`
- `source_title`
- `source_url`
- `canonical_dish_name`
- `original_request`

既有 recipes 必須維持相容，不要求立即回填來源欄位。

只有 provider 條款允許時，才可永久保存完整外部食譜。若 provider 不允許永久保存，該來源只能即時顯示，且不能建立會在日後重播完整內容的使用者食譜紀錄。

## 5. 詳細資料流程

### 5.1 Provider 命中

```text
輸入
→ Dish Resolver
→ TheMealDB 搜尋 canonical name 與 aliases
→ Recipe Source Matcher 高信心命中
→ 取得完整來源食譜
→ Transformer
→ Personalizer
→ Validator / Repair
→ 依 persistence policy 保存
→ 回傳 external 或 adapted recipe
```

### 5.2 Provider 未命中

```text
Provider miss / unavailable / unsafe
→ Gemini 產生 canonical dish
→ Validator
→ 可修復錯誤則修復一次
→ 必要時第二模型
→ 保存並回傳 ai_generated recipe
```

### 5.3 名稱不確定

```text
Dish Resolver 低信心
→ 回傳 dish_clarification_required
→ 顯示 2 至 3 個候選
→ 使用者選擇
→ 以選定 canonical dish 重新開始流程
```

候選狀態不得消耗 AI 食譜配額，也不得建立 recipe。

### 5.4 全部失敗

- 回傳針對原菜名的明確錯誤。
- 提供重新嘗試操作。
- 不建立 recipe、圖片或購物清單。
- 已消耗的 AI 食譜配額必須退還。
- 不得回傳其他菜色。

繁體中文錯誤範例：

> 目前無法取得「肉燥飯」的完整食譜，請稍後再試。

## 6. 狀態與可觀測性

完成結果：

- `external_recipe`
- `adapted_external_recipe`
- `ai_generated`

非成功結果：

- `dish_clarification_required`
- `provider_miss`
- `provider_unavailable`
- `provider_recipe_incomplete`
- `generation_validation_failed`
- `generation_timeout`

日誌至少記錄：

- request ID
- canonical dish name 的不可逆摘要或經核准的低敏感識別
- provider 與 provider outcome
- 模型、嘗試次數和驗證結果
- 各階段耗時
- 最終 outcome

日誌不得包含完整 profile、過敏資料、access token、API key 或完整外部食譜內容。

## 7. 時間預算

- TheMealDB 搜尋與詳細資料合計上限 4 秒。
- Edge Function 整體工作預算上限 42 秒。
- 前端 50 秒內必須取得食譜、候選菜名或明確錯誤。
- 圖片和 USDA 查詢不得阻塞主要食譜回傳。
- Provider 逾時後立即進入 Gemini 路徑，不得重複等待同一 provider。

各模型與修復步驟必須共用整體 deadline；不得各自重置完整 timeout，造成總時間超過上限。

## 8. 驗收標準

### 8.1 明確菜名不替換

- 輸入「肉燥飯」時，只能回傳肉燥飯或明確失敗。
- Provider 無結果、模型失敗或逾時時，不得回傳其他料理。

### 8.2 別名與錯字

- 肉燥飯、滷肉飯、魯肉飯及 lu rou fan 解析為同一料理家族。
- 高信心錯字可自動校正。
- 低信心結果回傳 2 至 3 個候選，不自動選擇。
- 畫面保留使用者原始輸入。

### 8.3 外部來源

- TheMealDB 高信心命中時，優先使用外部食譜。
- 顯示來源名稱、連結及外部／改編標示。
- 翻譯後食材、份量和步驟保持完整。
- 來源欄位依 persistence policy 正確儲存或明確禁止儲存。

### 8.4 個人安全

- 過敏原必須被安全替換，或放棄該來源。
- 替換食材後，所有相關步驟、份量和 timers 必須同步更新。
- 改編後仍必須保持原料理核心特色。

### 8.5 驗證修復

- 步驟缺少明確烹調時間時，先修復受影響步驟再完整重驗。
- 單一 timer、單位或欄位格式錯誤不得直接淘汰整份合法食譜。
- 菜色不符、過敏原或核心食材缺失仍必須拒絕。

### 8.6 全部失敗

- 顯示原菜名的明確失敗訊息。
- 不建立 recipe、圖片或購物清單。
- 退還 AI 食譜配額。
- UI 提供重新嘗試。

### 8.7 廣泛需求相容

- 廣泛推薦仍可自由選擇菜色。
- 近期菜色輪替仍有效。
- AI 失敗時仍可使用明確標示的廣泛請求 fallback。

### 8.8 安全與時限

- 第三方 API key 不得出現在公開資產。
- Provider 故障不阻塞 Gemini fallback。
- 前端在 50 秒內取得可操作結果。
- 日誌不包含敏感個人資料或 secrets。

## 9. 測試策略

### 9.1 單元測試

- 明確菜名與廣泛需求分類。
- 繁簡體、英文、拼音、別名及錯字解析。
- 菜名相似度和錯誤候選排除。
- TheMealDB 格式轉換。
- 食材、步驟、timer、substitution 驗證與修復。
- 來源 persistence policy。

### 9.2 Provider contract tests

- 高信心命中。
- 無結果。
- 429 限流。
- Provider 逾時。
- 缺少步驟或食材。
- API 回傳格式異常。

測試不得依賴正式 TheMealDB 即時資料；以固定 fixture 驗證 contract，另保留不阻塞 CI 的 smoke test。

### 9.3 Edge Function 整合測試

- Provider 命中後成功回傳。
- Provider miss 後 Gemini 成功。
- Provider 不安全後 Gemini 成功。
- 第一模型可修復錯誤後成功。
- 第一模型失敗後第二模型成功。
- 全部失敗後退還配額且不建立 recipe。
- 明確菜名永不進入廣泛請求 fallback。

### 9.4 Browser E2E

- 肉燥飯 provider miss 後仍得到肉燥飯。
- 高信心錯字自動辨識。
- 低信心名稱顯示候選並可重新提交。
- 外部食譜顯示來源與改編標示。
- 全部失敗顯示原菜名錯誤和重新嘗試。
- 不產生錯誤圖片、購物清單或儲存紀錄。

### 9.5 正式站 smoke test

- 驗證前端資產和 Edge Function 版本一致。
- 以允許的測試帳號驗證一筆外部命中及一筆 Gemini fallback。
- 確認第三方 secret 已設定且未暴露。
- 確認日誌 outcome、耗時和 request ID 可追蹤。

## 10. 外部依賴與上線條件

- 取得適用於正式產品的 TheMealDB API key。
- 審查並記錄 TheMealDB 對完整食譜保存、改編、翻譯和來源標示的許可。
- 若條款不允許既有 Chef Jarvis 儲存模型，正式版不得永久保存該 provider 的完整內容。
- Supabase secret 設定第三方 key。
- 正式部署 Edge Function、前端及必要的 schema migration。
- 通過本文件所有自動化驗收及正式站 smoke test。

## 11. 非目標

- 本階段不建立自己的大型食譜資料庫。
- 不串接多個付費 recipe provider。
- 不爬取未授權網站內容。
- 不保證自創菜名可在沒有補充描述的情況下生成。
- 不改寫與明確菜名解析無關的 Chef Mode、購物清單或營養功能。

