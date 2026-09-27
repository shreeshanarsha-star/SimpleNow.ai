// Smart Source — background service worker.
// Talks to SimpleNow.ai using the user's existing browser session
// (host_permissions in manifest.json let this fetch bypass page CORS and
// still carry the simplenow.ai session cookie — no separate login needed).

const API_BASE = "https://www.simplenow.ai";

// Clicking the toolbar icon opens the side panel (a persistent, dockable
// pane) instead of the small popup bubble Chrome draws near the icon --
// requested specifically so the panel can stay open and follow the
// recruiter from profile to profile instead of closing on every click away.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

async function apiPost(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 207) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

// Rebuilds a Blob from the base64 the panel sent (File objects don't
// reliably survive chrome.runtime.sendMessage's structured clone across
// contexts, so the panel reads the file as a data URL and hands us the
// base64 payload instead).
function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

// The JD/CV drop endpoint takes multipart form data (a real file), not
// JSON -- same one-file-per-request contract the web app's drop box uses.
async function apiPostFile(path, { fileName, mimeType, base64, dropId }) {
  const blob = base64ToBlob(base64, mimeType);
  const form = new FormData();
  form.append("file", blob, fileName || "upload");
  if (dropId) form.append("dropId", dropId);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

// Briefly flashes a green checkmark on the toolbar icon so there's visible
// confirmation of a successful add even after the popup has closed (e.g.
// after a bulk add from the search-results bar).
function flashSuccessBadge(count) {
  chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
  chrome.action.setBadgeText({ text: count && count > 1 ? String(count) : "✓" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case "GET_PROJECTS": {
          const data = await apiGet("/api/smart-source/projects");
          sendResponse({ ok: true, projects: data.projects || [] });
          break;
        }
        case "CHECK_DUPLICATE": {
          const params = new URLSearchParams({ profile_url: message.profileUrl || "" });
          const data = await apiGet(`/api/smart-source/extension/check?${params}`);
          sendResponse({ ok: true, projects: data.projects || [], candidate: data.candidate || null });
          break;
        }
        case "CONTACT_LOOKUP": {
          // AI-assisted search for a publicly available email/phone for this
          // person -- only ever surfaces something already public (never a
          // guessed address), so a "not found" result is normal and expected.
          const params = new URLSearchParams({
            name: message.name || "",
            company: message.company || "",
            profile_url: message.profileUrl || "",
          });
          const data = await apiGet(`/api/smart-source/extension/contact-lookup?${params}`);
          sendResponse({ ok: true, email: data.email || null, phone: data.phone || null, sourceUrl: data.source_url || null });
          break;
        }
        case "CAPTURE_CANDIDATES": {
          // message.payload: { projectId?, newProjectName?, comment?, candidates: [...] }
          const data = await apiPost("/api/smart-source/extension/capture", message.payload);
          const addedCount = (data.results || []).filter((r) => r.status === "added").length;
          if (addedCount > 0) flashSuccessBadge(addedCount);
          sendResponse({ ok: true, data });
          break;
        }
        case "SUMMARIZE_PROFILE": {
          // message.payload: { name, designation, company, location, experience_years, raw_text }
          const data = await apiPost("/api/smart-source/extension/summarize", message.payload);
          sendResponse({ ok: true, lines: data.lines || [] });
          break;
        }
        case "DROP_FILE": {
          // message.payload: { projectId, dropId, fileName, mimeType, base64 }
          const { projectId, ...file } = message.payload;
          const data = await apiPostFile(`/api/smart-source/projects/${projectId}/drop`, file);
          sendResponse({ ok: true, data });
          break;
        }
        case "CHECK_SESSION": {
          try {
            await apiGet("/api/smart-source/projects");
            sendResponse({ ok: true, signedIn: true });
          } catch (err) {
            sendResponse({ ok: true, signedIn: false, error: err.message });
          }
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  })();
  return true; // keep the message channel open for the async response
});

// ---------- Right-click "Add to Smart Source" ----------
// Two entries: one for a LinkedIn profile *link* (e.g. a row on a search
// results page, where the profile isn't open) and one for the page itself,
// for when you're already looking at someone's profile and just want to
// add them without opening the toolbar popup manually. Chrome only ever
// shows one of the two for a given click -- "link" wins when the cursor is
// over a link, "page" only fires on blank page space -- so they never
// collide or duplicate.

const LINK_CONTEXT_MENU_ID = "smart-source-add-link";
const PAGE_CONTEXT_MENU_ID = "smart-source-add-page";
const PROFILE_URL_PATTERNS = [
  "https://www.linkedin.com/in/*",
  "https://www.linkedin.com/talent/profile/*",
];

function registerContextMenus() {
  // removeAll() first so a manual reload in chrome://extensions never hits
  // a "duplicate id" error that silently drops one of the two menu items.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: LINK_CONTEXT_MENU_ID,
      title: "Add to Smart Source",
      contexts: ["link"],
      targetUrlPatterns: PROFILE_URL_PATTERNS,
    });
    chrome.contextMenus.create({
      id: PAGE_CONTEXT_MENU_ID,
      title: "Add to Smart Source",
      contexts: ["page"],
      documentUrlPatterns: PROFILE_URL_PATTERNS,
    });
  });
}

