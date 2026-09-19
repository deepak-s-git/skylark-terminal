'use client'

import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { sendMessage, getHealth, getConversations, getConversationMessages, type ChatMessage, type HealthStatus, type QualityReport, type ConversationHistory } from '@/lib/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlowingEffect } from "@/components/GlowingEffect"


gsap.registerPlugin(useGSAP)

/* --- Custom Scramble Number Component --- */
const ScrambleNumber = ({ value, isCurrency = false }: { value: number | string, isCurrency?: boolean }) => {
  const elRef = useRef<HTMLSpanElement>(null)
  
  useGSAP(() => {
    if (!elRef.current || value === undefined) return
    const target = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]+/g, '')) : value
    if (isNaN(target)) {
      elRef.current.innerText = String(value)
      return
    }

    const obj = { val: 0 }
    gsap.to(obj, {
      val: target,
      duration: 1.5,
      ease: "expo.out",
      onUpdate: () => {
        if (elRef.current) {
          let formatted = obj.val.toFixed(isCurrency ? 1 : 0)
          if (isCurrency && obj.val >= 10000000) {
             formatted = (obj.val / 10000000).toFixed(2) + 'Cr'
          } else if (isCurrency && obj.val >= 100000) {
             formatted = (obj.val / 100000).toFixed(2) + 'L'
          }
          elRef.current.innerText = isCurrency ? `₹${formatted}` : formatted
        }
      }
    })
  }, [value])

  return <span ref={elRef}>0</span>
}

/* --- Skeleton Loader for Dynamic Build --- */
const SkeletonDashboard = () => (
  <div className="w-full h-full space-y-4">
    <div className="h-12 w-1/3 bg-titanium border border-bordercol animate-pulse"></div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="h-40 bg-titanium border border-bordercol animate-pulse col-span-1 md:col-span-2"></div>
      <div className="h-40 bg-titanium border border-bordercol animate-pulse col-span-1"></div>
      <div className="h-64 bg-titanium border border-bordercol animate-pulse col-span-1 md:col-span-3"></div>
      <div className="h-40 bg-titanium border border-bordercol animate-pulse col-span-1 md:col-span-3"></div>
    </div>
  </div>
)

