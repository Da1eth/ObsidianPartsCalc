import {
  calculateAvailableBuilds,
  calculateBuildPlanShortages,
  calculateInventory,
  calculateInventoryStats,
  calculateLeftovers,
  calculateRequiredParts,
  formatPartList,
  getSprueParts
} from "./calculator.js";
import { loadCatalog } from "./catalog-loader.js";

const state = {
  factionId: "",
  factions: {},
  slot: "all",
  query: "",
  sidebarOpen: false
};

const els = {
  workspace: document.querySelector("#workspace"),
  headerSummary: document.querySelector("#header-summary"),
  sidebar: document.querySelector("#sidebar"),
  sidebarOpen: document.querySelector("#sidebar-open"),
  sidebarClose: document.querySelector("#sidebar-close"),
  sidebarBackdrop: document.querySelector("#sidebar-backdrop"),
  factionTabs: document.querySelector("#faction-tabs"),
  boxList: document.querySelector("#box-list"),
  slotTabs: document.querySelector("#slot-tabs"),
  buildSearch: document.querySelector("#build-search"),
  buildList: document.querySelector("#build-list"),
  resetBuilds: document.querySelector("#reset-builds"),
  selectedBuilds: document.querySelector("#selected-builds"),
  leftoverParts: document.querySelector("#leftover-parts"),
  availableBuilds: document.querySelector("#available-builds"),
  shortagePanel: document.querySelector("#shortage-panel"),
  shortageParts: document.querySelector("#shortage-parts"),
  planShortagePanel: document.querySelector("#plan-shortage-panel"),
  planShortageParts: document.querySelector("#plan-shortage-parts")
};

const catalog = await loadCatalog();
const indexes = makeIndexes(catalog);
const mobileSidebarQuery = window.matchMedia("(max-width: 900px)");

state.factionId = catalog.factions[0]?.id ?? "";
catalog.factions.forEach((faction) => {
  state.factions[faction.id] = { boxes: {}, builds: {} };
  faction.boxes.forEach((box) => {
    state.factions[faction.id].boxes[box.id] = 0;
  });
});

render();

els.sidebarOpen.addEventListener("click", () => {
  state.sidebarOpen = true;
  render();
});

els.sidebarClose.addEventListener("click", () => {
  state.sidebarOpen = false;
  render();
});

els.sidebarBackdrop.addEventListener("click", () => {
  if (!mobileSidebarQuery.matches) {
    return;
  }
  state.sidebarOpen = false;
  render();
});

els.buildSearch.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderBuildList();
});

els.resetBuilds.addEventListener("click", () => {
  currentState().builds = {};
  render();
});

function makeIndexes(data) {
  return {
    parts: Object.fromEntries(data.parts.map((part) => [part.id, part])),
    sprues: Object.fromEntries(data.sprues.map((sprue) => [sprue.id, sprue])),
    boxes: Object.fromEntries(data.boxes.map((box) => [box.id, box])),
    slots: Object.fromEntries(data.slots.map((slot) => [slot.id, slot])),
    builds: Object.fromEntries(data.builds.map((build) => [build.id, build]))
  };
}

function render() {
  renderSidebar();
  renderFactions();
  renderBoxes();
  renderSlots();
  renderBuildList();
  renderResults();
}

function renderSidebar() {
  els.sidebar.classList.toggle("open", state.sidebarOpen);
  els.sidebar.setAttribute("aria-hidden", String(!state.sidebarOpen));
  document.body.classList.toggle("drawer-open", state.sidebarOpen);
}

function currentFaction() {
  return catalog.factions.find((faction) => faction.id === state.factionId) ?? catalog.factions[0];
}

function currentState() {
  return state.factions[state.factionId];
}

function currentCatalog() {
  const faction = currentFaction();
  return {
    ...catalog,
    factions: [faction],
    boxes: faction.boxes,
    sprues: faction.sprues,
    builds: faction.builds
  };
}

function renderFactions() {
  els.factionTabs.innerHTML = "";
  catalog.factions.forEach((faction) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = faction.id === state.factionId ? "active" : "";
    button.textContent = faction.nameKo;
    button.addEventListener("click", () => {
      state.factionId = faction.id;
      render();
    });
    els.factionTabs.append(button);
  });
}

