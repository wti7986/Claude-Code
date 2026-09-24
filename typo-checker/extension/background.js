const DEFAULT_BACKEND_URL = "http://localhost:3300";

async function getBackendUrl() {
  const { backendUrl } = await chrome.storage.sync.get("backendUrl");
  return backendUrl || DEFAULT_BACKEND_URL;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CHECK_TEXT") return false;

  (async () => {
    try {
      const backendUrl = await getBackendUrl();
      const res = await fetch(`${backendUrl}/api/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.text }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        sendResponse({ ok: false, error: `HTTP ${res.status}: ${body}` });
        return;
      }

      const data = await res.json();
      sendResponse({ ok: true, data });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true; // keep the message channel open for the async response
});
