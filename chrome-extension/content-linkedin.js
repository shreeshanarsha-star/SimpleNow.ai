// Smart Source — LinkedIn content script.
// Two jobs, depending on the page: (1) profile page — scrape on request from
// the popup; (2) search-results page — inject checkboxes + a floating bar
// for adding several profiles at once.

function text(el) {
  return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
}

// ---------- Profile page scraping ----------

function scrapeProfilePage() {
  // Name: LinkedIn always sets the tab title to "Full Name | LinkedIn" —
  // far more stable than any heading tag or class name. LinkedIn's newer
  // profile layout renders the name in an <h2> with hashed, build-specific
  // classes instead of the old <h1 class="text-heading-xlarge">, so relying
  // on the title avoids chasing markup churn.
  let name = document.title.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim() || null;
  if (!name) {
    name = text(document.querySelector("h1")) || text(document.querySelector("h2"));
  }

  // LinkedIn's own class names churn often; try a few known shapes, in
  // order. These are best-effort — if none match (as on the newer hashed-
  // class layout), the fields come back null and the capture still
  // succeeds with just the name and profile URL.
  const h1 = document.querySelector("h1");
  let designation = null;
  const headlineEl =
    document.querySelector(".text-body-medium.break-words") ||
    (h1 ? h1.parentElement?.querySelector(".text-body-medium") : null);
  designation = text(headlineEl);

  let location = null;
  const locationCandidates = document.querySelectorAll(".text-body-small.inline.t-black--light");
  if (locationCandidates.length) location = text(locationCandidates[0]);

  let company = null;
  const expCompanyLink = document.querySelector(
    '[data-view-name="profile-component-entity"] a[href*="/company/"]'
  );
  if (expCompanyLink) {
    company = text(expCompanyLink);
  } else if (designation && designation.includes(" at ")) {
    company = designation.split(" at ").slice(1).join(" at ").trim();
  }

  const profile_url = location_href_no_query();

  return {
    profile_url,
    name: name || null,
    designation: designation || null,
    company: company || null,
    location: location || null,
    experience_years: estimateExperienceYears(),
  };
}

// ---------- Best-effort total experience estimate ----------
// LinkedIn doesn't publish a single "years of experience" figure anywhere,
// and per-role durations aren't reliably parseable (concurrent roles at the
// same company would double-count if summed). Instead this estimates total
// career span: earliest start date found in the Experience section through
// to "Present" or the latest end date. That's the same rough number a
// recruiter would eyeball the section to get, and it degrades safely --
// any uncertainty (section not found, fewer than two dates, an
// implausible span) returns null and the field just stays manual, same as
// every other best-effort field this scraper produces.
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function findExperienceSection() {
  const anchor = document.getElementById("experience");
  if (anchor) {
    const section = anchor.closest("section");
    if (section) return section;
  }
  // Fallback: a section heading whose text is exactly "Experience" --
  // LinkedIn's section-header markup has changed shape more than once.
  const headings = document.querySelectorAll("h2, div.pvs-header__container, span");
  for (const h of headings) {
    if (/^experience$/i.test(text(h) || "")) {
      const section = h.closest("section");
      if (section) return section;
    }
  }
  return null;
}

function estimateExperienceYears() {
  try {
    const section = findExperienceSection();
    if (!section) return null;

    const monthGroup = MONTH_NAMES.join("|");
    const dateRe = new RegExp(`(?:(${monthGroup})\s+(\d{4}))|\b((?:19|20)\d{2})\b|\bPresent\b`, "gi");
    const raw = text(section) || "";
    const found = raw.match(dateRe) || [];
    if (found.length < 2) return null;

    const now = new Date();
    const toDate = (token) => {
      if (/present/i.test(token)) return now;
      const monthMatch = token.match(new RegExp(`(${monthGroup})\s+(\d{4})`, "i"));
      if (monthMatch) {
        const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === monthMatch[1].toLowerCase());
        return new Date(parseInt(monthMatch[2], 10), idx, 1);
      }
      const yearMatch = token.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) return new Date(parseInt(yearMatch[0], 10), 0, 1);
      return null;
    };

    const dates = found.map(toDate).filter(Boolean);
    if (dates.length < 2) return null;

    const earliest = Math.min(...dates.map((d) => d.getTime()));
    const latest = Math.max(...dates.map((d) => d.getTime()));
    const years = (latest - earliest) / (365.25 * 24 * 3600 * 1000);
    if (!isFinite(years) || years <= 0 || years > 55) return null;
    return Math.round(years * 10) / 10;
  } catch {
    return null;
  }
}

function location_href_no_query() {
  const u = new URL(window.location.href);
  u.search = "";
  u.hash = "";
  return u.toString();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCRAPE_PROFILE") {
    sendResponse({ ok: true, profile: scrapeProfilePage() });
    return true;
  }
});

// ---------- Search-results page: bulk select ----------

const isSearchResults = /\/search\/results\/people\//.test(window.location.pathname);

