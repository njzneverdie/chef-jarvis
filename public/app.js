const SUPABASE_URL = "https://mylcykwmwlnjlclodmuo.supabase.co";
const SUPABASE_KEY = "sb_publishable_DCmfrANKHYSrKx18V-fJhg_TEMfoyb1";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.querySelector("#app");

let user = null;
let profile = null;
let timers = [];
let authSignup = false;

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character],
  );

const finiteNumber = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const calculateTarget = window.ChefDomain.calculateTarget;
const localDateKey = window.ChefDomain.localDateKey;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => console.info("Offline support is unavailable", error));
  });
}

function languageToggleMarkup() {
  return `<button class="language-toggle" id="language-toggle" type="button" aria-label="Switch language">文/A · ${window.I18n.toggleLabel()}</button>`;
}

function bindLanguageToggle() {
  document.querySelector("#language-toggle")?.addEventListener("click", () => {
    const currentView = document.querySelector(".view.active")?.id || "home";
    const plan = typeof currentPlan === "undefined" ? null : currentPlan;
    window.I18n.setLanguage(window.I18n.code === "zh-TW" ? "en" : "zh-TW");
    if (!user) {
      authScreen(authSignup);
      return;
    }
    shell();
    if (plan) renderPlan(plan);
    show(currentView);
  });
}

function toast(text) {
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = text;
  document.body.append(element);
  setTimeout(() => element.remove(), 3200);
}

function bindDismissibleModal(modal, onClose = () => modal.remove()) {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeyDown);
    onClose();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeyDown);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  return close;
}

function confirmAction({ title, message, confirmLabel = "Confirm" }) {
  return new Promise((resolve) => {
    let accepted = false;
    const modal = document.createElement("div");
    modal.className = "modal confirm-modal";
    modal.innerHTML = `<div class="modal-card confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><p class="eyebrow">PLEASE CONFIRM</p><h2 id="confirm-title">${esc(title)}</h2><p>${esc(message)}</p><div class="form-actions"><button type="button" class="cream" data-confirm-cancel>Cancel</button><button type="button" class="dark" data-confirm-accept>${esc(confirmLabel)}</button></div></div>`;
    document.body.append(modal);
    const close = bindDismissibleModal(modal, () => {
      modal.remove();
      resolve(accepted);
    });
    modal.querySelector("[data-confirm-cancel]").onclick = close;
    modal.querySelector("[data-confirm-accept]").onclick = () => {
      accepted = true;
      close();
    };
  });
}

function initials() {
  return (user?.email || "J")[0].toUpperCase();
}

function nutrition() {
  return profile
    ? `${finiteNumber(profile.calorie_target, "—")} kcal · ${finiteNumber(profile.protein_g, "—")}g protein`
    : "Complete your profile";
}

