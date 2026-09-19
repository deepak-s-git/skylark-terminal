'use client'

const SUGGESTED = [
  "What is our current pipeline value?",
  "How is the Mining sector performing?",
  "What's our win rate across all sectors?",
  "Give me a leadership update",
  "Are won deals turning into work orders?",
  "Which sectors have the most active work orders?",
  "What's the completion rate for work orders?",
  "Show me sector performance comparison",
]

interface Props {
  onSelect: (question: string) => void
  disabled?: boolean
}

export default function SuggestedQuestions({ onSelect, disabled }: Props) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
        Try asking
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED.map((q) => (
          <button
            key={q}
            onClick={() => onSelect(q)}
            disabled={disabled}
            className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:border-blue-500 hover:bg-blue-900/30 hover:text-blue-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
