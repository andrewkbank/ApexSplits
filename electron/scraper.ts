import axios from 'axios'
import * as cheerio from 'cheerio'

export async function scrapeRacedayResults(year: string) {
  const url = `https://cmubuggy.org/history/raceday/${year}`
  try {
    const { data } = await axios.get(url)
    const $ = cheerio.load(data)
    
    const results: any = {
      mens: [],
      womens: [],
      allgender: [],
      heats: {
        prelim: [],
        final: [],
        reroll: []
      }
    }

    // Helper to parse summary tables (Team -> Buggy mapping + Rerolls)
    const parseSummaryTable = (id: string, category: string) => {
      $(id).find('table tr').each((i, el) => {
        if (i === 0) return // Skip header
        const cols = $(el).find('td')
        if (cols.length < 3) return
        
        const team = $(cols[1]).text().trim()
        const buggy = $(cols[2]).text().trim()
        const prelimTime = $(cols[3]).text().trim()
        const prelimRerollTime = $(cols[4]).text().trim()
        const finalTime = $(cols[5]).text().trim()
        const finalRerollTime = $(cols[6]).text().trim()
        const notes = $(cols[7] || cols[cols.length - 1]).text().trim()
        
        if (team) {
          const parts = team.split(/\s+/)
          const baseTeam = parts.slice(0, -1).join(' ') || parts[0]
          const letter = parts.length > 1 ? parts[parts.length - 1] : 'A'

          results[category].push({ 
            team: baseTeam, 
            letter, 
            fullName: team,
            buggy, 
            prelimTime, 
            prelimRerollTime,
            finalTime,
            finalRerollTime,
            notes 
          })
        }
      })
    }

    parseSummaryTable('#tab-mens', 'mens')
    parseSummaryTable('#tab-womens', 'womens')
    parseSummaryTable('#tab-allgender', 'allgender')

    // Helper to parse heat tables (including Rerolls sub-sections)
    const parseHeatTable = (id: string, stage: 'prelim' | 'final' | 'reroll') => {
      $(id).find('table tr').each((i, el) => {
        const cols = $(el).find('td')
        if (cols.length < 4) return
        
        const heatNumText = $(cols[0]).text().trim()
        const heatNum = parseInt(heatNumText)
        if (isNaN(heatNum)) return

        const teamsInHeat = []
        for (let lane = 1; lane <= 3; lane++) {
          const laneData = $(cols[lane])
          const teamName = laneData.find('a').text().trim()
          if (teamName) {
            teamsInHeat.push({ lane, team: teamName })
          }
        }
        
        if (teamsInHeat.length > 0) {
          results.heats[stage].push({ heatNum: heatNumText, teams: teamsInHeat })
        }
      })
    }

    parseHeatTable('#tab-prelimheats', 'prelim')
    parseHeatTable('#tab-finalsheats', 'final')
    // Note: Rerolls are often in a sub-table or section. 
    // This simple parser might need more logic for the reroll section specifically
    // but the summary table is the primary source of truth for the "Official Time".

    return results
  } catch (error) {
    console.error(`Failed to scrape ${year}:`, error)
    return null
  }
}

export async function getTeamsForYear(year: string, category: string) {
  const results = await scrapeRacedayResults(year)
  if (!results) return []
  const cat = category.toLowerCase().includes('women') ? 'womens' : 
              category.toLowerCase().includes('men') ? 'mens' : 'allgender'
  return results[cat].map((r: any) => r.fullName)
}
