# Game Release

Cloudflare Workers와 D1으로 만든 게임 발매 일정 서비스입니다.

- `app/`: 일반 사용자용 공개 Worker
- `admin/`: 관리자용 Worker
- 두 Worker는 기존에 구성된 하나의 Cloudflare D1 데이터베이스를 공유합니다.
- 관리자 페이지와 API는 Google 로그인 기반 Cloudflare Access로 보호됩니다.

## 프로젝트 구조

```text
game-release/
├── app/       공개 게임 발매 일정 페이지
├── admin/     게임 등록·수정·삭제 관리자 페이지
├── package.json
└── README.md
```

## 시작하기

### 1. 저장소 받기

```bash
git clone <REPOSITORY_URL>
cd game-release
npm ci
```

Node.js 22 이상이 필요합니다.

### 2. Cloudflare 로그인

배포하거나 기존 Cloudflare 리소스에 접근하려면 해당 Cloudflare 계정에 대한 권한이 있어야 합니다.

```bash
npx wrangler login
npx wrangler whoami
```

이 프로젝트의 `wrangler.jsonc`에는 기존 Worker, D1, Access 설정이 들어 있습니다. 별도의 D1 데이터베이스를 만들거나 설정값을 교체할 필요가 없습니다.

## 로컬 실행

공개 앱을 실행합니다.

```bash
npm run dev:app
```

관리자 앱을 실행합니다.

```bash
npm run dev:admin
```

관리자 API는 모든 `/api/*` 요청에서 유효한 Cloudflare Access JWT를 검사합니다. localhost에는 Access JWT가 없으므로 로컬 관리자 화면의 목록 조회·등록·수정·삭제 요청은 `401`로 거절됩니다.

관리자 기능 전체는 배포된 관리자 Worker에서 허용된 Google 계정으로 로그인한 뒤 확인해야 합니다.

## 테스트

전체 테스트를 실행합니다.

```bash
npm test
```

Worker별로 실행할 수도 있습니다.

```bash
npm run test --workspace @game-release/app
npm run test --workspace @game-release/admin
```

## 배포

기존 Cloudflare 인프라에 공개 앱과 관리자 앱을 각각 배포합니다.

```bash
npm run deploy:app
npm run deploy:admin
```

배포 전에 설정만 확인하려면 dry-run을 실행합니다.

```bash
npx wrangler deploy --dry-run --config app/wrangler.jsonc
npx wrangler deploy --dry-run --config admin/wrangler.jsonc
```

## 주요 명령어

| 명령어 | 설명 |
| --- | --- |
| `npm run dev:app` | 공개 Worker 로컬 실행 |
| `npm run dev:admin` | 관리자 Worker 로컬 실행 |
| `npm run deploy:app` | 공개 Worker 배포 |
| `npm run deploy:admin` | 관리자 Worker 배포 |
| `npm test` | 전체 테스트 실행 |

## 데이터 형식

게임 데이터는 다음 필드를 사용합니다.

| 필드 | 설명 |
| --- | --- |
| `title` | 게임명 |
| `platform` | 쉼표로 구분된 플랫폼 목록 |
| `release_date` | `YYYY-MM-DD` 형식의 발매일 |

지원 플랫폼은 다음과 같습니다.

```text
NS, NS2, PS4, PS5, XBOX, Steam
```

## 관리자 API

모든 관리자 API 요청에는 Cloudflare Access 인증이 필요합니다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/releases` | 목록 조회, 검색, 필터, 페이지네이션 |
| `POST` | `/api/releases` | 게임 등록 |
| `PUT` | `/api/releases/:id` | 게임 수정 |
| `DELETE` | `/api/releases/:id` | 게임 삭제 |

## 주의사항

- `app/wrangler.jsonc`와 `admin/wrangler.jsonc`의 D1 설정은 동일한 기존 데이터베이스를 가리켜야 합니다.
- 관리자 Worker의 Access `aud`, issuer, JWK URL을 임의로 변경하지 마세요.
- Cloudflare API Token, OAuth Client Secret, 비밀번호를 저장소에 커밋하지 마세요.
