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

REIN — 예산을 지키는 AI 데이터 구매 에이전트

## 한 줄 소개

목표와 예산을 받으면 Gemini가 필요한 데이터를 선택하고, 정책 검사를 통과한
구매만 Solana Devnet에서 결제합니다. 결과에는 온체인 영수증과 근거 보고서가
함께 남습니다.

## 타깃 사용자

외부 데이터 비용을 통제하면서 반복 조사를 자동화하려는 리서처, AI 운영자,
B2B SaaS 팀. SOL/ETH 시장·개발 모멘텀 비교를 통해 데이터 선택, 결제, 영수증
기록까지 이어지는 흐름을 시연합니다.

## 해결 문제

기존 AI 리서치 도구는 데이터를 추천하거나 호출하지만, 유료 자원을 왜 샀는지,
예산과 자산 정책을 지켰는지, 정산되었는지를 한 기록에서 확인하기 어렵습니다.
재시도 중 중복 결제와 결제 후 원본 API 장애도 주요 위험입니다.

## 해결 방식

Gemini는 두 상품의 관련성과 가격만 비교합니다. 코드 정책이 URL, 네트워크,
USDC mint, 가격, payee, 실행·일일 한도를 재검증하고 Firestore 트랜잭션으로
예산을 예약합니다. x402 결제 후 결제 전에 고정한 스냅샷을 반환하고, 거래
서명과 Explorer 링크를 근거에 묶습니다. 정산이 불명확하면 자동 재결제하지
않고 reconciling으로 중지합니다.

## Google Cloud / AI 활용

- Vertex AI `gemini-3.5-flash`, Google ADK TypeScript, structured output
- Cloud Run 단일 서비스, Firestore transactional quota, Secret Manager key
- Gemini에는 결제 키를 전달하지 않고 관련성·가격·선택 이유만 구조화해 받음

## Solana / 결제 활용

- x402 buyer + seller, payment-identifier extension
- Solana Devnet CAIP-2 `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`
- Circle Devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Devnet 거래 두 건과 Explorer 영수증: 검증 완료

## 링크

- GitHub: `https://github.com/jeonsavvy/REIN`
- 소개서 PDF: `[Drive 공개 링크]`
- 데모 영상(3분 이내): `[YouTube URL — 2분 24초 최종본 업로드 후 입력]`
- 라이브 Cloud Run: `https://rein-vvwpcipqca-du.a.run.app`
- Explorer 1: `https://explorer.solana.com/tx/NoNGYPThfsy8jx43CvHBeVwXx6Cm5T9eLLNuM2JNEKfBSYnZLveQThxeio9Y7Divs9CEpg6TXFyUrjPBAEpQyrd?cluster=devnet`
- Explorer 2: `https://explorer.solana.com/tx/4Pw18BGdsvv7zo9WYsMXi3p5cCxhgrv5H3mNpa9hyyPopuAkDx18r48WcFor6CSEnNukbVCdJpgwPDXKrsAk7cbj?cluster=devnet`

위 두 영수증은 영상에 표시되는 같은 실행에서 나왔으며 모두 `finalized`다.
음성은 Qwen3-TTS의 공식 한국어 화자로 만들었고 영상과 문서에 AI 생성임을
밝혔다. 사용자 음성이나 음성 복제는 사용하지 않았다.

## 최종 제출 전 확인

- PDF에 타깃, 문제, 도입 시나리오, 아키텍처 다이어그램이 모두 있는가?
- 새 환경에서 README만으로 실행되는가?
- 영상이 3분 이내이며 Devnet 결제 전 과정을 보여주는가?
- GitHub/Drive/YouTube/Cloud Run 링크가 시크릿 없이 공개 접근 가능한가?
- 팀/연락처/소속/참석 가능 여부와 폼 약관을 사용자가 직접 검토했는가?
