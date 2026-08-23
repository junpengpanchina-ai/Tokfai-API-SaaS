#!/usr/bin/env python3
"""Tokfai UAV customer file intake — upload local files to admin/aviation API."""
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_BASE_URL = "https://api.tokfai.com/admin/aviation"

ALLOW_EXT = {
    ".pdf",
    ".txt",
    ".md",
    ".log",
    ".json",
    ".csv",
    ".c",
    ".h",
    ".cpp",
    ".hpp",
    ".cc",
    ".hh",
    ".py",
    ".m",
}

SKIP_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "vendor",
    "target",
    "__pycache__",
}

SKIP_FILES = {".DS_Store"}


def die(code: str, msg: str, exit_code: int = 1) -> None:
    print(code)
    print(msg)
    raise SystemExit(exit_code)


def mask_api_key(key: str) -> str:
    if len(key) <= 12:
        return key[:2] + "..."
    return key[:8] + "..." + key[-4:]


def normalize_api_key(key: str) -> str:
    key = key.strip()
    if key.lower().startswith("bearer "):
        return key[7:].strip()
    return key


def authorization_header(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}"}


def parse_json_body(raw: str) -> Any:
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


def api_error_code(payload: Any) -> str:
    if isinstance(payload, dict):
        err = payload.get("error")
        if isinstance(err, str):
            return err
        if isinstance(err, dict) and isinstance(err.get("code"), str):
            return err["code"]
    return ""


def handle_http_error(status: int, body: str) -> None:
    payload = parse_json_body(body)
    code = api_error_code(payload)

    if status == 401:
        print("AUTH_ERROR")
        print("Check --api-key or TOKFAI_API_KEY (Bearer sk-tokfai_...).")
        die("AUTH_ERROR", body[:2000], 1)

    if status == 413:
        print("FILE_TOO_LARGE")
        die("FILE_TOO_LARGE", "Single file exceeds 50MB limit.", 1)

    if status == 415:
        print("UNSUPPORTED_FILE_TYPE")
        die("UNSUPPORTED_FILE_TYPE", body[:2000], 1)

    if status == 422 and code == "NO_EXTRACTED_TEXT":
        print("NO_EXTRACTED_TEXT")
        print(
            "No readable text was extracted. The file may be a scanned PDF, "
            "image-only PDF, empty file, or unsupported format."
        )
        if isinstance(payload, dict):
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        die("NO_EXTRACTED_TEXT", "", 1)

    if code == "MODEL_AUTH_ERROR":
        print("MODEL_AUTH_ERROR")
        die("MODEL_AUTH_ERROR", body[:2000], 1)

    if status == 429:
        print("RATE_LIMIT_OR_BUSY")
        die("RATE_LIMIT_OR_BUSY", body[:2000], 1)

    if status >= 500:
        print("UPSTREAM_OR_SERVER_ERROR")
        die("UPSTREAM_OR_SERVER_ERROR", body[:2000], 1)

    die(f"ERROR_HTTP_{status}", body[:2000], 1)


def http_request_raw(
    url: str,
    api_key: str,
    method: str = "GET",
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 300,
) -> tuple[int, str, dict[str, str]]:
    hdrs = authorization_header(api_key)
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body, dict(resp.headers)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        return e.code, err_body, dict(e.headers)
    except urllib.error.URLError as e:
        die("ERROR_NETWORK", str(e.reason), 1)
    except Exception as e:
        die("ERROR_NETWORK_OR_RUNTIME", str(e), 1)
    return 0, "", {}


def http_request(
    url: str,
    api_key: str,
    method: str = "GET",
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 300,
) -> tuple[int, str, dict[str, str]]:
    status, body, resp_headers = http_request_raw(
        url, api_key, method=method, data=data, headers=headers, timeout=timeout
    )
    if status >= 400:
        handle_http_error(status, body)
    return status, body, resp_headers


