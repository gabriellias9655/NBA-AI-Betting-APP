const api = window.desktopAPI?.windowControls;
if (!api) {
  document.querySelector(".titlebar")?.classList.add("titlebar-hidden");
} else {
  const btnMin = document.getElementById("tbMin");
  const btnMax = document.getElementById("tbMax");
  const btnClose = document.getElementById("tbClose");

  btnMin?.addEventListener("click", () => api.minimize());
  btnMax?.addEventListener("click", () => api.maximize());
  btnClose?.addEventListener("click", () => api.close());

  const syncMaxIcon = async () => {
    const maxed = await api.isMaximized();
    if (btnMax) btnMax.textContent = maxed ? "\u2750" : "\u9633";
  };

  syncMaxIcon();
  api.onMaximizeChanged?.((maximized) => {
    if (btnMax) btnMax.textContent = maximized ? "\u2750" : "\u9633";
  });
}
