# ApexSplits

ApexSplits is a high-precision race analysis tool designed for **CMU Buggy Raceday**. It allows analysts to capture frame-accurate split times from YouTube videos or local footage and sync them directly to a [master Google Spreadsheet](https://docs.google.com/spreadsheets/d/1ZwbNW2unU0GlvwuwtAtP5opqv3p6Ir22Sn53OrCnTLE/edit?usp=sharing).

![Apex Logo](/public/apex.svg)

## Features

- **Frame-Accurate Splits**: Use keyboard shortcuts or on-screen controls to mark splits with millisecond precision.
- **Dynamic Google Sheets Integration**: 
    - Automatically creates/detects sheets based on Year and Category (e.g., "Men 2026").
    - Intelligent layout shifting for single-day race years.
    - Robust duplicate detection (overwrites existing team entries).
- **Historical Records**: Instant access to scraped Raceday results from 2012-2026 for reference.
- **In-App Guide**: Built-in instructions with visual markers for all transition lines (Hill 1-5, Freeroll).
- **YouTube Support**: Download and analyze race footage directly via URL.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [npm](https://www.npmjs.com/)

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/andrewkbank/ApexSplits.git
   cd ApexSplits
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Google Sheets Setup (Required for Saving)**:
   - Easy method (If you are on Apex)
     - When requesting access to the master sheets, also ask for access to the official `google-credentials.json` file.
     - Download the JSON, and place it in the root directory.
    
   **If you are not on Apex**, for security reasons, you cannot have the official `google-credentials.json` file. The application can still be used to save splits to your clipboard. Additionally, if you are still interested in contributing to the master sheet, follow these directions:
   - **Step A: App Credentials**: 
     - Go to the [Google Cloud Console](https://console.cloud.google.com/).
     - Create a project and enable the **Google Sheets API**.
     - Create **OAuth 2.0 Client ID** credentials (Desktop App).
     - Download the JSON, rename to `google-credentials.json`, and place it in the root directory.
   - **Step B: Spreadsheet Access**:
     - The app is hardcoded to save to the [Apex Master Sheet](https://docs.google.com/spreadsheets/d/1ZwbNW2unU0GlvwuwtAtP5opqv3p6Ir22Sn53OrCnTLE/edit).
     - **Crucial**: You must request "Editor" access to this specific sheet from the Apex administrator (`cmu.apex@gmail.com`). 
     - Your Google account must have permission to edit the sheet for the app's save function to work.

## Development

To run the application in development mode:
```bash
npm run electron:dev
```

## Usage

1. **Load Video**: Paste a YouTube URL or path to a local MP4 file.
2. **Metadata**: Select the Year, Category (Men/Women), and Stage (Prelim/Final).
3. **Mark Beep**: Click "Mark" when the starting buzzer sounds.
4. **Mark Splits**: Play the video and click "Mark" for each team as they cross the transition lines.
    - **Keys 1, 2, 3**: Quick-mark for Team A, B, or C.
    - **Shift + Arrows**: Frame-by-frame seeking.
    - **Space**: Play/Pause.
5. **Save**: Click "Save to Google Sheets" to upload the results.

## Configuration

The master Spreadsheet ID is currently hardcoded in `electron/google-sheets-handler.ts`. Change `SPREADSHEET_ID` to your own spreadsheet if you wish to use a different destination.

## Security Note

The `.gitignore` is configured to exclude `google-credentials.json` and `token.json`. **Never commit these files to a public repository.**

## License

MIT - See [LICENSE](LICENSE) for details.
