// background.js - Amplifier Substack Cookie Sync

try {
  console.log('[Amplifier Extension] Background script loaded - v1.0.1');

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (request.action === 'syncCookie') {
        handleCookieSync().then(sendResponse).catch(err => {
          console.error('[Amplifier Extension] Cookie sync error:', err);
          sendResponse({ success: false, error: err.message });
        });
        return true;
      }

      if (request.action === 'restack') {
        console.log('[Amplifier Extension] Background received restack request', request.triggerAt ? `(scheduled for ${request.triggerAt})` : '(immediate)', request.imageUrl ? 'with image' : '');
        handleRestack(request.postUrl, request.content, request.triggerAt, request.imageUrl).then(sendResponse).catch(err => {
          console.error('[Amplifier Extension] Restack error:', err);
          sendResponse({ success: false, error: err.message });
        });
        return true;
      }

      if (request.action === 'postNote') {
        console.log('[Amplifier Extension] Background received postNote request');
        handlePostNote(request.content).then(sendResponse).catch(err => {
          console.error('[Amplifier Extension] PostNote error:', err);
          sendResponse({ success: false, error: err.message });
        });
        return true;
      }
    } catch (error) {
      console.error('[Amplifier Extension] Message handler error:', error);
      sendResponse({ success: false, error: error.message });
      return true;
    }
  });
} catch (error) {
  console.error('[Amplifier Extension] Failed to initialize:', error);
}

