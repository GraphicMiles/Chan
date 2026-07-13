# Chan App — Completion Note

## Current status

The app now builds locally and the main boot, routing, player-contract, media-authentication, and mixed-content handling issues have been addressed in the local branch.

Latest local repair commit:

```text
aa87ccf fix: handle unsupported streams and incomplete media layers
```

These changes have not yet been pushed to GitHub/Vercel.

The app is **not fully complete yet** because some media sources require external configuration or infrastructure that cannot be solved entirely in React code.

---

## What is already fixed locally

- Restored the application entry point and React Router setup.
- Restored the existing authentication and toast providers.
- Added missing dependencies and regenerated `package-lock.json`.
- Added missing style-module files needed by the new UI/player.
- Reconciled `RoomPage`, `VideoPlayer`, and `usePlayerSync` player interfaces.
- Added YouTube/direct/HLS player compatibility.
- Prevented page URLs from being treated as direct playable files.
- Fixed YouTube search result handoff into room creation.
- Fixed the broken unified-search `Load More` state.
- Consolidated media calls through `/api/media` while retaining legacy aliases.
- Added media API authentication.
- Added basic SSRF/private-network protection to media scraping.
- Removed fake IPTV placeholder results.
- Removed fake sports fallback matches when no sports API key is configured.
- Redacted credentials from the current `.env.example`.
- Added clearer handling for HTTP streams inside the HTTPS deployment.

---

# Remaining work

## 1. O2TV HTTP/HTTPS playback

### Problem

The O2TV link supplied for testing is:

```text
http://d6.o2tv.org/Westworld/Season%2004/Westworld%20-%20S04E01%20(TvShows4Mobile.Com)%20otv-1awrk.mp4
```

The server responds with a valid `video/mp4` file over HTTP, but the app is served by Vercel over HTTPS. Browsers block HTTP media loaded inside an HTTPS page as mixed content.

The HTTPS version of the same O2TV host currently fails TLS, so changing `http://` to `https://` is not sufficient.

### Files already involved

```text
src/shared/lib/youtube.js
src/features/create/pages/CreateRoomPage.jsx
src/features/search/UnifiedSearch.jsx
src/features/room/components/VideoPlayer.jsx
api/lib/sources.js
```

These files now detect the problem and prevent the user from creating a room that will definitely fail.

### What must be updated for true O2TV playback

There are three possible solutions:

#### Preferred solution: use an HTTPS-compatible source

No proxy code is needed. The result returned by the O2TV source must contain a URL that supports:

- HTTPS
- `video/mp4` or HLS `application/vnd.apple.mpegurl`
- Browser playback from the Chan origin
- Appropriate CORS behavior where required

The main source configuration belongs in:

```text
api/lib/sources.js
api/media.js
```

#### Alternative: add a restricted external media proxy

A proxy should not be added as an unrestricted `fetch(url)` endpoint. It would need to:

- Allow only approved hosts such as `d6.o2tv.org`.
- Reject private IPs and arbitrary domains.
- Validate the requested path.
- Support `Range` requests for seeking.
- Forward `Content-Type`, `Content-Length`, `Accept-Ranges`, and range responses.
- Limit response size and duration.
- Avoid buffering a large video entirely in memory.
- Require authenticated users.
- Apply rate limits.

Files that would likely be added or updated:

```text
api/mediaProxy.js                  # New restricted proxy, if used
api/lib/mediaAllowlist.js          # Approved host/path rules
api/lib/http.js                    # Shared response/CORS handling if needed
src/shared/lib/youtube.js          # Proxy URL/unsupported-source detection
src/features/room/components/VideoPlayer.jsx
src/features/create/pages/CreateRoomPage.jsx
src/features/search/UnifiedSearch.jsx
vercel.json                         # Only if a route/rewrite is required
.env.example                        # Proxy configuration, if any
```

A Vercel proxy is not necessarily the best solution for a 70 MB+ file because of serverless execution, bandwidth, timeout, and response-size constraints. An edge worker or a properly designed media gateway may be more suitable.

---

## 2. Thenkiri/Nkiri page extraction

### Problem

This URL is an HTML page, not a video file:

