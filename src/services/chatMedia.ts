// Chat media service: recording, compression, upload, metadata save, and offline queueing.
// Primary store: Supabase Storage (`chat-media` bucket).
// Sync target: Bubble workflow (POST to PHOTO_UPLOAD_URL with metadata).
//
// iOS Safari notes:
//   - MediaRecorder does NOT support audio/webm. Must use audio/mp4, audio/aac, or audio/x-m4a.
//   - Web Speech API is unavailable on iOS, so no client-side transcription.

import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';
import { sendMessage } from './chatApi';
import { getDB } from './db';
import type { ChatFile, ChatFileType, PendingChatFile } from '../types';
import type { Message } from './chatApi';

// ──────────────────────────────────────────────
// AUDIO RECORDING
// ──────────────────────────────────────────────

function getSupportedAudioMime(): string {
  const candidates = ['audio/mp4', 'audio/aac', 'audio/x-m4a'];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return '';
}

export interface RecordedAudio {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  url: string; // object URL for preview
}

export interface AudioRecordingHandle {
  recorder: MediaRecorder;
  stop: () => Promise<RecordedAudio>;
}

export async function startAudioRecording(): Promise<AudioRecordingHandle> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Audio recording is not supported on this device.');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported on this device.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = getSupportedAudioMime();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined
  );
  const chunks: Blob[] = [];
  const startedAt = Date.now();

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  return {
    recorder,
    stop: () =>
      new Promise<RecordedAudio>((resolve, reject) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const effectiveType = recorder.mimeType || mimeType || 'audio/mp4';
          const blob = new Blob(chunks, { type: effectiveType });
          resolve({
            blob,
            mimeType: blob.type,
            durationMs: Date.now() - startedAt,
            url: URL.createObjectURL(blob),
          });
        };
        recorder.onerror = () => {
          stream.getTracks().forEach((t) => t.stop());
          reject(new Error('Audio recording failed'));
        };
        try {
          recorder.stop();
        } catch (e) {
          reject(e);
        }
      }),
  };
}

// ──────────────────────────────────────────────
// IMAGE COMPRESSION
// ──────────────────────────────────────────────

export async function compressImage(file: File | Blob): Promise<Blob> {
  // browser-image-compression accepts Blob but the types declare File. The
  // runtime works for both, so cast to the declared type.
  return imageCompression(file as File, {
    maxSizeMB: 0.5, // 500KB
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    initialQuality: 0.7,
  });
}

// ──────────────────────────────────────────────
// SUPABASE STORAGE UPLOAD
// ──────────────────────────────────────────────

const BUCKET = 'chat-media';

export async function uploadMedia(
  blob: Blob,
  senderId: string,
  fileName: string,
  mimeType: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${senderId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: mimeType, upsert: false });
  if (error) throw new Error('Storage upload failed: ' + error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { storagePath: path, publicUrl: data.publicUrl };
}

// ──────────────────────────────────────────────
// CHAT_FILES METADATA
// ──────────────────────────────────────────────

export async function saveChatFile(params: {
  messageId: string;
  senderId: string;
  storagePath: string;
  publicUrl: string;
  fileType: ChatFileType;
  mimeType: string;
  originalName?: string;
  fileSize: number;
}): Promise<ChatFile> {
  const { data, error } = await supabase
    .from('chat_files')
    .insert({
      message_id: params.messageId,
      sender_id: params.senderId,
      bucket: BUCKET,
      storage_path: params.storagePath,
      public_url: params.publicUrl,
      file_type: params.fileType,
      mime_type: params.mimeType,
      original_name: params.originalName ?? null,
      file_size: params.fileSize,
    })
    .select()
    .single();
  if (error) throw new Error('saveChatFile failed: ' + error.message);
  return data as ChatFile;
}

// ──────────────────────────────────────────────
// ORCHESTRATION (online flow)
// ──────────────────────────────────────────────

function defaultContent(fileType: ChatFileType, originalName?: string): string {
  if (fileType === 'image') return 'Image';
  if (fileType === 'audio') return 'Audio';
  return originalName ?? 'File';
}

export interface SendMediaOptions {
  messageId?: string;
  conversationId: string;
  senderId: string;
  senderEmail: string;
  fileType: ChatFileType;
  mimeType: string;
  originalName?: string;
  blob: Blob;
  content?: string;
  codigo_WO?: string;
  tipo_foto?: 'repair' | 'damage' | 'splinkers' | 'extra';
}

export interface SendMediaResult {
  message: Message;
  chatFile: ChatFile;
}