function renderBoxes() {
  els.boxList.innerHTML = "";
  const factionState = currentState();
  currentFaction().boxes.forEach((box) => {
    const row = document.createElement("label");
    row.className = "quantity-row";
    row.innerHTML = `
      <span>
        <strong>${box.nameKo}</strong>
        <small>${box.nameEn}</small>
      </span>
      ${stepperHtml(factionState.boxes[box.id] ?? 0, "박스 수량")}
    `;
    bindStepper(row, factionState.boxes[box.id] ?? 0, 0, 10, (value) => {
      factionState.boxes[box.id] = value;
      renderResults();
    });
    els.boxList.append(row);
  });
}

function renderSlots() {
  els.slotTabs.innerHTML = "";
  const tabs = [{ id: "all", nameKo: "전체", icon: "✦" }, ...catalog.slots];
  tabs.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = state.slot === slot.id ? "active" : "";
    button.textContent = `${slot.icon} ${slot.nameKo}`;
    button.addEventListener("click", () => {
      state.slot = slot.id;
      renderSlots();
      renderBuildList();
    });
    els.slotTabs.append(button);
  });
}

function renderBuildList() {
  const query = state.query;
  const factionState = currentState();
  const builds = currentFaction().builds.filter((build) => {
    const slotMatch = state.slot === "all" || build.slot === state.slot;
    const text = `${build.id} ${build.nameKo} ${build.nameEn} ${Object.keys(build.requires).join(" ")}`.toLowerCase();
    return slotMatch && (!query || text.includes(query));
  });

  els.buildList.innerHTML = "";
  builds.forEach((build) => {
    const slot = indexes.slots[build.slot];
    const row = document.createElement("label");
    row.className = "build-row";
    row.innerHTML = `
      <span class="slot-icon" aria-hidden="true">${slot.icon}</span>
      <span class="build-meta">
        <strong>${build.nameKo}</strong>
        <small>${build.nameEn}</small>
      </span>
      ${stepperHtml(factionState.builds[build.id] ?? 0, "부품 수량")}
    `;
    bindStepper(row, factionState.builds[build.id] ?? 0, 0, 10, (value) => {
      factionState.builds[build.id] = value;
      renderResults();
    });
    els.buildList.append(row);
  });
}

function renderResults() {
  const scopedCatalog = currentCatalog();
  const factionState = currentState();
  const inventory = calculateInventory(scopedCatalog, factionState.boxes);
  const inventoryStats = calculateInventoryStats(scopedCatalog, factionState.boxes);
  const required = calculateRequiredParts(scopedCatalog, factionState.builds, inventory);
  const { leftovers, shortages } = calculateLeftovers(inventory, required);
  const planShortages = calculateBuildPlanShortages(scopedCatalog, factionState.boxes);
  const available = calculateAvailableBuilds(scopedCatalog, leftovers);
  const selectedCount = Object.values(factionState.builds).reduce((sum, count) => sum + count, 0);
  const boxCount = Object.values(factionState.boxes).reduce((sum, count) => sum + count, 0);

  els.headerSummary.innerHTML = `
    <span><strong>${boxCount}</strong> boxes</span>
    <span><strong>${selectedCount}</strong> builds</span>
    <span><strong>${inventoryStats.totalParts}</strong> parts</span>
    <span><strong>${inventoryStats.byMaterial.plastic ?? 0}</strong> plastic</span>
    <span><strong>${inventoryStats.byMaterial.resin ?? 0}</strong> resin</span>
  `;

  renderSelectedBuilds();
  renderGroupedLeftovers(leftovers, scopedCatalog);
  renderPartTable(els.shortageParts, formatPartList(shortages, indexes.parts), "부족한 파츠가 없습니다.");
  els.shortagePanel.hidden = Object.keys(shortages).length === 0;
  renderPartTable(els.planShortageParts, formatPartList(planShortages, indexes.parts), "박스 조립 계획 기준 부족한 파츠가 없습니다.");
  els.planShortagePanel.hidden = Object.keys(planShortages).length === 0;

  els.availableBuilds.innerHTML = "";
  if (available.length === 0) {
    els.availableBuilds.innerHTML = `<p class="empty">남은 파츠로 바로 조립 가능한 부품이 없습니다.</p>`;
    return;
  }

  available.forEach(({ build, max }) => {
    const slot = indexes.slots[build.slot];
    const item = document.createElement("div");
    item.className = "available-item";
    item.innerHTML = `
      <span class="slot-icon" aria-hidden="true">${slot.icon}</span>
      <span>
        <strong>${build.nameKo}</strong>
        <small>${build.nameEn}</small>
      </span>
      <b>${max}</b>
    `;
    els.availableBuilds.append(item);
  });
}

