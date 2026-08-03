#!/usr/bin/env python3
"""Fake linorobot2 for testing the AGV app without hardware.

Publishes a synthetic /map (transient_local), an /amcl_pose that walks toward
the last /goal_pose, and /odom_rf2o; subscribes /cmd_vel (jog moves the fake
pose); serves the navigate_to_pose cancel service.

Usage:
    ros2 launch rosbridge_server rosbridge_websocket_launch.xml   # terminal 1
    python3 tools/fake_robot.py                                   # terminal 2
    python3 -m http.server 8080                                   # terminal 3, repo root
    open http://localhost:8080?ros=ws://localhost:9090
"""
import math

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, DurabilityPolicy

from action_msgs.srv import CancelGoal
from geometry_msgs.msg import PoseStamped, PoseWithCovarianceStamped, Twist
from nav_msgs.msg import OccupancyGrid, Odometry


class FakeRobot(Node):
    def __init__(self):
        super().__init__("fake_robot")
        self.x, self.y, self.yaw = 1.0, 1.0, 0.0
        self.goal = None
        self.jog = Twist()
        self.jog_stamp = self.get_clock().now()

        latched = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL)
        self.map_pub = self.create_publisher(OccupancyGrid, "/map", latched)
        self.pose_pub = self.create_publisher(PoseWithCovarianceStamped, "/amcl_pose", 10)
        self.odom_pub = self.create_publisher(Odometry, "/odom_rf2o", 10)
        self.create_subscription(Twist, "/cmd_vel", self.on_cmd_vel, 10)
        self.create_subscription(PoseStamped, "/goal_pose", self.on_goal, 10)
        self.create_subscription(PoseWithCovarianceStamped, "/initialpose", self.on_initialpose, 10)
        self.create_service(CancelGoal, "/navigate_to_pose/_action/cancel_goal", self.on_cancel)

        self.publish_map()
        self.create_timer(0.1, self.tick)

    def publish_map(self):
        grid = OccupancyGrid()
        grid.header.frame_id = "map"
        info = grid.info
        info.resolution = 0.05
        info.width, info.height = 200, 160
        info.origin.position.x = -2.0
        info.origin.position.y = -2.0
        data = [0] * (info.width * info.height)
        for cx in range(info.width):
            for cy in (0, info.height - 1):
                data[cy * info.width + cx] = 100
        for cy in range(info.height):
            for cx in (0, info.width - 1):
                data[cy * info.width + cx] = 100
        for cx in range(60, 100):  # an obstacle block
            for cy in range(60, 90):
                data[cy * info.width + cx] = 100
        grid.data = data
        self.map_pub.publish(grid)
        self.get_logger().info("published fake /map (200x160 @ 0.05m)")

    def on_cmd_vel(self, msg):
        self.jog = msg
        self.jog_stamp = self.get_clock().now()

    def on_goal(self, msg):
        self.goal = (msg.pose.position.x, msg.pose.position.y)
        self.get_logger().info(f"goal received: ({self.goal[0]:.2f}, {self.goal[1]:.2f})")

    def on_initialpose(self, msg):
        self.x = msg.pose.pose.position.x
        self.y = msg.pose.pose.position.y
        self.get_logger().info(f"initial pose set: ({self.x:.2f}, {self.y:.2f})")

    def on_cancel(self, request, response):
        self.goal = None
        self.get_logger().info("navigation canceled")
        return response

    def tick(self):
        dt = 0.1
        jog_age = (self.get_clock().now() - self.jog_stamp).nanoseconds / 1e9
        if jog_age < 0.3 and (self.jog.linear.x or self.jog.angular.z):
            self.yaw += self.jog.angular.z * dt
            self.x += self.jog.linear.x * math.cos(self.yaw) * dt
            self.y += self.jog.linear.x * math.sin(self.yaw) * dt
            speed = self.jog.linear.x
        elif self.goal:
            dx, dy = self.goal[0] - self.x, self.goal[1] - self.y
            dist = math.hypot(dx, dy)
            if dist < 0.05:
                self.goal = None
                speed = 0.0
                self.get_logger().info("goal reached")
            else:
                self.yaw = math.atan2(dy, dx)
                step = min(0.3 * dt, dist)
                self.x += step * math.cos(self.yaw)
                self.y += step * math.sin(self.yaw)
                speed = 0.3
        else:
            speed = 0.0

        pose = PoseWithCovarianceStamped()
        pose.header.frame_id = "map"
        pose.pose.pose.position.x = self.x
        pose.pose.pose.position.y = self.y
        pose.pose.pose.orientation.z = math.sin(self.yaw / 2)
        pose.pose.pose.orientation.w = math.cos(self.yaw / 2)
        self.pose_pub.publish(pose)

        odom = Odometry()
        odom.header.frame_id = "odom"
        odom.twist.twist.linear.x = speed
        self.odom_pub.publish(odom)


def main():
    rclpy.init()
    node = FakeRobot()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
