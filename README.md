# Monthline

작은 아이폰 화면에서 한 달 전체를 보며 일정과 날짜 미지정 할 일을 관리하는 개인용 PWA입니다.

## 로컬에서 시작하기

Node.js 24와 npm을 사용합니다.

```sh
npm ci
npm run dev
```

Vite가 표시하는 로컬 주소로 접속합니다. 두 Supabase 환경변수가 모두 비어 있으면 상단에 **로컬 모드**가 표시됩니다. 첫 실행 시 현재 월에 예시 일정이 표시됩니다. **설정 → 데이터 → 예시 일정과 할 일 지우기**로 예시 항목을 삭제할 수 있습니다. 직접 추가한 항목은 유지됩니다.

```sh
npm run build
npm run preview
```

서비스 워커와 설치 메타데이터는 프로덕션 빌드에서 확인할 수 있습니다. 아이폰에서는 HTTPS 주소를 Safari에서 열고 공유 메뉴의 **홈 화면에 추가**를 선택합니다. 첫 온라인 로드 후 앱 셸을 캐시합니다.

## 사용법

- 날짜 숫자나 빈 영역을 누르면 해당 날짜의 편집 가능한 일정 목록이 열립니다. **일정 추가**에서 제목을 쓰고 Enter를 누르면 기본 카테고리와 하루 종일 일정으로 저장됩니다. 같은 폼에서 시간과 카테고리를 지정할 수 있습니다.
- 일정 버튼은 편집, 우클릭 또는 터치 길게 누르기는 빠른 카테고리 변경입니다. 키보드에서는 일정에 포커스한 상태에서 Shift+F10을 사용합니다.
- **할 일** 패널에서 체크, 편집, 위·아래 이동, 카테고리 변경을 할 수 있습니다. 데스크톱에서는 핸들을 드래그하고, 터치에서는 항목 제목이나 핸들을 길게 누른 뒤 날짜 위에 놓습니다. 핸들을 클릭해 날짜를 선택하는 방식도 지원합니다. 취소 영역에 놓거나 Esc를 누르면 목록으로 돌아갑니다.
- 모바일 월간 그리드는 제목 줄을 우선 확보합니다. 해당 날짜에 공간이 있으면 긴 제목을 두 줄까지 표시하고, 초과 건수는 가능한 경우 날짜 옆에 표시합니다. 날짜 상세 패널에서 전체 제목과 시간을 볼 수 있습니다.
- 일요일과 대한민국 공휴일의 날짜 숫자가 빨갛게 표시됩니다. 이름은 날짜 버튼의 설명에 포함됩니다. 정기 공휴일과 대체공휴일은 [관공서 공휴일 규정](https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&lsId=002404)을 바탕으로 오프라인에서 계산합니다. 임시공휴일과 별도 지정 선거일은 발표 후 앱 업데이트로 반영합니다.
- **설정**에서 시스템·라이트·다크·아이보리·자주·차콜 스타일과 달력 일정 및 할 일의 글자 크기를 선택합니다. 카테고리는 위·아래 버튼으로 순서를 변경할 수 있고, 변경한 순서는 일정 편집과 빠른 카테고리 메뉴에 반영됩니다. 주 시작 요일 변경과 JSON 백업도 설정에 있습니다. 참조 중인 카테고리를 삭제하면 기존 기본 카테고리 또는 남은 카테고리를 배정합니다. 가져오기는 백업 유효성을 검사하고 확인을 받은 뒤 현재 기기의 레코드를 교체합니다. 이전 JSON 백업에서도 일정, 할 일, 카테고리, 설정을 복원할 수 있습니다. 이전 버전의 기한 레코드는 새 화면과 새 백업에서 제외되며, 기존 Supabase 기한 데이터는 보관됩니다.

## Supabase 연결

1. 본인의 Supabase 프로젝트에서 [마이그레이션 SQL](supabase/migrations/20261122000000_calendar.sql)을 SQL Editor에서 실행합니다. CLI로 관리한다면 같은 파일을 프로젝트의 마이그레이션 절차로 적용합니다. SQL에는 테이블, 사용자별 RLS, 동기화 RPC, Realtime publication 등록이 포함됩니다.
2. **Authentication → Providers → Email**에서 이메일/비밀번호 로그인을 허용합니다. 새 사용자의 공개 가입 옵션은 비활성화하고 **Authentication → Users**에서 본인의 사용자 한 명을 직접 생성합니다. 이메일 인증이 켜져 있다면 해당 사용자를 확인 완료 상태로 생성하거나 인증을 완료합니다.
3. **Project Settings → API Keys**에서 프로젝트 URL과 브라우저용 **Publishable key**를 확인합니다. `service_role` 또는 Secret key를 프론트엔드와 GitHub 저장소에 넣지 않습니다.
4. 로컬에서 `.env.example`을 `.env.local`로 복사하고 다음 값을 설정한 뒤 Vite를 재시작합니다.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

