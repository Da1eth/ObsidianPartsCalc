import {
  canConsumeBuildEntries,
  getBuildCompetitionGroups
} from "./calculator.js";
import { iconSvg, partIconHtml } from "./svg.js";

export function openAvailableBuildsDialog({
  available,
  leftovers,
  scopedCatalog,
  indexes,
  onConfirm
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "build-plan-dialog";
  const choices = makeAvailableBuildChoiceState(available, leftovers, scopedCatalog);
  const choiceGroups = makeAvailableBuildChoiceGroups(choices, leftovers, scopedCatalog, indexes);

  dialog.innerHTML = `
    <form class="build-plan-modal" method="dialog">
      <div class="build-plan-modal-header">
        <span>
          <strong>추가 조립 부품 선택</strong>
          <small>서로 같은 파츠를 쓰는 부품이 있어서 전부 담을 수 없습니다. 담을 부품을 선택해주세요.</small>
        </span>
        <button class="icon-button" value="cancel" type="submit" aria-label="닫기">${iconSvg("x")}</button>
      </div>
      <div class="build-plan-choice-list available-build-choice-list"></div>
      <div class="build-plan-modal-actions">
        <button class="ghost-button" value="cancel" type="submit">취소</button>
        <button class="primary-button" value="confirm" type="submit">확인</button>
      </div>
    </form>
  `;

  const choiceList = dialog.querySelector(".build-plan-choice-list");

  function choiceRowHtml(index) {
    const choice = choices[index];
    const slot = indexes.slots[choice.build.slot];
    const canDecrease = choice.count > 0;
    const canIncrease = canConsumeBuildEntries(scopedCatalog, leftovers, choices.map((entry, choiceIndex) => ({
      buildId: entry.build.id,
      count: entry.count + (choiceIndex === index ? 1 : 0)
    })));

    return `
      <div class="plan-choice-option available-build-choice">
        ${partIconHtml(slot)}
        <span>
          <strong>${choice.build.nameKo}</strong>
          <small>${choice.build.nameEn}</small>
        </span>
        <span
          class="stepper"
          aria-label="${choice.build.nameKo} 수량"
          data-choice-index="${index}"
        >
          <button
            type="button"
            data-step="-1"
            aria-label="감소"
            ${!canDecrease ? "disabled" : ""}
          >${iconSvg("minus")}</button>
          <strong>${choice.count}</strong>
          <button
            type="button"
            data-step="1"
            aria-label="증가"
            ${choice.count >= choice.max || !canIncrease ? "disabled" : ""}
          >${iconSvg("plus")}</button>
        </span>
      </div>
    `;
  }

  function renderChoices() {
    choiceList.innerHTML = choiceGroups.map((group) => `
      <section class="build-plan-choice">
        <h3>${group.title}</h3>
        <small>${group.detail}</small>
        <div class="build-plan-options">
          ${group.indexes.map(choiceRowHtml).join("")}
        </div>
      </section>
    `).join("");
  }

  choiceList.addEventListener("click", (event) => {
    const button = event.target.closest(".stepper button");
    if (!button) return;
    const choice = choices[Number(button.closest(".stepper").dataset.choiceIndex)];
    if (!choice) return;
    choice.count = Math.min(choice.max, Math.max(0, choice.count + Number(button.dataset.step)));
    renderChoices();
  });

  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "confirm") {
      onConfirm(choices.filter((choice) => choice.count > 0));
    }
    dialog.remove();
  });

  renderChoices();
  document.body.append(dialog);
  dialog.showModal();
}

