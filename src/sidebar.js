import { formatPartList } from "./calculator.js";
import { groupPartsBySprue } from "./catalogQueries.js";
import { textHtml } from "./html.js";
import { iconSvg } from "./svg.js";

export function setupSidebar() {
  const els = {
    sidebar: document.querySelector("#sidebar"),
    openButton: document.querySelector("#sidebar-open"),
    closeButton: document.querySelector("#sidebar-close"),
    backdrop: document.querySelector("#sidebar-backdrop")
  };

  function setOpen(isOpen) {
    els.sidebar.classList.toggle("open", isOpen);
    els.sidebar.setAttribute("aria-hidden", String(!isOpen));
    document.body.classList.toggle("drawer-open", isOpen);
  }

  els.openButton.addEventListener("click", () => setOpen(true));
  els.closeButton.addEventListener("click", () => setOpen(false));
  els.backdrop.addEventListener("click", () => setOpen(false));

  setOpen(false);
}

export function renderSidebarFactions({ target, catalog, activeFactionId, onSelectFaction }) {
  target.innerHTML = "";
  catalog.factions.forEach((faction) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${faction.id === activeFactionId ? " active" : ""}`;
    button.textContent = faction.id;
    button.addEventListener("click", () => onSelectFaction(faction.id));
    target.append(button);
  });
}

export function renderSidebarBoxes({
  target,
  boxes,
  boxCounts,
  selectedPlanCount,
  maxBoxCount,
  onChangeBoxCount,
  onAddSelectedBoxPlans
}) {
  target.innerHTML = "";
  boxes.forEach((box) => {
    const row = document.createElement("div");
    const count = boxCounts[box.id] ?? 0;
    row.className = "surface-row quantity-row";
    row.innerHTML = `
      <span>
        ${textHtml(box.nameKo, "strong")}
      </span>
      ${stepperHtml(count, "박스 수량")}
    `;
    bindStepper(row, count, 0, maxBoxCount, (value) => onChangeBoxCount(box.id, value));
    target.append(row);
  });

  const actions = document.createElement("div");
  actions.className = "box-actions";
  actions.innerHTML = `
    <button class="button button-strong button-block" type="button" ${selectedPlanCount === 0 ? "disabled" : ""}>
      선택한 박스 부품 전부 계획에 추가
    </button>
  `;
  actions.querySelector("button").addEventListener("click", onAddSelectedBoxPlans);
  target.append(actions);
}

export function renderSidebarLeftovers({ target, leftovers, partIndex, scopedCatalog }) {
  const rows = formatPartList(leftovers, partIndex);
  if (rows.length === 0) {
    target.innerHTML = `<p class="empty">남는 파츠가 없습니다.</p>`;
    return;
  }

  const grouped = groupPartsBySprue(rows, scopedCatalog);
  target.innerHTML = "";

  grouped.forEach((group) => {
    const details = document.createElement("details");
    details.className = "sprue-group";
    details.innerHTML = `
      <summary>
        <span>
          <strong>${group.nameKo}</strong>
        </span>
        <b>${group.total}</b>
      </summary>
      <div class="part-table">
        ${group.parts.map(sidebarPartRowHtml).join("")}
      </div>
    `;
    target.append(details);
  });
}

export function renderSummaryStats({ target, boxCount, selectedCount, inventoryStats }) {
  target.textContent = `${boxCount} boxes · ${selectedCount} builds · ${inventoryStats.totalParts} parts · ${inventoryStats.byMaterial.plastic ?? 0} plastic · ${inventoryStats.byMaterial.resin ?? 0} resin`;
}

function sidebarPartRowHtml(row) {
  return `
    <div class="surface-row part-row" title="${row.nameEn}">
      <code>${row.id}</code>
      <b>× ${row.count}</b>
    </div>
  `;
}

function stepperHtml(value, label) {
  return `
    <span class="stepper" aria-label="${label}">
      <button type="button" data-step="-1" aria-label="감소">${iconSvg("minus")}</button>
      <strong>${value}</strong>
      <button type="button" data-step="1" aria-label="증가">${iconSvg("plus")}</button>
    </span>
  `;
}

function bindStepper(root, initialValue, min, max, onChange) {
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
