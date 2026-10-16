// Helpers for photos, videos and voice notes on the post timeline.

export const MAX_VIDEO_SECONDS = 30;
export const MAX_VIDEO_MB = 25;
export const MAX_VOICE_SECONDS = 180;

// Phone photos are 3–8 MB; a 1280 px JPEG is ~200 KB and still clear enough.
export function compressImage(file, maxSide = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read the photo.'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the photo.')); };
    img.src = url;
  });
}

// Length of a video file in seconds (read from the file, nothing is uploaded).
export function videoSeconds(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration || 0); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
}

// The first recording format this browser can make (Android Chrome: webm, iPhone Safari: mp4).
export function recorderType(kind) {
  const list = kind === 'video'
    ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  if (typeof MediaRecorder === 'undefined') return null;
  return list.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

// "0:07"
export const clock = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
