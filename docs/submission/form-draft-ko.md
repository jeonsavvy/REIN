# Google Form 제출 답안 초안

공식 폼은 Google 로그인이 필요하며 파일 업로드 시 계정 정보가 기록된다. 이
문서는 답안 초안일 뿐이며 어떤 필드도 자동 입력하거나 제출하지 않았다. 최종
제출과 약관 동의는 사용자가 수행한다.

## 확인된 첫 페이지 필드

- 팀명: `REIN`
- 참가 형태: `개인`
- 대표자 성명: `[사용자 입력]`
- 대표자 이메일: `[사용자 입력]`
- 대표자 연락처: `[사용자 입력]`
- 팀원 정보: `[이름] / 개발·PM·디자인 / [소속] / [이메일]`
- 소속 구분: `[사용자 선택]`
- 구글 클라우드 사용 경험: `[사용자 선택]`
- 블록체인 관련 개발 경험: `[사용자 선택]`
- 2026-08-21 Google Startup Campus 데모데이 참석: `[사용자 선택]`

개인 정보 없이 다음 페이지로 진행하지 않았으므로 이후 정확한 질문 라벨은
제출 직전에 다시 확인한다. 아래 문구는 프로젝트 관련 장문 필드에 붙여 넣을 수
있는 검토본이다.

## 프로젝트명

REIN - Gemini 3.5 Flash 자율 데이터 구매 에이전트

## 한 줄 소개

Autonomy, held to proof - 목표와 예산만 받으면 Gemini가 필요한
데이터를 선택하고, 정책 검사를 통과한 구매만 Solana Devnet에서 결제한 뒤
온체인 영수증과 근거 보고서를 함께 남깁니다.

## 타깃 사용자

외부 데이터 비용을 통제하면서 반복 조사를 자동화하려는 리서처, AI 운영자,
B2B SaaS 팀. MVP는 SOL/ETH 시장·개발 모멘텀 비교로 자율 증거 조달을 시연합니다.

## 해결 문제

기존 AI 리서치 도구는 데이터를 추천하거나 호출하지만, 유료 자원을 왜 샀는지,
예산과 자산 정책을 지켰는지, 실제로 정산되었는지를 하나의 감사 흐름으로
증명하지 못합니다. 재시도 중 중복 결제와 결제 후 upstream 실패도 큰 위험입니다.

## 해결 방식

Gemini는 두 상품의 관련성과 가격만 비교합니다. 코드 정책이 URL, 네트워크,
USDC mint, 가격, payee, 실행·일일 한도를 재검증하고 Firestore 트랜잭션으로
예산을 예약합니다. x402 결제 후 결제 전에 고정한 snapshot을 반환하고, 거래
서명과 Explorer 링크를 근거에 묶습니다. 정산이 불명확하면 자동 재결제하지
않고 reconciling으로 중지합니다.

## Google Cloud / AI 활용

- Vertex AI `gemini-3.5-flash`, Google ADK TypeScript, structured output
- Cloud Run 단일 서비스, Firestore transactional quota, Secret Manager key
- Gemini에는 키가 전달되지 않으며 chain-of-thought 대신 짧은 선택 요약만 공개

## Solana / 결제 활용

- x402 buyer + seller, payment-identifier extension
- Solana Devnet CAIP-2 `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`
- Circle Devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- 실제 Devnet 거래 두 건과 Explorer 영수증: 검증 완료

## 링크

- GitHub: `https://github.com/jeonsavvy/REIN`
- 소개서 PDF: `[Drive 공개 링크]`
- 데모 영상(3분 이내): `[YouTube URL — 1분 40초 최종본 업로드 후 입력]`
- 라이브 Cloud Run: `https://rein-vvwpcipqca-du.a.run.app`
- Explorer 1: `https://explorer.solana.com/tx/2NuicT57mQD1Uu5yumPnubCkrdSVHQUegbxLEBsDtpdVTTjw5dTdyB3QpH9t7VZLGnyQyNV9DySA9xWMY9YMpArw?cluster=devnet`
- Explorer 2: `https://explorer.solana.com/tx/3vpyu3DsDvDT2m71kj3Pt5GQ4Ba2jQVYkuFhWL9eTUgiVXwpMiQKpbtjSPKaV5J5K3cpff6726kXT8p5Ui6gbcGR?cluster=devnet`

영상에 표시되는 별도 recording run 영수증은
`output/video/README.md`에 기록되어 있으며 두 건 모두 `finalized`다.

## 최종 제출 전 확인

- PDF에 타깃, 문제, 도입 시나리오, 아키텍처 다이어그램이 모두 있는가?
- 새 환경에서 README만으로 실행되는가?
- 영상이 3분 이내이며 실제 온체인 결제 전 과정을 보여주는가?
- GitHub/Drive/YouTube/Cloud Run 링크가 시크릿 없이 공개 접근 가능한가?
- 팀/연락처/소속/참석 가능 여부와 폼 약관을 사용자가 직접 검토했는가?
