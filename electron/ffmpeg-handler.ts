import ffmpeg from 'fluent-ffmpeg'
import path from 'node:path'
import { app } from 'electron'
import fs from 'node:fs'
import { getFFmpegPaths } from './ffmpeg-config'

const { ffmpegPath, ffprobePath } = getFFmpegPaths()
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath)

const SPLIT_NAMES = ['Hill 1', 'Hill 2', 'FR 1', 'FR 2', 'Hill 3', 'Hill 4', 'Hill 5']

export async function generateSplitOverlay(data: {
  videoPath: string,
  splits: Record<number, Record<number, number>>,
  teams: { name: string, letter: string }[],
  startBeepTime: number,
  year?: string,
  category?: string,
  stage?: string
}) {
  const { videoPath, splits, teams, startBeepTime, year, category, stage } = data
  const metadataStr = [year, category, stage].filter(Boolean).join('-').replace(/\s+/g, '')
  const filename = metadataStr ? `ApexSplits-${metadataStr}-${Date.now()}.mp4` : `ApexSplits-${Date.now()}.mp4`
  const outputPath = path.join(app.getPath('videos'), filename)
  const descriptionPath = path.join(app.getPath('videos'), filename.replace('.mp4', '-Description.txt'))

  // 1. Calculate Segment Times and Cumulative Times
  const segmentTimes: Record<number, Record<number, number>> = {} // [splitIdx][teamIdx]
  const cumulativeTimes: Record<number, Record<number, number>> = {}
  const leaderCumulative: Record<number, number> = {} // [splitIdx]

  SPLIT_NAMES.forEach((_, sIdx) => {
    let minCumulative = Infinity
    teams.forEach((team, tIdx) => {
      if (!team.name) return
      const currentAbs = splits[tIdx]?.[sIdx]
      const prevAbs = sIdx === 0 ? startBeepTime : splits[tIdx]?.[sIdx - 1]

      if (currentAbs !== undefined) {
        const cumulative = currentAbs - startBeepTime
        if (!cumulativeTimes[sIdx]) cumulativeTimes[sIdx] = {}
        cumulativeTimes[sIdx][tIdx] = cumulative
        if (cumulative < minCumulative) minCumulative = cumulative

        if (prevAbs !== undefined) {
          const duration = currentAbs - prevAbs
          if (!segmentTimes[sIdx]) segmentTimes[sIdx] = {}
          segmentTimes[sIdx][tIdx] = duration
        }
      }
    })
    if (minCumulative !== Infinity) leaderCumulative[sIdx] = minCumulative
  })

  // 2. Determine Video Bounds
  let maxTime = startBeepTime
  Object.values(splits).forEach(teamSplits => {
    Object.values(teamSplits).forEach(time => {
      if (time > maxTime) maxTime = time
    })
  })
  const endTime = maxTime + 4.0
  const duration = endTime - startBeepTime

  // 2.5 Calculate Event Times for Animations
  // A) Vertical Swapping (Rank changes)
  const events = new Set<number>()
  events.add(0) // initial
  teams.forEach((team, tIdx) => {
    Object.values(splits[tIdx] || {}).forEach(absTime => {
      events.add(absTime - startBeepTime)
    })
  })
  const sortedEvents = Array.from(events).sort((a, b) => a - b)

  const getTeamState = (tIdx: number, t: number) => {
    let completedSplits = -1
    let lastTime = 0
    SPLIT_NAMES.forEach((_, sIdx) => {
      const absTime = splits[tIdx]?.[sIdx]
      if (absTime !== undefined && (absTime - startBeepTime) <= t + 0.001) {
        completedSplits = sIdx
        lastTime = absTime - startBeepTime
      }
    })
    return { completedSplits, lastTime }
  }

  let prevRanks: Record<number, number> = {}
  const initialStates = teams.map((_, tIdx) => ({ tIdx, ...getTeamState(tIdx, 0) }))
  initialStates.sort((a, b) => {
    if (a.completedSplits !== b.completedSplits) return b.completedSplits - a.completedSplits
    if (a.lastTime !== b.lastTime) return a.lastTime - b.lastTime
    return a.tIdx - b.tIdx
  })
  initialStates.forEach((state, rank) => { prevRanks[state.tIdx] = rank })
  const initialRanks = { ...prevRanks }

  const rankChanges: Record<number, { eventTime: number, delta: number }[]> = {}
  teams.forEach((_, tIdx) => { rankChanges[tIdx] = [] })

  sortedEvents.forEach(eventTime => {
    if (eventTime === 0) return
    const states = teams.map((_, tIdx) => ({ tIdx, ...getTeamState(tIdx, eventTime) }))
    states.sort((a, b) => {
      if (a.completedSplits !== b.completedSplits) return b.completedSplits - a.completedSplits
      if (a.lastTime !== b.lastTime) return a.lastTime - b.lastTime
      return a.tIdx - b.tIdx
    })
    
    const currentRanks: Record<number, number> = {}
    states.forEach((state, rank) => { currentRanks[state.tIdx] = rank })
    
    teams.forEach((_, tIdx) => {
      const delta = currentRanks[tIdx] - prevRanks[tIdx]
      if (delta !== 0) {
        rankChanges[tIdx].push({ eventTime, delta })
      }
    })
    prevRanks = { ...currentRanks }
  })

  // B) Horizontal Sliding (Leader reaches split)
  const leaderTimes: number[] = []
  SPLIT_NAMES.forEach((_, sIdx) => {
    let minTime = Infinity
    teams.forEach((team, tIdx) => {
      const time = splits[tIdx]?.[sIdx]
      if (time !== undefined && time < minTime) minTime = time
    })
    if (minTime !== Infinity) leaderTimes[sIdx] = minTime - startBeepTime
  })

  const D_swap = 1.0
  const D_slide = 1.0

  // 3. Build FFmpeg Filters
  const filters: any[] = []

  // Background Box for Overlay (Bottom Right)
  const boxWidth = 380
  const boxHeight = 160
  const margin = 20

  filters.push({
    filter: 'drawbox',
    options: {
      x: `iw-${boxWidth + margin}`,
      y: `ih-${boxHeight + margin}`,
      w: boxWidth,
      h: boxHeight,
      color: 'black@0.6',
      thickness: 'fill'
    }
  })

  // Global Timer (formatted to MM:SS.ms)
  filters.push({
    filter: 'drawtext',
    options: {
      text: "'TIME\\: %{eif\\:trunc(t/60)\\:d\\:2}\\:%{eif\\:trunc(t-trunc(t/60)*60)\\:d\\:2}.%{eif\\:t*100-trunc(t)*100\\:d\\:2}'",
      x: `main_w-${boxWidth + margin - 10}`,
      y: `main_h-${boxHeight + margin - 10}`,
      fontsize: 32,
      fontcolor: 'yellow'
    }
  })

  // Per-Team Rows
  teams.forEach((team, tIdx) => {
    if (!team.name) return
    const teamName = `${team.name} ${team.letter}`.toUpperCase()

    let rankExpr = `${initialRanks[tIdx]}`
    rankChanges[tIdx].forEach(change => {
      rankExpr += ` + (${change.delta})*min(max((t-${change.eventTime})/${D_swap}, 0), 1)`
    })
    const baseLineY = `main_h-${boxHeight + margin - 50} + (${rankExpr}) * 35`

    // Team Label
    filters.push({
      filter: 'drawtext',
      options: {
        text: `'${teamName}'`,
        x: `main_w-${margin + 280}-tw`,
        y: baseLineY,
        fontsize: 24,
        fontcolor: 'white'
      }
    })

    // Split Markers for this team
    SPLIT_NAMES.forEach((sName, sIdx) => {
      const splitTime = splits[tIdx]?.[sIdx]
      if (splitTime === undefined) return

      const segDuration = segmentTimes[sIdx][tIdx]
      const teamCumul = cumulativeTimes[sIdx][tIdx]
      const leaderCumul = leaderCumulative[sIdx]
      const diff = teamCumul - leaderCumul
      const diffText = diff > 0 ? `+${diff.toFixed(2)}` : 'LEADER'

      const relTeamTime = splitTime - startBeepTime
      const nextRelTeamTime = splits[tIdx]?.[sIdx + 1] ? splits[tIdx][sIdx + 1] - startBeepTime : duration

      // Static Diff Text
      filters.push({
        filter: 'drawtext',
        options: {
          text: `'${diffText}'`,
          x: `main_w-${margin + 80}`,
          y: baseLineY,
          fontsize: 22,
          fontcolor: diff === 0 ? 'springgreen' : 'white',
          enable: `between(t, ${relTeamTime}, ${nextRelTeamTime})`
        }
      })

      // Sliding Segment Duration Text
      const getClamp = (eventT: number) => `min(max((t-${eventT})/${D_slide}, 0), 1)`
      const LS = leaderTimes[sIdx] !== undefined ? leaderTimes[sIdx] : Infinity
      const LS1 = leaderTimes[sIdx + 1] !== undefined ? leaderTimes[sIdx + 1] : Infinity
      const LS2 = leaderTimes[sIdx + 2] !== undefined ? leaderTimes[sIdx + 2] : Infinity

      let xExpr = `main_w-${margin + 80}`
      let alphaExpr = `0`

      if (LS !== Infinity) {
        xExpr += ` - 100*${getClamp(LS)}`
        alphaExpr += ` + 1*${getClamp(LS)}`
      }
      if (LS1 !== Infinity) {
        xExpr += ` - 80*${getClamp(LS1)}`
        alphaExpr += ` - 0.5*${getClamp(LS1)}`
      }
      if (LS2 !== Infinity) {
        xExpr += ` - 80*${getClamp(LS2)}`
        alphaExpr += ` - 0.5*${getClamp(LS2)}`
      }

      filters.push({
        filter: 'drawtext',
        options: {
          text: `'${segDuration.toFixed(2)}'`,
          x: xExpr,
          y: baseLineY,
          alpha: alphaExpr,
          fontsize: 22,
          fontcolor: 'white',
          enable: `gte(t, ${relTeamTime})`
        }
      })
    })
  })


  return new Promise((resolve, reject) => {
    let command = ffmpeg(videoPath)
      .inputOptions([`-ss ${startBeepTime}`])
      .outputOptions([
        `-t ${duration}`,
        '-pix_fmt yuv420p',
        '-preset superfast',
        '-crf 23',
        '-f mp4'
      ])
      .videoFilters([
        { filter: 'setpts', options: 'PTS-STARTPTS' },
        ...filters
      ])
      .videoCodec('libx264')
      .audioCodec('aac')
      .output(outputPath)
      .on('start', (cmd: string) => console.log('FFmpeg started:', cmd))
      .on('end', () => {
        // Write the YouTube description to a file
        try {
          const desc = generateYouTubeDescription(data)
          fs.writeFileSync(descriptionPath, desc)
          console.log(`Wrote description to ${descriptionPath}`)
        } catch (err: any) {
          console.error('Failed to write YouTube description:', err)
        }
        resolve(outputPath)
      })
      .on('error', (err: any, stdout: any, stderr: any) => {
        console.error('FFmpeg error:', err)
        console.error('FFmpeg stderr:', stderr)
        reject(err)
      })
      
    command.run()
  })
}

export function generateYouTubeDescription(data: any) {
  const teamNames = data.teams
    .filter((t: any) => t && t.name)
    .map((t: any) => `${t.name} ${t.letter}`.trim())
    .join(' | ')

  const stageFormatted = data.stage
    ? (data.stage.toLowerCase().includes('prelim') ? 'prelim' : 'finals')
    : ''

  const suffix = [
    data.year,
    data.category ? data.category.toLowerCase() : '',
    stageFormatted,
    data.isReroll ? 'reroll' : ''
  ].filter(Boolean).join(' ')

  const title = `${teamNames} - ${suffix}`

  let desc = `${title}\n\n`
  desc += `CMU Buggy Race Splits - ${data.year || ''} ${data.category || ''} ${data.stage || ''}${data.isReroll ? ' (Reroll)' : ''}\n\n`
  
  data.teams.forEach((team: any) => {
    if (!team || !team.name) return
    const buggyText = team.buggy ? ` (${team.buggy})` : ''
    const timeText = team.officialTime ? ` - ${team.officialTime}` : ''
    desc += `${team.name} ${team.letter}${buggyText}${timeText}\n`
  })
  
  desc += `\nGenerated by ApexSplits`
  
  return desc
}