5. 생성한 이메일과 비밀번호로 로그인합니다. 처음 접속할 때 빈 캘린더와 기본 카테고리 9개가 생성됩니다. 로컬 모드 캐시는 별도이므로 데이터를 옮기려면 먼저 로컬에서 JSON을 내보내고 Supabase 로그인 후 가져옵니다. 예시를 옮기고 싶지 않다면 내보내기 전에 설정에서 예시를 지웁니다.
6. 두 기기에서 같은 계정으로 접속해 일정 이동 또는 테마 변경이 반영되는지 확인합니다. 이어서 한 기기에서 네트워크를 끊고 일정을 수정한 뒤 재접속해 동기화 상태를 확인합니다.

### 저장과 충돌 처리

React UI는 환경과 관계없이 같은 Repository를 사용합니다. IndexedDB는 로컬 모드와 Supabase 프로젝트·사용자별로 캐시를 분리합니다. 로컬 편집과 전송 대기열은 같은 IndexedDB 트랜잭션에 기록되므로 새로고침 후에도 전송할 수 있습니다. 원격 쓰기는 배치 단위로 처리됩니다. 같은 UUID 기반 작업을 재전송해도 행을 중복 생성하지 않습니다.

같은 레코드의 동시 편집은 변경 시각과 작업 UUID를 기준으로 최신 행을 선택합니다. 삭제도 동기화 기록으로 보존하므로 오래된 요청이 지운 항목을 되살리지 않습니다. 서로 다른 필드의 동시 수정은 합쳐지지 않으며 기기 시계가 크게 다르면 최신 변경 판정에 영향을 줄 수 있습니다. Realtime 알림, 온라인 이벤트, 앱 복귀, 활성 상태의 주기적 재시도로 동기화를 갱신합니다. 로그아웃 시 UI는 다시 인증을 요구하며, 해당 사용자의 로컬 캐시는 브라우저에 남습니다.

## GitHub Pages 배포

1. GitHub 저장소를 만들고 프로젝트를 커밋해 `main`으로 푸시합니다.
2. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 지정합니다.
3. **Settings → Secrets and variables → Actions**의 Variables에 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`를 등록합니다. 같은 이름의 Secrets도 지원합니다. Vite가 값을 빌드 결과에 포함하므로 Publishable key만 사용합니다.
4. **Actions → Verify and deploy to GitHub Pages → Run workflow**를 실행하거나 `main`을 갱신합니다. 검증을 통과하면 `github-pages` 환경으로 배포됩니다. 테스트는 배포용 변수와 무관하게 로컬 모드로 실행합니다.
5. GitHub가 표시하는 Pages URL을 Safari에서 열어 로그인과 설치를 확인합니다. Vite의 상대 경로 및 서비스 워커 범위는 `/저장소이름/` 하위 경로를 지원합니다.

## 검증

```sh
npm run typecheck
npm run lint
npm test
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

- Vitest와 React Testing Library로 달력 계산, 일정 폼, 화면 설정, IndexedDB, 오프라인 재시도와 충돌, 백업을 검증합니다.
- PGlite의 PostgreSQL에서 마이그레이션을 적용하고 비인증 접근 거부, 사용자 간 격리, 멱등성, 날짜 제약을 검증합니다. Supabase Auth와 Realtime의 실제 호스팅 연결 검증에는 사용자의 프로젝트가 필요합니다.
- Playwright는 하위 경로에서 프로덕션 빌드를 실행합니다. WebKit 390×844 및 375×667, Chromium 1440×900을 사용하며 Chromium 터치 입력도 검증합니다. 브라우저에서 모의 Supabase API를 사용해 로그인 유지, 오프라인 편집, 재전송 및 로그아웃을 검증합니다. 시각 검증 PNG는 `test-results/**/visual/`에 저장됩니다. GitHub Actions에서는 `visual-verification` 아티팩트로 받을 수 있습니다.
- Playwright WebKit은 브라우저 엔진과 레이아웃을 검증합니다. iOS 홈 화면 설치, 실제 Safe Area, Safari 소프트 키보드, iOS의 길게 누르기 동작은 실제 기기에서 확인해야 합니다. 인증 캐시가 없는 기기의 첫 로그인과 초기 데이터 로드에는 연결이 필요합니다.
