export function parseYaml(source) {
  const lines = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((raw) => ({ indent: raw.search(/\S|$/), text: stripComment(raw).trim() }))
    .filter((line) => line.text.length > 0);

  return parseBlock(lines, 0, lines[0]?.indent ?? 0).value;
}

function parseBlock(lines, index, indent) {
  if (!lines[index]?.text.startsWith("- ") && !isMappingPair(lines[index]?.text ?? "")) {
    return { value: parseScalar(lines[index].text), index: index + 1 };
  }
  if (lines[index]?.text.startsWith("- ")) {
    return parseArray(lines, index, indent);
  }
  return parseObject(lines, index, indent);
}

function parseArray(lines, index, indent) {
  const items = [];

  while (index < lines.length && lines[index].indent === indent && lines[index].text.startsWith("- ")) {
    const rest = lines[index].text.slice(2).trim();
    index += 1;

    if (!rest) {
      const nested = parseBlock(lines, index, nextIndent(lines, index, indent));
      items.push(nested.value);
      index = nested.index;
      continue;
    }

    if (isMappingPair(rest)) {
      const item = {};
      applyPair(item, rest, lines, index, indent + 2);
      while (index < lines.length && lines[index].indent === indent + 2 && !lines[index].text.startsWith("- ")) {
        const pair = readPair(lines[index].text);
        index += 1;
        item[pair.key] = pair.value === "" ? parseNested(lines, index, indent + 4) : parseScalar(pair.value);
        if (pair.value === "") index = item[pair.key].index;
        if (item[pair.key]?.value !== undefined) item[pair.key] = item[pair.key].value;
      }
      items.push(item);
      continue;
    }

    items.push(parseScalar(rest));
  }

  return { value: items, index };
}

function parseObject(lines, index, indent) {
  const object = {};

  while (index < lines.length && lines[index].indent === indent && !lines[index].text.startsWith("- ")) {
    const pair = readPair(lines[index].text);
    index += 1;

    if (pair.value === "") {
      const nested = parseBlock(lines, index, nextIndent(lines, index, indent));
      object[pair.key] = nested.value;
      index = nested.index;
    } else {
      object[pair.key] = parseScalar(pair.value);
    }
  }

  return { value: object, index };
}

function parseNested(lines, index, indent) {
  return parseBlock(lines, index, nextIndent(lines, index, indent - 2));
}

function nextIndent(lines, index, fallback) {
  return lines[index]?.indent ?? fallback + 2;
}

function applyPair(target, text) {
  const pair = readPair(text);
  target[pair.key] = pair.value === "" ? {} : parseScalar(pair.value);
}

function readPair(text) {
  const colon = findTopLevelColon(text);
  return {
    key: text.slice(0, colon).trim(),
    value: text.slice(colon + 1).trim()
  };
}

function isMappingPair(text) {
  return findTopLevelColon(text) !== -1;
}

function findTopLevelColon(text) {
  let quote = null;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") quote = char;
    if (char === "[" || char === "{") depth += 1;
    if (char === "]" || char === "}") depth -= 1;
    if (char === ":" && depth === 0) return index;
  }
  return -1;
}

function parseScalar(value) {
  if (value === "[]") return [];
  if (value === "{}") return {};
  if (value.startsWith("[") && value.endsWith("]")) return parseInlineArray(value);
  if (value.startsWith("{") && value.endsWith("}")) return parseInlineObject(value);
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return unquote(value);
}

function parseInlineArray(value) {
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];
  return splitTopLevel(inner).map(parseScalar);
}

function parseInlineObject(value) {
  const inner = value.slice(1, -1).trim();
  if (!inner) return {};
  return Object.fromEntries(splitTopLevel(inner).map((entry) => {
    const pair = readPair(entry);
    return [pair.key, parseScalar(pair.value)];
  }));
}

function splitTopLevel(text) {
  const parts = [];
  let quote = null;
  let depth = 0;
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") quote = char;
    if (char === "[" || char === "{") depth += 1;
    if (char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(text.slice(start).trim());
  return parts;
}

function stripComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") quote = char;
    if (char === "#") return line.slice(0, index);
  }
  return line;
}

function unquote(value) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
