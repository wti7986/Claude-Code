const DEFAULT_BACKEND_URL = "http://localhost:3300";

async function getSettings() {
  const { backendUrl, authToken } = await chrome.storage.sync.get(["backendUrl", "authToken"]);
  return { backendUrl: backendUrl || DEFAULT_BACKEND_URL, authToken: authToken || "" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CHECK_TEXT") return false;

  (async () => {
    try {
      const { backendUrl, authToken } = await getSettings();
      const headers = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch(`${backendUrl}/api/check`, {
        method: "POST",
        headers,
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
