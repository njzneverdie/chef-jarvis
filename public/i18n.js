(function exposeI18n(root) {
  const storageKey = "chef-jarvis:language";
  const translations = {
    "Opening Chef Jarvis": "正在開啟 Chef Jarvis",
    "Cook for your": "為真實生活",
    "real life.": "好好下廚。",
    "Your personal kitchen companion plans meals around your body, nutrition goals, allergies, preferences, equipment, and the food already in your kitchen.":
      "你的個人廚房夥伴會依照身體狀況、營養目標、過敏、飲食偏好、設備與現有庫存規劃餐點。",
    "Personalized nutrition": "個人化營養",
    "Allergy-safe swaps": "避開過敏原的替換",
    "Smart grocery planning": "智慧購物規劃",
    "Create your account": "建立帳號",
    "Welcome back.": "歡迎回來。",
    "Create an account, confirm the email we send you, then enter your private cooking profile.":
      "建立帳號並完成電子郵件驗證，再設定你的私人料理資料。",
    "Sign in to your saved meals, pantry and nutrition plan.":
      "登入以查看已儲存的餐點、庫存與營養計畫。",
    Email: "電子郵件",
    Password: "密碼",
    "Sign in →": "登入 →",
    "Create account & send confirmation →": "建立帳號並寄送驗證信 →",
    "Forgot your password?": "忘記密碼？",
    "Already have an account? Sign in": "已經有帳號？登入",
    "New to Chef Jarvis? Create an account": "第一次使用？建立帳號",
    "Your body and food preferences are private to your account.":
      "身體資料與飲食偏好只會保存在你的帳號中。",
    "Please wait…": "請稍候…",
    "Account created. Open the confirmation email, then return here to sign in.":
      "帳號已建立，請開啟驗證信，完成後再回來登入。",
    "Enter your email address first, then request a reset link.":
      "請先輸入電子郵件，再要求重設連結。",
    "Password reset email sent. Open the link in that email to continue.":
      "密碼重設信已寄出，請開啟信件中的連結繼續。",
    "Your password has been updated ✓": "密碼已更新 ✓",
    "Use at least 8 characters.": "請使用至少 8 個字元。",
    "you@example.com": "you@example.com",
    "Your password": "輸入密碼",
    "At least 8 characters": "至少 8 個字元",
    "SECURE YOUR ACCOUNT": "保護你的帳號",
    "Choose a new password.": "設定新密碼。",
    "New password": "新密碼",
    Cancel: "取消",
    "Update password →": "更新密碼 →",
    Home: "首頁",
    Plan: "食譜",
    Pantry: "庫存",
    Shopping: "購物清單",
    Week: "一週餐期",
    Cook: "烹飪",
    Profile: "個人資料",
    "Sign out": "登出",
    "Switch language": "切換語言",
    "Complete your profile": "請完成個人資料",
    "YOUR KITCHEN, MADE EASIER": "讓你的廚房更輕鬆",
    "Good cooking,": "好好下廚，",
    "made personal.": "為你量身打造。",
    "Tell Jarvis what you want to make. It will keep your pantry, preferences, allergies, and nutrition target in view.":
      "告訴 Jarvis 你想做什麼，它會同時考量庫存、偏好、過敏原與營養目標。",
    "Tell Jarvis what you want to cook…": "告訴 Jarvis 你想做什麼料理…",
    Generate: "產生食譜",
    "High-protein dinner for 2": "兩人份高蛋白晚餐",
    "Use my pantry": "優先使用我的庫存",
    "30-minute meal prep": "30 分鐘備餐",
    "YOUR DAILY TARGET": "你的每日目標",
    "Plan a meal →": "規劃一餐 →",
    "TODAY'S BALANCE": "今日營養平衡",
    "Fuel your day well.": "為今天補充好能量。",
    "Edit nutrition →": "編輯營養目標 →",
    "kcal target": "大卡目標",
    protein: "蛋白質",
    carbs: "碳水化合物",
    "Built from your own profile": "依你的個人資料計算",
    "Personal daily target": "個人每日目標",
    "KITCHEN INVENTORY": "廚房庫存",
    "What’s in your": "你的廚房",
    "kitchen?": "有什麼？",
    "Add an ingredient, e.g. chicken breast": "新增食材，例如：去骨去皮雞胸肉",
    "Add ingredient": "新增食材",
    "Loading your pantry…": "正在載入庫存…",
    "Your pantry is empty.": "你的庫存目前是空的。",
    "Add what you have. Jarvis reads this list before creating every meal.":
      "加入現有食材，Jarvis 每次規劃餐點前都會讀取這份清單。",
    "No expiry set": "未設定效期",
    "Added to your pantry ✓": "已加入庫存 ✓",
    "Cooking that learns": "越用越懂",
    "Jarvis uses your nutrition targets, health goal, allergies, pantry and food preferences before suggesting a meal or swap.":
      "Jarvis 會先考量營養目標、健康目標、過敏原、庫存與飲食偏好，再建議餐點或替換食材。",
    "Personal goal": "個人目標",
    "Edit my profile": "編輯個人資料",
    "Saved meal ideas": "已儲存的餐點靈感",
    "YOUR KITCHEN SETUP": "你的廚房設備",
    "Devices Jarvis can use.": "Jarvis 可使用的設備。",
    "Equipment selections control the alternatives Chef Mode may offer.":
      "設備選項會決定主廚模式能提供哪些替代做法。",
    "Save kitchen setup →": "儲存廚房設備 →",
    "Kitchen setup saved ✓": "廚房設備已儲存 ✓",
    Stovetop: "爐台",
    Oven: "烤箱",
    "Air fryer": "氣炸鍋",
    Microwave: "微波爐",
    "Rice cooker": "電子鍋",
    "Instant Pot": "壓力鍋",
    Blender: "調理機",
    "YOUR FOLDER": "你的收藏",
    "Saved meal": "已儲存的餐點",
    "ideas.": "靈感。",
    "Back to profile": "返回個人資料",
    "No saved meal ideas yet — save one in Plan.":
      "目前沒有已儲存的餐點靈感，請從食譜頁儲存。",
    "UPDATE YOUR PROFILE": "更新個人資料",
    "WELCOME TO CHEF JARVIS": "歡迎使用 CHEF JARVIS",
    "First, let’s cook for": "首先，讓料理真正適合",
    "Set your body data and food needs once. Jarvis will use them for every future recipe, substitution and meal plan.":
      "只要設定一次身體資料與飲食需求，Jarvis 就會套用到之後每份食譜、替換食材與餐點計畫。",
    "Height (cm)": "身高（公分）",
    "Weight (kg)": "體重（公斤）",
    Age: "年齡",
    "Sex (for estimate)": "生理性別（用於估算）",
    Female: "女性",
    Male: "男性",
    Activity: "活動量",
    "Low activity": "低活動量",
    Moderate: "中等活動量",
    High: "高活動量",
    "Target method": "目標設定方式",
    "Calculate for me": "替我計算",
    "I’ll enter my own": "自行輸入",
    "BODY GOAL": "體態目標",
    fat_loss: "減脂",
    muscle_gain: "增肌",
    recomposition: "增肌減脂",
    maintain: "維持",
    "Lose fat": "減脂",
    "Build muscle": "增肌",
    "Build muscle + lose fat": "增肌減脂",
    Maintain: "維持",
    Calories: "熱量",
    "Protein (g)": "蛋白質（克）",
    "Carbs (g)": "碳水化合物（克）",
    "Fat (g)": "脂肪（克）",
    "DIET & SAFETY": "飲食與安全",
    Vegetarian: "蛋奶素",
    Vegan: "純素",
    Halal: "清真飲食",
    "Lactose intolerant": "乳糖不耐",
    "Gluten-free": "無麩質",
    "Nut allergy": "堅果過敏",
    "Shellfish allergy": "甲殼類過敏",
    "Foods you dislike (comma separated)": "不喜歡的食物（以逗號分隔）",
    "e.g. cilantro, mushrooms": "例如：香菜、蘑菇",
    "KITCHEN SETUP": "廚房設備",
    "Save my cooking profile →": "儲存料理資料 →",
    "PERSONAL MEAL PLANNER": "個人化餐點規劃",
    "Your meal is": "你的餐點",
    "ready.": "準備好了。",
    "Let’s make something": "一起做一道",
    "great.": "好料理。",
    "＋ New meal": "＋ 新餐點",
    "Pantry and profile applied": "已套用庫存與個人資料",
    "Tell Jarvis what you would like to cook.": "告訴 Jarvis 你想做什麼料理。",
    "Created for your preferences; substitutions and nutrition reflect your profile.":
      "已依照你的偏好建立，替換食材與營養資訊也會套用個人資料。",
    "High-protein tomato chicken pasta": "高蛋白番茄雞肉義大利麵",
    "Your dish": "你的料理",
    "YOUR DISH": "你的料理",
    "Ingredients and cooking steps below": "食材與烹飪步驟如下",
    "CHEF JARVIS PLAN": "CHEF JARVIS 食譜",
    "est. kcal · whole meal": "預估大卡 · 整份料理",
    "est. protein · whole meal": "預估蛋白質 · 整份料理",
    "est. carbs · whole meal": "預估碳水 · 整份料理",
    "est. fat · whole meal": "預估脂肪 · 整份料理",
    "Meal estimate": "餐點估算",
    "Adjust it after changing quantities or swaps.":
      "更改份量或替換食材後請重新評估。",
    "Start guided cooking →": "開始引導烹飪 →",
    "Saved to your recipes": "已儲存到食譜",
    "Cook later ✓": "稍後再煮 ✓",
    "Saved for later ✓": "已留待稍後烹煮 ✓",
    "Find this meal under Recent plans whenever you are ready to cook.":
      "準備好下廚時，可隨時從最近的食譜中找到這道料理。",
    "WHAT TO PREPARE": "需要準備",
    "Ingredients for this meal": "這道料理的食材",
    "HOW JARVIS WILL GUIDE YOU": "JARVIS 如何引導",
    "SHOP ONCE, COOK MORE": "一次採買，多餐運用",
    "Ideas using your remaining ingredients.": "運用剩餘食材的料理靈感。",
    "Save for week →": "儲存到本週 →",
    "Save this meal for next week": "把這道料理留到下週",
    "Plan another meal around ingredients you already have.":
      "利用現有食材再規劃另一餐。",
    "Your selected ingredients": "你選擇的食材",
    "Check your shopping list": "查看購物清單",
    "YOUR SAVED COOKING PLANS": "已儲存的料理計畫",
    "Pick up where you left off.": "從上次中斷的地方繼續。",
    "Generated meals stay here after switching tabs or refreshing the page.":
      "切換頁面或重新整理後，產生的食譜仍會保留在這裡。",
    "Open plan →": "開啟食譜 →",
    "NEXT WEEK": "下週",
    "DEVICE ALTERNATIVES": "設備替代方案",
    "Made for your kitchen setup.": "依你的廚房設備調整。",
    "These swaps use the equipment saved in your profile.":
      "這些替代做法會使用你資料中已儲存的設備。",
    "SMART GROCERY LIST": "智慧購物清單",
    "What do you need to buy?": "還需要買什麼？",
    "Select the ingredients you still need. Exact quantities stay visible while you shop.":
      "勾選仍需購買的食材，採買時會持續顯示精確份量。",
    "Save selected items →": "儲存已選食材 →",
    "Save to Grocery List →": "儲存到購物清單 →",
    "Saving…": "儲存中…",
    "Saving selected ingredients…": "正在儲存已選食材…",
    "Saved to Shopping ✓": "已儲存到購物清單 ✓",
    "Saved to Grocery List ✓": "已儲存到購物清單 ✓",
    "Saved to your grocery list ✓": "已儲存到購物清單 ✓",
    "The checked ingredients, quantities, and units are ready below.":
      "已勾選的食材、份量與單位都整理在下方。",
    "Quantity not specified": "未標示份量",
    "Your grocery checklist is saved ✓": "購物清單已儲存 ✓",
    "Select at least one grocery item first.": "請至少選擇一項購物食材。",
    "Shopping list deleted": "購物清單已刪除",
    "Delete list": "刪除清單",
    Ingredient: "食材",
    "PERSONALIZED HEALTHY SWAPS": "個人化健康替換",
    "Make this meal work for": "讓這道料理真正適合",
    "you.": "你。",
    "These swaps are matched to your saved health and food profile.":
      "這些替換選項會依照你的健康與飲食資料調整。",
    "Choose any replacements now. Your ingredient list and grocery list will update immediately.":
      "請先決定是否替換；食材明細與購物清單會立即同步更新。",
    "Profile applied ✓": "已套用個人資料 ✓",
    "Use this swap": "使用這個替換",
    "Applying swap…": "正在套用替換…",
    "Swap applied ✓": "已套用替換 ✓",
    "The swap is applied here, but could not be saved yet.":
      "替換已套用，但目前無法儲存。",
    "Jarvis avoids your saved allergies and dietary restrictions. Check packaged ingredients when allergies are severe.":
      "Jarvis 會避開已記錄的過敏原與飲食限制；若有嚴重過敏，仍請檢查包裝成分。",
    "AT THE STORE": "採買模式",
    "Your shopping": "你的購物",
    "lists.": "清單。",
    "Loading your lists…": "正在載入購物清單…",
    "No saved lists yet.": "目前沒有已儲存的清單。",
    "Generate a meal, choose the ingredients you need, then save them here.":
      "先產生食譜、選擇需要的食材，再儲存到這裡。",
    "We could not load your lists.": "無法載入購物清單。",
    "CHEF MODE": "主廚模式",
    "ACTIVE RECIPE": "進行中的食譜",
    READY: "準備完成",
    "cook with Jarvis.": "和 Jarvis 一起煮。",
    "🔊 Read current step": "🔊 朗讀目前步驟",
    "DO THIS NOW": "現在請做",
    "Keep the timers running while you work. Your progress survives a refresh.":
      "操作時可以讓計時器持續運作，重新整理後進度也會保留。",
    "Only real cooking and waiting times become recipe countdowns. Your progress survives a refresh.":
      "只有真正的烹煮與等待時間才會建立食譜倒數；重新整理後進度仍會保留。",
    "← Previous": "← 上一步",
    "↻ Repeat": "↻ 重複朗讀",
    "Complete step →": "完成這一步 →",
    "Finish dish ✓": "完成料理 ✓",
    "RECIPE QUEUE": "料理步驟",
    "PARALLEL TASKS": "同步工作",
    "RECIPE TIMERS": "食譜計時器",
    "Kitchen clocks": "廚房計時器",
    "＋ Add clock": "＋ 新增計時器",
    "Countdowns alert you with sound, a notification, and a visual state. Stopwatches count up independently.":
      "倒數結束會以聲音、通知與畫面提示；碼表則獨立向上計時。",
    "Jarvis adds countdowns only for real cooking or waiting intervals. You can add a separate clock when needed.":
      "Jarvis 只會為真正的烹煮或等待時間加入倒數；需要時仍可自行新增計時器。",
    "No recipe countdown is needed.": "這份食譜不需要自動倒數。",
    "This recipe has no timed heat or waiting step. Add a clock only if you need one.":
      "這份食譜沒有需要計時的加熱或等待步驟；只有需要時才自行新增計時器。",
    Finished: "已完成",
    "Recipe countdown": "食譜倒數",
    "Your guided meal": "你的引導料理",
    "Prepare and measure every ingredient before turning on the heat.":
      "開火前先備妥並量好每一項食材。",
    "Heat your pan over medium heat and add the cooking oil.":
      "以中火加熱鍋具，再加入食用油。",
    "Cook the protein until browned and safely cooked through.":
      "將蛋白質食材煎至上色並完全熟透。",
    "Add vegetables and sauce, then stir until evenly coated.":
      "加入蔬菜與醬汁，翻炒至均勻裹上醬汁。",
    "Taste, adjust seasoning, plate, and serve while hot.":
      "試味並調整調味，盛盤後趁熱享用。",
    "ADD A KITCHEN CLOCK": "新增廚房計時器",
    "Track another task.": "追蹤另一項工作。",
    "Task name": "工作名稱",
    "Clock type": "計時器類型",
    Countdown: "倒數計時",
    Stopwatch: "碼表",
    Minutes: "分鐘",
    "Add clock →": "新增計時器 →",
    "e.g. Rice resting": "例如：白飯靜置",
    Start: "開始",
    Pause: "暫停",
    Resume: "繼續",
    Reset: "重設",
    Restart: "重新開始",
    "Remove clock": "移除計時器",
    "Task complete": "工作完成",
    "YOUR EQUIPMENT OPTION": "你的設備選項",
    "USDA FOODDATA CENTRAL": "USDA 食品資料庫",
    "USDA FOODDATA CENTRAL · INGREDIENT REFERENCE":
      "USDA 食品資料庫 · 食材參考",
    "Per-100 g ingredient data.": "每 100 克食材營養資料。",
    "This is not your meal total. These are independent USDA reference matches.":
      "這不是整份料理的總營養，而是各食材獨立對應的 USDA 參考資料。",
    "Verifying ingredient nutrition…": "正在核對食材營養資料…",
    "Jarvis is matching your ingredient list to USDA reference foods in the background.":
      "Jarvis 正在背景中將食材清單與 USDA 參考食品進行比對。",
    "Reference lookup is taking longer.": "參考資料查詢需要更多時間。",
    "Your plan and grocery list are ready. Try again later to refresh USDA ingredient references.":
      "食譜與購物清單已準備完成，稍後可再重新整理 USDA 食材參考資料。",
    "Gemini is temporarily busy, so Jarvis prepared a fully measured fallback recipe.":
      "Gemini 暫時忙碌，Jarvis 已準備一份份量完整的備用食譜。",
    "A profile-safe alternative for this meal.":
      "符合你個人飲食資料的替代選項。",
    "Your plan is ready, but it could not be saved yet.":
      "食譜已準備完成，但目前無法儲存。",
    "YOUR FOOD PROFILE": "你的飲食資料",
    "Built around": "專為",
    "Edit profile": "編輯資料",
    "BODY COMPOSITION GOAL": "體態目標",
    "DAILY TARGET": "每日目標",
    "DIETARY PREFERENCES": "飲食偏好",
    ALLERGIES: "過敏原",
    DISLIKES: "不喜歡的食物",
    EQUIPMENT: "廚房設備",
    "Cooked cold rice": "冷藏熟飯",
    Eggs: "雞蛋",
    "Cooked protein": "已煮熟的蛋白質食材",
    Scallions: "青蔥",
    "Extra-firm tofu": "板豆腐",
    "Boneless skinless chicken breast": "去骨去皮雞胸肉",
    "Canned chickpeas": "罐裝鷹嘴豆",
    "Cooked green lentils": "煮熟綠扁豆",
    "Unsweetened soy yogurt": "無糖豆乳優格",
    "Gluten-free tamari": "無麩質日式醬油",
    "Roasted pumpkin seeds": "烘烤南瓜子",
    "Main protein for your requested dish": "這道料理的主要蛋白質食材",
    "Fresh vegetables and aromatics": "新鮮蔬菜與辛香料",
    "Carbohydrate base, if needed": "需要時使用的主食",
    "Sauce and seasonings": "醬汁與調味料",
    "Invalid login credentials": "電子郵件或密碼不正確。",
    "Email not confirmed": "電子郵件尚未完成驗證。",
    "User already registered": "這個電子郵件已經註冊。",
    "Complete height, weight, and age with valid numbers.":
      "請完整填寫有效的身高、體重與年齡。",
    "Enter a valid kcal target (800–6000).":
      "請輸入有效的熱量目標（800–6000 大卡）。",
    "Enter a valid protein target (0–500).":
      "請輸入有效的蛋白質目標（0–500 克）。",
    "Enter a valid carbs target (0–1000).":
      "請輸入有效的碳水化合物目標（0–1000 克）。",
    "Enter a valid fat target (0–400).": "請輸入有效的脂肪目標（0–400 克）。",
    "Please sign in first.": "請先登入。",
    "Please sign in again.": "請重新登入。",
    "Your sign-in session has expired. Please sign in again.":
      "登入工作階段已過期，請重新登入。",
    "Chef Jarvis is not configured correctly.": "Chef Jarvis 目前設定不完整。",
    "Meal planning quota is temporarily unavailable.":
      "餐點規劃配額服務暫時無法使用。",
    "You reached today’s meal-plan limit. Try again later.":
      "你今天的餐點規劃額度已用完，請稍後再試。",
    "Too many meal plans at once. Wait a minute and try again.":
      "短時間內產生太多餐點，請等一分鐘後再試。",
    "Tell Jarvis what you would like to cook (up to 500 characters).":
      "請告訴 Jarvis 你想做什麼料理（最多 500 個字元）。",
    "Jarvis could not create a plan right now. Please try again.":
      "Jarvis 目前無法產生食譜，請再試一次。",
    "No matching USDA reference is available.": "找不到對應的 USDA 參考資料。",
    "This older localized recipe does not include English USDA search names. The recipe and grocery quantities are still available.":
      "這份較舊的中文食譜沒有 USDA 英文查詢名稱；食譜與購物份量仍可正常使用。",
    "USDA did not return a reliable match for these ingredients. Your recipe and grocery quantities are unaffected.":
      "USDA 沒有回傳可靠的食材對應；食譜與購物份量不受影響。",
    "USDA reference data is unavailable right now.":
      "USDA 參考資料目前無法使用。",
    "Your recipe and grocery quantities are ready; only the optional nutrition reference could not be loaded.":
      "食譜與購物份量都已備妥，只有選用的營養參考資料無法載入。",
    "No recipe is cooking yet.": "目前沒有進行中的料理。",
    "Generate a meal or open a saved recipe, then choose “Start guided cooking”.":
      "請先產生餐點或開啟已儲存的食譜，再選擇「開始引導烹飪」。",
    "Plan a recipe →": "先去產生一份食譜 →",
    "Start timer": "開始倒數",
    "Pause timer": "暫停倒數",
    "Restart timer": "重新開始倒數",
    "Start this timer": "開始這個倒數",
    "Pause this timer": "暫停這個倒數",
    "Restart this timer": "重新開始這個倒數",
    "Dish completed — great cooking! ✓": "料理完成，辛苦了！✓",
    "Not saved yet": "尚未儲存",
    "This draft can be restored for 30 minutes after a refresh.":
      "重新整理後，這份草稿仍可在 30 分鐘內自動恢復。",
    "Cook later": "稍後再煮",
    "Saved to your recipes ✓": "已儲存到食譜 ✓",
    "Only meals you chose to save appear here. You can remove experiments at any time.":
      "只有你選擇保留的餐點會出現在這裡；測試用食譜可隨時刪除。",
    Delete: "刪除",
    "Delete recipe": "刪除食譜",
    "Delete this saved recipe?": "刪除這份已儲存的食譜？",
    "Saved recipe deleted": "已刪除儲存的食譜",
    "PLEASE CONFIRM": "請確認",
    "Sign out while cooking?": "要在烹飪途中登出嗎？",
    "Your cooking progress will stay saved on this device and return after you sign in again.":
      "料理進度會保留在這台裝置上，重新登入後可繼續。",
    "Delete this shopping list?": "刪除這份購物清單？",
    "The list and all of its checked-item progress will be removed.":
      "清單及所有勾選進度都會被刪除。",
    "Ingredient and grocery quantities are updated. Cooking steps may still describe the original ingredient, so review them before starting—especially for allergies.":
      "食材與購物份量已更新，但烹飪步驟仍可能描述原食材；開始前請再次確認，尤其是過敏需求。",
    "Loading today’s intake…": "正在載入今日攝取…",
    "USDA-backed meals appear here after cooking.":
      "完成料理後，USDA 佐證的攝取會顯示在這裡。",
    "Today’s intake is unavailable": "目前無法載入今日攝取",
    "USDA FOODDATA CENTRAL · WHOLE MEAL": "USDA FOODDATA CENTRAL · 整餐結算",
    "USDA-backed meal nutrition.": "USDA 佐證的整餐營養。",
    "View USDA ingredient matches": "查看 USDA 食材對照",
    "Add all purchased items to pantry →": "將已購品項全部加入庫存 →",
    "Added to pantry ✓": "已加入庫存 ✓",
    "Adding to pantry…": "正在加入庫存…",
    "WEEKLY PLANNER": "一週餐期表",
    "Shop once,": "一次採買，",
    "cook all week.": "煮足一週。",
    "Build weekly grocery list →": "建立本週合併購物清單 →",
    "Loading your week…": "正在載入本週餐期…",
    "Could not load this week.": "無法載入本週餐期。",
    "Dinner is open.": "晚餐尚未安排。",
    "Choose a saved recipe": "選擇已儲存的食譜",
    Add: "加入",
    Replace: "替換",
    "Merging ingredients…": "正在合併食材…",
    "SAVED FOR NEXT WEEK": "已留到下週",
    "Ideas waiting in your folder.": "收藏中的待選靈感。",
    "HELP JARVIS LEARN": "幫助 JARVIS 更懂你",
    "How did this meal taste?": "這道料理好吃嗎？",
    "One quick rating helps future recipes fit you better.":
      "簡單評分一次，之後的食譜會更貼近你的口味。",
    "Servings you ate": "你實際吃了幾人份",
    "Nutrition starts at one serving. Change this if you ate more.":
      "營養預設記錄一人份；如果吃得更多，請在這裡調整。",
    "Meal rating": "料理評分",
    "Optional note": "選填筆記",
    "e.g. Less spicy next time": "例如：下次少辣一點",
    "Skip rating": "略過評分",
    "Save feedback →": "儲存評分 →",
    "Thanks — Jarvis will remember this for future meals ✓":
      "謝謝，Jarvis 會在未來的餐點中記住這次回饋 ✓",
    "🎙 Hands-free": "🎙 免手操作",
    "🎙 Listening…": "🎙 聆聽中…",
    "Voice control is not supported in this browser.":
      "這個瀏覽器不支援語音控制。",
    "Microphone access is needed for hands-free cooking.":
      "免手操作需要麥克風權限。",
    "Say: next step, repeat, start timer, or pause timer.":
      "你可以說：下一步、重複、開始計時或暫停計時。",
  };

  const regexTranslations = [
    [
      /^Enter a valid email and a password with at least (\d+) characters\.$/,
      "請輸入有效的電子郵件與至少 $1 個字元的密碼。",
    ],
    [
      /^“(.+)” will be removed from Recent plans\.$/,
      "「$1」將從最近的食譜中移除。",
    ],
    [/^⌂\s+Home$/, "⌂　首頁"],
    [/^✦\s+Plan$/, "✦　食譜"],
    [/^▦\s+Pantry$/, "▦　庫存"],
    [/^☑\s+Shopping$/, "☑　購物清單"],
    [/^▤\s+Week$/, "▤　一週餐期"],
    [/^◴\s+Cook$/, "◴　烹飪"],
    [/^◌\s+Profile$/, "◌　個人資料"],
    [/^(.+) kcal · (.+)g protein$/, "$1 大卡 · $2 克蛋白質"],
    [
      /^recomposition plan · pantry and preferences applied$/,
      "增肌減脂計畫 · 已套用庫存與偏好",
    ],
    [
      /^fat loss plan · pantry and preferences applied$/,
      "減脂計畫 · 已套用庫存與偏好",
    ],
    [
      /^muscle gain plan · pantry and preferences applied$/,
      "增肌計畫 · 已套用庫存與偏好",
    ],
    [
      /^maintain plan · pantry and preferences applied$/,
      "維持計畫 · 已套用庫存與偏好",
    ],
    [
      /^(.+) plan · pantry and preferences applied$/,
      "$1 計畫 · 已套用庫存與偏好",
    ],
    [/^(.+)g fat target$/, "脂肪目標 $1 克"],
    [/^(\d+(?:\.\d+)?)g$/, "$1 克"],
    [/^(\d+) items selected$/, "已選擇 $1 項食材"],
    [/^(\d+) item selected$/, "已選擇 $1 項食材"],
    [/^(\d+) clear cooking steps$/, "$1 個清楚的料理步驟"],
    [/^Shopping · (.+)$/, "購物 · $1"],
    [
      /^(\d+) min · (\d+) servings · saved (.+)$/,
      "$1 分鐘 · $2 人份 · 儲存於 $3",
    ],
    [/^(\d+(?:\.\d+)?) cups?$/, "$1 杯"],
    [/^(\d+(?:\.\d+)?) portions?$/, "$1 份"],
    [/^STEP (\d+) \/ (\d+)$/, "步驟 $1 / $2"],
    [/^Step (\d+) · Recipe countdown$/, "步驟 $1 · 食譜倒數"],
    [/^(\d+) min · (\d+) servings$/, "$1 分鐘 · $2 人份"],
    [/^◷ (.+) min · ◌ (.+) servings$/, "◷ $1 分鐘 · ◌ $2 人份"],
    [/^Whole recipe \((.+) servings\)\.$/, "整份食譜（$1 人份）。"],
    [
      /^· Whole recipe \((.+) servings\)\. Adjust it after changing quantities or swaps\.$/,
      "· 整份食譜（$1 人份）。更改份量或替換食材後請重新評估。",
    ],
    [/^Best by (.+)$/, "最佳賞味期限 $1"],
    [/^SWAP (\d+)$/, "替換 $1"],
    [/^(\d+) OF (\d+) PICKED$/, "已取得 $1 / $2 項"],
    [/^CHEF MODE · ACTIVE RECIPE$/, "主廚模式 · 進行中的食譜"],
    [/^CHEF MODE · READY$/, "主廚模式 · 準備完成"],
    [/^No (.+)$/, "不含 $1"],
  ];

  let language = localStorage.getItem(storageKey) === "zh-TW" ? "zh-TW" : "en";

  function translate(value) {
    if (language !== "zh-TW") return value;
    const clean = String(value).trim();
    if (!clean) return value;
    let translated = translations[clean];
    if (!translated) {
      for (const [pattern, replacement] of regexTranslations) {
        if (pattern.test(clean)) {
          translated = clean.replace(pattern, replacement);
          break;
        }
      }
    }
    if (!translated) return value;
    const leading = String(value).match(/^\s*/)?.[0] || "";
    const trailing = String(value).match(/\s*$/)?.[0] || "";
    return `${leading}${translated}${trailing}`;
  }

  function localizeTree(node = document.body) {
    if (language !== "zh-TW" || !node) return;
    const roots = node.nodeType === Node.TEXT_NODE ? [node] : [];
    if (node.nodeType === Node.ELEMENT_NODE) {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) roots.push(walker.currentNode);
      [
        node,
        ...node.querySelectorAll("[placeholder],[aria-label],[title]"),
      ].forEach((element) => {
        ["placeholder", "aria-label", "title"].forEach((attribute) => {
          if (element.hasAttribute?.(attribute))
            element.setAttribute(
              attribute,
              translate(element.getAttribute(attribute)),
            );
        });
      });
    }
    roots.forEach((textNode) => {
      const next = translate(textNode.nodeValue);
      if (next !== textNode.nodeValue) textNode.nodeValue = next;
    });
  }

  function setLanguage(next) {
    language = next === "zh-TW" ? "zh-TW" : "en";
    localStorage.setItem(storageKey, language);
    document.documentElement.lang = language;
    document.title =
      language === "zh-TW"
        ? "Chef Jarvis — 你的個人 AI 廚房助手"
        : "Chef Jarvis — Your personal AI sous-chef";
    document.dispatchEvent(
      new CustomEvent("chef-language-change", { detail: { language } }),
    );
  }

  function toggleLabel() {
    return language === "zh-TW" ? "EN" : "中文";
  }

  document.documentElement.lang = language;
  document.title =
    language === "zh-TW"
      ? "Chef Jarvis — 你的個人 AI 廚房助手"
      : "Chef Jarvis — Your personal AI sous-chef";
  new MutationObserver((mutations) => {
    if (language !== "zh-TW") return;
    mutations.forEach((mutation) =>
      mutation.addedNodes.forEach((node) => localizeTree(node)),
    );
  }).observe(document.documentElement, { childList: true, subtree: true });

  root.I18n = Object.freeze({
    get code() {
      return language;
    },
    translate,
    localizeTree,
    setLanguage,
    toggleLabel,
  });
  queueMicrotask(() => localizeTree(document.body));
})(globalThis);
