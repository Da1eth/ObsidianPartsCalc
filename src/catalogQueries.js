import { normalizeBuildPlan } from "./buildPlan.js";
import { getSprueParts } from "./calculator.js";

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

function sortSourceEntries(sources) {
  Object.values(sources).forEach((entries) => {
    entries.sort((a, b) => b.count - a.count || a.nameKo.localeCompare(b.nameKo));
  });
}