function authScreen(signup = false) {
  authSignup = signup;
  app.innerHTML = `
    ${languageToggleMarkup()}
    <main class="auth">
      <section class="auth-copy">
        <div class="brand"><span>✦</span>Chef <em>Jarvis</em></div>
        <h1>Cook for your<br><em>real life.</em></h1>
        <p>Your personal kitchen companion plans meals around your body, nutrition goals, allergies, preferences, equipment, and the food already in your kitchen.</p>
        <div class="auth-points"><span>Personalized nutrition</span><span>Allergy-safe swaps</span><span>Smart grocery planning</span></div>
      </section>
      <section class="auth-panel">
        <form class="auth-card" id="auth-form" novalidate>
          <h2>${signup ? "Create your account" : "Welcome back."}</h2>
          <p>${signup ? "Create an account, confirm the email we send you, then enter your private cooking profile." : "Sign in to your saved meals, pantry and nutrition plan."}</p>
          <div class="field"><label>Email</label><input type="email" name="email" autocomplete="email" placeholder="you@example.com"></div>
          <div class="field"><label>Password</label><input type="password" name="password" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="${signup ? "At least 8 characters" : "Your password"}"></div>
          <p class="error hidden" id="auth-error"></p>
          <button type="submit" class="auth-submit">${signup ? "Create account & send confirmation →" : "Sign in →"}</button>
          ${signup ? "" : '<button type="button" class="auth-toggle" id="forgot-password">Forgot your password?</button>'}
          <button type="button" class="auth-toggle" id="auth-toggle">${signup ? "Already have an account? Sign in" : "New to Chef Jarvis? Create an account"}</button>
          <p class="note">Your body and food preferences are private to your account.</p>
        </form>
      </section>
    </main>`;

  bindLanguageToggle();

  document.querySelector("#auth-toggle").onclick = () => authScreen(!signup);
  document
    .querySelector("#forgot-password")
    ?.addEventListener("click", requestPasswordReset);
  document.querySelector("#auth-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const errorElement = document.querySelector("#auth-error");
    const button = form.querySelector('button[type="submit"]');
    const email = String(values.get("email") || "").trim();
    const password = String(values.get("password") || "");

    const minimumPasswordLength = signup ? 8 : 6;
    if (
      !/^\S+@\S+\.\S+$/.test(email) ||
      password.length < minimumPasswordLength
    ) {
      errorElement.textContent = `Enter a valid email and a password with at least ${minimumPasswordLength} characters.`;
      errorElement.classList.remove("hidden");
      return;
    }

    button.textContent = "Please wait…";
    button.disabled = true;
    const result = signup
      ? await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
      : await sb.auth.signInWithPassword({ email, password });

    if (result.error) {
      errorElement.textContent = result.error.message;
      errorElement.classList.remove("hidden");
      button.textContent = signup
        ? "Create account & send confirmation →"
        : "Sign in →";
      button.disabled = false;
      return;
    }

    if (signup && !result.data.session) {
      errorElement.textContent =
        "Account created. Open the confirmation email, then return here to sign in.";
      errorElement.classList.remove("hidden");
      button.textContent = "Create account & send confirmation →";
      button.disabled = false;
      return;
    }

    user = result.data.user;
    await boot();
  };
}

async function requestPasswordReset() {
  const email = String(
    new FormData(document.querySelector("#auth-form")).get("email") || "",
  ).trim();
  const errorElement = document.querySelector("#auth-error");
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    errorElement.textContent =
      "Enter your email address first, then request a reset link.";
    errorElement.classList.remove("hidden");
    return;
  }
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  errorElement.textContent = error
    ? error.message
    : "Password reset email sent. Open the link in that email to continue.";
  errorElement.classList.remove("hidden");
}

function showPasswordUpdate() {
  document.querySelector(".password-reset-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "modal password-reset-modal";
  modal.innerHTML = `
    <form class="modal-card" id="password-update-form">
      <p class="eyebrow">SECURE YOUR ACCOUNT</p>
      <h2>Choose a new password.</h2>
      <div class="field"><label>New password</label><input name="password" type="password" minlength="8" autocomplete="new-password" required></div>
      <p class="error hidden" id="password-update-error"></p>
      <div class="form-actions"><button type="button" class="cream" id="cancel-password-update">Cancel</button><button class="dark">Update password →</button></div>
    </form>`;
  document.body.append(modal);
  const closeModal = bindDismissibleModal(modal);
  modal.querySelector("#cancel-password-update").onclick = closeModal;
  modal.querySelector("#password-update-form").onsubmit = async (event) => {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") || "",
    );
    const errorElement = modal.querySelector("#password-update-error");
    if (password.length < 8) {
      errorElement.textContent = "Use at least 8 characters.";
      errorElement.classList.remove("hidden");
      return;
    }
    const { error } = await sb.auth.updateUser({ password });
    if (error) {
      errorElement.textContent = error.message;
      errorElement.classList.remove("hidden");
      return;
    }
    closeModal();
    window.history.replaceState({}, document.title, window.location.pathname);
    toast("Your password has been updated ✓");
  };
}

