# Engineering 01 — UAS System Architecture

```text
P1200-R2 — HOW IS IT ENGINEERED / VERIFIED / EVIDENCED
PRIMARY_DOMAIN: AVIATION
LINKED_DOMAINS: EMBEDDED, SOFTWARE, TELECOM, ENERGY, GIS
```

---

## 1. System breakdown

| Subsystem | Typical functions | Failure examples | Aviation requirement hooks | Verification / Evidence |
| --------- | ----------------- | ---------------- | -------------------------- | ----------------------- |
| Aircraft airframe | Structure, aero, loads | Structural failure | SC / limited category standards | Structural analysis, ground/flight loads tests |
| Ground Control Station | HMI, command, monitoring | GCS loss, wrong mode | CCAR-92 remote crew; SC GCS chapters | HMI eval, failure tests (AC-92-01 遥控台失效) |
| C2 Link | Uplink/downlink, QoS | Lost link | Ordinance Art.27 freq; CCAR-92 C2 | Link budget, lost-link tests |
| Navigation | GNSS/INS/vision | Nav degrade | SC nav; AC GNSS interrupt tests | Sensor fault injection |
| Flight Control | Guidance/autopilot | Uncontrolled trajectory | SC flight characteristics | SIL/HIL/flight test |
| Propulsion | Motors/props | Partial power loss | SC propulsion; AC partial power tests | Endurance, failure isolation |
| Power | Battery/BMS/PDU | Thermal runaway | SC electrical | Abuse tests, BMS logs |
| Payload | Cargo/sensors | Jettison fail | Ordinance dangerous goods clawback | Release tests |
| Telemetry | Health/position | False data | UOM dynamic data; cloud self-check | Interface conformance |
| Remote Identification | Broadcast/network ID | RID silent | Ordinance Art.24; GB 46750 | RID lab/field |
| Operational Control | Ops monitoring, plan | Ops control gap | CCAR-92 92.615; AC-92-FS-002 | Ops system approval evidence |
| Backend / Cloud | Fleet, records | Data integrity loss | 24-month retention; MH/T 2011 | Audit logs, backup tests |
| Human Operator | Pilot/crew | Wrong action | Licence/training | Training records |
| External Services | ATM, UOM, weather | Service outage | Flight application / UOM | Integration tests |

---

## 2. Trace chain (target model)

```text
System → Subsystem → Function → Failure → Requirement → Verification → Evidence
```

Edge status for synthetic customer: see `test-fixtures/aviation/customer-001/expected-findings.json`.

---

## 3. Unknowns

- Project certification basis decides which failures are catastrophic vs major → `REQUIRES_PROJECT_CERTIFICATION_BASIS`
- Exact partitioning of “cloud” vs “ops control system” vs UOM for a given operator → project-specific
