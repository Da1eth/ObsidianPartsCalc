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

export function calculateRequiredParts(catalog, selectedBuilds, inventory = {}, selectedChoices = {}) {
  const required = {};
  const buildsById = Object.fromEntries(catalog.builds.map((build) => [build.id, build]));
  const equivalents = makeEquivalentIndex(catalog);

  Object.entries(selectedBuilds).forEach(([buildId, count]) => {
    if (count <= 0) return;
    const build = buildsById[buildId];
    if (!build) return;
    const requirements = normalizeBuildRequirements(build);
    for (let index = 0; index < count; index += 1) {
      addFlexibleParts(required, requirements.always, inventory, equivalents);
      addAlternativeParts(required, build.alternativeRequires ?? [], inventory, equivalents);
      addOptionParts(required, build.optionRequires ?? [], inventory, equivalents);
    }
    addRequirementChoices(required, requirements.choices, count, inventory, equivalents, selectedChoices[buildId] ?? {});
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

export function canConsumeBuildEntries(catalog, leftovers, entries) {
  const remaining = { ...leftovers };
  const buildsById = Object.fromEntries(catalog.builds.map((build) => [build.id, build]));
  const equivalents = makeEquivalentIndex(catalog);

  return entries.every((entry) => {
    const build = buildsById[entry.buildId];
    if (!build || entry.count <= 0) return entry.count <= 0;

    for (let count = 0; count < entry.count; count += 1) {
      if (!consumeBuild(build, remaining, equivalents)) return false;
    }

    return true;
  });
}

export function getBuildCompetitionGroups(catalog, leftovers, entries) {
  const buildsById = Object.fromEntries(catalog.builds.map((build) => [build.id, build]));
  const equivalents = makeEquivalentIndex(catalog);
  const buildEntries = entries
    .filter((entry) => entry.count > 0 && buildsById[entry.buildId])
    .map((entry) => ({
      ...entry,
      build: buildsById[entry.buildId]
    }));
  const partSets = Object.fromEntries(buildEntries.map((entry) => [
    entry.buildId,
    buildCompetitionPartIds(entry.build, equivalents)
  ]));
  const competingIds = new Set();
  const connectedIds = {};

  buildEntries.forEach((entry) => {
    connectedIds[entry.buildId] = new Set();
  });

  function connectEntries(entriesToConnect) {
    entriesToConnect.forEach((entry, index) => {
      entriesToConnect.slice(index + 1).forEach((otherEntry) => {
        competingIds.add(entry.buildId);
        competingIds.add(otherEntry.buildId);
        connectedIds[entry.buildId].add(otherEntry.buildId);
        connectedIds[otherEntry.buildId].add(entry.buildId);
      });
    });
  }

  buildEntries.forEach((entry, index) => {
    buildEntries.slice(index + 1).forEach((otherEntry) => {
      if (!entriesActuallyCompete(catalog, leftovers, entry, otherEntry)) return;
      connectEntries([entry, otherEntry]);
    });
  });

  const visited = new Set();
  const groups = [];

  buildEntries.forEach((entry) => {
    if (visited.has(entry.buildId)) return;

    const group = [];
    const queue = [entry.buildId];
    visited.add(entry.buildId);

    while (queue.length > 0) {
      const currentBuildId = queue.shift();
      group.push(currentBuildId);

      connectedIds[currentBuildId].forEach((candidateBuildId) => {
        if (visited.has(candidateBuildId)) return;
        visited.add(candidateBuildId);
        queue.push(candidateBuildId);
      });
    }

    groups.push({
      buildIds: group,
      partIds: competingIds.has(entry.buildId) ? sharedCompetitionPartIds(group, partSets) : []
    });
  });

  return groups;
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

export function getBuildRequirementChoices(build) {
  return normalizeBuildRequirements(build).choices.map((choice) => ({
    id: choice.id,
    pick: choice.pick,
    options: choice.options.map((option) => ({
      label: option.label,
      parts: option.parts
    }))
  }));
}

function buildCompetitionPartIds(build, equivalents) {
  const requirements = normalizeBuildRequirements(build);
  const partIds = new Set();
  addEquivalentPartIds(partIds, requirements.always, equivalents);

  requirements.choices.forEach((choice) => {
    choice.options.forEach((option) => addEquivalentPartIds(partIds, option.parts, equivalents));
  });

  (build.alternativeRequires ?? []).forEach((group) => {
    normalizeRequirementOptions(group.options).forEach((option) => {
      addEquivalentPartIds(partIds, option.parts, equivalents);
    });
  });

  (build.optionRequires ?? []).forEach((option) => {
    option.parts.forEach((partId) => {
      equivalentParts(partId, equivalents).forEach((equivalentPartId) => partIds.add(equivalentPartId));
    });
  });

  return partIds;
}

function addEquivalentPartIds(target, parts, equivalents) {
  Object.keys(parts).forEach((partId) => {
    equivalentParts(partId, equivalents).forEach((equivalentPartId) => target.add(equivalentPartId));
  });
}

function entriesActuallyCompete(catalog, leftovers, entry, otherEntry) {
  return !entriesCanConsumeInEitherOrder(catalog, leftovers, [entry, otherEntry]);
}

function entriesCanConsumeInEitherOrder(catalog, leftovers, entries) {
  const entriesToCheck = entries.map((entry) => ({ buildId: entry.buildId, count: entry.count }));
  const reversedEntries = [...entriesToCheck].reverse();

  return canConsumeBuildEntries(catalog, leftovers, entriesToCheck)
    || canConsumeBuildEntries(catalog, leftovers, reversedEntries);
}

function sharedCompetitionPartIds(buildIds, partSets) {
  const shared = new Set();

  buildIds.forEach((buildId, index) => {
    buildIds.slice(index + 1).forEach((otherBuildId) => {
      partSets[buildId].forEach((partId) => {
        if (partSets[otherBuildId].has(partId)) shared.add(partId);
      });
    });
  });

  return [...shared].sort((a, b) => a.localeCompare(b));
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

function addRequirementChoices(required, choices, buildCount, inventory, equivalents, selectedChoices) {
  choices.forEach((choice) => {
    const totalPick = choice.pick * buildCount;
    const selectedCounts = normalizeSelectedChoiceCounts(choice, selectedChoices[choice.id], totalPick);
    Object.entries(selectedCounts).forEach(([optionIndex, count]) => {
      const option = choice.options[optionIndex];
      if (!option) return;
      for (let index = 0; index < count; index += 1) {
        addFlexibleParts(required, option.parts, inventory, equivalents);
      }
    });

    const selectedTotal = Object.values(selectedCounts).reduce((sum, count) => sum + count, 0);
    for (let count = selectedTotal; count < totalPick; count += 1) {
      const option = selectedRequirementOption(choice, selectedChoices)
        ?? chooseRequirementOption(choice.options, inventory, required, equivalents);
      if (!option) return;
      addFlexibleParts(required, option.parts, inventory, equivalents);
    }
  });
}

function addOptionParts(required, optionRequires, inventory, equivalents) {
  optionRequires.forEach((option) => {
    const partId = chooseOptionPart(option, inventory, required, equivalents);
    required[partId] = (required[partId] ?? 0) + option.count;
  });
}

function addAlternativeParts(required, alternativeRequires, inventory, equivalents) {
  alternativeRequires.forEach((group) => {
    const option = chooseRequirementOption(normalizeRequirementOptions(group.options), inventory, required, equivalents);
    if (!option) return;
    addFlexibleParts(required, option.parts, inventory, equivalents);
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
  const requirements = normalizeBuildRequirements(build);
  if (!consumeParts(requirements.always, remaining, equivalents)) return false;
  if (!consumeRequirementChoices(requirements.choices, remaining, equivalents)) return false;
  if (!consumeAlternativeParts(build.alternativeRequires ?? [], remaining, equivalents)) return false;

  for (const option of build.optionRequires ?? []) {
    const partId = chooseConsumableOptionPart(option, remaining, equivalents);
    if (!partId) return false;
    remaining[partId] -= option.count;
  }

  Object.assign(inventory, remaining);
  return true;
}

function consumeRequirementChoices(choices, inventory, equivalents) {
  return choices.every((choice) => {
    for (let count = 0; count < choice.pick; count += 1) {
      const option = chooseConsumableRequirementOption(choice.options, inventory, equivalents);
      if (!option || !consumeParts(option.parts, inventory, equivalents)) return false;
    }
    return true;
  });
}

function consumeAlternativeParts(alternativeRequires, inventory, equivalents) {
  return alternativeRequires.every((group) => {
    const option = chooseConsumableRequirementOption(normalizeRequirementOptions(group.options), inventory, equivalents);
    if (!option) return false;
    return consumeParts(option.parts, inventory, equivalents);
  });
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
  const requirements = normalizeBuildRequirements(build);
  consumePartsForPlan(requirements.always, remaining, shortages, equivalents);
  consumeRequirementChoicesForPlan(requirements.choices, remaining, shortages, equivalents);
  consumeAlternativePartsForPlan(build.alternativeRequires ?? [], remaining, shortages, equivalents);

  (build.optionRequires ?? []).forEach((option) => {
    for (let count = 0; count < option.count; count += 1) {
      const partId = chooseConsumableOptionPart({ ...option, count: 1 }, remaining, equivalents)
        ?? option.parts[0];
      consumePartForPlan(partId, remaining, shortages, equivalents);
    }
  });
}

function consumeRequirementChoicesForPlan(choices, remaining, shortages, equivalents) {
  choices.forEach((choice) => {
    for (let count = 0; count < choice.pick; count += 1) {
      const option = chooseRequirementOption(choice.options, remaining, {}, equivalents);
      if (!option) return;
      consumePartsForPlan(option.parts, remaining, shortages, equivalents);
    }
  });
}

function consumeAlternativePartsForPlan(alternativeRequires, remaining, shortages, equivalents) {
  alternativeRequires.forEach((group) => {
    const option = chooseRequirementOption(normalizeRequirementOptions(group.options), remaining, {}, equivalents);
    if (!option) return;
    consumePartsForPlan(option.parts, remaining, shortages, equivalents);
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

function chooseRequirementOption(options = [], inventory, required, equivalents) {
  return [...options].sort((a, b) => {
    const aScore = countMissingRequirementParts(a.parts, inventory, required, equivalents);
    const bScore = countMissingRequirementParts(b.parts, inventory, required, equivalents);
    if (aScore !== bScore) return aScore - bScore;
    return countRequirementParts(a.parts) - countRequirementParts(b.parts);
  })[0];
}

function chooseConsumableRequirementOption(options, inventory, equivalents) {
  return chooseRequirementOption(options, inventory, {}, equivalents);
}

function countMissingRequirementParts(parts, inventory, required, equivalents) {
  const remaining = { ...inventory };
  Object.entries(required).forEach(([partId, count]) => {
    remaining[partId] = (remaining[partId] ?? 0) - count;
  });

  let missing = 0;
  Object.entries(parts).forEach(([partId, count]) => {
    for (let index = 0; index < count; index += 1) {
      const consumed = consumeOneEquivalentPart(partId, remaining, equivalents);
      if (!consumed) missing += 1;
    }
  });
  return missing;
}

function countRequirementParts(parts) {
  return Object.values(parts).reduce((sum, count) => sum + count, 0);
}

function normalizeBuildRequirements(build) {
  const always = {};
  const choices = [];

  Object.entries(build.requires ?? {}).forEach(([partId, value]) => {
    if (Array.isArray(value)) {
      const [pick, ...options] = value;
      choices.push({
        id: partId,
        pick,
        options: normalizeRequirementOptions(options)
      });
      return;
    }

    always[partId] = value;
  });

  return { always, choices };
}

function normalizeRequirementOption(option) {
  if (typeof option === "object") {
    return {
      label: Object.keys(option).join("+"),
      parts: option
    };
  }

  const parts = option.split("+").reduce((partMap, partId) => {
    partMap[partId] = (partMap[partId] ?? 0) + 1;
    return partMap;
  }, {});
  return { label: option, parts };
}

function normalizeRequirementOptions(options = []) {
  return options.map(normalizeRequirementOption);
}

function selectedRequirementOption(choice, selectedChoices) {
  const selectedIndex = selectedChoices[choice.id];
  if (!Number.isInteger(selectedIndex)) return null;
  return choice.options[selectedIndex] ?? null;
}

function normalizeSelectedChoiceCounts(choice, selected, totalPick) {
  if (Number.isInteger(selected)) {
    return { [selected]: totalPick };
  }

  if (!selected || typeof selected !== "object") {
    return {};
  }

  let remaining = totalPick;
  return Object.fromEntries(Object.entries(selected)
    .map(([optionIndex, count]) => {
      const bounded = Math.min(Math.max(0, Number(count) || 0), remaining);
      remaining -= bounded;
      return [optionIndex, bounded];
    })
    .filter(([optionIndex, count]) => count > 0 && choice.options[optionIndex]));
}
