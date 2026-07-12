"""Identify a WAV clip with ACRCloud music recognition (AVR / data_type=audio)."""

from __future__ import annotations

import json
import os
import sys


def fail(message: str) -> None:
    print(json.dumps({"status": {"code": 2010, "msg": message}}, ensure_ascii=False))
    raise SystemExit(1)


try:
    from acrcloud.recognizer import ACRCloudRecognizer, ACRCloudRecognizeType
except Exception as error:  # pragma: no cover - environment diagnostic
    fail(
        "ACRCloud SDK is unavailable. Install it with "
        "'python -m pip install pyacrcloud'. "
        f"Details: {error}"
    )


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

    recognizer = ACRCloudRecognizer({
        "host": host,
        "access_key": access_key,
        "access_secret": access_secret,
        "timeout": 15,
        "protocol": protocol,
        "recognize_type": ACRCloudRecognizeType.ACR_OPT_REC_AUDIO,
    })
    # Second arg is start offset (seconds); third is duration to send.
    # Use a generous duration so short clips are fully submitted.
    raw = recognizer.recognize_by_filebuffer(wav_audio, 0, 20)
    payload = json.loads(raw) if isinstance(raw, str) else raw
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
