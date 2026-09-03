/**
 * Light and dark theme for the demo pages.
 *
 * The system preference applies on its own through CSS. This script only
 * remembers an explicit choice, applies it before first paint so a stored
 * dark choice never flashes light, and tells the page when the theme changes
 * so the globes can repaint. Loaded in <head>, synchronously, for that reason.
 */
window.TERRELLA_THEME = (() => {
  "use strict";

  const KEY = "terrella-theme";
  const root = document.documentElement;
  const system = matchMedia("(prefers-color-scheme: dark)");
  const listeners = new Set();

  function stored() {
    try {
      const value = localStorage.getItem(KEY);
      return value === "dark" || value === "light" ? value : null;
    } catch {
      return null;
    }
  }

  /** "dark" or "light": the stored choice, else the system preference. */
  function current() {
    return stored() ?? (system.matches ? "dark" : "light");
  }

  function notify() {
    for (const listener of listeners) listener(current());
  }

  function set(theme) {
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    root.dataset.theme = theme;
    notify();
  }

  function toggle() {
    set(current() === "dark" ? "light" : "dark");
  }

  function onChange(listener) {
    listeners.add(listener);
  }

  system.addEventListener("change", () => {
    if (!stored()) notify();
  });

  /**
   * Wires a `role="switch"` button: click toggles, and aria-checked follows
   * the theme wherever the change came from.
   */
  function bindSwitch(element) {
    const reflect = () => element.setAttribute("aria-checked", String(current() === "dark"));
    reflect();
    element.addEventListener("click", toggle);
    onChange(reflect);
  }

  const choice = stored();
  if (choice) root.dataset.theme = choice;

  return { current, set, toggle, onChange, bindSwitch };
})();