```text
https://thenkiri.com/silo-s03-complete-tv-series/
```

It contains download-page links such as `downloadwella.com` pages. It does not contain a direct `.mp4` or `.m3u8` URL in the initial HTML response.

### Files to maintain

```text
api/lib/sources.js
api/media.js
src/hooks/useScraper.js
src/features/create/pages/CreateRoomPage.jsx
src/features/search/UnifiedSearch.jsx
```

### Required behavior

The app should distinguish these result types:

```text
Direct file       → playable in the room
HTML page         → open/extract another page
Blocked page      → show a clear error
Unsupported URL   → do not create a room
```

The required extraction flow is:

1. User submits the Thenkiri page.
2. The API extracts page links.
3. The UI marks them as `Page`, not `Direct`.
4. User selects a page result.
5. The page URL is loaded into the scraper.
6. The next extraction step searches for a direct file.
7. Only a verified `.mp4`/`.m3u8`/supported stream is allowed into room creation.

This may still fail if a download site requires JavaScript, CAPTCHA, cookies, or blocks automated requests. That is a source limitation, not a React player bug.

---

## 3. IPTV layer

### Current status

The app now reads the supplied Free-TV M3U playlist by default:

```text
https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8
```

The parser extracts channel name, group, country, logo, and HTTPS stream URL. It filters out HTTP-only streams, placeholder URLs, and known page links such as YouTube/Twitch pages so they are not shown as playable channels in the HTTPS deployment.

The playlist is cached in the serverless instance for five minutes to avoid downloading the catalog on every query.

### Configuration

Optional Vercel variables:

```text
IPTV_PLAYLIST_URL=https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8
IPTV_CHANNELS_JSON=[]
```

`IPTV_CHANNELS_JSON` can contain additional licensed/public channels:

```json
[
  {
    "name": "Example News",
    "url": "https://example.com/news.m3u8",
    "group": "News",
    "logo": "https://example.com/logo.png"
  }
]
```

### Files updated

```text
api/lib/iptv.js
api/media.js
.env.example
```

The existing UI/player files consume the normalized IPTV result schema:

```text
src/features/search/UnifiedSearch.jsx
src/features/room/components/VideoPlayer.jsx
src/features/create/pages/CreateRoomPage.jsx
```

For production, also add:

- Channel health checks.
- EPG/program metadata.
- Source licensing/permission checks.
- Per-channel CORS and HTTPS validation.
- A database or admin interface instead of allowing arbitrary user channels in a request body.

---

## 4. Sports layer

### Current status

The sports layer no longer displays fake fallback matches when the API is not configured. It requires:

```text
FOOTBALL_DATA_KEY
```

Sports-to-IPTV matching is now supported through an explicit channel mapping. This avoids guessing that an arbitrary sports channel is carrying a particular fixture.

### Files updated

```text
api/media.js
api/lib/iptv.js
src/features/search/UnifiedSearch.jsx
src/features/create/pages/CreateRoomPage.jsx
.env.example
```

### Sports mapping configuration

Configure a mapping against channel names in the M3U catalog:

```text
SPORTS_CHANNEL_MAP_JSON=[{"competition":"Premier League","channels":["SuperSport","Sky Sports"]}]
```

The API matches the fixture competition/team to the configured channel names. A result becomes playable only when a matching HTTPS IPTV channel is found. Otherwise, it remains informational and shows that no mapped channel is available.

### Still required for production sports

- Configure the football-data API key.
- Use licensed/authorized channel mappings.
- Add date/competition filtering.
- Add pagination or a current-match window.
- Add timezone-aware match times.
- Handle API quota and error states visibly.

The system can now perform a configured metadata-to-channel match, but it cannot determine broadcast rights from fixture metadata alone.

---

## 5. NSFW layer

### Current status

The NSFW layer reports that it is not configured instead of silently returning an empty result set.

### Files that would need approved implementation

```text
api/media.js
src/features/search/UnifiedSearch.jsx
src/shared/auth/hooks/useAuth.jsx
firestore.rules
.env.example
```

A real implementation would need:

- A legally permitted/approved provider.
- Server-side access control.
- More than a client-side `window.confirm()` age prompt.
- Region and age policy handling.
- Content moderation/reporting rules.
- Privacy and retention decisions.
- No direct exposure of adult-provider credentials.

