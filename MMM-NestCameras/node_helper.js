/* node_helper for MMM-NestCameras
 * Runs on the Pi (Node). Talks to Google's Smart Device Management (SDM) API for live camera
 * streams. The browser does the WebRTC part (it makes the offer and plays the video); this helper
 * only passes the offer to Google and the answer back, and extends / stops the sessions.
 *
 * Credentials: the SAME file as MMM-NestThermostat (default ~/MagicMirror/config/nest.secrets.json):
 *   { clientId, clientSecret, refreshToken, projectId, ... }   (format in MMM-NestThermostat/node_helper.js)
 *   plus, for doorbell events, "subscription": "projects/<cloud project>/subscriptions/<id>".
 * Nothing secret is sent to the browser.
 *
 * Doorbell events (optional; on when the secrets file has "subscription"): Google publishes device
 * events to a Pub/Sub topic in the Cloud project; this helper long-polls a pull subscription on it,
 * acknowledges every message, and passes doorbell presses (and person / motion, which the front end
 * may ignore) to every browser. The refresh token must include the Pub/Sub scope
 * (https://www.googleapis.com/auth/pubsub) as well as sdm.service. Events older than
 * MAX_EVENT_AGE (e.g. queued while the Pi was off) and repeats of the same event session are dropped.
 *
 * Every browser showing the mirror (the Pi's screen, a PC browser) receives every socket
 * notification, so each browser sends its own random clientId and ignores replies for others.
 *
 * Socket notifications:
 *   in   NEST_CAMS_INIT    { clientId, secretsFile }           -> NEST_CAMS_LIST { clientId, cameras: [{ device, label, type }] }
 *   in   NEST_CAMS_OFFER   { clientId, key, device, sdp }      -> NEST_CAMS_ANSWER { clientId, key, answerSdp, mediaSessionId, expiresAt }
 *   in   NEST_CAMS_EXTEND  { clientId, key, device, mediaSessionId } -> NEST_CAMS_EXTENDED { clientId, key, mediaSessionId, expiresAt }
 *   in   NEST_CAMS_STOP    { device, mediaSessionId }          (no reply)
 *   out  NEST_CAMS_ERROR   { clientId, key, message, during, dead }  (dead = the session is gone: reconnect)
 *   out  NEST_CAMS_EVENT   { clientId: "*", device, kind: "chime"|"person"|"motion", at }   (to every browser)
 *
 * SDM commands used (sdm.devices.commands.CameraLiveStream.*):
 *   GenerateWebRtcStream { offerSdp }       -> { answerSdp, mediaSessionId, expiresAt }   (session lasts 5 minutes)
 *   ExtendWebRtcStream   { mediaSessionId } -> { mediaSessionId, expiresAt }
 *   StopWebRtcStream     { mediaSessionId }
 */
const NodeHelper = require("node_helper");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SDM = "https://smartdevicemanagement.googleapis.com/v1/";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const LIVE = "sdm.devices.commands.CameraLiveStream.";
const PUBSUB = "https://pubsub.googleapis.com/v1/";
const EVENT_KINDS = {
  "sdm.devices.events.DoorbellChime.Chime": "chime",
  "sdm.devices.events.CameraPerson.Person": "person",
  "sdm.devices.events.CameraMotion.Motion": "motion"
};
const MAX_EVENT_AGE = 60 * 1000;     // ignore events older than this

