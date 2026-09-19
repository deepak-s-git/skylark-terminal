'use client'

import { useEffect, useRef, useState } from 'react'
import MessageBubble from '@/components/MessageBubble'
import SuggestedQuestions from '@/components/SuggestedQuestions'
import { sendMessage, getHealth, type ChatMessage, type HealthStatus } from '@/lib/api'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  quality_report?: { issues: string[]; excluded: number }
  intent?: string
}

function StatusBar({ health }: { health: HealthStatus | null }) {
  if (!health) return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className="w-2 h-2 rounded-full bg-slate-600 animate-pulse" />
      Connecting…
    </div>
  )
  return (
    <div className={`flex items-center gap-1.5 text-xs ${health.monday_connected ? 'text-emerald-400' : 'text-red-400'}`}>
      <span className={`w-2 h-2 rounded-full ${health.monday_connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
      {health.monday_connected
        ? `Connected · ${health.deals_board || 'Deals'} & ${health.work_orders_board || 'Work Orders'}`
        : `Disconnected · ${health.error || 'Check API token'}`}
    </div>
  )
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Health check on mount
  useEffect(() => {
    getHealth().then(setHealth).catch(() =>
      setHealth({ status: 'error', monday_connected: false, error: 'Could not reach backend' })
    )
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const history = messages.map(m => ({ role: m.role, content: m.content }))

  async function handleSubmit(question?: string) {
    const text = (question ?? input).trim()
    if (!text || loading) return

    setInput('')
    setShowSuggestions(false)

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const response = await sendMessage(text, history as ChatMessage[])
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer,
        quality_report: response.quality_report ?? undefined,
        intent: response.intent ?? undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `**Error:** ${err instanceof Error ? err.message : 'Something went wrong. Please try again.'}`,
        },
      ])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-sm">
            S
          </div>
          <div>
            <h1 className="font-semibold text-slate-100 leading-tight">Skylark BI Agent</h1>
            <p className="text-xs text-slate-500">Business Intelligence · Live monday.com data</p>
          </div>
        </div>
        <StatusBar health={health} />
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center pb-12">
            <div className="mb-6 w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-3xl">
              📊
            </div>
            <h2 className="text-xl font-semibold text-slate-200 mb-2">
              Ask anything about your business
            </h2>
            <p className="text-sm text-slate-500 mb-8 max-w-md">
              I have live access to your Skylark Drones monday.com boards — Deals pipeline and Work Orders.
              All answers come from real data.
            </p>
            <div className="w-full max-w-2xl">
              <SuggestedQuestions onSelect={q => handleSubmit(q)} disabled={loading} />
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            quality_report={msg.quality_report}
            intent={msg.intent}
          />
        ))}

        {loading && (
          <div className="flex justify-start mb-4">
            <div className="mr-2 flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
              S
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-slate-800 border border-slate-700 px-4 py-3">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span>Fetching from monday.com and analyzing…</span>
              </div>
            </div>
          </div>
        )}

        {/* Show suggestions inline after first response */}
        {messages.length > 0 && !loading && showSuggestions && (
          <div className="mt-4 px-2">
            <SuggestedQuestions onSelect={q => handleSubmit(q)} disabled={loading} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 focus-within:border-blue-500/70 transition-colors">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about pipeline, revenue, sectors, work orders…"
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none disabled:opacity-60"
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '…' : 'Ask'}
          </button>
        </div>
        <p className="mt-1.5 text-center text-xs text-slate-600">
          Data sourced live from monday.com · All calculations are deterministic Python
        </p>
      </div>
    </div>
  )
}
