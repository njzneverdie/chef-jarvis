// Chef Mode: a focused, hands-on cooking workspace for one active recipe.
const baseRenderPlanChefMode = window.renderPlan;
const baseRenderProfileChefMode = window.renderProfile;
const baseOnboardingChefMode = window.onboarding;
let chefEquipmentAdaptations = [];
let activeRecipeId = null;

function sayInstruction(text) {
  if (!('speechSynthesis' in window)) return toast(text);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function chefRenderPlan(query) {
  chefEquipmentAdaptations = typeof query === 'object' ? (query.equipment_adaptations || []) : [];
  baseRenderPlanChefMode(query);
  if (typeof query !== 'object') {
    renderSavedPlans();
    return;
  }
  activeRecipeId = query.saved_recipe_id || null;
  renderMealEstimate(query);
  renderPlanPersistenceControls(query);
  const ingredients = typeof query === 'object' && Array.isArray(query.ingredients) ? query.ingredients : [];
  const photo = document.querySelector('#plan .recipe-photo');
  if (photo) {
    photo.classList.add('dish-visual');
    photo.style.backgroundImage = 'none';
    photo.innerHTML = `<div><span>YOUR DISH</span><b>${esc(typeof query === 'object' ? query.title : String(query || 'Chef Jarvis meal'))}</b><small>Ingredients and cooking steps below</small></div>`;
  }
  if (ingredients.length) {
    renderShoppingChecklist(typeof query === 'object' ? query.title : 'Chef Jarvis meal', ingredients);
    renderPersonalizedSwaps(query, ingredients);
    renderUsdaReference(ingredients);
  }
  if (typeof query === 'object' && query.fallback) {
    const notice = document.createElement('p');
    notice.className = 'chef-fallback-note';
    notice.textContent = 'Gemini is temporarily busy, so Jarvis prepared a stable guided workflow. Please verify exact ingredient quantities before cooking.';
    document.querySelector('#plan .planner').insertAdjacentElement('afterend', notice);
  }
  if (!chefEquipmentAdaptations.length) return;
  const panel = document.createElement('article');
  panel.className = 'reuse card chef-adaptations';
  panel.innerHTML = `<p class="eyebrow">DEVICE ALTERNATIVES</p><h2>Made for your kitchen setup.</h2><p>These swaps use the equipment saved in your profile.</p><div class="adaptation-grid">${chefEquipmentAdaptations.slice(0, 3).map(item => `<article><b>${esc(item.original)} → ${esc(item.alternative)}</b><p>${esc(item.instructions)}</p><small>${esc(item.why || '')}</small></article>`).join('')}</div>`;
  document.querySelector('#plan').append(panel);
}

function renderMealEstimate(query) {
  const macro = document.querySelector('#plan .macros');
  if (!macro) return;
  const labels = macro.querySelectorAll('small');
  ['est. kcal · whole meal', 'est. protein · whole meal', 'est. carbs · whole meal', 'est. fat · whole meal'].forEach((label, index) => { if (labels[index]) labels[index].textContent = label; });
  const note = document.createElement('p');
  note.className = 'meal-estimate-note';
  note.innerHTML = `<b>Meal estimate</b> · Whole recipe (${query.servings || 2} servings). Generated from recipe portions; adjust it after choosing swaps or changing quantities.`;
  macro.insertAdjacentElement('afterend', note);
}

function renderPlanPersistenceControls(query) {
  const title = document.querySelector('#plan .title');
  if (!title || !activeRecipeId) return;
  const controls = document.createElement('div');
  controls.className = 'plan-persistence-controls';
  controls.innerHTML = `<span>Saved to your recipes</span><button class="cream" id="cook-later">Cook later ✓</button>`;
  title.append(controls);
  controls.querySelector('#cook-later').onclick = () => {
    controls.querySelector('#cook-later').textContent = 'Saved for later ✓';
    toast('This meal is saved. Find it under Recent plans whenever you are ready to cook.');
  };
  const start = document.querySelector('#start-guided-cook');
  if (start) start.onclick = () => {
    activeRecipe = { title: query.title, ingredients: query.ingredients || [], steps: query.steps || fallbackCookingSteps, equipment_adaptations: query.equipment_adaptations || [], substitutions: query.substitutions || [], saved_recipe_id: activeRecipeId };
    cookingStepIndex = 0;
    timers = [];
    renderCook();
    show('cook');
  };
}

function planFromSavedRow(row) {
  const recipe = row.recipe || {};
  const nutrition = row.nutrition?.estimate || row.nutrition || {};
  return { ...recipe, title: row.title, minutes: row.minutes || recipe.minutes, servings: row.servings || recipe.servings || 2, kcal: nutrition.kcal ?? recipe.kcal, protein_g: nutrition.protein_g ?? recipe.protein_g, carbs_g: nutrition.carbs_g ?? recipe.carbs_g, fat_g: nutrition.fat_g ?? recipe.fat_g, userRequest: recipe.userRequest || row.title, saved_recipe_id: row.id };
}

async function renderSavedPlans() {
  const root = document.querySelector('#plan');
  if (!root || !user) return;
  const { data, error } = await sb.from('recipes').select('id,title,servings,minutes,recipe,nutrition,created_at').eq('user_id', user.id).eq('is_saved', true).order('updated_at', { ascending: false }).limit(6);
  if (error || !data?.length) return;
  const card = document.createElement('article');
  card.className = 'card recent-plans';
  card.innerHTML = `<div><p class="eyebrow">YOUR SAVED COOKING PLANS</p><h2>Pick up where you left off.</h2><p>Generated meals stay here after switching tabs or refreshing the page.</p></div><div class="recent-plan-list">${data.map((row, index) => `<article><div><b>${esc(row.title)}</b><small>${row.minutes || 30} min · ${row.servings || 2} servings · saved ${new Date(row.created_at).toLocaleDateString()}</small></div><button class="dark" data-resume-plan="${index}">Open plan →</button></article>`).join('')}</div>`;
  root.append(card);
  card.querySelectorAll('[data-resume-plan]').forEach(button => button.onclick = () => chefRenderPlan(planFromSavedRow(data[Number(button.dataset.resumePlan)])));
}

function renderPersonalizedSwaps(query, ingredients) {
  const dietary = profile?.dietary_preferences || [];
  const allergies = profile?.allergies || [];
  const dislikes = profile?.dislikes || [];
  const goal = profile?.body_composition_goal || 'maintain';
  const has = value => [...dietary, ...allergies, ...dislikes].some(item => String(item).toLowerCase().includes(value));
  const aiSwaps = Array.isArray(query?.substitutions) ? query.substitutions.filter(item => item?.from && item?.to) : [];
  const defaultSwaps = [];
  if (has('lactose')) defaultSwaps.push({ from: 'Milk, cream, or regular yogurt', to: 'Lactose-free Greek yogurt or unsweetened soy yogurt', reason: 'Keeps the sauce creamy while respecting lactose intolerance.' });
  if (has('gluten')) defaultSwaps.push({ from: 'Regular soy sauce or wheat noodles', to: 'Gluten-free tamari or rice noodles', reason: 'Maintains a similar savory profile without gluten.' });
  if (has('nut')) defaultSwaps.push({ from: 'Peanuts, cashews, or nut garnish', to: 'Roasted chickpeas or pumpkin seeds', reason: 'Adds crunch without using nuts.' });
  if (has('shellfish')) defaultSwaps.push({ from: 'Shrimp or shellfish', to: 'Chicken breast, tofu, or extra vegetables', reason: 'Preserves the cooking method while avoiding shellfish.' });
  if ((goal === 'fat_loss' || goal === 'recomposition') && !has('vegan')) defaultSwaps.push({ from: 'Chicken thigh, fatty mince, or a heavy sauce', to: 'Chicken breast, 95% lean turkey, and a lighter sauce', reason: 'Raises protein density and lowers calories for recomposition.' });
  if (goal === 'muscle_gain' || goal === 'recomposition') defaultSwaps.push({ from: 'A small protein portion', to: 'An extra 100–150 g lean protein or a plant-protein equivalent', reason: 'Helps the meal better support your protein target.' });
  if (!defaultSwaps.length) defaultSwaps.push({ from: 'Extra cooking oil or butter', to: 'A non-stick pan, cooking spray, or measured 1 tsp oil', reason: 'Keeps flavor while making calories easier to manage.' });
  const swaps = [...aiSwaps, ...defaultSwaps].filter((swap, index, all) => all.findIndex(item => item.from === swap.from) === index).slice(0, 4);
  const card = document.createElement('article');
  card.className = 'card personalized-swaps';
  card.innerHTML = `<div class="swaps-heading"><div><p class="eyebrow">PERSONALIZED HEALTHY SWAPS</p><h2>Make this meal work for <em>you.</em></h2><p>${goal === 'recomposition' ? 'Optimized for building muscle while reducing unnecessary calories.' : 'These swaps are matched to your saved health and food profile.'}</p></div><span class="swap-badge">Profile applied ✓</span></div><div class="swap-grid">${swaps.map((swap, index) => `<article><small>SWAP ${index + 1}</small><b>${esc(swap.from)}</b><i>→</i><strong>${esc(swap.to)}</strong><p>${esc(swap.reason || 'A profile-safe alternative for this meal.')}</p><button class="cream" data-apply-swap="${index}">Use this swap</button></article>`).join('')}</div><p class="swap-note">Jarvis avoids your saved allergies and dietary restrictions. Check packaged ingredients when allergies are severe.</p>`;
  const checklist = document.querySelector('#plan .shopping-checklist');
  (checklist || document.querySelector('#plan .guided-preview') || document.querySelector('#plan')).insertAdjacentElement(checklist ? 'afterend' : 'beforebegin', card);
  card.querySelectorAll('[data-apply-swap]').forEach(button => button.onclick = () => {
    const swap = swaps[Number(button.dataset.applySwap)];
    button.textContent = 'Swap selected ✓';
    button.disabled = true;
    if (activeRecipe) activeRecipe.substitutions = [...(activeRecipe.substitutions || []), swap];
    toast(`${swap.to} selected for this meal`);
  });
}

function renderShoppingChecklist(title, ingredients) {
  const card = document.createElement('article');
  card.className = 'card shopping-checklist';
  card.innerHTML = `<div class="shopping-head"><div><p class="eyebrow">SMART GROCERY LIST</p><h2>What do you need to buy?</h2><p>Select the ingredients you still need. Quantities stay visible while you shop.</p></div><button class="dark" id="save-shopping-list">Save selected items →</button></div><div class="shopping-items">${ingredients.map((item, index) => `<label><input type="checkbox" data-shopping-item="${index}" checked><span class="shopping-box">✓</span><b>${esc(item.name || 'Ingredient')}</b><small>${esc(item.amount || '')}</small></label>`).join('')}</div><p class="shopping-status" id="shopping-status">${ingredients.length} items selected</p>`;
  const preview = document.querySelector('#plan .guided-preview');
  (preview || document.querySelector('#plan')).insertAdjacentElement(preview ? 'beforebegin' : 'beforeend', card);
  const updateStatus = () => { const count = card.querySelectorAll('[data-shopping-item]:checked').length; card.querySelector('#shopping-status').textContent = `${count} item${count === 1 ? '' : 's'} selected`; };
  card.querySelectorAll('[data-shopping-item]').forEach(input => input.onchange = updateStatus);
  card.querySelector('#save-shopping-list').onclick = async () => {
    const selected = [...card.querySelectorAll('[data-shopping-item]:checked')].map(input => ingredients[Number(input.dataset.shoppingItem)]);
    if (!selected.length) return toast('Select at least one grocery item first.');
    const button = card.querySelector('#save-shopping-list');
    button.disabled = true;
    button.textContent = 'Saving…';
    const { data: list, error: listError } = await sb.from('shopping_lists').insert({ user_id: user.id, app_user_id: user.id, title: `Shopping · ${title}`.slice(0, 120), status: 'active' }).select('id').single();
    if (listError) { button.disabled = false; button.textContent = 'Save selected items →'; return toast(listError.message); }
    const rows = selected.map(item => {
      const match = String(item.amount || '').match(/^([0-9.]+)\s*(.*)$/);
      return { shopping_list_id: list.id, ingredient: item.name || 'Ingredient', quantity: match ? Number(match[1]) : null, unit: match?.[2] || null, category: 'grocery', is_checked: false };
    });
    const { error: itemError } = await sb.from('shopping_list_items').insert(rows);
    if (itemError) { button.disabled = false; button.textContent = 'Save selected items →'; return toast(itemError.message); }
    button.textContent = 'Saved to your grocery list ✓';
    toast('Your grocery checklist is saved ✓');
  };
}

async function renderUsdaReference(ingredients) {
  const card = document.createElement('article');
  card.className = 'card usda-reference';
  card.innerHTML = '<p class="eyebrow">USDA FOODDATA CENTRAL</p><h2>Verifying ingredient nutrition…</h2><p>Jarvis is matching your ingredient list to USDA reference foods in the background.</p>';
  const checklist = document.querySelector('#plan .shopping-checklist');
  (checklist || document.querySelector('#plan')).insertAdjacentElement('afterend', card);
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Session expired');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/chef-usda-nutrition`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ ingredients }) });
    if (!response.ok) throw new Error('USDA lookup unavailable');
    const data = await response.json();
    const foods = (data.foods || []).filter(food => food.found);
    if (!foods.length) throw new Error('No USDA matches found');
    card.innerHTML = `<p class="eyebrow">USDA FOODDATA CENTRAL · INGREDIENT REFERENCE</p><h2>Per-100 g ingredient data.</h2><p>This is not your meal total. The card above is a whole-recipe estimate; these values are independent USDA reference matches for individual ingredients.</p><div class="usda-grid">${foods.slice(0, 8).map(food => `<div><b>${esc(food.ingredient)}</b><span>${food.per100g.kcal ?? '—'} kcal / 100 g</span><small>P ${food.per100g.protein_g ?? '—'}g · C ${food.per100g.carbs_g ?? '—'}g · F ${food.per100g.fat_g ?? '—'}g</small></div>`).join('')}</div>`;
  } catch {
    card.innerHTML = '<p class="eyebrow">USDA FOODDATA CENTRAL</p><h2>Reference lookup is taking longer.</h2><p>Your plan and grocery list are ready. Try again later to refresh USDA ingredient references.</p>';
  }
}

