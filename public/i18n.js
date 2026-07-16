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
    "DEVICE ALTERNATIVES": "設備替代方案",
    "Made for your kitchen setup.": "依你的廚房設備調整。",
    "These swaps use the equipment saved in your profile.":
      "這些替代做法會使用你資料中已儲存的設備。",
    "SMART GROCERY LIST": "智慧購物清單",
    "What do you need to buy?": "還需要買什麼？",
    "Select the ingredients you still need. Exact quantities stay visible while you shop.":
      "勾選仍需購買的食材，採買時會持續顯示精確份量。",
    "Save selected items →": "儲存已選食材 →",
    "Saving…": "儲存中…",
    "Saved to Shopping ✓": "已儲存到購物清單 ✓",
    "Your grocery checklist is saved ✓": "購物清單已儲存 ✓",
    "Select at least one grocery item first.": "請至少選擇一項購物食材。",
    "Shopping list deleted": "購物清單已刪除",
    "PERSONALIZED HEALTHY SWAPS": "個人化健康替換",
    "Make this meal work for": "讓這道料理真正適合",
    "you.": "你。",
    "These swaps are matched to your saved health and food profile.":
      "這些替換選項會依照你的健康與飲食資料調整。",
    "Profile applied ✓": "已套用個人資料 ✓",
    "Use this swap": "使用這個替換",
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
    "ADD A KITCHEN CLOCK": "新增廚房計時器",
    "Track another task.": "追蹤另一項工作。",
    "Task name": "工作名稱",
    "Clock type": "計時器類型",
    Countdown: "倒數計時",
    Stopwatch: "碼表",
    Minutes: "分鐘",
    "Add clock →": "新增計時器 →",
    Start: "開始",
    Pause: "暫停",
    Resume: "繼續",
    Reset: "重設",
    "Task complete": "工作完成",
    "YOUR EQUIPMENT OPTION": "你的設備選項",
    "USDA FOODDATA CENTRAL": "USDA 食品資料庫",
    "Verifying ingredient nutrition…": "正在核對食材營養資料…",
    "Jarvis is matching your ingredient list to USDA reference foods in the background.":
      "Jarvis 正在背景中將食材清單與 USDA 參考食品進行比對。",
    "Reference lookup is taking longer.": "參考資料查詢需要更多時間。",
    "Your plan and grocery list are ready. Try again later to refresh USDA ingredient references.":
      "食譜與購物清單已準備完成，稍後可再重新整理 USDA 食材參考資料。",
    "Gemini is temporarily busy, so Jarvis prepared a fully measured fallback recipe.":
      "Gemini 暫時忙碌，Jarvis 已準備一份份量完整的備用食譜。",
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
  };

  const regexTranslations = [
    [/^⌂\s+Home$/, "⌂　首頁"],
    [/^✦\s+Plan$/, "✦　食譜"],
    [/^▦\s+Pantry$/, "▦　庫存"],
    [/^☑\s+Shopping$/, "☑　購物清單"],
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
