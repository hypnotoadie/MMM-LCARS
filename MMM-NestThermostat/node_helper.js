/* node_helper for MMM-NestThermostat
 * Runs on the Pi (Node), never in the browser. It is the only part that sees the credentials.
 *
 * Reads the credentials from a JSON file that is NOT in git (default
 * ~/MagicMirror/config/nest.secrets.json, chmod 600):
 *   { "clientId": "...", "clientSecret": "...", "refreshToken": "...",
 *     "projectId": "<Device Access project id, the UUID>",
 *     "thermostat": "enterprises/<project>/devices/<id>"   (optional: else the first thermostat) }
 *
 * Google Smart Device Management (SDM) API:
 *   token   POST https://oauth2.googleapis.com/token   (refresh token -> 1 hour access token)
 *   read    GET  https://smartdevicemanagement.googleapis.com/v1/<device name>
 *   command POST https://smartdevicemanagement.googleapis.com/v1/<device name>:executeCommand
 *
 * One poller for every browser that shows the mirror (the Pi's screen and a PC browser share it).
 * Socket notifications:
 *   in   NEST_INIT     { secretsFile, updateInterval }   (each browser sends it at start)
 *   in   NEST_REFRESH                                     (read now)
 *   in   NEST_COMMAND  { command, params }                (e.g. "sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat")
 *   out  NEST_STATE    { ...plain values, see parseDevice }
 *   out  NEST_ERROR    { message, during }                (never contains a token or secret)
 */
const NodeHelper = require("node_helper");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SDM = "https://smartdevicemanagement.googleapis.com/v1/";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const T = "sdm.devices.traits.";

