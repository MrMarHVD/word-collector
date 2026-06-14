export function renderLocalTabs(buttons, activeValue, { valueAttribute = "data-local-tab" } = {}) {
  buttons.forEach((button) => {
    const active = button.getAttribute(valueAttribute) === activeValue;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

export function bindLocalTabs(buttons, onSelect, { valueAttribute = "data-local-tab" } = {}) {
  buttons.forEach((button) => {
    button.addEventListener("click", () => onSelect(button.getAttribute(valueAttribute)));
  });
}
