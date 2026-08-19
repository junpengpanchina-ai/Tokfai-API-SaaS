# 样例 — 飞控/地面站日志摘录（合成）

```text
SYNTHETIC_DEMO_ONLY
MISSION=DEMO-20250819-TL-07
AIRCRAFT=TSL-X600 / SW-2.3.1
P1276-R0
```

**文件形态：** 模拟 CSV 架次日志片段  
**任务：** 虚构 A 省某 220 kV 线路 corridor 巡检（合法商业场景占位）

---

## 元数据

```text
sw_version=DEMO-SW-2.3.1
cfg_id=DEMO-CFG-01
route_file=demo_route_v1.csv
pilot_id=***REDACTED***
```

---

## 事件摘录

| utc_time | mode | gnss_fix | wind_ms | temp_c | batt_soc | event |
| -------- | ---- | -------- | ------- | ------ | -------- | ----- |
| 2025-08-19T06:12:01Z | PREFLIGHT | 3D | 2.1 | 8 | 98 | CHECK_OK |
| 2025-08-19T06:18:44Z | AUTO_MISSION | RTK_FIXED | 5.4 | 28 | 76 | WP_12_REACHED |
| 2025-08-19T06:31:02Z | AUTO_MISSION | RTK_FIXED | 7.6 | 41 | 52 | WIND_WARN |
| 2025-08-19T06:33:19Z | AUTO_MISSION | RTK_DEGRADED | 8.9 | 43 | 48 | GNSS_DEGRADED |
| 2025-08-19T06:34:05Z | RTH | RTK_DEGRADED | 9.1 | 43 | 46 | LINK_LOSS |
| 2025-08-19T06:36:22Z | LAND | 3D | 6.2 | 40 | 44 | MISSION_ABORT |

---

## 演示用解读锚点（非结论）

| 现象 | 关联函数/环境 | 需对照文件 |
| ---- | ------------- | ---------- |
| temp_c 达 41–43 | 高温 F1 | device params ENV-TMAX |
| wind_ms 8.9–9.1 | 强风 F1/F3 | device params ENV-WMAX=8 |
| GNSS_DEGRADED | 导航 F4 | 手册 GNSS 节（demo 未附） |
| LINK_LOSS | 链路 F5 | 手册 p.40（虚构索引） |
| batt_soc 44% 落地 | 能量 F2 | SOC-RTH=25% 已触发 RTH 序列 |
| MISSION_ABORT | 任务 F7 | 航线 demo_route_v1.csv |

---

## 说明

日志为合成数据，用于证据链 Demo 验证。  
Tokfai 不据此做事故定责、不直接控飞。
