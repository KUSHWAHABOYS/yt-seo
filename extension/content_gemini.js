(function () {
  let lastHandledTs = 0;
  let queueRunning = false;

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
    } catch (e) { return null; }
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
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      if ((editor.innerText || '').trim().length >= Math.min(20, text.length)) {
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
        return true;
      }
    } catch (e) {}
    try {
      editor.focus();
      document.execCommand('selectAll', false, null);
      if (document.execCommand('insertText', false, text)) {
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
        if ((editor.innerText || '').trim().length >= Math.min(20, text.length)) return true;
      }
    } catch (e) {}
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
    } catch (e) { return false; }
  }

  function attachSingleFile(editor, file) {
    if (!editor) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    editor.focus();
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  }

  function waitAndClickSend(prompt, attemptsLeft, onSent) {
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
      if (onSent) onSent();
      return;
    }
    if (attemptsLeft > 0) {
      setTimeout(() => waitAndClickSend(prompt, attemptsLeft - 1, onSent), 450);
    }
  }

  function getGeneratedImages() {
    return Array.from(document.querySelectorAll('main img, response-container img, generated-image img')).filter(im =>
      im.complete && (im.naturalWidth || 0) >= 256 && !im.closest('rich-textarea')
    );
  }

  async function captureImgToDataUrl(imgEl) {
    try {
      const c = document.createElement('canvas');
      const scale = Math.min(1, 1280 / Math.max(imgEl.naturalWidth || 1280, imgEl.naturalHeight || 720));
      c.width = Math.round((imgEl.naturalWidth || 1280) * scale);
      c.height = Math.round((imgEl.naturalHeight || 720) * scale);
      c.getContext('2d').drawImage(imgEl, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.88);
    } catch (e) {
      try {
        const resp = await fetch(imgEl.src);
        const blob = await resp.blob();
        return await new Promise((res) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result || ''));
          r.readAsDataURL(blob);
        });
      } catch (err) { return ''; }
    }
  }

  function pushThumbToStudio(label, dataUrl) {
    if (!isAlive() || !dataUrl) return;
    chrome.storage.local.get(['ssiro_returned_thumbs'], (res) => {
      const arr = Array.isArray(res?.ssiro_returned_thumbs) ? res.ssiro_returned_thumbs : [];
      arr.push({ label, dataUrl, source: 'gemini', ts: Date.now() });
      chrome.storage.local.set({ ssiro_returned_thumbs: arr.slice(-6) });
    });
  }

  function injectReturnButtons() {
    getGeneratedImages().forEach((im) => {
      if (im.dataset.ssiroBtnBound) return;
      im.dataset.ssiroBtnBound = '1';
      const parent = im.parentElement;
      if (!parent) return;
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '📥 Send to YT-SEO CTR';
      btn.style.cssText = 'position:absolute;bottom:10px;right:10px;z-index:9999;padding:6px 10px;border-radius:8px;background:#10b981;color:#0f172a;font:700 11px/1.2 sans-serif;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.45);';
      btn.onclick = async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        btn.textContent = '⏳ Sending...';
        const dUrl = await captureImgToDataUrl(im);
        if (dUrl) {
          pushThumbToStudio('Gemini_Thumbnail.jpg', dUrl);
          btn.textContent = '✅ Sent to YT-SEO!';
        } else {
          btn.textContent = '⚠️ Save & Upload Manually';
        }
      };
      parent.appendChild(btn);
    });
  }

  function runBatchQueue(q) {
    if (queueRunning || !q || !Array.isArray(q.prompts) || q.index >= q.prompts.length) return;
    if (Date.now() - (q.ts || 0) > 600000) {
      chrome.storage.local.remove(['ssiro_gemini_queue']);
      return;
    }
    const editor = findGeminiEditor();
    if (!editor) { setTimeout(() => runBatchQueue(q), 800); return; }
    queueRunning = true;
    const item = q.prompts[q.index];
    const baseCount = getGeneratedImages().length;
    const files = (q.index === 0 && Array.isArray(q.images))
      ? q.images.map((d, i) => dataUrlToFile(d, i)).filter(Boolean)
      : [];

    insertTextClean(editor, item.text);
    files.forEach((f, idx) => setTimeout(() => attachSingleFile(findGeminiEditor() || editor, f), 250 + idx * 450));
    const sendDelay = files.length ? (files.length * 450 + 1100) : 500;
    setTimeout(() => {
      waitAndClickSend(item.text, 40, () => {
        let polls = 0;
        const iv = setInterval(async () => {
          polls += 1;
          const imgs = getGeneratedImages();
          if (imgs.length > baseCount) {
            clearInterval(iv);
            const newest = imgs[imgs.length - 1];
            setTimeout(async () => {
              const dUrl = await captureImgToDataUrl(newest);
              if (dUrl) pushThumbToStudio(`Gemini_${item.code || ('V' + (q.index + 1))}.jpg`, dUrl);
              const nextIdx = q.index + 1;
              queueRunning = false;
              if (nextIdx < q.prompts.length) {
                const updated = { ...q, index: nextIdx, ts: Date.now() };
                chrome.storage.local.set({ ssiro_gemini_queue: updated }, () => setTimeout(() => runBatchQueue(updated), 2400));
              } else {
                chrome.storage.local.remove(['ssiro_gemini_queue']);
              }
            }, 2500);
          } else if (polls >= 38) {
            clearInterval(iv);
            queueRunning = false;
            chrome.storage.local.remove(['ssiro_gemini_queue']);
          }
        }, 2500);
      });
    }, sendDelay);
  }

  function tryInsertAndSend(prompt, images, ts) {
    if (!prompt || !ts || ts <= lastHandledTs) return;
    if (Date.now() - ts > 60000) return;
    const editor = findGeminiEditor();
    if (!editor) { setTimeout(() => tryInsertAndSend(prompt, images, ts), 600); return; }
    lastHandledTs = ts;
    chrome.storage.local.remove(['ssiro_gemini_prompt', 'ssiro_gemini_images', 'ssiro_gemini_ts']);
    const validFiles = Array.isArray(images) ? images.map((d, i) => dataUrlToFile(d, i)).filter(Boolean) : [];
    insertTextClean(editor, prompt);
    validFiles.forEach((f, idx) => setTimeout(() => attachSingleFile(findGeminiEditor() || editor, f), 250 + idx * 450));
    const sendDelay = validFiles.length ? (validFiles.length * 450 + 1100) : 500;
    setTimeout(() => waitAndClickSend(prompt, 40), sendDelay);
  }

  function checkStorage() {
    if (!isAlive()) return;
    chrome.storage.local.get(['ssiro_gemini_prompt', 'ssiro_gemini_images', 'ssiro_gemini_ts', 'ssiro_gemini_queue'], (res) => {
      if (res && res.ssiro_gemini_queue && !queueRunning) {
        runBatchQueue(res.ssiro_gemini_queue);
      } else if (res && res.ssiro_gemini_prompt && res.ssiro_gemini_ts) {
        tryInsertAndSend(res.ssiro_gemini_prompt, res.ssiro_gemini_images || [], res.ssiro_gemini_ts);
      }
    });
  }

  if (isAlive()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && ((changes.ssiro_gemini_prompt && changes.ssiro_gemini_prompt.newValue) || (changes.ssiro_gemini_queue && changes.ssiro_gemini_queue.newValue))) {
        checkStorage();
      }
    });
  }

  setInterval(injectReturnButtons, 2500);
  window.addEventListener('focus', checkStorage);
  setTimeout(checkStorage, 1000);
})();
