const APP_VERSION = "20260723-multi-dish-menu-2";
const SUPABASE_INTEGRITY =
  "sha384-Fntl9b+IRzm2GKZK0c129fQFknWsn8pyxDejLO4wwds1LF9DSob2K2QXlfw8EIXn";
const SUPABASE_BUNDLE = "/vendor/supabase-2.110.5.min.js";

function loadScript(src, integrity = "") {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    if (integrity) script.integrity = integrity;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.body.append(script);
  });
}

function showStartupError() {
  const app = document.querySelector("#app");
  if (!app) return;
  app.className = "empty-page";
  app.innerHTML =
    '<section class="empty-card"><p class="eyebrow">CONNECTION ERROR</p><h1>Chef Jarvis could not start.</h1><p>Check your connection and try again.<br>Chef Jarvis 無法啟動，請檢查網路後重試。</p><button class="btn primary" type="button" id="retry-startup">Try again / 再試一次</button></section>';
  document.querySelector("#retry-startup")?.addEventListener("click", () =>
    location.reload(),
  );
}

async function boot() {
  try {
    await loadScript(SUPABASE_BUNDLE, SUPABASE_INTEGRITY);
  } catch (error) {
    console.warn("Supabase client source failed", {
      source: SUPABASE_BUNDLE,
      error,
    });
  }
  if (!window.supabase?.createClient) {
    showStartupError();
    return;
  }
  try {
    await loadScript(`/app.js?v=${APP_VERSION}`);
    await loadScript(`/chef-mode.js?v=${APP_VERSION}`);
  } catch (error) {
    console.error("Chef Jarvis startup failed", error);
    showStartupError();
  }
}

void boot();
