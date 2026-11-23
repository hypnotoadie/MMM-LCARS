/* MMM-WeatherNav
 * Tap the current-weather chip to open the forecast page; tap Close (or the chip again) to go back.
 *
 * Two jobs, one small front-end module (no node_helper, no npm install):
 *   1. Opening: a click anywhere on the chip (class from `chipSelector`, the built-in weather
 *      module with classes "weather-current") sends SHOW_HIDDEN_PAGE "weather" to MMM-pages.
 *      The listener is on the document, because the chip is drawn by another module and is
 *      redrawn on every weather update; a listener on the chip itself would be lost.
 *   2. Closing: this module is in the config with classes "weather-close page-weather", so MMM-pages
 *      shows it only on the forecast page. It draws the Close button, which sends LEAVE_HIDDEN_PAGE
 *      (back to the page the mirror was on). Tapping the chip while the forecast page is up
 *      closes it too: this module is visible only then, so `this.hidden` tells which way to go.
 *
 * Chip watchdog: the chip sometimes stays on "Loading" (data pushed while the chip was hidden, or a
 * stale draw). Every `watchSeconds` this module checks the chip's text; if it still says Loading
 * after `graceChecks` checks it asks the weather module to redraw (updateDom) and logs a line
 * starting "[MMM-WeatherNav]" to the browser console, so a stuck chip can be told apart from a
 * chip with no data (the redraw fixes the first, not the second).
 *
 * Notifications:
 *   out  SHOW_HIDDEN_PAGE "weather"    (name = `hiddenPage`)
 *   out  LEAVE_HIDDEN_PAGE
 *
 * Install on the Pi: ~/MagicMirror/modules/MMM-WeatherNav/MMM-WeatherNav.js (the deploy script
 * links it). Styling: custom.css "WEATHER CLOSE BUTTON".
 *
 * Do not name a method after one of MagicMirror's own (show, hide, init, ...): see the gotchas
 * in house-page-and-nest.md.
 */
Module.register("MMM-WeatherNav", {
  defaults: {
    chipSelector: ".module.weather-current",  // the tappable weather chip
    hiddenPage: "weather",                    // name in MMM-pages hiddenPages
    label: "Close",
    debounceMs: 400,                          // ignore a second tap this soon after the first
    watchSeconds: 10,                         // how often to look at the chip
    graceChecks: 2                            // checks still on "Loading" before the first redraw
  },

  start() {
    this.lastTap = 0;
    // Capture phase on the document: still fires if something inside the chip stops bubbling.
    this.chipListener = (event) => this.onChipTap(event);
    document.addEventListener("click", this.chipListener, true);
    this.loadingChecks = 0;
    this.watchTimer = setInterval(() => this.checkChip(), this.config.watchSeconds * 1000);
  },

  // Redraw the weather chip if it has been stuck on "Loading".
  checkChip() {
    const chip = document.querySelector(this.config.chipSelector);
    if (!chip || !/loading/i.test(chip.textContent || "")) {
      if (this.loadingChecks > 0) console.log("[MMM-WeatherNav] chip is showing weather again");
      this.loadingChecks = 0;
      return;
    }
    this.loadingChecks += 1;
    if (this.loadingChecks <= this.config.graceChecks) return;
    const target = MM.getModules().withClass("weather-current")[0];
    if (!target) return;
    console.log(`[MMM-WeatherNav] chip still Loading after ${this.loadingChecks} checks (hidden=${target.hidden}); redrawing it`);
    target.updateDom(0);
  },

  // True if this tap should count (guards against a double fire on touch screens).
  acceptTap() {
    const now = Date.now();
    if (now - this.lastTap < this.config.debounceMs) return false;
    this.lastTap = now;
    return true;
  },

  onChipTap(event) {
    const target = event.target;
    if (!target || !target.closest || !target.closest(this.config.chipSelector)) return;
    if (!this.acceptTap()) return;
    // This module is shown only while the forecast page is up (it has the page-weather class).
    if (this.hidden) {
      this.openForecast();
    } else {
      this.closeForecast();
    }
  },

  openForecast() {
    this.sendNotification("SHOW_HIDDEN_PAGE", this.config.hiddenPage);
  },

  closeForecast() {
    this.sendNotification("LEAVE_HIDDEN_PAGE");
  },

  getDom() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wn-close";
    button.setAttribute("aria-label", "Close the forecast");
    button.innerHTML = '<span class="wn-x">×</span><span class="wn-label"></span>';
    button.querySelector(".wn-label").textContent = this.config.label;
    button.addEventListener("click", () => {
      if (this.acceptTap()) this.closeForecast();
    });
    return button;
  }
});
