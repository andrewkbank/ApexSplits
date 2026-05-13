import { google } from 'googleapis';
import { BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'google-credentials.json');

const SPREADSHEET_ID = '1ZwbNW2unU0GlvwuwtAtP5opqv3p6Ir22Sn53OrCnTLE';

export async function authenticateGoogle(parentWindow: BrowserWindow) {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error('google-credentials.json not found in root directory.');
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Check if we have a stored token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  // No token, start OAuth flow
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  shell.openExternal(authUrl);

  return new Promise((resolve, reject) => {
    // Create a temporary server to listen for the redirect
    const http = require('http');
    const server = http.createServer(async (req: any, res: any) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get('code');
        
        if (code) {
          res.end('Authentication successful! You can close this tab.');
          server.close();
          
          const { tokens } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
          resolve(oAuth2Client);
        } else {
          res.end('No code found in redirect.');
        }
      } catch (err) {
        res.end('Authentication failed.');
        reject(err);
      }
    });

    // Try to parse port from redirect_uri, default to 80
    let port = 80;
    try {
      const uri = new URL(redirect_uris[0]);
      port = uri.port ? parseInt(uri.port) : 80;
    } catch (e) {}

    server.on('error', (e: any) => {
      if (e.code === 'EACCES') {
        reject(new Error(`Permission denied for port ${port}. Please use a high port (e.g., 8080) in your Google Cloud Console redirect URIs.`));
      } else {
        reject(e);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`OAuth server listening on port ${port}`);
    });
  });
}

