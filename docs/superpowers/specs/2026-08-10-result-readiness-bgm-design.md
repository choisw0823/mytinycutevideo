# Result Readiness and BGM Design

## Goal

완성 화면이 열렸을 때 결과 MP4를 같은 페이지에서 바로 재생할 수 있게 하고, G-SULEE가 선택한 분위기에 맞는 BGM을 최종 영상에 안정적으로 포함한다.

## Confirmed Causes

- G-SULEE가 `done` 이벤트를 보내면 Modal Dict의 작업 상태가 즉시 `completed`로 바뀐다.
- 결과 MP4가 있는 Modal Volume은 그 이후 `finally`에서 commit된다.
- 브라우저는 완료 상태를 보고 `/result`를 먼저 요청하며, 이 요청은 파일 commit 전이라 404가 될 수 있다. `<video>`는 이 첫 실패를 자동으로 복구하지 않아 검은 화면과 `0:00`을 표시한다.
- G-SULEE의 `pick_bgm()`은 `BGM_DIR/<mood>/*.mp3`에서 음원을 찾지만 현재 Modal 이미지에는 BGM 파일과 `BGM_DIR` 설정이 없다. 따라서 항상 무음 fallback으로 끝난다.

## Result Publication

`render_job.emit()`이 `done` 이벤트를 받으면 다음 순서를 지킨다.

1. 결과 MP4와 관련 작업 파일을 Modal Volume에 commit한다.
2. commit이 끝난 뒤 `done` 이벤트를 Modal Dict에 기록한다.
3. 브라우저 폴링은 그제야 `completed` 상태를 받는다.

완료 상태는 결과 파일이 API 컨테이너에서 조회 가능한 시점 이후에만 공개한다. 오류 이벤트와 중간 진행 이벤트의 기존 처리 방식은 유지한다.

## Browser Recovery

백엔드 순서 보장을 기본 해결책으로 삼되, Modal Volume reload 지연이나 일시적인 네트워크 오류를 위해 플레이어에도 복구 동작을 둔다.

- 완료 화면에서는 플레이어 프레임 안에 `영상 불러오는 중...` 상태를 먼저 표시한다.
- `<video>`가 로드에 실패하면 cache-busting query를 붙인 새 URL로 제한된 횟수만 자동 재시도한다.
- 재시도 간격은 짧은 선형 backoff를 사용해 발표 흐름을 방해하지 않는다.
- 메타데이터가 로드되면 로딩 문구를 숨기고 기존 재생 컨트롤을 그대로 제공한다.
- 모든 재시도가 실패하면 같은 화면에 명확한 오류와 다시 불러오기 버튼을 표시한다.
- MP4 다운로드와 새 영상 만들기 동작은 현재 화면을 벗어나지 않는 기존 방식을 유지한다.

## BGM Packaging

발표용 안정성과 배포 크기의 균형을 위해 FreePD CC0 음원을 무드별 한 곡씩 포함한다.

- 지원 무드는 기존 파이프라인과 같은 `upbeat`, `epic`, `romantic`, `comedy`, `world`, `scoring`, `electronic`, `misc`, `horror` 아홉 가지다.
- 각 폴더에 검증된 MP3 한 곡을 두어 총 아홉 곡만 패키징한다.
- 음원은 프로젝트의 Modal 전용 자산 디렉터리에 두고 Modal render image의 `/root/bgm`에 포함한다.
- render image에 `BGM_DIR=/root/bgm`을 설정한다.
- 실행 중 외부 다운로드는 하지 않는다. 발표 시 외부 음원 서버나 네트워크 상태에 의존하지 않는다.
- G-SULEE의 기존 무드 선택, 대사가 있을 때 BGM 볼륨 0.2, 대사가 없을 때 0.6 혼합 로직은 유지한다.
- 선택된 BGM 이름은 기존 진행 이벤트로 화면에 전달된다.

## Failure Handling

- BGM 디렉터리가 잘못 패키징되면 배포 또는 테스트에서 실패하도록 무드별 MP3 존재 여부를 검증한다.
- 개별 BGM 파일이 손상되었으면 ffprobe 검증에서 실패시킨다.
- 렌더링 중 오디오 합성이 실패하면 기존처럼 경고 이벤트를 남기고 무음 결과라도 생성하여 전체 작업을 잃지 않는다.
- 결과 파일 commit이 실패하면 `completed`를 공개하지 않고 작업을 실패 상태로 전환한다.

## Testing

- 브라우저 회귀 테스트에서 첫 `/result` 요청을 실패시키고 이후 성공시켜, 새로고침 없이 플레이어가 다시 요청하는지 검증한다.
- 다시 불러오기 버튼과 같은 페이지 유지 동작을 검증한다.
- 백엔드 테스트에서 `done` 처리 시 Volume commit이 상태 저장보다 먼저 일어나는 계약을 검증한다.
- 무드별 MP3 파일 존재, 파일 형식, Modal의 `BGM_DIR` 연결을 검증한다.
- TypeScript 검사, 전체 Playwright 테스트, Python 테스트, 프로덕션 빌드를 실행한다.
- Modal을 재배포한 뒤 실제 결과 endpoint의 Range 응답과 BGM 오디오 스트림을 확인한다.

## Deployment

프런트엔드 변경은 Lovable이 사용하는 `main` 브랜치에 반영한다. Modal backend와 BGM image 변경은 `my-tiny-cute-video` 앱을 다시 배포한다. 배포 후 짧은 입력으로 실제 렌더 작업을 한 번 실행하여 웹 재생과 오디오 스트림을 함께 확인한다.
