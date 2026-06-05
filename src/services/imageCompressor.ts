import imageCompression from 'browser-image-compression';

const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.7,
};

export async function compressImage(file: File): Promise<Blob> {
  return imageCompression(file, COMPRESSION_OPTIONS);
}

export async function createThumbnail(file: File): Promise<Blob> {
  return imageCompression(file, {
    maxSizeMB: 0.05,
    maxWidthOrHeight: 200,
    useWebWorker: true,
    initialQuality: 0.6,
  });
}
