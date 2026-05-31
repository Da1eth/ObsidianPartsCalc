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

  Object.entries(selectedBuilds).forEach(([buildId, count]) => {
    if (count <= 0) return;
    const build = buildsById[buildId];
    for (let index = 0; index < count; index += 1) {
      addParts(required, build.requires, 1);
      addOptionParts(required, build.optionRequires ?? [], inventory);
    }
  });

  return required;
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
  return catalog.builds
    .map((build) => ({ build, max: maxBuildCount(build, leftovers) }))
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

function addOptionParts(required, optionRequires, inventory) {
  optionRequires.forEach((option) => {
    const partId = chooseOptionPart(option, inventory, required);
    required[partId] = (required[partId] ?? 0) + option.count;
  });
}

function chooseOptionPart(option, inventory, required) {
  return [...option.parts].sort((a, b) => {
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

function maxBuildCount(build, inventory) {
  const remaining = { ...inventory };
  let count = 0;

  while (consumeBuild(build, remaining)) {
    count += 1;
  }

  return count;
}

function consumeBuild(build, inventory) {
  if (!hasParts(build.requires, inventory)) return false;
  subtractParts(build.requires, inventory);

  for (const option of build.optionRequires ?? []) {
    const partId = chooseConsumableOptionPart(option, inventory);
    if (!partId) return false;
    inventory[partId] -= option.count;
  }

  return true;
}

function hasParts(parts, inventory) {
  return Object.entries(parts).every(([partId, count]) => (inventory[partId] ?? 0) >= count);
}

function subtractParts(parts, inventory) {
  Object.entries(parts).forEach(([partId, count]) => {
    inventory[partId] -= count;
  });
}

function chooseConsumableOptionPart(option, inventory) {
  return option.parts.find((partId) => (inventory[partId] ?? 0) >= option.count);
}
