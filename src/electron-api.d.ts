export interface IElectronAPI {
  on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
  off: (channel: string, listener: (event: any, ...args: any[]) => void) => void
  send: (channel: string, ...args: any[]) => void
  invoke: (channel: string, ...args: any[]) => Promise<any>
  getVideoInfo: (url: string) => Promise<{ title: string, duration: number, url: string }>
  downloadVideo: (url: string, options?: { start?: string, end?: string }) => Promise<string>
  getRacedayResults: (year: string) => Promise<any>
  scrapeRaceday: (year: string) => Promise<any>
  saveToSheets: (data: any) => Promise<void>
  openFile: () => Promise<string | undefined>
  exportVideo: (videoPath: string, splits: any, teams: string[]) => Promise<string>
  generateDescription: (data: any) => Promise<string>
}

declare global {
  interface Window {
    ipcRenderer: IElectronAPI
  }
}
