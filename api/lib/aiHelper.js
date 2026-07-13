import { FieldValue } from './firebaseAdmin.js'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

export async function generateAiSummary(db, user, body) {
  const { roomId } = body || {}
  if (!roomId) throw Object.assign(new Error('Missing roomId'), { status: 400 })

  const aiStateRef = db.collection('rooms').doc(roomId).collection('aiState').doc('summary')
  const aiStateSnap = await aiStateRef.get()
  const now = Date.now()

  if (aiStateSnap.exists) {
    const lastAt = aiStateSnap.data()?.lastSummaryAt?.toMillis?.() || aiStateSnap.data()?.lastSummaryAtMs || 0
    if (now - lastAt < COOLDOWN_MS) {
      const remainingSec = Math.ceil((COOLDOWN_MS - (now - lastAt)) / 1000)
      return {
        onCooldown: true,
        remainingSec,
        message: `AI Summary is on a 5-minute cooldown. Please wait ${Math.ceil(remainingSec / 60)} min before requesting again.`,
      }
    }
  }

  if (!GROQ_API_KEY) {
    throw Object.assign(new Error('GROQ_API_KEY is not configured on the server. Please add GROQ_API_KEY to your environment variables.'), { status: 503 })
  }

  // Fetch room details and recent messages
  const roomSnap = await db.collection('rooms').doc(roomId).get()
  if (!roomSnap.exists) throw Object.assign(new Error('Room not found'), { status: 404 })
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

  return { success: true, summary: summaryText }
}
