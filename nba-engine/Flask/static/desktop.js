(function () {
  const api = window.desktopAPI?.windowControls;
  if (!api) return;

  const maxBtn = document.querySelector('.dtb-btn[data-action="maximize"]');

  document.querySelectorAll(".dtb-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      if (action === "minimize") api.minimize();
      if (action === "maximize") api.maximize();
      if (action === "close") api.close();
    });
  });

  const syncMax = async () => {
    if (!maxBtn) return;
    const maxed = await api.isMaximized();
    maxBtn.textContent = maxed ? "\u2750" : "\u9633";
  };

  syncMax();
  api.onMaximizeChanged?.((maximized) => {
    if (maxBtn) maxBtn.textContent = maximized ? "\u2750" : "\u9633";
  });
})();
