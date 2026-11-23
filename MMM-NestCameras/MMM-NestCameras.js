/* MMM-NestCameras
 * Live Nest camera and doorbell feeds on the House page, through Google's official SDM API
 * (WebRTC). One module shows every camera on the account: a large "featured" feed on the left
 * and the others stacked on the right. Tap a small feed to make it the large one.
 *
 * Streams run only while the page is on screen (MagicMirror's suspend / resume, driven by
 * MMM-pages), and pause by themselves after `streamMinutes` without a tap, so battery cameras
 * are not streaming all day. A tap anywhere on the panel resumes them.
 * Sound is never played (video is muted).
 *
 * Doorbell: when someone presses the doorbell (Pub/Sub events, see node_helper.js), every screen
 * jumps to the House page, the doorbell becomes the large feed and starts first, and a banner shows
 * who rang and when. If nobody touches the panel, the screen goes back to the page it was on after
 * `returnAfter` seconds. `jumpOn` can add "person" (doorbell sees a person) or "motion".
 *
 * Credentials: the same file as MMM-NestThermostat; only the node_helper reads it.
 * Look: custom.css "HOUSE PAGE: CAMERAS". No CSS file here.
 *
 * Built after reading brandaorafael/MMM-Nest-Camera-WebRTC (same SDM calls), rewritten for this
 * repo: shared credentials file, several cameras in one panel, sessions stopped when hidden.
 *
 * NOTE: never name a method or property after one of MagicMirror's own (show, hide, init, file,
 * translate, setConfig, setData, socket, updateDom, data, config, name, identifier, hidden ...).
 */
