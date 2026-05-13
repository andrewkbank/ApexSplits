import ffmpeg from 'fluent-ffmpeg'
import path from 'node:path'
import { app } from 'electron'

export async function generateSplitOverlay(videoPath: string, splits: any, teams: string[]) {
  const outputPath = path.join(app.getPath('videos'), `buggy-overlay-${Date.now()}.mp4`)
  
  // Example FFmpeg command logic
  // We use the drawtext filter to overlay names and times
  let command = ffmpeg(videoPath)
  
  // Complexity: We need to calculate when each split starts/ends
  // and apply filters dynamically.
  // For a simple demo, I'll show the concept of drawtext.
  
  const filters = teams.map((team, i) => {
    return {
      filter: 'drawtext',
      options: {
        text: `${team}`,
        x: 50,
        y: 100 + (i * 40),
        fontsize: 24,
        color: 'white',
        box: 1,
        boxcolor: 'black@0.5'
      }
    }
  })

  return new Promise((resolve, reject) => {
    command
      .videoFilters(filters)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run()
  })
}

export function generateYouTubeDescription(data: any) {
  let desc = `CMU Buggy Race Splits - ${data.year} ${data.category} Heat ${data.heat}\n\n`
  
  data.teams.forEach((team: string, tIdx: number) => {
    if (!team) return
    desc += `Team: ${team}\n`
    Object.entries(data.splits[tIdx]).forEach(([sIdx, time]: any) => {
      const splitName = ['Hill 1', 'Hill 2', 'FR 1', 'FR 2', 'Hill 3', 'Hill 4', 'Hill 5'][sIdx]
      desc += `${time.toFixed(2)} - ${splitName}\n`
    })
    desc += '\n'
  })
  
  return desc
}
