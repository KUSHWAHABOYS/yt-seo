(function () {
  function isExtensionAlive() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local);
    } catch (e) {
      return false;
    }
  }

  function relayReturnedThumbs() {
    if (!isExtensionAlive()) return;
    try {
      chrome.storage.local.get(['ssiro_returned_thumbs'], (res) => {
        if (!isExtensionAlive() || chrome.runtime.lastError) return;
        const thumbs = Array.isArray(res?.ssiro_returned_thumbs) ? res.ssiro_returned_thumbs : [];
        if (!thumbs.length) return;
        window.postMessage({ type: 'SSIRO_RETURN_THUMBNAILS', images: thumbs, ts: Date.now() }, '*');
        chrome.storage.local.remove(['ssiro_returned_thumbs']);
      });
    } catch (e) {}
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || !isExtensionAlive()) return;
    try {
      if (event.data.type === 'SSIRO_CHATGPT_SEND' && typeof event.data.prompt === 'string') {
        const imgs = Array.isArray(event.data.images) ? event.data.images.filter(Boolean).slice(0, 6) : [];
        chrome.storage.local.set({
          ssiro_pending_prompt: event.data.prompt,
          ssiro_pending_images: imgs,
          ssiro_pending_ts: Date.now()
        }, () => {
          if (chrome.runtime.lastError) {
            chrome.storage.local.set({
              ssiro_pending_prompt: event.data.prompt,
              ssiro_pending_images: imgs.slice(0, 2),
              ssiro_pending_ts: Date.now()
            });
          }
        });
      }
      if (event.data.type === 'SSIRO_GEMINI_SEND' && typeof event.data.prompt === 'string') {
        const imgs = Array.isArray(event.data.images) ? event.data.images.filter(Boolean).slice(0, 6) : [];
        chrome.storage.local.set({
          ssiro_gemini_prompt: event.data.prompt,
          ssiro_gemini_images: imgs,
          ssiro_gemini_ts: Date.now()
        }, () => {
          if (chrome.runtime.lastError) {
            chrome.storage.local.set({
              ssiro_gemini_prompt: event.data.prompt,
              ssiro_gemini_images: imgs.slice(0, 2),
              ssiro_gemini_ts: Date.now()
            });
          }
        });
      }
      if (event.data.type === 'SSIRO_CHATGPT_BATCH' && Array.isArray(event.data.prompts)) {
        const imgs = Array.isArray(event.data.images) ? event.data.images.filter(Boolean).slice(0, 6) : [];
        chrome.storage.local.set({
          ssiro_chatgpt_queue: { prompts: event.data.prompts.slice(0, 3), images: imgs, index: 0, ts: Date.now() }
        }, () => {
          if (chrome.runtime.lastError) {
            chrome.storage.local.set({
              ssiro_chatgpt_queue: { prompts: event.data.prompts.slice(0, 3), images: imgs.slice(0, 2), index: 0, ts: Date.now() }
            });
          }
        });
      }
      if (event.data.type === 'SSIRO_GEMINI_BATCH' && Array.isArray(event.data.prompts)) {
        const imgs = Array.isArray(event.data.images) ? event.data.images.filter(Boolean).slice(0, 6) : [];
        chrome.storage.local.set({
          ssiro_gemini_queue: { prompts: event.data.prompts.slice(0, 3), images: imgs, index: 0, ts: Date.now() }
        }, () => {
          if (chrome.runtime.lastError) {
            chrome.storage.local.set({
              ssiro_gemini_queue: { prompts: event.data.prompts.slice(0, 3), images: imgs.slice(0, 2), index: 0, ts: Date.now() }
            });
          }
        });
      }
    } catch (e) {}
  });

  if (isExtensionAlive()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.ssiro_returned_thumbs && changes.ssiro_returned_thumbs.newValue) {
        relayReturnedThumbs();
      }
    });
    window.addEventListener('focus', relayReturnedThumbs);
    setTimeout(relayReturnedThumbs, 600);
  }
})();