chrome.runtime.onInstalled.addListener(registerContextMenus);
// Also register unconditionally at top level, which runs every time this
// service worker boots -- on browser startup, on waking from idle, and
// (crucially for development) on every manual "reload" in chrome://extensions,
// even in the rare case Chrome doesn't fire onInstalled for that reload.
registerContextMenus();

function openSidePanelOrBadge(tabId) {
  if (!tabId) return;
  chrome.sidePanel.open({ tabId }).catch(() => {
    // Opening it programmatically needs a direct user gesture and can be
    // refused on some Chrome versions/policies -- the pending candidate is
    // still stashed and picked up next time the recruiter opens the panel
    // themselves via the toolbar icon.
    flashSuccessBadge(0);
    chrome.action.setBadgeText({ text: "1" });
    chrome.action.setBadgeBackgroundColor({ color: "#6d3ff0" });
  });
}

function sendTabMessageSafe(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === LINK_CONTEXT_MENU_ID) {
    if (!info.linkUrl) return;

    // We don't have the target profile open, so we only get what LinkedIn
    // exposes in the link itself — the URL, and usually the visible link text
    // as a name. Stash it and open the side panel so the recruiter picks the
    // project through the same picker as a normal add, rather than silently
    // guessing which project to file it under.
    const u = new URL(info.linkUrl);
    u.search = "";
    u.hash = "";
    const candidate = {
      profile_url: u.toString(),
      name: (info.linkText || "").trim() || null,
      designation: null,
      company: null,
      location: null,
      experience_years: null,
    };

    // Open first, synchronously, so this stays a direct response to the
    // click -- Chrome requires that for sidePanel.open() -- then stash the
    // candidate; the panel's own storage listener picks it up right after.
    if (tab?.id) openSidePanelOrBadge(tab.id);
    await chrome.storage.local.set({ pendingCapture: candidate });
    return;
  }

  if (info.menuItemId === PAGE_CONTEXT_MENU_ID) {
    // Right-clicked blank space on a profile page already being viewed --
    // open the panel immediately (same direct-gesture requirement as
    // above), then scrape the page the same way a normal toolbar click
    // would, so the panel fills in with the full profile (and its contact
    // lookup) rather than just a bare name/URL.
    if (!tab?.id) return;
    openSidePanelOrBadge(tab.id);
    const res = await sendTabMessageSafe(tab.id, { type: "SCRAPE_PROFILE" });
    if (res?.profile?.name) {
      await chrome.storage.local.set({ pendingCapture: res.profile });
    }
    // If the content script wasn't ready, no pendingCapture gets stashed
    // and the panel falls back to its own active-tab scrape.
  }
});
