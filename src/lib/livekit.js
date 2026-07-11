import { Room } from 'livekit-client'

export const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL

export function createRoom() {
  return new Room({
    adaptiveStream: true,
    dynacast: true,
  })
}

export async function connectToLivekit(room, token, url = LIVEKIT_URL) {
  if (!url || !token) throw new Error('LiveKit URL or token missing')
  await room.connect(url, token)
  return room
}

export async function publishScreenShare(room) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'monitor' },
    audio: true,
  })
  await room.localParticipant.publishTrack(stream.getVideoTracks()[0])
  return stream
}

export function getHostVideoTrack(room) {
  const participants = [room.localParticipant, ...room.remoteParticipants.values()]
  for (const p of participants) {
    for (const track of p.trackPublications.values()) {
      if (track.track && track.kind === 'video') {
        return track.track
      }
    }
  }
  return null
}