def encode_multipart_file(field_name: str, filename: str, file_bytes: bytes) -> tuple[str, bytes]:
    boundary = "----TokfaiUav" + os.urandom(16).hex()
    prefix = (
        f"--{boundary}\r\n"
        f"Content-Disposition: form-data; name=\"{field_name}\"; filename=\"{filename}\"\r\n"
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode("utf-8")
    suffix = f"\r\n--{boundary}--\r\n".encode("utf-8")
    body = prefix + file_bytes + suffix
    content_type = f"multipart/form-data; boundary={boundary}"
    return content_type, body


def should_skip_path(path: Path) -> bool:
    if path.name in SKIP_FILES:
        return True
    return any(part in SKIP_DIRS for part in path.parts)


def collect_files(root: Path, max_files: int) -> list[Path]:
    if not root.exists():
        die("ERROR_PATH_NOT_FOUND", f"path not found: {root}")

    if root.is_file():
        return [root]

    out: list[Path] = []
    for p in root.rglob("*"):
        if len(out) >= max_files:
            break
        if not p.is_file():
            continue
        if should_skip_path(p):
            continue
        if p.suffix.lower() not in ALLOW_EXT:
            continue
        out.append(p)

    return sorted(out)


def join_url(base: str, suffix: str) -> str:
    return base.rstrip("/") + "/" + suffix.lstrip("/")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Tokfai UAV customer file intake — upload and analyze via admin/aviation API"
    )
    parser.add_argument("--path", required=True, help="File or folder path (drag into terminal)")
    parser.add_argument("--question", required=True, help="Customer question for diagnosis")
    parser.add_argument("--api-key", default="", help="Tokfai API key (sk-tokfai_...)")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Aviation intake API base (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument("--out", default="tokfai-uav-diagnosis.md", help="Output report path")
    parser.add_argument("--max-files", type=int, default=80, help="Max files from folder scan")
    args = parser.parse_args()

    api_key = normalize_api_key(
        (args.api_key or "").strip() or os.environ.get("TOKFAI_API_KEY", "").strip()
    )
    if not api_key:
        die(
            "ERROR_MISSING_TOKFAI_API_KEY",
            "Please run: export TOKFAI_API_KEY='sk-tokfai_xxx'",
        )

    base_url = args.base_url.strip().rstrip("/")
    target = Path(args.path).expanduser()
    files = collect_files(target, args.max_files)
    file_count = len(files)

    print("TOKFAI_UAV_INTAKE_START")
    print(f"API_KEY={mask_api_key(api_key)}")
    print(f"BASE_URL={base_url}")
    print(f"FILE_COUNT={file_count}")

    if file_count == 0:
        die(
            "ERROR_NO_FILES",
            "No supported files found. Supported: "
            + ", ".join(sorted(ALLOW_EXT)),
        )

    # 1. Create job
    status, body, _ = http_request(
        join_url(base_url, "jobs"),
        api_key,
        method="POST",
        data=b"{}",
        headers={"Content-Type": "application/json"},
    )
    job_payload = parse_json_body(body)
    if not isinstance(job_payload, dict) or not job_payload.get("jobId"):
        die("ERROR_CREATE_JOB", body[:2000])
    job_id = str(job_payload["jobId"])
    print(f"JOB_ID={job_id}")

    # 2. Upload files
    uploaded_count = 0
    for fp in files:
        try:
            file_bytes = fp.read_bytes()
        except OSError as e:
            print(f"SKIP_READ_FAILED={fp}")
            print(str(e))
            continue

        content_type, multipart_body = encode_multipart_file("file", fp.name, file_bytes)
        upload_url = join_url(base_url, f"jobs/{job_id}/files")
        status, upload_body, _ = http_request_raw(
            upload_url,
            api_key,
            method="POST",
            data=multipart_body,
            headers={"Content-Type": content_type},
            timeout=600,
        )
        if status == 401:
            handle_http_error(status, upload_body)
        if status == 413:
            print("FILE_TOO_LARGE")
            die("FILE_TOO_LARGE", f"File too large: {fp.name}", 1)
        if status == 415:
            print(f"UNSUPPORTED_FILE_TYPE={fp.name}")
            continue
        if status == 429:
            handle_http_error(status, upload_body)
        if status >= 500:
            handle_http_error(status, upload_body)
        if status >= 400:
            print(f"UPLOAD_FAILED={fp.name}")
            print(upload_body[:2000])
            continue
        uploaded_count += 1

    print(f"UPLOADED_COUNT={uploaded_count}")

    if uploaded_count == 0:
        die("ERROR_NO_UPLOADS", "No files were uploaded successfully.")

    # 3. Analyze (question stored in client report header; server uses uploaded file extract)
    analyze_url = join_url(base_url, f"jobs/{job_id}/analyze")
    analyze_payload = json.dumps(
        {"question": args.question},
        ensure_ascii=False,
    ).encode("utf-8")
    status, analyze_body, _ = http_request(
        analyze_url,
        api_key,
        method="POST",
        data=analyze_payload,
        headers={"Content-Type": "application/json"},
        timeout=600,
    )
    analyze_result = parse_json_body(analyze_body)
    analyze_status = "unknown"
    if isinstance(analyze_result, dict):
        analyze_status = str(analyze_result.get("status", analyze_status))
    print(f"ANALYZE_STATUS={analyze_status}")

    # 4. Fetch status
    status_url = join_url(base_url, f"jobs/{job_id}/status")
    _, status_body, _ = http_request(
        status_url,
        api_key,
        method="GET",
        timeout=300,
    )
    status_payload = parse_json_body(status_body)
    if isinstance(status_payload, dict):
        print(f"JOB_STATUS={status_payload.get('status', 'unknown')}")

    # 5. Fetch result
    result_url = join_url(base_url, f"jobs/{job_id}/result")
    status, result_body, resp_headers = http_request(
        result_url,
        api_key,
        method="GET",
        timeout=300,
    )

    content_type = ""
    for k, v in resp_headers.items():
        if k.lower() == "content-type":
            content_type = v.lower()
            break

    out_path = Path(args.out)
    raw_path = Path(str(out_path) + ".raw.json")

    if "application/json" in content_type:
        raw_path.write_text(result_body, encoding="utf-8")
        payload = parse_json_body(result_body)
        code = api_error_code(payload)
        if code == "NO_DIAGNOSIS_RESULT":
            print("NO_DIAGNOSIS_RESULT")
            if isinstance(payload, dict):
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            die("NO_DIAGNOSIS_RESULT", "", 1)
        die("ERROR_RESULT", result_body[:2000], 1)

    header = (
        f"# Tokfai UAV Diagnosis\n\n"
        f"- job_id: {job_id}\n"
        f"- question: {args.question}\n"
        f"- source_path: {args.path}\n"
        f"- file_count: {file_count}\n"
        f"- uploaded_count: {uploaded_count}\n"
        f"- analyze_status: {analyze_status}\n\n"
    )
    out_path.write_text(header + result_body, encoding="utf-8")
    raw_path.write_text(analyze_body, encoding="utf-8")

    print(f"WROTE={out_path}")
    print("TOKFAI_P1284_CLIENT_INTAKE_DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
