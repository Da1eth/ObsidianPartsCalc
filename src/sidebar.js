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