function shell() {
  app.innerHTML = `
    <div class="layout">
      <aside class="side">
        <div class="brand"><span>✦</span>Chef <em>Jarvis</em></div>
        <nav class="nav">
          <button data-view="home" class="active">⌂ &nbsp; Home</button>
          <button data-view="plan">✦ &nbsp; Plan</button>
          <button data-view="pantry">▦ &nbsp; Pantry</button>
          <button data-view="shopping">☑ &nbsp; Shopping</button>
          <button data-view="week">▤ &nbsp; Week</button>
          <button data-view="cook">◴ &nbsp; Cook</button>
          <button data-view="profile">◌ &nbsp; Profile</button>
        </nav>
        <div class="side-foot"><b>${esc(user.email)}</b><span>${esc(nutrition())}</span></div>
      </aside>
      <main class="content">
        <header class="top">
          <span class="date">${new Date().toLocaleDateString(window.I18n.code === "zh-TW" ? "zh-TW" : "en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
          <div class="account">${languageToggleMarkup()}<button class="signout" id="signout">Sign out</button><div class="avatar">${initials()}</div></div>
        </header>
        <section class="view active" id="home"></section>
        <section class="view" id="plan"></section>
        <section class="view" id="pantry"></section>
        <section class="view" id="shopping"></section>
        <section class="view" id="week"></section>
        <section class="view" id="cook"></section>
        <section class="view" id="profile"></section>
      </main>
    </div>`;

  bindLanguageToggle();
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = () => show(button.dataset.view);
  });
  document.querySelector("#signout").onclick = async () => {
    if (
      typeof activeRecipe !== "undefined" &&
      activeRecipe &&
      !(await confirmAction({
        title: "Sign out while cooking?",
        message:
          "Your cooking progress will stay saved on this device and return after you sign in again.",
        confirmLabel: "Sign out",
      }))
    )
      return;
    if (typeof persistCookingState === "function") persistCookingState();
    await releaseWakeLock();
    const { error } = await sb.auth.signOut();
    if (error) return toast(error.message);
    user = null;
    profile = null;
    authScreen();
  };

  renderHome();
  renderPlan();
  renderPantry();
  renderShoppingLists();
  renderWeeklyPlanner();
  restoreCookingState();
  renderCook();
  renderProfile();
}

