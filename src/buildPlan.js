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

function normalizeAlways(always = []) {
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
