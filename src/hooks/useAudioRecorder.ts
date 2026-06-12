import { useRef, useState, useCallback } from 'react';
import {
  startAudioRecording,
  type RecordedAudio,
  type AudioRecordingHandle,
} from '../services/chatMedia';

export interface UseAudioRecorderResult {
  isRecording: boolean;
  durationMs: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<RecordedAudio | null>;
  cancel: () => void;
}

const MIN_DURATION_MS = 800;

export function useAudioRecorder(): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<AudioRecordingHandle | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  const clearTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const start = useCallback(async () => {
    if (isRecording) return;
    setError(null);
    try {
      const handle = await startAudioRecording();
      handleRef.current = handle;
      startedAtRef.current = Date.now();
      setIsRecording(true);
      setDurationMs(0);
      tickRef.current = setInterval(() => {
        setDurationMs(Date.now() - startedAtRef.current);
      }, 100);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start recording';
      setError(msg);
      setIsRecording(false);
    }
  }, [isRecording]);

  const stop = useCallback(async (): Promise<RecordedAudio | null> => {
    if (!handleRef.current) return null;
    clearTick();
    const handle = handleRef.current;
    handleRef.current = null;
    setIsRecording(false);
    try {
      const r = await handle.stop();
      setDurationMs(r.durationMs);
      if (r.durationMs < MIN_DURATION_MS) {
        // too short — discard
        URL.revokeObjectURL(r.url);
        return null;
      }
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Recording failed';
      setError(msg);
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearTick();
    if (handleRef.current) {
      try {
        // stop the recorder but don't bother awaiting
        handleRef.current.stop().catch(() => undefined);
      } catch {
        // ignore
      }
      handleRef.current = null;
    }
    setIsRecording(false);
    setDurationMs(0);
  }, []);

  return { isRecording, durationMs, error, start, stop, cancel };
}
