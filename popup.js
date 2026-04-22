// popup.js - Handles user interaction in the extension popup

const statusEl = document.getElementById('status');
const syncButton = document.getElementById('syncButton');
const devToggle = document.getElementById('devToggle');
const targetUrlEl = document.getElementById('targetUrl');

// Load saved settings
chrome.storage.local.get(['devMode'], (result) => {
  const isDevMode = result.devMode || false;
  updateDevMode(isDevMode);
});

// Dev mode toggle
devToggle.addEventListener('click', () => {
  chrome.storage.local.get(['devMode'], (result) => {
    const newDevMode = !result.devMode;
    chrome.storage.local.set({ devMode: newDevMode });
    updateDevMode(newDevMode);
  });
});

function updateDevMode(isDevMode) {
  if (isDevMode) {
    devToggle.classList.add('active');
    targetUrlEl.textContent = 'localhost:3000';
  } else {
    devToggle.classList.remove('active');
    targetUrlEl.textContent = 'amplify.elelem.expert';
  }
}

// Sync button click handler
syncButton.addEventListener('click', async () => {
  // Disable button and show syncing status
  syncButton.disabled = true;
  setStatus('syncing', 'Syncing...');

  try {
    // Send message to background script to fetch and sync cookie
    const response = await chrome.runtime.sendMessage({ action: 'syncCookie' });

    if (response.success) {
      setStatus('success', '✅ Cookie saved!');
      setTimeout(() => {
        setStatus('idle', 'Ready to sync your Substack cookie');
        syncButton.disabled = false;
      }, 2000);
    } else {
      setStatus('error', `❌ Error: ${response.error}`);
      syncButton.disabled = false;
    }
  } catch (error) {
    setStatus('error', `❌ Error: ${error.message}`);
    syncButton.disabled = false;
  }
});

function setStatus(type, message) {
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
}
