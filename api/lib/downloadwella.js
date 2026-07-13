import * as cheerio from 'cheerio'

const DOWNLOAD_HOST = 'downloadwella.com'
const MEDIA_RE = /\.(mp4|mkv|m3u8|webm|mov|avi|flv|ts)(?:\?|#|$)/i
const MAX_REDIRECTS = 3
const USER_AGENT = 'Mozilla/5.0 (compatible; ChanMediaResolver/1.0)'

function isDownloadHost(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === DOWNLOAD_HOST || hostname.endsWith(`.${DOWNLOAD_HOST}`)
  } catch {
    return false
  }
}

function isAllowedMediaUrl(value) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || !MEDIA_RE.test(parsed.pathname)) return false
    const hostname = parsed.hostname.toLowerCase()
    const isGeneratedFile = hostname.endsWith(`.${DOWNLOAD_HOST}`)
      || (hostname === DOWNLOAD_HOST && parsed.pathname.startsWith('/d/'))
    return isGeneratedFile
  } catch {
    return false
  }
}

function mergeCookies(previous, response) {
  const jar = new Map()
  for (const part of String(previous || '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name && rest.length) jar.set(name, rest.join('='))
  }

  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : String(response.headers.get('set-cookie') || '').split(/,(?=[^;]+=[^;]+)/)

  for (const cookie of setCookies) {
    const [pair] = cookie.split(';')
    const [name, ...rest] = pair.trim().split('=')
    if (name && rest.length) jar.set(name, rest.join('='))
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

function formFields($, form) {
  const fields = new URLSearchParams()
  form.find('input[name], textarea[name], select[name]').each((_, element) => {
    const name = $(element).attr('name')
    if (!name) return
    const value = $(element).attr('value') || $(element).text() || ''
    fields.set(name, value)
  })
  return fields
}

function directUrlsFromHtml(html, pageUrl) {
  const $ = cheerio.load(html)
  const urls = new Set()
  const add = (raw) => {
    if (!raw) return
    const decoded = raw.replace(/&amp;/g, '&').replace(/&#40;|&#41;/g, (match) => match === '&#40;' ? '(' : ')')
    try {
      const absolute = new URL(decoded, pageUrl).href
      if (isAllowedMediaUrl(absolute)) urls.add(absolute)
    } catch {
      /* ignore malformed links */
    }
  }

  $('a[href], source[src], video[src]').each((_, element) => {
    add($(element).attr('href') || $(element).attr('src'))
  })

  const rawMatches = html.match(/https?:[^\s"'<>]+\.(?:mp4|mkv|m3u8|webm|mov|avi|flv|ts)(?:\?[^\s"'<>]*)?/gi) || []
  rawMatches.forEach(add)
  return [...urls]
}

async function request(url, options = {}) {
  const { headers = {}, ...rest } = options
  return fetch(url, {
    ...rest,
    redirect: 'manual',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...headers,
    },
  })
}

export async function resolveDownloadwellaPage(pageUrl) {
  if (!isDownloadHost(pageUrl)) return { directUrls: [], requiresUserAction: false }

  let currentUrl = pageUrl
  let cookies = ''
  let html = ''

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await request(currentUrl, {
      headers: { Referer: pageUrl, ...(cookies ? { Cookie: cookies } : {}) },
    })
    cookies = mergeCookies(cookies, response)

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location || !isDownloadHost(new URL(location, currentUrl).href)) break
      currentUrl = new URL(location, currentUrl).href
      continue
    }

    if (!response.ok) break
    html = await response.text()
    break
  }

  if (!html) return { directUrls: [], requiresUserAction: true }

  const pageDirectUrls = directUrlsFromHtml(html, currentUrl)
  if (pageDirectUrls.length) return { directUrls: pageDirectUrls, requiresUserAction: false }

  const $ = cheerio.load(html)
  const form = $('form').filter((_, element) => $(element).find('input[name="op"][value="download2"]').length > 0).first()
  if (!form.length) return { directUrls: [], requiresUserAction: true }

  const action = form.attr('action')
    ? new URL(form.attr('action'), currentUrl).href
    : currentUrl
  if (!isDownloadHost(action)) return { directUrls: [], requiresUserAction: true }

  const response = await request(action, {
    method: 'POST',
    headers: {
      Referer: currentUrl,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: formFields($, form).toString(),
  })
  cookies = mergeCookies(cookies, response)

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (location && isDownloadHost(new URL(location, action).href)) {
      const redirected = await request(new URL(location, action).href, {
        headers: { Referer: action, ...(cookies ? { Cookie: cookies } : {}) },
      })
      if (redirected.ok) return { directUrls: directUrlsFromHtml(await redirected.text(), redirected.url || action), requiresUserAction: false }
    }
    return { directUrls: [], requiresUserAction: true }
  }

  if (!response.ok) return { directUrls: [], requiresUserAction: true }
  const resultHtml = await response.text()
  const directUrls = directUrlsFromHtml(resultHtml, action)
  return { directUrls, requiresUserAction: directUrls.length === 0 }
}
