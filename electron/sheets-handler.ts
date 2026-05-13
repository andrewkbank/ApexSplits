import { google } from 'googleapis'
import { app, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
const TOKEN_PATH = path.join(app.getPath('userData'), 'token.json')
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json')

export class SheetsService {
  private auth: any
  private spreadsheetId: string = ''

  constructor(spreadsheetId?: string) {
    if (spreadsheetId) this.spreadsheetId = spreadsheetId
  }

  async authorize() {
    // In a real app, you'd provide these in credentials.json
    // For this demo, I'll assume they exist or use a simplified flow
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      throw new Error('Missing credentials.json for Google Sheets API')
    }

    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8')
    const keys = JSON.parse(content)
    const { client_secret, client_id, redirect_uris } = keys.installed
    this.auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

    if (fs.existsSync(TOKEN_PATH)) {
      const token = fs.readFileSync(TOKEN_PATH, 'utf-8')
      this.auth.setCredentials(JSON.parse(token))
    } else {
      // Trigger OAuth flow
      const authUrl = this.auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES })
      shell.openExternal(authUrl)
      // Note: You'd need a local server or a way to receive the code
      // For now, I'll assume the user provides it manually or we have a callback
    }
  }

  async getHeatData(year: string, category: string, heatNumber: string) {
    const sheets = google.sheets({ version: 'v4', auth: this.auth })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Sheet1!A:Z', // Adjust range as needed
    })

    const rows = res.data.values
    if (!rows || rows.length === 0) return null

    // Search for matching metadata (assuming Year, Category, Heat# are in columns A, B, C)
    const match = rows.find(row => 
      row[0] === year && 
      row[1] === category && 
      row[2] === heatNumber
    )

    if (match) {
      // Map row to a split object
      return {
        year: match[0],
        category: match[1],
        heat: match[2],
        teamA: match[3],
        teamB: match[4],
        teamC: match[5],
        splits: JSON.parse(match[6] || '{}')
      }
    }
    return null
  }

  async saveHeatData(data: any) {
    const sheets = google.sheets({ version: 'v4', auth: this.auth })
    // logic to append or update
    const value = [
      data.year, data.category, data.heat,
      data.teamA, data.teamB, data.teamC,
      JSON.stringify(data.splits)
    ]

    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [value] },
    })
  }
}
