import { formatPartList, getBuildRequirementChoices } from "./calculator.js";
import { withPartSources } from "./catalogQueries.js";
import { bindStepper, stepperHtml, textHtml } from "./html.js";
import { normalizedChoiceCounts } from "./planState.js";
import { iconSvg, partIconHtml } from "./svg.js";

export function renderSlots({ target, slots, activeSlotId, allSlotId, onSelectSlot }) {
  target.innerHTML = "";
  const tabs = [{ id: allSlotId, nameKo: "전체", icon: "✦" }, ...slots];
  tabs.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${activeSlotId === slot.id ? " active" : ""}`;
    button.innerHTML = `${partIconHtml(slot, "part-icon-frame slot-tab-icon")}<span>${slot.nameKo}</span>`;
    button.addEventListener("click", () => onSelectSlot(slot.id));
    target.append(button);
  });
}

export function renderBuildList({
  target,
  builds,
  slotIndex,
  buildSources,
  onAddBuild
}) {
  target.innerHTML = "";
  builds.forEach((build) => {
    const slot = slotIndex[build.slot];
    const row = document.createElement("button");
    const sources = buildSources[build.id] ?? [];
    row.className = "surface-row action-row build-row";
    row.type = "button";
    row.setAttribute("aria-label", `${build.nameKo} 조립 계획에 추가`);
    row.innerHTML = `
      ${partIconHtml(slot)}
      <span${sources.length > 0 ? ' class="part-source-anchor"' : ""}>
        ${textHtml(build.nameKo, "strong")}
        ${textHtml(build.nameEn, "small")}
        ${sources.length > 0 ? partSourceTooltipHtml("이 부품 카드가 포함된 박스", sources) : ""}
      </span>
    `;
    row.addEventListener("click", () => onAddBuild(build.id, 1));
    target.append(row);
  });
  bindPartSourceTooltips(target);
}

export function renderSelectedBuilds({
  target,
  selectedBuilds,
  selectedChoices,
  slotIndex,
  minMaxBuildCount,
  onChangeBuildCount,
  onDeleteBuild,
  onCycleChoice
}) {
  target.innerHTML = "";

  if (selectedBuilds.length === 0) {
    target.innerHTML = `<p class="empty">아직 선택한 부품이 없습니다.</p>`;
    return;
  }

  selectedBuilds.forEach(({ build, count }) => {
    const slot = slotIndex[build.slot];
    const item = document.createElement("div");
    item.className = "selected-entry";
    item.innerHTML = `
      <div class="surface-row selected-item">
        <span class="selected-build-name">
          ${partIconHtml(slot, "part-icon-frame selected-slot-icon")}
          ${textHtml(build.nameKo, "strong")}
        </span>
        ${stepperHtml(count, `${build.nameKo} 수량`)}
        <button class="button-icon button-danger" type="button" aria-label="${build.nameKo} 삭제">${iconSvg("x")}</button>
      </div>
      ${buildChoiceRowsHtml(build, selectedChoices[build.id] ?? {}, count)}
    `;
    bindStepper(item, count, 0, Math.max(minMaxBuildCount, count), (value) => onChangeBuildCount(build, value));
    item.querySelector(".button-icon").addEventListener("click", () => onDeleteBuild(build));
    item.querySelectorAll(".choice-cycle").forEach((button) => {
      button.addEventListener("click", () => {
        onCycleChoice({
          build,
          choiceId: button.dataset.choiceId,
          optionIndex: Number(button.dataset.optionIndex),
          maxCount: Number(button.dataset.maxCount)
        });
      });
    });
    target.append(item);
  });
}

export function renderShortages({ target, panel, shortages, partIndex, partSources }) {
  renderPartTable(
    target,
    withPartSources(formatPartList(shortages, partIndex), partSources),
    "부족한 파츠가 없습니다."
  );
  panel.hidden = Object.keys(shortages).length === 0;
}

export function renderAvailableBuilds({
  target,
  button,
  available,
  slotIndex,
  onAddBuild
}) {
  target.innerHTML = "";
  button.disabled = available.length === 0;

  if (available.length === 0) {
    target.innerHTML = `<p class="empty">남은 파츠로 바로 조립 가능한 부품이 없습니다.</p>`;
    return;
  }

  available.forEach(({ build, max }) => {
    const slot = slotIndex[build.slot];
    const item = document.createElement("button");
    item.className = "surface-row action-row available-item";
    item.type = "button";
    item.setAttribute("aria-label", `${build.nameKo} 조립 계획에 추가`);
    item.innerHTML = `
      ${partIconHtml(slot)}
      <span>
        ${textHtml(build.nameKo, "strong")}
        ${textHtml(`${build.nameEn} · ${max}개 조립 가능`, "small")}
      </span>
    `;
    item.addEventListener("click", () => onAddBuild(build.id, 1));
    target.append(item);
  });
}

function buildChoiceRowsHtml(build, selectedChoices, buildCount) {
  const choices = getBuildRequirementChoices(build).filter((choice) => choice.options.length > 1);
  if (choices.length === 0) return "";

  return `
    <div class="selected-choice-list">
      ${choices.map((choice) => {
        const counts = normalizedChoiceCounts(choice, buildCount, selectedChoices[choice.id]);
        const maxCount = choice.pick * buildCount;
        return `
          ${choice.options.map((option, optionIndex) => `
            <div class="selected-choice-row">
              <span class="choice-branch" aria-hidden="true">└</span>
              <button
                class="selected-choice choice-cycle"
                type="button"
                data-choice-id="${choice.id}"
                data-option-index="${optionIndex}"
                data-max-count="${maxCount}"
                aria-label="${build.nameKo} ${option.label} 수량 변경"
              >
                ${textHtml(`선택 파츠 : ${option.label} × ${counts[optionIndex] ?? 0}`, "span", "choice-meta")}
              </button>
            </div>
          `).join("")}
        `;
      }).join("")}
    </div>
  `;
}

function renderPartTable(target, rows, emptyText) {
  if (rows.length === 0) {
    target.innerHTML = `<p class="empty">${emptyText}</p>`;
    return;
  }

  target.innerHTML = rows.map(partRowHtml).join("");
  bindPartSourceTooltips(target);
}

function partRowHtml(row) {
  const sources = row.sources ?? [];

  return `
    <div class="surface-row part-row" title="${sources.length === 0 ? row.nameEn : ""}">
      ${partLabelHtml(row, sources)}
      <b>× ${row.count}</b>
    </div>
  `;
}

function partLabelHtml(row, sources) {
  if (sources.length === 0) return `<code>${row.id}</code>`;

  return `
    <span class="part-source-anchor" tabindex="0">
      <code>${row.id}</code>
      ${partSourceTooltipHtml("이 파츠가 포함된 박스", sources)}
    </span>
  `;
}

function partSourceTooltipHtml(title, sources) {
  return `
    <span class="part-source-tooltip" role="tooltip">
      <strong>${title}</strong>
      ${sources.map((source) => `
        <span>
          <em>${source.nameKo}</em>
          <b>${source.count}개</b>
        </span>
      `).join("")}
    </span>
  `;
}

function bindPartSourceTooltips(target) {
  target.querySelectorAll(".part-source-anchor").forEach((anchor) => {
    const tooltip = anchor.querySelector(".part-source-tooltip");
    if (!tooltip) return;

    const show = () => {
      if (tooltip.hideTimer) {
        window.clearTimeout(tooltip.hideTimer);
        tooltip.hideTimer = null;
      }
      tooltip.classList.add("visible");
      positionPartSourceTooltip(anchor, tooltip);
    };

    const hide = () => {
      tooltip.classList.remove("visible");
      tooltip.hideTimer = window.setTimeout(() => {
        if (!tooltip.classList.contains("visible")) tooltip.removeAttribute("style");
        tooltip.hideTimer = null;
      }, 140);
    };

    anchor.addEventListener("mouseenter", show);
    anchor.addEventListener("mousemove", () => positionPartSourceTooltip(anchor, tooltip));
    anchor.addEventListener("mouseleave", hide);
    anchor.addEventListener("focus", show);
    anchor.addEventListener("blur", hide);
  });
}

function positionPartSourceTooltip(anchor, tooltip) {
  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportPadding = 10;
  const gap = 8;

  let left = anchorRect.left;
  let top = anchorRect.top - tooltipRect.height - gap;

  if (top < viewportPadding) {
    top = anchorRect.bottom + gap;
  }

  left = Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding);
  left = Math.max(viewportPadding, left);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}