module.exports = NodeHelper.create({
  start() {
    this.secrets = null;
    this.secretsFile = null;
    this.token = null;          // { value, expires (ms) }
    this.cameras = null;        // cached device list
    this.eventsOn = false;      // the Pub/Sub pull loop is running
    this.seenSessions = new Map();   // eventSessionId|kind -> time, to drop repeats
  },

  // Names here must not clash with NodeHelper's own (init, start, stop, setExpressApp, setSocketIO ...).
  socketNotificationReceived(notification, payload) {
    const p = payload || {};
    if (notification === "NEST_CAMS_INIT") this.listCameras(p);
    else if (notification === "NEST_CAMS_OFFER") this.offer(p);
    else if (notification === "NEST_CAMS_EXTEND") this.extend(p);
    else if (notification === "NEST_CAMS_STOP") this.stopSession(p);
  },

  resolvePath(p) {
    if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
    if (path.isAbsolute(p)) return p;
    const root = global.root_path || path.join(os.homedir(), "MagicMirror");
    return path.join(root, p);
  },

  loadSecrets() {
    if (this.secrets) return this.secrets;
    let s;
    try {
      s = JSON.parse(fs.readFileSync(this.secretsFile, "utf8"));
    } catch (e) {
      throw new Error(`Can't read the credentials file ${this.secretsFile}`);
    }
    const missing = ["clientId", "clientSecret", "refreshToken", "projectId"].filter((k) => !s[k]);
    if (missing.length) throw new Error(`Credentials file is missing: ${missing.join(", ")}`);
    this.secrets = s;
    return s;
  },

  async accessToken() {
    if (this.token && Date.now() < this.token.expires - 60 * 1000) return this.token.value;
    const s = this.loadSecrets();
    const body = new URLSearchParams({
      client_id: s.clientId, client_secret: s.clientSecret,
      refresh_token: s.refreshToken, grant_type: "refresh_token"
    });
    const res = await fetch(TOKEN_URL, { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
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
    if (res.status === 401) this.token = null;
    if (!res.ok) {
      const err = new Error((data.error && data.error.message) || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = data.error && data.error.status;
      throw err;
    }
    return data;
  },

  command(device, command, params) {
    return this.api("POST", `${SDM}${device}:executeCommand`, { command, params });
  },

  /* ---- device list ---- */
  async listCameras(p) {
    try {
      if (typeof fetch !== "function") throw new Error("This Node.js has no fetch(). MagicMirror needs Node 18 or newer.");
      if (!this.secretsFile) this.secretsFile = this.resolvePath(p.secretsFile || "config/nest.secrets.json");
      if (!this.cameras) {
        const s = this.loadSecrets();
        const data = await this.api("GET", `${SDM}enterprises/${s.projectId}/devices`);
        this.cameras = (data.devices || [])
          .filter((d) => {
            const live = (d.traits || {})["sdm.devices.traits.CameraLiveStream"];
            return live && (live.supportedProtocols || []).includes("WEB_RTC");
          })
          .map((d) => {
            const info = (d.traits || {})["sdm.devices.traits.Info"] || {};
            const room = ((d.parentRelations || [])[0] || {}).displayName;
            return {
              device: d.name,
              label: room || info.customName || "Camera",      // "Front Door", "Front Yard", "Backyard"
              type: d.type.split(".").pop()                    // DOORBELL | CAMERA | DISPLAY
            };
          });
      }
      this.sendSocketNotification("NEST_CAMS_LIST", { clientId: p.clientId, cameras: this.cameras });
      this.startEvents();
    } catch (e) {
      this.fail(p, e, "list");
    }
  },

  /* ---- streams ---- */
  async offer(p) {
    try {
      const sdp = p.sdp.endsWith("\n") ? p.sdp : `${p.sdp}\n`;
      const data = await this.command(p.device, `${LIVE}GenerateWebRtcStream`, { offerSdp: sdp });
      const r = data.results || {};
      if (!r.answerSdp) throw new Error("Google sent no answer for the stream");
      this.sendSocketNotification("NEST_CAMS_ANSWER", {
        clientId: p.clientId, key: p.key,
        answerSdp: r.answerSdp, mediaSessionId: r.mediaSessionId, expiresAt: r.expiresAt
      });
    } catch (e) {
      this.fail(p, e, "start");
    }
  },

  async extend(p) {
    try {
      const data = await this.command(p.device, `${LIVE}ExtendWebRtcStream`, { mediaSessionId: p.mediaSessionId });
      const r = data.results || {};
      this.sendSocketNotification("NEST_CAMS_EXTENDED", {
        clientId: p.clientId, key: p.key,
        mediaSessionId: r.mediaSessionId || p.mediaSessionId, expiresAt: r.expiresAt
      });
    } catch (e) {
      // 400 / FAILED_PRECONDITION / NOT_FOUND = the session has already ended: the browser reconnects.
      e.dead = e.status === 400 || e.status === 404 || e.code === "FAILED_PRECONDITION" || e.code === "NOT_FOUND";
      this.fail(p, e, "extend");
    }
  },

  async stopSession(p) {
    if (!p.device || !p.mediaSessionId) return;
    try {
      await this.command(p.device, `${LIVE}StopWebRtcStream`, { mediaSessionId: p.mediaSessionId });
    } catch (e) {
      // Already ended or expired: nothing to do.
    }
  },

  /* ---- doorbell events (Pub/Sub pull) ---- */
  startEvents() {
    if (this.eventsOn) return;
    const sub = this.secrets && this.secrets.subscription;
    if (!sub) {
      console.log("[MMM-NestCameras] no \"subscription\" in the credentials file: doorbell events are off");
      return;
    }
    if (!/^projects\/[^/]+\/subscriptions\/[^/]+$/.test(sub)) {
      console.error(`[MMM-NestCameras] events: "subscription" should look like projects/<cloud project>/subscriptions/<id>, not ${sub}`);
      return;
    }
    this.eventsOn = true;
    console.log(`[MMM-NestCameras] listening for doorbell events on ${sub}`);
    this.pullLoop(sub);
  },

  async pullLoop(sub) {
    let wait = 0;
    for (;;) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        // Long poll: Google holds the request open until messages arrive or it times out.
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 120 * 1000);
        const token = await this.accessToken();
        const res = await fetch(`${PUBSUB}${sub}:pull`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ maxMessages: 20 }),
          signal: ctl.signal
        }).finally(() => clearTimeout(timer));
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) this.token = null;
        if (!res.ok) {
          const msg = (data.error && data.error.message) || `HTTP ${res.status}`;
          // 403 "insufficient authentication scopes" = the refresh token was made without the Pub/Sub scope
          throw new Error(res.status === 403 ? `${msg} (does the refresh token include the Pub/Sub scope?)` : msg);
        }
        const msgs = data.receivedMessages || [];
        if (msgs.length) {
          msgs.forEach((m) => this.handleEvent(m.message || {}));
          await fetch(`${PUBSUB}${sub}:acknowledge`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ackIds: msgs.map((m) => m.ackId) })
          });
        }
        wait = 0;
      } catch (e) {
        if (e.name === "AbortError") { wait = 0; continue; }     // long poll timed out: ask again
        console.error(`[MMM-NestCameras] events: ${e.message}`);
        wait = Math.min(5 * 60 * 1000, Math.max(10 * 1000, wait * 2));   // back off: 10 s, 20 s ... 5 min
      }
    }
  },

  handleEvent(message) {
    let ev;
    try {
      ev = JSON.parse(Buffer.from(message.data || "", "base64").toString("utf8"));
    } catch (e) {
      return;
    }
    const upd = ev.resourceUpdate || {};
    const events = upd.events || {};
    const at = Date.parse(ev.timestamp || message.publishTime) || Date.now();
    if (Date.now() - at > MAX_EVENT_AGE) return;
    const now = Date.now();
    for (const [k, t] of this.seenSessions) if (now - t > 10 * 60 * 1000) this.seenSessions.delete(k);
    Object.keys(events).forEach((type) => {
      const kind = EVENT_KINDS[type];
      if (!kind) return;
      const sessionKey = `${events[type].eventSessionId || ev.eventId}|${kind}`;
      if (this.seenSessions.has(sessionKey)) return;            // later updates of the same press
      this.seenSessions.set(sessionKey, now);
      console.log(`[MMM-NestCameras] event: ${kind} on ${upd.name}`);
      this.sendSocketNotification("NEST_CAMS_EVENT", { clientId: "*", device: upd.name, kind, at });
    });
  },

  fail(p, e, during) {
    console.error(`[MMM-NestCameras] ${during}${p.key ? ` (${p.key})` : ""}: ${e.message}`);
    this.sendSocketNotification("NEST_CAMS_ERROR", {
      clientId: p.clientId, key: p.key, message: e.message, during, dead: !!e.dead
    });
  }
});
