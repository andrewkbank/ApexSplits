import { scrapeRacedayResults } from './scraper'
import fs from 'node:fs'
import path from 'node:path'

async function generateDatabase() {
  const db: any = {}
  const years = Array.from({ length: 2026 - 2012 + 1 }, (_, i) => (2026 - i).toString())
  
  console.log(`Generating database for years: ${years.join(', ')}...`)
  
  for (const year of years) {
    console.log(`Scraping ${year}...`)
    const results = await scrapeRacedayResults(year)
    if (results) {
      db[year] = results
    }
    // Respectful delay
    await new Promise(r => setTimeout(r, 1000))
  }
  
  const outputPath = path.join(__dirname, '../src/data/raceday-database.json')
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  
  fs.writeFileSync(outputPath, JSON.stringify(db, null, 2))
  console.log(`Database saved to ${outputPath}`)
}

generateDatabase()
