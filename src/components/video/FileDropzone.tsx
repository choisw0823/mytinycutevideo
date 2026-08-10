import { FileArchive, Film, Plus, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".avi", ".mkv"];
const MAX_FILE_COUNT = 60;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function validateVideoFiles(files: File[]) {
  if (!files.length) return "파일을 한 개 이상 선택해 주세요";
  if (files.length > MAX_FILE_COUNT) return `영상은 최대 ${MAX_FILE_COUNT}개까지 선택할 수 있어요`;
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
    return "전체 파일 크기는 4GB를 넘을 수 없어요";
  }

  const extensions = files.map((file) => extensionOf(file.name));
  const zipCount = extensions.filter((extension) => extension === ".zip").length;
  if (extensions.some((extension) => extension !== ".zip" && !VIDEO_EXTENSIONS.includes(extension))) {
    return "지원하지 않는 파일 형식입니다";
  }
  if (zipCount && (zipCount !== 1 || files.length !== 1)) {
    return "ZIP 파일은 다른 영상과 함께 선택할 수 없어요";
  }
  return null;
}

export function FileDropzone({
  files,
  onFilesChange,
  error,
  onError,
  disabled = false,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  error: string | null;
  onError: (error: string | null) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const totalBytes = useMemo(
    () => files.reduce((total, file) => total + file.size, 0),
    [files],
  );

  useEffect(() => {
    const urls = files.map((file) =>
      extensionOf(file.name) === ".zip" ? "" : URL.createObjectURL(file),
    );
    setPreviewUrls(urls);
    return () => urls.forEach((url) => url && URL.revokeObjectURL(url));
  }, [files]);

  const acceptFiles = (nextFiles: File[]) => {
    const validationError = validateVideoFiles(nextFiles);
    onError(validationError);
    if (!validationError) onFilesChange(nextFiles);
  };

  const removeFile = (index: number) => {
    const next = files.filter((_, fileIndex) => fileIndex !== index);
    onFilesChange(next);
    onError(null);
    if (!next.length && inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="file-picker">
      <input
        ref={inputRef}
        id={inputId}
        className="sr-only"
        type="file"
        aria-label="영상 파일"
        accept=".zip,.mp4,.mov,.m4v,.avi,.mkv,video/*"
        multiple
        disabled={disabled}
        onChange={(event) => acceptFiles(Array.from(event.target.files ?? []))}
      />

      <label
        htmlFor={inputId}
        className={`dropzone${dragging ? " is-dragging" : ""}${disabled ? " is-disabled" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) acceptFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <span className="dropzone-icon" aria-hidden="true">
          <UploadCloud size={26} />
        </span>
        <strong>{files.length ? "다른 순간 더하기" : "영상 속 순간을 꺼내 놓아 주세요"}</strong>
        <span>클릭하거나 이곳에 끌어다 놓기</span>
        <small>ZIP 한 개 또는 MP4 · MOV · M4V · AVI · MKV 여러 개</small>
      </label>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <div className="selected-files">
          <div className="selected-files-summary">
            <span>{files.length}개의 순간</span>
            <span>{formatBytes(totalBytes)}</span>
          </div>
          <div className="file-strip">
            {files.map((file, index) => (
              <article className="file-polaroid" key={`${file.name}-${file.lastModified}`}>
                <div className="file-preview">
                  {previewUrls[index] ? (
                    <video src={previewUrls[index]} muted preload="metadata" />
                  ) : (
                    <FileArchive size={30} aria-hidden="true" />
                  )}
                  {!previewUrls[index] && <span>ZIP</span>}
                  {previewUrls[index] && <Film size={18} aria-hidden="true" />}
                </div>
                <p title={file.name}>{file.name}</p>
                <button
                  type="button"
                  aria-label={`${file.name} 삭제`}
                  onClick={() => removeFile(index)}
                  disabled={disabled}
                >
                  <Trash2 size={15} />
                </button>
              </article>
            ))}
            <button
              type="button"
              className="add-file-card"
              aria-label="영상 더 선택하기"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
            >
              <Plus size={21} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
