# Modal 영상 백엔드

이 디렉터리는 `../G-SULEE/webapp/pipeline.py`를 Modal에서 비동기로 실행하는 발표용 API입니다. GPU는 사용하지 않으며 FFmpeg CPU 렌더링과 OpenAI API를 사용합니다.

## 준비

```bash
python3 -m pip install modal
modal setup
```

Modal Secret `samsung`에는 이미 `OPENAI_API_KEY`가 있어야 합니다. 기본 배포 주소인 `https://mytinycutevideo.lovable.app`은 코드에서 허용합니다. 주소를 바꾸거나 커스텀 도메인을 연결하면 같은 Secret에 다음 값을 추가하세요.

```text
LOVABLE_ORIGIN=https://<your-new-domain>
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

지원 형식은 ZIP 한 개 또는 MP4, MOV, M4V, AVI, MKV 최대 60개입니다. 코드상 상한은 4GB지만 발표에서는 총 500MB 이하의 짧은 H.264 영상 2~3개를 권장합니다. 업로드 HTTP 요청은 Modal 제한상 150초 안에 끝나야 합니다.

렌더 함수는 최대 컨테이너 1개, CPU 4코어, 메모리 8GB, 제한시간 1시간으로 설정되어 있습니다. 작업 파일은 다음 작업 생성 시 24시간이 지난 항목부터 정리됩니다.

## BGM

G-SULEE가 영상 분석 결과에 따라 아홉 가지 무드 중 하나를 자동 선택합니다. Modal render image에는 `bgm/`의 FreePD CC0 음원 아홉 곡이 `/root/bgm`으로 포함되고, `BGM_DIR=/root/bgm`이 설정됩니다. 실행 중에는 외부에서 음원을 내려받지 않습니다.

음원을 다시 받을 때만 저장소 루트에서 다음 명령을 실행합니다.

```bash
bash modal_backend/scripts/fetch_demo_bgm.sh modal_backend/bgm
```

선정 곡과 라이선스 출처는 [bgm/README.md](bgm/README.md)에 기록되어 있습니다.

## 발표 종료

공개 URL의 비용과 오용을 막으려면 발표가 끝난 즉시 앱을 중지합니다.

```bash
modal app stop my-tiny-cute-video
```

다시 사용할 때는 `modal deploy modal_backend/modal_app.py`로 배포하면 됩니다.
