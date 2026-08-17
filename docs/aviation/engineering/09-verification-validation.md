# Engineering 09 — Verification & Validation

```text
Gap Matrix core pipeline
```

```text
Requirement
    ↓
Verification Method
├─ Analysis
├─ Inspection
├─ Simulation
├─ Ground Test
└─ Flight Test
    ↓
Evidence
    ↓
Pass / Fail / Conditional
```

| Method | Strengths | Typical gaps |
| ------ | --------- | ------------ |
| Analysis | Early | Assumptions undocumented |
| Inspection | Cheap | Misses dynamic faults |
| Simulation | Coverage | Model fidelity unproven |
| Ground test | Controlled | Not full envelope |
| Flight test | Highest fidelity | Cost; limited cases |

Synthetic customer seeds mismatches across this chain intentionally.
