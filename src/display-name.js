const HIDDEN_DISPLAY_IDS = new Set(["G"]);

export function withBuildDisplayNames(build) {
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
