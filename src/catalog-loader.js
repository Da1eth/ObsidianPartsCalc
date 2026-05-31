import { parseYaml } from "./yaml.js";
import { catalogConfig } from "./catalog-config.js";

export async function loadCatalog() {
  const dataRoot = new URL("../data/", import.meta.url);
  const factions = await Promise.all(catalogConfig.factions.map((faction) => fetchFaction(faction, dataRoot)));

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

async function fetchFaction(faction, baseUrl) {
  const files = catalogConfig.factionFiles;
  const factionUrl = new URL(`${faction.folder}/`, baseUrl);
  const buildFileKeys = ["torso", "chassis", "rightArm", "leftArm", "backpack", "drone"];
  const [boxes, sprues, ...buildFiles] = await Promise.all([
    fetchYaml(files.boxes, factionUrl),
    fetchYaml(files.sprues, factionUrl),
    ...buildFileKeys.map((key) => fetchYaml(files[key], factionUrl))
  ]);

  return {
    id: faction.id,
    nameKo: faction.nameKo,
    nameEn: faction.nameEn,
    boxes,
    sprues,
    builds: buildFiles.flat()
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
