import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { downloadYouTubeVideo, getVideoInfo } from './youtube-handler'
import { scrapeRacedayResults, getTeamsForYear } from './scraper'
import { generateSplitOverlay, generateYouTubeDescription } from './ffmpeg-handler'
import { authenticateGoogle, saveToSheets } from './google-sheets-handler'

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

// Disable hardware acceleration to prevent GPU errors on some systems
app.disableHardwareAcceleration()

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a1a',
      symbolColor: '#ffffff'
    }
  })

  win.maximize()

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Cleanup temporary files on exit
app.on('will-quit', () => {
  const tempDir = path.join(app.getPath('temp'), 'buggy-splits')
  if (fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      console.error('Failed to cleanup temp directory', error)
    }
  }
})

app.whenReady().then(() => {
  // Initial cleanup of any stale files from previous (crashed) sessions
  const tempDir = path.join(app.getPath('temp'), 'buggy-splits')
  if (fs.existsSync(tempDir)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch (e) {}
  }

  // Register protocol for local files
  protocol.registerFileProtocol('local-video', (request, callback) => {
    const url = request.url.replace(/^local-video:\/\//, '')
    // decodeURIComponent to handle spaces/special chars in paths
    try {
      return callback(decodeURIComponent(url))
    } catch (error) {
      console.error('Failed to register protocol', error)
    }
  })

  createWindow()

  // IPC Handlers
  ipcMain.handle('get-video-info', async (_, url) => {
    return await getVideoInfo(url)
  })

  ipcMain.handle('download-video', async (_, url, options) => {
    return await downloadYouTubeVideo(url, options)
  })

  ipcMain.handle('get-raceday-results', async (_, year) => {
    // Reload from disk to ensure we have the latest data (e.g. after regeneration)
    const dbPath = path.join(__dirname, '../src/data/raceday-database.json')
    if (fs.existsSync(dbPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
        return data[year] || null
      } catch (e) {
        console.error('Failed to load raceday database', e)
      }
    }
    return null
  })

  ipcMain.handle('scrape-raceday', async (_, year) => {
    // Check disk first
    const dbPath = path.join(__dirname, '../src/data/raceday-database.json')
    if (fs.existsSync(dbPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
        if (data[year]) return data[year]
      } catch (e) {}
    }
    return await scrapeRacedayResults(year)
  })

  ipcMain.handle('open-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi'] }]
    })
    if (!canceled) return filePaths[0]
  })

  ipcMain.handle('export-video', async (_, videoPath, splits, teams) => {
    return await generateSplitOverlay(videoPath, splits, teams)
  })

  ipcMain.handle('generate-description', async (_, data) => {
    return generateYouTubeDescription(data)
  })

  ipcMain.handle('save-to-sheets', async (event, data) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)
    if (!parentWindow) throw new Error('No parent window found')
    
    const auth = await authenticateGoogle(parentWindow)
    return await saveToSheets(auth, data)
  })
})
