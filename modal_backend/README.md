# Modal 영상 백엔드

이 디렉터리는 `../G-SULEE/webapp/pipeline.py`를 Modal에서 비동기로 실행하는 발표용 API입니다. GPU는 사용하지 않으며 FFmpeg CPU 렌더링과 OpenAI API를 사용합니다.

## 준비

```bash
python3 -m pip install modal
modal setup
```

Modal Secret `samsung`에는 이미 `OPENAI_API_KEY`가 있어야 합니다. Lovable 최종 주소가 정해지면 같은 Secret에 다음 값을 추가하세요.

```text
LOVABLE_ORIGIN=https://<your-lovable-domain>
```

## 로컬 개발과 배포

저장소 루트(`mytinycutevideo`)에서 실행합니다.

```bash
modal serve modal_backend/modal_app.py
modal deploy modal_backend/modal_app.py
```

출력되는 `web_api` HTTPS 주소를 프런트엔드의 `VITE_MODAL_API_URL`로 설정합니다. URL 끝의 `/`는 있어도 됩니다.

## API

- `POST /jobs`: `files` 여러 개와 `prompt`를 multipart로 업로드
- `GET /jobs/{job_id}?since=0`: 새 진행 이벤트 조회
- `GET /jobs/{job_id}/files/{path}`: 생성 중인 썸네일 조회
- `GET /jobs/{job_id}/result`: 완료된 MP4 재생/다운로드
- `GET /health`: 배포 상태 확인

지원 형식은 ZIP 한 개 또는 MP4, MOV, M4V, AVI, MKV 최대 30개입니다. 코드상 상한은 4GB지만 발표에서는 총 500MB 이하의 짧은 H.264 영상 2~3개를 권장합니다. 업로드 HTTP 요청은 Modal 제한상 150초 안에 끝나야 합니다.

렌더 함수는 최대 컨테이너 1개, CPU 4코어, 메모리 8GB, 제한시간 1시간으로 설정되어 있습니다. 작업 파일은 다음 작업 생성 시 24시간이 지난 항목부터 정리됩니다.

## 발표 종료

공개 URL의 비용과 오용을 막으려면 발표가 끝난 즉시 앱을 중지합니다.

```bash
modal app stop my-tiny-cute-video
```

다시 사용할 때는 `modal deploy modal_backend/modal_app.py`로 배포하면 됩니다.
