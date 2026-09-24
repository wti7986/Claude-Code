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

  function getText(el) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return el.value;
    }
    return el.innerText;
  }

  function setText(el, nextText) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto =
        el instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, nextText);
    } else {
      el.innerText = nextText;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyCorrection(el, sentenceText, correctedText, itemEl) {
    const current = getText(el);
    const idx = current.indexOf(sentenceText);
    if (idx === -1) {
      itemEl.querySelector(".jev-apply").outerHTML =
        '<span class="jev-applied">対象の文が見つかりませんでした（編集済みの可能性）</span>';
      return;
    }
    const next = current.slice(0, idx) + correctedText + current.slice(idx + sentenceText.length);
    setText(el, next);
    itemEl.querySelector(".jev-apply").outerHTML = '<span class="jev-applied">適用しました</span>';
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function highlightIssues(sentenceText, issues) {
    let html = escapeHtml(sentenceText);
    for (const issue of issues) {
      if (!issue.original) continue;
      const escaped = escapeHtml(issue.original);
      html = html.split(escaped).join(`<mark>${escaped}</mark>`);
    }
    return html;
  }

  function renderStatus(text) {
    panel.classList.add("jev-visible");
    panel.querySelector(".jev-body").innerHTML = `<div class="jev-status">${text}</div>`;
  }

  function renderResults(el, results) {
    const withSuggestion = results.filter((r) => r.suggestion);
    const unavailable = results.filter((r) => r.correctionUnavailable);
    badge.style.display = "none";

    if (withSuggestion.length === 0 && unavailable.length === 0) {
      renderStatus("誤字は見つかりませんでした");
      setTimeout(() => panel.classList.remove("jev-visible"), 2000);
      return;
    }

    const flaggedCount = withSuggestion.length + unavailable.length;
    const rect = el.getBoundingClientRect();
    badge.textContent = `⚠ ${flaggedCount}件の誤字候補`;
    badge.style.left = `${Math.max(8, rect.right - 140)}px`;
    badge.style.top = `${Math.max(8, rect.top - 24)}px`;
    badge.style.display = "block";

    const body = panel.querySelector(".jev-body");
    body.innerHTML = "";
    for (const r of withSuggestion) {
      const item = document.createElement("div");
      item.className = "jev-item";
      const reasons = r.suggestion.issues.map((i) => i.reason).join(" / ");
      item.innerHTML = `
        <div class="jev-original">${highlightIssues(r.text, r.suggestion.issues)}</div>
        <div class="jev-suggested">→ ${escapeHtml(r.suggestion.corrected)}</div>
        <div class="jev-reason">${escapeHtml(reasons)}</div>
        <button class="jev-apply">この修正を適用</button>
      `;
      item.querySelector(".jev-apply").addEventListener("click", () => {
        applyCorrection(el, r.text, r.suggestion.corrected, item);
      });
      body.appendChild(item);
    }
    for (const r of unavailable) {
      const item = document.createElement("div");
      item.className = "jev-item";
      item.innerHTML = `
        <div class="jev-original">${escapeHtml(r.text)}</div>
        <div class="jev-reason">誤字の可能性がありますが、修正案の取得に失敗しました(サーバー側のログを確認してください)</div>
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
        activeField = e.target;
      }
    },
    true,
  );

  document.addEventListener(
    "input",
    (e) => {
      if (isEditable(e.target)) {
        activeField = e.target;
        scheduleCheck(e.target);
      }
    },
    true,
  );

  document.addEventListener(
    "focusout",
    (e) => {
      if (e.target === activeField) {
        // Leave the panel visible so the user can still review/apply,
        // but stop tracking it as the live target.
      }
    },
    true,
  );
})();
