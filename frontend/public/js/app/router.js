import { renderReaderSidebar } from "../views/reader.js";
import { setActiveTab, showView } from "../views/shell.js";

function renderReaderSidebarAfterLayout() {
  requestAnimationFrame(() => requestAnimationFrame(renderReaderSidebar));
}

export function activateTab(tabName) {
  setActiveTab(tabName);
  if (tabName === "reader") {
    renderReaderSidebarAfterLayout();
  }
}

export { showView };