if (isSearchResults) {
  const selected = new Map(); // profile_url -> candidate data

  function findResultCards() {
    // Two shapes LinkedIn has used for a search-result row; keep both.
    return Array.from(
      document.querySelectorAll(
        "li.reusable-search__result-container, div[data-view-name='search-entity-result-universal-template']"
      )
    );
  }

  function scrapeCard(card) {
    const link = card.querySelector('a[href*="/in/"]');
    if (!link) return null;
    const u = new URL(link.href, window.location.origin);
    u.search = "";
    const profile_url = u.toString();

    const name = text(card.querySelector(".entity-result__title-text, [data-anonymize='person-name']"));
    const designation = text(
      card.querySelector(".entity-result__primary-subtitle, [data-anonymize='title']")
    );
    const location = text(
      card.querySelector(".entity-result__secondary-subtitle, [data-anonymize='location']")
    );

    let company = null;
    if (designation && designation.includes(" at ")) {
      company = designation.split(" at ").slice(1).join(" at ").trim();
    }

    return { profile_url, name, designation, company, location, experience_years: null };
  }

  function injectCheckbox(card) {
    if (card.querySelector(".ss-checkbox")) return; // already injected
    const data = scrapeCard(card);
    if (!data || !data.profile_url) return;

    card.style.position = card.style.position || "relative";
    const box = document.createElement("div");
    box.className = "ss-checkbox";
    box.title = "Select for Smart Source";
    box.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (selected.has(data.profile_url)) {
        selected.delete(data.profile_url);
        box.classList.remove("ss-checkbox--checked");
      } else {
        selected.set(data.profile_url, data);
        box.classList.add("ss-checkbox--checked");
      }
      renderBar();
    });
    card.prepend(box);
  }

  function scanForCards() {
    findResultCards().forEach(injectCheckbox);
  }

  scanForCards();
  new MutationObserver(() => scanForCards()).observe(document.body, { childList: true, subtree: true });

  // ---- floating bulk bar ----
  let bar = null;
  let projects = [];
  let chosenProjectId = null;

  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement("div");
    bar.className = "ss-bulk-bar";
    document.body.appendChild(bar);
    chrome.runtime.sendMessage({ type: "GET_PROJECTS" }, (res) => {
      if (res?.ok) {
        projects = res.projects || [];
        if (projects.length && !chosenProjectId) chosenProjectId = projects[0].id;
        renderBar();
      }
    });
    return bar;
  }

  function renderBar() {
    const count = selected.size;
    if (count === 0) {
      if (bar) bar.style.display = "none";
      return;
    }
    ensureBar();
    bar.style.display = "flex";

    const options = projects
      .map((p) => `<option value="${p.id}" ${p.id === chosenProjectId ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
      .join("");

    bar.innerHTML = `
      <div class="ss-bulk-count">${count} profile${count === 1 ? "" : "s"} selected</div>
      <select class="ss-bulk-select">${options || "<option>Loading projects…</option>"}</select>
      <button class="ss-bulk-add">Add to project →</button>
      <div class="ss-bulk-status"></div>
      <button class="ss-bulk-close" title="Clear selection">✕</button>
    `;

    bar.querySelector(".ss-bulk-select")?.addEventListener("change", (e) => {
      chosenProjectId = e.target.value;
    });
    bar.querySelector(".ss-bulk-close")?.addEventListener("click", () => {
      selected.clear();
      document.querySelectorAll(".ss-checkbox--checked").forEach((el) => el.classList.remove("ss-checkbox--checked"));
      renderBar();
    });
    bar.querySelector(".ss-bulk-add")?.addEventListener("click", () => submitBulk());
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function submitBulk() {
    const status = bar.querySelector(".ss-bulk-status");
    const addBtn = bar.querySelector(".ss-bulk-add");
    if (!chosenProjectId) return;
    addBtn.disabled = true;
    addBtn.textContent = "Adding…";

    chrome.runtime.sendMessage(
      {
        type: "CAPTURE_CANDIDATES",
        payload: { projectId: chosenProjectId, candidates: Array.from(selected.values()) },
      },
      (res) => {
        addBtn.disabled = false;
        addBtn.textContent = "Add to project →";
        if (!res?.ok) {
          status.textContent = `Failed: ${res?.error || "unknown error"}`;
          status.className = "ss-bulk-status ss-bulk-status--error";
          return;
        }
        const results = res.data?.results || [];
        const added = results.filter((r) => r.status === "added").length;
        const dup = results.filter((r) => r.status === "duplicate").length;
        const failed = results.filter((r) => r.status === "failed").length;
        const projectName = res.data?.projectName || "the project";
        let msg = `Added ${added} to ${projectName}`;
        if (dup) msg += ` · ${dup} already there`;
        if (failed) msg += ` · ${failed} failed`;
        status.textContent = msg;
        status.className = "ss-bulk-status ss-bulk-status--ok";
        selected.clear();
        document.querySelectorAll(".ss-checkbox--checked").forEach((el) => el.classList.remove("ss-checkbox--checked"));
        setTimeout(() => renderBar(), 4000);
      }
    );
  }
}