export async function sendMediaMessage(opts: SendMediaOptions): Promise<SendMediaResult> {
  // 1) Create the message row first
  const content = opts.content && opts.content.trim() !== '' ? opts.content : defaultContent(opts.fileType, opts.originalName);
  const message = await sendMessage(
    opts.conversationId,
    opts.senderId,
    content,
    'text',
    undefined,
    undefined,
    undefined,
    opts.messageId
  );
  if (!message) throw new Error('sendMessage returned null');

  // 2) Upload blob to Supabase Storage
  const safeName = opts.originalName ?? `file_${Date.now()}`;
  const { storagePath, publicUrl } = await uploadMedia(
    opts.blob,
    opts.senderId,
    safeName,
    opts.mimeType
  );

  // 3) Save chat_files row
  const chatFile = await saveChatFile({
    messageId: message.id,
    senderId: opts.senderId,
    storagePath,
    publicUrl,
    fileType: opts.fileType,
    mimeType: opts.mimeType,
    originalName: opts.originalName,
    fileSize: opts.blob.size,
  });

  // 4) Enqueue Bubble sync (will run on next syncQueue cycle)
  if (opts.codigo_WO) {
    await enqueueChatFileSync({
      chatFileId: chatFile.id,
      messageId: message.id,
      conversationId: opts.conversationId,
      senderEmail: opts.senderEmail,
      fileUrl: publicUrl,
      fileType: opts.fileType,
      mimeType: opts.mimeType,
      originalName: opts.originalName,
      codigo_WO: opts.codigo_WO,
      tipo_foto: opts.tipo_foto,
    });
  }

  return {
    message: { ...message, chat_file: chatFile },
    chatFile,
  };
}

// ──────────────────────────────────────────────
// OFFLINE STORAGE (pending chat files)
// ──────────────────────────────────────────────

export async function queueMediaOffline(opts: SendMediaOptions): Promise<string> {
  const db = await getDB();
  const id = opts.messageId ?? `pcf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: PendingChatFile = {
    id,
    conversation_id: opts.conversationId,
    sender_id: opts.senderId,
    sender_email: opts.senderEmail,
    blob: opts.blob,
    file_type: opts.fileType,
    mime_type: opts.mimeType,
    original_name: opts.originalName,
    file_size: opts.blob.size,
    content: opts.content,
    created_at: new Date().toISOString(),
    codigo_WO: opts.codigo_WO,
    tipo_foto: opts.tipo_foto,
  };
  await db.put('pendingChatFiles', entry);
  return id;
}

export async function processPendingChatFiles(): Promise<{ ok: number; fail: number }> {
  if (!navigator.onLine) return { ok: 0, fail: 0 };
  const db = await getDB();
  const items = await db.getAllFromIndex('pendingChatFiles', 'by-created');
  let ok = 0;
  let fail = 0;
  for (const item of items) {
    try {
      await sendMediaMessage({
        messageId: item.id,
        conversationId: item.conversation_id,
        senderId: item.sender_id,
        senderEmail: item.sender_email,
        fileType: item.file_type,
        mimeType: item.mime_type,
        originalName: item.original_name,
        blob: item.blob,
        content: item.content,
        codigo_WO: item.codigo_WO,
        tipo_foto: item.tipo_foto,
      });
      await db.delete('pendingChatFiles', item.id);
      ok++;
    } catch (e) {
      console.warn('pending chat file sync failed:', e);
      fail++;
    }
  }
  return { ok, fail };
}

export async function getPendingChatFileCount(): Promise<number> {
  const db = await getDB();
  return db.count('pendingChatFiles');
}

// ──────────────────────────────────────────────
// BUBBLE SYNC ENQUEUE
// ──────────────────────────────────────────────

// Payload shape sent to Bubble's wf/receive_file workflow.
// Keep these keys in sync with the workflow's parameter definition.
async function enqueueChatFileSync(p: {
  chatFileId: string;
  messageId: string;
  conversationId: string;
  senderEmail: string;
  fileUrl: string;
  fileType: ChatFileType;
  mimeType: string;
  originalName?: string;
  codigo_WO?: string;
  tipo_foto?: 'repair' | 'damage' | 'splinkers' | 'extra';
}) {
  const db = await getDB();
  await db.put('syncQueue', {
    id: `cfq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action: 'send_chat_file',
    chat_file_id: p.chatFileId,
    payload: {
      email_worker: p.senderEmail,
      file_url: p.fileUrl,
      file_type: p.fileType,
      mime_type: p.mimeType,
      original_name: p.originalName ?? null,
      message_id: p.messageId,
      conversation_id: p.conversationId,
      codigo_WO: p.codigo_WO ?? null,
      tipo_foto: p.tipo_foto ?? null,
    },
    attempts: 0,
    max_attempts: 5,
    created_at: new Date().toISOString(),
  });
}