async function generatePlan(request) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/chef-meal-plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ request, profile }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Jarvis could not create a plan.');
  const plan = { ...data.plan, userRequest: request };
  try {
    const { data: saved, error } = await sb.from('recipes').insert({ user_id: user.id, app_user_id: user.id, title: plan.title || request.slice(0, 160), servings: plan.servings || 2, minutes: plan.minutes || null, recipe: plan, nutrition: { estimate: { kcal: plan.kcal ?? null, protein_g: plan.protein_g ?? null, carbs_g: plan.carbs_g ?? null, fat_g: plan.fat_g ?? null, basis: 'AI recipe estimate for the whole recipe' } }, adaptations: plan.substitutions || [], is_saved: true }).select('id').single();
    if (error) throw error;
    plan.saved_recipe_id = saved.id;
  } catch (error) {
    console.warn('Could not save meal plan', error);
    toast('Your plan is ready, but it could not be saved yet.');
  }
  return plan;
}

function renderCook() {
  const recipe = activeRecipe || { title: 'Your guided meal', ingredients: [], steps: fallbackCookingSteps, equipment_adaptations: chefEquipmentAdaptations };
  const steps = recipe.steps?.length ? recipe.steps : fallbackCookingSteps;
  const adaptations = recipe.equipment_adaptations?.length ? recipe.equipment_adaptations : chefEquipmentAdaptations;
  cookingStepIndex = Math.max(0, Math.min(cookingStepIndex, steps.length - 1));
  if (!timers.length) timers = steps.slice(0, 3).map((step, index) => ({ name: `Step ${index + 1}: ${step.slice(0, 34)}${step.length > 34 ? '…' : ''}`, sec: [300, 480, 300][index] || 300, duration: [300, 480, 300][index] || 300, mode: 'countdown', running: false }));
  const current = steps[cookingStepIndex];
  document.querySelector('#cook').innerHTML = `<div class="chef-mode-heading"><div><p class="eyebrow">CHEF MODE · ACTIVE RECIPE</p><h1>${esc(recipe.title)}<br><em>cook with Jarvis.</em></h1></div><button class="cream" id="chef-read">🔊 Read current step</button></div>
    <div class="chef-mode-grid"><section class="chef-guide"><div class="chef-step-counter"><span>STEP ${cookingStepIndex + 1} / ${steps.length}</span><div>${steps.map((_, index) => `<i class="${index < cookingStepIndex ? 'done' : index === cookingStepIndex ? 'now' : ''}"></i>`).join('')}</div></div><article class="current-step chef-current"><span>DO THIS NOW</span><h2>${esc(current)}</h2><p>Keep the timers running while you work. Mark the step done only when the task is actually complete.</p></article><div class="guide-actions"><button class="cream" id="previous-step" ${cookingStepIndex === 0 ? 'disabled' : ''}>← Previous</button><button class="cream" id="repeat-step">↻ Repeat</button><button class="dark" id="complete-step">${cookingStepIndex === steps.length - 1 ? 'Finish dish ✓' : 'Complete step →'}</button></div><div class="chef-queue"><p class="eyebrow">RECIPE QUEUE</p>${steps.map((step, index) => `<button class="${index === cookingStepIndex ? 'current' : index < cookingStepIndex ? 'done' : ''}" data-jump-step="${index}"><b>${index < cookingStepIndex ? '✓' : index + 1}</b><span>${esc(step)}</span></button>`).join('')}</div>${adaptations.length ? `<div class="chef-adaptation-inline"><p class="eyebrow">YOUR EQUIPMENT OPTION</p>${adaptations.slice(0, 2).map(item => `<div><b>${esc(item.original)} → ${esc(item.alternative)}</b><p>${esc(item.instructions)}</p></div>`).join('')}</div>` : ''}</section>
      <aside class="timers chef-timers"><div class="timer-head"><div><p class="eyebrow">PARALLEL TASKS</p><h2>Kitchen clocks</h2></div><button class="dark" id="add-timer">＋ Add clock</button></div><p class="timer-note">Countdowns and stopwatches are independent. Start only the tasks you are actively doing.</p><div class="timer-list" id="timer-list"></div></aside></div>`;
  document.querySelector('#chef-read').onclick = () => sayInstruction(current);
  document.querySelector('#previous-step').onclick = () => { cookingStepIndex--; renderCook(); };
  document.querySelector('#repeat-step').onclick = () => sayInstruction(current);
  document.querySelector('#complete-step').onclick = () => { if (cookingStepIndex < steps.length - 1) { cookingStepIndex++; renderCook(); } else { toast('Dish completed — great cooking! ✓'); sayInstruction('Dish completed. Great cooking.'); } };
  document.querySelectorAll('[data-jump-step]').forEach(button => button.onclick = () => { cookingStepIndex = Number(button.dataset.jumpStep); renderCook(); });
  document.querySelector('#add-timer').onclick = openClockModal;
  renderTimerList();
}

function openClockModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<form class="modal-card clock-modal" id="clock-form"><p class="eyebrow">ADD A KITCHEN CLOCK</p><h2>Track another task.</h2><div class="form-grid"><div class="field"><label>Task name</label><input name="name" required maxlength="70" placeholder="e.g. Rice resting"></div><div class="field"><label>Clock type</label><select name="mode"><option value="countdown">Countdown</option><option value="stopwatch">Stopwatch</option></select></div><div class="field" id="clock-minutes"><label>Minutes</label><input name="minutes" type="number" min="1" max="240" value="5"></div></div><div class="form-actions"><button type="button" class="cream" id="close-clock">Cancel</button><button class="dark">Add clock →</button></div></form>`;
  document.body.append(modal);
  const form = modal.querySelector('#clock-form');
  form.mode.onchange = () => modal.querySelector('#clock-minutes').classList.toggle('hidden', form.mode.value === 'stopwatch');
  modal.querySelector('#close-clock').onclick = () => modal.remove();
  form.onsubmit = event => { event.preventDefault(); const data = new FormData(form); const mode = data.get('mode'); const seconds = mode === 'countdown' ? Math.round(Number(data.get('minutes')) * 60) : 0; timers.push({ name: String(data.get('name')).trim(), sec: seconds, duration: seconds, mode, running: false }); modal.remove(); renderTimerList(); };
}

function renderTimerList() {
  const list = document.querySelector('#timer-list');
  if (!list) return;
  list.innerHTML = timers.map((timer, index) => { const display = `${String(Math.floor(timer.sec / 60)).padStart(2, '0')}:${String(timer.sec % 60).padStart(2, '0')}`; return `<article class="timer chef-timer"><span><i>${timer.mode === 'stopwatch' ? '◷' : '◴'}</i>${esc(timer.name)}<small>${timer.mode === 'stopwatch' ? 'Stopwatch' : 'Countdown'}</small></span><b>${display}</b><div class="timer-actions"><button data-start="${index}">${timer.running ? 'Pause' : 'Start'}</button><button data-reset="${index}">Reset</button><button class="timer-remove" data-remove="${index}" aria-label="Remove clock">×</button></div></article>`; }).join('');
  document.querySelectorAll('[data-start]').forEach(button => button.onclick = () => { const timer = timers[Number(button.dataset.start)]; if (timer.mode === 'countdown' && timer.sec === 0) timer.sec = timer.duration || 300; timer.running = !timer.running; renderTimerList(); });
  document.querySelectorAll('[data-reset]').forEach(button => button.onclick = () => { const timer = timers[Number(button.dataset.reset)]; timer.sec = timer.mode === 'countdown' ? timer.duration || 300 : 0; timer.running = false; renderTimerList(); });
  document.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { timers.splice(Number(button.dataset.remove), 1); renderTimerList(); });
}

setInterval(() => { let changed = false; timers.forEach(timer => { if (timer.running && timer.mode === 'stopwatch') { timer.sec++; changed = true; } }); if (changed) renderTimerList(); }, 1000);

function chefRenderProfile() {
  baseRenderProfileChefMode();
  const profileRoot = document.querySelector('#profile .profile');
  if (!profileRoot || !profileRoot.querySelector('.profile-card')) return;
  const selected = profile?.equipment || [];
  const panel = document.createElement('article');
  panel.className = 'card equipment-card';
  panel.innerHTML = `<p class="eyebrow">YOUR KITCHEN SETUP</p><h2>Devices Jarvis can use.</h2><p>Equipment selections control the alternatives Chef Mode may offer.</p><form id="equipment-form" class="equipment-options">${['Stovetop', 'Oven', 'Air fryer', 'Microwave', 'Rice cooker', 'Instant Pot', 'Blender'].map(item => `<label><input type="checkbox" value="${item}" ${selected.includes(item) ? 'checked' : ''}>${item}</label>`).join('')}<button class="dark">Save kitchen setup →</button></form>`;
  profileRoot.append(panel);
  panel.querySelector('#equipment-form').onsubmit = async event => { event.preventDefault(); const equipment = [...panel.querySelectorAll('input:checked')].map(input => input.value); const { error } = await sb.from('app_profiles').update({ equipment, updated_at: new Date().toISOString() }).eq('app_user_id', user.id); if (error) return toast(error.message); profile = { ...profile, equipment }; toast('Kitchen setup saved ✓'); chefRenderProfile(); };
}

function chefOnboarding(edit = false) {
  baseOnboardingChefMode(edit);
  const form = document.querySelector('#profile-form');
  if (!form) return;
  const current = profile?.equipment || [];
  const section = document.createElement('div');
  section.className = 'chef-onboarding-equipment';
  section.innerHTML = `<p class="eyebrow">KITCHEN SETUP</p><div class="choice-grid">${['Stovetop', 'Oven', 'Air fryer', 'Microwave', 'Rice cooker', 'Instant Pot', 'Blender'].map(item => `<label><input type="checkbox" name="equipment" value="${item}" ${current.includes(item) ? 'checked' : ''}>${item}</label>`).join('')}</div>`;
  form.querySelector('.form-actions').insertAdjacentElement('beforebegin', section);
  form.addEventListener('submit', () => { const equipment = [...form.querySelectorAll('[name="equipment"]:checked')].map(input => input.value); sb.from('app_profiles').upsert({ app_user_id: user.id, equipment, updated_at: new Date().toISOString() }, { onConflict: 'app_user_id' }).then(({ error }) => { if (!error) profile = { ...profile, equipment }; }); }, true);
}

window.renderPlan = chefRenderPlan;
window.renderProfile = chefRenderProfile;
window.onboarding = chefOnboarding;

setTimeout(() => { if (user) shell(); }, 0);
