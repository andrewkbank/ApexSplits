# ApexSplits

ApexSplits is a high-precision race analysis tool designed for **CMU Buggy Raceday**. It allows analysts to capture frame-accurate split times from YouTube videos or local footage and sync them directly to a master Google Spreadsheet.

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
   - Go to the [Google Cloud Console](https://console.cloud.google.com/).
   - Create a new project.
   - Enable the **Google Sheets API**.
   - Configure the **OAuth Consent Screen** (Internal or External).
   - Create **OAuth 2.0 Client ID** credentials (Desktop App).
   - Download the JSON file, rename it to `google-credentials.json`, and place it in the **root directory** of this project.

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
