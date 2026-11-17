import axios from 'axios'

let rawBase = (import.meta.env.VITE_API_URL || '').trim()
if (!rawBase || rawBase === '/api') {
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    rawBase = 'https://videoediting-production-4a3d041e.up.railway.app'
  } else {
    rawBase = rawBase || '/api'
  }
}
if (rawBase && !rawBase.startsWith('http://') && !rawBase.startsWith('https://') && !rawBase.startsWith('/')) {
  rawBase = `https://${rawBase}`
}
const BASE = rawBase

const client = axios.create({ baseURL: BASE, timeout: 60000 })

export const TOKEN_KEY = 'reel_token'
export const USER_KEY = 'reel_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status
    if (status === 401 && getToken()) {
      clearSession()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?expired=1'
      }
    }
    return Promise.reject(error)
  },
)

export function apiError(error, fallback = 'Something went wrong. Please try again.') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0]
    const loc = Array.isArray(first?.loc) ? first.loc.filter((x) => x !== 'body').join('.') : ''
    const msg = first?.msg || fallback
    return loc ? `${loc}: ${msg}` : msg
  }
  if (error?.message === 'Network Error') return 'Cannot reach the backend. Is it running on port 8000?'
  // Unexpected client-side error - surface the real reason instead of a
  // vague fallback so bugs are visible.
  if (error?.message && !error?.response) return error.message
  return fallback
}

/**
 * Media URLs (video, thumbnails, images) are loaded by the browser through
 * plain <video src> / <img src> tags, which cannot send an Authorization
 * header. The backend also accepts the JWT as a ?token= query parameter for
 * those routes.
 */
export function withToken(url) {
  const token = getToken()
  if (!token) return url
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

/* ------------------------------------------------------------------ auth -- */
export const auth = {
  register: (payload) => client.post('/auth/register', payload).then((r) => r.data),
  login: (payload) => client.post('/auth/login', payload).then((r) => r.data),
  me: () => client.get('/auth/me').then((r) => r.data),
}

/* -------------------------------------------------------------- templates -- */
export const templates = {
  list: (params = {}) => client.get('/templates', { params }).then((r) => r.data),
  get: (id) => client.get(`/templates/${id}`).then((r) => r.data),
}

/* --------------------------------------------------------------- projects -- */
export const projects = {
  list: () =>
    client.get('/projects').then((r) =>
      r.data.map((p) => ({
        ...p,
        thumbnail_url: p.thumbnail_url ? withToken(`${BASE}${p.thumbnail_url.replace('/api', '')}`) : null,
      })),
    ),
  delete: (id) => client.delete(withToken(`/projects/${id}`)).then((r) => r.data),
  upload: (file, onProgress) => {
    const form = new FormData()
    form.append('file', file)
    return client
      .post('/projects/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
      .then((r) => r.data)
  },
  get: (id) => client.get(`/projects/${id}`).then((r) => r.data),
  patch: (id, payload) => client.patch(`/projects/${id}`, payload).then((r) => r.data),
  thumbnails: (id) =>
    client
      .get(`/projects/${id}/thumbnails`)
      .then((r) => ({ ...r.data, thumbnails: (r.data.thumbnails || []).map(withToken) })),
  videoUrl: (id) => withToken(`${BASE}/projects/${id}/video`),
  images: (id) =>
    client
      .get(`/projects/${id}/images`)
      .then((r) => ({
        ...r.data,
        images: (r.data.images || []).map((img) => ({ ...img, url: withToken(img.url) })),
      })),
  uploadImages: (id, files) => {
    const form = new FormData()
    Array.from(files).forEach((f) => form.append('files', f))
    return client
      .post(`/projects/${id}/images`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data)
  },
  deleteImage: (id, name) => client.delete(`/projects/${id}/images/${name}`).then((r) => r.data),
  previewStill: (id, payload) =>
    client
      .post(`/projects/${id}/preview-still`, payload, { responseType: 'blob', timeout: 300000 })
      .then((r) => r.data),
  wordTiming: (id, word) =>
    client.post(`/projects/${id}/word-timing`, { word }, { timeout: 600000 }).then((r) => r.data),
  cut: (id, payload) =>
    client.post(`/projects/${id}/cut`, payload, { timeout: 600000 }).then((r) => r.data),
  cutVideoUrl: (id) => withToken(`${BASE}/projects/${id}/cut-video`),
}

/* -------------------------------------------------------------- subtitles -- */
export const subtitles = {
  list: (id) => client.get(`/projects/${id}/subtitles`).then((r) => r.data),
  save: (id, list) => client.put(`/projects/${id}/subtitles`, { subtitles: list }).then((r) => r.data),
  transcribe: (id, payload) =>
    client.post(`/projects/${id}/subtitles/transcribe`, payload || {}).then((r) => r.data),
  polish: (id, payload = {}) => client.post(`/projects/${id}/subtitles/polish`, payload).then((r) => r.data),
  importScript: (id, scriptText) =>
    client.post(`/projects/${id}/subtitles/import-script`, { script_text: scriptText }).then((r) => r.data),
  remove: (id, subId) => client.delete(`/projects/${id}/subtitles/${subId}`).then((r) => r.data),
}

/* ---------------------------------------------------------------- effects -- */
export const effects = {
  list: (id) => client.get(`/projects/${id}/effects`).then((r) => r.data),
  save: (id, list) => client.put(`/projects/${id}/effects`, { effects: list }).then((r) => r.data),
}

/* ----------------------------------------------------------------- render -- */
export const render = {
  start: (id, payload = {}) => client.post(`/projects/${id}/render`, payload).then((r) => r.data),
  job: (jobId) => client.get(`/render/${jobId}`).then((r) => r.data),
  jobs: (projectId) => client.get(`/projects/${projectId}/renders`).then((r) => r.data),
  downloadUrl: (jobId) => `${BASE}/render/${jobId}/download?token=${getToken()}`,
  videoUrl: (jobId) => `${BASE}/render/${jobId}/video?token=${getToken()}`,
}

export default client
