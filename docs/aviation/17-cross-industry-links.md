# 17 — Cross-Industry Links

目标：每个航空要求尝试映射到工程领域。  
状态仅用：

```text
VERIFIED_LINK
PLAUSIBLE_LINK
REQUIRES_RESEARCH
```

推断不得伪装成法规。

---

## Link table

| Aviation requirement | Engineering domain | Link status | Notes |
| -------------------- | ------------------ | ----------- | ----- |
| C2 指挥控制链路 | telecom / network engineering / embedded | VERIFIED_LINK | CCAR-92 明确 C2 要求；条例申请含频率带宽 |
| 运行识别 / RID | identity / protocol / broadcast+network | VERIFIED_LINK | 条例第二十四条；GB 46750 |
| 飞行动态数据报送 | API / telemetry / backend / networking | VERIFIED_LINK | UOM-002；MH/T 4053 |
| UOM 登记激活 | identity systems / IAM / device lifecycle | VERIFIED_LINK | 条例；GB 46761；UOM |
| 系统安全性分析 FHA/PSSA | safety engineering / systems engineering | VERIFIED_LINK | AC-21-AA-2022-40 |
| 持续适航 / 维修记录 | maintenance / MRO / supply chain / config mgmt | VERIFIED_LINK | CCAR-92 维修与记录条款 |
| 航线 / 空域 / 高度 | GIS / airspace data / geofencing | VERIFIED_LINK | 条例空域与申请内容 |
| 天气限制（安全评定科目含天气/夜间等） | meteorology / ops planning | PLAUSIBLE_LINK | AC 试飞科目提及；运行规则细节需再挖 |
| 电子围栏 | embedded + GIS + policy data | VERIFIED_LINK | 条例行为规范；AC 测试科目 |
| GNSS 中断应对 | PNT / resilient navigation | VERIFIED_LINK | AC-92-01 测试科目含 GNSS 中断 |
| 链路中断应急 | telecom failover / autonomy | VERIFIED_LINK | AC 测试科目；CCAR-92 C2 紧急程序 |
| 集群 / 分布式操作 | multi-agent / swarm networking | VERIFIED_LINK | 条例第三十一条回流申请情形 |
| 责任保险 | insurance / actuarial / compliance ops | VERIFIED_LINK | 条例第十二条 |
| 唯一产品识别码 | manufacturing traceability / serialization | VERIFIED_LINK | 条例；LAW-001 Art.34 |
| 危险品运载 | dangerous goods / logistics compliance | PLAUSIBLE_LINK | 条例触发申请；细则交叉 `REQUIRES_RESEARCH` |
| 载人 eVTOL 人因 | HMI / human factors | PLAUSIBLE_LINK | EH216-S 远程机组定义在专用条件 |
| 生产质量体系 PC | manufacturing quality / supplier management | VERIFIED_LINK | EH216-S PC 审查要素 |
| 地方场地协调 | local government / site ops | REQUIRES_RESEARCH | 非全国统一规则 |
| 无线电频率占用 | spectrum licensing (MIIT) | REQUIRES_RESEARCH | 条例要求申报频率；核准流程未本轮核完 |
| 网络安全（条例提及网络信息安全） | cyber security | PLAUSIBLE_LINK | 条例原则性要求；细则 `REQUIRES_RESEARCH` |

---

## Counts (R1)

| Status | n |
| ------ | - |
| VERIFIED_LINK | 14 |
| PLAUSIBLE_LINK | 4 |
| REQUIRES_RESEARCH | 3 |
| **Total rows** | **21** |
