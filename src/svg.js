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

export function partIconHtml(slot, className = "slot-icon") {
  const svg = partIconSvgs[slot.id];

  if (svg) {
    return `
      <span class="${className} part-pill ${slot.id}-pill" aria-hidden="true">
        ${svg()}
      </span>
    `;
  }

  return `<span class="${className}" aria-hidden="true">${slot.icon}</span>`;
}

const partIconSvgs = {
  torso: torsoPartIconSvg,
  chassis: chassisPartIconSvg,
  leftArm: leftArmPartIconSvg,
  rightArm: rightArmPartIconSvg,
  backpack: backpackPartIconSvg
};

function torsoPartIconSvg() {
  return basePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-core"
      d="M17 7h18v17l-3 4H20l-3-4V7Z"
    ></path>
  `);
}

function chassisPartIconSvg() {
  return basePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-chassis"
      d="M4 37h44v10l-6 6H29V43h-6v10H10l-6-6V37Z"
    ></path>
  `);
}

function leftArmPartIconSvg() {
  return basePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-arm"
      d="M10 7h7v17l3 4v9H4V13l6-6Z"
    ></path>
  `);
}

function rightArmPartIconSvg() {
  return basePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-arm"
      d="M35 7h7l6 6v24H32v-9l3-4V7Z"
    ></path>
  `);
}

function backpackPartIconSvg() {
  return basePartIconSvg(`
    <path
      class="part-icon-fill part-icon-fill-backpack"
      d="M20 28h12v9H20V28Z"
    ></path>
  `);
}

function basePartIconSvg(fill = "") {
  return `
    <svg class="part-icon" viewBox="0 0 52 55" aria-hidden="true" focusable="false">
      ${fill}
      <path
        class="part-icon-line"
        d="M10 7h32l6 6v34l-6 6H29V43h-6v10H10l-6-6V13l6-6Z"
      ></path>
      <path
        class="part-icon-line"
        d="M17 7v17l3 4h12l3-4V7"
      ></path>
      <path
        class="part-icon-line"
        d="M20 28v9M32 28v9"
      ></path>
      <path
        class="part-icon-line"
        d="M4 37h44"
      ></path>
      <path
        class="part-icon-line"
        d="M23 53V43h6v10"
      ></path>
    </svg>
  `;
}
