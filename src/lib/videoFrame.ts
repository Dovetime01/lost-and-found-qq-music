export const VIDEO_FRAME_JPEG_QUALITY = 0.8

export function selectVideoFrameTime(durationSeconds: number) {
  return Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds * 0.5
    : 0.1
}
