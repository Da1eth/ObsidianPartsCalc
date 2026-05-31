export const catalogConfig = {
  schemaVersion: 1,
  slots: [
    { id: "torso", nameKo: "토르소", nameEn: "Torso", icon: "⬢" },
    { id: "chassis", nameKo: "섀시", nameEn: "Chassis", icon: "◆" },
    { id: "leftArm", nameKo: "왼팔", nameEn: "Left Arm", icon: "◀" },
    { id: "rightArm", nameKo: "오른팔", nameEn: "Right Arm", icon: "▶" },
    { id: "backpack", nameKo: "백팩", nameEn: "Backpack", icon: "▣" },
    { id: "drone", nameKo: "드론", nameEn: "Drone", icon: "◉" },
    { id: "projectiles", nameKo: "발사체", nameEn: "Projectiles & Deployables", icon: "✦" }
  ],
  parts: [],
  factions: [
    {
      id: "UN",
      nameKo: "UN",
      nameEn: "UN",
      folder: "UN"
    },
    {
      id: "RDL",
      nameKo: "RDL",
      nameEn: "RDL",
      folder: "RDL"
    },
    {
      id: "GOF",
      nameKo: "GOF",
      nameEn: "GOF",
      folder: "GOF"
    },
    {
      id: "Other",
      nameKo: "기타",
      nameEn: "Other",
      folder: "Other"
    }
  ],
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