function show(id) {
  document
    .querySelectorAll(".view")
    .forEach((view) => view.classList.toggle("active", view.id === id));
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view === id),
    );
  if (id === "shopping") renderShoppingLists();
  if (id === "week") renderWeeklyPlanner();
  if (id === "cook") requestWakeLock();
  else {
    releaseWakeLock();
    if (typeof stopVoiceControl === "function") stopVoiceControl();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHome() {
  document.querySelector("#home").innerHTML = `
    <div class="hero">
      <div class="hero-copy">
        <p class="eyebrow">YOUR KITCHEN, MADE EASIER</p>
        <h1>Good cooking,<br><em>made personal.</em></h1>
        <p class="lede">Tell Jarvis what you want to make. It will keep your pantry, preferences, allergies, and nutrition target in view.</p>
        <form class="ask" id="meal-form"><span>✦</span><input id="meal-input" required maxlength="500" placeholder="Tell Jarvis what you want to cook…"><button aria-label="Generate">→</button></form>
        <div class="chips"><button data-prompt-en="High-protein dinner for two" data-prompt-zh="兩人份高蛋白晚餐">High-protein dinner for 2</button><button data-prompt-en="Use my pantry ingredients first" data-prompt-zh="優先使用我的庫存食材">Use my pantry</button><button data-prompt-en="30-minute meal prep" data-prompt-zh="30 分鐘備餐">30-minute meal prep</button></div>
      </div>
      <article class="tonight"><div><small>YOUR DAILY TARGET</small><h2>${esc(nutrition())}</h2><p>${esc((profile?.body_composition_goal || "personalized").replace("_", " "))} plan · pantry and preferences applied</p><button class="cream" data-go="plan">Plan a meal →</button></div></article>
    </div>
    <div class="section-head"><div><p class="eyebrow">TODAY'S BALANCE</p><h2>Fuel your day well.</h2></div><button class="link" data-go="profile">Edit nutrition →</button></div>
    <div class="metrics daily-metrics" id="daily-metrics">
      <article class="metric"><b>—</b><span>Loading today’s intake…</span><p>USDA-backed meals appear here after cooking.</p></article>
    </div>`;

  renderDailyNutritionProgress();

  document
    .querySelectorAll("[data-go]")
    .forEach((element) => (element.onclick = () => show(element.dataset.go)));
  document.querySelectorAll("[data-prompt-en]").forEach(
    (element) =>
      (element.onclick = () => {
        document.querySelector("#meal-input").value =
          window.I18n.code === "zh-TW"
            ? element.dataset.promptZh
            : element.dataset.promptEn;
      }),
  );
  document.querySelector("#meal-form").onsubmit = async (event) => {
    event.preventDefault();
    const input = document.querySelector("#meal-input").value.trim();
    const button = event.currentTarget.querySelector("button");
    button.textContent = "◌";
    button.classList.add("busy");
    button.disabled = true;
    try {
      const plan = await generatePlan(input);
      renderPlan(plan);
      show("plan");
    } catch (error) {
      toast(error.message || "Jarvis could not create a plan right now.");
    } finally {
      button.textContent = "→";
      button.classList.remove("busy");
      button.disabled = false;
    }
  };
}

async function renderDailyNutritionProgress() {
  const root = document.querySelector("#daily-metrics");
  if (!root || !user) return;
  const { data, error } = await sb
    .from("nutrition_logs")
    .select("calories,protein_g,carbs_g,fat_g")
    .eq("user_id", user.id)
    .eq("eaten_on", localDateKey());
  if (root !== document.querySelector("#daily-metrics")) return;
  if (error) {
    root.innerHTML = `<article class="metric"><b>—</b><span>Today’s intake is unavailable</span><p>${esc(error.message)}</p></article>`;
    return;
  }
  const totals = (data || []).reduce(
    (sum, row) => ({
      kcal: sum.kcal + finiteNumber(row.calories, 0),
      protein: sum.protein + finiteNumber(row.protein_g, 0),
      carbs: sum.carbs + finiteNumber(row.carbs_g, 0),
      fat: sum.fat + finiteNumber(row.fat_g, 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const cards = [
    [
      window.I18n.code === "zh-TW" ? "熱量" : "kcal",
      totals.kcal,
      finiteNumber(profile?.calorie_target, 0),
      "kcal",
    ],
    [
      window.I18n.code === "zh-TW" ? "蛋白質" : "protein",
      totals.protein,
      finiteNumber(profile?.protein_g, 0),
      "g",
    ],
    [
      window.I18n.code === "zh-TW" ? "碳水化合物" : "carbs",
      totals.carbs,
      finiteNumber(profile?.carbs_g, 0),
      "g",
    ],
  ];
  root.innerHTML = cards
    .map(([label, consumed, target, unit], index) => {
      const percent = target > 0 ? Math.round((consumed / target) * 100) : 0;
      const clamped = Math.max(0, Math.min(percent, 100));
      return `<article class="metric progress-metric"><div class="progress-ring" style="--progress:${clamped * 3.6}deg"><b>${Math.round(consumed)}<small>${unit}</small></b></div><span>${label} · ${percent}%</span><p>${Math.round(consumed)} / ${Math.round(target)} ${unit}${index === 2 ? ` · ${Math.round(totals.fat)} g ${window.I18n.code === "zh-TW" ? "脂肪" : "fat"}` : ""}</p></article>`;
    })
    .join("");
}

async function renderPantry() {
  const panel = document.querySelector("#pantry");
  panel.innerHTML = `
    <div class="title"><div><p class="eyebrow">KITCHEN INVENTORY</p><h1>What’s in your<br><em>kitchen?</em></h1></div></div>
    <form class="add-row" id="pantry-form"><input name="item" required maxlength="120" placeholder="Add an ingredient, e.g. chicken breast"><button class="dark">Add ingredient</button></form>
    <div class="pantry-grid" id="pantry-list"><p>Loading your pantry…</p></div>`;
  const { data, error } = await sb
    .from("pantry_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const list = document.querySelector("#pantry-list");
  list.innerHTML = error
    ? `<p>${esc(error.message)}</p>`
    : data.length
      ? data
          .map(
            (item) =>
              `<article class="card pantry-item"><p class="eyebrow">${esc(item.storage_zone)}</p><h3>${esc(item.name)}</h3><p>${finiteNumber(item.quantity, "")} ${esc(item.unit || "")} · ${item.expires_on ? `Best by ${esc(item.expires_on)}` : "No expiry set"}</p></article>`,
          )
          .join("")
      : '<article class="card pantry-item"><h3>Your pantry is empty.</h3><p>Add what you have. Jarvis reads this list before creating every meal.</p></article>';

  document.querySelector("#pantry-form").onsubmit = async (event) => {
    event.preventDefault();
    const name = String(
      new FormData(event.currentTarget).get("item") || "",
    ).trim();
    if (!name) return;
    const { error: insertError } = await sb.from("pantry_items").insert({
      user_id: user.id,
      app_user_id: user.id,
      name,
      storage_zone: "fridge",
      source: "manual",
    });
    if (insertError) toast(insertError.message);
    else {
      event.currentTarget.reset();
      toast("Added to your pantry ✓");
      renderPantry();
    }
  };
}

function renderProfile() {
  const dietary = profile?.dietary_preferences || [];
  const allergies = profile?.allergies || [];
  const selectedEquipment = profile?.equipment || [];
  document.querySelector("#profile").innerHTML = `
    <div class="profile">
      <article class="profile-card">
        <p class="eyebrow">YOUR FOOD PROFILE</p><h1>Cooking that learns<br><em>you.</em></h1>
        <p>Jarvis uses your nutrition targets, health goal, allergies, pantry and food preferences before suggesting a meal or swap.</p>
        <div class="tags"><span>${esc(profile?.body_composition_goal || "Personal goal")}</span><span>${esc(nutrition())}</span>${dietary.map((value) => `<span>${esc(value)}</span>`).join("")}${allergies.map((value) => `<span>No ${esc(value)}</span>`).join("")}</div>
        <div class="profile-actions"><button class="dark" id="edit-profile">Edit my profile</button><button class="cream" id="saved-meals">Saved meal ideas</button></div>
      </article>
      <article class="card equipment-card">
        <p class="eyebrow">YOUR KITCHEN SETUP</p><h2>Devices Jarvis can use.</h2><p>Equipment selections control the alternatives Chef Mode may offer.</p>
        <form id="equipment-form" class="equipment-options">${equipmentChoices()
          .map(
            (item) =>
              `<label><input type="checkbox" value="${esc(item)}" ${selectedEquipment.includes(item) ? "checked" : ""}>${esc(item)}</label>`,
          )
          .join("")}<button class="dark">Save kitchen setup →</button></form>
      </article>
    </div>`;
  document.querySelector("#edit-profile").onclick = () => onboarding(true);
  document.querySelector("#saved-meals").onclick = showSaved;
  document.querySelector("#equipment-form").onsubmit = async (event) => {
    event.preventDefault();
    const equipment = [
      ...event.currentTarget.querySelectorAll("input:checked"),
    ].map((input) => input.value);
    const { error } = await sb
      .from("app_profiles")
      .update({ equipment, updated_at: new Date().toISOString() })
      .eq("app_user_id", user.id);
    if (error) toast(error.message);
    else {
      profile = { ...profile, equipment };
      toast("Kitchen setup saved ✓");
    }
  };
}

async function showSaved() {
  const { data, error } = await sb
    .from("saved_meal_cards")
    .select("*")
    .eq("app_user_id", user.id)
    .order("created_at", { ascending: false });
  const items = error
    ? `<p>${esc(error.message)}</p>`
    : data.length
      ? data
          .map(
            (item) =>
              `<article class="card pantry-item"><p class="eyebrow">NEXT WEEK</p><h3>${esc(item.title)}</h3><p>${esc((item.uses || []).join(" · "))}</p>${item.kcal == null ? "" : `<small>${finiteNumber(item.kcal, "—")} kcal · ${finiteNumber(item.protein, "—")}g protein</small>`}</article>`,
          )
          .join("")
      : "<p>No saved meal ideas yet — save one in Plan.</p>";
  document.querySelector("#profile").innerHTML =
    `<div class="profile"><div class="title"><div><p class="eyebrow">YOUR FOLDER</p><h1>Saved meal<br><em>ideas.</em></h1></div><button class="dark" id="back-profile">Back to profile</button></div><div class="pantry-grid">${items}</div></div>`;
  document.querySelector("#back-profile").onclick = renderProfile;
}

function equipmentChoices() {
  return [
    "Stovetop",
    "Oven",
    "Air fryer",
    "Microwave",
    "Rice cooker",
    "Instant Pot",
    "Blender",
  ];
}

function onboarding(edit = false) {
  const saved = profile || {};
  const dietary = saved.dietary_preferences || [];
  const allergies = saved.allergies || [];
  const dislikes = saved.dislikes || [];
  const equipment = saved.equipment || [];
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <form class="modal-card" id="profile-form">
      <p class="eyebrow">${edit ? "UPDATE YOUR PROFILE" : "WELCOME TO CHEF JARVIS"}</p>
      <h2 class="onboard-title">First, let’s cook for <em>you.</em></h2>
      <p class="onboard-sub">Set your body data and food needs once. Jarvis will use them for every future recipe, substitution and meal plan.</p>
      <div class="form-grid">
        <div class="field"><label>Height (cm)</label><input name="height" type="number" min="100" max="250" required value="${finiteNumber(saved.height_cm, "")}"></div>
        <div class="field"><label>Weight (kg)</label><input name="weight" type="number" min="30" max="350" required value="${finiteNumber(saved.weight_kg, "")}"></div>
        <div class="field"><label>Age</label><input name="age" type="number" min="13" max="120" required value="${finiteNumber(saved.age, "")}"></div>
        <div class="field"><label>Sex (for estimate)</label><select name="sex"><option value="female">Female</option><option value="male" ${saved.biological_sex === "male" ? "selected" : ""}>Male</option></select></div>
        <div class="field"><label>Activity</label><select name="activity"><option value="low">Low activity</option><option value="moderate" ${saved.activity_level === "moderate" ? "selected" : ""}>Moderate</option><option value="high" ${saved.activity_level === "high" ? "selected" : ""}>High</option></select></div>
        <div class="field"><label>Target method</label><select name="mode"><option value="calculated">Calculate for me</option><option value="custom" ${saved.mode === "custom" ? "selected" : ""}>I’ll enter my own</option></select></div>
      </div>
      <p class="eyebrow">BODY GOAL</p>
      <div class="choice-grid">${[
        ["fat_loss", "Lose fat"],
        ["muscle_gain", "Build muscle"],
        ["recomposition", "Build muscle + lose fat"],
        ["maintain", "Maintain"],
      ]
        .map(
          ([value, label]) =>
            `<label><input type="radio" name="goal" value="${value}" ${(saved.body_composition_goal || "recomposition") === value ? "checked" : ""}>${label}</label>`,
        )
        .join("")}</div>
      <div class="form-grid" id="custom-macros">
        <div class="field"><label>Calories</label><input name="kcal" type="number" min="800" max="6000" value="${finiteNumber(saved.calorie_target, "")}"></div>
        <div class="field"><label>Protein (g)</label><input name="protein" type="number" min="0" max="500" value="${finiteNumber(saved.protein_g, "")}"></div>
        <div class="field"><label>Carbs (g)</label><input name="carbs" type="number" min="0" max="1000" value="${finiteNumber(saved.carbs_g, "")}"></div>
        <div class="field"><label>Fat (g)</label><input name="fat" type="number" min="0" max="400" value="${finiteNumber(saved.fat_g, "")}"></div>
      </div>
      <p class="eyebrow">DIET & SAFETY</p>
      <div class="choice-grid">${["Vegetarian", "Vegan", "Halal", "Lactose intolerant", "Gluten-free", "Nut allergy", "Shellfish allergy"].map((value) => `<label><input type="checkbox" name="needs" value="${value}" ${dietary.includes(value) || allergies.includes(value) ? "checked" : ""}>${value}</label>`).join("")}</div>
      <div class="field"><label>Foods you dislike (comma separated)</label><input name="dislikes" value="${esc(dislikes.join(", "))}" placeholder="e.g. cilantro, mushrooms"></div>
      <p class="eyebrow">KITCHEN SETUP</p>
      <div class="choice-grid">${equipmentChoices()
        .map(
          (value) =>
            `<label><input type="checkbox" name="equipment" value="${esc(value)}" ${equipment.includes(value) ? "checked" : ""}>${esc(value)}</label>`,
        )
        .join("")}</div>
      <p class="error hidden" id="profile-error"></p>
      <div class="form-actions">${edit ? '<button type="button" class="cream" id="cancel-profile">Cancel</button>' : ""}<button class="dark">Save my cooking profile →</button></div>
    </form>`;
  document.body.append(modal);

  const closeModal = edit ? bindDismissibleModal(modal) : () => modal.remove();

  const form = modal.querySelector("#profile-form");
  const toggleCustom = () =>
    modal
      .querySelector("#custom-macros")
      .classList.toggle("hidden", form.mode.value !== "custom");
  form.mode.onchange = toggleCustom;
  toggleCustom();
  modal.querySelector("#cancel-profile")?.addEventListener("click", closeModal);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const values = Object.fromEntries(formData);
    let targets;
    try {
      targets = calculateTarget(values);
    } catch (error) {
      modal.querySelector("#profile-error").textContent = error.message;
      modal.querySelector("#profile-error").classList.remove("hidden");
      return;
    }
    const needs = formData.getAll("needs").map(String);
    const payload = {
      app_user_id: user.id,
      mode: values.mode,
      height_cm: Number(values.height),
      weight_kg: Number(values.weight),
      age: Number(values.age),
      biological_sex: values.sex,
      activity_level: values.activity,
      goal: values.goal,
      body_composition_goal: values.goal,
      calorie_target: targets.kcal,
      protein_g: targets.protein,
      carbs_g: targets.carbs,
      fat_g: targets.fat,
      onboarding_completed: true,
      dietary_preferences: needs.filter((value) => !value.includes("allergy")),
      allergies: needs.filter((value) => value.includes("allergy")),
      dislikes: String(values.dislikes || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      equipment: formData.getAll("equipment").map(String),
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb
      .from("app_profiles")
      .upsert(payload, { onConflict: "app_user_id" });
    if (error) {
      toast(error.message);
      return;
    }
    profile = payload;
    closeModal();
    shell();
    toast("Your personal food profile is ready ✓");
  };
}

async function boot() {
  const result = await sb
    .from("app_profiles")
    .select("*")
    .eq("app_user_id", user.id)
    .maybeSingle();
  profile = result.data || null;
  shell();
  const restoredDraft =
    typeof restoreRecentDraftPlan === "function" &&
    (await restoreRecentDraftPlan());
  if (restoredDraft) show("plan");
  if (!profile?.onboarding_completed) onboarding();
}

async function startApp() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    authScreen();
    return;
  }
  user = session.user;
  await boot();
}

sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") showPasswordUpdate();
  if (!session && user) {
    user = null;
    profile = null;
    authScreen();
  }
});
