(() => {
  const DEBOUNCE_MS = 700;
  const MIN_LENGTH = 4;

  let settings = { enabled: true };
  chrome.storage.sync.get(["enabled"]).then((s) => {
    settings.enabled = s.enabled !== false;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
  });

  /** @type {HTMLElement | null} */
  let activeField = null;
  let debounceTimer = null;
  let requestToken = 0;
  let isComposing = false;

  const panel = document.createElement("div");
  panel.id = "jev-typo-panel";
  panel.innerHTML = `
    <div class="jev-header">
      <span>誤字チェック (Jev)</span>
      <span class="jev-close" title="閉じる">×</span>
    </div>
    <div class="jev-body"></div>
  `;
  document.documentElement.appendChild(panel);
  panel.querySelector(".jev-close").addEventListener("click", () => {
    panel.classList.remove("jev-visible");
  });

  const badge = document.createElement("div");
  badge.className = "jev-typo-badge";
  badge.style.display = "none";
  document.documentElement.appendChild(badge);

  function isEditable(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      return ["text", "search", "email", "url", "tel"].includes(el.type);
    }
    return el.isContentEditable;
  }

  // An input/composition event's target can be a node nested deep inside a
  // contenteditable editor (a span wrapping one word, a mention chip, ...).
  // Resolve up to the actual editable root so getText/setText always see the
  // whole message, not just whatever fragment the event happened to target.
  function getEditableRoot(el) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return el;
    }
    return el.closest('[contenteditable="true"], [contenteditable=""]') ?? el;
  }

  function getText(el) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return el.value;
    }
    return el.innerText;
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderStatus(text) {
    panel.classList.add("jev-visible");
    panel.querySelector(".jev-body").innerHTML = `<div class="jev-status">${text}</div>`;
  }

  function renderResults(el, results) {
    const flagged = results.filter((r) => r.flagged);
    badge.style.display = "none";

    if (flagged.length === 0) {
      renderStatus("誤字は見つかりませんでした");
      setTimeout(() => panel.classList.remove("jev-visible"), 2000);
      return;
    }

    const rect = el.getBoundingClientRect();
    badge.textContent = `⚠ ${flagged.length}件の誤字候補`;
    badge.style.left = `${Math.max(8, rect.right - 140)}px`;
    badge.style.top = `${Math.max(8, rect.top - 24)}px`;
    badge.style.display = "block";

    const body = panel.querySelector(".jev-body");
    body.innerHTML = "";
    for (const r of flagged) {
      const item = document.createElement("div");
      item.className = "jev-item";
      const pct = Math.round(r.probability * 100);
      item.innerHTML = `
        <div class="jev-original">${escapeHtml(r.text)}</div>
        <div class="jev-reason">誤字の可能性: ${pct}%</div>
      `;
      body.appendChild(item);
    }
    panel.classList.add("jev-visible");
  }

  function scheduleCheck(el) {
    if (!settings.enabled) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runCheck(el), DEBOUNCE_MS);
  }

  function runCheck(el) {
    const text = getText(el);
    if (!text || text.trim().length < MIN_LENGTH) {
      panel.classList.remove("jev-visible");
      badge.style.display = "none";
      return;
    }

    const token = ++requestToken;
    renderStatus("確認中...");

    chrome.runtime.sendMessage({ type: "CHECK_TEXT", text }, (response) => {
      if (token !== requestToken || activeField !== el) return; // stale response
      if (!response) {
        renderStatus("バックエンドに接続できませんでした");
        return;
      }
      if (!response.ok) {
        renderStatus(`エラー: ${response.error}`);
        return;
      }
      renderResults(el, response.data.results);
    });
  }

  document.addEventListener(
    "focusin",
    (e) => {
      if (isEditable(e.target)) {
        activeField = getEditableRoot(e.target);
      }
    },
    true,
  );

  // IME composition (Japanese romaji -> kana/kanji conversion) fires input
  // events with unfinished, intermediate text while the user is still
  // choosing a conversion candidate. Ignore those and only check once the
  // conversion is committed (compositionend), otherwise the debounce can
  // fire mid-conversion on garbled partial text.
  document.addEventListener(
    "compositionstart",
    (e) => {
      if (isEditable(e.target)) isComposing = true;
    },
    true,
  );

  document.addEventListener(
    "compositionend",
    (e) => {
      if (isEditable(e.target)) {
        isComposing = false;
        const root = getEditableRoot(e.target);
        activeField = root;
        scheduleCheck(root);
      }
    },
    true,
  );

  document.addEventListener(
    "input",
    (e) => {
      if (!isEditable(e.target)) return;
      if (isComposing || e.isComposing) return;
      const root = getEditableRoot(e.target);
      activeField = root;
      scheduleCheck(root);
    },
    true,
  );
})();
