/* MMM-LCARSFrame
 * Draws the Star Trek TNG LCARS frame around the screen: the header elbow with the page name,
 * the header and body bars, the left column, the bottom bar, the info panel chrome and
 * the "Family Calendar" title. Geometry is from the LCARS landing artboard (1920 x 1080).
 *
 * It only shows in the LCARS theme: custom.css hides `.module.lcars-frame` unless <html> has
 * the class theme-lcars. Colours are CSS variables (--lc-orange, --lc-periwinkle, ...) set in
 * the html.theme-lcars block of custom.css, so the palette can be tuned there.
 *
 * Other modules sit inside the frame by CSS only (no DOM moves):
 *   clock            -> under the title (top right)
 *   info panel      -> the outlined panel next to the label block (top)
 *   theme button     -> the orange pill in the bottom bar (gap left at x 418 to 798)
 *
 * Touch: the header elbow (page name) is a button. Tap it to go to the landing page
 * (PAGE_SELECT homePage). Everything else ignores taps, so modules underneath still get them.
 *
 * Notifications:
 *   in   NEW_PAGE <index>   (from MMM-pages) updates the elbow name, the tag and the subtitle
 *   in   SHOW_HIDDEN_PAGE <name> / LEAVE_HIDDEN_PAGE   MMM-pages may not send NEW_PAGE for a hidden
 *        page, so the frame listens for these itself: a name found in `hiddenPages` (config) shows that
 *        entry's labels until the page is left (LEAVE_HIDDEN_PAGE, HOME_PAGE or PAGE_SELECT).
 *   out  PAGE_SELECT <homePage>   when the elbow is tapped
 *
 * Install on the Pi: ~/MagicMirror/modules/MMM-LCARSFrame/MMM-LCARSFrame.js
 * (front end only: no node_helper, no npm install). Put it in MMM-pages `fixed`.
 */
