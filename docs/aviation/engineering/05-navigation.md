# Engineering 05 — Navigation

```text
PRIMARY_DOMAIN: AVIATION
LINKED_DOMAINS: PNT, EMBEDDED, COMPUTER_VISION
```

| Sensor / mode | Failure | Requirement hook | Evidence |
| ------------- | ------- | ---------------- | -------- |
| GNSS | Jamming/spoofing/outage | AC-92-01 GNSS 中断测试 | Fault injection |
| RTK | Correction loss | Project SC | Accuracy budgets |
| INS/IMU | Drift | SC nav continuity | Coasting tests |
| Magnetometer | Interference | EMI requirements | Mag calibration |
| Barometer | Pressure anomaly | Height protection tests | AC height/protection |
| Vision | Lighting/texture fail | Optional MoC | Vision ablation |
| Fusion | Common-mode fail | Safety assessment | FMEA/FTA |
| Degraded / lost nav | Uncontained trajectory | Emergency procedures | Procedure + flight test |

Applicability of each MoC: `REQUIRES_PROJECT_CERTIFICATION_BASIS`.