function renderSelectedBuilds() {
  els.selectedBuilds.innerHTML = "";
  const factionState = currentState();
  const selected = Object.entries(factionState.builds)
    .filter(([, count]) => count > 0)
    .map(([buildId, count]) => ({ build: indexes.builds[buildId], count }));

  if (selected.length === 0) {
    els.selectedBuilds.innerHTML = `<p class="empty">아직 선택한 부품이 없습니다.</p>`;
    return;
  }

  selected.forEach(({ build, count }) => {
    const slot = indexes.slots[build.slot];
    const item = document.createElement("div");
    item.className = "selected-item";
    item.innerHTML = `
      <span>${slot.icon} ${build.nameKo}</span>
      <strong>${count}</strong>
      <button class="icon-button" type="button" aria-label="${build.nameKo} 삭제">×</button>
    `;
    item.querySelector("button").addEventListener("click", () => {
      factionState.builds[build.id] = 0;
      renderBuildList();
      renderResults();
    });
    els.selectedBuilds.append(item);
  });
}

function renderGroupedLeftovers(leftovers, scopedCatalog) {
  const rows = formatPartList(leftovers, indexes.parts);
  if (rows.length === 0) {
    els.leftoverParts.innerHTML = `<p class="empty">남는 파츠가 없습니다.</p>`;
    return;
  }

  const grouped = groupPartsBySprue(rows, scopedCatalog);
  els.leftoverParts.innerHTML = "";

  grouped.forEach((group, index) => {
    const details = document.createElement("details");
    details.className = "sprue-group";
    details.innerHTML = `
      <summary>
        <span>
          <strong>${group.nameKo}</strong>
          <small>${group.nameEn}</small>
        </span>
        <b>${group.total}</b>
      </summary>
      <div class="part-table">
        ${group.parts.map((row) => partRowHtml(row)).join("")}
      </div>
    `;
    els.leftoverParts.append(details);
  });
}

function groupPartsBySprue(rows, scopedCatalog) {
  const groups = scopedCatalog.sprues.map((sprue) => ({
    id: sprue.id,
    nameKo: sprue.nameKo,
    nameEn: sprue.nameEn,
    partIds: new Set(Object.keys(getSprueParts(sprue))),
    parts: [],
    total: 0
  }));
  const unknown = {
    id: "unknown",
    nameKo: "기타",
    nameEn: "Unknown",
    partIds: new Set(),
    parts: [],
    total: 0
  };

  rows.forEach((row) => {
    const group = groups.find((candidate) => candidate.partIds.has(row.id)) ?? unknown;
    group.parts.push(row);
    group.total += row.count;
  });

  return [...groups, unknown].filter((group) => group.parts.length > 0);
}

function renderPartTable(target, rows, emptyText) {
  if (rows.length === 0) {
    target.innerHTML = `<p class="empty">${emptyText}</p>`;
    return;
  }

  target.innerHTML = rows.map(partRowHtml).join("");
}

function stepperHtml(value, label) {
  return `
    <span class="stepper" aria-label="${label}">
      <button type="button" data-step="-1" aria-label="감소">−</button>
      <strong>${value}</strong>
      <button type="button" data-step="1" aria-label="증가">+</button>
    </span>
  `;
}

function bindStepper(root, initialValue, min, max, onChange) {
  let value = initialValue;
  const display = root.querySelector(".stepper strong");
  root.querySelectorAll(".stepper button").forEach((button) => {
    button.addEventListener("click", () => {
      value = Math.min(max, Math.max(min, value + Number(button.dataset.step)));
      display.textContent = value;
      onChange(value);
    });
  });
}

function partRowHtml(row) {
  return `
    <div class="part-row">
      <code>${row.id}</code>
      <span>
        <strong>${row.nameKo}</strong>
        <small>${row.nameEn}</small>
      </span>
      <b>${row.count}</b>
    </div>
  `;
}
