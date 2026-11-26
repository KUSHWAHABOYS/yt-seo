(function () {
  let lastHandledTs = 0;

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

  function findGeminiEditor() {
    return (
      document.querySelector('rich-textarea .ql-editor[contenteditable="true"]') ||
      document.querySelector('rich-textarea div[contenteditable="true"]') ||
      document.querySelector('div.ql-editor[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"][role="textbox"]') ||
      document.querySelector('div[contenteditable="true"]')
    );
  }

  function insertTextClean(editor, text) {
    if (!editor) return false;
    editor.focus();
    // Method 1: Simulated plain-text paste (works reliably with Quill / Angular rich-textarea)
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvt = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
      editor.dispatchEvent(pasteEvt);
      if ((editor.innerText || '').trim().length >= Math.min(20, text.length)) {
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
        return true;
      }
    } catch (e) {}

    // Method 2: execCommand insertText
    try {
      editor.focus();
      document.execCommand('selectAll', false, null);
      if (document.execCommand('insertText', false, text)) {
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
        if ((editor.innerText || '').trim().length >= Math.min(20, text.length)) return true;
      }
    } catch (e) {}

    // Method 3: Direct Quill paragraph DOM injection + Input/Keyup events
    try {
      editor.innerHTML = '';
      text.split('\n').forEach((line) => {
        const p = document.createElement('p');
        if (line) p.textContent = line;
        else p.appendChild(document.createElement('br'));
        editor.appendChild(p);
      });
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
      return (editor.innerText || '').trim().length > 0;
    } catch (e) {
      return false;
    }
  }

  function attachSingleFile(editor, file) {
    if (!editor) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    editor.focus();
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  }

  function waitAndClickSend(prompt, attemptsLeft) {
    const ed = findGeminiEditor();
    if (ed && (ed.innerText || '').trim().length < Math.min(20, prompt.length)) {
      insertTextClean(ed, prompt);
    }
    const sendBtn =
      document.querySelector('button[aria-label*="Send"]') ||
      document.querySelector('button[aria-label*="Submit"]') ||
      document.querySelector('button.send-button');
    if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
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

    const editor = findGeminiEditor();
    if (!editor) {
      setTimeout(() => tryInsertAndSend(prompt, images, ts), 600);
      return;
    }

    lastHandledTs = ts;
    chrome.storage.local.remove(['ssiro_gemini_prompt', 'ssiro_gemini_images', 'ssiro_gemini_ts']);

    const validFiles = Array.isArray(images)
      ? images.map((d, i) => dataUrlToFile(d, i)).filter(Boolean)
      : [];

    // Insert prompt FIRST so Quill/Angular binds the text cleanly, then paste images
    insertTextClean(editor, prompt);

    validFiles.forEach((f, idx) => {
      setTimeout(() => {
        const activeEd = findGeminiEditor() || editor;
        attachSingleFile(activeEd, f);
      }, 250 + idx * 450);
    });

    const sendDelay = validFiles.length ? (validFiles.length * 450 + 1100) : 500;
    setTimeout(() => waitAndClickSend(prompt, 18), sendDelay);
  }

  function checkStorage() {
    chrome.storage.local.get(['ssiro_gemini_prompt', 'ssiro_gemini_images', 'ssiro_gemini_ts'], (res) => {
      if (res && res.ssiro_gemini_prompt && res.ssiro_gemini_ts) {
        tryInsertAndSend(res.ssiro_gemini_prompt, res.ssiro_gemini_images || [], res.ssiro_gemini_ts);
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.ssiro_gemini_prompt && changes.ssiro_gemini_prompt.newValue) {
      checkStorage();
    }
  });

  window.addEventListener('focus', checkStorage);
  setTimeout(checkStorage, 1000);
})();
