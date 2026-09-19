/**
 * Typed API client for the Skylark BI Agent backend.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  metrics?: Record<string, unknown>
  quality_report?: QualityReport
}

export interface QualityReport {
  issues: string[]
  excluded: number
}

export interface AgentResponse {
  answer: string
  intent?: string
  metrics?: Record<string, unknown>
  quality_report?: QualityReport
  follow_up_suggestions?: string[]
  is_clarification?: boolean
  error?: string
  conversation_id?: string
}

export interface HealthStatus {
  status: string
  monday_connected: boolean
  user?: string
  account?: string
  deals_board?: string
  work_orders_board?: string
  error?: string
}

export interface ConversationHistory {
  id: string
  title: string
  created_at: string
}

export async function sendMessage(
  message: string,
  history: ChatMessage[],
  user_id?: string,
  conversation_id?: string
): Promise<AgentResponse> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, user_id, conversation_id }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Server error ${res.status}: ${text}`)
  }

  return res.json()
}

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_URL}/api/health`, { cache: 'no-store' })
  if (!res.ok) {
    return { status: 'error', monday_connected: false, error: `HTTP ${res.status}` }
  }
  return res.json()
}

export async function getConversations(userId: string): Promise<ConversationHistory[]> {
  const res = await fetch(`${API_URL}/api/conversations?user_id=${userId}`, { cache: 'no-store' })
  if (!res.ok) return []
  return res.json()
}

export async function getConversationMessages(convId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${API_URL}/api/conversations/${convId}`, { cache: 'no-store' })
  if (!res.ok) return []
  return res.json()
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/conversations/${conversationId}`, {
      method: 'DELETE'
    })
    return res.ok
  } catch (error) {
    console.error("Failed to delete conversation:", error)
    return false
  }
}
