// The swap seam (Phase 0 of the ROS bridge integration).
//
// Bridge interface -- both implementations below expose exactly this shape,
// so app.js never needs to know whether it's talking to the real robot or
// the offline mock:
//
//   onPose(cb)               cb({x, y, yaw})            -- meters, radians
//   onMap(cb)                cb(rawOccupancyGridMsg)    -- raw nav_msgs/OccupancyGrid
//   onConnectionChange(cb)   cb(connected: boolean)
//   sendGoal(x, y, yaw)      publish a nav goal
//   setPose(x, y, yaw)       set localization (initialpose)
//   jog(vx, wz)              HOLD this velocity -- publishes at 10 Hz until stopJog()
//   stopJog()                stop publishing + send explicit zero velocities
//   cancel()                 cancel all in-progress nav goals
//
// Note on jog(): the repeat timer lives *inside* the bridge, not in the UI.
// A dead-man switch that depends on the UI remembering to re-publish every
// 100ms is one forgotten code path away from a robot that keeps driving, so
// the bridge owns the cadence and the UI only says "start" and "stop".

const JOG_PUBLISH_INTERVAL_MS = 100; // 10 Hz -- firmware watchdog is 200ms, so
                                     // this leaves 2 missed frames of margin.
                                     // Never raise above 200ms.
const JOG_STOP_REPEATS = 3; // redundant zero-velocity publishes on release

// Acceleration limits. Publishing the full target velocity on the first tick
// is a step input, which the motors answer with a jerk; ramp instead.
// At these rates a jog reaches full speed in ~0.5s.
const JOG_ACCEL_LINEAR = 0.2; // m/s^2
const JOG_ACCEL_ANGULAR = 0.6; // rad/s^2

/**
 * Moves `current` toward `target` by at most `maxStep`.
 * @returns {number}
 */
function rampToward(current, target, maxStep) {
  if (current < target) return Math.min(current + maxStep, target);
  if (current > target) return Math.max(current - maxStep, target);
  return target;
}

/** Quaternion (z, w) for a yaw rotation about Z. */
function quaternionFromYaw(yaw) {
  return { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) };
}

/** RViz's /initialpose covariance: 0.25 on x and y, 0.068 on yaw. */
function initialPoseCovariance() {
  const covariance = new Array(36).fill(0);
  covariance[0] = 0.25;
  covariance[7] = 0.25;
  covariance[35] = 0.068;
  return covariance;
}

/**
 * Self-contained offline simulator. Implements the same interface (including
 * the same jog timer semantics) so Phase 2/3 interactions can be developed
 * and clicked through with no robot present, via ?ros=mock.
 */
