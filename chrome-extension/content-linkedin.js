// Smart Source — LinkedIn content script.
// Two jobs, depending on the page: (1) profile page — scrape on request from
// the popup; (2) search-results page — inject checkboxes + a floating bar
// for adding several profiles at once.

function text(el) {
  return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
}

// ---------- Profile page scraping ----------

// LinkedIn's profile top card now renders through an atomic, per-build CSS
// system -- every class name is a short content hash ("c239a6d3 _42139a8b
// ...") that changes across builds/experiments and carries no meaning, so
// there is no stable ".text-body-medium" / ".text-body-small" class left to
// match (verified live: those selectors now match nothing at all). What
// *is* stable is structure: the name heading's nearest ancestor that also
// contains the follower/connection count is always the top card, and
// walking its text leaf-by-leaf in DOM order reliably surfaces the
// headline, location and company lines regardless of what LinkedIn hashes
// the classes to next.
function findProfileTopCardRoot(name) {
  const heading = Array.from(document.querySelectorAll("h1, h2")).find((el) => text(el) === name);
  if (!heading) return null;
  let node = heading;
  for (let i = 0; i < 12 && node; i++) {
    if (/followers|connections/i.test(text(node) || "")) return node;
    node = node.parentElement;
  }
  return null;
}

// Text LinkedIn always renders somewhere in the top card that carries no
// candidate information -- connection-degree badges, action buttons, the
// follower/connection counts themselves -- filtered out before hunting for
// the headline/location/company lines.
const TOP_CARD_NOISE_EXACT = new Set([
  "Contact info", "Message", "View in Recruiter", "More", "Follow", "Connect",
  "Save", "He/Him", "She/Her", "They/Them",
]);
const TOP_CARD_NOISE_PATTERN =
  /^(·\s*)?(1st|2nd|3rd)$|^\d[\d,]*\+?\s+(followers|connections|mutual connections)$|^·$|^\d+\+\s+connections$/i;

function getTopCardLines(root, name) {
  const leaves = Array.from(root.querySelectorAll("*")).filter((el) => el.children.length === 0);
  const lines = [];
  const seen = new Set();
  for (const el of leaves) {
    const t = text(el);
    if (!t || t === name || seen.has(t)) continue;
    if (TOP_CARD_NOISE_EXACT.has(t) || TOP_CARD_NOISE_PATTERN.test(t)) continue;
    seen.add(t);
    lines.push(t);
  }
  return lines;
}

