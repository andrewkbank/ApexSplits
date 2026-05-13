import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

export async function downloadYouTubeVideo(url: string, options: { start?: string, end?: string } = {}) {
  const tempDir = path.join(app.getPath('temp'), 'buggy-splits')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

  const outputName = `video-${Date.now()}.mp4`
  const outputPath = path.join(tempDir, outputName)

  // Use local exe if available, otherwise assume PATH
  const localExe = path.join(process.cwd(), 'yt-dlp.exe')
  const ytDlpCmd = fs.existsSync(localExe) ? localExe : 'yt-dlp'

  // Check for ffmpeg
  const hasFFmpeg = await new Promise(resolve => {
    const { exec } = require('node:child_process')
    exec('ffmpeg -version', (err: any) => resolve(!err))
  })

  // Basic yt-dlp command
  const args = [
    url,
    '--js-runtime', process.execPath,
    '-f', hasFFmpeg 
      ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best' 
      : 'best[ext=mp4]/best', // Prefer single-file MP4 if no FFmpeg
    '-o', outputPath,
  ]

  if (options.start || options.end) {
    // Portions download using --download-sections
    const section = `*${options.start || '0'}-${options.end || 'inf'}`
    args.push('--download-sections', section)
  }

  return new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', args)

    child.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath)
      } else {
        reject(new Error(`yt-dlp exited with code ${code}`))
      }
    })

    child.stderr.on('data', (data) => {
      console.error(`yt-dlp: ${data}`)
    })
  })
}

export async function getVideoInfo(url: string) {
  const localExe = path.join(process.cwd(), 'yt-dlp.exe')
  const ytDlpCmd = fs.existsSync(localExe) ? localExe : 'yt-dlp'

  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpCmd, [
      url, 
      '--js-runtime', process.execPath,
      '--print', '%(title)s|%(duration)s|%(webpage_url)s', 
      '--no-warnings'
    ])
    
    let output = ''
    child.stdout.on('data', (data) => { output += data })
    
    child.on('close', (code) => {
      if (code === 0) {
        const [title, duration, link] = output.trim().split('|')
        resolve({ title, duration: parseFloat(duration), url: link })
      } else {
        reject(new Error(`yt-dlp info failed with code ${code}`))
      }
    })
  })
}
