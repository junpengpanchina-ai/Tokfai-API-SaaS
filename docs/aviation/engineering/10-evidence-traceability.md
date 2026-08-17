# Engineering 10 — Evidence Traceability

```text
TARGET GRAPH
```

```text
LAW
 ↓
RULE
 ↓
CERTIFICATION BASIS
 ↓
REQUIREMENT
 ↓
SYSTEM REQUIREMENT
 ↓
DESIGN
 ↓
MODEL
 ↓
CODE
 ↓
TEST CASE
 ↓
TEST RESULT
 ↓
REPORT
 ↓
COMPLIANCE FINDING
```

Edge statuses:

| Status | Meaning |
| ------ | ------- |
| TRACEABLE | IDs link both ends with matching revision |
| PARTIAL | Link exists but revision/scope mismatch |
| BROKEN | Claimed link missing or contradictory |
| UNKNOWN | Insufficient information |

Tokfai Aviation Agent future scoring = % TRACEABLE vs BROKEN on synthetic golden set.
