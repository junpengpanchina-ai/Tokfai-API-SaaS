# Engineering 02 — Flight Control

```text
PRIMARY_DOMAIN: AVIATION
LINKED_DOMAINS: EMBEDDED, CONTROL_SYSTEMS, SOFTWARE
```

| Engineering function | Aviation requirement hook | Expected evidence |
| -------------------- | ------------------------- | ----------------- |
| Guidance | Mission path / height / speed limits | Mission software requirements, flight test |
| Navigation fusion | Degraded nav handling | GNSS interrupt tests (AC-92-01) |
| Control loops | Stability / controllability in SC | Handling qualities / closed-loop tests |
| Flight modes / state machine | Mode confusion hazards | Stateflow/model review, mode transition tests |
| Autopilot | Automatic flight claims | Autopilot requirements + MoC |
| Failsafe / lost link / RTH / emergency landing | Lost-link procedures; C2 emergency | Procedure docs + injected failure flight tests |
| Geofence | Electronic fence updates (条例) | Fence breach tests |
| Mission management | Distributed/swarm clawbacks | Ops procedures + sim |

**Rule:** WORKS ≠ VERIFIED ≠ TRACEABLE ≠ CERTIFICATION EVIDENCE.
