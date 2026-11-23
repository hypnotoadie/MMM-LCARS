/* MMM-Landing
 * The home screen: one big tile per page. Tap a tile to open that page. Replaces timed rotation.
 * The look comes from custom.css ("LANDING" section and its LCARS block).
 *
 * Each tile in `tiles` does ONE of:
 *   page: <index>          -> PAGE_SELECT <index>        (an MMM-pages page)
 *   hiddenPage: "<name>"   -> SHOW_HIDDEN_PAGE "<name>"  (an MMM-pages hidden page, e.g. photos)
 *   notification: { name, payload }  -> any other notification
 *   disabled: true         -> drawn dimmed, does nothing (a page that is not built yet)
 *
 * While this module is on screen it puts the class `on-landing` on <html>, so custom.css can
 * place other modules differently on the home screen (e.g. the calendar filter pills).
 *
 * Install on the Pi: ~/MagicMirror/modules/MMM-Landing/MMM-Landing.js
 * (front end only: no node_helper, no npm install).
 */
Module.register("MMM-Landing", {
  defaults: {
    pageIndex: 0,                       // this module's own MMM-pages page (for the on-landing class)
    heading: "Select display",
    hint: "Touch a panel to engage",
    sideHeading: "Calendars",           // above the filter pills (LCARS only)
    tiles: [
      // { label: "Month", page: 1, icon: "month", tone: "gold", tag: "Cal" }
    ]
  },

  // Line art from the artboard (viewBox 386 x 187). Drawn in currentColor = the tile's tone.
  icons: {
    month: '<defs><pattern id="lnd-mg" width="39" height="33" patternUnits="userSpaceOnUse"><rect x="1.5" y="1.5" width="36" height="30" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.5"/></pattern></defs><rect x="0" y="0" width="273" height="8" fill="currentColor"/><rect x="0" y="16" width="273" height="165" fill="url(#lnd-mg)"/><rect x="44" y="36" width="29" height="7" fill="currentColor"/><rect x="122" y="54" width="29" height="7" fill="currentColor"/><rect x="83" y="87" width="29" height="7" fill="currentColor"/><rect x="200" y="87" width="29" height="7" fill="currentColor"/><rect x="5" y="120" width="29" height="7" fill="currentColor"/><rect x="161" y="153" width="29" height="7" fill="currentColor"/><rect x="295" y="0" width="91" height="8" fill="currentColor"/><rect x="295" y="22" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="319" y="26" width="60" height="8" fill="currentColor" opacity=".7"/><rect x="295" y="58" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="319" y="62" width="48" height="8" fill="currentColor" opacity=".7"/><rect x="295" y="94" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="319" y="98" width="56" height="8" fill="currentColor" opacity=".7"/><rect x="295" y="130" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="319" y="134" width="40" height="8" fill="currentColor" opacity=".7"/>',
    week: '<rect x="165" y="14" width="55" height="173" fill="currentColor" opacity=".15"/><rect x="6" y="0" width="43" height="8" fill="currentColor"/><rect x="61" y="0" width="43" height="8" fill="currentColor"/><rect x="116" y="0" width="43" height="8" fill="currentColor"/><rect x="171" y="0" width="43" height="8" fill="currentColor"/><rect x="226" y="0" width="43" height="8" fill="currentColor"/><rect x="281" y="0" width="43" height="8" fill="currentColor"/><rect x="336" y="0" width="43" height="8" fill="currentColor"/><g stroke="currentColor" stroke-width="2" opacity=".35"><line x1="0" y1="30" x2="386" y2="30"/><line x1="0" y1="66" x2="386" y2="66"/><line x1="0" y1="102" x2="386" y2="102"/><line x1="0" y1="138" x2="386" y2="138"/><line x1="0" y1="174" x2="386" y2="174"/></g><g stroke="currentColor" stroke-width="2" opacity=".5"><line x1="55" y1="14" x2="55" y2="187"/><line x1="110" y1="14" x2="110" y2="187"/><line x1="165" y1="14" x2="165" y2="187"/><line x1="220" y1="14" x2="220" y2="187"/><line x1="275" y1="14" x2="275" y2="187"/><line x1="330" y1="14" x2="330" y2="187"/></g><rect x="5" y="50" width="45" height="28" fill="currentColor"/><rect x="60" y="66" width="45" height="34" fill="currentColor"/><rect x="115" y="102" width="45" height="60" fill="currentColor"/><rect x="170" y="30" width="45" height="30" fill="currentColor"/><rect x="225" y="80" width="45" height="46" fill="currentColor"/><rect x="280" y="138" width="45" height="36" fill="currentColor"/><rect x="335" y="36" width="45" height="26" fill="currentColor"/>',
    agenda: '<rect x="0" y="0" width="62" height="36" fill="currentColor"/><rect x="76" y="4" width="240" height="11" fill="currentColor"/><rect x="76" y="22" width="160" height="8" fill="currentColor" opacity=".5"/><rect x="0" y="50" width="62" height="36" fill="currentColor"/><rect x="76" y="54" width="210" height="11" fill="currentColor"/><rect x="76" y="72" width="130" height="8" fill="currentColor" opacity=".5"/><rect x="0" y="100" width="62" height="36" fill="currentColor" opacity=".55"/><rect x="76" y="104" width="250" height="11" fill="currentColor"/><rect x="76" y="122" width="170" height="8" fill="currentColor" opacity=".5"/><rect x="0" y="150" width="62" height="36" fill="currentColor" opacity=".55"/><rect x="76" y="154" width="190" height="11" fill="currentColor"/><rect x="76" y="172" width="110" height="8" fill="currentColor" opacity=".5"/>',
    chores: '<rect x="2" y="3" width="28" height="28" fill="currentColor"/><polyline points="8,17 15,24 25,10" fill="none" stroke="var(--tile-ink, #000)" stroke-width="4"/><rect x="46" y="9" width="220" height="11" fill="currentColor" opacity=".5"/><rect x="300" y="7" width="80" height="24" rx="12" fill="currentColor"/><rect x="2" y="51" width="28" height="28" fill="currentColor"/><polyline points="8,65 15,72 25,58" fill="none" stroke="var(--tile-ink, #000)" stroke-width="4"/><rect x="46" y="57" width="180" height="11" fill="currentColor" opacity=".5"/><rect x="300" y="55" width="80" height="24" rx="12" fill="currentColor"/><rect x="3.5" y="99.5" width="25" height="25" fill="none" stroke="currentColor" stroke-width="3"/><rect x="46" y="105" width="240" height="11" fill="currentColor"/><rect x="300" y="103" width="80" height="24" rx="12" fill="currentColor"/><rect x="3.5" y="147.5" width="25" height="25" fill="none" stroke="currentColor" stroke-width="3"/><rect x="46" y="153" width="200" height="11" fill="currentColor"/><rect x="300" y="151" width="80" height="24" rx="12" fill="currentColor"/>',
    photos: '<rect x="1.5" y="1.5" width="383" height="184" fill="none" stroke="currentColor" stroke-width="3"/><polygon points="20,168 110,82 170,132 250,52 366,168" fill="currentColor" opacity=".45"/><circle cx="306" cy="48" r="17" fill="currentColor"/>',
    house: '<polyline points="14,86 96,18 178,86" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="miter"/><rect x="38" y="80" width="116" height="102" fill="none" stroke="currentColor" stroke-width="6"/><rect x="82" y="124" width="30" height="58" fill="currentColor"/><rect x="56" y="98" width="20" height="20" fill="currentColor" opacity=".55"/><rect x="118" y="98" width="20" height="20" fill="currentColor" opacity=".55"/><circle cx="292" cy="94" r="84" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="292" cy="94" r="62" fill="currentColor" opacity=".15"/><path d="M 232 146 A 74 74 0 1 1 352 146" fill="none" stroke="currentColor" stroke-width="10" opacity=".35"/><path d="M 232 146 A 74 74 0 0 1 292 20" fill="none" stroke="currentColor" stroke-width="10"/><rect x="262" y="78" width="60" height="12" fill="currentColor"/><rect x="272" y="100" width="40" height="8" fill="currentColor" opacity=".6"/>'
  },

  start() {
    this.onLanding = false;
  },

  /* ---- the on-landing class ---- */
  setOnLanding(on) {
    this.onLanding = on;
    document.documentElement.classList.toggle("on-landing", on);
  },
  // MagicMirror calls these when MMM-pages shows / hides this module.
  resume() { this.setOnLanding(true); },
  suspend() { this.setOnLanding(false); },

  notificationReceived(notification, payload) {
    if (notification === "NEW_PAGE" && typeof payload === "number") {
      this.setOnLanding(payload === this.config.pageIndex);
    } else if (notification === "DOM_OBJECTS_CREATED") {
      // First draw: MMM-pages starts on the home page, which may not trigger resume().
      if (!this.hidden) this.setOnLanding(true);
    }
  },

  /* ---- tap ---- */
  activate(tile) {
    if (tile.disabled) return;
    if (typeof tile.page === "number") this.sendNotification("PAGE_SELECT", tile.page);
    else if (tile.hiddenPage) this.sendNotification("SHOW_HIDDEN_PAGE", tile.hiddenPage);
    else if (tile.notification) this.sendNotification(tile.notification.name, tile.notification.payload);
  },

  /* ---- drawing ---- */
  getDom() {
    const wrap = document.createElement("div");
    wrap.className = "landing";

    const head = document.createElement("div");
    head.className = "landing-head";
    head.innerHTML = `<div class="landing-title"></div><div class="landing-hint"></div>`;
    head.querySelector(".landing-title").textContent = this.config.heading;
    head.querySelector(".landing-hint").textContent = this.config.hint;
    wrap.appendChild(head);

    const side = document.createElement("div");
    side.className = "landing-side-head";
    side.textContent = this.config.sideHeading;
    wrap.appendChild(side);

    const grid = document.createElement("div");
    grid.className = "landing-tiles";
    this.config.tiles.forEach((tile, i) => {
      const num = tile.num || String(i + 1).padStart(2, "0");
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tile tone-${tile.tone || "orange"}${tile.disabled ? " is-disabled" : ""}`;
      if (tile.disabled) b.setAttribute("aria-disabled", "true");
      b.setAttribute("aria-label", `${tile.label}${tile.disabled ? " (not available yet)" : ""}`);
      const art = this.icons[tile.icon] || "";
      b.innerHTML =
        `<span class="tile-body"><span class="tile-stripe"></span>` +
          `<span class="tile-art"><svg viewBox="0 0 386 187" aria-hidden="true">${art}</svg></span></span>` +
        `<span class="tile-bar"><span class="tile-name"><span class="tile-num"></span><span class="tile-label"></span></span>` +
          `<span class="tile-tag"></span></span>`;
      b.querySelector(".tile-num").textContent = num;
      b.querySelector(".tile-label").textContent = tile.label;
      b.querySelector(".tile-tag").textContent = tile.tag || "";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.activate(tile);
      });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
    return wrap;
  }
});
