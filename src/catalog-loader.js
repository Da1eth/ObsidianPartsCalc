import { parseYaml } from "./yaml.js";

export async function loadCatalog() {
  const dataRoot = new URL("../data/", import.meta.url);
  const index = await fetchYaml("index.yaml", dataRoot);
  const [common, factions] = await Promise.all([
    fetchYaml(index.common, dataRoot),
    Promise.all(index.factions.map((faction) => fetchFaction(faction, dataRoot)))
  ]);

  return {
    schemaVersion: index.schemaVersion,
    slots: common.slots,
    parts: common.parts,
    factions,
    boxes: factions.flatMap((faction) => faction.boxes ?? []),
    sprues: factions.flatMap((faction) => faction.sprues ?? []),
    builds: factions.flatMap((faction) => faction.builds ?? [])
  };
}

async function fetchFaction(faction, baseUrl) {
  const files = faction.files;
  const [boxes, sprues, torso, chassis, rightArm, leftArm, backpack] = await Promise.all([
    fetchYaml(files.boxes, baseUrl),
    fetchYaml(files.sprues, baseUrl),
    fetchYaml(files.torso, baseUrl),
    fetchYaml(files.chassis, baseUrl),
    fetchYaml(files.rightArm, baseUrl),
    fetchYaml(files.leftArm, baseUrl),
    fetchYaml(files.backpack, baseUrl)
  ]);

  return {
    id: faction.id,
    nameKo: faction.nameKo,
    nameEn: faction.nameEn,
    boxes,
    sprues,
    builds: [
      ...torso,
      ...chassis,
      ...rightArm,
      ...leftArm,
      ...backpack
    ]
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
