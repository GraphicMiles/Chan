import { getDb, FieldValue, verifyIdToken } from './lib/firebaseAdmin.js'
import { preflight, ok, fail, statusForError } from './lib/http.js'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

async function requireUser(req) {
  const authorization = req.headers?.authorization || ''
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''
  if (!token) throw Object.assign(new Error('Missing token'), { status: 401 })

  try {
    return await verifyIdToken(token)
  } catch {
    throw Object.assign(new Error('Invalid or expired token'), { status: 401 })
  }
}

export default async function handler(req, res) {
  if (preflight(req, res, { methods: ['POST'] })) return
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')

  try {
    const user = await requireUser(req)
    const { action, roomId } = req.body || {}

    if (!roomId) return fail(res, 400, 'Missing roomId')

    if (action === 'summary') {
      const db = getDb()
      const aiStateRef = db.collection('rooms').doc(roomId).collection('aiState').doc('summary')
      const aiStateSnap = await aiStateRef.get()
      const now = Date.now()

      if (aiStateSnap.exists) {
        const lastAt = aiStateSnap.data()?.lastSummaryAt?.toMillis?.() || aiStateSnap.data()?.lastSummaryAtMs || 0
        if (now - lastAt < COOLDOWN_MS) {
          const remainingSec = Math.ceil((COOLDOWN_MS - (now - lastAt)) / 1000)
          return ok(res, {
            onCooldown: true,
            remainingSec,
            message: `AI Summary is on a 5-minute cooldown. Please wait ${Math.ceil(remainingSec / 60)} min before requesting again.`,
          })
        }
      }

      if (!GROQ_API_KEY) {
        return fail(res, 503, 'GROQ_API_KEY is not configured on the server. Please add GROQ_API_KEY to your environment variables.')
      }

      // Fetch room details and recent messages
      const roomSnap = await db.collection('rooms').doc(roomId).get()
      if (!roomSnap.exists) return fail(res, 404, 'Room not found')
      const roomData = roomSnap.data()

      const msgsSnap = await db
        .collection('rooms')
        .doc(roomId)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get()

      const messagesList = msgsSnap.docs
        .map((d) => d.data())
        .filter((m) => m.type !== 'system' && m.type !== 'bot' && m.text)
        .reverse()

      const chatTranscript = messagesList.length
        ? messagesList.map((m) => `${m.displayName}: ${m.text}`).join('\n')
        : 'No user messages sent recently.'

      const prompt = `You are ChanBot 🤖, a helpful, energetic AI assistant inside a live watch party room on Chan.
Room Title: "${roomData.title || 'Live Watch Party'}"
Activity: ${roomData.videoType || roomData.activityType || 'Video Stream'}

Recent Chat Transcript:
${chatTranscript}

Task: Write a concise, engaging 3-4 sentence summary of what everyone is watching and discussing in the room right now. Highlight key reactions or topics. Keep your tone friendly and direct.`

      const groqRes = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 250,
          temperature: 0.7,
        }),
      })

      if (!groqRes.ok) {
        const errJson = await groqRes.json().catch(() => ({}))
        throw new Error(errJson.error?.message || `Groq API returned HTTP ${groqRes.status}`)
      }

      const groqData = await groqRes.json()
      const summaryText = groqData.choices?.[0]?.message?.content?.trim() || 'No summary generated.'

      // Write bot message to chat
      const botMsg = {
        uid: 'chan-bot-ai',
        displayName: 'ChanBot 🤖',
        text: `📊 AI Summary: ${summaryText}`,
        type: 'bot',
        createdAt: FieldValue.serverTimestamp(),
      }
      await db.collection('rooms').doc(roomId).collection('messages').add(botMsg)

      // Update cooldown state
      await aiStateRef.set({
        lastSummaryAt: FieldValue.serverTimestamp(),
        lastSummaryAtMs: now,
        requestedBy: user.uid,
      }, { merge: true })

      return ok(res, { success: true, summary: summaryText })
    }

    return fail(res, 400, `Unknown action: ${action}`)
  } catch (err) {
    console.error('AI API error:', err)
    return fail(res, statusForError(err), err.message || 'AI request failed')
  }
}
