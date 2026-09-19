'use client'

import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { sendMessage, getHealth, getConversations, getConversationMessages, deleteConversation, type ChatMessage, type HealthStatus, type QualityReport, type ConversationHistory } from '@/lib/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlowingEffect } from "@/components/GlowingEffect"
import { AutoDashboard } from "./AutoDashboard"


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
  const [sidebarView, setSidebarView] = useState<'main' | 'history' | 'prompts'>('main')
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
  
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  
  const handlePromptClick = (text: string) => {
    setSidebarOpen(false)
    handleSubmit(undefined, text)
  }


  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const success = await deleteConversation(id)
    if (success) {
      setConversations(prev => prev.filter(c => c.id !== id))
      if (activeConvId === id) {
        startNewChat()
      }
    }
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

  async function handleSubmit(e?: React.FormEvent, overrideText?: string) {
    e?.preventDefault()
    
    const textToSubmit = overrideText || input
    if (!textToSubmit.trim() || loading) return

    const text = textToSubmit.trim()
    setInput('')
    
    const userMsg = { id: Date.now().toString(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const response = await sendMessage(text, history, userId, activeConvId || undefined)
      if (response.conversation_id) {
        setActiveConvId(response.conversation_id)
        getConversations(userId).then(setConversations)
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
      
      {/* LEFT PANE: Chat Console (Animates smoothly from 100vw to 35vw) */}
      <motion.aside
        initial={false}
        animate={{
          width: hasQueried ? "35%" : "100%",
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} // "Smooth as fuck" expo ease
        className="h-full flex-shrink-0 border-r border-bordercol relative z-20 bg-vanta shadow-2xl flex justify-center"
      >
        <div className={`h-full flex w-full transition-all duration-1000 ${!hasQueried ? 'max-w-4xl' : ''}`}>
          {/* SIDEBAR */}
      <motion.div
        initial={false}
        animate={{ width: sidebarOpen ? 260 : 0, opacity: sidebarOpen ? 1 : 0 }}
        className="h-full bg-[#050505] border-r border-bordercol flex-shrink-0 overflow-hidden flex flex-col z-50 relative"
      >
        <div className="p-4 border-b border-bordercol flex justify-between items-center w-[260px] flex-shrink-0">
          <span className="font-mono text-xs text-ghost tracking-widest uppercase">
            {sidebarView === 'main' && "Menu // System"}
            {sidebarView === 'history' && (
               <button onClick={() => setSidebarView('main')} className="hover:text-chartreuse transition-colors">{'< Back // History'}</button>
            )}
            {sidebarView === 'prompts' && (
               <button onClick={() => setSidebarView('main')} className="hover:text-vermilion transition-colors">{'< Back // Prompts'}</button>
            )}
          </span>
          <button onClick={() => setSidebarOpen(false)} className="text-slateMuted hover:text-vermilion">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        
        {/* VIEW: MAIN MENU */}
        {sidebarView === 'main' && (
          <div className="p-4 w-[260px] flex flex-col gap-4">
            <button onClick={() => setSidebarView('history')} className="group relative border border-bordercol border-l-2 border-l-chartreuse bg-gradient-to-r from-chartreuse/5 to-transparent p-4 hover:bg-chartreuse/10 transition-colors text-left flex flex-col gap-2 overflow-hidden">
               <div className="absolute top-0 left-0 w-1 h-full bg-bordercol group-hover:bg-chartreuse transition-colors"></div>
               <div className="font-mono text-xs text-chartreuse uppercase tracking-widest pl-2">Data Archive</div>
               <div className="font-mono text-[9px] text-slateMuted pl-2">Access previous telemetry logs</div>
            </button>
            
            <button onClick={() => setSidebarView('prompts')} className="group relative border border-bordercol border-l-2 border-l-vermilion bg-gradient-to-r from-vermilion/5 to-transparent p-4 hover:bg-vermilion/10 transition-colors text-left flex flex-col gap-2 overflow-hidden">
               <div className="absolute top-0 left-0 w-1 h-full bg-bordercol group-hover:bg-vermilion transition-colors"></div>
               <div className="font-mono text-xs text-vermilion uppercase tracking-widest pl-2">Tactical Prompts</div>
               <div className="font-mono text-[9px] text-slateMuted pl-2">Pre-configured operational queries</div>
            </button>
          </div>
        )}

        {/* VIEW: HISTORY */}
        {sidebarView === 'history' && (
          <>
            <div className="p-4 w-[260px] flex-shrink-0 border-b border-bordercol/50">
              <button onClick={startNewChat} className="w-full py-2 border border-chartreuse/50 bg-chartreuse/10 text-chartreuse font-mono text-xs uppercase tracking-widest hover:bg-chartreuse/20 transition-colors">
                + New Terminal
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar w-[260px]">
              {conversations.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => loadConversation(c.id)}
                  className={`group flex items-center justify-between p-3 border-b border-bordercol/30 cursor-pointer hover:bg-titanium transition-colors ${activeConvId === c.id ? 'bg-titanium border-l-2 border-l-chartreuse' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-ghost truncate pr-2">{c.title}</div>
                    <div className="font-mono text-[8px] text-darkMuted mt-1">{new Date(c.created_at).toLocaleDateString()}</div>
                  </div>
                  <button 
                    onClick={(e) => handleDeleteConversation(e, c.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slateMuted hover:text-vermilion transition-all bg-vanta border border-transparent hover:border-vermilion/50 rounded-sm"
                    title="Delete Conversation"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* VIEW: PROMPTS */}
        {sidebarView === 'prompts' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar w-[260px] p-4 flex flex-col gap-3">
            {[
              "Generate a complete leadership update. Show me the full pipeline value, won revenue, and operations telemetry.",
              "Give me a detailed breakdown of the active sales pipeline. I want to see our current stages and probability distribution.",
              "Compare won deals against operations work orders. Show me the exact cross-board match rate and unmapped deals.",
              "Analyze the financial health of our Work Orders. Give me a breakdown of contract value versus billed and collected.",
              "Run a strict data quality audit. How many deals are missing monetary values, and how many work orders lack a status?",
            ].map((prompt, i) => (
              <button 
                key={i}
                onClick={() => handlePromptClick(prompt)}
                className="group border border-bordercol bg-vanta p-3 hover:border-ghost transition-colors text-left"
              >
                <div className="font-mono text-[9px] text-slateMuted group-hover:text-ghost transition-colors leading-relaxed">
                  "{prompt}"
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.div>

      
      
          {/* TERMINAL CHAT BOX */}
          <div className={`flex-1 flex flex-col transition-all duration-1000 ${!hasQueried ? 'border-bordercol/40 bg-[#060608] border-y border-r' : ''}`}>

        {/* HEADER */}
        <header className="h-14 border-b border-bordercol flex-shrink-0 w-full flex justify-center">
          <div className="w-full h-full flex items-center justify-between px-4 md:px-6">
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
          <div className={`w-full flex flex-col ${messages.length === 0 ? 'justify-center items-center' : 'justify-start'} min-h-full p-4 md:p-6`}>
            
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
        <div className="border-t border-bordercol bg-vanta flex-shrink-0 flex items-center w-full h-20 md:h-24">
          <form onSubmit={handleSubmit} className="w-full h-full relative flex items-center">
            <div className="absolute left-4 md:left-6 font-mono text-slateMuted text-xs select-none pointer-events-none">
              <span className="text-vermilion animate-pulse">_</span>&gt;
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Give me a leadership update..."
              className="w-full h-full bg-transparent border-none text-ghost font-mono text-xs md:text-sm py-4 pl-12 md:pl-14 pr-28 focus:outline-none focus:border-slateMuted transition-colors placeholder:text-darkMuted"
              disabled={loading}
            />
            <button 
              type="submit" 
              disabled={loading || !input.trim()}
              className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 bg-vermilion text-vanta hover:bg-vanta hover:text-vermilion border border-transparent hover:border-vermilion font-mono text-[10px] md:text-xs font-bold uppercase tracking-widest py-2 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Exec
            </button>
          </form>
        </div>
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
              <div className="w-full min-h-full pb-10">
                <AutoDashboard data={metrics} />
              </div>
            )}
          </motion.main>
        )}
      </AnimatePresence>

    </div>
  )
}
