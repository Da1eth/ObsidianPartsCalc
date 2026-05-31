import {
  calculateAvailableBuilds,
  calculateBuildPlanShortages,
  calculateInventory,
  calculateInventoryStats,
  calculateLeftovers,
  calculateRequiredParts,
  formatPartList
} from "./calculator.js";
import { loadCatalog } from "./catalog-loader.js";

const state = {
  boxes: {},
  builds: {},
  slot: "all",
  query: ""
};

const els = {
  headerSummary: document.querySelector("#header-summary"),
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

catalog.boxes.forEach((box) => {
  state.boxes[box.id] = box.id === catalog.boxes[0]?.id ? 1 : 0;
});

render();

els.buildSearch.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderBuildList();
});

els.resetBuilds.addEventListener("click", () => {
  state.builds = {};
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
  renderBoxes();
  renderSlots();
  renderBuildList();
  renderResults();
}

function renderBoxes() {
  els.boxList.innerHTML = "";
  catalog.boxes.forEach((box) => {
    const row = document.createElement("label");
    row.className = "quantity-row";
    row.innerHTML = `
      <span>
        <strong>${box.nameKo}</strong>
        <small>${box.nameEn}</small>
      </span>
      <input min="0" type="number" inputmode="numeric" value="${state.boxes[box.id] ?? 0}">
    `;
    row.querySelector("input").addEventListener("input", (event) => {
      state.boxes[box.id] = Math.max(0, Number.parseInt(event.target.value || "0", 10));
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
      renderBuildList();
    });
    els.slotTabs.append(button);
  });
}

function renderBuildList() {
  const query = state.query;
  const builds = catalog.builds.filter((build) => {
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
      <input min="0" type="number" inputmode="numeric" value="${state.builds[build.id] ?? 0}">
    `;
    row.querySelector("input").addEventListener("input", (event) => {
      state.builds[build.id] = Math.max(0, Number.parseInt(event.target.value || "0", 10));
      renderResults();
    });
    els.buildList.append(row);
  });
}

function renderResults() {
  const inventory = calculateInventory(catalog, state.boxes);
  const inventoryStats = calculateInventoryStats(catalog, state.boxes);
  const required = calculateRequiredParts(catalog, state.builds, inventory);
  const { leftovers, shortages } = calculateLeftovers(inventory, required);
  const planShortages = calculateBuildPlanShortages(catalog, state.boxes);
  const available = calculateAvailableBuilds(catalog, leftovers);
  const selectedCount = Object.values(state.builds).reduce((sum, count) => sum + count, 0);
  const boxCount = Object.values(state.boxes).reduce((sum, count) => sum + count, 0);

  els.headerSummary.innerHTML = `
    <span><strong>${boxCount}</strong> boxes</span>
    <span><strong>${selectedCount}</strong> builds</span>
    <span><strong>${inventoryStats.totalParts}</strong> parts</span>
    <span><strong>${inventoryStats.byMaterial.plastic ?? 0}</strong> plastic</span>
    <span><strong>${inventoryStats.byMaterial.resin ?? 0}</strong> resin</span>
  `;

  renderSelectedBuilds();
  renderPartTable(els.leftoverParts, formatPartList(leftovers, indexes.parts), "남는 파츠가 없습니다.");
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
  const selected = Object.entries(state.builds)
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
    `;
    els.selectedBuilds.append(item);
  });
}

function renderPartTable(target, rows, emptyText) {
  if (rows.length === 0) {
    target.innerHTML = `<p class="empty">${emptyText}</p>`;
    return;
  }

  target.innerHTML = rows.map((row) => `
    <div class="part-row">
      <code>${row.id}</code>
      <span>
        <strong>${row.nameKo}</strong>
        <small>${row.nameEn}</small>
      </span>
      <b>${row.count}</b>
    </div>
  `).join("");
}
