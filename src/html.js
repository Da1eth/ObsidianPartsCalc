export function textHtml(text, tagName = "span", className = "") {
  const safeTag = /^[a-z][a-z0-9-]*$/i.test(tagName) ? tagName : "span";
  const classes = ["text-ellipsis", className].filter(Boolean).join(" ");
  return `<${safeTag} class="${escapeHtml(classes)}">${escapeHtml(text)}</${safeTag}>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