export function openBuildPlanDialog({ entries, indexes, onConfirm }) {
  const dialog = document.createElement("dialog");
  dialog.className = "build-plan-dialog";
  const choices = makePlanChoiceState(entries);

  dialog.innerHTML = `
    <form class="build-plan-modal" method="dialog">
      <div class="build-plan-modal-header">
        <span>
          <strong>조립 부품 선택</strong>
          <small>이 박스에는 선택 조립 부품이 포함되어 있습니다. 조립할 부품을 골라주세요.</small>
        </span>
        <button class="icon-button" value="cancel" type="submit" aria-label="닫기">${iconSvg("x")}</button>
      </div>
      <div class="build-plan-choice-list"></div>
      <div class="build-plan-modal-actions">
        <button class="ghost-button" value="cancel" type="submit">취소</button>
        <button class="primary-button" value="confirm" type="submit">확인</button>
      </div>
    </form>
  `;

  const choiceList = dialog.querySelector(".build-plan-choice-list");

  function renderChoices() {
    choiceList.innerHTML = choices.map((choice) => `
      <section class="build-plan-choice">
        <h3>${choice.box.nameKo} · ${choice.id}</h3>
        <small>${selectedPlanChoiceTotal(choice.counts)} / ${choice.total}개 선택 가능</small>
        <div class="build-plan-options">
          ${choice.options.map((buildId, optionIndex) => {
            const build = indexes.builds[buildId];
            const selectedTotal = selectedPlanChoiceTotal(choice.counts);
            return `
              <div class="plan-choice-option">
                <span>
                  <strong>${build?.nameKo ?? buildId}</strong>
                  <small>${build?.nameEn ?? buildId}</small>
                </span>
                <span
                  class="stepper"
                  aria-label="${build?.nameKo ?? buildId} 수량"
                  data-choice-key="${choice.key}"
                  data-option-index="${optionIndex}"
                >
                  <button
                    type="button"
                    data-step="-1"
                    aria-label="감소"
                    ${choice.counts[optionIndex] <= 0 ? "disabled" : ""}
                  >${iconSvg("minus")}</button>
                  <strong>${choice.counts[optionIndex] ?? 0}</strong>
                  <button
                    type="button"
                    data-step="1"
                    aria-label="증가"
                    ${selectedTotal >= choice.total ? "disabled" : ""}
                  >${iconSvg("plus")}</button>
                </span>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `).join("");
  }

  choiceList.addEventListener("click", (event) => {
    const button = event.target.closest(".stepper button");
    if (!button) return;
    const stepper = button.closest(".stepper");
    const choice = choices.find((entry) => entry.key === stepper.dataset.choiceKey);
    if (!choice) return;
    choice.counts = adjustPlanChoiceCount(
      choice.counts,
      Number(stepper.dataset.optionIndex),
      Number(button.dataset.step),
      choice.total
    );
    renderChoices();
  });

  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "confirm") {
      onConfirm(Object.fromEntries(choices.map((choice) => [choice.key, choice])));
    }
    dialog.remove();
  });

  renderChoices();
  document.body.append(dialog);
  dialog.showModal();
}

function makeAvailableBuildChoiceState(available, leftovers, scopedCatalog) {
  const choices = available.map(({ build, max }) => ({ build, max, count: 0 }));

  choices.forEach((choice, index) => {
    while (
      choice.count < choice.max
      && canConsumeBuildEntries(scopedCatalog, leftovers, choices.map((entry, choiceIndex) => ({
        buildId: entry.build.id,
        count: entry.count + (choiceIndex === index ? 1 : 0)
      })))
    ) {
      choice.count += 1;
    }
  });

  return choices;
}

function makeAvailableBuildChoiceGroups(choices, leftovers, scopedCatalog, indexes) {
  const choiceIndexesByBuildId = Object.fromEntries(choices.map((choice, index) => [choice.build.id, index]));
  const competitionGroups = getBuildCompetitionGroups(
    scopedCatalog,
    leftovers,
    choices.map((choice) => ({ buildId: choice.build.id, count: choice.max }))
  );
  let competitionIndex = 0;
  const groups = competitionGroups.map((group) => {
    const choiceIndexes = group.buildIds
      .map((buildId) => choiceIndexesByBuildId[buildId])
      .filter((choiceIndex) => Number.isInteger(choiceIndex));
    const partNames = group.partIds.slice(0, 4).map((partId) => indexes.parts[partId]?.nameKo ?? partId);
    const hiddenCount = Math.max(0, group.partIds.length - partNames.length);

    return {
      indexes: choiceIndexes,
      title: choiceIndexes.length > 1 ? `그룹 ${competitionIndex += 1}` : "독립 부품",
      detail: group.partIds.length > 0
        ? `공유 파츠: ${partNames.join(", ")}${hiddenCount > 0 ? ` 외 ${hiddenCount}개` : ""}`
        : "이 부품들은 전부 담을 수 있습니다."
    };
  });

  const independent = groups.filter((group) => group.indexes.length === 1);
  const competing = groups.filter((group) => group.indexes.length > 1);

  if (independent.length <= 1) return groups;

  return [
    ...competing,
    {
      indexes: independent.flatMap((group) => group.indexes),
      title: "독립 부품",
      detail: "이 부품들은 전부 담을 수 있습니다."
    }
  ];
}

function makePlanChoiceState(entries) {
  return entries.flatMap((entry) => entry.plan.choices.map((choice) => {
    const total = choice.pick * entry.count;
    return {
      key: `${entry.box.id}:${choice.id}`,
      id: choice.id,
      box: entry.box,
      total,
      options: choice.options,
      counts: Object.fromEntries(choice.options.map((_, index) => [index, 0]))
    };
  }));
}

function adjustPlanChoiceCount(counts, optionIndex, step, maxCount) {
  const next = { ...counts };
  const current = next[optionIndex] ?? 0;
  if (step > 0 && selectedPlanChoiceTotal(next) >= maxCount) return next;
  if (step < 0 && current <= 0) return next;

  next[optionIndex] = current + step;

  return next;
}

function selectedPlanChoiceTotal(counts) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
