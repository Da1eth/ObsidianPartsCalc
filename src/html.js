import { iconSvg } from "./svg.js";

export function textHtml(text, tagName = "span", className = "") {
  const safeTag = /^[a-z][a-z0-9-]*$/i.test(tagName) ? tagName : "span";
  const classes = ["text-ellipsis", className].filter(Boolean).join(" ");
  return `<${safeTag} class="${escapeHtml(classes)}">${escapeHtml(text)}</${safeTag}>`;
}

export function stepperHtml(value, label) {
  return `
    <span class="stepper" aria-label="${label}">
      <button type="button" data-step="-1" aria-label="감소">${iconSvg("minus")}</button>
      <strong>${value}</strong>
      <button type="button" data-step="1" aria-label="증가">${iconSvg("plus")}</button>
    </span>
  `;
}

export function bindStepper(root, initialValue, min, max, onChange) {
  let value = initialValue;
  const display = root.querySelector(".stepper strong");
  root.querySelectorAll(".stepper button").forEach((button) => {
    button.addEventListener("click", () => {
      value = Math.min(max, Math.max(min, value + Number(button.dataset.step)));
      display.textContent = value;
      onChange(value);
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
