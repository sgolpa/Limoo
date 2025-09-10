(() => {
  "use strict";

  // ====== Feature flags ======
  const USE_WEIGHTED_OR = true;
  const USE_TAXONOMY = true;              // för att få "group" per tag
  const COUNT_ZERO_SCORE_RESULTS = false;  // visa alltid alla, 0p nederst
  const CROSS_GROUP_BONUS = 0.0;          // t.ex. 0.15 = +15% per extra träffad grupp (0 för av)

  // ====== Config / Constants ======
  const SHEET_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSWLXfKPUA4M4-YGe5IOXUXOlOrmzxVsmsa8lgE4v7HlQN-eqWutnWBBXataCYvZfLzUHc0JS5LOVvt/pub?output=csv";
  const TAXONOMY_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSWLXfKPUA4M4-YGe5IOXUXOlOrmzxVsmsa8lgE4v7HlQN-eqWutnWBBXataCYvZfLzUHc0JS5LOVvt/pub?gid=967828131&single=true&output=csv";
  const MAX_CHIPS = 18;

  // Poäng (prio: Vibe > Flavors > Extras > Drinks)
  const WEIGHTS = { Vibe: 3.0, Flavors: 2.0, Extras: 1.2, Drinks: 1.0 };
  const GROUP_KEYS = ["Vibe", "Flavors", "Extras", "Drinks"];

  // ====== Liten fetch-cache ======
  const _sheetCache = new Map();
  async function fetchCSV(url) {
    if (_sheetCache.has(url)) return _sheetCache.get(url);
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    });
    _sheetCache.set(url, p);
    return p;
  }

  // ====== Helpers ======
  function splitCSVRow(row) {
    return row
      .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map((s) => s.replace(/^"|"$/g, "").trim());
  }

  function toTitleCase(str) {
    const small = new Set(["and","or","the","a","an","of","in","on","at","by","for","to","from","with"]);
    return (str || "")
      .toLocaleLowerCase("en")
      .split(/\s+/)
      .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toLocaleUpperCase("en") + w.slice(1)))
      .join(" ");
  }

  function keyOf(tag) {
    return (tag || "").normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
  }

  function categoryRankForNoFlavorHit(displayCategories) {
    // Lägre är bättre. Endast när Flavors valts och stället saknar Flavors-träff.
    const cats = (displayCategories || []).map((c) => c.toLowerCase());
    const hasRestaurant = cats.some((c) => c.includes("restaurant"));
    const hasBar = cats.some((c) => c.includes("bar"));
    const hasCafe = cats.some((c) => c.includes("café") || c.includes("cafe"));

    if (hasRestaurant) return 0; // bäst
    if (hasBar) return 1;
    if (hasCafe) return 2;
    return 3; // okänd/övrigt
  }

  // ====== Globalt state ======
  let restaurants = [];
  const selected = {
    tags: new Set(), // endast taggar från Flavors/Vibe/Extras/Drinks
    category: new Set(),
    neighborhood: new Set(),
    price_level: new Set(),
  };

  // ====== Taxonomi (endast group) ======
  let taxonomyLoaded = false;
  const tagToGroup = new Map();                 // key(tag) -> "Vibe"/"Flavors"/"Extras"/"Drinks"
  const groups = { Flavors: [], Vibe: [], Drinks: [], Extras: [] }; // för modal

  async function loadTaxonomy() {
    if (!USE_TAXONOMY) { taxonomyLoaded = false; return; }
    try {
      const text = await (await fetch(TAXONOMY_URL)).text();
      const rows = text.split("\n").map((r) => r.trim()).filter(Boolean);
      if (rows.length < 2) return;

      const header = splitCSVRow(rows[0]).map((h) => h.toLowerCase());
      const tagCol = header.indexOf("tag");
      const groupCol = header.indexOf("group");
      if (tagCol === -1 || groupCol === -1) return;

      tagToGroup.clear();
      Object.keys(groups).forEach((k) => (groups[k] = []));

      rows.slice(1).forEach((row) => {
        const cols = splitCSVRow(row);
        const label = (cols[tagCol] || "").trim();
        const gRaw = (cols[groupCol] || "").trim();
        if (!label || !gRaw) return;

        const key = keyOf(label);
        const gKey =
          ({ flavors: "Flavors", vibe: "Vibe", drinks: "Drinks", extras: "Extras" }[
            gRaw.toLowerCase()
          ] || null);
        if (!gKey) return;

        tagToGroup.set(key, gKey);
        if (!groups[gKey].some((t) => t.key === key)) {
          groups[gKey].push({ key, label: toTitleCase(label) });
        }
      });

      Object.values(groups).forEach((list) =>
        list.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }))
      );

      taxonomyLoaded = true;
    } catch (e) {
      console.warn("Kunde inte ladda taxonomin:", e);
      taxonomyLoaded = false;
    }
  }

  // ====== Load restaurants ======
  async function loadRestaurants() {
    const text = await (await fetch(SHEET_URL)).text();
    const rows = text.split("\n").map((r) => r.trim()).filter(Boolean);
    if (rows.length < 2) return;

    const header = splitCSVRow(rows[0]).map((h) => h.toLowerCase());
    const idx = {
      name: header.indexOf("name"),
      category: header.indexOf("category"),
      tags: header.indexOf("tags"),
      neighborhood: header.indexOf("neighborhood"),
      price_level: header.indexOf("price_level"),
      url: header.indexOf("url"),
    };

    restaurants = rows.slice(1).map((row) => {
      const cols = splitCSVRow(row);

      const catParts = (cols[idx.category] || "")
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map((s) => toTitleCase(s.replace(/^"|"$/g, "").trim()))
        .filter(Boolean);

      const tagParts = (cols[idx.tags] || "")
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map((s) => toTitleCase(s.replace(/^"|"$/g, "").trim()))
        .filter(Boolean);

      const neighborhood = (cols[idx.neighborhood] || "").trim();
      const price_level = (cols[idx.price_level] || "").trim();
      const url = (cols[idx.url] || "#").trim();
      const name = (cols[idx.name] || "").trim();

      const tagKeys = tagParts.map(keyOf);

      const r = {
        name,
        url,
        display: { category: catParts, tags: tagParts, neighborhood, price_level },
        category: new Set(catParts.map(keyOf)),
        tags: new Set(tagKeys),
        neighborhood: keyOf(neighborhood),
        price_level: keyOf(price_level),
        tagsByGroup: { Vibe: new Set(), Flavors: new Set(), Extras: new Set(), Drinks: new Set() },
      };

      return r;
    });
  }

  // Bygg grupp-set för varje restaurang
  function recomputeRestaurantGroups() {
    restaurants.forEach((r) => {
      r.tagsByGroup = { Vibe: new Set(), Flavors: new Set(), Extras: new Set(), Drinks: new Set() };
      r.tags.forEach((tagKey) => {
        const g = tagToGroup.get(tagKey) || "Extras"; // fallback
        if (r.tagsByGroup[g]) r.tagsByGroup[g].add(tagKey);
      });
    });
  }

  // ====== Chip cloud ======
  let _chipCloudBound = false;
  async function loadChips() {
    const text = await fetchCSV(SHEET_URL);
    const rows = text.split("\n").map((r) => r.trim()).filter(Boolean);
    const header = splitCSVRow(rows[0]).map((h) => h.toLowerCase());
    const tagsCol = header.indexOf("tags");
    if (tagsCol === -1) {
      console.error("Hittar inte kolumnen 'tags'.");
      return;
    }

    const freq = new Map();
    const displayMap = new Map();

    rows.slice(1).forEach((r) => {
      const cols = splitCSVRow(r);
      const cell = cols[tagsCol] || "";
      if (!cell) return;
      cell.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).forEach((raw) => {
        const t = raw.replace(/^"|"$/g, "").trim();
        if (!t) return;
        const k = keyOf(t);
        freq.set(k, (freq.get(k) || 0) + 1);
        if (!displayMap.has(k)) displayMap.set(k, toTitleCase(t));
      });
    });

    const tags = Array.from(freq.entries())
      .sort(
        (a, b) =>
          b[1] - a[1] ||
          displayMap.get(a[0]).localeCompare(displayMap.get(b[0]), "en", { sensitivity: "base" })
      )
      .slice(0, MAX_CHIPS)
      .map(([k]) => ({ key: k, label: displayMap.get(k) }));

    const container = document.getElementById("chipCloud");
    if (!container) return;
    container.innerHTML = "";

    const frag = document.createDocumentFragment();
    tags.forEach(({ key, label }) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.dataset.key = key;
      btn.innerHTML = `
        <svg class="tick" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <rect width="24" height="24" rx="12"></rect>
          <path d="M15.2685 8.31723C15.6454 7.91349 16.2788 7.8916 16.6826 8.2684C17.0863 8.64522 17.1082 9.27871 16.7314 9.68246L11.1308 15.6825C10.9497 15.8764 10.6988 15.9899 10.4336 15.9989C10.1681 16.0077 9.90957 15.911 9.7158 15.7293L7.31639 13.4793C6.91353 13.1017 6.89292 12.4692 7.27049 12.0663C7.64817 11.6634 8.28065 11.6428 8.68357 12.0204L10.3525 13.5838L15.2685 8.31723Z"></path>
        </svg>
        <span>${label}</span>
      `;
      frag.appendChild(btn);
    });
    container.appendChild(frag);

    const showAllBtn = document.createElement("button");
    showAllBtn.className = "show-all-filters-btn";
    showAllBtn.type = "button";
    showAllBtn.textContent = "Show all filters";
    container.appendChild(showAllBtn);

    if (!_chipCloudBound) {
      container.addEventListener("click", (e) => {
        const btn = e.target.closest(".chip");
        if (!btn) return;
        const key = btn.dataset.key;
        btn.classList.toggle("is-active");
        if (btn.classList.contains("is-active")) selected.tags.add(key);
        else selected.tags.delete(key);
        applyFilters();
      });
      _chipCloudBound = true;
    }
  }

  // ====== Weighted-OR + coverage ======
  function buildSelectedByGroup() {
    const byGroup = { Vibe: new Set(), Flavors: new Set(), Extras: new Set(), Drinks: new Set() };
    selected.tags.forEach((k) => {
      const g = tagToGroup.get(k) || "Extras";
      if (byGroup[g]) byGroup[g].add(k);
    });
    return byGroup;
  }

  function scoreRestaurantWeightedOr(r, selectedByGroup) {
    let score = 0;
    let groupsHit = 0;
    let totalHits = 0;

    const hitsByGroup = { Vibe: 0, Flavors: 0, Extras: 0, Drinks: 0 };

    GROUP_KEYS.forEach((g) => {
      const sel = selectedByGroup[g];
      if (!sel || sel.size === 0) return;

      const have = r.tagsByGroup[g] || new Set();
      let hits = 0;
      if (have.size) {
        sel.forEach((k) => { if (have.has(k)) hits++; });
      }
      hitsByGroup[g] = hits;

      if (hits > 0) {
        groupsHit++;
        totalHits += hits;
        score += hits * (WEIGHTS[g] || 0);
      }
    });

    const groupsSelected = GROUP_KEYS.reduce((n, g) => n + (selectedByGroup[g]?.size ? 1 : 0), 0);
    const coverage = groupsSelected ? groupsHit / groupsSelected : 0;

    // Liten bonus om man träffar fler olika grupper (valfritt)
    if (CROSS_GROUP_BONUS > 0 && groupsHit > 1) {
      score *= (1 + CROSS_GROUP_BONUS * (groupsHit - 1));
    }

    return { score, groupsHit, groupsSelected, coverage, totalHits, hitsByGroup };
  }

  // ====== Render & Sort ======
  function renderList(items) {
    const container = document.getElementById("restaurantList");
    if (!container) return;
    container.innerHTML = "";

    const frag = document.createDocumentFragment();

    items.forEach((r) => {
      const item = document.createElement("div");
      item.className = "restaurant-item";
      item.innerHTML = `
        <div>
          <a class="restaurant-title" href="${r.url}" target="_blank" rel="noopener">
            <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44" fill="currentColor" aria-hidden="true">
              <path d="M21.999 2.16602C30.0361 2.16618 38.165 8.23194 38.165 18.333C38.1649 25.3173 34.1894 31.1729 30.4248 35.1729C28.5237 37.1928 26.6266 38.7927 25.2061 39.8877C24.4946 40.4361 23.8993 40.8601 23.4785 41.1494C23.2681 41.2941 23.1009 41.4052 22.9844 41.4814C22.9261 41.5196 22.8807 41.5498 22.8486 41.5703C22.8327 41.5805 22.8197 41.588 22.8105 41.5938C22.8062 41.5965 22.8026 41.5988 22.7998 41.6006C22.7984 41.6015 22.7969 41.6029 22.7959 41.6035L22.7949 41.6045L21.999 40.333L22.7939 41.6045C22.3076 41.9085 21.6905 41.9084 21.2041 41.6045L21.999 40.333L21.2031 41.6045L21.2012 41.6035C21.2002 41.6029 21.1996 41.6014 21.1982 41.6006C21.1954 41.5988 21.1911 41.5967 21.1865 41.5938C21.1774 41.588 21.1643 41.5805 21.1484 41.5703C21.1163 41.5498 21.0709 41.5195 21.0127 41.4814C20.8962 41.4052 20.7289 41.294 20.5186 41.1494C20.0977 40.8601 19.5023 40.436 18.791 39.8877C17.3705 38.7927 15.4743 37.1927 13.5732 35.1729C9.80858 31.1729 5.83215 25.3175 5.83203 18.333C5.83203 8.2318 13.9618 2.16602 21.999 2.16602ZM21.999 5.16602C15.3695 5.16602 8.83203 10.1273 8.83203 18.333C8.83216 24.1815 12.1893 29.3256 15.7578 33.1172C17.5233 34.993 19.2936 36.4869 20.623 37.5117C21.1672 37.9312 21.6369 38.2684 21.998 38.5215C22.3593 38.2684 22.8303 37.9316 23.375 37.5117C24.7044 36.487 26.4739 34.9928 28.2393 33.1172C31.8078 29.3256 35.1649 24.1815 35.165 18.333C35.165 10.1274 28.6284 5.16618 21.999 5.16602ZM22 11.333C25.866 11.333 29 14.467 29 18.333C29 22.199 25.866 25.333 22 25.333C18.134 25.333 15 22.199 15 18.333C15 14.467 18.134 11.333 22 11.333ZM22 14.333C19.7909 14.333 18 16.1239 18 18.333C18 20.5421 19.7909 22.333 22 22.333C24.2091 22.333 26 20.5421 26 18.333C26 16.1239 24.2091 14.333 22 14.333Z"></path>
            </svg>
            ${r.name}
          </a>
          <div class="restaurant-tags">
            ${r.display.tags.slice(0, 3).map((tag) => `<span class="restaurant-tag">${tag}</span>`).join("")}
          </div>
        </div>
      `;
      frag.appendChild(item);
    });

    container.appendChild(frag);
  }

  function updateClearFiltersVisibility(anyActive) {
    const link = document.querySelector(".clear-filters");
    if (!link) return;
    link.classList.toggle("is-visible", !!anyActive);
  }

  function applyFilters() {
    const anyActive = Object.values(selected).some((s) => s.size > 0);
    updateClearFiltersVisibility(anyActive);

    if (!anyActive || !USE_WEIGHTED_OR) {
      renderList(restaurants);
      return;
    }

    const selectedByGroup = buildSelectedByGroup();
    const flavorsSelected = selectedByGroup.Flavors.size > 0;

    const scored = restaurants.map((r) => {
      const s = scoreRestaurantWeightedOr(r, selectedByGroup);

      // Mjuk "måste-ha" för Flavors: sortnyckel som drar ned de med 0 Flavors när Flavors är valt
      const flavorsHits = s.hitsByGroup.Flavors || 0;
      const flavorsPenaltyKey = flavorsSelected ? (flavorsHits > 0 ? 1 : 0) : 1; // 1 = bra, 0 = sämre

      // Kategori-preferens när Flavors valts och stället saknar Flavors-träff
      const catRank = (flavorsSelected && flavorsHits === 0)
        ? categoryRankForNoFlavorHit(r.display.category)
        : 0;

      return { r, ...s, flavorsHits, flavorsPenaltyKey, catRank };
    });

    // Sorteringsordning:
    // 1) Coverage (desc) – hur många av de valda grupperna stället täcker
    // 2) flavorsPenaltyKey (desc) – de med Flavors-träff går före om Flavors är valt
    // 3) Score (desc) – weighted-OR
    // 4) catRank (asc) – restaurant > bar > café när Flavors valts och saknas Flavors-träff
    // 5) totalHits (desc)
    // 6) Namn A–Ö
    scored.sort(
      (a, b) =>
        b.coverage - a.coverage ||
        b.flavorsPenaltyKey - a.flavorsPenaltyKey ||
        b.score - a.score ||
        a.catRank - b.catRank ||
        b.totalHits - a.totalHits ||
        a.r.name.localeCompare(b.r.name, "en", { sensitivity: "base" })
    );

    const toRender = COUNT_ZERO_SCORE_RESULTS
      ? scored.map((x) => x.r)
      : scored.filter((x) => x.score > 0).map((x) => x.r);

    renderList(toRender);
  }

  // ====== Modal ======
  const modal = document.getElementById("filtersModal");
  const modalCTA = document.getElementById("modalCTA");

  function buildModalChips() {
    const sectionEl = {
      Flavors: document.getElementById("modalGroup1"),
      Vibe: document.getElementById("modalGroup2"),
      Drinks: document.getElementById("modalGroup3"),
      Extras: document.getElementById("modalGroup4"),
    };
    Object.values(sectionEl).forEach((el) => (el.innerHTML = ""));

    const addChip = (parent, key, label) => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.dataset.key = key;
      chip.innerHTML = `
        <svg class="tick" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <rect width="24" height="24" rx="12"></rect>
          <path d="M15.2685 8.31723C15.6454 7.91349 16.2788 7.8916 16.6826 8.2684C17.0863 8.64522 17.1082 9.27871 16.7314 9.68246L11.1308 15.6825C10.9497 15.8764 10.6988 15.9899 10.4336 15.9989C10.1681 16.0077 9.90957 15.911 9.7158 15.7293L7.31639 13.4793C6.91353 13.1017 6.89292 12.4692 7.27049 12.0663C7.64817 11.6634 8.28065 11.6428 8.68357 12.0204L10.3525 13.5838L15.2685 8.31723Z"></path>
        </svg>
        <span>${label}</span>
      `;
      if (selected.tags.has(key)) chip.classList.add("is-active");
      chip.addEventListener("click", () => {
        chip.classList.toggle("is-active");
        if (chip.classList.contains("is-active")) selected.tags.add(key);
        else selected.tags.delete(key);
        document
          .querySelectorAll(`.chip-cloud .chip[data-key="${key}"]`)
          .forEach((c) => c.classList.toggle("is-active", chip.classList.contains("is-active")));
        updateModalCTA();
        applyFilters();
      });
      parent.appendChild(chip);
    };

    if (taxonomyLoaded) {
      ["Flavors", "Vibe", "Drinks", "Extras"].forEach((gKey) => {
        (groups[gKey] || []).forEach(({ key, label }) => addChip(sectionEl[gKey], key, label));
      });
    } else {
      const allTags = new Map();
      restaurants.forEach((r) => r.display.tags.forEach((lbl) => allTags.set(keyOf(lbl), toTitleCase(lbl))));
      const entries = Array.from(allTags.entries()).sort((a, b) =>
        a[1].localeCompare(b[1], "en", { sensitivity: "base" })
      );
      const order = [sectionEl.Flavors, sectionEl.Vibe, sectionEl.Drinks, sectionEl.Extras];
      entries.forEach(([key, label], idx) => addChip(order[idx % order.length], key, label));
    }
  }

  function updateModalCTA() {
    if (!modalCTA) return;
    const anyActive = Object.values(selected).some((s) => s.size > 0);

    if (!anyActive || !USE_WEIGHTED_OR) {
      modalCTA.textContent = "Show all spots";
      return;
    }

    const selectedByGroup = buildSelectedByGroup();
    const count = restaurants.reduce((n, r) => {
      const { score, coverage } = scoreRestaurantWeightedOr(r, selectedByGroup);
      // Räkna “matchande” som coverage > 0 (träff i minst en vald grupp)
      return n + (coverage > 0 ? 1 : 0);
    }, 0);

    modalCTA.textContent = `Show ${count} results`;
  }

  async function openFiltersModal() {
    if (!restaurants.length) await loadRestaurants();
    buildModalChips();
    updateModalCTA();
    if (modal) modal.classList.add("is-open");
    document.body.classList.add("modal-open");
  }
  function closeFiltersModal() {
    if (modal) modal.classList.remove("is-open");
    document.body.classList.remove("modal-open");
  }

  // ====== Events ======
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".clear-filters");
    if (!btn) return;
    e.preventDefault();
    Object.values(selected).forEach((set) => set.clear());
    document.querySelectorAll(".chip.is-active").forEach((chip) => chip.classList.remove("is-active"));
    applyFilters();
    updateModalCTA();
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".modal-clear-filters");
    if (!btn) return;
    e.preventDefault();
    Object.values(selected).forEach((set) => set.clear());
    document.querySelectorAll(".chip.is-active").forEach((chip) => chip.classList.remove("is-active"));
    applyFilters();
    updateModalCTA();
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest(".show-all-filters-btn")) {
      e.preventDefault();
      openFiltersModal();
    }
    if (e.target.closest("[data-close]") || e.target.id === "modalCTA") {
      e.preventDefault();
      closeFiltersModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("is-open")) {
      closeFiltersModal();
    }
  });

  // ====== Init ======
  (async () => {
    try {
      await Promise.all([loadRestaurants(), loadChips(), loadTaxonomy()]);
      recomputeRestaurantGroups();
      applyFilters();
    } catch (err) {
      console.error("Init-fel:", err);
    }
  })();
})();
