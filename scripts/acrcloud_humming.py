"""Generate an ACRCloud humming fingerprint and submit only that fingerprint."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request
import uuid


def fail(message: str) -> None:
    print(json.dumps({"status": {"code": 2010, "msg": message}}))
    raise SystemExit(1)


try:
    from acrcloud import acrcloud_extr_tool
except Exception as error:  # pragma: no cover - environment diagnostic
    fail(
        "ACRCloud humming SDK is unavailable. Install it with "
        "'python -m pip install git+https://github.com/acrcloud/acrcloud_sdk_python'. "
        f"Details: {error}"
    )


def multipart_body(fields: dict[str, str], files: dict[str, bytes]) -> tuple[str, bytes]:
    boundary = f"----lost-found-acrcloud-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode(),
                b"\r\n",
            ]
        )
    for name, value in files.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                (
                    f'Content-Disposition: form-data; name="{name}"; '
                    f'filename="{name}.fp"\r\n'
                ).encode(),
                b"Content-Type: application/octet-stream\r\n\r\n",
                value,
                b"\r\n",
            ]
        )
    chunks.append(f"--{boundary}--\r\n".encode())
    return f"multipart/form-data; boundary={boundary}", b"".join(chunks)


def main() -> None:
    if len(sys.argv) != 2:
        fail("Expected one WAV file path")

    host = os.environ.get("ACRCLOUD_HOST", "").strip()
    for prefix in ("https://", "http://"):
        if host.startswith(prefix):
            host = host[len(prefix):]
    host = host.rstrip("/")
    access_key = os.environ.get("ACRCLOUD_ACCESS_KEY", "")
    access_secret = os.environ.get("ACRCLOUD_ACCESS_SECRET", "")
    protocol = os.environ.get("ACRCLOUD_PROTOCOL", "https")
    if not host or not access_key or not access_secret:
        fail("Missing ACRCLOUD_HOST / ACRCLOUD_ACCESS_KEY / ACRCLOUD_ACCESS_SECRET")

    with open(sys.argv[1], "rb") as wav_file:
        wav_audio = wav_file.read()
    fingerprint = acrcloud_extr_tool.create_humming_fingerprint(wav_audio)
    if not fingerprint:
        fail("Unable to generate humming fingerprint from this clip")

    timestamp = str(time.time())
    data_type = "fingerprint"
    signing = "\n".join(
        ["POST", "/v1/identify", access_key, data_type, "1", timestamp]
    )
    signature = base64.b64encode(
        hmac.new(
            access_secret.encode("ascii"),
            signing.encode("ascii"),
            hashlib.sha1,
        ).digest()
    ).decode("ascii")

    content_type, body = multipart_body(
        {
            "access_key": access_key,
            "sample_hum_bytes": str(len(fingerprint)),
            "timestamp": timestamp,
            "signature": signature,
            "data_type": data_type,
            "signature_version": "1",
        },
        {"sample_hum": fingerprint},
    )
    request = urllib.request.Request(
        f"{protocol}://{host}/v1/identify",
        data=body,
        method="POST",
        headers={"Content-Type": content_type, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