/* --- Main Dashboard Application --- */
export default function Dashboard() {
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  
  const [hasQueried, setHasQueried] = useState(false)
  
  // History State
  const [userId, setUserId] = useState<string>('')
  const [conversations, setConversations] = useState<ConversationHistory[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Initialize UUID
  useEffect(() => {
    let storedId = localStorage.getItem('skylark_user_id')
    if (!storedId) {
      storedId = uuidv4()
      localStorage.setItem('skylark_user_id', storedId)
    }
    setUserId(storedId)
  }, [])

  // Fetch conversations
  useEffect(() => {
    if (userId) {
      getConversations(userId).then(setConversations)
    }
  }, [userId])

  // Load a conversation
  const loadConversation = async (id: string) => {
    setActiveConvId(id)
    setLoading(true)
    try {
      const msgs = await getConversationMessages(id)
      setMessages(msgs)
      setHasQueried(true)
      
      // Hydrate metrics from the last assistant message
      const lastAssistantMsg = msgs.slice().reverse().find(m => m.role === 'assistant')
      if (lastAssistantMsg?.metrics) {
        setMetrics(lastAssistantMsg.metrics as any)
      }
      if (lastAssistantMsg?.quality_report) {
        setQualityReport(lastAssistantMsg.quality_report as any)
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
    setSidebarOpen(false)
  }
  
  const startNewChat = () => {
    setActiveConvId(null)
    setMessages([])
    setMetrics(null)
    setQualityReport(null)
    setHasQueried(false)
    setSidebarOpen(false)
  }

  const [metrics, setMetrics] = useState<any>(null)
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null)
  
  const bottomRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getHealth().then(setHealth).catch(() =>
      setHealth({ status: 'error', monday_connected: false, error: 'Could not reach backend' })
    )
  }, [])

  // Animate bento cards when they appear
  useGSAP(() => {
    if (hasQueried && metrics) {
      gsap.fromTo('.bento-card', 
        { y: 30, opacity: 0 }, 
        { y: 0, opacity: 1, duration: 1, delay: 0.8, ease: 'expo.out', stagger: 0.1 }
      )
    }
  }, [hasQueried, metrics])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || loading) return

    const text = input.trim()
    setInput('')
    
    const userMsg = { id: Date.now().toString(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const response = await sendMessage(text, history, userId, activeConvId || undefined)
      if (response.conversation_id) {
        setActiveConvId(response.conversation_id)
        if (!activeConvId) {
          getConversations(userId).then(setConversations)
        }
      }
      
      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer,
      }
      setMessages(prev => [...prev, assistantMsg])

      if (response.metrics) {
        setMetrics(response.metrics)
      }
      if (response.quality_report) {
        setQualityReport(response.quality_report)
      }
      
      // ONLY trigger the smooth layout shift AFTER data is generated!
      setHasQueried(true)
      
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `**Error:** ${err instanceof Error ? err.message : 'Something went wrong.'}`
      }])
    } finally {
      setLoading(false)
    }
  }

  const formatChartYAxis = (val: number) => {
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`
    return `₹${val}`
  }

  return (
    <div className="w-screen h-screen bg-vanta text-ghost font-sans flex overflow-hidden">
      
      {/* SIDEBAR */}
      <motion.div
        initial={false}
        animate={{ width: sidebarOpen ? 260 : 0, opacity: sidebarOpen ? 1 : 0 }}
        className="h-full bg-[#050505] border-r border-bordercol flex-shrink-0 overflow-hidden flex flex-col z-50 relative"
      >
        <div className="p-4 border-b border-bordercol flex justify-between items-center w-[260px] flex-shrink-0">
          <span className="font-mono text-xs text-ghost tracking-widest uppercase">History Log</span>
          <button onClick={() => setSidebarOpen(false)} className="text-slateMuted hover:text-vermilion">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-4 w-[260px] flex-shrink-0">
          <button onClick={startNewChat} className="w-full py-2 border border-chartreuse/50 bg-chartreuse/10 text-chartreuse font-mono text-xs uppercase tracking-widest hover:bg-chartreuse/20 transition-colors">
            + New Terminal
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar w-[260px]">
          {conversations.map(c => (
            <div 
              key={c.id} 
              onClick={() => loadConversation(c.id)}
              className={`p-3 border-b border-bordercol/30 cursor-pointer hover:bg-titanium transition-colors ${activeConvId === c.id ? 'bg-titanium border-l-2 border-l-chartreuse' : ''}`}
            >
              <div className="font-mono text-[10px] text-ghost truncate">{c.title}</div>
              <div className="font-mono text-[8px] text-darkMuted mt-1">{new Date(c.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </motion.div>

      
      {/* LEFT PANE: Chat Console (Animates smoothly from 100vw to 35vw) */}
      <motion.aside
        initial={false}
        animate={{
          width: hasQueried ? "35%" : "100%",
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} // "Smooth as fuck" expo ease
        className="h-full flex-shrink-0 border-r border-bordercol relative z-20 bg-vanta shadow-2xl flex flex-col"
      >
        {/* HEADER */}
        <header className="h-14 border-b border-bordercol flex-shrink-0 w-full flex justify-center">
          <div className={`w-full max-w-3xl h-full flex items-center justify-between px-4 md:px-6 transition-all duration-1000 ${!hasQueried ? 'border-x border-bordercol/40 bg-[#060608]' : ''}`}>
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="mr-2 text-slateMuted hover:text-ghost transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              </button>
              <div className="w-2 h-2 bg-vermilion rounded-sm animate-pulse"></div>
              <h1 className="font-mono text-[10px] md:text-xs font-bold tracking-widest text-ghost uppercase">Skylark // Terminal</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[8px] md:text-[9px] text-chartreuse border border-chartreuse/30 bg-chartreuse/10 px-2 py-0.5 uppercase tracking-wider">
                {health?.monday_connected ? 'Data Link: Live' : 'Data Link: Offline'}
              </span>
            </div>
          </div>
        </header>

        {/* CHAT LOG */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative flex justify-center w-full">
          <div className={`w-full max-w-3xl flex flex-col ${messages.length === 0 ? 'justify-center items-center' : 'justify-end'} min-h-full p-4 md:p-6 transition-all duration-1000 ${!hasQueried ? 'border-x border-bordercol/40 bg-[#060608]' : ''}`}>
            
            {/* INITIAL BOOT SEQUENCE */}
            {!hasQueried && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center opacity-80 mb-20">
                <div className="w-12 h-12 border border-bordercol bg-titanium flex items-center justify-center mb-6 relative">
                  <div className="absolute top-1 left-1 w-1 h-1 bg-chartreuse"></div>
                  <div className="text-sun text-xl animate-pulse font-mono">⚡</div>
                </div>
                <h2 className="font-mono text-sm md:text-base text-ghost tracking-widest uppercase mb-2">Awaiting Query</h2>
                <p className="font-mono text-[10px] text-slateMuted max-w-xs leading-relaxed">
                  Enter a command to initiate dynamic data aggregation from monday.com.
                </p>
              </div>
            )}

            {/* CHAT MESSAGES */}
            <AnimatePresence>
              {messages.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-slateMuted mb-6 border-l-2 border-bordercol pl-3 opacity-70 font-mono text-[10px]">
                  <span className="text-chartreuse font-bold">SYSTEM BOOT:</span> Analytics Engine initialized.<br/>
                  Connected to Deals & Work Orders boards.
                </motion.div>
              )}
              {messages.map((msg, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mb-6 flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <span className="font-mono text-[8px] md:text-[9px] text-darkMuted tracking-widest uppercase mb-1">
                    {msg.role === 'user' ? 'GUEST_USER' : 'BI_AGENT'}
                  </span>
                  <div className={`
                    p-3 md:p-4 text-sm font-sans max-w-[90%] leading-relaxed border
                    ${msg.role === 'user' 
                      ? 'bg-vermilion/5 border-vermilion/20 text-ghost' 
                      : msg.error 
                        ? 'bg-vermilion/10 border-vermilion text-vermilion'
                        : 'bg-titanium border-bordercol text-slateMuted'}
                  `}>
                    {msg.error ? (
                      <div className="font-mono text-xs font-bold">Error: {msg.content}</div>
                    ) : (
                      <div className="prose-chat font-sans text-sm">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {loading && (
              <div className="flex items-start">
                <div className="p-3 border border-bordercol bg-titanium text-chartreuse font-mono text-xs flex gap-2">
                  <span className="animate-pulse">_</span> PROCESSING & AGGREGATING DATA...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* INPUT AREA */}
        <div className="border-t border-bordercol bg-vanta flex-shrink-0 flex justify-center w-full">
          <div className={`w-full max-w-3xl p-4 md:p-6 transition-all duration-1000 ${!hasQueried ? 'border-x border-bordercol/40 bg-[#060608]' : ''}`}>
            <form onSubmit={handleSubmit} className="relative flex items-center">
              <div className="absolute left-4 font-mono text-slateMuted text-xs select-none pointer-events-none">
                <span className="text-vermilion animate-pulse">_</span>&gt;
              </div>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Give me a leadership update..."
                className="w-full bg-vanta border border-bordercol text-ghost font-mono text-xs md:text-sm py-4 pl-12 pr-24 focus:outline-none focus:border-slateMuted transition-colors placeholder:text-darkMuted"
                disabled={loading}
              />
              <button 
                type="submit" 
                disabled={loading || !input.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-vermilion hover:bg-vermilion/80 text-vanta font-mono text-[10px] md:text-xs font-bold uppercase tracking-widest py-2 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Exec
              </button>
            </form>
          </div>
        </div>
      </motion.aside>

      {/* RIGHT PANE: Dynamic Dashboard */}
      <AnimatePresence>
        {hasQueried && (
          <motion.main
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 h-full overflow-y-auto p-6 lg:p-10 bg-vanta relative z-10"
            ref={gridRef}
          >
            <div className="flex justify-between items-end mb-8 border-b border-bordercol pb-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tighter uppercase text-ghost">Operations Telemetry</h1>
                <p className="text-slateMuted text-[10px] md:text-xs font-mono mt-1">DYNAMIC DATA AGGREGATION RENDERED</p>
              </div>
              <div className="font-mono text-[10px] md:text-xs text-right hidden sm:block">
                <div className="text-slateMuted">LAST SYNC</div>
                <div className="text-chartreuse">{new Date().toLocaleTimeString()}</div>
              </div>
            </div>

            {metrics && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                
                {/* HERO CARD: Pipeline or Revenue */}
                {(() => {
                  const pipe = metrics.pipeline || (metrics.pipeline_value_inr !== undefined ? metrics : null);
                  const rev = metrics.revenue || (metrics.total_revenue_inr !== undefined ? metrics : null);
                  
                  if (!pipe && !rev) return null;
                  
                  const mainValue = pipe ? pipe.pipeline_value_inr : rev.total_revenue_inr;
                  const mainLabel = pipe ? "TOTAL ACTIVE PIPELINE" : "TOTAL CLOSED REVENUE";
                  const countLabel = pipe ? `${pipe.pipeline_count || 0} DEALS IN ACTIVE STAGES` : `${rev.won_deal_count || 0} DEALS WON`;
                  
                  return (
                    <div className="bento-card col-span-1 xl:col-span-2 bg-titanium relative border border-bordercol flex flex-col justify-between relative group hover:border-slateMuted transition-colors overflow-hidden">
                      <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                      <div className="p-5 md:p-6 pb-12">
                        <div className="flex justify-between items-start mb-4">
                          <h2 className="font-mono text-[10px] text-slateMuted tracking-widest uppercase flex items-center gap-2">
                            <span className="w-1 h-1 bg-vermilion"></span> METRIC_01 // {mainLabel}
                          </h2>
                          <div className="font-mono text-[9px] bg-vanta border border-bordercol px-2 py-0.5 text-ghost uppercase">STREAM: RAW_CADENCE</div>
                        </div>
                        <div>
                          <div className="flex flex-col xl:flex-row xl:items-end gap-2 xl:gap-6 mb-2">
                            <div className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-ghost font-mono leading-none">
                              <ScrambleNumber value={mainValue || 0} isCurrency={true} />
                            </div>
                            {rev?.win_rate_pct && (
                              <div className="text-sm font-mono border border-chartreuse/50 bg-chartreuse/10 text-chartreuse px-2 py-1 whitespace-nowrap w-fit xl:mb-2">
                                WIN RATE: {rev.win_rate_pct}%
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slateMuted max-w-md leading-relaxed mt-4">
                            Aggregated CRM vectors and financial projections synced from active boards. Displaying real-time {mainLabel.toLowerCase()} telemetry.
                            <br/><span className="text-chartreuse mt-1 inline-block">{countLabel}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Sub-metrics footer row */}
                      <div className="grid grid-cols-3 border-t border-bordercol bg-vanta divide-x divide-bordercol">
                        <div className="p-3">
                          <div className="text-[9px] text-darkMuted font-mono uppercase tracking-widest mb-1">AVG DEAL TICKET</div>
                          <div className="text-sm font-mono text-ghost">
                            <ScrambleNumber value={(pipe?.avg_deal_value_inr || rev?.avg_won_deal_value_inr) || 0} isCurrency={true} />
                          </div>
                        </div>
                        <div className="p-3">
                          <div className="text-[9px] text-darkMuted font-mono uppercase tracking-widest mb-1">WIN PROBABILITY</div>
                          <div className="text-sm font-mono text-chartreuse">
                            {rev?.win_rate_pct ? `${rev.win_rate_pct}%` : pipe?.win_rate_pct ? `${pipe.win_rate_pct}%` : 'STABLE'}
                          </div>
                        </div>
                        <div className="p-3">
                          <div className="text-[9px] text-darkMuted font-mono uppercase tracking-widest mb-1">DEAD / LOST DEALS</div>
                          <div className="text-sm font-mono text-vermilion">
                            {rev?.dead_deal_count || 0} DROPPED
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* CONVERSION / BURNDOWN INDEX */}
                {(() => {
                  const cb = metrics.cross_board || (metrics.match_rate_pct !== undefined ? metrics : null);
                  if (!cb) return null;
                  return (
                    <div className="bento-card col-span-1 bg-titanium relative border border-bordercol p-5 md:p-6 flex flex-col justify-between group hover:border-slateMuted transition-colors relative">
                      <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                      <div>
                        <div className="flex justify-between items-start mb-6">
                          <h2 className="font-mono text-[10px] text-slateMuted tracking-widest uppercase flex items-center gap-2">
                            <span className="w-1 h-1 bg-chartreuse"></span> BURNDOWN INDEX
                          </h2>
                          <span className="text-[9px] text-chartreuse font-mono">NOMINAL</span>
                        </div>
                        <div className="text-5xl md:text-6xl font-bold font-mono text-ghost tracking-tighter">
                          <ScrambleNumber value={cb.match_rate_pct || 0} />%
                        </div>
                        <div className="font-mono text-[10px] text-slateMuted mt-2 uppercase tracking-widest">
                          CONVERSION RATE (WON → WORK ORDER)
                        </div>
                      </div>
                      <div className="mt-8 border-t border-bordercol pt-4 grid grid-cols-2 gap-4 font-mono text-[10px]">
                        <div>
                          <div className="text-darkMuted uppercase">TOTAL WON DEALS</div>
                          <div className="text-ghost text-sm mt-1">{cb.total_won || 0}</div>
                        </div>
                        <div>
                          <div className="text-darkMuted uppercase">MATCHED ORDERS</div>
                          <div className="text-chartreuse text-sm mt-1">{cb.matched_wo || 0}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* SECTOR ALLOCATION (Mini Progress Bars) */}
                {(() => {
                  const pipe = metrics.pipeline || (metrics.pipeline_value_inr !== undefined ? metrics : null);
                  const rev = metrics.revenue || (metrics.win_rate_pct !== undefined ? metrics : null);
                  const sectorData = pipe?.by_sector || rev?.by_sector;
                  if (!sectorData || sectorData.length === 0) return null;
                  
                  const validSectors = sectorData.filter((s:any) => s.sector && s.sector !== 'nan').slice(0, 5);
                  const maxVal = Math.max(...validSectors.map((s:any) => s.value || s.revenue_inr || 0));
                  
                  return (
                    <div className="bento-card col-span-1 xl:col-span-1 bg-titanium relative border border-bordercol p-5 md:p-6 group hover:border-slateMuted transition-colors flex flex-col justify-between">
                      <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                      <div className="flex justify-between items-start mb-6">
                        <h2 className="font-mono text-[10px] text-slateMuted tracking-widest uppercase flex items-center gap-2">
                          <span className="w-1 h-1 bg-chartreuse animate-pulse"></span> SECTOR ALLOCATION
                        </h2>
                        <span className="text-[9px] text-darkMuted font-mono border border-bordercol px-1">ARRAY: {validSectors.length}</span>
                      </div>
                      <div className="space-y-4">
                        {validSectors.map((sec: any, i: number) => {
                          const val = sec.value || sec.revenue_inr || 0;
                          const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                          return (
                            <div key={i} className="font-mono text-[10px]">
                              <div className="flex justify-between text-ghost mb-1 uppercase">
                                <span className="truncate pr-2">0{i+1} // {sec.sector}</span>
                                <span className="text-chartreuse whitespace-nowrap"><ScrambleNumber value={val} isCurrency={true} /></span>
                              </div>
                              <div className="w-full bg-vanta h-1.5 border border-bordercol overflow-hidden">
                                <div className="bg-ghost h-full transition-all duration-1000 ease-out" style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* DEAL STAGE INGEST / TRANSACTION LOG */}
                {(() => {
                  const pipe = metrics.pipeline || (metrics.pipeline_value_inr !== undefined ? metrics : null);
                  if (!pipe?.by_stage || pipe.by_stage.length === 0) return null;
                  
                  return (
                    <div className="bento-card col-span-1 xl:col-span-2 bg-titanium relative border border-bordercol p-5 md:p-6 group hover:border-slateMuted transition-colors">
                      <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                      <div className="flex justify-between items-start mb-6">
                        <h2 className="font-mono text-[10px] text-slateMuted tracking-widest uppercase flex items-center gap-2">
                          TRANSACTION INGEST // PIPELINE STAGES
                        </h2>
                        <span className="text-[9px] text-vermilion font-mono">RATE: LIVE TX/S</span>
                      </div>
                      
                      <div className="w-full font-mono text-[10px]">
                        <div className="grid grid-cols-12 text-darkMuted uppercase border-b border-bordercol pb-2 mb-2">
                          <div className="col-span-6">STAGE_ID</div>
                          <div className="col-span-2 text-center">COUNT</div>
                          <div className="col-span-4 text-right">VALUE_INR</div>
                        </div>
                        <div className="space-y-2">
                          {pipe.by_stage.map((stage: any, i: number) => (
                            <div key={i} className="grid grid-cols-12 text-ghost items-center py-1 border-b border-bordercol/30">
                              <div className="col-span-6 truncate pr-2 uppercase text-slateMuted">{stage.stage}</div>
                              <div className="col-span-2 text-center text-chartreuse">{stage.count}</div>
                              <div className="col-span-4 text-right"><ScrambleNumber value={stage.value} isCurrency={true} /></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* SYNTHESIZED: WIN/LOSS RATIO (To fill space for specific revenue queries) */}
                {(() => {
                  const rev = metrics.revenue || (metrics.win_rate_pct !== undefined ? metrics : null);
                  if (!rev || rev.won_deal_count === undefined || rev.dead_deal_count === undefined) return null;
                  
                  const won = rev.won_deal_count;
                  const dead = rev.dead_deal_count;
                  const total = won + dead;
                  if (total === 0) return null;
                  
                  const wonPct = (won / total) * 100;
                  
                  return (
                    <div className="bento-card col-span-1 xl:col-span-1 bg-titanium relative border border-bordercol p-5 md:p-6 group hover:border-slateMuted transition-colors flex flex-col justify-between min-h-[220px]">
                      <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                      <div className="flex justify-between items-start mb-6">
                        <h2 className="font-mono text-[10px] text-slateMuted tracking-widest uppercase flex items-center gap-2">
                          <span className="w-1 h-1 bg-chartreuse"></span> OUTCOME DISTRIBUTION
                        </h2>
                        <span className="text-[9px] text-darkMuted font-mono">N={total}</span>
                      </div>
                      
                      <div className="w-full mt-auto">
                        <div className="flex justify-between font-mono text-[10px] mb-2">
                          <span className="text-chartreuse">WON // {won}</span>
                          <span className="text-vermilion">{dead} // LOST</span>
                        </div>
                        <div className="w-full bg-vermilion/20 h-4 flex overflow-hidden border border-bordercol">
                          <div className="bg-chartreuse h-full transition-all duration-1000 ease-out" style={{ width: `${wonPct}%` }}></div>
                          <div className="bg-vermilion h-full transition-all duration-1000 ease-out" style={{ width: `${100 - wonPct}%` }}></div>
                        </div>
                        <div className="mt-4 border-t border-bordercol pt-4 text-[10px] font-mono text-slateMuted flex justify-between">
                          <span>AVG WON TICKET:</span>
                          <span className="text-ghost"><ScrambleNumber value={rev.avg_won_deal_value_inr || 0} isCurrency={true} /></span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* SYNTHESIZED: VELOCITY & DEAL SIZE MAP (To fill space) */}
                {(() => {
                  const pipe = metrics.pipeline || (metrics.pipeline_value_inr !== undefined ? metrics : null);
                  const rev = metrics.revenue || (metrics.total_revenue_inr !== undefined ? metrics : null);
                  if (!pipe && !rev) return null;
                  
                  return (
                    <div className="bento-card col-span-1 xl:col-span-1 bg-titanium relative border border-bordercol p-5 md:p-6 group hover:border-slateMuted transition-colors flex flex-col justify-between">
                      <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                      <div className="flex justify-between items-start mb-6">
                        <h2 className="font-mono text-[10px] text-slateMuted tracking-widest uppercase flex items-center gap-2">
                          <span className="w-1 h-1 bg-ghost"></span> VELOCITY // RADAR
                        </h2>
                      </div>
                      
                      {/* Faux radar/target visual */}
                      <div className="relative w-full aspect-square max-h-[160px] mx-auto mb-4 border border-bordercol/30 flex items-center justify-center">
                        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 opacity-10">
                           {Array(16).fill(0).map((_,i) => <div key={i} className="border border-ghost"></div>)}
                        </div>
                        <div className="w-3/4 h-3/4 rounded-full border border-chartreuse/20 flex items-center justify-center">
                          <div className="w-1/2 h-1/2 rounded-full border border-chartreuse/40 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-vermilion rounded-full animate-ping"></div>
                          </div>
                        </div>
                        <div className="absolute top-2 left-2 text-[8px] font-mono text-chartreuse">P-ANG: +14.2°</div>
                        <div className="absolute bottom-2 right-2 text-[8px] font-mono text-darkMuted">RADAR: 24GHz</div>
                      </div>
                      
                      <div className="flex justify-between font-mono text-[9px] uppercase border-t border-bordercol pt-3">
                        <span className="text-darkMuted">CONVERGENCE</span>
                        <span className="text-chartreuse">OPTIMAL</span>
                      </div>
                    </div>
                  );
                })()}

                {/* FINANCIAL OPERATIONS / PRIMARY CONTROLLERS */}
                {(() => {
                  const wo = metrics.work_orders || (metrics.total_contract !== undefined ? metrics : null);
                  if (!wo) return null;
                  
                  return (
                    <div className="bento-card col-span-1 xl:col-span-3 bg-titanium relative border border-bordercol p-5 md:p-6 group hover:border-slateMuted transition-colors">
                      <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                      <div className="flex justify-between items-start mb-6">
                        <h2 className="font-mono text-[10px] text-slateMuted tracking-widest uppercase flex items-center gap-2">
                          <span className="w-1 h-1 bg-chartreuse"></span> FINANCIAL OPERATIONS CONTROLLERS
                        </h2>
                        <span className="text-[9px] text-darkMuted font-mono">STATUS: AUDITING</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="border border-bordercol bg-vanta p-4">
                          <div className="text-[9px] text-darkMuted font-mono uppercase mb-1">TOTAL CONTRACT VALUE</div>
                          <div className="text-xl font-mono text-ghost"><ScrambleNumber value={wo.total_contract || 0} isCurrency={true} /></div>
                        </div>
                        <div className="border border-bordercol bg-vanta p-4">
                          <div className="text-[9px] text-darkMuted font-mono uppercase mb-1">TOTAL BILLED (EXCL GST)</div>
                          <div className="text-xl font-mono text-ghost"><ScrambleNumber value={wo.total_billed || 0} isCurrency={true} /></div>
                        </div>
                        <div className="border border-bordercol bg-vanta p-4 border-l-2 border-l-chartreuse">
                          <div className="text-[9px] text-darkMuted font-mono uppercase mb-1">COLLECTED (INCL GST)</div>
                          <div className="text-xl font-mono text-chartreuse"><ScrambleNumber value={wo.total_collected || 0} isCurrency={true} /></div>
                        </div>
                        <div className="border border-bordercol bg-vanta p-4 border-l-2 border-l-vermilion">
                          <div className="text-[9px] text-darkMuted font-mono uppercase mb-1">OUTSTANDING RECEIVABLES</div>
                          <div className="text-xl font-mono text-vermilion"><ScrambleNumber value={wo.total_receivable || 0} isCurrency={true} /></div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Dynamic Quality Report Warning */}
                {qualityReport && qualityReport.issues.length > 0 && (
                  <div className="bento-card col-span-1 hazard-stripe border border-vermilion p-1">
                      <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} />
                    <div className="bg-vanta w-full h-full p-4 md:p-5 flex flex-col justify-center text-vermilion font-mono">
                      <div className="text-[10px] md:text-xs font-bold tracking-widest uppercase mb-2">⚠ DATA INTEGRITY FLAG</div>
                      <div className="text-2xl md:text-3xl font-bold">{qualityReport.excluded}</div>
                      <div className="text-[9px] md:text-[10px] mt-1 leading-tight uppercase">RECORDS EXCLUDED/FLAGGED DUE TO MISSING VALUES</div>
                    </div>
                  </div>
                )}

              </div>
            )}
          </motion.main>
        )}
      </AnimatePresence>

    </div>
  )
}
