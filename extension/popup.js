document.addEventListener('DOMContentLoaded', () => {
  const localVer = chrome.runtime.getManifest().version || '3.0';
  document.getElementById('localVer').textContent = localVer;

  document.getElementById('openStudioBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://kushwahaboys.github.io/yt-seo/' });
  });

  document.getElementById('checkUpdateBtn').addEventListener('click', async () => {
    const msgEl = document.getElementById('updateMsg');
    msgEl.style.color = '#ffb95f';
    msgEl.textContent = '⏳ Checking GitHub for latest extension...';
    try {
      const res = await fetch('https://raw.githubusercontent.com/KUSHWAHABOYS/yt-seo/main/extension/manifest.json?t=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const remote = await res.json();
      if (remote.version && remote.version !== localVer) {
        msgEl.style.color = '#4edea3';
        msgEl.innerHTML = `✨ New v${remote.version} available! Downloading ZIP...`;
        chrome.tabs.create({ url: 'https://github.com/KUSHWAHABOYS/yt-seo/raw/main/ssiro_chatgpt_bridge_extension.zip' });
      } else {
        msgEl.style.color = '#4edea3';
        msgEl.textContent = `✅ You are on latest v${localVer}!`;
      }
    } catch (e) {
      msgEl.style.color = '#ffb4ab';
      msgEl.textContent = '⚠️ Could not reach GitHub. Try again.';
    }
  });
});
