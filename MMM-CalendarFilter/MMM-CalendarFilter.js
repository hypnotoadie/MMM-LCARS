/* MMM-CalendarFilter
 * Tappable calendar legend. Tap a pill to hide/show that calendar on every
 * CalendarExt3 view (Month, Agenda, Journal/Week). The pill dims while hidden.
 *
 * How it works: it sends each view's own "change config" notification with a new
 * calendarSet (the list of calendars to draw), and the views redraw at once:
 *   MMM-CalendarExt3         CX3_SET_CONFIG
 *   MMM-CalendarExt3Agenda   CX3A_SET_CONFIG
 *   MMM-CalendarExt3Journal  CX3J_CONFIG
 * No instanceId is sent, so every instance of each module takes the change.
 *
 * Install on the Pi: ~/MagicMirror/modules/MMM-CalendarFilter/MMM-CalendarFilter.js
 * (no node_helper, no npm install).
 */
Module.register("MMM-CalendarFilter", {
  defaults: {
    // Order = pill order. `name` must match the calendar module's `name`;
    // `cls` is the CSS class for the pill colour/shape (.chip.family etc. in custom.css).
    calendars: [
      { name: "Family", cls: "family" },
      { name: "Parent1", cls: "parent1" }
    ],
    defaultHidden: [],          // calendar names hidden at startup and after a reset
    resetAfter: 30 * 60 * 1000, // ms after the last tap before everything goes back to defaultHidden; 0 = never
    remember: true,             // keep the hidden list across a browser reload (localStorage)
    storageKey: "MMM-CalendarFilter.hidden",
    debug: false                // true = log what events arrive and what filter is sent (browser console)
  },

  start() {
    this.hiddenSet = new Set(this.loadHidden());
    this.resetTimer = null;
  },

  /* ---- state ---- */
  loadHidden() {
    if (this.config.remember) {
      try {
        const saved = JSON.parse(window.localStorage.getItem(this.config.storageKey));
        if (Array.isArray(saved)) return saved;
      } catch (e) { /* storage unavailable or bad JSON: use defaults */ }
    }
    return [...this.config.defaultHidden];
  },

  saveHidden() {
    if (!this.config.remember) return;
    try {
      window.localStorage.setItem(this.config.storageKey, JSON.stringify([...this.hiddenSet]));
    } catch (e) { /* ignore */ }
  },

  // Calendars to draw. An empty calendarSet means "all" to the CX3 modules,
  // so when everything is hidden send a name that matches nothing.
  visibleSet() {
    const visible = this.config.calendars.map((c) => c.name).filter((n) => !this.hiddenSet.has(n));
    return visible.length ? visible : ["__none__"];
  },

  /* ---- tell the calendar views ---- */
  applyFilter() {
    const hideNothing = this.hiddenSet.size === 0;
    // [] = all calendars, which also shows any calendar not listed in `calendars`.
    const calendarSet = hideNothing ? [] : this.visibleSet();
    if (this.config.debug) console.log("[CalendarFilter] sending calendarSet", JSON.stringify(calendarSet));
    this.sendNotification("CX3_SET_CONFIG", { calendarSet });
    this.sendNotification("CX3A_SET_CONFIG", { calendarSet });
    this.sendNotification("CX3J_CONFIG", { calendarSet });
  },

  toggle(name) {
    if (this.hiddenSet.has(name)) this.hiddenSet.delete(name);
    else this.hiddenSet.add(name);
    this.saveHidden();
    this.refreshPills();
    this.applyFilter();
    this.armReset();
  },

  armReset() {
    clearTimeout(this.resetTimer);
    if (!this.config.resetAfter) return;
    this.resetTimer = setTimeout(() => {
      this.hiddenSet = new Set(this.config.defaultHidden);
      this.saveHidden();
      this.refreshPills();
      this.applyFilter();
    }, this.config.resetAfter);
  },

  notificationReceived(notification, payload) {
    if (this.config.debug && notification === "CALENDAR_EVENTS" && Array.isArray(payload)) {
      // Every module sees broadcast notifications, so this is what the calendar views receive.
      const counts = {};
      payload.forEach((ev) => {
        const k = ev.calendarName || "(no calendarName)";
        counts[k] = (counts[k] || 0) + 1;
      });
      console.log("[CalendarFilter] CALENDAR_EVENTS:", payload.length, "events", JSON.stringify(counts));
    }
    // Send the saved filter once every module is on the page. The CX3 modules keep it in
    // their active config, so later CALENDAR_EVENTS refreshes stay filtered.
    if (notification === "DOM_OBJECTS_CREATED") {
      this.applyFilter();
      // Second send in case a view finished starting after the first one.
      setTimeout(() => this.applyFilter(), 5000);
      if (this.hiddenSet.size && JSON.stringify([...this.hiddenSet].sort()) !== JSON.stringify([...this.config.defaultHidden].sort())) {
        this.armReset();
      }
    }
  },

  /* ---- drawing ---- */
  refreshPills() {
    if (!this.wrapper) return;
    this.wrapper.querySelectorAll(".chip").forEach((chip) => {
      const off = this.hiddenSet.has(chip.dataset.calendar);
      chip.classList.toggle("is-hidden", off);
      chip.setAttribute("aria-pressed", String(!off));
    });
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "cal-filter";
    for (const cal of this.config.calendars) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `chip ${cal.cls || ""}`;
      chip.dataset.calendar = cal.name;
      chip.innerHTML = `<i></i>${cal.label || cal.name}`;
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggle(cal.name);
      });
      wrapper.appendChild(chip);
    }
    this.wrapper = wrapper;
    this.refreshPills();
    return wrapper;
  }
});
