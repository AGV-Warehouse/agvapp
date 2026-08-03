// roslib wrapper for one real robot. No DOM access — the app wires callbacks:
//   { onState(), onPose(pose), onOdom(odom), onMap(grid), onNavEvent(evt), onLog(text) }
// Safety model: manual jog publishes Twist at 10 Hz while held; the firmware's
// 200 ms cmd_vel watchdog stops the motors if the stream dies for any reason.
const NAV_STATUS_LABELS = {
  2: "navigating",
  4: "arrived",
  5: "canceled",
  6: "aborted",
};

class RosRobotConnection {
  constructor(robotCfg, url, cb) {
    this.cfg = robotCfg;
    this.url = url;
    this.cb = cb;
    this.ros = null;
    this.connected = false;
    this.lastSeen = 0;
    this.reconnectDelay = 1000;
    this.reconnectTimer = null;
    this.jogTimer = null;
    this.topics = {};
    this.lastNavStatus = null;
  }

  connect() {
    this.ros = new ROSLIB.Ros({ url: this.url });

    this.ros.on("connection", () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      this.lastSeen = Date.now();
      this.cb.onLog(`${this.cfg.id} connected to rosbridge at ${this.url}`);
      this._subscribe();
      this.cb.onState();
    });

    this.ros.on("close", () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.stopJog();
      if (wasConnected) this.cb.onLog(`${this.cfg.id} lost rosbridge connection`);
      this.cb.onState();
      this._scheduleReconnect();
    });

    this.ros.on("error", () => {
      // "close" follows and handles reconnect; avoid double-logging.
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
      this.connect();
    }, this.reconnectDelay);
  }

  _topic(key, extra = {}) {
    const cfg = this.cfg.topics[key];
    return new ROSLIB.Topic({
      ros: this.ros,
      name: cfg.name,
      messageType: cfg.type,
      ...extra,
    });
  }

  _subscribe() {
    this.topics.pose = this._topic("pose");
    this.topics.pose.subscribe((msg) => {
      this.lastSeen = Date.now();
      this.cb.onPose(msg.pose.pose);
    });

    this.topics.odom = this._topic("odom", { throttle_rate: 200 });
    this.topics.odom.subscribe((msg) => {
      this.lastSeen = Date.now();
      this.cb.onOdom(msg);
    });

    this.topics.map = this._topic("map", { compression: "cbor" });
    this.topics.map.subscribe((msg) => {
      this.mapReceived = true;
      this.cb.onMap(msg);
    });
    // /map is transient_local; if the latched sample never crosses rosbridge,
    // fall back to asking the map server directly.
    window.setTimeout(() => this._fetchMapFallback(), 4000);

    this.topics.navStatus = this._topic("navStatus");
    this.topics.navStatus.subscribe((msg) => {
      const latest = msg.status_list[msg.status_list.length - 1];
      if (!latest) return;
      const label = NAV_STATUS_LABELS[latest.status];
      if (label && label !== this.lastNavStatus) {
        this.lastNavStatus = label;
        this.cb.onNavEvent(label);
      }
    });

    this.topics.cmdVel = this._topic("cmdVel");
    this.topics.goalPose = this._topic("goalPose");
    this.topics.initialPose = this._topic("initialPose");
  }

  _fetchMapFallback() {
    if (!this.connected || this.mapReceived) return;
    const service = new ROSLIB.Service({
      ros: this.ros,
      name: this.cfg.services.getMap.name,
      serviceType: this.cfg.services.getMap.type,
    });
    service.callService(new ROSLIB.ServiceRequest({}), (result) => {
      if (result && result.map && result.map.info.width > 0) {
        this.mapReceived = true;
        this.cb.onMap(result.map);
      }
    }, () => {
      this.cb.onLog(`${this.cfg.id} map not available yet (topic and service both quiet)`);
    });
  }

  _publishTwist(linear, angular) {
    this.topics.cmdVel.publish(new ROSLIB.Message({
      linear: { x: linear, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: angular },
    }));
  }

  startJog(linear, angular) {
    if (!this.connected) return false;
    const lin = Math.max(-this.cfg.limits.maxLinear, Math.min(this.cfg.limits.maxLinear, linear));
    const ang = Math.max(-this.cfg.limits.maxAngular, Math.min(this.cfg.limits.maxAngular, angular));
    // Manual jog and Nav2 both write /cmd_vel — cancel any active goal first.
    if (this.lastNavStatus === "navigating") this.cancelNav();
    this.stopJog(false);
    this._publishTwist(lin, ang);
    this.jogTimer = window.setInterval(() => this._publishTwist(lin, ang), 100);
    return true;
  }

  stopJog(publishZero = true) {
    if (this.jogTimer) {
      window.clearInterval(this.jogTimer);
      this.jogTimer = null;
    }
    if (publishZero && this.connected) {
      // Zero burst is belt; the firmware's 200 ms watchdog is suspenders.
      for (const delay of [0, 50, 100]) {
        window.setTimeout(() => this._publishTwist(0, 0), delay);
      }
    }
  }

  sendGoal(x, y, yaw) {
    if (!this.connected) return false;
    this.topics.goalPose.publish(new ROSLIB.Message({
      header: { frame_id: "map", stamp: { sec: 0, nanosec: 0 } },
      pose: {
        position: { x, y, z: 0 },
        orientation: { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) },
      },
    }));
    return true;
  }

  setInitialPose(x, y, yaw) {
    if (!this.connected) return false;
    const covariance = new Array(36).fill(0);
    covariance[0] = 0.25; // x
    covariance[7] = 0.25; // y
    covariance[35] = 0.0685; // yaw
    this.topics.initialPose.publish(new ROSLIB.Message({
      header: { frame_id: "map", stamp: { sec: 0, nanosec: 0 } },
      pose: {
        pose: {
          position: { x, y, z: 0 },
          orientation: { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) },
        },
        covariance,
      },
    }));
    return true;
  }

  cancelNav() {
    if (!this.connected) return;
    const service = new ROSLIB.Service({
      ros: this.ros,
      name: this.cfg.services.navCancel.name,
      serviceType: this.cfg.services.navCancel.type,
    });
    // Zero UUID + zero stamp = cancel all goals.
    service.callService(new ROSLIB.ServiceRequest({
      goal_info: {
        goal_id: { uuid: new Array(16).fill(0) },
        stamp: { sec: 0, nanosec: 0 },
      },
    }), () => {}, () => {
      this.cb.onLog(`${this.cfg.id} nav cancel service call failed`);
    });
  }

  estop() {
    this.cancelNav();
    this.stopJog();
  }

  isStale(now = Date.now()) {
    return this.connected && now - this.lastSeen > 5000;
  }
}
