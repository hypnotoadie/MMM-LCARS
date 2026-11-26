/* MMM-PhotoWake
 * Leave the photo slideshow with a tap, and (optional) start it after the screen sits idle.
 *
 * Why: MMM-pages hides every other module (the `fixed` ones too) while the hidden page "photos" is
 * up, so nothing on screen can take a tap. This module is in the config with classes
 * "photo-wake page-photos", so MMM-pages shows it ONLY on the photos page. There it lays a
 * transparent full-screen layer over the slideshow; the first tap anywhere sends HOME_PAGE (the
 * landing screen) and is swallowed, so it does not press anything underneath.
 *
 * The layer is display:none except between resume() and suspend() (MagicMirror calls these when
 * MMM-pages shows / hides the module), so it can never block taps on the other pages.
 *
 * Idle screensaver (off unless `idleMinutes` > 0): any tap or key resets a timer; when it runs out
 * and the photos page is not already up, it sends SHOW_HIDDEN_PAGE "photos".
 *
 * Notifications:
 *   out  HOME_PAGE (or `wakeNotification` / `wakePayload`)
 *   out  SHOW_HIDDEN_PAGE "photos" (name = `hiddenPage`)   idle timer only
 *
 * Install: link or copy this folder to ~/MagicMirror/modules/MMM-PhotoWake (see the README).
 * No node_helper, no npm install, no CSS needed (the layer is styled inline).
 *
 * Do not name a method after one of MagicMirror's own (show, hide, init, ...).
 */
Module.register("MMM-PhotoWake", {
  defaults: {
    hiddenPage: "photos",          // name in MMM-pages hiddenPages
    wakeNotification: "HOME_PAGE", // HOME_PAGE = landing screen; LEAVE_HIDDEN_PAGE = the page you came from
    wakePayload: undefined,
    idleMinutes: 0,                // 0 = no idle screensaver; e.g. 5 = show photos after 5 min untouched
    guardMs: 1000                  // ignore further taps this long after waking (touch double-fires)
  },

  start() {
    this.onPhotos = false;
    this.lastWake = 0;
    this.layer = null;
    if (this.config.idleMinutes > 0) {
      this.activityListener = () => this.restartIdleTimer();
      ["pointerdown", "keydown"].forEach((type) =>
        document.addEventListener(type, this.activityListener, true));
      this.restartIdleTimer();
    }
  },

  // MagicMirror calls these when MMM-pages shows / hides this module (= the photos page).
  resume() { this.setPhotosUp(true); },
  suspend() { this.setPhotosUp(false); },

  setPhotosUp(up) {
    this.onPhotos = up;
    if (this.layer) this.layer.style.display = up ? "block" : "none";
    if (!up) this.restartIdleTimer();
  },

  restartIdleTimer() {
    if (!(this.config.idleMinutes > 0)) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.onPhotos) this.sendNotification("SHOW_HIDDEN_PAGE", this.config.hiddenPage);
    }, this.config.idleMinutes * 60 * 1000);
  },

  wakeUp(event) {
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (!this.onPhotos || now - this.lastWake < this.config.guardMs) return;
    this.lastWake = now;
    this.sendNotification(this.config.wakeNotification, this.config.wakePayload);
  },

  getDom() {
    if (!this.layer) {
      const layer = document.createElement("div");
      layer.className = "photo-wake-layer";
      layer.setAttribute("aria-label", "Tap to return to the calendar");
      Object.assign(layer.style, {
        position: "fixed", inset: "0", zIndex: "10000",
        background: "transparent", cursor: "pointer", touchAction: "manipulation",
        display: this.onPhotos ? "block" : "none"
      });
      const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
      layer.addEventListener("pointerdown", (e) => this.wakeUp(e));
      // The click that follows the tap must not reach whatever is under the finger.
      ["pointerup", "click", "touchend"].forEach((type) => layer.addEventListener(type, swallow));
      this.layer = layer;
    }
    return this.layer;
  }
});