function scrapeProfilePage() {
  // Name: LinkedIn always sets the tab title to "Full Name | LinkedIn" —
  // far more stable than any heading tag or class name.
  let name = document.title.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim() || null;
  if (!name) {
    name = text(document.querySelector("h1")) || text(document.querySelector("h2"));
  }

  const root = name ? findProfileTopCardRoot(name) : null;
  const lines = root ? getTopCardLines(root, name) : [];

  let designation = null;
  let location = null;
  let company = null;

  if (lines.length) {
    // LinkedIn's own condensed "Current company · School" summary line,
    // when it renders one -- e.g. "Mobileum · Sir C.R.R. College Of Engg".
    const companySchoolLine = lines.find((l) => /^.{2,40}\s+·\s+.{2,60}$/.test(l));
    if (companySchoolLine) {
      company = companySchoolLine.split(" · ")[0].trim() || null;
    }

    location =
      lines.find((l) => l !== companySchoolLine && /,/.test(l) && l.length < 60 && !/^current:/i.test(l)) ||
      null;

    designation = lines.find((l) => l !== companySchoolLine && l !== location && l.length > 15) || null;

    if (!company) {
      // A short standalone entity name (no comma, no bullet) sitting
      // before the location line -- e.g. a bare "Microsoft" under the
      // headline, on profiles that don't render the combined line above.
      const locIdx = location ? lines.indexOf(location) : -1;
      const candidates = locIdx >= 0 ? lines.slice(0, locIdx) : lines;
      company =
        candidates.find((l) => l !== designation && l.length < 40 && !/,/.test(l) && !/·/.test(l)) || null;
    }
  }

  // Fall back to the older class-name selectors in case LinkedIn ever
  // serves that markup again to some accounts/experiments.
  if (!designation) {
    const h1 = document.querySelector("h1");
    const headlineEl =
      document.querySelector(".text-body-medium.break-words") ||
      (h1 ? h1.parentElement?.querySelector(".text-body-medium") : null);
    designation = text(headlineEl);
  }
  if (!location) {
    const locationCandidates = document.querySelectorAll(".text-body-small.inline.t-black--light");
    if (locationCandidates.length) location = text(locationCandidates[0]);
  }
  if (!company) {
    const expCompanyLink = document.querySelector(
      '[data-view-name="profile-component-entity"] a[href*="/company/"]'
    );
    if (expCompanyLink) company = text(expCompanyLink);
  }
  if (!company && designation && designation.includes(" at ")) {
    const after = designation.split(/ at /i).slice(1).join(" at ");
    company = after.split(/[*|,]/)[0].trim().replace(/^#/, "") || null;
  }

  const profile_url = location_href_no_query();

  return {
    profile_url,
    name: name || null,
    designation: designation || null,
    company: company || null,
    location: location || null,
    experience_years: estimateExperienceYears(),
    // Raw About/Experience/Education text, bounded -- feeds the AI
    // "Summarize" button server-side rather than trying to parse each
    // role/degree into structured fields here (LinkedIn's markup churns
    // too often for that to hold up; letting the model read the same
    // prose a recruiter would is far more robust).
    raw_text: scrapeRawProfileText(),
  };
}

// ---------- Raw text for the AI summary ----------
function findSectionByAnchorOrHeading(anchorId, headingText) {
  const anchor = document.getElementById(anchorId);
  if (anchor) {
    const section = anchor.closest("section");
    if (section) return section;
  }
  const headings = document.querySelectorAll("h2, div.pvs-header__container, span");
  for (const h of headings) {
    if (new RegExp(`^${headingText}$`, "i").test(text(h) || "")) {
      const section = h.closest("section");
      if (section) return section;
    }
  }
  return null;
}

function scrapeRawProfileText() {
  try {
    const parts = [];
    const about = findSectionByAnchorOrHeading("about", "about");
    if (about) parts.push(`About:
${text(about) || ""}`);
    const experience = findExperienceSection();
    if (experience) parts.push(`Experience:
${text(experience) || ""}`);
    const education = findSectionByAnchorOrHeading("education", "education");
    if (education) parts.push(`Education:
${text(education) || ""}`);
    const raw = parts.join("\n\n").trim();
    return raw ? raw.slice(0, 8000) : null;
  } catch {
    return null;
  }
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

// LinkedIn keeps the tab "complete" (all initial resources loaded) well
// before its own client-side rendering has actually painted the profile
// top card -- the name/headline/location text streams in afterwards via
// its own data fetch. A single synchronous scrape run right as the panel
// opens can therefore run before that content exists yet (or before it
// backfilled the SPA-style name-only render), producing a profile with a
// missing name, or a name but no role/company/location, even though the
// exact same extraction logic finds everything correctly a moment later.
// Poll for up to a few seconds instead of scraping exactly once.
function scrapeProfilePageWithRetry(maxWaitMs, intervalMs) {
  maxWaitMs = maxWaitMs || 6000;
  intervalMs = intervalMs || 300;
  const start = Date.now();
  return new Promise((resolve) => {
    function attempt() {
      const result = scrapeProfilePage();
      const incomplete = !result.name || (!result.designation && !result.company && !result.location);
      if (!incomplete || Date.now() - start >= maxWaitMs) {
        resolve(result);
      } else {
        setTimeout(attempt, intervalMs);
      }
    }
    attempt();
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCRAPE_PROFILE") {
    scrapeProfilePageWithRetry().then((profile) => sendResponse({ ok: true, profile }));
    return true;
  }
});

// LinkedIn is a single-page app: clicking from one profile to another (a
// search result, "People also viewed", a connection's name, the profile
// card in the feed) never triggers a real page load -- it's a pushState
// route change inside the SAME document. Chrome only (re-)injects content
// scripts on real navigations, so this one script instance keeps running
// for as long as the tab stays on linkedin.com, across every profile the
// recruiter clicks through to. Without this, the side panel only ever
// re-scrapes when the TAB itself loads/activates -- so browsing profile to
// profile inside one tab, which is how most people actually use LinkedIn,
// would keep showing whichever profile was open when the tab last got a
// full page load. Watching the URL and pinging the panel on every change
// is what makes each newly-opened profile actually get picked up.
let lastScrapeUrl = location.href;
setInterval(() => {
  if (location.href !== lastScrapeUrl) {
    lastScrapeUrl = location.href;
    chrome.runtime.sendMessage({ type: "PROFILE_URL_CHANGED" });
  }
}, 800);

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
