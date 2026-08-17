# 06 — Why “Cannot Fly” Taxonomy

```text
INTERNAL ROOT-CAUSE ENUMERATION
Not an official CAAC classification.
```

行业口语：“这个飞机飞不了。”  
必须拆成不同根因，对应不同 Gate 与证据。

---

## Taxonomy

| Root cause ID | Meaning | Typical Gate | Official hooks (examples) | Tag |
| ------------- | ------- | ------------ | ------------------------- | --- |
| AIRCRAFT_NOT_ELIGIBLE | 航空器本身不在拟任务允许范围内（类别/性能/排除对象） | G0/G1 | 条例分类与行为规范 | `INTERPRETATION` |
| AIRWORTHINESS_GAP | 需要适航许可/证件但未取得，或证件类别不匹配 | G3 | 条例第八条；CCAR-92 D；92.303 | `FACT` 触发条件 |
| REGISTRATION_GAP | 未依法实名登记 | G2 | 条例第十条、第四十七条 | `FACT` |
| ACTIVATION_GAP | 未按激活要求激活，或取消激活后仍试图飞行 | G2 | GB 46761（FUTURE）；条例实名登记激活表述 | `FACT`/`FUTURE` |
| REMOTE_IDENTIFICATION_GAP | 识别信息广播/报送能力缺失 | G7 | 条例第二十四条；GB 46750（FUTURE） | `FACT`/`FUTURE` |
| UOM_CONNECTIVITY_GAP | 未接入或无法向 UOM 报送动态/身份相关数据 | G7 | UOM-002；条例平台条款 | `FACT` |
| PILOT_QUALIFICATION_GAP | 操控员执照/培训/行为能力不符 | G4 | 条例第十六–十七条 | `FACT` |
| OPERATOR_CERTIFICATE_GAP | 应持运营合格证未持有或超运营规范 | G5 | 条例第十一条、第四十九条 | `FACT` |
| INSURANCE_GAP | 应投保责任保险未投保 | G6 | 条例第十二条、第四十八条 | `FACT` |
| AIRSPACE_RESTRICTION | 拟飞区域为管制/临时管制等不可飞或不符高度 | G8 | 条例空域章 | `FACT` |
| FLIGHT_APPLICATION_REJECTED | 飞行活动申请被拒或不予批准 | G9 | 条例第二十六条 | `FACT` |
| MISSION_PERMISSION_GAP | 特殊任务/危险品/集会等额外许可缺失 | G10 | 条例第三十一条第二款等 | `FACT` |
| C2_GAP | 指挥控制链路不符合运行要求 | G7/G11 | CCAR-92 C2 条款 | `FACT` |
| NAVIGATION_SURVEILLANCE_GAP | 通信导航监视能力不足 | G9/G7 | 条例第二十七条申请内容；运行要求 | `FACT` |
| EMERGENCY_PROCEDURE_GAP | 应急处置程序缺失或不被接受 | G9 | 条例第二十七条（十一） | `FACT` |
| EVIDENCE_INCOMPLETE | 材料不足以证明符合性 | 多 Gate | 申请补正规则（CCAR-92 等） | `INTERPRETATION` |
| APPLICATION_FORMAT_GAP | 格式/字段/平台填报错误 | G9 | 平台与申请书格式要求 | `INTERPRETATION` |
| LOCAL_COORDINATION_GAP | 地方协调/场地/活动主办方文件缺失 | G10 | 地方实践；非全国统一规则 | `CASE`/`UNKNOWN` |
| UNKNOWN | 现有事实无法定位 | — | — | `UNKNOWN` |

---

## Decision notes

1. **同一症状可多根因并存。** 例如未登记 + 无保险 + 空域不符。  
2. **“无需飞行活动申请”仍可因其他根因飞不了。**  
3. **地方协调失败 ≠ 全国禁止该机型。**  
4. **TC 项目成功 ≠ 客户运营场景自动合法。**

---

## Mapping to customer language

| Customer says | First hypotheses to test |
| ------------- | ------------------------ |
| 平台不让提交 | APPLICATION_FORMAT_GAP / EVIDENCE_INCOMPLETE / REGISTRATION_GAP |
| 空域是红的 | AIRSPACE_RESTRICTION |
| 没有证 | AIRWORTHINESS_GAP 或 OPERATOR_CERTIFICATE_GAP（先分清） |
| 飞手证不够 | PILOT_QUALIFICATION_GAP |
| 联不上网 / 没数据 | UOM_CONNECTIVITY_GAP / RID_GAP / C2_GAP |
| 别人同款机能飞 | 查 CASE_SPECIFIC 差异；禁止直接复制 |
