(function () {
  function isExtensionAlive() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local);
    } catch (e) {
      return false;
    }
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
            // Retry with prompt + first 2 images if quota/size issue occurs
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
    } catch (e) {}
  });
})();
