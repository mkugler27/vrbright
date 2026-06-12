import type { ChatFileType } from '../../types';
import { AudioPlayer } from './AudioPlayer';

export interface MediaPreviewItem {
  blob: Blob;
  type: ChatFileType;
  url: string;
  mimeType: string;
  name?: string;
  durationMs?: number;
}

export interface MediaPreviewProps {
  media: MediaPreviewItem;
  onRemove: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPreview({ media, onRemove }: MediaPreviewProps) {
  return (
    <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center gap-3">
      {media.type === 'image' && (
        <img
          src={media.url}
          alt="preview"
          className="w-16 h-16 object-cover rounded-lg border border-gray-200 shrink-0"
        />
      )}
      {media.type === 'audio' && (
        <div className="flex-1 min-w-0">
          <AudioPlayer url={media.url} />
        </div>
      )}
      {media.type === 'file' && (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{media.name ?? 'File'}</p>
            <p className="text-xs text-gray-500">{formatSize(media.blob.size)}</p>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 active:scale-90 transition-all"
        aria-label="Remove attachment"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
