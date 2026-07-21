# Presentation build

`rein-deck.js` is the editable PptxGenJS source. It generates an eight-slide
16:9 deck and uses the checked-in screenshot plus native PowerPoint shapes/text.

```powershell
node .\output\presentation\rein-deck.js
```

The checked-in defaults are the verified 2026-07-21 live deployment and two
finalized Devnet receipts. Override all three only when refreshing that proof:

```powershell
$env:REIN_LIVE_URL='https://...run.app'
$env:REIN_MARKET_TX='real devnet signature'
$env:REIN_GITHUB_TX='real devnet signature'
node .\output\presentation\rein-deck.js
```

If an override is used, regenerate the PPTX and export it to
`output/pdf/REIN-Hackathon-Deck.pdf`. Render every page and inspect the result;
do not replace the verified defaults with simulated or unconfirmed receipts.
