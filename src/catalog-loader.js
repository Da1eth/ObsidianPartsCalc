import { parseYaml } from "./yaml.js";
import { withBuildDisplayNames } from "./display-name.js";

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
