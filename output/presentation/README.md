# REIN 발표 자료 만들기

`rein-deck.js`는 16:9 비율의 8장 발표 자료를 만드는 편집 가능한 PptxGenJS
소스다. 새 REIN 화면 캡처와 PowerPoint 기본 도형·텍스트만 사용한다.

```powershell
node .\output\presentation\rein-deck.js
```

기본값에는 2026-07-21에 확인한 Cloud Run 주소와 영상에 사용한 두 Devnet 거래
서명이 들어 있다. 새로운 실행 증거로 교체할 때만 세 값을 모두 덮어쓴다.

```powershell
$env:REIN_LIVE_URL='https://...run.app'
$env:REIN_MARKET_TX='finalized devnet signature'
$env:REIN_GITHUB_TX='finalized devnet signature'
node .\output\presentation\rein-deck.js
```

PPTX를 만든 뒤 `output/pdf/REIN-Hackathon-Deck.pdf`로 내보내고, PDF 8장을
모두 이미지로 렌더링해 글자 잘림·겹침·폰트 대체·여백을 확인한다. 모의 영수증이나
확정되지 않은 거래를 기본 증거로 넣지 않는다.
