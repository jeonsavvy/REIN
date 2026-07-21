# REIN demo video

Final upload master:

- `edit/REIN-demo-final.mp4`
- 1:40.47, 1920x1080, 30 fps, H.264 + AAC
- Korean authored/burned captions; accessible SRT at `edit/captions-ko.srt`
- Local Microsoft Heami synthetic Korean narration (AI-generated)
- SHA-256:
  `C0FFCBE999811E6B8A596513D0C5BF3DE69D7A6441B18EA58D8C0DB80719B271`

The video preserves a single completed Cloud Run run from the click through both
payments, report generation, and two Solana Explorer pages. Only the initial
pre-navigation blank frame was replaced by a REIN card; no payment state was
cut, duplicated, or simulated. See `edit/edl.json` and `edit/edit-decision.md`.

## Recorded proof

- Run: `run_7e8bcc6762404d8fa7ac7b1afc592201`
- `market_snapshot`, 0.001 test USDC:
  <https://explorer.solana.com/tx/cJW9o6c4X5Wh8YkXDBySbYdBb7y2BLdtrSc7A6qt6JDTQaTabqDDaekyfqCYUSbtAkJD8Sq3MTQUcvviRGxMMHm?cluster=devnet>
- `github_health`, 0.002 test USDC:
  <https://explorer.solana.com/tx/2zpggYuHJ7Z5KCbg4iXqeTryhcevA5mqmHx1G57BZ8U73XxgaRQho2bgmg6rXnrzNBJhCBGoEn7QstGrLqXUAeeQ?cluster=devnet>

Both signatures were independently queried through Solana Devnet RPC and were
`finalized` with `err: null`. The buyer/receiver balance delta was exactly
0.003 test USDC.

## Rebuild

The original browser source remains unmodified locally at
`source/rein-live-run.webm` and is intentionally ignored by Git. The public
metadata is `source/rein-live-run.json`.

On Windows with `ffmpeg` and a local Korean speech voice:

```powershell
.\scripts\build-demo-video.ps1          # preview
.\scripts\build-demo-video.ps1 -Final   # upload master
```

The user only needs to review the master, upload it to YouTube as an unlisted or
public video accepted by the event, and place that URL in the submission form.