Module.register("MMM-NestCameras", {
  defaults: {
    secretsFile: "config/nest.secrets.json",
    order: [],                  // room names first in this order, e.g. ["Front Door", "Front Yard", "Backyard"]
    skip: [],                   // room names to leave out
    streamMinutes: 5,           // pause the feeds after this long without a tap (0 = never)
    extendBefore: 60,           // seconds before a session ends to extend it (sessions last 5 min)
    title: "Doors · cameras",
    stagger: 700,               // ms between starting each feed (gentler on the Pi and on Google)
    housePage: 5,               // the MMM-pages page this module is on (to jump to it)
    jumpOn: ["chime"],          // events that bring up the House page: "chime", "person", "motion"
    jumpDevices: ["DOORBELL"],  // which cameras' events count (types), or [] for all
    alertSeconds: 90,           // how long the banner stays
    returnAfter: 180            // seconds without a tap before going back to the previous page (0 = stay)
  },

  start() {
    this.clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.cams = null;           // [{ key, device, label, type }]
    this.tiles = {};            // key -> { cam, el, video, pc, stream, session, timers..., state, msg }
    this.featured = 0;
    this.wantLive = false;      // the page is on screen and the feeds should run
    this.paused = false;
    this.pauseTimer = null;
    this.listError = null;
    this.root = null;
    this.currentPage = null;    // from MMM-pages NEW_PAGE
    this.jumpedFrom = null;     // page to go back to after a doorbell jump
    this.alert = null;          // { label, kind, at }
    this.alertTimer = null;
    this.returnTimer = null;
    this.sendSocketNotification("NEST_CAMS_INIT", { clientId: this.clientId, secretsFile: this.config.secretsFile });
  },

  /* ---- MagicMirror lifecycle ---- */
  resume() { this.beginStreams(); },
  suspend() { this.endStreams(false); },

  notificationReceived(notification, payload) {
    if (notification === "NEW_PAGE" && typeof payload === "number") {
      this.currentPage = payload;
      if (payload !== this.config.housePage) this.cancelReturn();   // someone went elsewhere
    }
    // If the House page is the one on screen at startup, resume() may never come.
    if (notification === "DOM_OBJECTS_CREATED") {
      setTimeout(() => { if (!this.hidden) this.beginStreams(); }, 1500);
    }
  },

  socketNotificationReceived(notification, p) {
    if (!p) return;
    if (notification === "NEST_CAMS_EVENT") { this.onEvent(p); return; }   // sent to every browser
    if (p.clientId !== this.clientId) return;                // a reply for another browser
    if (notification === "NEST_CAMS_LIST") this.onList(p.cameras || []);
    else if (notification === "NEST_CAMS_ANSWER") this.onAnswer(p);
    else if (notification === "NEST_CAMS_EXTENDED") this.onExtended(p);
    else if (notification === "NEST_CAMS_ERROR") this.onError(p);
  },

  /* ---- camera list ---- */
  onList(list) {
    const order = this.config.order.map((s) => s.toLowerCase());
    const skipped = this.config.skip.map((s) => s.toLowerCase());
    const rank = (c) => {
      const i = order.indexOf(c.label.toLowerCase());
      if (i >= 0) return i;
      return order.length + (c.type === "DOORBELL" ? 0 : 1);   // doorbell first by default
    };
    this.cams = list
      .filter((c) => !skipped.includes(c.label.toLowerCase()))
      .map((c, i) => Object.assign({ key: `cam${i}` }, c))
      .sort((a, b) => rank(a) - rank(b));
    this.listError = null;
    this.buildTiles();
    if (this.wantLive) this.beginStreams();
  },

  /* ---- start / stop ---- */
  beginStreams() {
    this.wantLive = true;
    this.paused = false;
    this.armPauseTimer();
    if (!this.cams) { this.refresh(); return; }               // starts when the list arrives
    // The featured feed (the doorbell after a ring) starts first.
    const order = [this.cams[this.featured]].concat(this.cams.filter((c, i) => i !== this.featured)).filter(Boolean);
    order.forEach((cam, i) => {
      const t = this.tiles[cam.key];
      if (t && !t.pc && !t.startTimer) {
        t.startTimer = setTimeout(() => { t.startTimer = null; this.connect(t); }, i * this.config.stagger);
      }
    });
    this.refresh();
  },

  endStreams(paused) {
    this.wantLive = false;
    this.paused = !!paused;
    clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
    Object.values(this.tiles).forEach((t) => this.disconnect(t, true));
    this.refresh();
  },

  armPauseTimer() {
    clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
    const mins = Number(this.config.streamMinutes) || 0;
    if (mins > 0) this.pauseTimer = setTimeout(() => this.endStreams(true), mins * 60 * 1000);
  },

  /* ---- one feed ---- */
  connect(t) {
    if (!this.wantLive || t.pc) return;
    t.state = "connecting";
    t.msg = "";
    t.stream = new MediaStream();
    const pc = new RTCPeerConnection({ iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }] });
    t.pc = pc;
    // Google needs the offer's sections in this order: audio, video, then a data channel.
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.createDataChannel("dataSendChannel");
    pc.ontrack = (e) => {
      t.stream.addTrack(e.track);
      if (e.track.kind === "video") {
        t.video.srcObject = t.stream;
        t.video.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (t.pc !== pc) return;
      if (pc.connectionState === "failed") {     // "disconnected" is often brief; wait for "failed"
        this.retry(t, "Connection lost", 5000);
      }
    };
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        if (t.pc !== pc) return;
        this.sendSocketNotification("NEST_CAMS_OFFER", {
          clientId: this.clientId, key: t.cam.key, device: t.cam.device, sdp: pc.localDescription.sdp
        });
        t.answerTimer = setTimeout(() => this.retry(t, "No answer from Google", 20000), 20000);
      })
      .catch((e) => this.retry(t, `Browser error: ${e.message}`, 30000));
    this.refresh();
  },

  disconnect(t, stopSession) {
    ["startTimer", "answerTimer", "extendTimer", "retryTimer"].forEach((k) => { clearTimeout(t[k]); t[k] = null; });
    if (stopSession && t.session) {
      this.sendSocketNotification("NEST_CAMS_STOP", { device: t.cam.device, mediaSessionId: t.session });
    }
    t.session = null;
    if (t.pc) { try { t.pc.close(); } catch (e) { /* closed already */ } }
    t.pc = null;
    if (t.stream) t.stream.getTracks().forEach((tr) => tr.stop());
    t.stream = null;
    if (t.video) t.video.srcObject = null;
    t.state = "idle";
  },

  retry(t, msg, delay) {
    this.disconnect(t, true);
    t.state = "error";
    t.msg = msg;
    t.fails = (t.fails || 0) + 1;
    if (this.wantLive && t.fails <= 5) {
      t.retryTimer = setTimeout(() => { t.retryTimer = null; this.connect(t); }, delay);
    }
    this.refresh();
  },

  scheduleExtend(t, expiresAt) {
    clearTimeout(t.extendTimer);
    const ends = Date.parse(expiresAt) || (Date.now() + 5 * 60 * 1000);
    const wait = Math.max(10 * 1000, ends - Date.now() - this.config.extendBefore * 1000);
    t.extendTimer = setTimeout(() => {
      if (!t.session) return;
      this.sendSocketNotification("NEST_CAMS_EXTEND", {
        clientId: this.clientId, key: t.cam.key, device: t.cam.device, mediaSessionId: t.session
      });
    }, wait);
  },

  /* ---- replies ---- */
  onAnswer(p) {
    const t = this.tiles[p.key];
    if (!t) return;
    if (!t.pc || t.pc.signalingState !== "have-local-offer") {
      // We gave up on this one meanwhile: free the session on Google's side.
      this.sendSocketNotification("NEST_CAMS_STOP", { device: t.cam.device, mediaSessionId: p.mediaSessionId });
      return;
    }
    clearTimeout(t.answerTimer);
    t.session = p.mediaSessionId;
    t.pc.setRemoteDescription({ type: "answer", sdp: p.answerSdp })
      .then(() => { this.scheduleExtend(t, p.expiresAt); })
      .catch((e) => this.retry(t, `Stream refused: ${e.message}`, 30000));
  },

  onExtended(p) {
    const t = this.tiles[p.key];
    if (!t || !t.session) return;
    t.session = p.mediaSessionId || t.session;
    this.scheduleExtend(t, p.expiresAt);
  },

  onError(p) {
    if (!p.key) {                                             // the camera list failed
      this.listError = p.message;
      this.refresh();
      return;
    }
    const t = this.tiles[p.key];
    if (!t) return;
    if (p.during === "extend" && !p.dead) { this.scheduleExtend(t, null); return; }   // try again shortly
    this.retry(t, p.message, p.during === "start" ? 30000 : 3000);
  },

  /* ---- doorbell ---- */
  onEvent(p) {
    if (!this.config.jumpOn.includes(p.kind) || !this.cams) return;
    const i = this.cams.findIndex((c) => c.device === p.device);
    if (i < 0) return;
    const cam = this.cams[i];
    const types = this.config.jumpDevices || [];
    if (types.length && !types.includes(cam.type)) return;

    this.featured = i;
    this.alert = { label: cam.label, kind: p.kind, at: p.at || Date.now() };
    clearTimeout(this.alertTimer);
    this.alertTimer = setTimeout(() => { this.alert = null; this.refresh(); }, this.config.alertSeconds * 1000);

    const page = this.currentPage === null ? 0 : this.currentPage;   // no NEW_PAGE yet = the home screen
    if (page !== this.config.housePage) {
      if (this.jumpedFrom === null) this.jumpedFrom = page;
      this.sendNotification("LEAVE_HIDDEN_PAGE");             // in case the photos screensaver is up
      this.sendNotification("PAGE_SELECT", this.config.housePage);
    }
    this.armReturn();
    this.beginStreams();
    this.refresh();
  },

  armReturn() {
    clearTimeout(this.returnTimer);
    this.returnTimer = null;
    if (this.jumpedFrom === null || !(this.config.returnAfter > 0)) return;
    this.returnTimer = setTimeout(() => {
      const back = this.jumpedFrom;
      this.jumpedFrom = null;
      this.returnTimer = null;
      if (back !== null && this.currentPage === this.config.housePage) this.sendNotification("PAGE_SELECT", back);
    }, this.config.returnAfter * 1000);
  },

  // A tap means someone is using the screen: stay on the House page.
  cancelReturn() {
    clearTimeout(this.returnTimer);
    this.returnTimer = null;
    this.jumpedFrom = null;
  },

  /* ---- taps ---- */
  tap(i) {
    this.cancelReturn();
    if (this.paused || !this.wantLive) { this.beginStreams(); return; }
    this.armPauseTimer();
    if (i !== this.featured) { this.featured = i; this.refresh(); }
  },

  /* ---- drawing (built once; later changes only touch classes and text) ---- */
  buildTiles() {
    if (!this.root) this.root = this.makeRoot();
    const grid = this.root.querySelector(".nc-grid");
    grid.innerHTML = "";
    Object.values(this.tiles).forEach((t) => this.disconnect(t, true));
    this.tiles = {};
    this.cams.forEach((cam, i) => {
      const el = document.createElement("div");
      el.className = `nc-tile nc-${cam.type.toLowerCase()}`;
      el.innerHTML = '<video class="nc-video" muted autoplay playsinline disablepictureinpicture></video>' +
        '<div class="nc-label"><span class="nc-name"></span><span class="nc-state"></span></div>' +
        '<div class="nc-overlay"></div>';
      el.querySelector(".nc-name").textContent = cam.label;
      const video = el.querySelector("video");
      video.muted = true;
      const t = { cam, el, video, state: "idle", msg: "", fails: 0 };
      video.addEventListener("playing", () => { t.state = "live"; t.fails = 0; this.refresh(); });
      el.addEventListener("click", (e) => { e.stopPropagation(); this.tap(i); });
      this.tiles[cam.key] = t;
      grid.appendChild(el);
    });
    grid.dataset.count = String(this.cams.length);
    if (this.featured >= this.cams.length) this.featured = 0;
    this.refresh();
  },

  makeRoot() {
    const root = document.createElement("div");
    root.className = "nest-cams";
    root.innerHTML = '<div class="nc-head"><span class="nc-title"></span><span class="nc-status"></span></div>' +
      '<div class="nc-alert"><span class="nc-alert-what"></span><span class="nc-alert-when"></span></div>' +
      '<div class="nc-grid"></div><div class="nc-message"></div>';
    root.querySelector(".nc-title").textContent = this.config.title;
    root.addEventListener("click", () => {
      this.cancelReturn();
      if (this.paused) this.beginStreams(); else if (this.wantLive) this.armPauseTimer();
    });
    return root;
  },

  refresh() {
    if (!this.root) return;
    const root = this.root;
    const msg = root.querySelector(".nc-message");
    if (this.listError) msg.textContent = this.listError;
    else if (!this.cams) msg.textContent = "Looking for cameras…";
    else if (!this.cams.length) msg.textContent = "No cameras with live view on this account.";
    else msg.textContent = "";
    root.classList.toggle("has-message", !!msg.textContent);

    const tiles = Object.values(this.tiles);
    const live = tiles.filter((t) => t.state === "live").length;
    let status = "Off";
    if (this.paused) status = "Paused";
    else if (live) status = `Live · ${live}`;
    else if (this.wantLive && tiles.length) status = "Connecting";
    root.querySelector(".nc-status").textContent = status;
    root.classList.toggle("is-paused", this.paused);
    root.classList.toggle("is-live", live > 0 && !this.paused);

    const a = this.alert;
    root.classList.toggle("is-alert", !!a);
    if (a) {
      const what = { chime: `Doorbell \u00b7 ${a.label}`, person: `Person \u00b7 ${a.label}`, motion: `Motion \u00b7 ${a.label}` };
      root.querySelector(".nc-alert-what").textContent = what[a.kind] || a.label;
      root.querySelector(".nc-alert-when").textContent = new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }

    tiles.forEach((t, i) => {
      const el = t.el;
      el.classList.toggle("is-featured", i === this.featured);
      el.classList.toggle("is-ringing", !!a && i === this.featured);
      el.classList.toggle("is-live", t.state === "live");
      el.classList.toggle("is-error", t.state === "error");
      el.classList.toggle("is-connecting", t.state === "connecting");
      const words = { live: "Live", connecting: "Connecting", error: "Retrying", idle: this.paused ? "Paused" : "" };
      el.querySelector(".nc-state").textContent = words[t.state] || "";
      let over = "";
      if (this.paused) over = "Paused · tap to resume";
      else if (t.state === "error") over = t.msg || "Can't reach this camera";
      else if (t.state === "connecting") over = "Connecting…";
      el.querySelector(".nc-overlay").textContent = over;
      el.classList.toggle("has-overlay", !!over);
    });
  },

  getDom() {
    if (!this.root) this.root = this.makeRoot();
    this.refresh();
    return this.root;
  }
});
