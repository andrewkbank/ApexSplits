import axios from 'axios'
import * as cheerio from 'cheerio'

async function debugSplit() {
  const url = 'https://cmubuggy.org/history/raceday/2024'
  const { data } = await axios.get(url)
  const $ = cheerio.load(data)
  
  $('#tab-mens table tr').each((i, el) => {
    if (i === 0) return
    const teamFull = $(el).find('td').eq(1).text().trim()
    const parts = teamFull.split(/\s+/)
    const baseTeam = parts.slice(0, -1).join(' ') || parts[0]
    const letter = parts.length > 1 ? parts[parts.length - 1] : 'A'
    
    console.log(`Raw: "${teamFull}" -> Base: "${baseTeam}", Letter: "${letter}"`)
  })
}

debugSplit()