module.exports = NodeHelper.create({
  start() {
    this.secrets = null;
    this.secretsFile = null;
    this.deviceName = null;
    this.token = null;            // { value, expires (ms) }
    this.timer = null;
    this.interval = 2 * 60 * 1000;
    this.lastState = null;
    this.busy = false;
  },

  stop() {
    if (this.timer) clearInterval(this.timer);
  },

  /* ---- messages from the browser ---- */
  socketNotificationReceived(notification, payload) {
    if (notification === "NEST_INIT") {
      this.setup(payload || {});
    } else if (notification === "NEST_REFRESH") {
      this.poll();
    } else if (notification === "NEST_COMMAND") {
      this.command(payload);
    }
  },

  // Not called "init": MagicMirror's NodeHelper calls its own init() at startup, with no arguments.
  setup(cfg) {
    // A second browser joining: just send it what we already have.
    if (this.timer) {
      if (this.lastState) this.sendSocketNotification("NEST_STATE", this.lastState);
      return;
    }
    if (typeof fetch !== "function") {
      this.fail("This Node.js has no fetch(). MagicMirror needs Node 18 or newer.", "start");
      return;
    }
    this.secretsFile = this.resolvePath(cfg.secretsFile || "config/nest.secrets.json");
    this.interval = Math.max(60 * 1000, Number(cfg.updateInterval) || this.interval);   // SDM rate limits: not faster than 1/min
    this.poll();
    this.timer = setInterval(() => this.poll(), this.interval);
  },

  // "~/x" -> home folder; a relative path -> relative to the MagicMirror folder.
  resolvePath(p) {
    if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
    if (path.isAbsolute(p)) return p;
    const root = global.root_path || path.join(os.homedir(), "MagicMirror");
    return path.join(root, p);
  },

  loadSecrets() {
    if (this.secrets) return this.secrets;
    let raw;
    try {
      raw = fs.readFileSync(this.secretsFile, "utf8");
    } catch (e) {
      throw new Error(`Can't read the credentials file ${this.secretsFile}`);
    }
    let s;
    try {
      s = JSON.parse(raw);
    } catch (e) {
      throw new Error(`The credentials file is not valid JSON: ${this.secretsFile}`);
    }
    const missing = ["clientId", "clientSecret", "refreshToken", "projectId"].filter((k) => !s[k]);
    if (missing.length) throw new Error(`Credentials file is missing: ${missing.join(", ")}`);
    this.secrets = s;
    if (s.thermostat) this.deviceName = s.thermostat;
    return s;
  },

  /* ---- Google ---- */
  async accessToken() {
    if (this.token && Date.now() < this.token.expires - 60 * 1000) return this.token.value;
    const s = this.loadSecrets();
    const body = new URLSearchParams({
      client_id: s.clientId,
      client_secret: s.clientSecret,
      refresh_token: s.refreshToken,
      grant_type: "refresh_token"
    });
    const res = await fetch(TOKEN_URL, { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      // invalid_grant = the refresh token was revoked or expired (e.g. consent screen left in Testing)
      throw new Error(`Google sign-in failed (${data.error || res.status}). The refresh token may need renewing.`);
    }
    this.token = { value: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
    return this.token.value;
  },

  async api(method, url, body) {
    const token = await this.accessToken();
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) this.token = null;   // next call gets a fresh token
    if (!res.ok) {
      const msg = (data.error && data.error.message) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  },

  async findThermostat() {
    if (this.deviceName) return this.deviceName;
    const s = this.loadSecrets();
    const data = await this.api("GET", `${SDM}enterprises/${s.projectId}/devices`);
    const t = (data.devices || []).find((d) => d.type === "sdm.devices.types.THERMOSTAT");
    if (!t) throw new Error("No thermostat on this Google account (check the permissions you ticked).");
    this.deviceName = t.name;
    return t.name;
  },

  /* ---- read ---- */
  async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      const name = await this.findThermostat();
      const device = await this.api("GET", SDM + name);
      this.lastState = this.parseDevice(device);
      this.sendSocketNotification("NEST_STATE", this.lastState);
    } catch (e) {
      this.fail(e.message, "read");
    } finally {
      this.busy = false;
    }
  },

  // Reduce the SDM device to the plain values the screen needs. All temperatures in Celsius.
  parseDevice(d) {
    const tr = d.traits || {};
    const get = (k) => tr[T + k] || {};
    const info = get("Info");
    const sp = get("ThermostatTemperatureSetpoint");
    const eco = get("ThermostatEco");
    const mode = get("ThermostatMode");
    const parent = (d.parentRelations && d.parentRelations[0]) || {};
    return {
      name: info.customName || parent.displayName || "Thermostat",
      online: get("Connectivity").status !== "OFFLINE",
      scale: get("Settings").temperatureScale || "FAHRENHEIT",
      ambientC: get("Temperature").ambientTemperatureCelsius,
      humidity: get("Humidity").ambientHumidityPercent,
      hvac: get("ThermostatHvac").status || "OFF",                  // OFF | HEATING | COOLING
      mode: mode.mode || "OFF",                                       // HEAT | COOL | HEATCOOL | OFF
      modes: mode.availableModes || ["HEAT", "COOL", "HEATCOOL", "OFF"],
      eco: eco.mode || "OFF",                                         // MANUAL_ECO | OFF
      ecoModes: eco.availableModes || [],
      ecoHeatC: eco.heatCelsius,
      ecoCoolC: eco.coolCelsius,
      heatC: sp.heatCelsius,
      coolC: sp.coolCelsius,
      updated: Date.now()
    };
  },

  /* ---- write ---- */
  async command(payload) {
    if (!payload || !payload.command) return;
    try {
      const name = await this.findThermostat();
      await this.api("POST", `${SDM}${name}:executeCommand`, {
        command: payload.command,
        params: payload.params || {}
      });
      // The device reports the change a moment later; read twice so the screen settles.
      setTimeout(() => this.poll(), 2000);
      setTimeout(() => this.poll(), 8000);
    } catch (e) {
      this.fail(e.message, "command");
      this.poll();   // put the screen back to the real values
    }
  },

  fail(message, during) {
    console.error(`[MMM-NestThermostat] ${during}: ${message}`);
    this.sendSocketNotification("NEST_ERROR", { message, during });
  }
});
