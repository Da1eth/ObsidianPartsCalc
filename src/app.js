import {
  calculateAvailableBuilds,
  canConsumeBuildEntries,
  calculateInventory,
  calculateInventoryStats,
  calculateLeftovers,
  calculateRequiredParts,
  formatPartList,
  getBuildCompetitionGroups,
  getBuildRequirementChoices,
  getSprueParts
} from "./calculator.js";
import { normalizeBuildPlan } from "./build-plan.js";
import { loadCatalog } from "./catalog-loader.js";
import { iconSvg, partIconHtml } from "./svg.js";

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
  addAvailableBuilds: document.querySelector("#add-available-builds"),
  selectedBuilds: document.querySelector("#selected-builds"),
  leftoverParts: document.querySelector("#leftover-parts"),
  availableBuilds: document.querySelector("#available-builds"),
  shortagePanel: document.querySelector("#shortage-panel"),
  shortageParts: document.querySelector("#shortage-parts")
};

const catalog = await loadCatalog();
const indexes = makeIndexes(catalog);
const overlaySidebarQuery = window.matchMedia("(max-width: 1599px)");

state.factionId = catalog.factions[0]?.id ?? "";
catalog.factions.forEach((faction) => {
  state.factions[faction.id] = { boxes: {}, builds: {}, choices: {} };
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
  if (!overlaySidebarQuery.matches) {
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
  currentState().choices = {};
  render();
});

els.addAvailableBuilds.addEventListener("click", addAvailableBuildsToPlan);

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
  const selectedPlanCount = selectedBoxPlanEntries().reduce((sum, entry) => sum + entry.count, 0);
  currentFaction().boxes.forEach((box) => {
    const row = document.createElement("div");
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
      renderBoxes();
      renderResults();
    });
    els.boxList.append(row);
  });

  const actions = document.createElement("div");
  actions.className = "box-actions";
  actions.innerHTML = `
    <button class="box-plan-button" type="button" ${selectedPlanCount === 0 ? "disabled" : ""}>
      선택한 박스 부품 전부 계획에 추가
    </button>
  `;
  actions.querySelector("button").addEventListener("click", addSelectedBoxPlans);
  els.boxList.append(actions);
}

function renderSlots() {
  els.slotTabs.innerHTML = "";
  const tabs = [{ id: "all", nameKo: "전체", icon: "✦" }, ...catalog.slots];
  tabs.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = state.slot === slot.id ? "active" : "";
    button.innerHTML = `${partIconHtml(slot, "slot-tab-icon")}<span>${slot.nameKo}</span>`;
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
    const row = document.createElement("button");
    row.className = "build-row";
    row.type = "button";
    row.setAttribute("aria-label", `${build.nameKo} 조립 계획에 추가`);
    row.innerHTML = `
      ${partIconHtml(slot)}
      <span class="build-meta">
        <strong>${build.nameKo}</strong>
        <small>${build.nameEn}</small>
      </span>
    `;
    row.addEventListener("click", () => {
      addBuildToPlan(build.id, 1);
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
  const required = calculateRequiredParts(scopedCatalog, factionState.builds, inventory, factionState.choices);
  const { leftovers, shortages } = calculateLeftovers(inventory, required);
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

  els.availableBuilds.innerHTML = "";
  els.addAvailableBuilds.disabled = available.length === 0;
  if (available.length === 0) {
    els.availableBuilds.innerHTML = `<p class="empty">남은 파츠로 바로 조립 가능한 부품이 없습니다.</p>`;
    return;
  }

  available.forEach(({ build, max }) => {
    const slot = indexes.slots[build.slot];
    const item = document.createElement("button");
    item.className = "available-item";
    item.type = "button";
    item.setAttribute("aria-label", `${build.nameKo} 조립 계획에 추가`);
    item.innerHTML = `
      ${partIconHtml(slot)}
      <span>
        <strong>${build.nameKo}</strong>
        <small>${build.nameEn} · ${max}개 조립 가능</small>
      </span>
    `;
    item.addEventListener("click", () => {
      addBuildToPlan(build.id, 1);
      renderResults();
    });
    els.availableBuilds.append(item);
  });
}

function addAvailableBuildsToPlan() {
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

  openAvailableBuildsDialog(available, leftovers, scopedCatalog);
}

function openAvailableBuildsDialog(available, leftovers, scopedCatalog) {
  const dialog = document.createElement("dialog");
  dialog.className = "build-plan-dialog";
  const choices = makeAvailableBuildChoiceState(available, leftovers, scopedCatalog);
  const choiceGroups = makeAvailableBuildChoiceGroups(choices, leftovers, scopedCatalog);

  dialog.innerHTML = `
    <form class="build-plan-modal" method="dialog">
      <div class="build-plan-modal-header">
        <span>
          <strong>추가 조립 부품 선택</strong>
          <small>서로 같은 파츠를 쓰는 부품이 있어서 전부 담을 수 없습니다. 담을 부품을 선택해주세요.</small>
        </span>
        <button class="icon-button" value="cancel" type="submit" aria-label="닫기">${iconSvg("x")}</button>
      </div>
      <div class="build-plan-choice-list available-build-choice-list"></div>
      <div class="build-plan-modal-actions">
        <button class="ghost-button" value="cancel" type="submit">취소</button>
        <button class="primary-button" value="confirm" type="submit">확인</button>
      </div>
    </form>
  `;

  const choiceList = dialog.querySelector(".build-plan-choice-list");

  function choiceRowHtml(index) {
    const choice = choices[index];
    const slot = indexes.slots[choice.build.slot];
    const canDecrease = choice.count > 0;
    const canIncrease = canConsumeBuildEntries(scopedCatalog, leftovers, choices.map((entry, choiceIndex) => ({
      buildId: entry.build.id,
      count: entry.count + (choiceIndex === index ? 1 : 0)
    })));

    return `
      <div class="plan-choice-option available-build-choice">
        ${partIconHtml(slot)}
        <span>
          <strong>${choice.build.nameKo}</strong>
          <small>${choice.build.nameEn}</small>
        </span>
        <span
          class="stepper"
          aria-label="${choice.build.nameKo} 수량"
          data-choice-index="${index}"
        >
          <button
            type="button"
            data-step="-1"
            aria-label="감소"
            ${!canDecrease ? "disabled" : ""}
          >${iconSvg("minus")}</button>
          <strong>${choice.count}</strong>
          <button
            type="button"
            data-step="1"
            aria-label="증가"
            ${choice.count >= choice.max || !canIncrease ? "disabled" : ""}
          >${iconSvg("plus")}</button>
        </span>
      </div>
    `;
  }

  function renderChoices() {
    choiceList.innerHTML = choiceGroups.map((group) => `
      <section class="build-plan-choice">
        <h3>${group.title}</h3>
        <small>${group.detail}</small>
        <div class="build-plan-options">
          ${group.indexes.map(choiceRowHtml).join("")}
        </div>
      </section>
    `).join("");
  }

  choiceList.addEventListener("click", (event) => {
    const button = event.target.closest(".stepper button");
    if (!button) return;
    const choice = choices[Number(button.closest(".stepper").dataset.choiceIndex)];
    if (!choice) return;
    choice.count = Math.min(choice.max, Math.max(0, choice.count + Number(button.dataset.step)));
    renderChoices();
  });

  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "confirm") {
      choices
        .filter((choice) => choice.count > 0)
        .forEach((choice) => addBuildToPlan(choice.build.id, choice.count));
      render();
    }
    dialog.remove();
  });

  renderChoices();
  document.body.append(dialog);
  dialog.showModal();
}

