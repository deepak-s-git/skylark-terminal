'use client'

const SUGGESTED = [
  "Generate a complete leadership update. Show me the full pipeline value, won revenue, and operations telemetry.",
  "Give me a detailed breakdown of the active sales pipeline. I want to see our current stages and probability distribution.",
  "Compare won deals against operations work orders. Show me the exact cross-board match rate and unmapped deals.",
  "Analyze the financial health of our Work Orders. Give me a breakdown of contract value versus billed and collected.",
  "Run a strict data quality audit. How many deals are missing monetary values, and how many work orders lack a status?",
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
            className="rounded-full border border-bordercol bg-vanta px-3 py-1.5 text-[10px] text-slateMuted hover:border-chartreuse hover:text-chartreuse font-mono uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
