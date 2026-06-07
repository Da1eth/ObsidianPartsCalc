import {
  calculateAvailableBuilds,
  canConsumeBuildEntries,
  calculateInventory,
  calculateInventoryStats,
  calculateLeftovers,
  calculateRequiredParts,
  formatPartList,
  getBuildRequirementChoices,
  getSprueParts
} from "./calculator.js";
import { normalizeBuildPlan } from "./build-plan.js";
import { loadCatalog } from "./catalog-loader.js";
import {
  openAvailableBuildsDialog,
  openBuildPlanDialog
} from "./dialogs.js";
import { setupSidebar } from "./sidebar.js";
import { refreshSlidingText, slidingTextHtml } from "./sliding-text.js";
import { iconSvg, partIconHtml } from "./svg.js";

const BOX_COUNT_MAX = 10;
const BUILD_COUNT_MIN_MAX = 10;
const ALL_SLOT_ID = "all";

const state = {
  factionId: "",
  factions: {},
  slot: ALL_SLOT_ID,
  query: ""
};

const els = {
  summaryStats: document.querySelector("#summary-stats"),
  factionTabs: document.querySelector("#faction-tabs"),
  boxList: document.querySelector("#box-list"),
  slotTabs: document.querySelector("#slot-tabs"),
  buildSearch: document.querySelector("#build-search"),
  buildList: document.querySelector("#build-list"),
  resetBuilds: document.querySelector("#reset-builds"),
  addAvailableBuilds: document.querySelector("#add-available-builds"),
  selectedBuilds: document.querySelector("#selected-builds"),
  leftoverParts: document.querySelector("#leftover-parts"),
  availableBuilds: document.querySelector("#available-builds"),
  shortagePanel: document.querySelector("#shortage-panel"),
  shortageParts: document.querySelector("#shortage-parts")
};

const catalog = await loadCatalog();
const indexes = makeIndexes(catalog);

state.factionId = catalog.factions[0]?.id ?? "";
catalog.factions.forEach((faction) => {
  state.factions[faction.id] = { boxes: {}, builds: {}, choices: {} };
  faction.boxes.forEach((box) => {
    state.factions[faction.id].boxes[box.id] = 0;
  });
});

setupSidebar();
render();

els.buildSearch.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderBuildList();
});

els.resetBuilds.addEventListener("click", () => {
  currentState().builds = {};
  currentState().choices = {};
  render();
});

els.addAvailableBuilds.addEventListener("click", addAvailableBuildsToPlan);
window.addEventListener("resize", () => refreshSlidingText());
document.fonts?.ready.then(() => refreshSlidingText());

function makeIndexes(data) {
  return {
    parts: Object.fromEntries(data.parts.map((part) => [part.id, part])),
    slots: Object.fromEntries(data.slots.map((slot) => [slot.id, slot])),
    builds: Object.fromEntries(data.builds.map((build) => [build.id, build]))
  };
}

function render() {
  renderFactions();
  renderBoxes();
  renderSlots();
  renderBuildList();
  renderResults();
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
    button.className = `tab-button${faction.id === state.factionId ? " active" : ""}`;
    button.textContent = faction.id;
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
  const selectedPlanCount = selectedBoxPlanEntries().reduce((sum, entry) => sum + entry.count, 0);
  currentFaction().boxes.forEach((box) => {
    const row = document.createElement("div");
    row.className = "surface-row quantity-row";
    row.innerHTML = `
      <span>
        ${slidingTextHtml(box.nameKo, "strong")}
      </span>
      ${stepperHtml(factionState.boxes[box.id] ?? 0, "박스 수량")}
    `;
    bindStepper(row, factionState.boxes[box.id] ?? 0, 0, BOX_COUNT_MAX, (value) => {
      factionState.boxes[box.id] = value;
      renderBoxes();
      renderResults();
    });
    els.boxList.append(row);
  });

  const actions = document.createElement("div");
  actions.className = "box-actions";
  actions.innerHTML = `
    <button class="button button-strong button-block" type="button" ${selectedPlanCount === 0 ? "disabled" : ""}>
      선택한 박스 부품 전부 계획에 추가
    </button>
  `;
  actions.querySelector("button").addEventListener("click", addSelectedBoxPlans);
  els.boxList.append(actions);
  refreshSlidingText(els.boxList);
}

