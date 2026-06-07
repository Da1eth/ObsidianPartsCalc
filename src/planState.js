import { getBuildRequirementChoices } from "./calculator.js";

export function addBuildToFactionState(factionState, faction, buildId, count) {
  if (count <= 0) return;
  const build = faction.builds.find((candidate) => candidate.id === buildId);
  if (!build) return;

  const nextCount = (factionState.builds[buildId] ?? 0) + count;
  factionState.builds[buildId] = nextCount;
  factionState.choices[buildId] = normalizedBuildChoiceCounts(
    build,
    nextCount,
    factionState.choices[buildId] ?? {}
  );
}

export function setBuildCount(factionState, build, count) {
  factionState.builds[build.id] = count;
  if (count === 0) {
    delete factionState.choices[build.id];
    return;
  }

  factionState.choices[build.id] = normalizedBuildChoiceCounts(
    build,
    count,
    factionState.choices[build.id] ?? {}
  );
}

export function normalizedBuildChoiceCounts(build, buildCount, selectedChoices) {
  return Object.fromEntries(getBuildRequirementChoices(build)
    .filter((choice) => choice.options.length > 1)
    .map((choice) => [choice.id, normalizedChoiceCounts(choice, buildCount, selectedChoices[choice.id])]));
}

export function normalizedChoiceCounts(choice, buildCount, selectedCounts) {
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

export function cycleChoiceCount(counts, optionIndex, maxCount) {
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