function makeAvailableBuildChoiceState(available, leftovers, scopedCatalog) {
  const choices = available.map(({ build, max }) => ({ build, max, count: 0 }));

  choices.forEach((choice, index) => {
    while (
      choice.count < choice.max
      && canConsumeBuildEntries(scopedCatalog, leftovers, choices.map((entry, choiceIndex) => ({
        buildId: entry.build.id,
        count: entry.count + (choiceIndex === index ? 1 : 0)
      })))
    ) {
      choice.count += 1;
    }
  });

  return choices;
}

function makeAvailableBuildChoiceGroups(choices, leftovers, scopedCatalog) {
  const choiceIndexesByBuildId = Object.fromEntries(choices.map((choice, index) => [choice.build.id, index]));
  const competitionGroups = getBuildCompetitionGroups(
    scopedCatalog,
    leftovers,
    choices.map((choice) => ({ buildId: choice.build.id, count: choice.max }))
  );
  let competitionIndex = 0;
  const groups = competitionGroups.map((group) => {
    const choiceIndexes = group.buildIds
      .map((buildId) => choiceIndexesByBuildId[buildId])
      .filter((choiceIndex) => Number.isInteger(choiceIndex));
    const partNames = group.partIds.slice(0, 4).map((partId) => indexes.parts[partId]?.nameKo ?? partId);
    const hiddenCount = Math.max(0, group.partIds.length - partNames.length);

    return {
      indexes: choiceIndexes,
      title: choiceIndexes.length > 1 ? `그룹 ${competitionIndex += 1}` : "독립 부품",
      detail: group.partIds.length > 0
        ? `공유 파츠: ${partNames.join(", ")}${hiddenCount > 0 ? ` 외 ${hiddenCount}개` : ""}`
        : "이 부품들은 전부 담을 수 있습니다."
    };
  });

  const independent = groups.filter((group) => group.indexes.length === 1);
  const competing = groups.filter((group) => group.indexes.length > 1);

  if (independent.length <= 1) return groups;

  return [
    ...competing,
    {
      indexes: independent.flatMap((group) => group.indexes),
      title: "독립 부품",
      detail: "이 부품들은 전부 담을 수 있습니다."
    }
  ];
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

function addSelectedBoxPlans() {
  const entries = selectedBoxPlanEntries();
  if (entries.length === 0) return;

  if (entries.some((entry) => entry.plan.choices.length > 0)) {
    openBuildPlanDialog(entries);
    return;
  }

  applyBoxPlans(entries, {});
}

function openBuildPlanDialog(entries) {
  const dialog = document.createElement("dialog");
  dialog.className = "build-plan-dialog";
  const choices = makePlanChoiceState(entries);

  dialog.innerHTML = `
    <form class="build-plan-modal" method="dialog">
      <div class="build-plan-modal-header">
        <span>
          <strong>옵션 조립 부품 선택</strong>
          <small>선택한 박스의 부품을 설명서에 명시된 수량대로 조립 계획에 추가합니다.</small>
        </span>
        <button class="icon-button" value="cancel" type="submit" aria-label="닫기">${iconSvg("x")}</button>
      </div>
      <div class="build-plan-choice-list"></div>
      <div class="build-plan-modal-actions">
        <button class="ghost-button" value="cancel" type="submit">취소</button>
        <button class="primary-button" value="confirm" type="submit">확인</button>
      </div>
    </form>
  `;

  const choiceList = dialog.querySelector(".build-plan-choice-list");

  function renderChoices() {
    choiceList.innerHTML = choices.map((choice) => `
      <section class="build-plan-choice">
        <h3>${choice.box.nameKo} · ${choice.id}</h3>
        <small>${selectedPlanChoiceTotal(choice.counts)} / ${choice.total}개 선택 가능</small>
        <div class="build-plan-options">
          ${choice.options.map((buildId, optionIndex) => {
            const build = indexes.builds[buildId];
            const selectedTotal = selectedPlanChoiceTotal(choice.counts);
            return `
              <div class="plan-choice-option">
                <span>
                  <strong>${build?.nameKo ?? buildId}</strong>
                  <small>${build?.nameEn ?? buildId}</small>
                </span>
                <span
                  class="stepper"
                  aria-label="${build?.nameKo ?? buildId} 수량"
                  data-choice-key="${choice.key}"
                  data-option-index="${optionIndex}"
                >
                  <button
                    type="button"
                    data-step="-1"
                    aria-label="감소"
                    ${choice.counts[optionIndex] <= 0 ? "disabled" : ""}
                  >${iconSvg("minus")}</button>
                  <strong>${choice.counts[optionIndex] ?? 0}</strong>
                  <button
                    type="button"
                    data-step="1"
                    aria-label="증가"
                    ${selectedTotal >= choice.total ? "disabled" : ""}
                  >${iconSvg("plus")}</button>
                </span>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `).join("");
  }

  choiceList.addEventListener("click", (event) => {
    const button = event.target.closest(".stepper button");
    if (!button) return;
    const stepper = button.closest(".stepper");
    const choice = choices.find((entry) => entry.key === stepper.dataset.choiceKey);
    if (!choice) return;
    choice.counts = adjustPlanChoiceCount(
      choice.counts,
      Number(stepper.dataset.optionIndex),
      Number(button.dataset.step),
      choice.total
    );
    renderChoices();
  });

  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "confirm") {
      applyBoxPlans(entries, Object.fromEntries(choices.map((choice) => [choice.key, choice])));
    }
    dialog.remove();
  });

  renderChoices();
  document.body.append(dialog);
  dialog.showModal();
}

function makePlanChoiceState(entries) {
  return entries.flatMap((entry) => entry.plan.choices.map((choice) => {
    const total = choice.pick * entry.count;
    return {
      key: `${entry.box.id}:${choice.id}`,
      id: choice.id,
      box: entry.box,
      total,
      options: choice.options,
      counts: Object.fromEntries(choice.options.map((_, index) => [index, 0]))
    };
  }));
}

function adjustPlanChoiceCount(counts, optionIndex, step, maxCount) {
  const next = { ...counts };
  const current = next[optionIndex] ?? 0;
  if (step > 0 && selectedPlanChoiceTotal(next) >= maxCount) return next;
  if (step < 0 && current <= 0) return next;

  next[optionIndex] = current + step;

  return next;
}

function selectedPlanChoiceTotal(counts) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
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
      <div class="selected-item">
        <span class="selected-build-name">
          ${partIconHtml(slot, "selected-slot-icon")}
          <strong>${build.nameKo}</strong>
        </span>
        ${stepperHtml(count, `${build.nameKo} 수량`)}
        <button class="icon-button" type="button" aria-label="${build.nameKo} 삭제">${iconSvg("x")}</button>
      </div>
      ${buildChoiceRowsHtml(build, factionState.choices[build.id] ?? {}, count)}
    `;
    bindStepper(item, count, 0, Math.max(10, count), (value) => {
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
    item.querySelector(".icon-button").addEventListener("click", () => {
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
                <span class="choice-meta">선택 파츠 : ${option.label} × ${counts[optionIndex] ?? 0}</span>
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

  if (Number.isInteger(selectedCounts)) {
    counts[selectedCounts] = maxCount;
    return counts;
  }

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
