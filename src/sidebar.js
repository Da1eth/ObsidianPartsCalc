export function bindSidebar({ state, els, render, overlayQuery }) {
  els.sidebarOpen.addEventListener("click", () => {
    state.sidebarOpen = true;
    render();
  });

  els.sidebarClose.addEventListener("click", () => {
    state.sidebarOpen = false;
    render();
  });

  els.sidebarBackdrop.addEventListener("click", () => {
    if (!overlayQuery.matches) {
      return;
    }
    state.sidebarOpen = false;
    render();
  });
}

export function renderSidebar({ state, els }) {
  els.sidebar.classList.toggle("open", state.sidebarOpen);
  els.sidebar.setAttribute("aria-hidden", String(!state.sidebarOpen));
  document.body.classList.toggle("drawer-open", state.sidebarOpen);
}
