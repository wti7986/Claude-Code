const enabledEl = document.getElementById("enabled");
const backendUrlEl = document.getElementById("backendUrl");
const statusEl = document.getElementById("status");
const saveEl = document.getElementById("save");

async function load() {
  const { enabled = true, backendUrl = "http://localhost:3300" } =
    await chrome.storage.sync.get(["enabled", "backendUrl"]);
  enabledEl.checked = enabled;
  backendUrlEl.value = backendUrl;
}

saveEl.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    enabled: enabledEl.checked,
    backendUrl: backendUrlEl.value.trim() || "http://localhost:3300",
  });
  statusEl.textContent = "保存しました";
  setTimeout(() => (statusEl.textContent = ""), 1500);
});

load();
