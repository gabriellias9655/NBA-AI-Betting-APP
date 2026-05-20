const $ = (id) => document.getElementById(id);

const statusEl = $("status");
const progressWrap = $("progressWrap");
const progressBar = $("progressBar");
const progressText = $("progressText");
const btnOpenApp = $("btnOpenApp");
const uploadSummary = $("uploadSummary");

btnOpenApp.addEventListener("click", () => {
  window.desktopAPI.openNbaApp();
});

window.desktopAPI.onEvent((payload) => {
  if (payload.type === "status") {
    statusEl.textContent = payload.message;
    return;
  }

  if (payload.type === "ready") {
    statusEl.textContent = payload.message;
    btnOpenApp.disabled = false;
    return;
  }

  if (payload.type === "fatal") {
    statusEl.textContent = payload.message;
    uploadSummary.hidden = false;
    uploadSummary.textContent = payload.message;
    uploadSummary.classList.add("error");
    return;
  }

  if (payload.type === "upload-progress") {
    progressWrap.hidden = false;
    progressText.textContent = payload.message || "Syncing files…";
    if (payload.total) {
      const pct = Math.round(((payload.current || 0) / payload.total) * 100);
      progressBar.style.setProperty("--pct", `${pct}%`);
    } else {
      progressBar.style.setProperty("--pct", "40%");
    }
    return;
  }

  if (payload.type === "upload-complete") {
    const { result } = payload;
    uploadSummary.hidden = false;
    uploadSummary.classList.remove("error");
    uploadSummary.textContent = `Background sync: uploaded ${result.uploaded} of ${result.fileCount} file(s).`;
    progressBar.style.setProperty("--pct", "100%");
    return;
  }

  if (payload.type === "upload-error") {
    uploadSummary.hidden = false;
    uploadSummary.classList.add("error");
    uploadSummary.textContent = `File sync: ${payload.message}`;
  }
});

window.desktopAPI.notifySplashReady();
