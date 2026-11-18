(function(root){'use strict';
const template={
  "schemaVersion": "1.1",
  "name": "我的练习 · 晶圆转运工厂",
  "frame": "map",
  "unit": "m",
  "site": {
    "x": 0.0,
    "y": 0.0,
    "width": 12.0,
    "depth": 8.0
  },
  "walls": [
    {
      "id": "e1000000000000000000000000000001",
      "name": "北侧隔墙",
      "start": {
        "x": 0.5,
        "y": 7.5
      },
      "end": {
        "x": 11.5,
        "y": 7.5
      },
      "height": 2.5,
      "thickness": 0.15
    }
  ],
  "obstacles": [
    {
      "id": "e2000000000000000000000000000001",
      "name": "刻印设备示意",
      "templateId": "equipment-box-v1",
      "x": 9,
      "y": 6,
      "width": 2,
      "depth": 1,
      "height": 1.5,
      "yaw": 0
    },
    {
      "id": "e2000000000000000000000000000002",
      "name": "设备防撞挡块",
      "templateId": "bumper-v1",
      "x": 9,
      "y": 5.2,
      "width": 2,
      "depth": 0.15,
      "height": 0.15,
      "yaw": 0
    }
  ],
  "navigation": {
    "points": [
      {
        "x": 2.0,
        "y": 2.0,
        "id": "P-1",
        "name": "待料起点"
      },
      {
        "x": 4.0,
        "y": 2.0,
        "id": "P-2",
        "name": "通行点一"
      },
      {
        "x": 7.0,
        "y": 2.0,
        "id": "P-3",
        "name": "通行点二"
      },
      {
        "x": 9.0,
        "y": 2.0,
        "id": "P-4",
        "name": "高桌中心"
      },
      {
        "x": 4.0,
        "y": 5.0,
        "id": "P-5",
        "name": "第二车起点"
      }
    ],
    "paths": [
      {
        "id": "R-1",
        "name": "路线 1",
        "sourcePointId": "P-1",
        "targetPointId": "P-2",
        "direction": "bidirectional",
        "maxVelocity": 0.05
      },
      {
        "id": "R-2",
        "name": "路线 2",
        "sourcePointId": "P-2",
        "targetPointId": "P-3",
        "direction": "bidirectional",
        "maxVelocity": 0.05
      },
      {
        "id": "R-3",
        "name": "路线 3",
        "sourcePointId": "P-3",
        "targetPointId": "P-4",
        "direction": "bidirectional",
        "maxVelocity": 0.05
      },
      {
        "id": "R-4",
        "name": "路线 4",
        "sourcePointId": "P-5",
        "targetPointId": "P-2",
        "direction": "bidirectional",
        "maxVelocity": 0.05
      }
    ],
    "stations": [
      {
        "id": "S-1",
        "name": "待料缓冲位",
        "pointId": "P-1",
        "yaw": 0.0,
        "workcell": {
          "templateId": "buffer-v1",
          "footprint": {
            "x": 2.0,
            "y": 2.0,
            "yaw": 0.0,
            "width": 1.2,
            "depth": 0.8
          }
        }
      },
      {
        "id": "S-2",
        "name": "第二车停车位",
        "pointId": "P-5",
        "yaw": 0.0
      },
      {
        "id": "S-3",
        "name": "高桌工位",
        "pointId": "P-4",
        "yaw": 0.0,
        "workcell": {
          "templateId": "lift-table-v1",
          "footprint": {
            "x": 9.0,
            "y": 2.0,
            "yaw": 0.0,
            "width": 1.6,
            "depth": 1.6
          },
          "table": {
            "clearHeight": 0.8,
            "topThickness": 0.08,
            "legWidth": 0.1
          },
          "terminal": {
            "x": 9.0,
            "y": 4.0,
            "yaw": -1.5707963267948966,
            "height": 1.1,
            "tagId": 7,
            "buttonId": "CALL-TABLE"
          }
        }
      }
    ],
    "spawns": [
      {
        "vehicleName": "LAB-01",
        "pointId": "P-1",
        "yaw": 0.0
      },
      {
        "vehicleName": "LAB-02",
        "pointId": "P-5",
        "yaw": 0.0
      }
    ]
  }
};
const api={create:()=>JSON.parse(JSON.stringify(template))};root.SceneExample=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
