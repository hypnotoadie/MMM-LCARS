/* MMM-ThemeSwitcher
 * A round button that cycles the whole mirror through its colour themes.
 *
 * In this template it has one job: put the class "theme-lcars" on <html>, which every LCARS rule
 * in custom.css depends on. With more than one theme in config.js, the button cycles them.
 *
 * How it works: it puts a class on <html>, "theme-<name>" (e.g. theme-lcars).
 * custom.css defines each theme as a block of colour variables under that class, so one class
 * change restyles every module at once, with no reload. The choice is saved in localStorage
 * (per browser, so the Pi's screen and a PC browser each remember their own).
 *
 * Adding a theme = add { name: "mytheme", label: "My theme" } to `themes` in config.js
 * and an `html.theme-mytheme { ... }` block in custom.css. Nothing here changes.
 * A theme with `cycle: false` is skipped by the button but still reachable with THEME_SET
 * (used for LCARS while its pages are being built). Once you are on it, a tap goes on to the
 * next theme in the list.
 *
 * Notifications:
 *   in   THEME_NEXT                  cycle to the next theme
 *   in   THEME_SET  "lcars"          jump to a theme by name (a string, or { name: "lcars" })
 *   out  THEME_CHANGED { name }      sent after every change, for other modules
 *
 * Install on the Pi: ~/MagicMirror/modules/MMM-ThemeSwitcher/MMM-ThemeSwitcher.js
 * (front end only: no node_helper, no npm install).
 */
Module.register("MMM-ThemeSwitcher", {
  defaults: {
    // Order = cycle order. The first one is the default. `name` becomes the class theme-<name>.
    themes: [
      { name: "lcars", label: "LCARS" }
    ],
    remember: true,                    // keep the choice across a reload / restart (localStorage)
    storageKey: "MMM-ThemeSwitcher.theme",
    labelMs: 1500                      // how long the theme name shows next to the button after a tap
  },

  start() {
    this.index = this.loadIndex();
    this.labelTimer = null;
    // Apply now, before the other modules draw, so there is no flash of the wrong theme.
    this.apply();
  },

  /* ---- state ---- */
  loadIndex() {
    if (this.config.remember) {
      try {
        const saved = window.localStorage.getItem(this.config.storageKey);
        const i = this.config.themes.findIndex((t) => t.name === saved);
        if (i >= 0) return i;
      } catch (e) { /* storage unavailable: use the default */ }
    }
    return 0;
  },

  save() {
    if (!this.config.remember) return;
    try {
      window.localStorage.setItem(this.config.storageKey, this.config.themes[this.index].name);
    } catch (e) { /* ignore */ }
  },

  current() {
    return this.config.themes[this.index];
  },

  // Next theme the button cycles to, skipping any with cycle: false.
  nextIndex() {
    const n = this.config.themes.length;
    for (let step = 1; step <= n; step++) {
      const i = (this.index + step) % n;
      if (this.config.themes[i].cycle !== false) return i;
    }
    return this.index;
  },

  /* ---- apply ---- */
  apply() {
    const root = document.documentElement;
    this.config.themes.forEach((t) => root.classList.remove(`theme-${t.name}`));
    root.classList.add(`theme-${this.current().name}`);
    root.dataset.theme = this.current().name;
  },

  setIndex(i) {
    this.index = ((i % this.config.themes.length) + this.config.themes.length) % this.config.themes.length;
    this.apply();
    this.save();
    this.refresh(true);
    this.sendNotification("THEME_CHANGED", { name: this.current().name });
  },

  notificationReceived(notification, payload) {
    if (notification === "THEME_NEXT") {
      this.setIndex(this.nextIndex());
    } else if (notification === "THEME_SET") {
      const name = typeof payload === "string" ? payload : payload && payload.name;
      const i = this.config.themes.findIndex((t) => t.name === name);
      if (i >= 0) this.setIndex(i);
    }
  },

  /* ---- drawing ---- */
  refresh(showLabel) {
    if (!this.button) return;
    const t = this.current();
    const next = this.config.themes[this.nextIndex()];
    this.button.setAttribute("aria-label", `Theme: ${t.label || t.name}. Tap for ${next.label || next.name}.`);
    this.label.textContent = t.label || t.name;
    if (showLabel) {
      this.label.classList.add("show");
      clearTimeout(this.labelTimer);
      this.labelTimer = setTimeout(() => this.label.classList.remove("show"), this.config.labelMs);
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "theme-switcher-wrap";

    this.label = document.createElement("span");
    this.label.className = "theme-name";

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "theme-btn";
    this.button.innerHTML = '<span class="theme-icon"></span>';
    this.button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setIndex(this.nextIndex());
    });

    wrapper.appendChild(this.label);
    wrapper.appendChild(this.button);
    this.refresh(false);
    return wrapper;
  }
});
