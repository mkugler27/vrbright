import { useRef, useState, useEffect } from 'react';

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface AudioPlayerProps {
  url: string;
  transcription?: string | null;
  inverted?: boolean;
}

/**
 * Decode the audio file via fetch + AudioContext.decodeAudioData to get a
 * reliable duration, then serve it to <audio> as a blob URL.
 */
function useAudioBlobAndDuration(url: string): { blobUrl: string | null; duration: number } {
  const [state, setState] = useState<{ blobUrl: string | null; duration: number }>({
    blobUrl: null,
    duration: 0,
  });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    let audioCtx: AudioContext | null = null;

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn('[audio] fetch failed', res.status, url);
          return;
        }
        const blob = await res.blob();
        createdUrl = URL.createObjectURL(blob);

        // Try to decode to get duration
        try {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          if (!cancelled) {
            setState({ blobUrl: createdUrl, duration: audioBuffer.duration });
          }
        } catch (decodeErr) {
          console.warn('[audio] decode failed, falling back to duration=0', decodeErr);
          if (!cancelled) {
            setState({ blobUrl: createdUrl, duration: 0 });
          }
        }
      } catch (e) {
        console.warn('[audio] fetch error', e);
      } finally {
        if (audioCtx) audioCtx.close().catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  return state;
}

export function AudioPlayer({ url, transcription, inverted = false }: AudioPlayerProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const { blobUrl, duration: decodedDuration } = useAudioBlobAndDuration(url);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => setProgress(a.currentTime);
    const onEnd = () => { setPlaying(false); setProgress(0); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
    };
  }, [blobUrl]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play()
        .then(() => setPlaying(true))
        .catch(err => console.warn('[audio] play failed:', err));
    }
  };

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a || !decodedDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * decodedDuration;
    setProgress(a.currentTime);
  };

  const trackColor = inverted ? 'bg-white/30' : 'bg-gray-200';
  const fillColor = inverted ? 'bg-white' : 'bg-blue-600';
  const textColor = inverted ? 'text-blue-100' : 'text-gray-500';
  const iconColor = inverted ? 'text-white' : 'text-gray-700';
  const pct = decodedDuration > 0 ? (progress / decodedDuration) * 100 : 0;

  return (
    <div className="flex flex-col gap-1 min-w-[200px]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={!blobUrl}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            inverted ? 'bg-white/20 hover:bg-white/30' : 'bg-blue-100 hover:bg-blue-200'
          } ${!blobUrl ? 'opacity-50' : ''}`}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg className={`w-4 h-4 ${iconColor}`} fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg className={`w-4 h-4 ${iconColor} ml-0.5`} fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div
          onClick={onSeek}
          className={`flex-1 h-1.5 rounded-full overflow-hidden cursor-pointer ${trackColor}`}
        >
          <div
            className={`h-full ${fillColor} transition-[width] duration-100`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-[10px] tabular-nums ${textColor}`}>
          {formatDuration(progress)} / {formatDuration(decodedDuration)}
        </span>
      </div>
      {transcription && (
        <p className={`text-xs italic break-words ${textColor}`}>{transcription}</p>
      )}
      {blobUrl && <audio ref={ref} src={blobUrl} preload="auto" />}
    </div>
  );
}
