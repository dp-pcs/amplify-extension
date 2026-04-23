# Amplifier — Substack Cookie Sync Extension

Chrome extension for one-click synchronization of your Substack session cookie to Amplifier.

## What it does

This extension provides two key features:

1. **Cookie Sync**: One-click synchronization of your Substack session cookie to your Amplifier account
2. **One-Click Posting**: Automatically post notes and restacks to Substack directly from Amplifier without manual copy/paste

The extension uses your browser's existing Substack login session, bypassing Cloudflare bot protection that blocks server-side requests.

## Installation

### Load Unpacked Extension

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/dp-pcs/amplify-extension.git
   ```

2. Open Chrome and navigate to `chrome://extensions`

3. Enable **Developer mode** (toggle in top-right corner)

4. Click **"Load unpacked"**

5. Navigate to and select the `amplify-extension` folder (the root folder of this repository)

6. The Amplifier extension icon should appear in your extensions toolbar

**Note:** The extension files (`manifest.json`, `background.js`, etc.) are at the root of this repository, so you point Chrome directly to the repository folder.

## Usage

### Prerequisites

1. You must be logged into [Amplifier](https://amplify.elelem.expert) first
2. You must be logged into [Substack](https://substack.com)

### Syncing Your Cookie

1. While on any Substack page (e.g., substack.com), click the Amplifier extension icon in your toolbar
2. Click the **"Sync Cookie to Amplifier"** button
3. Wait for the success message: "✅ Cookie saved!"
4. Your Substack session is now synced to your Amplifier account

### Dev Mode

The extension includes a **Dev mode** toggle for testing against a local development server:

- **Off** (default): Syncs to production at `amplify.elelem.expert`
- **On**: Syncs to local development server at `localhost:3000`

Click the toggle in the bottom-left of the extension popup to switch between modes.

## Architecture

### Files

- **manifest.json**: Extension configuration (permissions, icons, background worker)
- **popup.html**: Extension popup UI
- **popup.js**: Popup interaction logic (button clicks, status updates)
- **background.js**: Service worker that fetches cookie and sends to API
- **content.js**: Content script for one-click posting functionality
- **icon16.png, icon48.png, icon128.png**: Extension icons (placeholder purple squares)

### How It Works

#### Cookie Sync
1. **User clicks "Sync Cookie"** in the popup
2. **popup.js** sends a message to the background service worker
3. **background.js** fetches the `connect.sid` cookie from `substack.com` using the Chrome Cookies API
4. **background.js** POSTs the cookie to `/api/settings/cookie` on the Amplifier server
5. **API endpoint** validates the user's session and saves the cookie to DynamoDB
6. **background.js** returns success/error to the popup
7. **popup.js** displays the result to the user

#### One-Click Posting
1. **User clicks "Post to Substack"** or schedules posts in Amplifier
2. **Amplifier web app** sends a message to the extension via `window.postMessage`
3. **content.js** receives the message and forwards to **background.js**
4. **background.js** creates a new Substack tab (or uses existing)
5. Extension injects script into Substack tab to make API calls with user's session
6. Substack sees a legitimate browser request from logged-in user (bypasses Cloudflare)
7. Post/restack is created and result is returned to Amplifier

## Security Notes

- The extension requires you to be authenticated with Amplifier (via NextAuth session)
- Cookies are transmitted over HTTPS to the Amplifier API
- The Substack cookie is stored securely in DynamoDB, masked when displayed in the UI
- The extension only accesses cookies from `substack.com` and only when you explicitly click "Sync Cookie"

## Permissions

The extension requests the following permissions:

- **cookies**: To read the `connect.sid` cookie from Substack
- **activeTab**: To check if you're on a Substack page
- **storage**: To save dev mode preference
- **scripting**: To inject code for one-click posting
- **host_permissions**:
  - `https://*.substack.com/*`: To access Substack cookies and inject posting scripts
  - `https://amplify.elelem.expert/*`: To send cookies to production API and enable one-click posting
  - `http://localhost:3000/*`: To send cookies to development API

## Development

### Testing Locally

1. Start the Amplifier web app locally: `npm run dev` in the Amplifier web app repository
2. Load the extension as described in **Installation**
3. Toggle **Dev mode** to **On** in the extension popup
4. Click **"Sync Cookie to Amplifier"**
5. Check the browser console and server logs for debugging

### Making Changes

After making changes to extension files:

1. Go to `chrome://extensions`
2. Click the **refresh icon** on the Amplifier extension card
3. Close and reopen the popup to see changes

For background script changes, you may need to reload the extension completely.

## Features

### Cookie Sync
Allows Amplifier to access your Substack session for fallback operations.

### One-Click Posting
When you click "Post to Substack" or "Schedule All Posts" in Amplifier:
1. The extension detects the action via message passing
2. Opens or switches to a Substack tab
3. Injects code that makes API calls using your browser's existing login session
4. Posts the note or restack automatically - no manual pasting required!
5. Supports scheduled posting with specific timestamps

**How it works:**
- Extension listens for messages from the Amplifier web app
- Uses `chrome.tabs` API to manage Substack tabs
- Injects scripts into Substack context via `chrome.scripting`
- Uses `chrome.cookies` API to ensure authentication
- Cloudflare sees a legitimate browser request from a logged-in user ✅

### Fallback Mode
If the extension isn't installed or encounters an error, Amplifier falls back to the manual clipboard + open workflow.

## Troubleshooting

### Extension not appearing
- Make sure Developer mode is enabled in `chrome://extensions`
- Try reloading the extension
- Check the Chrome console for errors (right-click extension icon → Inspect popup)

### Posts not going through
- Make sure you're logged into Substack in the same browser
- Check the extension console (chrome://extensions → Details → Inspect views: background page)
- Make sure the extension has permission to access Substack and Amplifier domains

### Dev mode not working
- Make sure the Amplifier web app is running on `localhost:3000`
- Check the console for CORS errors
- Verify the extension has `http://localhost:3000/*` in host_permissions

## Future Improvements

- Add proper icons with the "A" logo (currently placeholder purple squares)
- Add visual indicator when on a Substack page
- Add cookie expiration warning
- Support for other platforms (LinkedIn, etc.)
- Add notification badge when extension successfully posts
- Add analytics/activity log for posts made through extension
