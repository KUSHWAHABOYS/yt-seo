(function () {
  let lastHandledTs = 0;

  function isAlive() {
    try { return Boolean(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  function dataUrlToFile(dataUrl, idx) {
    try {
      const [meta, b64] = dataUrl.split(',');
      const mime = (meta.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const ext = mime.includes('png') ? 'png' : 'jpg';
      return new File([arr], `ssiro_ref_${idx + 1}.${ext}`, { type: mime });
    } catch (e) {
      return null;
    }
  }

  function findChatGptEditor() {
    return (
      document.querySelector('#prompt-textarea') ||
      document.querySelector('div[contenteditable="true"].ProseMirror') ||
      document.querySelector('div[contenteditable="true"]')
    );
  }

  function insertTextProseMirror(editor, text) {
    if (!editor) return;
    editor.focus();
    if (editor.tagName === 'TEXTAREA') {
      editor.value = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      if ((editor.innerText || '').trim().length >= Math.min(20, text.length)) {
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
        return;
      }
    } catch (e) {}
    try {
      document.execCommand('selectAll', false, null);
      if (document.execCommand('insertText', false, text)) {
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
        return;
      }
    } catch (e) {}
    editor.innerHTML = '';
    text.split('\n').forEach(line => {
      const p = document.createElement('p');
      p.textContent = line || '\u200B';
      editor.appendChild(p);
    });
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  }

  function attachSingleFile(editor, file) {
    if (!editor) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    editor.focus();
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  }

  function waitAndClickSend(prompt, attemptsLeft) {
    const ed = findChatGptEditor();
    if (ed && ((ed.value || ed.innerText || '').trim().length < Math.min(20, prompt.length))) {
      insertTextProseMirror(ed, prompt);
    }
    const sendBtn =
      document.querySelector('button[data-testid="send-button"]') ||
      document.querySelector('button[aria-label*="Send"]');
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      return;
    }
    if (attemptsLeft > 0) {
      setTimeout(() => waitAndClickSend(prompt, attemptsLeft - 1), 450);
    }
  }

  function tryInsertAndSend(prompt, images, ts) {
    if (!prompt || !ts || ts <= lastHandledTs) return;
    if (Date.now() - ts > 60000) return;

    const editor = findChatGptEditor();
    if (!editor) {
      setTimeout(() => tryInsertAndSend(prompt, images, ts), 600);
      return;
    }

    lastHandledTs = ts;
    try {
      if (isAlive()) chrome.storage.local.remove(['ssiro_pending_prompt', 'ssiro_pending_images', 'ssiro_pending_ts']);
    } catch (e) {}

    const validFiles = Array.isArray(images)
      ? images.map((d, i) => dataUrlToFile(d, i)).filter(Boolean)
      : [];

    insertTextProseMirror(editor, prompt);

    validFiles.forEach((f, idx) => {
      setTimeout(() => attachSingleFile(findChatGptEditor() || editor, f), 200 + idx * 420);
    });

    const sendDelay = validFiles.length ? (validFiles.length * 420 + 1000) : 450;
    setTimeout(() => waitAndClickSend(prompt, 18), sendDelay);
  }

  function checkStorage() {
    if (!isAlive()) return;
    try {
      chrome.storage.local.get(['ssiro_pending_prompt', 'ssiro_pending_images', 'ssiro_pending_ts'], (res) => {
        if (!isAlive() || chrome.runtime.lastError) return;
        if (res && res.ssiro_pending_prompt && res.ssiro_pending_ts) {
          tryInsertAndSend(res.ssiro_pending_prompt, res.ssiro_pending_images || [], res.ssiro_pending_ts);
        }
      });
    } catch (e) {}
  }

  if (isAlive()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.ssiro_pending_prompt && changes.ssiro_pending_prompt.newValue) {
        checkStorage();
      }
    });
  }

  window.addEventListener('focus', checkStorage);
  setTimeout(checkStorage, 900);
})();
