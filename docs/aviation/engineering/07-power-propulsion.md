# Engineering 07 — Power / Propulsion

```text
PRIMARY_DOMAIN: AVIATION
LINKED_DOMAINS: ENERGY, BMS, THERMAL, EMBEDDED
```

| Element | Hazard | Requirement hooks | Evidence |
| ------- | ------ | ----------------- | -------- |
| Battery | Thermal runaway, loss of power | Project SC electrical/energy | Cell/pack abuse, flight endurance |
| BMS | Incorrect SOC/SOH, isolation fail | SC + safety assessment | BMS S/W tests, fault injection |
| Motor / ESC | Partial power loss | AC-92-01 部分动力失效 | Controllability after failure |
| Power distribution | Single-point bus loss | Redundancy claims | Architecture + tests |
| Thermal | Derate / shutdown | Operating envelope | Thermal chamber / flight |
| Failure isolation | Cascade | Safety objectives | FTA/FMEA + tests |

Electric propulsion special conditions (eVTOL cases) land on: **hardware + software + test + report** — not marketing claims.
