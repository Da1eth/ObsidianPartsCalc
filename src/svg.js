export function iconSvg(name) {
  const paths = {
    minus: `<path d="M5 12h14"></path>`,
    plus: `<path d="M12 5v14"></path><path d="M5 12h14"></path>`,
    x: `<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>`
  };

  return `
    <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      ${paths[name]}
    </svg>
  `;
}

export function partIconHtml(slot, className = "part-icon-frame slot-icon") {
  const svg = partIconSvgs[slot.id];

  if (svg) {
    return `
      <span class="${className} part-pill ${slot.id}-pill" aria-hidden="true">
        ${svg()}
      </span>
    `;
  }

  return `<span class="${className}" aria-hidden="true">${slot.icon ?? ""}</span>`;
}

const partIconSvgs = {
  torso: torsoPartIconSvg,
  chassis: chassisPartIconSvg,
  leftArm: leftArmPartIconSvg,
  rightArm: rightArmPartIconSvg,
  backpack: backpackPartIconSvg,
  drone: dronePartIconSvg,
  projectiles: projectilesPartIconSvg
};

function torsoPartIconSvg() {
  return basePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-core"
      d="M22 6h20v20l-4 5H26l-4-5V6Z"
    ></path>
  `);
}

function chassisPartIconSvg() {
  return basePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-chassis"
      d="M7 43h50v8l-7 7H36V52h-8v5H14l-7-7V43Z"
    ></path>
  `);
}

function leftArmPartIconSvg() {
  return basePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-arm"
      d="M14 6h8v20l4 5v12H7V13l7-7Z"
    ></path>
  `);
}

function rightArmPartIconSvg() {
  return basePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-arm"
      d="M42 6h8l7 7v30H38V31l4-5V6Z"
    ></path>
  `);
}

function backpackPartIconSvg() {
  return basePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-backpack"
      d="M26 31h12v12H26V31Z"
    ></path>
  `);
}

function dronePartIconSvg() {
  return baseSquarePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-drone"
      d="M32 19l13 13-13 13-13-13 13-13Z"
    ></path>
  `);
}

function projectilesPartIconSvg() {
  return baseSquarePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-projectiles"
      d="M24 23l5-6h6l5 6v22H24V23Z"
    ></path>
  `);
}

function basePartIconSvg(fill = "") {
  return `
    <svg class="part-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      ${fill}
      <path
        class="part-icon-line"
        d="M14 6h36l7 7v38l-7 7H36V49h-8v9H14l-7-7V13l7-7Z"
      ></path>
      <path
        class="part-icon-line"
        d="M22 6v20l4 5h12l4-5V6"
      ></path>
      <path
        class="part-icon-line"
        d="M26 31v12M38 31v12"
      ></path>
      <path
        class="part-icon-line"
        d="M7 43h50"
      ></path>
    </svg>
  `;
}

function baseSquarePartIconSvg(fill = "") {
  return `
    <svg class="part-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      ${fill}
      <path
        class="part-icon-line"
        d="M14 6h36l7 7v38l-7 7H14l-7-7V13l7-7Z"
      ></path>
    </svg>
  `;
}
