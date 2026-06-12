import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // Video & Scraping APIs
  getVideoInfo: (url: string) => ipcRenderer.invoke('get-video-info', url),
  downloadVideo: (url: string, options?: any) => ipcRenderer.invoke('download-video', url, options),
  getRacedayResults: (year: string) => ipcRenderer.invoke('get-raceday-results', year),
  scrapeRaceday: (year: string) => ipcRenderer.invoke('scrape-raceday', year),
  saveToSheets: (data: any) => ipcRenderer.invoke('save-to-sheets', data),
  openFile: () => ipcRenderer.invoke('open-file'),
  exportVideo: (data: any) => ipcRenderer.invoke('export-video', data),
  generateDescription: (data: any) => ipcRenderer.invoke('generate-description', data),
})
