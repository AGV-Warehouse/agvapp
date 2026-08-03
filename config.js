// Fleet configuration. AGV-01 is the real linorobot2; the rest are mocks
// kept so the fleet UI stays exercised until more robots exist.
//
// rosbridge URL resolution order (first hit wins):
//   1. ?ros=ws://host:9090 query parameter
//   2. localStorage "agv.rosbridgeUrl"
//   3. defaultRosbridgeUrl below
const APP_CONFIG = {
  defaultRosbridgeUrl: "ws://192.168.1.50:9090",
  mapSourceRobotId: "AGV-01",
  robots: [
    {
      id: "AGV-01",
      name: "AGV-01",
      type: "ros",
      topics: {
        pose: { name: "/amcl_pose", type: "geometry_msgs/msg/PoseWithCovarianceStamped" },
        odom: { name: "/odom_rf2o", type: "nav_msgs/msg/Odometry" },
        map: { name: "/map", type: "nav_msgs/msg/OccupancyGrid" },
        cmdVel: { name: "/cmd_vel", type: "geometry_msgs/msg/Twist" },
        goalPose: { name: "/goal_pose", type: "geometry_msgs/msg/PoseStamped" },
        initialPose: { name: "/initialpose", type: "geometry_msgs/msg/PoseWithCovarianceStamped" },
        navStatus: { name: "/navigate_to_pose/_action/status", type: "action_msgs/msg/GoalStatusArray" },
      },
      services: {
        navCancel: { name: "/navigate_to_pose/_action/cancel_goal", type: "action_msgs/srv/CancelGoal" },
        getMap: { name: "/map_server/map", type: "nav_msgs/srv/GetMap" },
      },
      // Nav2 velocity_smoother caps (linorobot2_navigation/config/navigation.yaml)
      limits: { maxLinear: 0.05, maxAngular: 0.25 },
    },
    ...Array.from({ length: 9 }, (_, index) => {
      const id = `AGV-${String(index + 2).padStart(2, "0")}`;
      return { id, name: id, type: "mock" };
    }),
  ],
  // World-frame (map) coordinates for the Point-To-Point form, to be surveyed
  // on-site (e.g. RViz Publish Point). null = mock-only until filled in.
  namedGoals: {
    A: null,
    B: null,
    C: null,
    D: null,
    E: null,
    F: null,
    G: null,
  },
};

function resolveRosbridgeUrl() {
  const fromQuery = new URLSearchParams(window.location.search).get("ros");
  if (fromQuery) return fromQuery;
  try {
    const stored = window.localStorage.getItem("agv.rosbridgeUrl");
    if (stored) return stored;
  } catch (error) {
    // localStorage unavailable (private mode etc.) — fall through.
  }
  return APP_CONFIG.defaultRosbridgeUrl;
}
