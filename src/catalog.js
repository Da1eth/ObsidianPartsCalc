import { normalizeBuildPlan } from "./buildPlan.js";
import { getSprueParts } from "./calculator.js";
import { parseYaml } from "./yaml.js";

const catalogConfig = {
  schemaVersion: 1,
  slots: [
    { id: "torso", nameKo: "토르소" },
    { id: "chassis", nameKo: "섀시" },
    { id: "leftArm", nameKo: "왼팔" },
    { id: "rightArm", nameKo: "오른팔" },
    { id: "backpack", nameKo: "백팩" },
    { id: "drone", nameKo: "드론" },
    { id: "projectiles", nameKo: "발사체" }
  ],
  parts: [],
  factions: ["UN", "RDL", "GOF", "Other"],
  factionFiles: {
    boxes: "box.yaml",
    sprues: "sprue.yaml",
    torso: "torso.yaml",
    chassis: "chassis.yaml",
    rightArm: "rightArm.yaml",
    leftArm: "leftArm.yaml",
    backpack: "backpack.yaml",
    drone: "drone.yaml"
  }
};

export async function loadCatalog() {
  const dataRoot = new URL("../data/", import.meta.url);
  const factions = await Promise.all(catalogConfig.factions.map((factionId) => fetchFaction(factionId, dataRoot)));

  return {
    schemaVersion: catalogConfig.schemaVersion,
    slots: catalogConfig.slots,
    parts: catalogConfig.parts,
    factions,
    boxes: factions.flatMap((faction) => faction.boxes ?? []),
    sprues: factions.flatMap((faction) => faction.sprues ?? []),
    builds: factions.flatMap((faction) => faction.builds ?? [])
  };
}

export function makeIndexes(data) {
  return {
    parts: Object.fromEntries(data.parts.map((part) => [part.id, part])),
    slots: Object.fromEntries(data.slots.map((slot) => [slot.id, slot])),
    builds: Object.fromEntries(data.builds.map((build) => [build.id, build]))
  };
}

export function groupPartsBySprue(rows, scopedCatalog) {
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

export function makeBoxPartSources(scopedCatalog) {
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
        nameKo: box.nameKo,
        count
      });
    });
  });

  sortSourceEntries(sources);
  return sources;
}

export function makeBoxBuildSources(scopedCatalog) {
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
        nameKo: box.nameKo,
        count
      });
    });
  });

  sortSourceEntries(sources);
  return sources;
}

export function withPartSources(rows, partSources) {
  return rows.map((row) => ({
    ...row,
    sources: partSources[row.id] ?? []
  }));
}

async function fetchFaction(factionId, baseUrl) {
  const files = catalogConfig.factionFiles;
  const factionUrl = new URL(`${factionId}/`, baseUrl);
  const buildFileKeys = ["torso", "chassis", "rightArm", "leftArm", "backpack", "drone"];
  const [boxes, sprues, ...buildFiles] = await Promise.all([
    fetchYaml(files.boxes, factionUrl),
    fetchYaml(files.sprues, factionUrl),
    ...buildFileKeys.map((key) => fetchYaml(files[key], factionUrl))
  ]);

  return {
    id: factionId,
    boxes,
    sprues: sprues.map((sprue) => withSprueDefaults(sprue, factionId)),
    builds: buildFiles.flat().map(withBuildDisplayNames)
  };
}

function withSprueDefaults(sprue, factionId) {
  return {
    ...sprue,
    nameKo: sprue.nameKo ?? `${factionId} 스프루 ${sprue.id}`,
    nameEn: sprue.nameEn ?? `${factionId} Sprue ${sprue.id}`,
    partRange: sprue.partRange
      ? {
          prefix: sprue.id,
          ...sprue.partRange
        }
      : sprue.partRange
  };
}

async function fetchYaml(path, baseUrl) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url.pathname}: ${response.status}`);
  }
  return parseYaml(await response.text());
}

const HIDDEN_DISPLAY_IDS = new Set(["G"]);

function withBuildDisplayNames(build) {
  return {
    ...build,
    nameKo: formatCompositeBuildName(build.id, build.nameKo),
    nameEn: formatCompositeBuildName(build.id, build.nameEn)
  };
}

function formatCompositeBuildName(id, name) {
  if (typeof id !== "string" || typeof name !== "string") return name;

  const idParts = id.split("+").map(displayIdForPart);
  const nameParts = name.split("+");
  if (idParts.length !== nameParts.length) return prefixMissingId(idParts[0], name);

  return nameParts
    .map((partName, index) => prefixMissingId(idParts[index], partName))
    .join("+");
}

function displayIdForPart(id) {
  return id.replace(/\/.+$/, "").replace(/_[A-Z]+$/, "");
}

function prefixMissingId(displayId, name) {
  const trimmed = name.trim();
  if (!displayId || HIDDEN_DISPLAY_IDS.has(displayId) || startsWithDisplayId(trimmed, displayId)) {
    return trimmed;
  }
  return `${displayId} ${trimmed}`;
}

function startsWithDisplayId(name, displayId) {
  if (name === displayId || name.startsWith(`${displayId} `)) return true;

  const suffix = name.slice(displayId.length);
  return name.startsWith(displayId) && /^[A-Z0-9]/.test(suffix);
}

function sortSourceEntries(sources) {
  Object.values(sources).forEach((entries) => {
    entries.sort((a, b) => b.count - a.count || a.nameKo.localeCompare(b.nameKo));
  });
}
