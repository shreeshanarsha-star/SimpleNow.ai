const app = document.getElementById("app");

function initials(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function sendTabMessage(tabId, msg) {
  return new Promise((resolve) => chrome.tabs.sendMessage(tabId, msg, resolve));
}

// Turns a found phone number into a WhatsApp click-to-chat link. wa.me needs
// plain digits with a country code and no "+", spaces, or punctuation --
// this is a best-effort clean-up of whatever the AI lookup found verbatim in
// a public search snippet, not a validator that the number is on WhatsApp or
// even correctly formatted; the recruiter still sees the number and should
// glance at it before sending.
function toWhatsAppLink(phone) {
  if (!phone) return null;
  let digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2); // "00 <cc>" -> "<cc>" trunk prefix
  if (digits.length < 8 || digits.length > 15) return null; // too short/long to plausibly be a full intl number
  return `https://wa.me/${digits}`;
}

const ICONS = {
  ai: '<svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor"><path d="M10 1l2.2 5.8L18 9l-5.8 2.2L10 17l-2.2-5.8L2 9l5.8-2.2z"/></svg>',
  email:
    '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="4" width="16" height="12" rx="2"/><path d="M3 5.5l7 5.5 7-5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  phone:
    '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 3h3l1.5 4L6.5 8.5a10 10 0 0 0 5 5L13 11.5l4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A14 14 0 0 1 3 5.6 1.5 1.5 0 0 1 4 3z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy:
    '<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-8A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14H6" stroke-linecap="round"/></svg>',
  check:
    '<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10.5l4.5 4.5L17 5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  whatsapp:
    '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 3h3l1.5 4L6.5 8.5a10 10 0 0 0 5 5L13 11.5l4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A14 14 0 0 1 3 5.6 1.5 1.5 0 0 1 4 3z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const PROFILE_URL_RE = /^https:\/\/www\.linkedin\.com\/(in|talent\/profile)\//;

// Bumped on every refresh() call so an in-flight scrape from a tab the
// panel already moved on from can't clobber the current render with a
// stale profile.
let renderToken = 0;

function showHint() {
  app.innerHTML = `<div class="hint">Open a LinkedIn profile to add it to a Smart Source project — this panel stays open and follows you as you browse.<br><br>On LinkedIn search results, select profiles with the checkboxes that appear on each result — a bar at the bottom adds them in bulk.<br><br>You can also right-click anywhere on a profile page, or right-click any LinkedIn profile link, and choose "Add to Smart Source".</div>`;
}

function showSignInHint() {
  app.innerHTML = `<div class="hint">You're not signed in to SimpleNow.ai in this browser. <a href="https://www.simplenow.ai/login" target="_blank">Sign in</a>, then reopen this panel.</div>`;
}

async function refresh() {
  const myToken = ++renderToken;
  const stale = () => myToken !== renderToken;

  // A right-click "Add to Smart Source" -- on a link, or on a profile page
  // itself -- stashes a candidate in storage. That always takes priority
  // over whatever tab happens to be active, and is consumed once.
  const { pendingCapture } = await chrome.storage.local.get("pendingCapture");
  if (stale()) return;

  if (pendingCapture) {
    await chrome.storage.local.remove("pendingCapture");
    const session = await sendMessage({ type: "CHECK_SESSION" });
    if (stale()) return;
    if (!session?.ok || session.signedIn === false) {
      showSignInHint();
      return;
    }
    const projectsRes = await sendMessage({ type: "GET_PROJECTS" });
    if (stale()) return;
    render(pendingCapture, projectsRes?.ok ? projectsRes.projects : []);
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (stale()) return;

  if (!tab?.url || !PROFILE_URL_RE.test(tab.url)) {
    showHint();
    return;
  }

  const session = await sendMessage({ type: "CHECK_SESSION" });
  if (stale()) return;
  if (!session?.ok || session.signedIn === false) {
    showSignInHint();
    return;
  }

  const scrapeRes = await sendTabMessage(tab.id, { type: "SCRAPE_PROFILE" });
  if (stale()) return;
  const profile = scrapeRes?.profile;
  if (!profile || !profile.name) {
    app.innerHTML = `<div class="hint">Couldn't read this profile yet — try reloading the LinkedIn page.</div>`;
    return;
  }

  const projectsRes = await sendMessage({ type: "GET_PROJECTS" });
  if (stale()) return;
  render(profile, projectsRes?.ok ? projectsRes.projects : []);
}

async function render(profile, projects) {
  const { lastProjectId } = await chrome.storage.local.get("lastProjectId");
  let selectedProjectId = projects.some((p) => p.id === lastProjectId) ? lastProjectId : projects[0]?.id || "";

  app.innerHTML = `
    <div class="label">Detected from this page</div>
    <div class="candidate-card">
      <div class="avatar">${initials(profile.name)}</div>
      <div class="candidate-info">
        <div class="candidate-name">${escapeHtml(profile.name)}</div>
        <div class="candidate-role">${escapeHtml(profile.designation || "")}</div>
        <div class="candidate-meta">${escapeHtml([profile.company, profile.location].filter(Boolean).join(" · "))}</div>
        <div class="contact-block" id="contact-block">
          <div class="contact-loading"><span class="spinner"></span> Looking up public contact…</div>
        </div>
      </div>
    </div>
    <div class="dup-note" id="dup-note" style="display:none;"></div>

    <div class="label" style="margin-top:16px;">Add to project</div>
    <div id="project-picker">
      <div class="dropdown" id="project-dropdown">
        <button type="button" class="dropdown-trigger" id="project-trigger">
          <span id="project-trigger-label">Pick a project</span>
          <svg width="10" height="6" viewBox="0 0 10 6" class="chevron" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="dropdown-menu" id="project-menu"></div>
      </div>
      <div class="toggle-link" id="new-project-toggle">or create a new project</div>
      <div class="new-project-row" id="new-project-row" style="display:none;">
        <input type="text" id="new-project-name" placeholder="New project name" />
      </div>
    </div>

    <div class="label" style="margin-top:12px;">Note (optional)</div>
    <textarea class="comment-input" id="comment-input" placeholder="e.g. Referred by Dr Sophiya"></textarea>

    <button class="add-btn" id="add-btn">Add to Smart Source →</button>
    <div class="status" id="status"></div>
  `;

  // ---------- Custom project dropdown ----------
  const dropdown = document.getElementById("project-dropdown");
  const trigger = document.getElementById("project-trigger");
  const triggerLabel = document.getElementById("project-trigger-label");
  const menu = document.getElementById("project-menu");

  function projectLabel(p) {
    return `${p.name} · ${p.candidateCount ?? 0} candidates`;
  }

  function renderMenu() {
    if (!projects.length) {
      menu.innerHTML = `<div class="dropdown-empty">No projects yet — create one below</div>`;
      triggerLabel.textContent = "No projects yet";
      return;
    }
    menu.innerHTML = projects
      .map((p) => {
        const active = p.id === selectedProjectId;
        return `<div class="dropdown-item${active ? " dropdown-item--active" : ""}" data-id="${p.id}">
          <span>${escapeHtml(projectLabel(p))}</span>
          ${active ? `<span class="check">${ICONS.check}</span>` : ""}
        </div>`;
      })
      .join("");
    const selected = projects.find((p) => p.id === selectedProjectId);
    triggerLabel.textContent = selected ? projectLabel(selected) : "Pick a project";
  }

  function closeMenu() {
    dropdown.classList.remove("dropdown--open");
  }
  function openMenu() {
    if (!projects.length || trigger.disabled) return;
    dropdown.classList.add("dropdown--open");
  }

  trigger.addEventListener("click", () => {
    dropdown.classList.contains("dropdown--open") ? closeMenu() : openMenu();
  });
  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".dropdown-item[data-id]");
    if (!item) return;
    selectedProjectId = item.dataset.id;
    renderMenu();
    closeMenu();
  });
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  renderMenu();

  const toggle = document.getElementById("new-project-toggle");
  const row = document.getElementById("new-project-row");
  const nameInput = document.getElementById("new-project-name");
  const commentInput = document.getElementById("comment-input");
  const addBtn = document.getElementById("add-btn");
  const status = document.getElementById("status");
  const dupNote = document.getElementById("dup-note");
  const contactBlock = document.getElementById("contact-block");

  // Check up front whether this candidate is already somewhere, rather than
  // only finding out after Add is clicked.
  if (profile.profile_url) {
    sendMessage({ type: "CHECK_DUPLICATE", profileUrl: profile.profile_url }).then((res) => {
      if (!document.body.contains(dupNote)) return; // panel moved on to a different profile
      if (res?.ok && res.projects?.length) {
        dupNote.textContent = `Already in ${res.projects.map((p) => p.name).join(", ")}`;
        dupNote.style.display = "block";
      }
    });
  }

  // ---------- AI-assisted public contact lookup ----------
  // Runs alongside the duplicate check, right when the profile is detected,
  // so it's ready by the time the recruiter picks a project. Only ever
  // surfaces something already public; "No public contact found" is the
  // normal, expected result most of the time.
  let foundContact = { email: null, phone: null, sourceUrl: null };
  if (profile.name) {
    sendMessage({
      type: "CONTACT_LOOKUP",
      name: profile.name,
      company: profile.company || "",
      profileUrl: profile.profile_url || "",
    }).then((res) => {
      if (!document.body.contains(contactBlock)) return; // panel moved on

      if (!res?.ok || (!res.email && !res.phone)) {
        contactBlock.innerHTML = `<div class="contact-empty">No public contact found</div>`;
        return;
      }

      foundContact = { email: res.email || null, phone: res.phone || null, sourceUrl: res.sourceUrl || null };
      const waLink = toWhatsAppLink(res.phone);
      let sourceHost = "";
      try {
        sourceHost = res.sourceUrl ? new URL(res.sourceUrl).hostname.replace(/^www\./, "") : "";
      } catch {
        sourceHost = "";
      }

      contactBlock.innerHTML = `
        <div class="contact-tag">${ICONS.ai} AI-found contact</div>
        ${
          res.email
            ? `<div class="contact-row">
                <span class="contact-icon">${ICONS.email}</span>
                <span class="contact-value" title="${escapeHtml(res.email)}">${escapeHtml(res.email)}</span>
                <button type="button" class="icon-btn" data-copy="${escapeHtml(res.email)}" title="Copy email">${ICONS.copy}</button>
              </div>`
            : ""
        }
        ${
          res.phone
            ? `<div class="contact-row">
                <span class="contact-icon">${ICONS.phone}</span>
                <span class="contact-value" title="${escapeHtml(res.phone)}">${escapeHtml(res.phone)}</span>
                <button type="button" class="icon-btn" data-copy="${escapeHtml(res.phone)}" title="Copy phone">${ICONS.copy}</button>
                ${
                  waLink
                    ? `<a class="icon-btn icon-btn--whatsapp" href="${waLink}" target="_blank" rel="noopener noreferrer" title="Message on WhatsApp">${ICONS.whatsapp}</a>`
                    : ""
                }
              </div>`
            : ""
        }
        ${
          sourceHost
            ? `<div class="contact-source">Found via <span>${escapeHtml(sourceHost)}</span> — double-check before using</div>`
            : ""
        }
      `;

      contactBlock.querySelectorAll(".icon-btn[data-copy]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(btn.dataset.copy);
            btn.classList.add("icon-btn--copied");
            const original = btn.innerHTML;
            btn.innerHTML = ICONS.check;
            setTimeout(() => {
              btn.classList.remove("icon-btn--copied");
              btn.innerHTML = original;
            }, 1100);
          } catch {
            // Clipboard access can be blocked in some contexts -- the value
            // is still right there in the row to select and copy by hand.
          }
        });
      });
    });
  }

  let creatingNew = false;
  toggle.addEventListener("click", () => {
    creatingNew = !creatingNew;
    row.style.display = creatingNew ? "block" : "none";
    trigger.disabled = creatingNew;
    dropdown.classList.toggle("dropdown--disabled", creatingNew);
    if (creatingNew) closeMenu();
    toggle.textContent = creatingNew ? "or pick an existing project" : "or create a new project";
    if (creatingNew) nameInput.focus();
  });

  addBtn.addEventListener("click", async () => {
    const candidatePayload = { ...profile };
    if (foundContact.email) candidatePayload.contact_email = foundContact.email;
    if (foundContact.phone) candidatePayload.contact_phone = foundContact.phone;
    if (foundContact.sourceUrl) candidatePayload.contact_source_url = foundContact.sourceUrl;

    const payload = { candidates: [candidatePayload] };
    const comment = commentInput.value.trim();
    if (comment) payload.comment = comment;

    if (creatingNew) {
      const name = nameInput.value.trim();
      if (!name) {
        status.textContent = "Name the new project first.";
        status.className = "status status--error";
        return;
      }
      payload.newProjectName = name;
    } else {
      if (!selectedProjectId) {
        status.textContent = "Pick a project first.";
        status.className = "status status--error";
        return;
      }
      payload.projectId = selectedProjectId;
    }

    addBtn.disabled = true;
    addBtn.textContent = "Adding…";
    status.textContent = "";

    const res = await sendMessage({ type: "CAPTURE_CANDIDATES", payload });
    addBtn.disabled = false;
    addBtn.textContent = "Add to Smart Source →";

    if (!res?.ok) {
      status.textContent = res?.error || "Something went wrong.";
      status.className = "status status--error";
      return;
    }

    const result = (res.data?.results || [])[0];
    const projectName = res.data?.projectName || "the project";
    if (result?.status === "duplicate") {
      status.textContent = `Already in ${projectName}`;
      status.className = "status status--error";
    } else if (result?.status === "failed") {
      status.textContent = result.error || "Couldn't add this candidate.";
      status.className = "status status--error";
    } else {
      status.textContent = `Added to ${projectName} ✓`;
      status.className = "status status--ok";
      if (res.data?.projectId) chrome.storage.local.set({ lastProjectId: res.data.projectId });
    }
  });
}

// ---------- Keep the panel in sync as the recruiter browses ----------
// A side panel is one persistent document for the whole window, not a
// fresh popup opened per click -- these listeners are what make it follow
// along instead of only ever showing whichever profile was active when it
// was first opened.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.pendingCapture) refresh();
});
chrome.tabs.onActivated.addListener(() => refresh());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) refresh();
});

refresh();
