'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentResponse, QualityReport } from '@/lib/api'

interface Props {
  role: 'user' | 'assistant'
  content: string
  quality_report?: QualityReport
  intent?: string
}

function QualityNotice({ report }: { report: QualityReport }) {
  if (!report.issues || report.issues.length === 0) return null
  return (
    <div className="mt-3 rounded-md border border-yellow-800/50 bg-yellow-900/20 p-3 text-xs text-yellow-300/90">
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <span>⚠️</span>
        <span>Data Notes</span>
      </div>
      <ul className="list-disc pl-4 space-y-0.5">
        {report.issues.slice(0, 5).map((issue, i) => (
          <li key={i}>{issue}</li>
        ))}
      </ul>
    </div>
  )
}

export default function MessageBubble({ role, content, quality_report, intent }: Props) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="mr-2 mt-1 flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
          S
        </div>
      )}
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-tr-sm'
            : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-tl-sm'
        }`}
      >
        {isUser ? (
          <p>{content}</p>
        ) : (
          <>
            {intent && intent !== 'clarification_needed' && (
              <div className="mb-2 inline-block rounded-full bg-blue-900/50 px-2 py-0.5 text-xs text-blue-300">
                {intent.replace(/_/g, ' ')}
              </div>
            )}
            <div className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
            {quality_report && <QualityNotice report={quality_report} />}
          </>
        )}
      </div>
    </div>
  )
}
