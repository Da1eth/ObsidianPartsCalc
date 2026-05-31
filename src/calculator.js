import { normalizeBuildPlan } from "./build-plan.js";

export function calculateInventory(catalog, selectedBoxes) {
  const inventory = {};
  const spruesById = Object.fromEntries(catalog.sprues.map((sprue) => [sprue.id, normalizeSprueParts(sprue)]));

  catalog.boxes.forEach((box) => {
    const boxCount = selectedBoxes[box.id] ?? 0;
    Object.entries(box.sprues).forEach(([sprueId, sprueCount]) => {
      const sprueParts = spruesById[sprueId];
      if (!sprueParts) return;
      addParts(inventory, sprueParts, boxCount * sprueCount);
    });
  });

  return inventory;
}

export function calculateInventoryStats(catalog, selectedBoxes) {
  const stats = {
    uniquePartIds: 0,
    totalParts: 0,
    byMaterial: {}
  };
  const inventory = calculateInventory(catalog, selectedBoxes);
  const spruesById = Object.fromEntries(catalog.sprues.map((sprue) => [sprue.id, sprue]));

  stats.uniquePartIds = Object.keys(inventory).length;
  stats.totalParts = Object.values(inventory).reduce((sum, count) => sum + count, 0);

  catalog.boxes.forEach((box) => {
    const boxCount = selectedBoxes[box.id] ?? 0;
    Object.entries(box.sprues).forEach(([sprueId, sprueCount]) => {
      const sprue = spruesById[sprueId];
      if (!sprue) return;
      const material = sprue.material ?? "plastic";
      const partCount = Object.values(normalizeSprueParts(sprue)).reduce((sum, count) => sum + count, 0);
      stats.byMaterial[material] = (stats.byMaterial[material] ?? 0) + partCount * sprueCount * boxCount;
    });
  });

  return stats;
}

export function calculateRequiredParts(catalog, selectedBuilds, inventory = {}) {
  const required = {};
  const buildsById = Object.fromEntries(catalog.builds.map((build) => [build.id, build]));
  const equivalents = makeEquivalentIndex(catalog);

  Object.entries(selectedBuilds).forEach(([buildId, count]) => {
    if (count <= 0) return;
    const build = buildsById[buildId];
    if (!build) return;
    for (let index = 0; index < count; index += 1) {
      addFlexibleParts(required, build.requires, inventory, equivalents);
      addOptionParts(required, build.optionRequires ?? [], inventory, equivalents);
    }
  });

  return required;
}

export function calculateBuildPlanShortages(catalog, selectedBoxes) {
  const remaining = calculateInventory(catalog, selectedBoxes);
  const shortages = {};
  const buildsById = Object.fromEntries(catalog.builds.map((build) => [build.id, build]));
  const equivalents = makeEquivalentIndex(catalog);

  catalog.boxes.forEach((box) => {
    const boxCount = selectedBoxes[box.id] ?? 0;
    if (boxCount <= 0 || !box.buildPlan) return;

    for (let boxIndex = 0; boxIndex < boxCount; boxIndex += 1) {
      const plan = normalizeBuildPlan(box.buildPlan);

      plan.always.forEach((entry) => {
        const build = buildsById[entry.build];
        if (!build) return;
        for (let count = 0; count < entry.count; count += 1) {
          consumeBuildForPlan(build, remaining, shortages, equivalents);
        }
      });

      plan.choices.forEach((choice) => {
        for (let count = 0; count < choice.pick; count += 1) {
          const build = choosePlanOption(choice.options, buildsById, remaining, equivalents);
          if (build) consumeBuildForPlan(build, remaining, shortages, equivalents);
        }
      });
    }
  });

  return shortages;
}

export function calculateLeftovers(inventory, required) {
  const leftovers = {};
  const shortages = {};
  const partIds = new Set([...Object.keys(inventory), ...Object.keys(required)]);

  partIds.forEach((partId) => {
    const remaining = (inventory[partId] ?? 0) - (required[partId] ?? 0);
    if (remaining > 0) leftovers[partId] = remaining;
    if (remaining < 0) shortages[partId] = Math.abs(remaining);
  });

  return { leftovers, shortages };
}

export function calculateAvailableBuilds(catalog, leftovers) {
  const equivalents = makeEquivalentIndex(catalog);
  return catalog.builds
    .map((build) => ({ build, max: maxBuildCount(build, leftovers, equivalents) }))
    .filter((entry) => entry.max > 0)
    .sort((a, b) => a.build.slot.localeCompare(b.build.slot) || a.build.nameKo.localeCompare(b.build.nameKo));
}

