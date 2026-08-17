# Engineering 04 — Command & Control Link (C2)

```text
PRIMARY_DOMAIN: AVIATION
LINKED_DOMAINS: TELECOM, NETWORKING, EMBEDDED, CYBERSECURITY
```

| Parameter | Why it matters | Requirement hooks | Evidence |
| --------- | -------------- | ----------------- | -------- |
| Frequency / bandwidth | Ordinance flight application item | Art.27(八) | Spectrum docs, measured occupancy |
| Latency / jitter / loss | Controllability | CCAR-92 C2 QoS | Lab + flight link metrics |
| Coverage / interference / handover | Continuity | Ops area assumptions | Coverage maps, RF surveys |
| Redundancy | Single-link hazard | Dual-link CASE examples (FP-981C draft) | Failover tests |
| Encryption | Network info security principle | Ordinance; AC-92-FS-002 info security refs | Security design + pen tests |
| Lost-link detection / recovery | Emergency procedures | CCAR-92 C2 emergency; AC lost-link tests | Injected disconnect tests |

```text
Aviation × Telecom × Embedded × Network Engineering
```
