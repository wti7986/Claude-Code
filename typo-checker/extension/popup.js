const enabledEl = document.getElementById("enabled");
const backendUrlEl = document.getElementById("backendUrl");
const authTokenEl = document.getElementById("authToken");
const statusEl = document.getElementById("status");
const saveEl = document.getElementById("save");

async function load() {
  const {
    enabled = true,
    backendUrl = "http://localhost:3300",
    authToken = "",
  } = await chrome.storage.sync.get(["enabled", "backendUrl", "authToken"]);
  enabledEl.checked = enabled;
  backendUrlEl.value = backendUrl;
  authTokenEl.value = authToken;
}

saveEl.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    enabled: enabledEl.checked,
    backendUrl: backendUrlEl.value.trim() || "http://localhost:3300",
    authToken: authTokenEl.value.trim(),
  });
  statusEl.textContent = "保存しました";
  setTimeout(() => (statusEl.textContent = ""), 1500);
});

load();
