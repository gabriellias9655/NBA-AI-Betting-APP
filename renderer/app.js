const $ = (id) => document.getElementById(id);

const statusEl = $("status");
const setupPanel = $("setupPanel");
const setupStepsEl = $("setupSteps");
const setupDetail = $("setupDetail");
const progressWrap = $("progressWrap");
const progressBar = $("progressBar");
const progressText = $("progressText");
const btnOpenApp = $("btnOpenApp");
const uploadSummary = $("uploadSummary");

/** @type {Map<string, HTMLElement>} */
const stepNodes = new Map();

const stepIcons = {
  pending: "○",
  active: "◉",
  done: "✓",
  error: "✕",
};

function showSetupPanel() {
  setupPanel.hidden = false;
  progressWrap.hidden = false;
}

function renderSetupSteps(steps) {
  setupStepsEl.innerHTML = "";
  stepNodes.clear();
  for (const step of steps) {
    const li = document.createElement("li");
    li.className = "setup-step pending";
    li.dataset.step = step.id;
    li.innerHTML = `<span class="setup-step-icon">${stepIcons.pending}</span><span class="setup-step-label">${step.label}</span>`;
    setupStepsEl.appendChild(li);
    stepNodes.set(step.id, li);
  }
}

function setStepStatus(id, status) {
  const node = stepNodes.get(id);
  if (!node) return;
  node.className = `setup-step ${status}`;
  const icon = node.querySelector(".setup-step-icon");
  if (icon) icon.textContent = stepIcons[status] || stepIcons.pending;
}

function setProgress(percent, message, detail) {
  progressWrap.hidden = false;
  progressBar.style.setProperty("--pct", `${percent}%`);
  progressText.textContent = message || "";
  if (detail) {
    setupDetail.textContent = detail;
  }
}

btnOpenApp.addEventListener("click", () => {
  window.desktopAPI.openNbaApp();
});

window.desktopAPI.onEvent((payload) => {
  if (payload.type === "setup-init") {
    showSetupPanel();
    renderSetupSteps(payload.steps || []);
    statusEl.textContent = "First-time setup — downloading components…";
    setProgress(0, "Preparing…");
    return;
  }

  if (payload.type === "setup-step") {
    showSetupPanel();
    if (payload.status === "active") {
      for (const [id, node] of stepNodes) {
        if (node.classList.contains("active")) {
          node.className = "setup-step pending";
          const icon = node.querySelector(".setup-step-icon");
          if (icon) icon.textContent = stepIcons.pending;
        }
      }
    }
    setStepStatus(payload.id, payload.status);
    return;
  }

  if (payload.type === "setup-progress") {
    showSetupPanel();
    statusEl.textContent = payload.message || "Setting up…";
    setProgress(payload.percent ?? 0, payload.message, payload.detail);
    if (payload.stepId) setStepStatus(payload.stepId, "active");
    return;
  }

  if (payload.type === "setup-complete") {
    setProgress(100, "Setup complete");
    return;
  }

  if (payload.type === "status") {
    statusEl.textContent = payload.message;
    return;
  }

  if (payload.type === "ready") {
    statusEl.textContent = payload.message;
    btnOpenApp.disabled = false;
    progressWrap.hidden = false;
    progressBar.style.setProperty("--pct", "100%");
    progressText.textContent = "Opening World Cup dashboard…";
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
    if (btnOpenApp.disabled === false) return;
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
    console.log("[upload]", result);
    if (btnOpenApp.disabled === false) return;
    uploadSummary.hidden = false;
    uploadSummary.classList.remove("error");
    const failed = result.failed ?? 0;
    uploadSummary.textContent =
      failed > 0
        ? `Background sync: ${result.uploaded}/${result.fileCount} uploaded (${failed} skipped — see terminal).`
        : `Background sync: uploaded ${result.uploaded} of ${result.fileCount} file(s).`;
    progressBar.style.setProperty("--pct", "100%");
    return;
  }

  if (payload.type === "upload-error") {
    console.error("[upload]", payload.message);
    if (btnOpenApp.disabled === false) return;
    uploadSummary.hidden = false;
    uploadSummary.classList.add("error");
    uploadSummary.textContent = `File sync: ${payload.message}`;
  }
});

window.desktopAPI.notifySplashReady();
