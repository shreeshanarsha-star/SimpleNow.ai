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

  const expValue = typeof profile.experience_years === "number" ? String(profile.experience_years) : "";

  app.innerHTML = `
    <div class="label">Detected from this page</div>
    <div class="candidate-card">
      <div class="avatar">${initials(profile.name)}</div>
      <div class="candidate-info">
        <div class="candidate-name">${escapeHtml(profile.name)}</div>
      </div>
    </div>
    <div class="dup-note" id="dup-note" style="display:none;"></div>

    <div class="label" style="margin-top:14px;">Candidate details</div>
    <div class="field-grid">
      <div class="field">
        <label class="field-label" for="field-role">Role</label>
        <input class="field-input" id="field-role" placeholder="add role" value="${escapeHtml(profile.designation || "")}" />
      </div>
      <div class="field">
        <label class="field-label" for="field-company">Company</label>
        <input class="field-input" id="field-company" placeholder="add company" value="${escapeHtml(profile.company || "")}" />
      </div>
      <div class="field">
        <label class="field-label" for="field-location">Location</label>
        <input class="field-input" id="field-location" placeholder="add location" value="${escapeHtml(profile.location || "")}" />
      </div>
      <div class="field">
        <label class="field-label" for="field-experience">Experience (yrs)</label>
        <input class="field-input" id="field-experience" type="number" min="0" max="60" step="0.5" placeholder="add exp" value="${escapeHtml(expValue)}" />
      </div>
      <div class="field">
        <label class="field-label" for="field-email">Email</label>
        <input class="field-input" id="field-email" type="email" placeholder="add email" value="" />
      </div>
      <div class="field">
        <label class="field-label" for="field-phone">Phone</label>
        <div class="field-with-icon">
          <input class="field-input" id="field-phone" placeholder="add phone" value="" />
          <a class="icon-btn icon-btn--whatsapp" id="field-phone-wa" href="#" target="_blank" rel="noopener noreferrer" title="Message on WhatsApp" style="display:none;">${ICONS.whatsapp}</a>
        </div>
      </div>
      <div class="field-hint" id="contact-status"><span class="spinner"></span> Looking up public contact…</div>
      <div class="field full">
        <label class="field-label">CTC — current → expected</label>
        <div class="ctc-row">
          <input class="field-input" id="field-ctc-current" placeholder="current" />
          <span class="ctc-arrow">→</span>
          <input class="field-input" id="field-ctc-expected" placeholder="expected" />
        </div>
      </div>
      <div class="field full">
        <label class="field-label" for="field-notice">Notice period</label>
        <input class="field-input" id="field-notice" placeholder="e.g. 30 days, immediate" />
      </div>
    </div>

    <div class="label" style="margin-top:16px;">AI Profile Summary</div>
    <div class="summary-box" id="summary-box">
      <button type="button" class="summarize-btn" id="summarize-btn">Summarize this profile</button>
      <div class="summary-lines" id="summary-lines" style="display:none;"></div>
      <div class="summary-hint" id="summary-hint"></div>
    </div>

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

    <div class="label" style="margin-top:16px;">Drop JD / CVs into this project</div>
    <div class="drop-box" id="drop-box">
      <input type="file" id="drop-file-input" multiple accept=".pdf,.doc,.docx,.txt" style="display:none;" />
      <span class="drop-box-text">Drag a JD or CVs here, or <span class="drop-box-browse">browse</span></span>
    </div>
    <div class="drop-status" id="drop-status"></div>

    <div class="label" style="margin-top:12px;">Note (optional)</div>
    <textarea class="comment-input" id="comment-input" placeholder="e.g. Referred by Dr Sophiya (adds a new note even if already added)"></textarea>

    <button class="add-btn" id="add-btn">Add to Smart Source →</button>
    <div class="status" id="status"></div>
  `;

  // ---------- Custom project dropdown ----------
  const dropdown = document.getElementById("project-dropdown");
  const trigger = document.getElementById("project-trigger");
  const triggerLabel = document.getElementById("project-trigger-label");
  const menu = document.getElementById("project-menu");
  let projectFilter = "";

  function projectLabel(p) {
    return `${p.name} · ${p.candidateCount ?? 0} candidates`;
  }

  function renderMenuItems() {
    const itemsEl = menu.querySelector("#project-menu-items");
    if (!itemsEl) return;
    const q = projectFilter.trim().toLowerCase();
    const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
    itemsEl.innerHTML = filtered.length
      ? filtered
          .map((p) => {
            const active = p.id === selectedProjectId;
            return `<div class="dropdown-item${active ? " dropdown-item--active" : ""}" data-id="${p.id}">
              <span>${escapeHtml(projectLabel(p))}</span>
              ${active ? `<span class="check">${ICONS.check}</span>` : ""}
            </div>`;
          })
          .join("")
      : `<div class="dropdown-empty">No projects match "${escapeHtml(projectFilter)}"</div>`;
  }

  function renderMenu() {
    if (!projects.length) {
      menu.innerHTML = `<div class="dropdown-empty">No projects yet — create one below</div>`;
      triggerLabel.textContent = "No projects yet";
      return;
    }
    // The search box is only built once and reused across re-renders --
    // rebuilding it on every keystroke (e.g. via menu.innerHTML = ...)
    // would steal focus back from the user mid-type. Only the filtered
    // items list underneath it gets replaced.
    if (!menu.querySelector("#project-search")) {
      menu.innerHTML = `
        <input type="text" id="project-search" class="dropdown-search" placeholder="Search projects…" autocomplete="off" />
        <div class="dropdown-items" id="project-menu-items"></div>
      `;
      menu.querySelector("#project-search").addEventListener("input", (e) => {
        projectFilter = e.target.value;
        renderMenuItems();
      });
    }
    renderMenuItems();
    const selected = projects.find((p) => p.id === selectedProjectId);
    triggerLabel.textContent = selected ? projectLabel(selected) : "Pick a project";
  }

  function closeMenu() {
    dropdown.classList.remove("dropdown--open");
  }
  function openMenu() {
    if (!projects.length || trigger.disabled) return;
    dropdown.classList.add("dropdown--open");
    const searchInput = menu.querySelector("#project-search");
    if (searchInput) {
      searchInput.value = "";
      projectFilter = "";
      renderMenuItems();
      // Focus once the menu's display:flex has taken effect -- some
      // browsers won't focus a still-hidden input.
      setTimeout(() => searchInput.focus(), 0);
    }
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
    updateDropBoxState();
  });
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  renderMenu();

  // ---------- JD / CV drop box ----------
  // Same one-file-per-request contract as the web app's project drop box
  // (see /api/smart-source/projects/[id]/drop): a JD replaces the
  // project's active JD, a CV is parsed into a new candidate and scored
  // against the JD if one is already on file. Requires an existing,
  // already-selected project -- there's no project id yet while creating
  // a new one, so it's disabled in that state.
  const dropBox = document.getElementById("drop-box");
  const dropFileInput = document.getElementById("drop-file-input");
  const dropStatus = document.getElementById("drop-status");

  function updateDropBoxState() {
    const disabled = creatingNew || !selectedProjectId;
    dropBox.classList.toggle("drop-box--disabled", disabled);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleDropFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (creatingNew || !selectedProjectId) {
      dropStatus.textContent = "Pick an existing project above first, then drop files.";
      dropStatus.className = "drop-status drop-status--error";
      return;
    }

    const dropId =
      (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let done = 0;
    let failed = 0;
    dropStatus.textContent = `Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`;
    dropStatus.className = "drop-status";

    for (const file of files) {
      try {
        const base64 = await fileToBase64(file);
        const res = await sendMessage({
          type: "DROP_FILE",
          payload: { projectId: selectedProjectId, dropId, fileName: file.name, mimeType: file.type, base64 },
        });
        if (res?.ok && res.data?.status !== "failed") {
          done++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    if (failed === 0) {
      dropStatus.textContent = `${done} file${done > 1 ? "s" : ""} added ✓`;
      dropStatus.className = "drop-status drop-status--ok";
    } else {
      dropStatus.textContent = `${done} added, ${failed} failed`;
      dropStatus.className = "drop-status drop-status--error";
    }
    dropFileInput.value = "";
  }

  dropBox.addEventListener("click", () => {
    if (dropBox.classList.contains("drop-box--disabled")) return;
    dropFileInput.click();
  });
  dropFileInput.addEventListener("change", () => handleDropFiles(dropFileInput.files));
  dropBox.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dropBox.classList.contains("drop-box--disabled")) dropBox.classList.add("drop-box--dragover");
  });
  dropBox.addEventListener("dragleave", () => dropBox.classList.remove("drop-box--dragover"));
  dropBox.addEventListener("drop", (e) => {
    e.preventDefault();
    dropBox.classList.remove("drop-box--dragover");
    if (!dropBox.classList.contains("drop-box--disabled")) handleDropFiles(e.dataTransfer?.files);
  });
  updateDropBoxState();

  // ---------- AI profile summary ----------
  // A 5-line, explicitly-estimated read on the candidate (location/age/
  // experience/qualification, expertise+industry, stability, red flags,
  // approx CTC) -- generated on demand rather than automatically, since it
  // costs a model call (and a market-rate search) per click. Whatever's
  // generated here rides along on Add so it's saved without a second,
  // redundant call from the server.
  const summarizeBtn = document.getElementById("summarize-btn");
  const summaryLinesEl = document.getElementById("summary-lines");
  const summaryHint = document.getElementById("summary-hint");
  let aiSummaryLines = null;

  summarizeBtn.addEventListener("click", async () => {
    summarizeBtn.disabled = true;
    summarizeBtn.textContent = "Summarizing…";
    summaryHint.textContent = "";
    const expRaw = fieldExperience.value.trim();
    const res = await sendMessage({
      type: "SUMMARIZE_PROFILE",
      payload: {
        name: profile.name || null,
        designation: fieldRole.value.trim() || null,
        company: fieldCompany.value.trim() || null,
        location: fieldLocation.value.trim() || null,
        experience_years: expRaw ? Number(expRaw) : null,
        raw_text: profile.raw_text || null,
      },
    });
    summarizeBtn.disabled = false;
    if (!res?.ok || !res.lines?.length) {
      summarizeBtn.textContent = "Summarize this profile";
      summaryHint.textContent = res?.error || "Couldn't generate a summary — try again.";
      return;
    }
    aiSummaryLines = res.lines;
    summarizeBtn.textContent = "Regenerate";
    summaryHint.textContent = "AI-estimated — double-check before relying on it.";
    summaryLinesEl.style.display = "block";
    summaryLinesEl.innerHTML = aiSummaryLines.map((line) => `<div class="summary-line">${escapeHtml(line)}</div>`).join("");
  });

  const toggle = document.getElementById("new-project-toggle");
  const row = document.getElementById("new-project-row");
  const nameInput = document.getElementById("new-project-name");
  const commentInput = document.getElementById("comment-input");
  const addBtn = document.getElementById("add-btn");
  const status = document.getElementById("status");
  const dupNote = document.getElementById("dup-note");
  const contactStatus = document.getElementById("contact-status");
  const fieldRole = document.getElementById("field-role");
  const fieldCompany = document.getElementById("field-company");
  const fieldLocation = document.getElementById("field-location");
  const fieldExperience = document.getElementById("field-experience");
  const fieldEmail = document.getElementById("field-email");
  const fieldPhone = document.getElementById("field-phone");
  const fieldPhoneWa = document.getElementById("field-phone-wa");
  const fieldCtcCurrent = document.getElementById("field-ctc-current");
  const fieldCtcExpected = document.getElementById("field-ctc-expected");
  const fieldNotice = document.getElementById("field-notice");

  // Only fills a field the recruiter hasn't already touched -- used by both
  // the contact lookup and the duplicate-details prefill below, which race
  // each other and shouldn't ever clobber something already showing.
  function fillIfEmpty(input, value) {
    if (input && !input.value.trim() && value) input.value = value;
  }

  function refreshWhatsAppIcon() {
    const link = toWhatsAppLink(fieldPhone.value.trim());
    if (link) {
      fieldPhoneWa.href = link;
      fieldPhoneWa.style.display = "flex";
    } else {
      fieldPhoneWa.style.display = "none";
    }
  }
  fieldPhone.addEventListener("input", refreshWhatsAppIcon);

  // Check up front whether this candidate is already somewhere, rather than
  // only finding out after Add is clicked.
  if (profile.profile_url) {
    sendMessage({ type: "CHECK_DUPLICATE", profileUrl: profile.profile_url }).then((res) => {
      if (!document.body.contains(dupNote)) return; // panel moved on to a different profile
      if (!res?.ok || !res.projects?.length) return;

      const names = res.projects.map((p) => p.name).join(", ");
      const c = res.candidate;
      if (c) {
        // Already on file somewhere -- prefill with what's actually saved
        // (not blank) so revisiting this profile corrects/completes a
        // record instead of looking like a fresh, empty form. Only fills
        // gaps: a value the recruiter already typed, or that the scrape/
        // contact lookup already supplied, is left alone.
        dupNote.textContent = `Already in ${names} — showing saved details below`;
        fillIfEmpty(fieldRole, c.designation);
        fillIfEmpty(fieldCompany, c.company);
        fillIfEmpty(fieldLocation, c.location);
        if (!fieldExperience.value.trim() && typeof c.experience_years === "number") {
          fieldExperience.value = String(c.experience_years);
        }
        fillIfEmpty(fieldEmail, c.public_email);
        fillIfEmpty(fieldPhone, c.public_phone);
        fillIfEmpty(fieldCtcCurrent, c.compensation);
        fillIfEmpty(fieldCtcExpected, c.expected_ctc);
        fillIfEmpty(fieldNotice, c.notice_period);
        refreshWhatsAppIcon();
        if (c.ai_summary && !aiSummaryLines) {
          aiSummaryLines = c.ai_summary.split("\n").filter(Boolean);
          summarizeBtn.textContent = "Regenerate";
          summaryHint.textContent = "Saved summary — click Regenerate for a fresh one.";
          summaryLinesEl.style.display = "block";
          summaryLinesEl.innerHTML = aiSummaryLines.map((line) => `<div class="summary-line">${escapeHtml(line)}</div>`).join("");
        }
      } else {
        dupNote.textContent = `Already in ${names}`;
      }
      dupNote.style.display = "block";
    });
  }

  // ---------- AI-assisted public contact lookup ----------
  // Runs alongside the duplicate check, right when the profile is detected,
  // so it's ready by the time the recruiter picks a project. Only ever
  // surfaces something already public; "No public contact found" is the
  // normal, expected result most of the time. Fills the Email/Phone fields
  // directly (only if still empty -- see fillIfEmpty) rather than showing a
  // separate read-only block, since those fields are now editable inline.
  let foundContactSourceUrl = null;
  if (profile.name) {
    sendMessage({
      type: "CONTACT_LOOKUP",
      name: profile.name,
      company: profile.company || "",
      profileUrl: profile.profile_url || "",
    }).then((res) => {
      if (!document.body.contains(contactStatus)) return; // panel moved on

      if (!res?.ok) {
        // A real failure (network/timeout/server error) -- distinct from
        // "we looked and found nothing", so it doesn't read as silently
        // broken. res.error comes from background.js's catch-all.
        contactStatus.textContent = `Contact lookup failed${res?.error ? `: ${res.error}` : ""} -- try again`;
        return;
      }
      if (!res.email && !res.phone) {
        contactStatus.textContent = "No public contact found";
        return;
      }

      fillIfEmpty(fieldEmail, res.email);
      fillIfEmpty(fieldPhone, res.phone);
      refreshWhatsAppIcon();
      foundContactSourceUrl = res.sourceUrl || null;

      let sourceHost = "";
      try {
        sourceHost = res.sourceUrl ? new URL(res.sourceUrl).hostname.replace(/^www\./, "") : "";
      } catch {
        sourceHost = "";
      }
      contactStatus.innerHTML = sourceHost
        ? `${ICONS.ai} AI-found via ${escapeHtml(sourceHost)} — double-check before using`
        : `${ICONS.ai} AI-found contact — double-check before using`;
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
    updateDropBoxState();
  });

  addBtn.addEventListener("click", async () => {
    // Everything below is read live from the details form at the moment of
    // Add -- whatever the recruiter typed or left as scraped/looked-up/
    // saved-value wins, since these fields are all directly editable.
    const expRaw = fieldExperience.value.trim();
    const candidatePayload = {
      profile_url: profile.profile_url,
      name: profile.name || null,
      designation: fieldRole.value.trim() || null,
      company: fieldCompany.value.trim() || null,
      location: fieldLocation.value.trim() || null,
      experience_years: expRaw ? Number(expRaw) : null,
      contact_email: fieldEmail.value.trim() || null,
      contact_phone: fieldPhone.value.trim() || null,
      contact_source_url: foundContactSourceUrl,
      compensation: fieldCtcCurrent.value.trim() || null,
      expected_ctc: fieldCtcExpected.value.trim() || null,
      notice_period: fieldNotice.value.trim() || null,
      raw_text: profile.raw_text || null,
      ai_summary: aiSummaryLines ? aiSummaryLines.join("\n") : null,
    };

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
    if (result?.status === "duplicate" && (result?.noteAdded || result?.detailsUpdated)) {
      // Already a member, but something from this visit was still saved --
      // an edited/filled-in detail, a new note, or both. A normal,
      // successful revisit, not an error, so it gets "ok" styling.
      const parts = [];
      if (result.detailsUpdated) parts.push("details updated");
      if (result.noteAdded) parts.push("note added");
      status.textContent = `Already in ${projectName} -- ${parts.join(" & ")} ✓`;
      status.className = "status status--ok";
      if (result.noteAdded) commentInput.value = "";
    } else if (result?.status === "duplicate") {
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
// The content script pings this on every LinkedIn client-side route change
// (profile A -> profile B without a real page load) -- see the URL watcher
// in content-linkedin.js. Without this, browsing from profile to profile
// inside one already-open tab would never re-trigger a scrape.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "PROFILE_URL_CHANGED") refresh();
});

refresh();
