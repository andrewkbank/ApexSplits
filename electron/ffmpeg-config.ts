import { app } from 'electron';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

/**
 * Resolves binary paths for FFmpeg and FFprobe, 
 * correctly handling Electron's ASAR packing.
 */
export function getFFmpegPaths() {
  let ffmpegResolvedPath = ffmpegPath;
  let ffprobeResolvedPath = ffprobeStatic.path;

  // In production, binaries are often moved to app.asar.unpacked
  if (app.isPackaged) {
    ffmpegResolvedPath = ffmpegResolvedPath?.replace('app.asar', 'app.asar.unpacked');
    ffprobeResolvedPath = ffprobeResolvedPath?.replace('app.asar', 'app.asar.unpacked');
  }

  console.log('[FFmpeg Config] Resolved paths:', { ffmpegResolvedPath, ffprobeResolvedPath });

  return {
    ffmpegPath: ffmpegResolvedPath,
    ffprobePath: ffprobeResolvedPath,
  };
}
