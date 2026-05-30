// Applies the saved theme before first paint to avoid a flash of the wrong
// theme. Loaded as a classic (non-module) script in <head> so it runs
// synchronously before the stylesheet — a module would defer and reintroduce
// the flash. Kept external (rather than inline) to satisfy the strict CSP.
(() => {
  let preference = "system";
  try {
    preference = localStorage.getItem("wordMarkerTheme") || "system";
  } catch {
    preference = "system";
  }
  if (!["system", "light", "dark"].includes(preference)) {
    preference = "system";
  }
  const theme = preference === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
})();