The client-side `adultVerified` flag alone is not a real age-verification system.

---

## 6. Media player validation and synchronization

### Main files

```text
src/features/room/components/VideoPlayer.jsx
src/features/room/hooks/usePlayerSync.js
src/features/room/pages/RoomPage.jsx
src/features/create/pages/CreateRoomPage.jsx
src/shared/lib/youtube.js
```

### Remaining test matrix

The following combinations need manual testing in a staging deployment:

- YouTube video as host.
- YouTube video as viewer.
- Direct HTTPS MP4 as host.
- Direct HTTPS MP4 as viewer.
- HTTPS HLS/M3U8 as host.
- HTTPS HLS/M3U8 as viewer.
- Unsupported HTTP stream.
- Changing videos while viewers are connected.
- Pause, play, seek, and late viewer join.
- Host leaving and room ending.
- Mobile browser behavior.

The O2TV HTTP URL should be classified as unsupported on the HTTPS deployment rather than creating a room that fails later.

---

## 7. API and deployment cleanup

### Current API files

```text
api/cleanupStaleRooms.js
api/createLiveKitToken.js
api/media.js
api/moderate.js
api/room.js
api/search.js
api/scrape.js
```

`api/search.js` and `api/scrape.js` are now backward-compatible aliases to `api/media.js`. They are retained for compatibility but add two extra Vercel functions.

If no external client uses the legacy paths, they can be removed:

```text
api/search.js
api/scrape.js
```

After removal, update:

```text
README.md
docs/APP_AUDIT.md
docs/APP_BROKEN_STATE_AUDIT.md
docs/SCRAPER.md
docs/SCRAPER_ROOM_INTEGRATION.md
guide.md
```

The intended final API surface is:

```text
POST /api/room
POST /api/moderate
POST /api/createLiveKitToken
POST/GET /api/cleanupStaleRooms
POST /api/media
```

---

## 8. Credentials and environment configuration

The current `.env.example` has been redacted, but credentials that existed in earlier Git commits remain in repository history.

These must be rotated outside the codebase:

- Firebase Admin service-account private key.
- LiveKit API secret.
- YouTube API key.
- Any OMDb or sports API keys.
- GitHub PAT previously shared in chat.

Then configure the replacement values in:

```text
Vercel → Project Settings → Environment Variables
```

Do not put server secrets in variables beginning with `VITE_`.

Relevant files:

```text
.env.example
api/lib/firebaseAdmin.js
api/createLiveKitToken.js
api/media.js
src/shared/lib/firebase.js
```

---

## 9. Security and operational work remaining

Review and test:

```text
api/media.js
api/lib/http.js
api/lib/firebaseAdmin.js
api/room.js
api/moderate.js
firestore.rules
vercel.json
```

Remaining operational tasks include:

- Add rate limits for media search/scraping.
- Monitor YouTube, sports, and other provider quotas.
- Validate all outbound URLs and redirects.
- Add request size and query-length limits.
- Review Firestore rules after adding any new room metadata.
- Add server-side logging without logging credentials or full sensitive URLs.
- Run `npm audit` and review the reported vulnerabilities individually.
- Reduce the large JavaScript bundle through route-level code splitting.
- Add automated tests for media normalization and URL validation.

---

# Definition of done

The app should not be considered fully ready until all of the following are true:

- `npm ci` works from a clean checkout.
- `npm run build` passes in Vercel.
- All required environment variables are configured in Vercel.
- No credentials exist in the current tree or reachable Git history.
- YouTube room creation works.
- HTTPS MP4 playback works.
- HTTPS HLS playback works.
- HTTP-only streams are rejected with a clear explanation.
- HTML page URLs cannot create rooms as if they were videos.
- Thenkiri page extraction has a clear multi-step flow.
- IPTV results contain only valid configured streams.
- Sports results are either real/configured or clearly unavailable.
- NSFW is either properly implemented with policy controls or disabled.
- Host/viewer synchronization works on desktop and mobile.
- Room changes synchronize correctly for existing viewers.
- Vercel deployment uses the latest repaired commit.
