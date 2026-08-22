#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from datetime import datetime

API_URL = "https://api.tokfai.com/v1/responses"

ALLOW_EXT = {
    ".c", ".h", ".cpp", ".hpp", ".cc", ".hh",
    ".py", ".m", ".txt", ".md", ".log", ".json", ".csv"
}

SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", ".next",
    "vendor", "target", "__pycache__"
}

def die(code: str, msg: str, exit_code: int = 1) -> None:
    print(code)
    print(msg)
    raise SystemExit(exit_code)

def collect_files(root: Path, max_files: int) -> list[Path]:
    if not root.exists():
        die("ERROR_PATH_NOT_FOUND", f"path not found: {root}")

    if root.is_file():
        return [root]

    out = []
    for p in root.rglob("*"):
        if len(out) >= max_files:
            break
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if p.suffix.lower() not in ALLOW_EXT:
            continue
        out.append(p)

    return out

def read_file(p: Path, per_file_limit: int = 40000) -> str:
    try:
        text = p.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        return f"[READ_FAILED] {e}"
    return text.replace("\x00", "")[:per_file_limit]

def build_material(files: list[Path], max_chars: int):
    blocks = []
    summary = []
    total = 0

    for p in files:
        text = read_file(p)
        if not text.strip():
            continue

        remain = max_chars - total
        if remain <= 0:
            break

        clipped = text[:remain]
        total += len(clipped)
        summary.append((str(p), len(clipped)))

        blocks.append(
            f"\n\n===== FILE: {p} =====\n"
            f"CHARS={len(clipped)}\n"
            f"```text\n{clipped}\n```"
        )

    return "\n".join(blocks), summary

def extract_text(x):
    out = []
    if isinstance(x, dict):
        for k, v in x.items():
            if k in ("text", "output_text") and isinstance(v, str):
                out.append(v)
            else:
                out.extend(extract_text(v))
    elif isinstance(x, list):
        for i in x:
            out.extend(extract_text(i))
    return out

def main() -> int:
    parser = argparse.ArgumentParser(description="Tokfai UAV customer file intake script")
    parser.add_argument("--path", required=True)
    parser.add_argument("--question", required=True)
    parser.add_argument("--model", default="gpt-5.5")
    parser.add_argument("--out", default="tokfai-uav-diagnosis.md")
    parser.add_argument("--max-files", type=int, default=80)
    parser.add_argument("--max-chars", type=int, default=180000)
    args = parser.parse_args()

    api_key = os.environ.get("TOKFAI_API_KEY", "").strip()
    if not api_key:
        die(
            "ERROR_MISSING_TOKFAI_API_KEY",
            "Please run: export TOKFAI_API_KEY='sk-tokfai_xxx'"
        )

    target = Path(args.path)
    files = collect_files(target, args.max_files)
    material, summary = build_material(files, args.max_chars)

    if not material.strip():
        die("ERROR_NO_READABLE_CONTENT", "No readable supported files were found.")

    print("TOKFAI_UAV_INTAKE_START")
    print(f"FILE_COUNT={len(summary)}")
    print(f"TOTAL_CHARS={len(material)}")
    print(f"MODEL={args.model}")

    file_list = "\n".join([f"- {p} ({n} chars)" for p, n in summary])

    prompt = f"""
你是无人机飞控/航飞材料分析工程师。

重要：
- 必须基于下面已经提供的文件内容分析。
- 不要说“我将读取文件”。
- 不要说“需要你上传文件”。
- 文件内容已经在 prompt 中。
- 不确定的地方写 NOT_FOUND。
- 不承诺审批一定通过。
- 不编造不存在的函数、变量、接口。

用户问题：
{args.question}

已读取文件清单：
{file_list}

请按以下结构输出：

1. 结论摘要
2. 已读取文件清单
3. 关键入口函数/模块
4. 飞控链路：任务调度 -> 姿态控制 -> 分配/mix -> 电机/舵面输出
5. 姿态/角速度/油门/电机/安全边界证据
6. 上下游调用关系
7. 当前缺口
8. 下一步建议
9. 最后一行写 TOKFAI_P1284_CLIENT_INTAKE_DONE

文件内容如下：
{material}
"""

    payload = {
        "model": args.model,
        "input": prompt,
        "stream": False,
    }

    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    out_path = Path(args.out)
    raw_path = Path(str(out_path) + ".raw.json")

    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            body = r.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="ignore")
        print(f"ERROR_HTTP_{e.code}")
        print(err[:2000])
        if e.code == 401:
            print("AUTH_ERROR: check Authorization Bearer token / TOKFAI_API_KEY")
        elif e.code == 413:
            print("BODY_TOO_LARGE: reduce --max-chars or --max-files")
        elif e.code == 429:
            print("RATE_LIMIT_OR_BUSY: retry later")
        elif e.code >= 500:
            print("UPSTREAM_OR_SERVER_ERROR")
        return 1
    except Exception as e:
        print("ERROR_NETWORK_OR_RUNTIME")
        print(str(e))
        return 1

    raw_path.write_text(body, encoding="utf-8")

    try:
        parsed = json.loads(body)
        texts = extract_text(parsed)
        result = "\n\n".join(texts).strip()
    except Exception:
        result = ""

    if not result:
        result = body

    header = (
        f"# Tokfai UAV Diagnosis\n\n"
        f"- generated_at: {datetime.now().isoformat(timespec='seconds')}\n"
        f"- model: {args.model}\n"
        f"- source_path: {args.path}\n"
        f"- file_count: {len(summary)}\n"
        f"- total_chars: {len(material)}\n\n"
    )

    out_path.write_text(header + result, encoding="utf-8")

    print(f"WROTE={out_path}")
    print(f"RAW={raw_path}")
    print("TOKFAI_P1284_CLIENT_INTAKE_DONE")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
