// Content script - bridges between Amplifier page and background worker

console.log('[Amplifier Extension] Content script loaded');

// Test if extension context is still valid
function isExtensionContextValid() {
  try {
    if (chrome.runtime?.id) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Send action to background worker
async function sendToBackground(action, data) {
  if (!isExtensionContextValid()) {
    throw new Error('Extension was reloaded. Please refresh this page.');
  }

  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({
        action,
        ...data,
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Extension error: ' + chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          reject(new Error('No response from extension'));
          return;
        }

        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Listen for messages from the web page
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (event.data.source !== 'amplifier-web') return;

  const { action, postUrl, content, triggerAt, imageUrl } = event.data;

  try {
    let response;

    if (action === 'ping') {
      if (isExtensionContextValid()) {
        response = { success: true };
      } else {
        response = {
          success: false,
          error: 'Extension was reloaded. Please refresh this page.'
        };
      }
    } else if (action === 'restack') {
      console.log('[Amplifier Extension] Sending restack request', triggerAt ? `(scheduled for ${triggerAt})` : '(immediate)', imageUrl ? 'with image' : '');
      response = await sendToBackground('restack', { postUrl, content, triggerAt, imageUrl });
      console.log('[Amplifier Extension] Restack response:', response);
    } else if (action === 'postNote') {
      console.log('[Amplifier Extension] Sending postNote request');
      response = await sendToBackground('postNote', { content });
      console.log('[Amplifier Extension] PostNote response:', response);
    } else {
      response = { success: false, error: 'Unknown action' };
    }

    window.postMessage({
      source: 'amplifier-extension',
      ...response,
    }, '*');
  } catch (error) {
    console.error('[Amplifier Extension] Error:', error);
    window.postMessage({
      source: 'amplifier-extension',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, '*');
  }
});

// Notify page that extension is ready
if (isExtensionContextValid()) {
  window.postMessage({
    source: 'amplifier-extension',
    action: 'ready',
  }, '*');
}
