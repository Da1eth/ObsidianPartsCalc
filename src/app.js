import {
  calculateAvailableBuilds,
  canConsumeBuildEntries,
  calculateInventory,
  calculateInventoryStats,
  calculateLeftovers,
  calculateRequiredParts,
  getBuildRequirementChoices
} from "./calculator.js";
import { normalizeBuildPlan } from "./buildPlan.js";
import { loadCatalog } from "./catalogLoader.js";
import {
  openAvailableBuildsDialog,
  openBuildPlanDialog
} from "./dialogs.js";
import {
  addBuildToFactionState,
  cycleChoiceCount,
  normalizedChoiceCounts,
  setBuildCount
} from "./planState.js";
import {
  makeBoxBuildSources,
  makeBoxPartSources,
  makeIndexes
} from "./catalogQueries.js";
import {
  renderSidebarBoxes,
  renderSidebarFactions,
  renderSidebarLeftovers,
  renderSummaryStats,
  setupSidebar
} from "./sidebar.js";
import { refreshSlidingText } from "./slidingText.js";
import {
  renderAvailableBuilds,
  renderBuildList,
  renderShortages,
  renderSelectedBuilds,
  renderSlots
} from "./mainView.js";

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
  renderBuilds();
});

els.resetBuilds.addEventListener("click", () => {
  currentState().builds = {};
  currentState().choices = {};
  render();
});

els.addAvailableBuilds.addEventListener("click", addAvailableBuildsToPlan);
window.addEventListener("resize", () => refreshSlidingText());
document.fonts?.ready.then(() => refreshSlidingText());

function render() {
  renderFactionTabs();
  renderBoxControls();
  renderSlotTabs();
  renderBuilds();
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

function renderFactionTabs() {
  renderSidebarFactions({
    target: els.factionTabs,
    catalog,
    activeFactionId: state.factionId,
    onSelectFaction: (factionId) => {
      state.factionId = factionId;
      render();
    }
  });
}

function renderBoxControls() {
  const factionState = currentState();
  renderSidebarBoxes({
    target: els.boxList,
    boxes: currentFaction().boxes,
    boxCounts: factionState.boxes,
    selectedPlanCount: selectedBoxPlanEntries().reduce((sum, entry) => sum + entry.count, 0),
    maxBoxCount: BOX_COUNT_MAX,
    onChangeBoxCount: (boxId, value) => {
      factionState.boxes[boxId] = value;
      renderBoxControls();
      renderResults();
    },
    onAddSelectedBoxPlans: addSelectedBoxPlans
  });
}

function renderSlotTabs() {
  renderSlots({
    target: els.slotTabs,
    slots: catalog.slots,
    activeSlotId: state.slot,
    allSlotId: ALL_SLOT_ID,
    onSelectSlot: (slotId) => {
      state.slot = slotId;
      renderSlotTabs();
      renderBuilds();
    }
  });
}

function renderBuilds() {
  const query = state.query;
  const scopedCatalog = currentCatalog();
  const buildBoxSources = makeBoxBuildSources(scopedCatalog);
  const builds = currentFaction().builds.filter((build) => {
    const slotMatch = state.slot === ALL_SLOT_ID || build.slot === state.slot;
    const text = `${build.id} ${build.nameKo} ${build.nameEn} ${Object.keys(build.requires).join(" ")}`.toLowerCase();
    return slotMatch && (!query || text.includes(query));
  });

  renderBuildList({
    target: els.buildList,
    builds,
    slotIndex: indexes.slots,
    buildSources: buildBoxSources,
    onAddBuild: (buildId, count) => {
      addBuildToPlan(buildId, count);
      renderResults();
    }
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
  const partSources = makeBoxPartSources(scopedCatalog);
  const selectedCount = Object.values(factionState.builds).reduce((sum, count) => sum + count, 0);
  const boxCount = Object.values(factionState.boxes).reduce((sum, count) => sum + count, 0);

  renderSummaryStats({
    target: els.summaryStats,
    boxCount,
    selectedCount,
    inventoryStats
  });
  renderSelected();
  renderSidebarLeftovers({
    target: els.leftoverParts,
    leftovers,
    partIndex: indexes.parts,
    scopedCatalog
  });
  renderShortages({
    target: els.shortageParts,
    panel: els.shortagePanel,
    shortages,
    partIndex: indexes.parts,
    partSources
  });
  renderAvailableBuilds({
    target: els.availableBuilds,
    button: els.addAvailableBuilds,
    available,
    slotIndex: indexes.slots,
    onAddBuild: (buildId, count) => {
      addBuildToPlan(buildId, count);
      renderResults();
    }
  });
}

function renderSelected() {
  const factionState = currentState();
  const buildsById = Object.fromEntries(currentFaction().builds.map((build) => [build.id, build]));
  const selectedBuilds = Object.entries(factionState.builds)
    .filter(([, count]) => count > 0)
    .map(([buildId, count]) => ({ build: buildsById[buildId], count }))
    .filter(({ build }) => build);

  renderSelectedBuilds({
    target: els.selectedBuilds,
    selectedBuilds,
    selectedChoices: factionState.choices,
    slotIndex: indexes.slots,
    minMaxBuildCount: BUILD_COUNT_MIN_MAX,
    onChangeBuildCount: (build, value) => {
      setBuildCount(factionState, build, value);
      renderResults();
    },
    onDeleteBuild: (build) => {
      setBuildCount(factionState, build, 0);
      renderResults();
    },
    onCycleChoice: ({ build, choiceId, optionIndex, maxCount }) => {
      const choice = getBuildRequirementChoices(build).find((entry) => entry.id === choiceId);
      const buildCount = factionState.builds[build.id] ?? 0;
      const buildChoices = factionState.choices[build.id] ?? {};
      const counts = normalizedChoiceCounts(choice, buildCount, buildChoices[choiceId]);
      factionState.choices[build.id] = {
        ...buildChoices,
        [choiceId]: cycleChoiceCount(counts, optionIndex, maxCount)
      };
      renderResults();
    }
  });
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
  addBuildToFactionState(currentState(), currentFaction(), buildId, count);
}
