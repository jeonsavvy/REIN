# Cloud Run 커스텀 도메인

상태: 선택 배포 경로

## 먼저 알아둘 점

`run.app`은 Google이 소유하며 Cloud Run 기본 주소의 고유 접미사는 플랫폼이
자동 발급한다. 짧은 주소가 필요하면 소유권을 확인할 수 있는 도메인의 하위 주소,
예를 들어 `app.example.com` 또는 `rein.example.com`을 연결한다.

## 이 서비스에 맞는 경로

현재 서비스는 `asia-northeast3`에 있다. Cloud Run의 직접 domain mapping은 Preview이며
지원 리전에 `asia-northeast3`가 포함되지 않는다. 따라서 리전을 옮기는 대신 다음 중
하나를 선택한다.

1. **Firebase Hosting rewrite** — 해커톤용 단일 서비스에 비교적 간단하고 관리형 TLS를 제공
2. **Global external Application Load Balancer** — Google 권장 경로지만 설정과 비용 표면이 더 큼

커스텀 도메인이 필요하면 기본 선택은 Firebase Hosting이다. production 보안 기능,
복수 서비스 라우팅, Cloud Armor가 필요할 때만 load balancer로 올린다.

공식 선택지는 [Cloud Run custom domain 문서](https://docs.cloud.google.com/run/docs/mapping-custom-domains)에
정리되어 있다.

## 실행 전 확인

- 도메인 소유권과 DNS 수정 권한이 확인됐는가?
- 원하는 hostname이 `app.<domain>`인지 `rein.<domain>`인지 확정했는가?
- 현재 Cloud Run 리비전과 생성 주소가 정상인가?
- custom origin을 `APP_BASE_URL`에 반영했는가?
- x402 결제 요청의 resource URL이 custom origin과 정확히 일치하는가?

마지막 두 항목이 어긋나면 보호 경로의 payment proof 검증이 실패할 수 있다.

## 변경·검증·rollback 순서

1. 도메인 소유권을 확인한다.
2. Hosting 또는 load balancer 설정을 preview한다.
3. DNS 레코드와 관리형 인증서를 연결한다.
4. `APP_BASE_URL=https://<hostname>`으로 새 Cloud Run 리비전을 배포한다.
5. `/api/health`, `/api/catalog`, 페이지 로딩을 읽기 전용으로 확인한다.
6. 승인된 0.003 테스트 USDC run을 한 번만 실행해 두 영수증을 확인한다.
7. 기존 `run.app` URL도 계속 동작하는지 확인한다.

문제가 생기면 DNS를 이전 값으로 되돌리고 Cloud Run 트래픽을 직전 리비전으로
돌린다. 결제 상태가 불명확한 run은 재실행하지 않고 `reconciling` 기록을 보존한다.
