export function validateBuildPlans(catalog) {
  const issues = [];
  const buildsById = new Set(catalog.builds.map((build) => build.id));

  catalog.boxes.forEach((box) => {
    const plan = box.buildPlan;
    if (!plan) return;
    const normalized = normalizeBuildPlan(plan);

    normalized.always.forEach((entry) => {
      if (!buildsById.has(entry.build)) {
        issues.push(`${box.id}: buildPlan.always references unknown build ${entry.build}`);
      }
      if (!Number.isInteger(entry.count) || entry.count <= 0) {
        issues.push(`${box.id}: buildPlan.always ${entry.build} has invalid count ${entry.count}`);
      }
    });

    normalized.choices.forEach((choice) => {
      if (!choice.id) issues.push(`${box.id}: buildPlan choice is missing id`);
      if (!Number.isInteger(choice.pick) || choice.pick <= 0) {
        issues.push(`${box.id}: buildPlan choice ${choice.id} has invalid pick ${choice.pick}`);
      }
      (choice.options ?? []).forEach((buildId) => {
        if (!buildsById.has(buildId)) {
          issues.push(`${box.id}: buildPlan choice ${choice.id} references unknown build ${buildId}`);
        }
      });
    });
  });

  return issues;
}

export function normalizeBuildPlan(plan = {}) {
  if (plan.always || plan.choices) {
    return {
      always: normalizeAlways(plan.always),
      choices: normalizeChoices(plan.choices)
    };
  }

  const always = [];
  const choices = [];

  Object.entries(plan).forEach(([id, value]) => {
    if (Array.isArray(value)) {
      const [pick, ...options] = value;
      choices.push({ id, pick, options });
      return;
    }

    if (typeof value === "object" && value.options) {
      choices.push({ id, pick: value.pick, options: value.options });
      return;
    }

    always.push({ build: id, count: value });
  });

  return { always, choices };
}

export function normalizeAlways(always = []) {
  if (!Array.isArray(always) && typeof always === "object") {
    return Object.entries(always).map(([build, count]) => ({ build, count }));
  }

  return always.map((entry) => {
    if (typeof entry === "string") {
      const match = entry.match(/^(.+)\*(\d+)$/);
      return match
        ? { build: match[1], count: Number(match[2]) }
        : { build: entry, count: 1 };
    }
    return entry;
  });
}

function normalizeChoices(choices = []) {
  if (!Array.isArray(choices) && typeof choices === "object") {
    return Object.entries(choices).map(([id, value]) => {
      if (Array.isArray(value)) {
        const [pick, ...options] = value;
        return { id, pick, options };
      }
      return { id, ...value };
    });
  }

  return choices;
}