function createMockBridge() {
  const poseListeners = [];
  const mapListeners = [];
  const connectionListeners = [];

  // A plain 5m x 5m room with border walls, shaped like a real nav_msgs/OccupancyGrid.
  const resolution = 0.05;
  const width = 100;
  const height = 100;
  const data = new Int8Array(width * height).fill(0);
  for (let col = 0; col < width; col++) {
    data[col] = 100;
    data[(height - 1) * width + col] = 100;
  }
  for (let row = 0; row < height; row++) {
    data[row * width] = 100;
    data[row * width + width - 1] = 100;
  }
  // Test cases for map.js's wall/object detection in ?ros=mock: a chair (four
  // legs 0.45 m apart) gets an object box, a lone post stays a grey speck, and
  // a wall broken into fragments with 5 cm gaps is drawn as one wall.
  [[15, 70], [24, 70], [15, 79], [24, 79], [75, 25]].forEach(([col, row]) => {
    data[row * width + col] = 100;
  });
  for (let col = 55; col < 95; col += 3) {
    data[50 * width + col] = 100;
    data[50 * width + col + 1] = 100;
  }
  const fakeMap = {
    info: { resolution, width, height, origin: { position: { x: 0, y: 0 } } },
    data,
  };

  let pose = { x: 2.5, y: 2.5, yaw: 0 };
  let goalAnimation = null;
  let jogTimer = null;

  function emitPose() {
    poseListeners.forEach((cb) => cb({ ...pose }));
  }

  function stopGoalAnimation() {
    if (goalAnimation) {
      clearInterval(goalAnimation);
      goalAnimation = null;
    }
  }

  setTimeout(() => mapListeners.forEach((cb) => cb(fakeMap)), 0);
  setTimeout(() => connectionListeners.forEach((cb) => cb(true)), 0);

  return {
    onPose(cb) {
      poseListeners.push(cb);
      cb({ ...pose });
    },
    onMap(cb) {
      mapListeners.push(cb);
    },
    onConnectionChange(cb) {
      connectionListeners.push(cb);
      cb(true);
    },
    sendGoal(x, y, yaw) {
      stopGoalAnimation();
      const start = { ...pose };
      const steps = 15;
      let step = 0;
      goalAnimation = setInterval(() => {
        step += 1;
        const t = step / steps;
        pose = { x: start.x + (x - start.x) * t, y: start.y + (y - start.y) * t, yaw };
        emitPose();
        if (step >= steps) stopGoalAnimation();
      }, 100);
    },
    setPose(x, y, yaw) {
      stopGoalAnimation();
      pose = { x, y, yaw };
      emitPose();
    },
    jog(vx, wz) {
      this.stopJog();
      jogTimer = setInterval(() => {
        const dt = JOG_PUBLISH_INTERVAL_MS / 1000;
        pose = {
          x: pose.x + vx * Math.cos(pose.yaw) * dt,
          y: pose.y + vx * Math.sin(pose.yaw) * dt,
          yaw: pose.yaw + wz * dt,
        };
        emitPose();
      }, JOG_PUBLISH_INTERVAL_MS);
    },
    stopJog() {
      if (jogTimer) {
        clearInterval(jogTimer);
        jogTimer = null;
      }
    },
    cancel() {
      stopGoalAnimation();
    },
  };
}

/**
 * Real robot, via rosbridge + roslibjs.
 * @param {string} url e.g. "ws://192.168.1.171:9090"
 */