export function formatPartList(parts, partIndex) {
  return Object.entries(parts)
    .map(([id, count]) => ({
      id,
      count,
      nameKo: partIndex[id]?.nameKo ?? id,
      nameEn: partIndex[id]?.nameEn ?? id
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function addParts(target, parts, multiplier) {
  if (multiplier <= 0) return;
  Object.entries(parts).forEach(([partId, count]) => {
    if (count <= 0) return;
    target[partId] = (target[partId] ?? 0) + count * multiplier;
  });
}

function addFlexibleParts(required, parts, inventory, equivalents) {
  Object.entries(parts).forEach(([partId, count]) => {
    for (let index = 0; index < count; index += 1) {
      const chosenPart = chooseEquivalentPart(partId, inventory, required, equivalents);
      required[chosenPart] = (required[chosenPart] ?? 0) + 1;
    }
  });
}

function addOptionParts(required, optionRequires, inventory, equivalents) {
  optionRequires.forEach((option) => {
    const partId = chooseOptionPart(option, inventory, required, equivalents);
    required[partId] = (required[partId] ?? 0) + option.count;
  });
}

function chooseOptionPart(option, inventory, required, equivalents) {
  return uniqueParts(option.parts.flatMap((partId) => equivalentParts(partId, equivalents))).sort((a, b) => {
    const aRemaining = (inventory[a] ?? 0) - (required[a] ?? 0);
    const bRemaining = (inventory[b] ?? 0) - (required[b] ?? 0);
    return bRemaining - aRemaining;
  })[0];
}

function normalizeSprueParts(sprue) {
  const parts = {};

  if (sprue.partRange) {
    Object.entries(expandPartRange(sprue.partRange)).forEach(([partId, count]) => {
      parts[partId] = count;
    });
  }

  (sprue.partIds ?? []).forEach((partId) => {
    parts[partId] = 1;
  });

  Object.entries(sprue.extraParts ?? {}).forEach(([partId, count]) => {
    parts[partId] = count;
  });

  return parts;
}

export function getSprueParts(sprue) {
  return normalizeSprueParts(sprue);
}

function makeEquivalentIndex(catalog) {
  const index = {};

  catalog.sprues.forEach((sprue) => {
    (sprue.equivalentParts ?? []).forEach((group) => {
      group.forEach((partId) => {
        index[partId] = uniqueParts([partId, ...group]);
      });
    });
  });

  return index;
}

function equivalentParts(partId, equivalents) {
  return equivalents[partId] ?? [partId];
}

function uniqueParts(parts) {
  return [...new Set(parts)];
}

function chooseEquivalentPart(partId, inventory, required, equivalents) {
  return equivalentParts(partId, equivalents).sort((a, b) => {
    const aRemaining = (inventory[a] ?? 0) - (required[a] ?? 0);
    const bRemaining = (inventory[b] ?? 0) - (required[b] ?? 0);
    return bRemaining - aRemaining;
  })[0];
}

function expandPartRange(range) {
  const numbers = range.only ?? numbersFromRange(range.from, range.to)
    .filter((number) => !(range.except ?? []).includes(number));

  return Object.fromEntries(numbers.map((number) => [
    formatPartId(range.prefix, number, range.pad),
    1
  ]));
}

function numbersFromRange(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function formatPartId(prefix, number, pad = 0) {
  return `${prefix}${String(number).padStart(pad, "0")}`;
}

function maxBuildCount(build, inventory, equivalents) {
  const remaining = { ...inventory };
  let count = 0;

  while (consumeBuild(build, remaining, equivalents)) {
    count += 1;
  }

  return count;
}

function consumeBuild(build, inventory, equivalents) {
  const remaining = { ...inventory };
  if (!consumeParts(build.requires, remaining, equivalents)) return false;

  for (const option of build.optionRequires ?? []) {
    const partId = chooseConsumableOptionPart(option, remaining, equivalents);
    if (!partId) return false;
    remaining[partId] -= option.count;
  }

  Object.assign(inventory, remaining);
  return true;
}

function consumeParts(parts, inventory, equivalents) {
  return Object.entries(parts).every(([partId, count]) => {
    for (let index = 0; index < count; index += 1) {
      const consumed = consumeOneEquivalentPart(partId, inventory, equivalents);
      if (!consumed) return false;
    }
    return true;
  });
}

function consumeOneEquivalentPart(partId, inventory, equivalents) {
  const candidate = equivalentParts(partId, equivalents)
    .find((candidatePartId) => (inventory[candidatePartId] ?? 0) > 0);
  if (!candidate) return null;
  inventory[candidate] -= 1;
  return candidate;
}

function chooseConsumableOptionPart(option, inventory, equivalents) {
  return uniqueParts(option.parts.flatMap((partId) => equivalentParts(partId, equivalents)))
    .find((partId) => (inventory[partId] ?? 0) >= option.count);
}

function consumeBuildForPlan(build, remaining, shortages, equivalents) {
  consumePartsForPlan(build.requires, remaining, shortages, equivalents);

  (build.optionRequires ?? []).forEach((option) => {
    for (let count = 0; count < option.count; count += 1) {
      const partId = chooseConsumableOptionPart({ ...option, count: 1 }, remaining, equivalents)
        ?? option.parts[0];
      consumePartForPlan(partId, remaining, shortages, equivalents);
    }
  });
}

function consumePartsForPlan(parts, remaining, shortages, equivalents) {
  Object.entries(parts).forEach(([partId, count]) => {
    for (let index = 0; index < count; index += 1) {
      consumePartForPlan(partId, remaining, shortages, equivalents);
    }
  });
}

function consumePartForPlan(partId, remaining, shortages, equivalents) {
  const consumed = consumeOneEquivalentPart(partId, remaining, equivalents);
  if (consumed) return;
  shortages[partId] = (shortages[partId] ?? 0) + 1;
}

function choosePlanOption(options, buildsById, remaining, equivalents) {
  return options
    .map((buildId) => buildsById[buildId])
    .filter(Boolean)
    .sort((a, b) => countMissingParts(a, remaining, equivalents) - countMissingParts(b, remaining, equivalents))[0];
}

function countMissingParts(build, inventory, equivalents) {
  const remaining = { ...inventory };
  const shortages = {};
  consumeBuildForPlan(build, remaining, shortages, equivalents);
  return Object.values(shortages).reduce((sum, count) => sum + count, 0);
}
