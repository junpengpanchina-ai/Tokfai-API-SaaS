# Aviation — File Capability Matrix

Status: **骨架 / PLANNED**  
只允许把**已验证**项标 PASS。其余 UNKNOWN 或 PLANNED。

验证语境（若 PASS）：old Codex CLI → Tokfai `/v1/responses` → 模型返回 tool_calls → 客户端本地读写。  
**不是** Tokfai 服务端读文件。

| File Type | Discover | Read | Parse | Search | Modify | Validate | Status |
|-----------|---------:|-----:|------:|-------:|-------:|---------:|--------|
| TXT | PASS* | PASS* | — | UNKNOWN | PASS* | — | VERIFIED*（P1120 SESSION 文件 token roundtrip；脚本未入库） |
| Markdown | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| PDF | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PLANNED |
| DOCX | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PLANNED |
| XLSX | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PLANNED |
| Matlab `.m` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PLANNED |
| Simulink | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PLANNED |
| C/C++ | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PLANNED |
| test reports | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PLANNED |
| certification docs | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | PLANNED |

\*PASS 附带条件：会话证据（2026-08 P1120 gemini-3-pro canary）。**P1123R2 未提供可审计独立矩阵（PARTIAL）。** 改默认推荐前须重跑 canary。

## Evidence

- `docs/codex-history/05-real-codex-model-matrix.md`
- `docs/codex-cli-tokfai.md` §6