function getColumnLetter(colIndex: number): string {
  let letter = '';
  while (colIndex > 0) {
    let temp = (colIndex - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    colIndex = (colIndex - temp - 1) / 26;
  }
  return letter;
}

const HEADERS = [
  'Org', 'Letter', 'Buggy', 
  'H1', 'H2', 'FR1', 'FR2', 'H3', 'H4', 'H5', 
  'Front Total', 'Free Total', 'Back Total', 
  'Analysis Total', 'Official Time', /*'Contributor',*/ 'Last Updated'
];

function getSectionStarts(hasPrelims: boolean, hasFinals: boolean) {
  const starts: Record<string, string> = {};
  const sectionWidth = 17; // 16 cols + 1 padding
  let currentOffset = 0;

  if (hasPrelims !== false) {
    starts['Prelim'] = getColumnLetter(currentOffset + 1);
    currentOffset += sectionWidth;
    starts['Prelim_Reroll'] = getColumnLetter(currentOffset + 1);
    currentOffset += sectionWidth;
  }

  if (hasFinals !== false) {
    starts['Final'] = getColumnLetter(currentOffset + 1);
    currentOffset += sectionWidth;
    starts['Final_Reroll'] = getColumnLetter(currentOffset + 1);
    currentOffset += sectionWidth;
  }

  return starts;
}

export async function saveToSheets(auth: any, data: any) {
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetTitle = `${data.category} ${data.year}`;
  
  const sectionStarts = getSectionStarts(data.hasPrelims, data.hasFinals);
  const sectionKey = data.isReroll ? `${data.stage}_Reroll` : data.stage;
  const startCol = sectionStarts[sectionKey] || 'A';

  // 1. Ensure the sheet exists and is sized correctly
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  let targetSheet = spreadsheet.data.sheets?.find(s => s.properties?.title === sheetTitle);

  if (!targetSheet) {
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: { 
            properties: { 
              title: sheetTitle,
              gridProperties: { columnCount: 100, rowCount: 1000 }
            } 
          }
        }]
      }
    });
    targetSheet = response.data.replies?.[0].addSheet;
    const newSheetId = targetSheet?.properties?.sheetId;
    
    // Add Labels (Row 1) and Headers (Row 2) for relevant sections
    for (const key of Object.keys(sectionStarts)) {
      const col = sectionStarts[key];
      const label = key.replace('_', ' ').toUpperCase();
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetTitle}!${col}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[label]] }
      });
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetTitle}!${col}2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [HEADERS] }
      });
    }

    // Add filter to headers (Row 2)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          setBasicFilter: {
            filter: { range: { sheetId: newSheetId, startRowIndex: 1, endRowIndex: 2 } }
          }
        }]
      }
    });
  }

  // 2. Prepare Data Rows
  const startBeep = data.startBeepTime || 0;
  const rows = data.teams.map((team: any, tIdx: number) => {
    const s = data.splits[tIdx] || {};
    
    // Helper to get individual split (only if both markers exist)
    const getIndivSplit = (currIdx: number) => {
      const curr = s[currIdx];
      if (curr === undefined || typeof curr !== 'number') return null;
      const prev = currIdx === 0 ? startBeep : s[currIdx - 1];
      if (prev === undefined || typeof prev !== 'number') return null;
      return Math.max(0, curr - prev);
    };

    // Helper to get section total (requires only start and end of section)
    const getSectionTotal = (startMarker: number | null, endMarkerIdx: number) => {
      const end = s[endMarkerIdx];
      if (startMarker === null || end === undefined || typeof end !== 'number') return null;
      return Math.max(0, end - startMarker);
    };

    const h1 = getIndivSplit(0);
    const h2 = getIndivSplit(1);
    const fr1 = getIndivSplit(2);
    const fr2 = getIndivSplit(3);
    const h3 = getIndivSplit(4);
    const h4 = getIndivSplit(5);
    const h5 = getIndivSplit(6);

    const frontTotal = getSectionTotal(startBeep, 1);
    const freeRollStart = s[1];
    const freeTotal = (typeof freeRollStart === 'number') ? getSectionTotal(freeRollStart, 3) : null;
    const backHillStart = s[3];
    const backTotal = (typeof backHillStart === 'number') ? getSectionTotal(backHillStart, 6) : null;
    const analysisTotal = getSectionTotal(startBeep, 6);

    const format = (val: number | null) => (val !== null && val !== 0) ? val.toFixed(2) : '';

    return [
      team.name, team.letter, team.buggy,
      format(h1), format(h2), format(fr1), format(fr2), format(h3), format(h4), format(h5),
      format(frontTotal), format(freeTotal), format(backTotal),
      format(analysisTotal), team.officialTime || '',
      new Date().toLocaleString()
    ];
  });

  // 3. Overwrite Logic
  const rangeEndColNum = (startCol.charCodeAt(0) - 64) + HEADERS.length;
  // Handle multi-character column letters for BC+
  const getColNum = (col: string) => {
    let num = 0;
    for (let i = 0; i < col.length; i++) {
      num = num * 26 + col.charCodeAt(i) - 64;
    }
    return num;
  };
  const startColNum = getColNum(startCol);
  const actualEndCol = getColumnLetter(startColNum + HEADERS.length);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetTitle}!${startCol}1:${actualEndCol}1000`
  });
  
  const existingRows = response.data.values || [];

  for (const newRow of rows) {
    const org = newRow[0];
    const letter = newRow[1];

    let foundIndex = -1;
    for (let i = 2; i < existingRows.length; i++) {
      const r = existingRows[i];
      if (r && r[0] === org && r[1] === letter) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetTitle}!${startCol}${foundIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] }
      });
      existingRows[foundIndex] = newRow;
    } else {
      let firstEmptyRow = 3;
      while (existingRows[firstEmptyRow - 1] && existingRows[firstEmptyRow - 1][0]) {
        firstEmptyRow++;
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetTitle}!${startCol}${firstEmptyRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] }
      });
      
      while (existingRows.length < firstEmptyRow) existingRows.push([]);
      existingRows[firstEmptyRow - 1] = newRow;
    }
  }

  // 4. Formatting - Resize Columns for ALL sections
  const formatRequests = [];
  const sheetId = targetSheet?.properties?.sheetId || 0;

  for (const key of Object.keys(sectionStarts)) {
    const colStr = sectionStarts[key];
    const sColIdx = getColNum(colStr) - 1;
    
    formatRequests.push(
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: sColIdx, endIndex: sColIdx + 1 }, properties: { pixelSize: 50 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: sColIdx + 1, endIndex: sColIdx + 2 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: sColIdx + 2, endIndex: sColIdx + 3 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: sColIdx + 3, endIndex: sColIdx + 10 }, properties: { pixelSize: 45 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: sColIdx + 10, endIndex: sColIdx + 15 }, properties: { pixelSize: 65 }, fields: 'pixelSize' } }
    );
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: formatRequests }
  });
}
