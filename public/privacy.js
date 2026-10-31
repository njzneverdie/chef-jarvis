(function bindPrivacyLanguageToggle() {
  const button = document.querySelector("#language-toggle");
  if (!button || !window.I18n) return;

  const render = () => {
    const visibleLabel = `文/A · ${window.I18n.toggleLabel()}`;
    const actionLabel = window.I18n.translate("Switch language");
    button.textContent = visibleLabel;
    button.setAttribute("aria-label", `${visibleLabel} — ${actionLabel}`);
  };

  render();
  button.addEventListener("click", () => {
    window.I18n.setLanguage(
      window.I18n.code === "zh-TW" ? "en" : "zh-TW",
    );
    location.reload();
  });
})();