async function handleCookieSync() {
  try {
    // Get ALL substack cookies — getAll() returns httpOnly cookies too
    const domains = ['.substack.com', 'substack.com', '.www.substack.com'];
    const allCookies = [];
    for (const d of domains) {
      try {
        const domainCookies = await chrome.cookies.getAll({ domain: d });
        allCookies.push(...domainCookies);
      } catch (e) {}
    }
    // Deduplicate
    const cookies = allCookies.filter((c, i, self) =>
      i === self.findIndex(x => x.name === c.name && x.domain === c.domain)
    );

    if (!cookies.length) {
      return { success: false, error: 'No Substack cookies found. Please log in to Substack first.' };
    }

    // Find substack.sid (the session cookie)
    const sidCookie = cookies.find(c => c.name === 'substack.sid');
    if (!sidCookie) {
      return { success: false, error: 'Substack session cookie not found. Please log in to Substack first.' };
    }

    const { devMode } = await chrome.storage.local.get(['devMode']);
    const baseUrl = devMode ? 'http://localhost:3000' : 'https://amplify.elelem.expert';

    const response = await fetch(`${baseUrl}/api/settings/cookie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ cookie: sidCookie.value })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: err.error || `Server error: ${response.status}` };
    }

    const data = await response.json();
    return data.ok ? { success: true } : { success: false, error: data.error || 'Unknown error' };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Execute script in a Substack tab
async function executeInSubstackTab(scriptFunc, args = {}) {
  console.log('[Amplifier Extension] Creating Substack tab');

  // Create a hidden tab
  const tab = await chrome.tabs.create({
    url: 'https://substack.com',
    active: false,  // Hidden in background
  });

  try {
    // Wait for tab to load
    await new Promise((resolve, reject) => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      // Timeout after 10 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }, 10000);
    });

    console.log('[Amplifier Extension] Tab loaded, executing script');

    // Wait a bit more for the page to fully initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Execute the script in the tab's main world (not isolated)
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scriptFunc,
      args: [args],
      world: 'MAIN',  // Run in page context, not isolated world
    });

    console.log('[Amplifier Extension] Script executed, result:', results[0].result);

    return results[0].result;
  } finally {
    // Close the tab
    await chrome.tabs.remove(tab.id);
    console.log('[Amplifier Extension] Tab closed');
  }
}

// Handle restack with note (supports scheduling and images)
async function handleRestack(postUrl, content, triggerAt = null, imageUrl = null) {
  try {
    const result = await executeInSubstackTab(async (params) => {
      try {
        const { postUrl, content, triggerAt, imageUrl } = params;

        console.log('[Injected Script] Starting restack with note for:', postUrl);
        if (triggerAt) {
          console.log('[Injected Script] Scheduling for:', triggerAt);
        }

        // Step 1: Create attachment (register the post as a link)
        console.log('[Injected Script] Step 1: Creating attachment...');
        const attachmentRes = await fetch('https://substack.com/api/v1/comment/attachment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ url: postUrl }),
        });

        console.log('[Injected Script] Attachment response status:', attachmentRes.status);

        if (!attachmentRes.ok) {
          const text = await attachmentRes.text();
          return { success: false, error: `Failed to create attachment: ${attachmentRes.status} - ${text.slice(0, 100)}` };
        }

        const attachmentData = await attachmentRes.json();
        const postAttachmentId = attachmentData.id;
        console.log('[Injected Script] Created post attachment ID:', postAttachmentId);

        // Optional: Upload image if provided
        const attachmentIds = [postAttachmentId]; // Start with post attachment

        if (imageUrl) {
          console.log('[Injected Script] Step 1.5: Fetching image from:', imageUrl);
          console.log('[Injected Script] Image URL type:', typeof imageUrl, 'length:', imageUrl.length);

          // Fetch the image
          const imgRes = await fetch(imageUrl).catch(err => {
            console.error('[Injected Script] Image fetch failed:', err);
            console.error('[Injected Script] Error details - name:', err.name, 'message:', err.message);
            throw new Error(`Failed to fetch image: ${err.message}`);
          });

          if (!imgRes.ok) {
            throw new Error(`Image fetch failed with status ${imgRes.status}`);
          }

          const imgBlob = await imgRes.blob();

          // Convert to base64
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(imgBlob);
          });

          console.log('[Injected Script] Step 1.6: Uploading image to Substack...');

          // Upload image to Substack
          const imageUploadRes = await fetch('https://substack.com/api/v1/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ image: base64 }),
          });

          if (!imageUploadRes.ok) {
            console.warn('[Injected Script] Image upload failed:', imageUploadRes.status);
          } else {
            const imageData = await imageUploadRes.json();
            console.log('[Injected Script] Image uploaded to:', imageData.url);

            // Register image as attachment
            console.log('[Injected Script] Step 1.7: Registering image attachment...');
            const imageAttachmentRes = await fetch('https://substack.com/api/v1/comment/attachment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                type: 'image',
                url: imageData.url
              }),
            });

            if (!imageAttachmentRes.ok) {
              console.warn('[Injected Script] Image attachment registration failed:', imageAttachmentRes.status);
            } else {
              const imageAttachmentData = await imageAttachmentRes.json();
              console.log('[Injected Script] Image attachment ID:', imageAttachmentData.id);
              // Add image attachment ID BEFORE the post attachment
              attachmentIds.unshift(imageAttachmentData.id);
            }
          }
        }

        // Step 2: Post the note with the attachment(s) (immediate or scheduled)
        const endpoint = triggerAt
          ? 'https://substack.com/api/v1/comment/draft'
          : 'https://substack.com/api/v1/comment/feed';

        console.log('[Injected Script] Step 2: Posting to', endpoint);

        const bodyJson = {
          type: "doc",
          attrs: { schemaVersion: "v1", title: null },
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: content }],
          }],
        };

        const payload = {
          bodyJson: bodyJson,
          attachmentIds: attachmentIds, // Now includes image attachments if provided
          replyMinimumRole: "everyone",
        };

        // Add trigger_at for scheduled posts
        if (triggerAt) {
          payload.trigger_at = triggerAt;
        }

        const noteRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        console.log('[Injected Script] Note response status:', noteRes.status);

        if (!noteRes.ok) {
          const text = await noteRes.text();
          return { success: false, error: `Failed to post note: ${noteRes.status} - ${text.slice(0, 100)}` };
        }

        const result = await noteRes.json();
        console.log('[Injected Script] Restack successful!', result);
        return {
          success: true,
          result,
          scheduled: !!triggerAt,
          draftId: triggerAt ? result.id : null,
        };
      } catch (error) {
        console.error('[Injected Script] Error:', error);
        return { success: false, error: error.message || String(error) };
      }
    }, { postUrl, content, triggerAt, imageUrl });

    console.log('[Amplifier Extension] Result from tab:', result);
    return result || { success: false, error: 'No result from injected script' };
  } catch (error) {
    console.error('[Amplifier Extension] Restack error:', error);
    return { success: false, error: error.message };
  }
}

// Handle posting a new note (standalone, no attachment)
async function handlePostNote(content) {
  try {
    const result = await executeInSubstackTab(async (params) => {
      try {
        const { content } = params;

        console.log('[Injected Script] Starting post note');

        // Build note body with correct structure
        const bodyJson = {
          type: "doc",
          attrs: { schemaVersion: "v1", title: null },
          content: [{
            type: "paragraph",
            content: [{ type: "text", text: content }],
          }],
        };

        // Post note
        console.log('[Injected Script] Posting note...');
        const res = await fetch('https://substack.com/api/v1/comment/feed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            bodyJson: bodyJson,
            replyMinimumRole: "everyone",
          }),
        });

        console.log('[Injected Script] Post note response status:', res.status);

        if (!res.ok) {
          const text = await res.text();
          return { success: false, error: `Substack returned ${res.status}: ${text.slice(0, 100)}` };
        }

        const result = await res.json();
        console.log('[Injected Script] Post note successful:', result);
        return { success: true, result };
      } catch (error) {
        console.error('[Injected Script] Error:', error);
        return { success: false, error: error.message || String(error) };
      }
    }, { content });

    console.log('[Amplifier Extension] Result from tab:', result);
    return result || { success: false, error: 'No result from injected script' };
  } catch (error) {
    console.error('[Amplifier Extension] PostNote error:', error);
    return { success: false, error: error.message };
  }
}

// Track Amplifier session token
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.name === 'next-auth.session-token' &&
      changeInfo.cookie.domain.includes('amplify.elelem.expert')) {
    if (!changeInfo.removed) {
      chrome.storage.local.set({ amplifierSession: changeInfo.cookie.value });
    } else {
      chrome.storage.local.remove('amplifierSession');
    }
  }
});
