import { useState, useRef, useEffect } from 'react'

export default function Chat({ messages, sendMessage }) {
  const [text, setText] = useState('')
  const [cooldown, setCooldown] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim() || cooldown) return
    await sendMessage(text)
    setText('')
    setCooldown(true)
    setTimeout(() => setCooldown(false), 1000)
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 280 }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Chat</h3>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: '0.5rem' }}>
        {messages.length === 0 && (
          <span style={{ color: 'var(--fog)', fontSize: '0.9rem' }}>No messages yet. Say hi!</span>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--drift)' }}>{m.displayName}</span>
              <span className="mono">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <span style={{ fontSize: '0.95rem', color: 'var(--paper)', wordBreak: 'break-word' }}>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={onSubmit} style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message..."
          maxLength={500}
          style={{ flex: 1 }}
        />
        <button className="btn" type="submit" disabled={cooldown || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
