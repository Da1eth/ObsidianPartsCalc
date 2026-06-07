export function slidingTextHtml(text, tagName = "span", className = "") {
  const safeTag = /^[a-z][a-z0-9-]*$/i.test(tagName) ? tagName : "span";
  const classes = ["sliding-text", className].filter(Boolean).join(" ");
  const escapedText = escapeHtml(text);
  return `<${safeTag} class="${escapeHtml(classes)}"><span class="sliding-track"><span>${escapedText}</span></span></${safeTag}>`;
}

export function refreshSlidingText(root = document) {
  requestAnimationFrame(() => {
    root.querySelectorAll(".sliding-text").forEach((element) => {
      const track = element.querySelector(".sliding-track");
      if (!track) return;

      const label = track.firstElementChild;
      if (!label) return;

      track.replaceChildren(label);

      const textWidth = Math.ceil(label.scrollWidth);
      const containerWidth = Math.ceil(element.clientWidth);
      const gap = Math.max(28, Math.min(52, Math.round(containerWidth * 0.16)));
      const shouldSlide = textWidth > containerWidth + 1;
      element.classList.toggle("is-sliding", shouldSlide);

      if (!shouldSlide) {
        element.style.removeProperty("--sliding-travel");
        element.style.removeProperty("--sliding-duration");
        element.style.removeProperty("--sliding-steps");
        track.style.removeProperty("--sliding-gap");
        return;
      }

      const clone = label.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      track.append(clone);

      track.style.setProperty("--sliding-gap", `${gap}px`);
      element.style.setProperty("--sliding-travel", `${-(textWidth + gap)}px`);
      element.style.setProperty("--sliding-steps", textWidth + gap);
      element.style.setProperty("--sliding-duration", `${Math.min(18, Math.max(7, (textWidth + gap) / 22))}s`);
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