function renderSlots() {
  els.slotTabs.innerHTML = "";
  const tabs = [{ id: ALL_SLOT_ID, nameKo: "전체", icon: "✦" }, ...catalog.slots];
  tabs.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${state.slot === slot.id ? " active" : ""}`;
    button.innerHTML = `${partIconHtml(slot, "part-icon-frame slot-tab-icon")}<span>${slot.nameKo}</span>`;
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
  const buildBoxSources = makeBoxBuildSources(currentCatalog());
  const builds = currentFaction().builds.filter((build) => {
    const slotMatch = state.slot === ALL_SLOT_ID || build.slot === state.slot;
    const text = `${build.id} ${build.nameKo} ${build.nameEn} ${Object.keys(build.requires).join(" ")}`.toLowerCase();
    return slotMatch && (!query || text.includes(query));
  });

  els.buildList.innerHTML = "";
  builds.forEach((build) => {
    const slot = indexes.slots[build.slot];
    const row = document.createElement("button");
    const sources = buildBoxSources[build.id] ?? [];
    row.className = "surface-row action-row build-row";
    row.type = "button";
    row.setAttribute("aria-label", `${build.nameKo} 조립 계획에 추가`);
    row.innerHTML = `
      ${partIconHtml(slot)}
      <span${sources.length > 0 ? ' class="part-source-anchor"' : ""}>
        ${slidingTextHtml(build.nameKo, "strong")}
        ${slidingTextHtml(build.nameEn, "small")}
        ${sources.length > 0 ? partSourceTooltipHtml("이 부품 카드가 포함된 박스", sources) : ""}
      </span>
    `;
    row.addEventListener("click", () => {
      addBuildToPlan(build.id, 1);
      renderResults();
    });
    els.buildList.append(row);
  });
  bindPartSourceTooltips(els.buildList);
  refreshSlidingText(els.buildList);
}

function renderResults() {
  const scopedCatalog = currentCatalog();
  const factionState = currentState();
  const inventory = calculateInventory(scopedCatalog, factionState.boxes);
  const inventoryStats = calculateInventoryStats(scopedCatalog, factionState.boxes);
  const required = calculateRequiredParts(scopedCatalog, factionState.builds, inventory, factionState.choices);
  const { leftovers, shortages } = calculateLeftovers(inventory, required);
  const available = calculateAvailableBuilds(scopedCatalog, leftovers);
  const partSources = makeBoxPartSources(scopedCatalog);
  const selectedCount = Object.values(factionState.builds).reduce((sum, count) => sum + count, 0);
  const boxCount = Object.values(factionState.boxes).reduce((sum, count) => sum + count, 0);

  els.summaryStats.textContent = `${boxCount} boxes · ${selectedCount} builds · ${inventoryStats.totalParts} parts · ${inventoryStats.byMaterial.plastic ?? 0} plastic · ${inventoryStats.byMaterial.resin ?? 0} resin`;

  renderSelectedBuilds();
  renderGroupedLeftovers(leftovers, scopedCatalog);
  renderPartTable(
    els.shortageParts,
    withPartSources(formatPartList(shortages, indexes.parts), partSources),
    "부족한 파츠가 없습니다."
  );
  els.shortagePanel.hidden = Object.keys(shortages).length === 0;

  els.availableBuilds.innerHTML = "";
  els.addAvailableBuilds.disabled = available.length === 0;
  if (available.length === 0) {
    els.availableBuilds.innerHTML = `<p class="empty">남은 파츠로 바로 조립 가능한 부품이 없습니다.</p>`;
    return;
  }

  available.forEach(({ build, max }) => {
    const slot = indexes.slots[build.slot];
    const item = document.createElement("button");
    item.className = "surface-row action-row available-item";
    item.type = "button";
    item.setAttribute("aria-label", `${build.nameKo} 조립 계획에 추가`);
    item.innerHTML = `
      ${partIconHtml(slot)}
      <span>
        ${slidingTextHtml(build.nameKo, "strong")}
        ${slidingTextHtml(`${build.nameEn} · ${max}개 조립 가능`, "small")}
      </span>
    `;
    item.addEventListener("click", () => {
      addBuildToPlan(build.id, 1);
      renderResults();
    });
    els.availableBuilds.append(item);
  });
  refreshSlidingText(els.availableBuilds);
}

async function addAvailableBuildsToPlan() {
  const scopedCatalog = currentCatalog();
  const factionState = currentState();
  const inventory = calculateInventory(scopedCatalog, factionState.boxes);
  const required = calculateRequiredParts(scopedCatalog, factionState.builds, inventory, factionState.choices);
  const { leftovers } = calculateLeftovers(inventory, required);
  const available = calculateAvailableBuilds(scopedCatalog, leftovers);
  const entries = available.map(({ build, max }) => ({ buildId: build.id, count: max }));

  if (entries.length === 0) return;

  if (canConsumeBuildEntries(scopedCatalog, leftovers, entries)) {
    entries.forEach((entry) => addBuildToPlan(entry.buildId, entry.count));
    render();
    return;
  }

  const choices = await openAvailableBuildsDialog({
    available,
    leftovers,
    scopedCatalog,
    indexes
  });
  choices.forEach((choice) => addBuildToPlan(choice.build.id, choice.count));
  if (choices.length > 0) render();
}

function selectedBoxPlanEntries() {
  const factionState = currentState();
  return currentFaction().boxes
    .map((box) => ({
      box,
      count: factionState.boxes[box.id] ?? 0,
      plan: box.buildPlan ? normalizeBuildPlan(box.buildPlan) : null
    }))
    .filter((entry) => entry.count > 0 && entry.plan);
}

async function addSelectedBoxPlans() {
  const entries = selectedBoxPlanEntries();
  if (entries.length === 0) return;

  if (entries.some((entry) => entry.plan.choices.length > 0)) {
    const selectedChoices = await openBuildPlanDialog({
      entries,
      indexes
    });
    if (selectedChoices) applyBoxPlans(entries, selectedChoices);
    return;
  }

  applyBoxPlans(entries, {});
}

function applyBoxPlans(entries, selectedChoices) {
  entries.forEach((entry) => {
    entry.plan.always.forEach((item) => {
      addBuildToPlan(item.build, item.count * entry.count);
    });

    entry.plan.choices.forEach((choice) => {
      const selected = selectedChoices[`${entry.box.id}:${choice.id}`];
      if (!selected) return;
      Object.entries(selected.counts).forEach(([optionIndex, count]) => {
        addBuildToPlan(choice.options[optionIndex], count);
      });
    });
  });

  render();
}

function addBuildToPlan(buildId, count) {
  if (count <= 0) return;
  const factionState = currentState();
  const build = currentFaction().builds.find((candidate) => candidate.id === buildId);
  if (!build) return;

  const nextCount = (factionState.builds[buildId] ?? 0) + count;
  factionState.builds[buildId] = nextCount;
  factionState.choices[buildId] = normalizedBuildChoiceCounts(
    build,
    nextCount,
    factionState.choices[buildId] ?? {}
  );
}

function renderSelectedBuilds() {
  els.selectedBuilds.innerHTML = "";
  const factionState = currentState();
  const buildsById = Object.fromEntries(currentFaction().builds.map((build) => [build.id, build]));
  const selected = Object.entries(factionState.builds)
    .filter(([, count]) => count > 0)
    .map(([buildId, count]) => ({ build: buildsById[buildId], count }))
    .filter(({ build }) => build);

  if (selected.length === 0) {
    els.selectedBuilds.innerHTML = `<p class="empty">아직 선택한 부품이 없습니다.</p>`;
    return;
  }

  selected.forEach(({ build, count }) => {
    const slot = indexes.slots[build.slot];
    const item = document.createElement("div");
    item.className = "selected-entry";
    item.innerHTML = `
      <div class="surface-row selected-item">
        <span class="selected-build-name">
          ${partIconHtml(slot, "part-icon-frame selected-slot-icon")}
          ${slidingTextHtml(build.nameKo, "strong")}
        </span>
        ${stepperHtml(count, `${build.nameKo} 수량`)}
        <button class="button-icon button-danger" type="button" aria-label="${build.nameKo} 삭제">${iconSvg("x")}</button>
      </div>
      ${buildChoiceRowsHtml(build, factionState.choices[build.id] ?? {}, count)}
    `;
    bindStepper(item, count, 0, Math.max(BUILD_COUNT_MIN_MAX, count), (value) => {
      factionState.builds[build.id] = value;
      if (value === 0) delete factionState.choices[build.id];
      if (value > 0) {
        factionState.choices[build.id] = normalizedBuildChoiceCounts(
          build,
          value,
          factionState.choices[build.id] ?? {}
        );
      }
      renderResults();
    });
    item.querySelector(".button-icon").addEventListener("click", () => {
      factionState.builds[build.id] = 0;
      delete factionState.choices[build.id];
      renderResults();
    });
    item.querySelectorAll(".choice-cycle").forEach((button) => {
      button.addEventListener("click", () => {
        const choiceId = button.dataset.choiceId;
        const optionIndex = Number(button.dataset.optionIndex);
        const maxCount = Number(button.dataset.maxCount);
        const choice = getBuildRequirementChoices(build).find((entry) => entry.id === choiceId);
        const buildChoices = factionState.choices[build.id] ?? {};
        const counts = normalizedChoiceCounts(choice, count, buildChoices[choiceId]);
        factionState.choices[build.id] = {
          ...buildChoices,
          [choiceId]: cycleChoiceCount(counts, optionIndex, maxCount)
        };
        renderResults();
      });
    });
    els.selectedBuilds.append(item);
  });
  refreshSlidingText(els.selectedBuilds);
}

function buildChoiceRowsHtml(build, selectedChoices, buildCount) {
  const choices = getBuildRequirementChoices(build).filter((choice) => choice.options.length > 1);
  if (choices.length === 0) return "";

  return `
    <div class="selected-choice-list">
      ${choices.map((choice) => {
        const counts = normalizedChoiceCounts(choice, buildCount, selectedChoices[choice.id]);
        const maxCount = choice.pick * buildCount;
        return `
          ${choice.options.map((option, optionIndex) => `
            <div class="selected-choice-row">
              <span class="choice-branch" aria-hidden="true">└</span>
              <button
                class="selected-choice choice-cycle"
                type="button"
                data-choice-id="${choice.id}"
                data-option-index="${optionIndex}"
                data-max-count="${maxCount}"
                aria-label="${build.nameKo} ${option.label} 수량 변경"
              >
                ${slidingTextHtml(`선택 파츠 : ${option.label} × ${counts[optionIndex] ?? 0}`, "span", "choice-meta")}
              </button>
            </div>
          `).join("")}
        `;
      }).join("")}
    </div>
  `;
}

function normalizedBuildChoiceCounts(build, buildCount, selectedChoices) {
  return Object.fromEntries(getBuildRequirementChoices(build)
    .filter((choice) => choice.options.length > 1)
    .map((choice) => [choice.id, normalizedChoiceCounts(choice, buildCount, selectedChoices[choice.id])]));
}

function normalizedChoiceCounts(choice, buildCount, selectedCounts) {
  const maxCount = choice.pick * buildCount;
  const counts = Object.fromEntries(choice.options.map((_, index) => [index, 0]));

  let remaining = maxCount;
  Object.entries(selectedCounts ?? {}).forEach(([optionIndex, count]) => {
    if (!choice.options[optionIndex]) return;
    const bounded = Math.min(Math.max(0, Number(count) || 0), remaining);
    counts[optionIndex] = bounded;
    remaining -= bounded;
  });

  if (remaining > 0) {
    counts[0] = (counts[0] ?? 0) + remaining;
  }

  return counts;
}

function cycleChoiceCount(counts, optionIndex, maxCount) {
  const next = { ...counts };
  next[optionIndex] = next[optionIndex] >= maxCount ? 0 : next[optionIndex] + 1;

  let total = Object.values(next).reduce((sum, count) => sum + count, 0);
  if (total > maxCount) {
    let excess = total - maxCount;
    Object.keys(next).forEach((index) => {
      if (Number(index) === optionIndex || excess <= 0) return;
      const removed = Math.min(next[index], excess);
      next[index] -= removed;
      excess -= removed;
    });
  }

  total = Object.values(next).reduce((sum, count) => sum + count, 0);
  if (total < maxCount) {
    const fallbackIndex = Object.keys(next).find((index) => Number(index) !== optionIndex) ?? String(optionIndex);
    next[fallbackIndex] += maxCount - total;
  }

  return next;
}

function renderGroupedLeftovers(leftovers, scopedCatalog) {
  const rows = formatPartList(leftovers, indexes.parts);
  if (rows.length === 0) {
    els.leftoverParts.innerHTML = `<p class="empty">남는 파츠가 없습니다.</p>`;
    return;
  }

  const grouped = groupPartsBySprue(rows, scopedCatalog);
  els.leftoverParts.innerHTML = "";

  grouped.forEach((group) => {
    const details = document.createElement("details");
    details.className = "sprue-group";
    details.innerHTML = `
      <summary>
        <span>
          <strong>${group.nameKo}</strong>
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
    partIds: new Set(Object.keys(getSprueParts(sprue))),
    parts: [],
    total: 0
  }));
  const unknown = {
    id: "unknown",
    nameKo: "기타",
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

function makeBoxPartSources(scopedCatalog) {
  const spruesById = Object.fromEntries(scopedCatalog.sprues.map((sprue) => [sprue.id, getSprueParts(sprue)]));
  const sources = {};

  scopedCatalog.boxes.forEach((box) => {
    const boxParts = {};

    Object.entries(box.sprues).forEach(([sprueId, sprueCount]) => {
      const sprueParts = spruesById[sprueId];
      if (!sprueParts) return;

      Object.entries(sprueParts).forEach(([partId, partCount]) => {
        boxParts[partId] = (boxParts[partId] ?? 0) + partCount * sprueCount;
      });
    });

    Object.entries(boxParts).forEach(([partId, count]) => {
      sources[partId] ??= [];
      sources[partId].push({
        boxId: box.id,
        nameKo: box.nameKo,
        count
      });
    });
  });

  Object.values(sources).forEach((entries) => {
    entries.sort((a, b) => b.count - a.count || a.nameKo.localeCompare(b.nameKo));
  });

  return sources;
}

function makeBoxBuildSources(scopedCatalog) {
  const sources = {};

  scopedCatalog.boxes.forEach((box) => {
    if (!box.buildPlan) return;

    const plan = normalizeBuildPlan(box.buildPlan);
    const buildCounts = {};

    plan.always.forEach((entry) => {
      buildCounts[entry.build] = (buildCounts[entry.build] ?? 0) + entry.count;
    });

    plan.choices.forEach((choice) => {
      choice.options.forEach((buildId) => {
        buildCounts[buildId] = (buildCounts[buildId] ?? 0) + choice.pick;
      });
    });

    Object.entries(buildCounts).forEach(([buildId, count]) => {
      sources[buildId] ??= [];
      sources[buildId].push({
        boxId: box.id,
        nameKo: box.nameKo,
        count
      });
    });
  });

  Object.values(sources).forEach((entries) => {
    entries.sort((a, b) => b.count - a.count || a.nameKo.localeCompare(b.nameKo));
  });

  return sources;
}

function withPartSources(rows, partSources) {
  return rows.map((row) => ({
    ...row,
    sources: partSources[row.id] ?? []
  }));
}

function renderPartTable(target, rows, emptyText) {
  if (rows.length === 0) {
    target.innerHTML = `<p class="empty">${emptyText}</p>`;
    return;
  }

  target.innerHTML = rows.map(partRowHtml).join("");
  bindPartSourceTooltips(target);
}

function stepperHtml(value, label) {
  return `
    <span class="stepper" aria-label="${label}">
      <button type="button" data-step="-1" aria-label="감소">${iconSvg("minus")}</button>
      <strong>${value}</strong>
      <button type="button" data-step="1" aria-label="증가">${iconSvg("plus")}</button>
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
  const sources = row.sources ?? [];

  return `
    <div class="surface-row part-row" title="${sources.length === 0 ? row.nameEn : ""}">
      ${partLabelHtml(row, sources)}
      <b>× ${row.count}</b>
    </div>
  `;
}

function partLabelHtml(row, sources) {
  if (sources.length === 0) return `<code>${row.id}</code>`;

  return `
    <span class="part-source-anchor" tabindex="0">
      <code>${row.id}</code>
      ${partSourceTooltipHtml("이 파츠가 포함된 박스", sources)}
    </span>
  `;
}

function partSourceTooltipHtml(title, sources) {
  return `
    <span class="part-source-tooltip" role="tooltip">
      <strong>${title}</strong>
      ${sources.map((source) => `
        <span>
          <em>${source.nameKo}</em>
          <b>${source.count}개</b>
        </span>
      `).join("")}
    </span>
  `;
}

function bindPartSourceTooltips(target) {
  target.querySelectorAll(".part-source-anchor").forEach((anchor) => {
    const tooltip = anchor.querySelector(".part-source-tooltip");
    if (!tooltip) return;

    const show = () => {
      if (tooltip.hideTimer) {
        window.clearTimeout(tooltip.hideTimer);
        tooltip.hideTimer = null;
      }
      tooltip.classList.add("visible");
      positionPartSourceTooltip(anchor, tooltip);
    };

    const hide = () => {
      tooltip.classList.remove("visible");
      tooltip.hideTimer = window.setTimeout(() => {
        if (!tooltip.classList.contains("visible")) tooltip.removeAttribute("style");
        tooltip.hideTimer = null;
      }, 140);
    };

    anchor.addEventListener("mouseenter", show);
    anchor.addEventListener("mousemove", () => positionPartSourceTooltip(anchor, tooltip));
    anchor.addEventListener("mouseleave", hide);
    anchor.addEventListener("focus", show);
    anchor.addEventListener("blur", hide);
  });
}

function positionPartSourceTooltip(anchor, tooltip) {
  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportPadding = 10;
  const gap = 8;

  let left = anchorRect.left;
  let top = anchorRect.top - tooltipRect.height - gap;

  if (top < viewportPadding) {
    top = anchorRect.bottom + gap;
  }

  left = Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding);
  left = Math.max(viewportPadding, left);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}
