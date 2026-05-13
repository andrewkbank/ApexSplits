import { useState, useEffect } from 'react'
import { Layout, Play, History, Download, Settings, BarChart3, Plus, Trash2, CheckCircle2, AlertCircle, Copy, ExternalLink, HelpCircle, Info } from 'lucide-react'
import { VideoPlayer } from './components/VideoPlayer'

const SPLIT_NAMES = ['Hill 1', 'Hill 2', 'FR 1', 'FR 2', 'Hill 3', 'Hill 4', 'Hill 5']
const EXPECTED_TIMES: Record<string, number[]> = {
  'Men': [19, 12, 29, 29, 13, 20, 23],
  'Women': [25, 14, 30, 30, 16, 26, 28],
  'All Gender': [19, 13, 30, 30, 15, 25, 25]
}

const TEAM_LIST = ['SDC', 'PIKA', 'CIA', 'SigEp', 'Fringe', 'Apex', 'SAE', 'Spirit', 'SigNu', 'DG', 'Other']
const YEARS = Array.from({ length: 2026 - 2012 + 1 }, (_, i) => (2026 - i).toString())
const HEATS = Array.from({ length: 20 }, (_, i) => (i + 1).toString())

function App() {
  const [activeTab, setActiveTab] = useState('analyze')
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null)

  // Clear notification after 3s
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [notification])
  const [videoUrl, setVideoUrl] = useState('')
  const [videoSrc, setVideoSrc] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [videoTime, setVideoTime] = useState(0)
  const [startBeepTime, setStartBeepTime] = useState<number | null>(null)
  
  // Heat Metadata
  const [year, setYear] = useState('2026')
  const [category, setCategory] = useState('Men')
  const [stage, setStage] = useState<'Prelim' | 'Final'>('Prelim')
  const [isReroll, setIsReroll] = useState(false)
  const [scrapedData, setScrapedData] = useState<any>(null)
  
  const [selectedTeams, setSelectedTeams] = useState<string[]>(['', '', ''])
  const [selectedLetters, setSelectedLetters] = useState<string[]>(['A', 'A', 'A'])
  const [otherTeams, setOtherTeams] = useState<string[]>(['', '', ''])
  
  // Splits State: { teamIndex: { splitIndex: time | 'unknown' } }
  const [splits, setSplits] = useState<Record<number, Record<number, number | 'unknown'>>>({
    0: {}, 1: {}, 2: {}
  })

  useEffect(() => {
    // Load pre-calculated results for the selected year (zero latency)
    window.ipcRenderer.getRacedayResults(year).then(data => {
      setScrapedData(data)
      // Auto-set stage based on availability
      if (category === 'All Gender') {
        setStage('Final')
      } else if (data) {
        const currentCategory = category.toLowerCase().includes('men') ? 'mens' : 
                               category.toLowerCase().includes('women') ? 'womens' : 'allgender'
        const hasPrelims = data[currentCategory]?.some((r: any) => r.prelimTime)
        const hasFinals = data[currentCategory]?.some((r: any) => r.finalTime)
        
        if (hasFinals && !hasPrelims) setStage('Final')
        else if (hasPrelims && !hasFinals) setStage('Prelim')
      }
    })
  }, [year, category])

  const handleLoadVideo = async () => {
    setLoading(true)
    try {
      if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        const info = await window.ipcRenderer.getVideoInfo(videoUrl)
        setVideoTitle(info.title)
        const path = await window.ipcRenderer.downloadVideo(videoUrl)
        setVideoSrc(`local-video://${path}`)
      } else {
        // For local files, use the filename as title
        setVideoTitle(videoUrl.split(/[\\/]/).pop() || 'Local Video')
        setVideoSrc(`local-video://${videoUrl}`)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const markSplit = (teamIdx: number, splitIdx: number, time: number | 'unknown') => {
    setSplits(prev => ({
      ...prev,
      [teamIdx]: {
        ...prev[teamIdx],
        [splitIdx]: time
      }
    }))
  }

  const handleCopyToClipboard = () => {
    try {
      const rows = selectedTeams.map((team, tIdx) => {
        if (!team) return null
        const s = splits[tIdx]
        const row = [
          year, category, stage, team, selectedLetters[tIdx],
          ...SPLIT_NAMES.map((_, sIdx) => s[sIdx] ? s[sIdx].toFixed(3) : '')
        ]
        return row.join('\t')
      }).filter(Boolean)

      const header = ['Year', 'Category', 'Stage', 'Team', 'Letter', ...SPLIT_NAMES].join('\t')
      const text = header + '\n' + rows.join('\n')
      
      navigator.clipboard.writeText(text)
      setNotification({ message: 'Copied to Clipboard!', type: 'success' })
    } catch (err) {
      setNotification({ message: 'Failed to copy', type: 'error' })
    }
  }

  const handleSaveToSheets = async () => {
    setLoading(true)
    try {
      const data = {
        year,
        category,
        stage,
        isReroll,
        startBeepTime,
        hasPrelims: scrapedData ? (scrapedData.mens?.some((r: any) => r.prelimTime) || scrapedData.womens?.some((r: any) => r.prelimTime)) : true,
        hasFinals: scrapedData ? (scrapedData.mens?.some((r: any) => r.finalTime) || scrapedData.womens?.some((r: any) => r.finalTime)) : true,
        teams: selectedTeams.map((t, i) => {
          const currentCategory = category.toLowerCase().includes('men') ? 'mens' : 
                                 category.toLowerCase().includes('women') ? 'womens' : 'allgender'
          const result = scrapedData?.[currentCategory]?.find((r: any) => r.team === t && r.letter === selectedLetters[i])
          
          let officialTime = ''
          if (result) {
            if (isReroll) {
              officialTime = (stage === 'Prelim' ? result.prelimRerollTime : result.finalRerollTime) || ''
            } else {
              officialTime = (stage === 'Prelim' ? result.prelimTime : result.finalTime) || ''
            }
          }

          return { 
            name: t, 
            letter: selectedLetters[i],
            buggy: result?.buggy || '',
            officialTime
          }
        }).filter(t => t.name),
        splits
      }
      
      await (window as any).ipcRenderer.saveToSheets(data)
      setNotification({ message: 'Saved to Google Sheets!', type: 'success' })
    } catch (err: any) {
      console.error('Save error:', err)
      const rawMessage = err.message || String(err)
      
      let cleanMessage = rawMessage.replace(/^Error: Error invoking remote method '.*?': /, '')
      
      if (cleanMessage.includes('caller does not have permission')) {
        cleanMessage = 'Access Denied: You do not have permission to edit the master sheet. Please request Editor access from the Apex team.'
      }
      
      setNotification({ message: cleanMessage, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleMarkCurrent = (time: number) => {
    // Logic to mark the NEXT empty split for the "active" team
    // For simplicity, let's just mark the first empty split for Team A
    const nextIdx = SPLIT_NAMES.findIndex((_, i) => splits[0][i] === undefined)
    if (nextIdx !== -1) markSplit(0, nextIdx, time)
  }

  return (
    <div className="app-container">
      <nav className="sidebar">
        <div className="logo">
          <img src="/apex.svg" className="logo-img" alt="Apex Logo" />
          <span>ApexSplits</span>
        </div>
        
        <div className="nav-items">
          <button className={`nav-item ${activeTab === 'analyze' ? 'active' : ''}`} onClick={() => setActiveTab('analyze')}>
            <Play size={20} /><span>Analyze</span>
          </button>
          <button className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <History size={20} /><span>History</span>
          </button>
          <button className={`nav-item ${activeTab === 'instructions' ? 'active' : ''}`} onClick={() => setActiveTab('instructions')}>
            <HelpCircle size={20} /><span>Instructions</span>
          </button>
        </div>
      </nav>

      <main className="main-content">
        <header className="top-bar">
          <div className="window-drag-area"></div>
          <h1>{activeTab.toUpperCase()}</h1>
        </header>

        <section className="content-area">
          {activeTab === 'analyze' && (
            <div className="analyze-grid">
              <div className="left-panel">
                <div className="card metadata-card">
                  <h3>Heat Metadata</h3>
                  <div className="form-row">
                    <div className="input-group">
                      <label>Year</label>
                      <select value={year} onChange={e => setYear(e.target.value)}>
                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Category</label>
                      <select value={category} onChange={e => setCategory(e.target.value)}>
                        <option>Men</option>
                        <option>Women</option>
                        <option>All Gender</option>
                      </select>
                    </div>
                    {(category !== 'All Gender' && scrapedData) && (() => {
                      const currentCategory = category.toLowerCase().includes('men') ? 'mens' : 
                                             category.toLowerCase().includes('women') ? 'womens' : 'allgender'
                      const categoryResults = scrapedData[currentCategory] || []
                      const hasPrelims = categoryResults.some((r: any) => r.prelimTime || r.prelimRerollTime)
                      const hasFinals = categoryResults.some((r: any) => r.finalTime || r.finalRerollTime)

                      // If only one stage has data, don't show the selector and auto-set it
                      if (hasPrelims && !hasFinals) {
                        if (stage !== 'Prelim') setStage('Prelim')
                        return null
                      }
                      if (hasFinals && !hasPrelims) {
                        if (stage !== 'Final') setStage('Final')
                        return null
                      }

                      return (
                        <div className="input-group">
                          <label>Stage</label>
                          <select value={stage} onChange={e => setStage(e.target.value as any)}>
                            <option>Prelim</option>
                            <option>Final</option>
                          </select>
                        </div>
                      )
                    })()}
                    <div className="input-group check-group">
                      <label>Reroll</label>
                      <input type="checkbox" checked={isReroll} onChange={e => setIsReroll(e.target.checked)} />
                    </div>
                  </div>

                  <div className="teams-row-stack">
                    {[0, 1, 2].map(i => {
                      const currentCategory = category.toLowerCase().includes('men') ? 'mens' : 
                                             category.toLowerCase().includes('women') ? 'womens' : 'allgender'
                      
                      let categoryResults = scrapedData ? scrapedData[currentCategory] : []
                      
                      // Check if this year/category has any prelim times recorded
                      const hasAnyPrelimTimes = categoryResults.some((r: any) => r.prelimTime || r.prelimRerollTime)

                      if (stage === 'Final' && category !== 'All Gender' && hasAnyPrelimTimes) {
                        // In a two-day year, only show teams that made it to finals
                        categoryResults = categoryResults.filter((r: any) => 
                          r.finalTime || r.finalRerollTime || r.notes.toLowerCase().includes('qualified')
                        )
                      }
                      
                      const uniqueTeams = Array.from(new Set(categoryResults.map((r: any) => r.team)))
                      const foundResult = categoryResults.find((r: any) => r.team === selectedTeams[i] && r.letter === selectedLetters[i])

                      return (
                        <div key={i} className="team-select-group">
                          <div className="team-select">
                            <label>Team {i + 1}</label>
                            <div className="team-input-row">
                              <select 
                                value={selectedTeams[i]} 
                                onChange={e => {
                                  const newTeams = [...selectedTeams]
                                  newTeams[i] = e.target.value
                                  setSelectedTeams(newTeams)
                                }}
                              >
                                <option value="">None</option>
                                {uniqueTeams.map((t: any) => <option key={t} value={t}>{t}</option>)}
                                <option value="Other">Other...</option>
                              </select>
                              <select
                                className="letter-select"
                                value={selectedLetters[i]}
                                onChange={e => {
                                  const newLetters = [...selectedLetters]
                                  newLetters[i] = e.target.value
                                  setSelectedLetters(newLetters)
                                }}
                              >
                                {['A', 'B', 'C', 'D', 'E'].map(l => <option key={l} value={l}>{l}</option>)}
                              </select>
                            </div>
                            {foundResult && (
                              <div className="official-info">
                                <span className="buggy-name">{foundResult.buggy}</span>
                                <span className="official-time">
                                  {(() => {
                                    const time = isReroll 
                                      ? (stage === 'Prelim' ? foundResult.prelimRerollTime : foundResult.finalRerollTime)
                                      : (stage === 'Prelim' ? foundResult.prelimTime : foundResult.finalTime);
                                    return time ? `Official Time: ${time}` : (isReroll ? 'No Reroll' : 'No Time');
                                  })()}
                                </span>
                              </div>
                            )}
                          </div>
                          {selectedTeams[i] === 'Other' && (
                            <input 
                              type="text" 
                              placeholder="Team Name..." 
                              className="other-input"
                              value={otherTeams[i]}
                              onChange={e => {
                                const newOthers = [...otherTeams]
                                newOthers[i] = e.target.value
                                setOtherTeams(newOthers)
                              }}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="center-panel">
                <div className="card url-card">
                  <div className="url-bar">
                    <input 
                      type="text" 
                      placeholder="YouTube URL or Local Path" 
                      value={videoUrl}
                      onChange={e => setVideoUrl(e.target.value)}
                    />
                    <button className="btn-primary" onClick={handleLoadVideo} disabled={loading}>
                      {loading ? 'Loading...' : 'Load'}
                    </button>
                  </div>
                  {videoTitle && <div className="video-title">{videoTitle}</div>}
                </div>
                
                <div className="card video-card">
                  {videoSrc ? (
                    <VideoPlayer 
                      src={videoSrc} 
                      onMarkSplit={handleMarkCurrent} 
                      onTimeUpdate={setVideoTime}
                      nextExpectedTime={(EXPECTED_TIMES[category] || EXPECTED_TIMES['Men'])[
                        SPLIT_NAMES.findIndex((_, i) => splits[0][i] === undefined)
                      ]}
                    />
                  ) : (
                    <div className="video-placeholder">No video loaded</div>
                  )}
                </div>
              </div>

              <div className="right-panel">
                <div className="card splits-card">
                <div className="splits-header">
                  <div className="title-with-info">
                    <h3>Split Markers</h3>
                    <button className="info-trigger" onClick={() => setActiveTab('instructions')}>
                      <Info size={16} />
                    </button>
                  </div>
                  <div className="beep-row-mini">
                    <div className="beep-info">
                      <div className="beep-val">
                        {startBeepTime !== null ? (
                          <span className="timestamp">{startBeepTime.toFixed(3)}s</span>
                        ) : (
                          <span className="not-marked">Start Beep</span>
                        )}
                      </div>
                    </div>
                    <button 
                      className="btn-mark-beep-small"
                      disabled={!videoSrc}
                      onClick={() => setStartBeepTime(videoTime)}
                    >
                      {startBeepTime !== null ? 'Re-mark' : 'Mark'}
                    </button>
                    {startBeepTime !== null && (
                      <button className="btn-clear-beep" onClick={() => setStartBeepTime(null)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="splits-table">
                  <div className="table-header">
                    <div className="col-split">Split</div>
                    {[0, 1, 2].map(i => (
                      <div key={i} className="col-team">
                        {selectedTeams[i] === 'Other' 
                          ? (otherTeams[i] || `Team ${String.fromCharCode(65 + i)}`) 
                          : (selectedTeams[i] ? `${selectedTeams[i]} ${selectedLetters[i]}` : `Team ${String.fromCharCode(65 + i)}`)}
                      </div>
                    ))}
                  </div>
                  {SPLIT_NAMES.map((name, sIdx) => (
                    <div key={name} className="table-row">
                      <div className="col-split">{name}</div>
                      {[0, 1, 2].map(tIdx => (
                        <div key={tIdx} className="col-team">
                          <div className="split-val">
                            {splits[tIdx][sIdx] !== undefined ? (
                              <div className="time-display">
                                <span className="abs-time">
                                  {typeof splits[tIdx][sIdx] === 'number' 
                                    ? (startBeepTime !== null 
                                        ? ((splits[tIdx][sIdx] as number) - startBeepTime).toFixed(2) 
                                        : (splits[tIdx][sIdx] as number).toFixed(2) + ' (abs)') 
                                    : 'UNK'}
                                </span>
                                {(() => {
                                  if (typeof splits[tIdx][sIdx] !== 'number') return null;
                                  
                                  // Find the reference time (previous split or start beep)
                                  let prevTime: number | null = null;
                                  if (sIdx === 0) {
                                    prevTime = startBeepTime;
                                  } else {
                                    // Search backwards for the nearest valid numerical split
                                    for (let i = sIdx - 1; i >= 0; i--) {
                                      if (typeof splits[tIdx][i] === 'number') {
                                        prevTime = splits[tIdx][i] as number;
                                        break;
                                      }
                                    }
                                    // Fallback to start beep if no previous numerical splits found
                                    if (prevTime === null) prevTime = startBeepTime;
                                  }

                                  if (prevTime === null) return null;
                                  return (
                                    <span className="rel-time">
                                      +{( (splits[tIdx][sIdx] as number) - prevTime).toFixed(2)}s
                                    </span>
                                  );
                                })()}
                              </div>
                            ) : (
                              <button 
                                className="btn-mark-small" 
                                disabled={!videoSrc}
                                onClick={() => markSplit(tIdx, sIdx, videoTime)}
                              >
                                Mark
                              </button>
                            )}
                            {splits[tIdx][sIdx] !== undefined && (
                              <button className="btn-clear" onClick={() => {
                                const newT = {...splits[tIdx]}
                                delete newT[sIdx]
                                setSplits({...splits, [tIdx]: newT})
                              }}><Trash2 size={12} /></button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                
                <div className="actions">
                  {notification && (
                    <div className={`notification ${notification.type}`}>
                      {notification.message}
                    </div>
                  )}
                  <div className="action-buttons">
                    <button className="btn-secondary" onClick={handleCopyToClipboard}>
                      <Copy size={18} /> Copy to Clipboard
                    </button>
                    <button className="btn-save" onClick={handleSaveToSheets} disabled={loading}>
                      <CheckCircle2 size={18} /> {loading ? 'Saving...' : 'Save to Google Sheets'}
                    </button>
                    <button className="btn-link" onClick={() => window.open('https://docs.google.com/spreadsheets/d/1ZwbNW2unU0GlvwuwtAtP5opqv3p6Ir22Sn53OrCnTLE/edit?usp=sharing', '_blank')}>
                      <ExternalLink size={18} /> View Master Sheet
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-view">
              <div className="history-filters card">
                <div className="input-group">
                  <label>Year</label>
                  <select value={year} onChange={e => setYear(e.target.value)}>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              
              {scrapedData ? (
                <div className="history-results-grid">
                  {['mens', 'womens', 'allgender'].map(cat => (
                    <div key={cat} className="card result-card">
                      <h3>{cat.toUpperCase()} RESULTS</h3>
                      <div className="history-table">
                        <div className="history-header">
                          <div className="col-team">Team</div>
                          <div className="col-buggy">Buggy</div>
                          <div className="col-time">Prelim</div>
                          <div className="col-time">Final</div>
                        </div>
                        {scrapedData[cat]?.map((r: any, idx: number) => {
                          const officialPrelim = r.prelimRerollTime || r.prelimTime || '-'
                          const officialFinal = r.finalRerollTime || r.finalTime || '-'
                          const isPrelimReroll = !!r.prelimRerollTime
                          const isFinalReroll = !!r.finalRerollTime

                          return (
                            <div key={idx} className="history-row">
                              <div className="col-team">{r.fullName}</div>
                              <div className="col-buggy">{r.buggy}</div>
                              <div className="col-time">
                                {officialPrelim}
                                {isPrelimReroll && <span className="reroll-indicator" title={`Original: ${r.prelimTime}`}>(R)</span>}
                              </div>
                              <div className="col-time">
                                {officialFinal}
                                {isFinalReroll && <span className="reroll-indicator" title={`Original: ${r.finalTime}`}>(R)</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="loading-state">Loading historical records...</div>
              )}
            </div>
          )}

          {activeTab === 'instructions' && (
            <div className="instructions-view card">
              <div className="instructions-header">
                <h2>Raceday Analysis Guide</h2>
                <p>Follow these standards to ensure consistent split data across all analysis sessions.</p>
              </div>

              <div className="instruction-section" id="basics">
                <h3>The Basics</h3>
                <p>1. <strong>Start Beep</strong>: Click the <strong>Mark</strong> button in the "Start Beep" section as soon as the buzzer sounds. This initializes the clock for all teams.</p>
                <p>2. <strong>Recording Splits</strong>: As the buggy race progresses, click the <strong>Mark</strong> button next to each team's name in the Splits Table.</p>
                <p>3. <strong>Precision Navigation</strong>: Use shift + arrow keys to move the video <strong>frame-by-frame</strong>. Alternatively, use the arrow keys (without shift) to move the video by <strong>one second</strong> at a time. Finally, use the space bar to <strong>pause and play</strong> the video.</p>
                <p>4. <strong>Standard</strong>: Always mark when the <strong>nose</strong> of the buggy crosses the line. The app calculates the split duration automatically based on your previous marker.</p>
                <p>5. <strong>Saving Data</strong>: When your analysis is complete, click <strong>Save to Google Sheets</strong> at the bottom of the right panel. The first time you save, it will ask you to authenticate with your Google account. If you don't have access to the master sheet, request it or email <a href="mailto:[cmu.apex@gmail.com]">cmu.apex@gmail.com</a> This will allow you to update the master spreadsheet.</p>
              </div>

              <div className="instruction-grid">
                <div className="instruction-item">
                  <div className="marker-info">
                    <span className="marker-num">1</span>
                    <div>
                      <h4>1-2 Transition (1st Line)</h4>
                      <p>Mark when the nose crosses the first line of the transition area. This completes the <strong>Hill 1</strong> split.</p>
                    </div>
                  </div>
                  <img src="/hill12transition.png" alt="1-2 Transition" />
                </div>

                <div className="instruction-item">
                  <div className="marker-info">
                    <span className="marker-num">2</span>
                    <div>
                      <h4>2nd Crosswalk (2nd Line)</h4>
                      <p>Mark when the nose hits the second line of the second crosswalk. This completes <strong>Hill 2</strong> and the Front Hills.</p>
                    </div>
                  </div>
                  <img src="/hill2frtransition.png" alt="2nd Crosswalk" />
                </div>

                <div className="instruction-item">
                  <div className="marker-info">
                    <span className="marker-num">3</span>
                    <div>
                      <h4>Stop Sign (Freeroll Midpoint)</h4>
                      <p>Mark when the nose passes the stop sign. This is used specifically to split the <strong>Freeroll</strong> in half (FR 1).</p>
                    </div>
                  </div>
                  <img src="/fr12transition.png" alt="Stop Sign" />
                </div>

                <div className="instruction-item">
                  <div className="marker-info">
                    <span className="marker-num">4</span>
                    <div>
                      <h4>Hill 3 Start Line</h4>
                      <p>Mark when the nose hits the Hill 3 transition line. This completes the second half of the freeroll (FR 2).</p>
                    </div>
                  </div>
                  <img src="/frhill3transition.png" alt="Hill 3 Start" />
                </div>

                <div className="instruction-item">
                  <div className="marker-info">
                    <span className="marker-num">5</span>
                    <div>
                      <h4>3-4 Transition (2nd Line)</h4>
                      <p>Mark when the nose hits the second line of the transition. This completes <strong>Hill 3</strong>.</p>
                    </div>
                  </div>
                  <img src="/hill34transition.png" alt="3-4 Transition" />
                </div>

                <div className="instruction-item">
                  <div className="marker-info">
                    <span className="marker-num">6</span>
                    <div>
                      <h4>4-5 Transition (2nd Line)</h4>
                      <p>Mark when the nose hits the second line of the transition. This completes <strong>Hill 4</strong>.</p>
                    </div>
                  </div>
                  <img src="/hill45transition.png" alt="4-5 Transition" />
                </div>

                <div className="instruction-item">
                  <div className="marker-info">
                    <span className="marker-num">7</span>
                    <div>
                      <h4>Finish Line</h4>
                      <p>Mark when the nose crosses the final line. This completes <strong>Hill 5</strong> and the Total Time.</p>
                    </div>
                  </div>
                  <img src="/finish.png" alt="Finish Line" />
                </div>
              </div>

              <div className="notes-section">
                <div className="note-card warning">
                  <AlertCircle size={20} />
                  <div>
                    <strong>Trailing Buggies</strong>
                    <p>It can be hard to get times for trailing buggies. Use your best judgement about when a buggy crossed the various lines from what you can see or ignore those times if they are uncompetitive C or D teams.</p>
                  </div>
                </div>

                <div className="note-card">
                  <Settings size={20} />
                  <div>
                    <strong>Hill 1 Visibility</strong>
                    <p>Hill 1 line in lane 1 is often obscured by spectators. Use best judgement on where the hill 1 transition line is.</p>
                  </div>
                </div>

                <div className="note-card">
                  <Layout size={20} />
                  <div>
                    <strong>Hill 3 vs Parking Lines</strong>
                    <p>Hill 3 Line is very close to a parking space line. Either can be used (They're about 2 feet apart and some years one is more visible than the other).</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
