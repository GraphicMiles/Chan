import { Firestore, FieldValue, Timestamp } from '@google-cloud/firestore'

function getCredentials() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials are missing. Check FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.')
  }

  // Users sometimes paste the whole service-account JSON into this env var.
  // Detect that and extract the correct fields.
  if (privateKey.trim().startsWith('{')) {
    try {
      const json = JSON.parse(privateKey)
      privateKey = json.private_key
      if (!privateKey) throw new Error('private_key not found in service account JSON')
    } catch (err) {
      throw new Error(`FIREBASE_ADMIN_PRIVATE_KEY looks like JSON but could not be parsed: ${err.message}`)
    }
  }

  // Vercel stores multiline keys with literal \n characters, so convert them to real newlines.
  privateKey = privateKey.replace(/\\n/g, '\n')

  return { projectId, clientEmail, privateKey }
}

let dbInstance = null

export function getDb() {
  if (!dbInstance) {
    const { projectId, clientEmail, privateKey } = getCredentials()
    dbInstance = new Firestore({
      projectId,
      credentials: { client_email: clientEmail, private_key: privateKey },
    })
  }
  return dbInstance
}

export { FieldValue, Timestamp }
