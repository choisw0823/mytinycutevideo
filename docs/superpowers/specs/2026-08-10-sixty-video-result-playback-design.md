# 60개 업로드와 결과 재생 복원 설계

## 목표

- 직접 선택한 영상과 ZIP 내부 영상을 최대 60개까지 허용한다.
- 61개 이상은 프런트와 Modal API에서 동일하게 거절한다.
- 총 업로드 및 압축 해제 크기 4GB 제한은 유지한다.
- 완료된 작업 ID를 브라우저에 보존해 새로고침 후에도 결과 영상 화면을 복원한다.
- 완료 직후 결과 MP4는 페이지 안의 `<video>`에서 바로 재생한다.
- 다운로드 버튼은 재생 URL과 분리된 attachment 응답을 JavaScript로 받아, 현재 페이지를 벗어나지 않고 파일 저장을 시작한다.

## 설계

프런트의 `MAX_FILE_COUNT`와 백엔드의 `MAX_FILES`를 모두 60으로 맞춘다. ZIP 검증도 같은 백엔드 상수를 사용하므로 직접 업로드와 ZIP에 동일한 경계를 적용한다.

작업 ID는 사용자가 `새 영상 만들기`를 누를 때만 삭제한다. 완료 또는 실패 시 자동 삭제하지 않아 새로고침 후 상태 API를 다시 조회하고 완료 화면과 `<video>` URL을 재구성할 수 있게 한다. 실패 작업도 같은 화면을 복구해 오류 원인을 잃지 않도록 한다.

결과 API의 기본 `/result` 응답은 `inline`으로 유지한다. 완료 화면은 이 URL을 `<video controls playsInline>`에 연결해 생성 직후 같은 페이지에서 바로 재생한다.

다운로드 동작은 탐색 가능한 `<a href>`가 아니라 버튼 이벤트로 처리한다. 버튼을 누르면 JavaScript가 `/result?download=1`을 `fetch`하고, 성공 응답을 `Blob`과 임시 object URL로 변환한 뒤 `my-tiny-cute-video.mp4` 다운로드를 실행한다. 임시 링크와 object URL은 사용 직후 정리한다. 이 과정에서 라우터나 `window.location`은 변경하지 않으므로 영상 페이지로 이동하지 않는다. 다운로드 중에는 버튼을 비활성화하고 상태를 표시하며, 실패하면 완료 화면을 유지한 채 버튼 주변에 오류를 보여준다.

두 결과 응답 모두 `video/mp4`를 유지한다. `/result`는 브라우저 재생을 위해 HTTP Range를 지원하고, `/result?download=1`은 attachment 응답을 유지한다.

## 검증

- Python 단위 테스트: 영상 60개 허용, 61개 거절.
- Playwright: 60개 선택 가능, 61개 선택 거절.
- Playwright: 완료 후 새로고침해도 결과 화면과 영상 URL 유지.
- Playwright: 완료 화면 안에 영상 플레이어가 표시되고 재생 URL이 `/result`를 사용함.
- Playwright: 다운로드 클릭 시 `/result?download=1`을 요청하고 MP4 다운로드가 시작되며 현재 페이지 URL과 완료 화면이 유지됨.
- Playwright: 다운로드 실패 시 페이지 이동 없이 오류가 표시됨.
- TypeScript, lint, 프로덕션 빌드 및 Modal 배포 후 CORS/Range/inline 헤더 확인.
