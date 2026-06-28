# 재테크 라운지 3기 강의실

> 2기 강의실(`jaetech-classroom-2`) 코드를 베이스로 3기용으로 새로 생성한 인스턴스.
> 2기 인프라(GitHub repo / Supabase / Vercel)와 **완전히 분리**되어 운영됨.

## 배포 정보

- **GitHub**: `busang-gu/jaetech-classroom-3`
- **Vercel**: 새 프로젝트로 별도 생성 → 도메인 정해지면 여기 기재
- **Supabase**: 새 프로젝트로 별도 생성
- **Kakao OAuth**: 기존 앱 재사용 + 콜백 URL에 새 Vercel 도메인 추가

## 3기 일정

| 주차 | 강의 오픈 (월) | 과제 마감 (일) |
| --- | --- | --- |
| WEEK 01 | 2026-06-29 | 2026-07-05 |
| WEEK 02 | 2026-07-06 | 2026-07-12 |
| WEEK 03 | 2026-07-13 | 2026-07-19 |
| WEEK 04 | 2026-07-20 | 2026-07-26 |

---

## 🛠 초기 셋업 체크리스트

### A. Supabase 새 프로젝트
1. https://supabase.com/dashboard → New project
2. 이름: `jaetech-classroom-3` (자유)
3. 리전: Northeast Asia (Seoul) 또는 Tokyo
4. DB 비밀번호 저장
5. SQL Editor 들어가서 아래 `## DB 스키마` 섹션 통째로 실행
6. Storage → New bucket: `assignment-images` (Private)
   - Policy: authenticated 사용자만 SELECT/INSERT

### B. Vercel 새 프로젝트
1. https://vercel.com/new → 이 저장소 import
2. Framework: Other (정적 HTML + Node API routes)
3. **환경변수 6개 등록** (아래 `## 환경변수` 참고)
4. Deploy → 도메인 확인 (예: `jaetech-classroom-3.vercel.app`)

### C. Kakao 개발자 콘솔
1. https://developers.kakao.com → 기존 앱(2기에서 쓰던 것) 선택
2. 제품 설정 → 카카오 로그인 → Redirect URI
3. 새 URI 추가: `https://[3기-vercel-도메인]/api/auth/callback`
4. 저장

### D. 첫 로그인 + 관리자 지정
1. 본인 카카오 계정으로 로그인 (자동 회원가입)
2. Supabase Table Editor → `users` 테이블 → 본인 row → `is_admin: true`
3. `ADMIN_KAKAO_IDS` 환경변수에 본인 kakao_id 추가 (CSV)

---

## 🔑 환경변수 (Vercel)

| Key | Value | 비고 |
| --- | --- | --- |
| `SUPABASE_URL` | `https://xxx.supabase.co` | Supabase Settings → API |
| `SUPABASE_SERVICE_KEY` | `eyJhbGciOi...` (service_role) | ⚠️ 절대 클라이언트 노출 X |
| `KAKAO_REST_API_KEY` | Kakao REST API 키 | 2기와 동일 가능 |
| `KAKAO_CLIENT_SECRET` | Kakao Client Secret | (활성화 시) |
| `JWT_SECRET` | 32자 이상 랜덤 문자열 | 2기와 달라야 함 (보안 격리) |
| `ADMIN_KAKAO_IDS` | `123456,789012` (CSV) | 관리자 카카오 user id |

---

## 📋 DB 스키마

Supabase SQL Editor에 아래 통째로 붙여넣고 Run.

```sql
-- users
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  kakao_id text unique not null,
  nickname text,
  is_admin boolean default false,
  training_status text default 'pending' check (training_status in ('pending', 'scheduled', 'completed')),
  is_banned boolean not null default false,
  banned_at timestamptz,
  banned_reason text,
  banned_by uuid references public.users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists users_training_status_idx on public.users(training_status);
create index if not exists users_is_banned_idx on public.users(is_banned) where is_banned = true;

-- assignments
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  week int not null check (week between 1 and 4),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  form_data jsonb default '{}'::jsonb,
  proof_text text,
  submitted_at timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(user_id, week)
);
create index if not exists assignments_user_id_idx on public.assignments(user_id);
create index if not exists assignments_status_idx on public.assignments(status);

-- assignment_images
create table if not exists public.assignment_images (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  storage_path text not null,
  order_idx int default 0,
  created_at timestamptz default now()
);

-- admin_notes
create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists admin_notes_student_id_idx on public.admin_notes(student_id);

-- RLS (모든 API는 service_role로 우회하므로 정책은 차단 기준)
alter table public.users enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_images enable row level security;
alter table public.admin_notes enable row level security;
```

---

## 📦 디렉토리 구조

```
/
├── index.html             # 학생 메인 (강의 영상 + 트레이닝 카드 + 공지)
├── login.html             # 카카오 로그인
├── submit.html            # 주차별 과제 제출 폼 (?week=1~4)
├── assignments.html       # 본인 과제 게시판
├── training.html          # 트레이닝 현황표 (학생 + 관리자)
├── banned.html            # 강퇴된 사용자 안내
├── assignments/           # 다운로드 가능한 xlsx 양식
├── admin/
│   ├── index.html         # 관리자 대시보드
│   └── student.html       # 학생 상세
└── api/
    ├── _lib/
    │   ├── session.js     # JWT + ban 게이트
    │   └── supabase.js    # service_role 클라이언트
    ├── auth/
    │   ├── kakao.js       # OAuth 시작
    │   ├── callback.js    # OAuth 콜백 + JWT 발급
    │   └── logout.js
    ├── me.js              # 현재 세션 정보
    ├── assignments.js     # 본인 과제 CRUD
    ├── assignment-images.js
    ├── training.js        # 트레이닝 현황 조회
    └── admin/
        ├── students.js    # 전체 학생 목록
        ├── student.js     # 학생 상세
        ├── training.js    # 트레이닝 상태 변경
        ├── notes.js       # 관리자 메모
        └── ban.js         # 강퇴/해제
```

---

## 🎬 강의 영상

`index.html`의 WEEK 01~04 카드에 박힌 유튜브 ID는 2기 영상 그대로 임베드된 상태.
3기에서 새 영상 찍으면 `data-yt="..."` 부분만 교체.

| 주차 | 현재 YouTube ID | 비고 |
| --- | --- | --- |
| WEEK 01 | NY3yEM7iA1Y | 2기 동일 |
| WEEK 02 | Me34jMduweI | 2기 동일 |
| WEEK 03 | 5Qk0_SNobzo | 2기 동일 (34:34 정정 공지 포함) |
| WEEK 04 | zNAr_KZRAFI | 2기 동일 |