Module.register("MMM-LCARSFrame", {
  defaults: {
    title: "Family Calendar",
    homePage: 0,                 // page index of the landing screen
    // One entry per MMM-pages page, by index. name = elbow, tag = header bar label, subtitle = under the clock.
    pages: [
      { name: "Home",   tag: "Landing", subtitle: "Display control · select a screen" }
    ],
    // Labels for MMM-pages hidden pages, by name: { weather: { name, tag, subtitle } }.
    hiddenPages: {},
    panelLabel: ["News", "Feed"],     // the orange block left of the info panel
    // true = leave x 914 to 1908 of the bottom bar empty: the calendar filter pills sit there (CSS).
    filterBar: false,
    // Decorative "access codes" in the left column, top to bottom (LCARS flavour only).
    codes: ["03-417902", "04-880316", "05-229574", "06-651083"]
  },

  start() {
    this.pageIndex = this.config.homePage;
    this.hiddenInfo = null;      // labels of the hidden page on screen, if any
  },

  notificationReceived(notification, payload) {
    if (notification === "NEW_PAGE" && typeof payload === "number") {
      this.pageIndex = payload;
      this.refreshLabels();
    } else if (notification === "SHOW_HIDDEN_PAGE") {
      const info = this.config.hiddenPages[payload];
      if (info) {
        this.hiddenInfo = info;
        this.refreshLabels();
      }
    } else if (notification === "LEAVE_HIDDEN_PAGE" || notification === "HOME_PAGE" || notification === "PAGE_SELECT") {
      if (this.hiddenInfo) {
        this.hiddenInfo = null;
        this.refreshLabels();
      }
    }
  },

  pageInfo() {
    if (this.hiddenInfo) return this.hiddenInfo;
    return this.config.pages[this.pageIndex] || this.config.pages[0] || { name: "", tag: "", subtitle: "" };
  },

  refreshLabels() {
    if (!this.els) return;
    const p = this.pageInfo();
    this.els.name.textContent = p.name || "";
    this.els.tag.textContent = p.tag || "";
    this.els.subtitle.textContent = p.subtitle || "";
    this.els.home.setAttribute("aria-label", `${p.name || "Page"}. Tap to go to the home screen.`);
  },

  /* ---- drawing ---- */
  // One rectangle of the frame. r = border-radius, c = colour token suffix (--lc-<c>).
  block(cls, x, y, w, h, c, r, text) {
    const el = document.createElement("div");
    el.className = `lf-block ${cls || ""}`;
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:var(--lc-${c});` +
      (r ? `border-radius:${r};` : "");
    if (text) el.textContent = text;
    return el;
  },

  // The concave inner corner where an elbow meets its bar. `at` is the corner the cut-out circle
  // sits in. The cut-out is transparent (not black) so content under it is never covered.
  curve(x, y, c, at) {
    const el = document.createElement("div");
    el.className = "lf-curve";
    el.style.cssText = `left:${x}px;top:${y}px;width:60px;height:60px;` +
      `background:radial-gradient(circle at ${at}, transparent 59px, var(--lc-${c}) 60px);`;
    return el;
  },

  getDom() {
    const f = document.createElement("div");
    f.className = "lcars-frame";
    const add = (el) => { f.appendChild(el); return el; };
    const codes = this.config.codes;

    /* ---- header elbow (tappable: home) ---- */
    const home = document.createElement("button");
    home.type = "button";
    home.className = "lf-block lf-home";
    home.style.cssText = "left:0;top:12px;width:150px;height:174px;background:var(--lc-periwinkle);border-radius:60px 0 0 90px;";
    const name = document.createElement("span");
    name.className = "lf-home-name";
    home.appendChild(name);
    home.addEventListener("click", (e) => {
      e.stopPropagation();
      this.sendNotification("PAGE_SELECT", this.config.homePage);
    });
    add(home);
    add(this.curve(150, 90, "periwinkle", "100% 0"));

    /* ---- header bar (y 150) ---- */
    add(this.block("", 150, 150, 520, 36, "periwinkle"));
    add(this.block("", 678, 150, 60, 36, "orange"));
    const tag = add(this.block("lf-label lf-tag", 746, 150, 360, 36, "lilac"));
    add(this.block("", 1114, 150, 400, 36, "tan"));
    add(this.block("", 1522, 150, 386, 36, "red", "0 18px 18px 0"));

    /* ---- info panel panel chrome (the module itself is placed over the box by CSS) ---- */
    const lbl = add(this.block("lf-panel-label", 330, 22, 130, 104, "orange"));
    lbl.innerHTML = "<b></b><span></span>";
    lbl.querySelector("b").textContent = this.config.panelLabel[0] || "";
    lbl.querySelector("span").textContent = this.config.panelLabel[1] || "";
    const box = document.createElement("div");
    box.className = "lf-block lf-panel-box";
    box.style.cssText = "left:468px;top:22px;width:742px;height:104px;";
    add(box);

    /* ---- title + subtitle (the clock sits between them, placed by CSS) ---- */
    const title = document.createElement("div");
    title.className = "lf-title";
    title.textContent = this.config.title;
    add(title);
    const subtitle = document.createElement("div");
    subtitle.className = "lf-subtitle";
    add(subtitle);

    /* ---- body elbow + left column ---- */
    add(this.block("lf-label lf-code", 0, 196, 150, 200, "red", "90px 0 0 0", codes[0]));
    add(this.curve(150, 232, "red", "100% 100%"));
    add(this.block("lf-label lf-code", 0, 404, 150, 156, "orange", "", codes[1]));
    add(this.block("lf-label lf-code", 0, 568, 150, 152, "lilac", "", codes[2]));
    add(this.block("lf-label lf-code", 0, 728, 150, 152, "periwinkle", "", codes[3]));
    add(this.block("", 0, 888, 150, 180, "tan", "0 0 0 90px"));
    add(this.curve(150, 960, "tan", "100% 0"));

    /* ---- body top bar (y 196) ---- */
    add(this.block("", 150, 196, 380, 36, "red"));
    add(this.block("", 538, 196, 60, 36, "gold"));
    add(this.block("", 606, 196, 640, 36, "sky"));
    add(this.block("", 1254, 196, 100, 36, "orange"));
    add(this.block("", 1362, 196, 546, 36, "tan", "0 18px 18px 0"));

    /* ---- bottom bar (y 1020). The theme button pill fills x 418 to 798. ---- */
    add(this.block("", 150, 1020, 260, 48, "tan"));
    add(this.block("", 806, 1020, 100, 48, "gold"));
    if (!this.config.filterBar) {
      add(this.block("", 914, 1020, 540, 48, "periwinkle"));
      add(this.block("", 1462, 1020, 446, 48, "lilac", "0 24px 24px 0"));
    }

    this.els = { home, name, tag, subtitle };
    this.refreshLabels();
    return f;
  }
});
