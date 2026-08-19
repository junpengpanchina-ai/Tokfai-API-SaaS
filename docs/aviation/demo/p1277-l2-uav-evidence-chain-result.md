# P1277-R1 — UAV Evidence Chain L2 Verification Result

```text
TOKFAI_P1277_L2_UAV_EVIDENCE_CHAIN_DONE
CANARY=TOKFAI_L2_UAV_20260819_235331
SCOPE=docs/aviation/demo + docs/aviation/README only
APPLICATION_CODE_CHANGED=NO
```

## 1. 验证目标

本轮不是继续写行业文章，而是验证 Tokfai 是否能把无人机客户材料转成证据链。

核心路径：

```text
客户材料 -> 字段抽取 -> 审批/驳回 -> 飞控/姿态 -> 环境/可靠性 -> 缺口 -> Tokfai 可交付
```

## 2. 输入文件

- docs/aviation/42-uav-war-to-commercial-system-map.md
- docs/aviation/43-commercial-uav-precision-stack.md
- docs/aviation/44-tokfai-uav-operating-system-entrypoints.md
- docs/aviation/demo/sample-flight-approval-rejection.md
- docs/aviation/demo/sample-uav-device-params.md
- docs/aviation/demo/sample-flight-log-excerpt.md
- docs/aviation/demo/sample-evidence-output.md

## 3. L2 验证结论

Tokfai 可以把无人机客户材料拆成五层证据：

| 层级 | 说明 | Tokfai 可交付 |
|---|---|---|
| 审批/驳回 | 空域、材料、风险、口径不一致 | 驳回原因拆解表 |
| 飞控/姿态 | 控制链路、姿态控制、mix/allocation | 工程解释稿 |
| 环境/可靠性 | 高温、低温、强风、GNSS、链路中断 | 环境适应性核对表 |
| 证据链 | 文件、字段、日志、截图、结论 | Evidence Row |
| 商业转化 | 客户不知道怎么补材料 | 补件建议和交付报告 |

## 4. 反推逻辑

商业无人机不能只看参数，要反推任务函数：

```text
任务目标 -> 环境约束 -> 飞控能力 -> 姿态控制 -> 分配/mix -> 安全边界 -> 审批材料
```

战争无人机能在高温、低温、强风、弱 GNSS、复杂地形、链路中断下执行任务，本质不是宣传点，而是工程可靠性证据。

Tokfai 要做的是把这套工程证据转成商业客户可提交、可解释、可复盘的材料链。

## 5. Tokfai 可交付

- 客户资料读取结果
- 审批驳回原因表
- 飞控/姿态控制解释稿
- 环境适应性核对表
- 证据链 Evidence Row
- 补件建议
- 客户沟通稿

## 6. 不承诺事项

- 不承诺审批一定通过
- 不替代监管、空管、民航、军方或当地主管部门判断
- 不输出武器化、攻击性、规避监管方案
- 不把客户资料外发到不可控第三方

## 7. 最后一行

TOKFAI_L2_UAV_20260819_235331
