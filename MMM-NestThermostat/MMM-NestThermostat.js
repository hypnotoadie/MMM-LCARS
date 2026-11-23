/* MMM-NestThermostat
 * Shows the Nest thermostat and lets you change it by touch, through Google's official
 * Smart Device Management (SDM) API. The node_helper does all the talking to Google; the
 * credentials stay on the Pi in a file outside git (see node_helper.js for its format).
 *
 * Screen: current temperature and humidity, what the system is doing (heating / cooling / idle),
 * the target with − and + (two targets in Heat·Cool), mode pills (Heat, Cool, Heat·Cool, Off)
 * and an Eco pill. Taps change the number at once; the command is sent when you stop tapping
 * (sendDelay), so five taps on + send one command.
 * Look: custom.css "HOUSE PAGE" and its LCARS block. No CSS file here.
 *
 * Install on the Pi: ~/MagicMirror/modules/MMM-NestThermostat/. No npm install (uses Node's fetch).
 */
Module.register("MMM-NestThermostat", {
  defaults: {
    secretsFile: "config/nest.secrets.json",   // relative to ~/MagicMirror, or absolute, or "~/..."
    updateInterval: 2 * 60 * 1000,             // read every 2 minutes (not faster than 1 minute)
    unit: "auto",                              // "auto" = the thermostat's own setting, or "F" / "C"
    sendDelay: 1500,                           // ms after the last tap before the command goes out
    minGapF: 3,                                // Heat·Cool: cool must stay this far above heat (°F)
    title: "Climate",
    labels: { HEAT: "Heat", COOL: "Cool", HEATCOOL: "Heat·Cool", OFF: "Off", ECO: "Eco" }
  },

  start() {
    this.state = null;
    this.error = null;
    this.errorTimer = null;
    this.pending = null;        // { heatC, coolC } shown while a setpoint change waits to be sent
    this.sendTimer = null;
    this.sendSocketNotification("NEST_INIT", {
      secretsFile: this.config.secretsFile,
      updateInterval: this.config.updateInterval
    });
  },

  // MagicMirror calls this when MMM-pages shows the page: read now, so the numbers are fresh.
  resume() {
    this.sendSocketNotification("NEST_REFRESH");
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "NEST_STATE") {
      this.state = payload;
      // A read that arrives while taps are waiting must not overwrite the tapped number.
      if (!this.sendTimer) this.pending = null;
      if (this.error && this.error.during === "read") this.error = null;
      this.updateDom(0);
    } else if (notification === "NEST_ERROR") {
      this.showError(payload);
    }
  },

  showError(err) {
    this.error = err;
    clearTimeout(this.errorTimer);
    // Command errors fade after 8 s; read errors stay until a read works.
    if (err.during === "command") {
      this.errorTimer = setTimeout(() => { this.error = null; this.updateDom(0); }, 8000);
    }
    this.updateDom(0);
  },

  /* ---- units ---- */
  useF() {
    if (this.config.unit === "F") return true;
    if (this.config.unit === "C") return false;
    return !this.state || this.state.scale !== "CELSIUS";
  },
  // Not called "show": MagicMirror's Module.show() is what makes a module visible.
  // Celsius from the API -> the number on screen (whole °F, or °C to 0.5)
  fmt(c) {
    if (typeof c !== "number") return "--";
    return this.useF() ? String(Math.round(c * 9 / 5 + 32)) : String(Math.round(c * 2) / 2);
  },
  step() { return this.useF() ? 5 / 9 : 0.5; },     // one tap, in Celsius
  // Snap to what the thermostat itself can show, so taps land on whole °F
  snap(c) {
    if (this.useF()) return Math.round(((Math.round(c * 9 / 5 + 32)) - 32) * 5 / 9 * 100) / 100;
    return Math.round(c * 2) / 2;
  },

  /* ---- taps ---- */
  // which: "heat" or "cool"; dir: +1 / -1
  nudge(which, dir) {
    const s = this.state;
    if (!s || !s.online || s.eco === "MANUAL_ECO") return;
    const cur = this.pending || { heatC: s.heatC, coolC: s.coolC };
    const next = { heatC: cur.heatC, coolC: cur.coolC };
    const key = which === "cool" ? "coolC" : "heatC";
    if (typeof next[key] !== "number") return;
    next[key] = this.snap(Math.min(32, Math.max(9, next[key] + dir * this.step())));
    if (s.mode === "HEATCOOL") {
      const gap = this.config.minGapF * 5 / 9;
      if (next.coolC - next.heatC < gap - 0.01) return;   // keep the range open; ignore the tap
    }
    this.pending = next;
    this.updateDom(0);
    clearTimeout(this.sendTimer);
    this.sendTimer = setTimeout(() => this.sendSetpoint(), this.config.sendDelay);
  },

  sendSetpoint() {
    this.sendTimer = null;
    const s = this.state;
    const p = this.pending;
    if (!s || !p) return;
    const base = "sdm.devices.commands.ThermostatTemperatureSetpoint.";
    if (s.mode === "HEAT") this.cmd(base + "SetHeat", { heatCelsius: p.heatC });
    else if (s.mode === "COOL") this.cmd(base + "SetCool", { coolCelsius: p.coolC });
    else if (s.mode === "HEATCOOL") this.cmd(base + "SetRange", { heatCelsius: p.heatC, coolCelsius: p.coolC });
  },

  setMode(mode) {
    const s = this.state;
    if (!s || !s.online) return;
    clearTimeout(this.sendTimer);
    this.sendTimer = null;
    this.pending = null;
    if (mode === "ECO") {
      const on = s.eco !== "MANUAL_ECO";
      this.cmd("sdm.devices.commands.ThermostatEco.SetMode", { mode: on ? "MANUAL_ECO" : "OFF" });
      this.state = Object.assign({}, s, { eco: on ? "MANUAL_ECO" : "OFF" });
    } else {
      // Leaving Eco first: the thermostat refuses mode and setpoint changes while Eco is on.
      if (s.eco === "MANUAL_ECO") this.cmd("sdm.devices.commands.ThermostatEco.SetMode", { mode: "OFF" });
      if (mode !== s.mode) this.cmd("sdm.devices.commands.ThermostatMode.SetMode", { mode });
      this.state = Object.assign({}, s, { mode, eco: "OFF" });
    }
    this.updateDom(0);   // show the choice at once; the next read confirms it
  },

  cmd(command, params) {
    this.sendSocketNotification("NEST_COMMAND", { command, params });
  },

  /* ---- drawing ---- */
  statusText(s) {
    if (!s.online) return "Offline";
    if (s.eco === "MANUAL_ECO") return "Eco";
    if (s.mode === "OFF") return "System off";
    if (s.hvac === "HEATING") return "Heating";
    if (s.hvac === "COOLING") return "Cooling";
    return "Idle";
  },

  button(cls, text, onTap, disabled) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    if (disabled) {
      b.disabled = true;
    } else {
      b.addEventListener("click", (e) => { e.stopPropagation(); onTap(); });
    }
    return b;
  },

  targetRow(which, label, valueC, disabled) {
    const row = document.createElement("div");
    row.className = `nt-target nt-${which}`;
    row.appendChild(this.button("nt-step nt-minus", "−", () => this.nudge(which, -1), disabled));
    const mid = document.createElement("div");
    mid.className = "nt-target-mid";
    mid.innerHTML = '<span class="nt-target-label"></span><span class="nt-target-value"></span>';
    mid.querySelector(".nt-target-label").textContent = label;
    mid.querySelector(".nt-target-value").textContent = `${this.fmt(valueC)}°`;
    row.appendChild(mid);
    row.appendChild(this.button("nt-step nt-plus", "+", () => this.nudge(which, +1), disabled));
    return row;
  },

  getDom() {
    const wrap = document.createElement("div");
    wrap.className = "nest-thermostat";
    const s = this.state;

    const head = document.createElement("div");
    head.className = "nt-head";
    head.innerHTML = '<span class="nt-title"></span><span class="nt-status"></span>';
    head.querySelector(".nt-title").textContent = this.config.title;
    wrap.appendChild(head);

    if (!s) {
      const msg = document.createElement("div");
      msg.className = "nt-message";
      msg.textContent = this.error ? this.error.message : "Connecting to the thermostat…";
      wrap.appendChild(msg);
      return wrap;
    }

    const status = this.statusText(s);
    wrap.classList.add(`is-${status.toLowerCase().replace(/\s+/g, "-")}`);
    wrap.dataset.mode = s.mode;
    head.querySelector(".nt-status").textContent = status;

    // current temperature
    const now = document.createElement("div");
    now.className = "nt-now";
    now.innerHTML = '<span class="nt-ambient"></span><span class="nt-now-sub"></span>';
    now.querySelector(".nt-ambient").textContent = `${this.fmt(s.ambientC)}°`;
    const sub = ["Inside"];
    if (typeof s.humidity === "number") sub.push(`${Math.round(s.humidity)}% humidity`);
    now.querySelector(".nt-now-sub").textContent = sub.join(" · ");
    wrap.appendChild(now);

    // target(s)
    const targets = document.createElement("div");
    targets.className = "nt-targets";
    const v = this.pending || s;
    const locked = !s.online || s.eco === "MANUAL_ECO";
    if (s.eco === "MANUAL_ECO") {
      targets.appendChild(this.targetRow("heat", "Eco low", s.ecoHeatC, true));
      if (typeof s.ecoCoolC === "number") targets.appendChild(this.targetRow("cool", "Eco high", s.ecoCoolC, true));
    } else if (s.mode === "HEAT") {
      targets.appendChild(this.targetRow("heat", "Heat to", v.heatC, locked));
    } else if (s.mode === "COOL") {
      targets.appendChild(this.targetRow("cool", "Cool to", v.coolC, locked));
    } else if (s.mode === "HEATCOOL") {
      targets.appendChild(this.targetRow("heat", "Heat to", v.heatC, locked));
      targets.appendChild(this.targetRow("cool", "Cool to", v.coolC, locked));
    } else {
      const off = document.createElement("div");
      off.className = "nt-off";
      off.textContent = "Heating and cooling are off";
      targets.appendChild(off);
    }
    if (this.pending) targets.classList.add("is-pending");
    wrap.appendChild(targets);

    // mode pills
    const modes = document.createElement("div");
    modes.className = "nt-modes";
    const order = ["HEAT", "COOL", "HEATCOOL", "OFF"].filter((m) => s.modes.includes(m));
    order.forEach((m) => {
      const active = s.eco !== "MANUAL_ECO" && s.mode === m;
      modes.appendChild(this.button(`nt-mode nt-mode-${m.toLowerCase()}${active ? " is-active" : ""}`,
        this.config.labels[m] || m, () => this.setMode(m), !s.online));
    });
    if (s.ecoModes.includes("MANUAL_ECO")) {
      modes.appendChild(this.button(`nt-mode nt-mode-eco${s.eco === "MANUAL_ECO" ? " is-active" : ""}`,
        this.config.labels.ECO, () => this.setMode("ECO"), !s.online));
    }
    wrap.appendChild(modes);

    // footer: error or last update
    const foot = document.createElement("div");
    foot.className = `nt-foot${this.error ? " is-error" : ""}`;
    if (this.error) {
      foot.textContent = this.error.message;
    } else {
      const t = new Date(s.updated);
      foot.textContent = `${s.name} · updated ${t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    wrap.appendChild(foot);
    return wrap;
  }
});
