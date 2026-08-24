# P1284 — 客户本地一键上传分析脚本

客户把文件或文件夹 **拖文件到终端**（拖到终端窗口即可）后，用本脚本把材料上传到 Tokfai 服务端 intake API，由服务端抽取 PDF/文本并调用模型分析，结果保存为本地 Markdown 报告。

**脚本路径：** `scripts/aviation/tokfai-uav-intake.py`

**默认 API：** `https://api.tokfai.com/admin/aviation`

**依赖：** 仅 Python 3 标准库，无需安装 poppler / pdftotext；PDF 抽取由 Tokfai 服务端完成。

---

## 支持的文件类型

`.pdf` `.txt` `.md` `.log` `.json` `.csv` `.c` `.h` `.cpp` `.hpp` `.cc` `.hh` `.py` `.m`

也可传入 `.zip` 工程包：脚本会在本地安全解压，再收集其中符合白名单的文件上传（不解压 xlsx/docx/pptx 等未支持格式）。

扫描文件夹或 zip 时会跳过：`node_modules` `.git` `dist` `build` `.next` `vendor` `target` `__pycache__` `.idea` `.vscode` `__MACOSX` `.DS_Store`

---

## 三种客户用法

### A. 拖单个文件到终端

在 macOS Terminal 中，把 PDF 或源码文件拖到窗口，路径会自动带上引号（支持中文与空格）：

```bash
python3 scripts/aviation/tokfai-uav-intake.py \
  --path "/Users/客户/资料/飞控说明.pdf" \
  --question "这份材料里姿态控制与电机输出边界在哪里？" \
  --api-key "sk-tokfai_xxxxxxxx"
```

若 `--path` 是单个文件，只上传该文件。

### B. 拖整个代码文件夹到终端

把整个工程目录拖到终端（路径可含空格）：

```bash
python3 scripts/aviation/tokfai-uav-intake.py \
  --path "/Users/客户/Projects/uav-fc" \
  --question "请梳理飞控链路：任务调度到电机输出的关键模块与缺口" \
  --api-key "sk-tokfai_xxxxxxxx" \
  --max-files 80 \
  --out tokfai-uav-diagnosis.md
```

脚本会递归收集支持的文件类型（默认最多 80 个），逐个上传后分析。

### C. 上传 zip 工程包

`--path` 指向 `.zip` 时，脚本在本地临时目录安全解压，再收集白名单内文件上传：

```bash
python3 scripts/aviation/tokfai-uav-intake.py \
  --path /path/to/project.zip \
  --question "请分析这个无人机工程包，重点看控制链路、姿态环、任务调度、电机输出和安全边界"
```

zip 限制：单成员 ≤ 50MB，总解压 ≤ 300MB，文件数 ≤ `--max-files`。不支持的成员跳过，不中断整个流程。

### D. 使用环境变量保存 API Key

避免在命令行重复输入密钥：

```bash
export TOKFAI_API_KEY='sk-tokfai_xxxxxxxx'

python3 scripts/aviation/tokfai-uav-intake.py \
  --path "/Users/客户/拖进来的文件夹" \
  --question "客户问题"
```

API Key 优先级：`--api-key` 参数 > 环境变量 `TOKFAI_API_KEY`。若都没有，脚本输出 `ERROR_MISSING_TOKFAI_API_KEY` 并提示设置环境变量。

日志中不会打印完整 API Key，仅显示前 8 位与后 4 位。

---

## 可选参数

| 参数 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `--path` | 是 | — | 文件、文件夹或 `.zip` 路径 |
| `--question` | 是 | — | 客户问题（写入本地报告头） |
| `--api-key` | 否 | 环境变量 | `sk-tokfai_...` |
| `--base-url` | 否 | `https://api.tokfai.com/admin/aviation` | Intake API 根路径 |
| `--out` | 否 | `tokfai-uav-diagnosis.md` | 诊断报告输出路径 |
| `--max-files` | 否 | `80` | 文件夹扫描上限 |

---

## 上传与分析流程

1. `POST /jobs` — 创建 job
2. `POST /jobs/:jobId/files` — 逐个 multipart 上传（字段名 `file`）
3. `POST /jobs/:jobId/analyze` — 服务端抽取文本并调用模型（仅在有足够可读文本时扣模型费）
4. `GET /jobs/:jobId/result` — 拉取 `diagnosis.md` 内容
5. 保存到 `--out`（并附带 `.raw.json` 分析元数据）

---

## 成功输出示例

```text
TOKFAI_UAV_INTAKE_START
API_KEY=sk-tokfa...xxxx
BASE_URL=https://api.tokfai.com/admin/aviation
ZIP_MODE=false
FILE_COUNT=12
JOB_ID=av_...
UPLOADED_COUNT=12
ANALYZE_STATUS=analyzed
WROTE=tokfai-uav-diagnosis.md
TOKFAI_P1284_CLIENT_INTAKE_DONE
```

zip 模式额外输出：

```text
ZIP_MODE=true
ZIP_TOTAL_MEMBERS=42
ZIP_EXTRACTED_FILES=12
ZIP_SKIPPED_FILES=30
```

---

## 错误码（脚本输出）

| 输出 | 含义 |
|------|------|
| `AUTH_ERROR` | 401 — Token 缺失或无效 |
| `ERROR_ZIP_NO_SUPPORTED_FILES` | zip 内无白名单可上传文件 |
| `ERROR_ZIP_INVALID` | zip 文件损坏或无法读取 |
| `FILE_TOO_LARGE` | 413 — 单文件超过 50MB |
| `UNSUPPORTED_FILE_TYPE` | 415 — 扩展名不在支持列表 |
| `NO_EXTRACTED_TEXT` | 422 — 无可读文本（扫描 PDF、图片 PDF、空文件、不支持格式）；**不会继续扣模型费** |
| `RATE_LIMIT_OR_BUSY` | 429 — 限流或繁忙 |
| `UPSTREAM_OR_SERVER_ERROR` | 5xx — 服务端或上游错误 |

`NO_EXTRACTED_TEXT` 时脚本会提示：文件可能是扫描件 PDF、图片 PDF、空文件或不支持格式，请换可读 PDF 或文本源码后重试。

---

## 本地校验

```bash
python3 -m py_compile scripts/aviation/tokfai-uav-intake.py
```
