// Centralized API config — change VERSION to switch between test/prod environments

const VERSION = 'version-test'; // ← change here when going to production (e.g. 'version-live')

export const API_BASE_URL =
  import.meta.env.VITE_BUBBLE_API_URL ||
  `https://system.vrbrightpainting.com/${VERSION}/api/1.1`;

export const PHOTO_UPLOAD_URL =
  'https://vrbcrmsystem.bubbleapps.io/version-test/api/1.1/wf/upload_photo';
export const PHOTO_UPLOAD_TOKEN = '9d461f01be8bc85cf85ae4aad0dc5a07';