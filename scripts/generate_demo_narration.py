from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import soundfile as sf
import torch
from huggingface_hub import model_info
from qwen_tts import Qwen3TTSModel


MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"
INSTRUCTION = (
    "차분하고 또렷한 제품 데모 내레이션입니다. "
    "과장된 광고 말투를 피하고, 신뢰감 있게 보통 속도로 말합니다."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate REIN's Korean demo narration with Qwen3-TTS.")
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--speaker", default="Sohee", choices=["Sohee"])
    parser.add_argument("--batch-size", type=int, default=2, choices=range(1, 5))
    parser.add_argument("--runtime-commit", required=True)
    parser.add_argument("--segment-id", action="append", default=[])
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    edit_dir = repo_root / "output" / "video" / "edit"
    segments_path = edit_dir / "narration-segments.json"
    output_dir = edit_dir / "narration"
    manifest_path = edit_dir / "narration-manifest.json"
    narration_text_path = edit_dir / "narration-ko.txt"
    segments = json.loads(segments_path.read_text(encoding="utf-8"))
    output_dir.mkdir(parents=True, exist_ok=True)

    requested_ids = {str(segment_id).zfill(2) for segment_id in args.segment_id}
    known_ids = {str(segment["id"]) for segment in segments}
    unknown_ids = requested_ids - known_ids
    if unknown_ids:
        raise ValueError(f"Unknown narration segment ids: {sorted(unknown_ids)}")
    pending = [
        segment
        for segment in segments
        if args.force
        or str(segment["id"]) in requested_ids
        or not (output_dir / f"{segment['id']}.wav").is_file()
    ]

    device = "cpu"
    dtype = torch.float32
    torch.set_num_threads(min(12, max(1, torch.get_num_threads())))
    torch.manual_seed(20260721)
    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID,
        device_map=device,
        dtype=dtype,
        attn_implementation="sdpa",
    )
    supported = {speaker.lower() for speaker in model.get_supported_speakers()}
    if args.speaker.lower() not in supported:
        raise RuntimeError(f"Native Korean speaker is unavailable: {args.speaker}")

    for offset in range(0, len(pending), args.batch_size):
        batch = pending[offset : offset + args.batch_size]
        torch.manual_seed(20260721 + offset)
        wavs, sample_rate = model.generate_custom_voice(
            text=[str(segment["voiceText"]) for segment in batch],
            language=["Korean"] * len(batch),
            speaker=[args.speaker] * len(batch),
            instruct=[INSTRUCTION] * len(batch),
            max_new_tokens=2048,
        )
        for segment, waveform in zip(batch, wavs, strict=True):
            output_path = output_dir / f"{segment['id']}.wav"
            sf.write(output_path, waveform, sample_rate, subtype="PCM_16")
            print(f"generated segment={segment['id']} seconds={len(waveform) / sample_rate:.2f}")

    model_revision = model_info(MODEL_ID).sha
    manifest_segments = []
    for segment in segments:
        output_path = output_dir / f"{segment['id']}.wav"
        if not output_path.is_file():
            raise FileNotFoundError(f"Narration output is missing: {output_path}")
        info = sf.info(output_path)
        manifest_segments.append(
            {
                "id": str(segment["id"]),
                "path": f"output/video/edit/narration/{segment['id']}.wav",
                "durationSeconds": round(info.duration, 3),
                "sha256": sha256(output_path),
            }
        )

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "engine": "Qwen3-TTS 12Hz 0.6B CustomVoice",
        "engineSource": "https://github.com/QwenLM/Qwen3-TTS",
        "engineCommit": args.runtime_commit,
        "modelId": MODEL_ID,
        "modelRevision": model_revision,
        "license": "Apache-2.0",
        "speaker": args.speaker,
        "speakerSource": "Official native Korean preset; no uploaded reference or personal voice clone",
        "instruction": INSTRUCTION,
        "device": device,
        "dtype": str(dtype).replace("torch.", ""),
        "segments": manifest_segments,
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    narration_text_path.write_text(
        "\n\n".join(f"{segment['id']}. {segment['voiceText']}" for segment in segments) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