function createRosBridge(url) {
  const ros = new ROSLIB.Ros({ url });
  const poseListeners = [];
  const mapListeners = [];
  const connectionListeners = [];

  ros.on("connection", () => connectionListeners.forEach((cb) => cb(true)));
  ros.on("close", () => connectionListeners.forEach((cb) => cb(false)));
  ros.on("error", () => connectionListeners.forEach((cb) => cb(false)));

  // --- subscriptions (Phase 1) --------------------------------------------
  // Throttled -- every subscription costs serialization CPU on the Jetson.
  const poseTopic = new ROSLIB.Topic({
    ros,
    name: "/amcl_pose",
    messageType: "geometry_msgs/PoseWithCovarianceStamped",
    throttle_rate: 200,
  });
  poseTopic.subscribe((message) => {
    const p = message.pose.pose;
    const yaw = 2 * Math.atan2(p.orientation.z, p.orientation.w);
    poseListeners.forEach((cb) => cb({ x: p.position.x, y: p.position.y, yaw }));
  });

  // Latched -- subscribe once, then drop it so it stops costing anything.
  const mapTopic = new ROSLIB.Topic({ ros, name: "/map", messageType: "nav_msgs/OccupancyGrid" });
  mapTopic.subscribe((message) => {
    mapListeners.forEach((cb) => cb(message));
    mapTopic.unsubscribe();
  });

  // --- publishers / services (Phase 2 + 3) --------------------------------
  const cmdVelTopic = new ROSLIB.Topic({ ros, name: "/cmd_vel", messageType: "geometry_msgs/Twist" });
  const goalTopic = new ROSLIB.Topic({ ros, name: "/goal_pose", messageType: "geometry_msgs/PoseStamped" });
  const initialPoseTopic = new ROSLIB.Topic({
    ros,
    name: "/initialpose",
    messageType: "geometry_msgs/PoseWithCovarianceStamped",
  });
  // Hidden from `ros2 service list` (the _action/ name component), but callable.
  const cancelService = new ROSLIB.Service({
    ros,
    name: "/navigate_to_pose/_action/cancel_goal",
    serviceType: "action_msgs/srv/CancelGoal",
  });

  function twist(vx, wz) {
    return new ROSLIB.Message({
      linear: { x: vx, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: wz },
    });
  }

  // Advertise every command topic NOW rather than on first publish.
  // roslibjs otherwise advertises lazily, and rosbridge's freshly created DDS
  // publisher needs discovery time to match its subscribers -- the first
  // message published in that window is silently lost. For a one-shot
  // interaction like Set Pose, the lost message IS the interaction.
  // (Observed live: first /initialpose after advertise dropped, later ones
  // accepted.) roslibjs queues these until the socket opens, so calling
  // immediately is safe.
  cmdVelTopic.advertise();
  goalTopic.advertise();
  initialPoseTopic.advertise();

  // Stamp 0 is deliberate: tf2 reads time 0 as "latest available transform",
  // which avoids goals being rejected for clock skew between the tablet and
  // the robot. Do not substitute Date.now() here. (No `seq` -- that field
  // doesn't exist in ROS 2 std_msgs/Header.)
  const zeroStampHeader = () => ({ stamp: { sec: 0, nanosec: 0 }, frame_id: "map" });

  let jogTimer = null;

  function stopJog() {
    if (jogTimer) {
      clearInterval(jogTimer);
      jogTimer = null;
    }
    // Explicit zeros, repeated -- a single stop packet lost on 2.4GHz WiFi
    // must not leave the robot driving until the firmware watchdog trips.
    for (let i = 0; i < JOG_STOP_REPEATS; i++) {
      cmdVelTopic.publish(twist(0, 0));
    }
  }

  return {
    onPose(cb) {
      poseListeners.push(cb);
    },
    onMap(cb) {
      mapListeners.push(cb);
    },
    onConnectionChange(cb) {
      connectionListeners.push(cb);
    },
    sendGoal(x, y, yaw) {
      goalTopic.publish(
        new ROSLIB.Message({
          header: zeroStampHeader(),
          pose: { position: { x, y, z: 0 }, orientation: quaternionFromYaw(yaw) },
        }),
      );
    },
    setPose(x, y, yaw) {
      initialPoseTopic.publish(
        new ROSLIB.Message({
          header: zeroStampHeader(),
          pose: {
            pose: { position: { x, y, z: 0 }, orientation: quaternionFromYaw(yaw) },
            covariance: initialPoseCovariance(),
          },
        }),
      );
    },
    jog(vx, wz) {
      stopJog(); // clears any previous hold, and zeroes before re-arming
      // Ramp from zero toward the target each tick instead of stepping
      // straight to it -- kills the lurch at jog start. Stopping stays
      // immediate (stopJog publishes hard zeros): ramp-up is comfort,
      // ramp-down would be a safety regression.
      let currentVx = 0;
      let currentWz = 0;
      const dt = JOG_PUBLISH_INTERVAL_MS / 1000;
      const tick = () => {
        currentVx = rampToward(currentVx, vx, JOG_ACCEL_LINEAR * dt);
        currentWz = rampToward(currentWz, wz, JOG_ACCEL_ANGULAR * dt);
        cmdVelTopic.publish(twist(currentVx, currentWz));
      };
      tick(); // publish immediately, don't wait 100ms
      jogTimer = setInterval(tick, JOG_PUBLISH_INTERVAL_MS);
    },
    stopJog,
    cancel(callback) {
      // All-zero uuid = cancel every active goal.
      cancelService.callService(
        new ROSLIB.ServiceRequest({
          goal_info: { goal_id: { uuid: new Array(16).fill(0) }, stamp: { sec: 0, nanosec: 0 } },
        }),
        (result) => callback && callback(result),
        (error) => callback && callback(null, error),
      );
    },
  };
}
