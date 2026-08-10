# My Tiny Cute Video

흩어진 영상들을 한 편의 따뜻한 추억 영상으로 만드는 발표용 데모입니다. 로그인과 데이터베이스 없이 Lovable 프런트엔드가 파일을 Modal로 직접 업로드하고, Modal이 기존 `G-SULEE` Python 파이프라인을 비동기로 실행합니다.

## 구성

```text
Lovable / 브라우저
  ├─ 공개 랜딩 /
  ├─ 업로드·진행·결과 /create
  └─ VITE_MODAL_API_URL로 직접 요청
             ↓
Modal FastAPI
  ├─ 업로드 및 ZIP 검증
  ├─ Modal Dict 진행 상태
  ├─ Modal Volume 작업 파일
  └─ G-SULEE + FFmpeg + OpenAI + CC0 BGM 렌더링
```

Supabase, 로그인, 회원가입, 별도 데이터베이스는 사용하지 않습니다. 영상 처리는 사용자 브라우저가 아니라 Modal CPU 컨테이너에서 실행됩니다.

## 로컬 프런트엔드

Node.js 20 이상이 필요합니다.

```bash
npm install
cp .env.example .env.local
# .env.local의 VITE_MODAL_API_URL을 실제 Modal URL로 변경
npm run dev
```

브라우저에서 `http://localhost:8080`을 엽니다.

## Modal 배포

이 저장소와 `G-SULEE`가 아래처럼 같은 폴더 안에 있어야 합니다.

```text
samsung/
  ├─ mytinycutevideo/
  └─ G-SULEE/webapp/
      ├─ pipeline.py
      └─ static/NanumGothic-Bold.ttf
```

프로젝트 내부 가상환경을 사용하는 예시입니다.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install modal
.venv/bin/modal setup
.venv/bin/modal deploy modal_backend/modal_app.py
```

Modal Secret `samsung`에는 `OPENAI_API_KEY`가 있어야 합니다. 기본 주소 `https://mytinycutevideo.lovable.app`은 이미 허용되어 있습니다. Lovable 주소를 바꾸거나 커스텀 도메인을 쓰면 같은 Secret에 `LOVABLE_ORIGIN=https://...`도 추가합니다. 자세한 API와 운영법은 [modal_backend/README.md](modal_backend/README.md)를 참고하세요.

Modal 배포 후 출력되는 `web_api` 주소를 Lovable 환경 변수에 넣습니다.

```text
VITE_MODAL_API_URL=https://<workspace>--my-tiny-cute-video-web-api.modal.run
```

`OPENAI_API_KEY`는 프런트엔드나 Lovable 환경 변수에 넣지 않습니다.

## 지원 입력

- ZIP 한 개 또는 영상 여러 개
- `.mp4`, `.mov`, `.m4v`, `.avi`, `.mkv`
- 최대 60개, 코드상 최대 4GB
- 발표 권장: H.264 MP4 2~3개, 총 500MB 이하

일반 노트북에서도 업로드와 화면 표시는 문제없습니다. 실제 분석·렌더링은 Modal에서 실행되므로 노트북 GPU는 필요하지 않습니다.

최종 영상의 BGM은 G-SULEE가 분석한 분위기에 따라 자동 선택됩니다. 발표 중 외부 음원 서버에 의존하지 않도록 무드별 FreePD CC0 음원 한 곡씩을 Modal 이미지에 포함합니다.

## 검증

```bash
python3 -m unittest modal_backend.test_job_utils -v
npm run lint
npm run build
npx playwright test e2e/video-demo.spec.ts --project=chromium
```

E2E 테스트는 Modal API를 가로채므로 OpenAI 비용이나 실제 영상 렌더링 없이 실행됩니다.

## 발표 체크리스트

1. Modal 앱을 배포하고 `/health`가 `{"ok": true}`를 반환하는지 확인합니다.
2. Lovable에 `VITE_MODAL_API_URL`을 등록하고 다시 배포합니다.
3. 기본 주소가 아닌 경우 `samsung` Secret의 `LOVABLE_ORIGIN`이 실제 Lovable 주소와 일치하는지 확인합니다.
4. 발표 전 짧은 MP4로 실제 작업 한 번을 끝까지 실행합니다.
5. 브라우저 자동 잠금과 절전 모드를 끕니다.
6. 실패에 대비해 완성 MP4 하나를 로컬에 준비합니다.

발표가 끝나면 공개 엔드포인트를 즉시 중지합니다.

```bash
.venv/bin/modal app stop my-tiny-cute-video
```

## 문제 해결

- 브라우저 CORS 오류: `samsung` Secret의 `LOVABLE_ORIGIN`에 프로토콜을 포함한 정확한 배포 주소를 넣고 Modal을 다시 배포합니다.
- 업로드가 150초를 넘음: 파일 크기를 줄이거나 더 빠른 네트워크에서 다시 시도합니다.
- `G-SULEE pipeline.py를 찾을 수 없습니다`: 위의 형제 디렉터리 구조를 확인합니다.
- 작업이 오래 대기함: 렌더 컨테이너를 1개로 제한했기 때문에 이전 작업이 끝날 때까지 기다립니다.
- 결과 영상이 아직 없음: 백엔드는 결과 파일을 Volume에 반영한 뒤에만 `completed`를 공개합니다. 완료 화면은 일시적인 404가 발생해도 같은 페이지에서 자동 재시도하며, 모두 실패하면 `영상 다시 불러오기`를 누를 수 있습니다.
- BGM이 들리지 않음: 새 작업의 진행 이벤트에 `BGM:` 메시지가 있는지 확인하고 Modal render image에서 `BGM_DIR=/root/bgm`과 무드별 MP3를 확인합니다.
