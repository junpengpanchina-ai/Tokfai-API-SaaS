#!/usr/bin/env python3
"""Tokfai UAV customer file intake — upload local files to admin/aviation API."""
from __future__ import annotations

import argparse
import json
import os
import tempfile
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import datetime
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
    ".idea",
    ".vscode",
    "__MACOSX",
}

SKIP_FILES = {".DS_Store"}

MAX_MEMBER_BYTES = 50 * 1024 * 1024
MAX_ZIP_TOTAL_BYTES = 300 * 1024 * 1024


@dataclass
class ZipExtractResult:
    files: list[Path]
    total_members: int
    extracted_files: int
    skipped_files: int
    temp_dir: tempfile.TemporaryDirectory[str]


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


def is_zip_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() == ".zip"


def zip_member_is_unsafe(member_name: str) -> bool:
    normalized = member_name.replace("\\", "/")
    if normalized.startswith("/"):
        return True
    if len(normalized) > 1 and normalized[1] == ":":
        return True
    parts = Path(normalized).parts
    return ".." in parts


def should_skip_zip_member(member_name: str) -> bool:
    normalized = member_name.replace("\\", "/")
    parts = Path(normalized).parts
    if Path(normalized).name in SKIP_FILES:
        return True
    return any(part in SKIP_DIRS for part in parts)


def safe_zip_dest(dest_root: Path, member_name: str) -> Path | None:
    rel = Path(member_name.replace("\\", "/"))
    if rel.is_absolute() or ".." in rel.parts:
        return None
    dest = (dest_root / rel).resolve()
    root = dest_root.resolve()
    try:
        dest.relative_to(root)
    except ValueError:
        return None
    return dest


def extract_zip_members(zip_path: Path, max_files: int) -> ZipExtractResult:
    temp_dir = tempfile.TemporaryDirectory(prefix="tokfai-uav-")
    dest_root = Path(temp_dir.name).resolve()
    extracted: list[Path] = []
    skipped = 0
    total_bytes = 0
    total_members = 0

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for info in zf.infolist():
                if info.is_dir() or info.filename.endswith("/"):
                    continue
                total_members += 1

                member_name = info.filename
                if zip_member_is_unsafe(member_name):
                    skipped += 1
                    continue
                if should_skip_zip_member(member_name):
                    skipped += 1
                    continue
                if Path(member_name).suffix.lower() not in ALLOW_EXT:
                    skipped += 1
                    continue
                if info.file_size > MAX_MEMBER_BYTES:
                    skipped += 1
                    continue
                if len(extracted) >= max_files:
                    skipped += 1
                    continue
                if total_bytes + info.file_size > MAX_ZIP_TOTAL_BYTES:
                    skipped += 1
                    continue

                dest = safe_zip_dest(dest_root, member_name)
                if dest is None:
                    skipped += 1
                    continue

                dest.parent.mkdir(parents=True, exist_ok=True)
                written = 0
                try:
                    with zf.open(info, "r") as src, open(dest, "wb") as dst:
                        while True:
                            chunk = src.read(1024 * 1024)
                            if not chunk:
                                break
                            written += len(chunk)
                            if written > MAX_MEMBER_BYTES:
                                raise ValueError("member exceeds size limit")
                            dst.write(chunk)
                except (OSError, ValueError, zipfile.BadZipFile):
                    if dest.exists():
                        dest.unlink(missing_ok=True)
                    skipped += 1
                    continue

                total_bytes += written
                extracted.append(dest)
    except zipfile.BadZipFile as e:
        temp_dir.cleanup()
        die("ERROR_ZIP_INVALID", str(e), 1)

    return ZipExtractResult(
        files=sorted(extracted),
        total_members=total_members,
        extracted_files=len(extracted),
        skipped_files=skipped,
        temp_dir=temp_dir,
    )


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


def resolve_input_files(target: Path, max_files: int) -> tuple[list[Path], ZipExtractResult | None]:
    if is_zip_file(target):
        zip_result = extract_zip_members(target, max_files)
        if not zip_result.files:
            zip_result.temp_dir.cleanup()
            die(
                "ERROR_ZIP_NO_SUPPORTED_FILES",
                "Zip archive contains no supported files after filtering.",
            )
        return zip_result.files, zip_result
    return collect_files(target, max_files), None


def default_output_path() -> str:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"tokfai-uav-diagnosis-{stamp}.md"


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
    parser.add_argument(
        "--out",
        default=None,
        help="Output report path (default: tokfai-uav-diagnosis-YYYYMMDD-HHMMSS.md)",
    )
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
    out_path = Path(args.out) if args.out is not None else Path(default_output_path())
    target = Path(args.path).expanduser()

    zip_result: ZipExtractResult | None = None
    try:
        files, zip_result = resolve_input_files(target, args.max_files)
        file_count = len(files)

        print("TOKFAI_UAV_INTAKE_START")
        print(f"API_KEY={mask_api_key(api_key)}")
        print(f"BASE_URL={base_url}")
        print(f"OUT_PATH={out_path}")
        print(f"ZIP_MODE={'true' if zip_result else 'false'}")
        if zip_result:
            print(f"ZIP_TOTAL_MEMBERS={zip_result.total_members}")
            print(f"ZIP_EXTRACTED_FILES={zip_result.extracted_files}")
            print(f"ZIP_SKIPPED_FILES={zip_result.skipped_files}")
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
    finally:
        if zip_result is not None:
            zip_result.temp_dir.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
