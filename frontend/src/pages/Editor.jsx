import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  apiError,
  effects as effectsApi,
  projects,
  render as renderApi,
  subtitles as subtitlesApi,
  templates as templatesApi,
} from '../api/client'
import { useToast } from '../components/ToastProvider'
import { useProject } from '../hooks/useProject'
import { useTimeline } from '../hooks/useTimeline'
import { usePolling } from '../hooks/usePolling'
import TemplateGallery from '../components/TemplateGallery'
import OptionsForm from '../components/OptionsForm'
import VideoPreview from '../components/VideoPreview'
import Timeline from '../components/Timeline'
import RenderProgress from '../components/RenderProgress'

const DEFAULT_WINDOW = 3

function extractKeywordAt(subtitles, targetTime, fallback = '') {
  if (!subtitles || subtitles.length === 0) return fallback
  let cue = subtitles.find((s) => targetTime >= s.start_time && targetTime <= s.end_time)
  if (!cue) {
    cue = [...subtitles].sort(
      (a, b) => Math.abs(a.start_time - targetTime) - Math.abs(b.start_time - targetTime),
    )[0]
  }
  if (!cue || !cue.text) return fallback
  const clean = cue.text.trim().replace(/[.,!?:;"'()\-]/g, '')
  const stopwords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'in', 'on', 'at',
    'by', 'for', 'with', 'about', 'of', 'we', 'you', 'i', 'he', 'she', 'it', 'they', 'this',
    'that', 'now', 'going', 'so', 'if', 'as', 'do', 'does', 'did', 'have', 'has', 'had',
    'im', 'my', 'your', 'our', 'their', 'very', 'just', 'like', 'there', 'here', 'then',
  ])
  const words = clean.split(/\s+/).filter(Boolean)
  const keywords = words.filter((w) => !stopwords.has(w.toLowerCase()))
  if (keywords.length > 0) return keywords.slice(0, 3).join(' ').toUpperCase()
  return words.slice(0, 3).join(' ').toUpperCase() || fallback
}

function extractLinesAt(subtitles, targetTime) {
  if (!subtitles || subtitles.length === 0) return ''
  const idx = subtitles.findIndex((s) => targetTime >= s.start_time && targetTime <= s.end_time)
  const active = idx >= 0 ? subtitles[idx] : subtitles[0]
  if (!active || !active.text) return ''
  const words = active.text
    .trim()
    .toUpperCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return ''
  const lines = []
  for (let i = 0; i < words.length; i += 5) {
    lines.push(words.slice(i, i + 5).join(' '))
  }
  return lines.join('|')
}

export default function Editor() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const videoRef = useRef(null)

  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [selectedEffectId, setSelectedEffectId] = useState(null)
  const [selectedSubtitleId, setSelectedSubtitleId] = useState(null)
  const [draftOptions, setDraftOptions] = useState({})
  const [images, setImages] = useState({ count: 0, images: [] })
  const [playing, setPlaying] = useState(false)
  const [job, setJob] = useState(null)
  const [rendering, setRendering] = useState(false)
  const [still, setStill] = useState(null)
  const [stillLoading, setStillLoading] = useState(false)
  const [stillError, setStillError] = useState('')
  const [wordBusy, setWordBusy] = useState(null)
  const [subtitleStyle, setSubtitleStyle] = useState({
    font: 'Inter',
    size: 58,
    color: 'FFFFFF',
    bold: true,
    uppercase: true,
    boxed: false,
    highlightColor: 'E5252A',
    brandTag: '',
  })

  const {
    project,
    setProject,
    subtitles,
    setSubtitles,
    effects,
    setEffects,
    loading,
    saving,
    saveProject,
    saveSubtitles,
    saveEffects,
    transcribe,
    polishSubtitles,
    importScript,
  } = useProject(projectId, toast)

  const timeline = useTimeline({
    duration: project?.duration || 0,
    trimStart: project?.trim_start || 0,
    trimEnd: project?.trim_end || 0,
  })

  const templatesById = useMemo(() => {
    const map = {}
    for (const t of templates) map[t.id] = t
    return map
  }, [templates])

  const selectedTemplate = selectedTemplateId ? templatesById[selectedTemplateId] : null
  const selectedEffect = effects.find((e) => e.id === selectedEffectId) || null

  /* ------------------------------------------------------------- loading -- */
  useEffect(() => {
    templatesApi
      .list()
      .then(setTemplates)
      .catch((err) => toast.error(apiError(err, 'Could not load the template gallery.')))
      .finally(() => setTemplatesLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!projectId) return
    projects.images(projectId).then(setImages).catch(() => {})
  }, [projectId, project?.status])

  // Pick the first template once the gallery arrives.
  useEffect(() => {
    if (!selectedTemplateId && templates.length) setSelectedTemplateId(templates[0].id)
  }, [templates, selectedTemplateId])

  // Auto-transcribe on first load so the subtitle track is never empty.
  useEffect(() => {
    if (!project || project.status === 'transcribing' || project.status === 'ready') return
    if (subtitles.length > 0) return
    transcribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  // Watch for transcription finishing.
  const { data: projectPoll } = usePolling(
    () => projects.get(projectId),
    { interval: 2000, enabled: !!project && project.status === 'transcribing' },
  )

  const subtitlesApiRefresh = useCallback(async () => {
    try {
      const fresh = await subtitlesApi.list(projectId)
      setSubtitles(fresh)
    } catch {
      /* ignore */
    }
  }, [projectId, setSubtitles])

  useEffect(() => {
    if (!projectPoll) return
    if (projectPoll.status === 'ready' && project?.status === 'transcribing') {
      setProject({ ...projectPoll, burn_subtitles: true })
      subtitlesApiRefresh()
      saveProject({ burn_subtitles: true })
      toast.success('✨ Subtitles extracted! Auto-burn enabled (Vone Reel style).')
    } else if (projectPoll.status !== project?.status) {
      setProject(projectPoll)
      if (projectPoll.status === 'ready') {
        subtitlesApiRefresh()
      }
    }
  }, [projectPoll, project?.status, setProject, subtitlesApiRefresh, saveProject, toast])

  /* ---------------------------------------------------------- template ops -- */
  const selectTemplate = useCallback(
    async (template) => {
      setSelectedTemplateId(template.id)
      const existing = effects.find((e) => e.template_id === template.id)
      if (existing) {
        setSelectedEffectId(existing.id)
        setDraftOptions({ ...(existing.options_json || {}) })
        return
      }

      if (template.needs_images && (images?.count || 0) < 3) {
        toast.info(`✨ ${template.name} will auto-capture frame cards from your video (or upload custom covers in Images panel).`)
      }

      // Intelligent placement on timeline:
      // If 1st template: Hook (0.0s to ~30% duration)
      // If 2nd template: Middle Body (from end of 1st effect to ~75% duration)
      // If 3rd template: CTA Outro (from end of last effect to duration)
      const duration = project?.duration || 10.0
      let start = 0.0
      let end = Math.min(DEFAULT_WINDOW, duration)

      if (effects.length === 0) {
        start = 0.0
        end = Math.min(Math.max(3.5, Math.round(duration * 0.30 * 10) / 10), duration)
      } else {
        const lastEnd = Math.max(...effects.map((e) => Number(e.end_time) || 0))
        if (lastEnd < duration - 1.0) {
          start = Math.round(lastEnd * 10) / 10
          const remaining = duration - start
          if (effects.length === 1 && remaining > 6.0) {
            end = Math.round(Math.min(start + remaining * 0.65, duration - 3.0) * 10) / 10
          } else {
            end = Math.round(duration * 10) / 10
          }
        } else {
          start = Math.max(0.0, Math.min(timeline.playhead, duration - 2.0))
          end = Math.min(duration, start + Math.min(DEFAULT_WINDOW, duration - start))
        }
      }

      // Auto-extract speech keyword from subtitles at start position
      const defaults = {}
      for (const opt of template.options_json || []) defaults[opt.key] = opt.default ?? ''
      const spokenWord = extractKeywordAt(subtitles, start, '')
      if (spokenWord) {
        if ('text' in defaults) defaults.text = spokenWord
        if ('word' in defaults) defaults.word = spokenWord
        if ('title' in defaults) defaults.title = spokenWord
        if ('pill' in defaults) defaults.pill = spokenWord
        if ('tag' in defaults) defaults.tag = `REC · ${spokenWord}`
      }
      setDraftOptions(defaults)

      const payload = {
        template_id: template.id,
        start_time: Math.round(start * 10) / 10,
        end_time: Math.round(end * 10) / 10,
        options_json: defaults,
      }
      const optimistic = [...effects, { ...payload, id: `tmp-${Date.now()}`, order_index: effects.length }]
      setEffects(optimistic)
      toast.success(`✨ Added "${template.name}" to reel (${payload.start_time}s – ${payload.end_time}s)`)

      try {
        const saved = await effectsApi.save(
          projectId,
          optimistic.map((e, i) => ({
            ...e,
            id: typeof e.id === 'number' ? e.id : undefined,
            order_index: i,
          })),
        )
        setEffects(saved)
        setSelectedEffectId(saved[saved.length - 1]?.id ?? null)
      } catch (err) {
        toast.error(apiError(err, 'Could not save template effect.'))
      }
    },
    [effects, images?.count, project?.duration, projectId, subtitles, timeline.playhead, toast, setEffects],
  )

  const removeEffectByTemplateId = useCallback(
    async (templateId) => {
      const remaining = effects.filter((e) => e.template_id !== templateId).map((e, i) => ({ ...e, order_index: i }))
      setEffects(remaining)
      if (selectedEffectId && effects.find((e) => e.id === selectedEffectId)?.template_id === templateId) {
        setSelectedEffectId(remaining[0]?.id ?? null)
        setSelectedTemplateId(remaining[0]?.template_id ?? null)
      }
      try {
        await effectsApi.save(
          projectId,
          remaining.map((e, i) => ({
            ...e,
            id: typeof e.id === 'number' ? e.id : undefined,
            order_index: i,
          })),
        )
        toast.info('Removed effect from reel.')
      } catch (err) {
        toast.error(apiError(err, 'Could not update effects.'))
      }
    },
    [effects, projectId, selectedEffectId, setEffects, toast],
  )

  const selectEffect = useCallback(
    (effectId) => {
      const effect = effects.find((e) => e.id === effectId)
      if (!effect) return
      setSelectedEffectId(effectId)
      setSelectedTemplateId(effect.template_id)
      setDraftOptions({ ...(effect.options_json || {}) })
    },
    [effects],
  )

  const updateOptions = useCallback(
    (next) => {
      setDraftOptions(next)
      setEffects((prevEffects) => {
        const targetId =
          selectedEffectId ??
          prevEffects.find((e) => e.template_id === selectedTemplateId)?.id
        if (!targetId) return prevEffects
        return prevEffects.map((e) =>
          e.id === targetId ? { ...e, options_json: next } : e,
        )
      })
    },
    [selectedEffectId, selectedTemplateId, setEffects],
  )

  const addEffect = useCallback(async () => {
    if (!selectedTemplate) return
    if (selectedTemplate.needs_images && (images?.count || 0) < 3) {
      toast.info(`✨ Auto-capturing cards from video for ${selectedTemplate.name}`)
    }
    const length = Math.min(DEFAULT_WINDOW, project?.duration || DEFAULT_WINDOW)
    const start = Math.max(
      0,
      Math.min(timeline.playhead - length / 2, (project?.duration || length) - length),
    )

    const opts = { ...draftOptions }
    const spoken = extractKeywordAt(subtitles, start, '')
    if (spoken) {
      if ('text' in opts && (!opts.text || opts.text === 'CLAUDE' || opts.text === 'EDIT')) {
        opts.text = spoken
      }
      if ('tag' in opts && (!opts.tag || opts.tag.includes('CLAUDE') || opts.tag.includes('COLLAGE'))) {
        opts.tag = `REC · ${spoken}`
      }
    }

    const payload = {
      template_id: selectedTemplate.id,
      start_time: Math.round(start * 10) / 10,
      end_time: Math.round((start + length) * 10) / 10,
      options_json: opts,
    }
    const optimistic = [...effects, { ...payload, id: `tmp-${Date.now()}`, order_index: effects.length }]
    setEffects(optimistic)
    try {
      const saved = await effectsApi.save(
        projectId,
        optimistic.map((e, i) => ({
          ...e,
          id: typeof e.id === 'number' ? e.id : undefined,
          order_index: i,
        })),
      )
      setEffects(saved)
      setSelectedEffectId(saved[saved.length - 1]?.id ?? null)
      toast.success(`${selectedTemplate.name} added to the timeline.`)
    } catch (err) {
      toast.error(apiError(err, 'Could not add that effect.'))
      effectsApi
        .list(projectId)
        .then(setEffects)
        .catch(() => {})
    }
  }, [
    selectedTemplate,
    images,
    project,
    timeline.playhead,
    draftOptions,
    subtitles,
    effects,
    setEffects,
    projectId,
    toast,
  ])

  /* -------------------------------------------------------- AI suggestions -- */
  const aiSuggestions = useMemo(() => {
    const duration = project?.duration || 10.0
    if (!templates.length) return []

    // 1. Hook (0.0s to 3.0s): Backdrop Word (#06) or Red Collage (#24)
    const hookTpl =
      templates.find((t) => t.fx === 'backdrop-word' || t.number === 6) ||
      templates.find((t) => t.fx === 'red-collage' || t.number === 24) ||
      templates[0]

    const hookWord = extractKeywordAt(subtitles, 1.0, 'REEL HOOK')
    const hookLines = extractLinesAt(subtitles, 0.5)

    // 2. Middle Body (3.0s to 6.5s): Glass Widgets (#23) or Split Headline (#25)
    const bodyTpl =
      templates.find((t) => t.fx === 'glass-widgets' || t.number === 23) ||
      templates.find((t) => t.fx === 'split-headline' || t.number === 25) ||
      templates[1]

    const bodyWord = extractKeywordAt(subtitles, Math.min(duration * 0.45, 4.0), 'KEY HIGHLIGHT')

    // 3. Outro CTA: Check Pills (#27) or The Tap (#13) or Spotlight (#07)
    const outroTpl =
      templates.find((t) => t.fx === 'check-pills' || t.number === 27) ||
      templates.find((t) => t.fx === 'tap' || t.number === 13) ||
      templates.find((t) => t.fx === 'spotlight' || t.number === 7) ||
      templates[2]

    const outroWord = extractKeywordAt(subtitles, Math.max(0, duration - 1.5), 'FOLLOW')

    const suggestions = []
    if (hookTpl) {
      const hookEnd = Math.min(Math.max(3.5, Math.round(duration * 0.30 * 10) / 10), 12.0)
      suggestions.push({
        id: 'hook',
        phase: 'Opening Hook',
        timing: `0.0s – ${hookEnd}s`,
        startTime: 0.0,
        endTime: Math.max(1.5, hookEnd),
        templateId: hookTpl.id,
        templateName: hookTpl.name,
        templateNumber: hookTpl.number,
        reason: 'Drop giant 3D hook word behind speaker to stop viewers from scrolling.',
        extractedText: hookWord,
        colorClass: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
        options: {
          text: hookWord,
          word: hookWord,
          color: '#E5252A',
          tag: `REC · ${hookWord}`,
          lines: '',
          bw: false,
        },
      })
    }

    if (bodyTpl && duration > 3.5) {
      const hookEnd = Math.min(Math.max(3.5, Math.round(duration * 0.30 * 10) / 10), 12.0)
      const bodyStart = hookEnd
      const bodyEnd = Math.min(Math.max(bodyStart + 4.0, Math.round(duration * 0.78 * 10) / 10), duration - 3.5)
      if (bodyEnd > bodyStart + 1.0) {
        suggestions.push({
          id: 'body',
          phase: 'Feature / Stat Card',
          timing: `${bodyStart}s – ${bodyEnd}s`,
          startTime: bodyStart,
          endTime: bodyEnd,
          templateId: bodyTpl.id,
          templateName: bodyTpl.name,
          templateNumber: bodyTpl.number,
          reason: 'Floating translucent stats, conversion gauges & profile badge.',
          extractedText: bodyWord,
          colorClass: 'border-cyan-glow/40 bg-cyan-glow/10 text-cyan-glow',
          options: {
            text: bodyWord,
            title: bodyWord,
            sub: 'Key Point',
          },
        })
      }
    }

    if (outroTpl && duration > 5.0) {
      const hookEnd = Math.min(Math.max(3.5, Math.round(duration * 0.30 * 10) / 10), 12.0)
      const bodyEnd = Math.min(Math.max(hookEnd + 4.0, Math.round(duration * 0.78 * 10) / 10), duration - 3.5)
      const outroStart = bodyTpl ? bodyEnd : Math.max(0, Math.round((duration - 3.5) * 10) / 10)
      const outroEnd = Math.round(duration * 10) / 10
      if (outroEnd > outroStart + 1.0) {
        suggestions.push({
          id: 'outro',
          phase: 'Engagement Outro / CTA',
          timing: `${outroStart}s – ${outroEnd}s`,
          startTime: outroStart,
          endTime: outroEnd,
          templateId: outroTpl.id,
          templateName: outroTpl.name,
          templateNumber: outroTpl.number,
          reason: 'Interactive check pills & CTA to boost reel conversion.',
          extractedText: outroWord,
          colorClass: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
          options: {
            text: `${outroWord || 'Highlights'}|Key Points`,
            tag: outroWord ? `${outroWord.toUpperCase()} · VERIFIED` : 'FEATURED SHOWCASE',
            handle: '@creator',
          },
        })
      }
    }

    return suggestions
  }, [project?.duration, templates, subtitles])

  const applySuggestion = useCallback(
    async (sug) => {
      const tpl = templatesById[sug.templateId]
      if (!tpl) return
      const payload = {
        template_id: tpl.id,
        start_time: sug.startTime,
        end_time: sug.endTime,
        options_json: sug.options,
      }
      const existingFiltered = effects.filter(
        (e) => !(e.template_id === tpl.id && Math.abs(e.start_time - sug.startTime) < 0.2),
      )
      const optimistic = [...existingFiltered, { ...payload, id: `tmp-${Date.now()}`, order_index: existingFiltered.length }]
      setEffects(optimistic)
      try {
        const saved = await effectsApi.save(
          projectId,
          optimistic.map((e, i) => ({
            ...e,
            id: typeof e.id === 'number' ? e.id : undefined,
            order_index: i,
          })),
        )
        setEffects(saved)
        setSelectedEffectId(saved[saved.length - 1]?.id ?? null)
        setSelectedTemplateId(tpl.id)
        setDraftOptions(payload.options_json)
        timeline.setPlayhead(sug.startTime)
        toast.success(`Applied ${tpl.name} (${sug.timing}) with extracted text "${sug.extractedText}"!`)
      } catch (err) {
        toast.error(apiError(err, 'Could not apply suggestion.'))
      }
    },
    [templatesById, effects, setEffects, projectId, timeline, toast],
  )

  const applyAllSuggestions = useCallback(async () => {
    if (!aiSuggestions || aiSuggestions.length === 0) return
    const newEffects = aiSuggestions.map((sug, i) => ({
      template_id: sug.templateId,
      start_time: sug.startTime,
      end_time: sug.endTime,
      options_json: sug.options,
      order_index: i,
    }))
    try {
      const saved = await effectsApi.save(projectId, newEffects)
      setEffects(saved)
      if (saved.length > 0) {
        setSelectedEffectId(saved[0].id)
        setSelectedTemplateId(saved[0].template_id)
        setDraftOptions(saved[0].options_json)
      }
      toast.success(`⚡ 1-Click Viral Plan applied! Added ${saved.length} template scenes with spoken text.`)
    } catch (err) {
      toast.error(apiError(err, 'Could not apply suggestions.'))
    }
  }, [aiSuggestions, projectId, setEffects, toast])

  const removeEffect = useCallback(
    async (effectId) => {
      const remaining = effects.filter((e) => e.id !== effectId).map((e, i) => ({ ...e, order_index: i }))
      setEffects(remaining)
      setSelectedEffectId(null)
      try {
        const saved = await effectsApi.save(
          projectId,
          remaining.map((e) => ({
            id: typeof e.id === 'number' ? e.id : undefined,
            template_id: e.template_id,
            start_time: e.start_time,
            end_time: e.end_time,
            options_json: e.options_json,
            order_index: e.order_index,
          })),
        )
        setEffects(saved)
      } catch (err) {
        toast.error(apiError(err, 'Could not remove that effect.'))
      }
    },
    [effects, setEffects, projectId, toast],
  )

  const changeEffectWindow = useCallback(
    (effectId, patch) => {
      setEffects(effects.map((e) => (e.id === effectId ? { ...e, ...patch } : e)))
    },
    [effects, setEffects],
  )

  // Land an effect on a spoken word ("...when I say 'watch'").
  const snapEffectToWord = useCallback(
    async (effect) => {
      const word = window.prompt('Which word should this effect land on?')
      if (!word || !word.trim()) return
      setWordBusy(effect.id)
      try {
        const res = await projects.wordTiming(projectId, word.trim())
        if (!res.found) {
          toast.error(res.message || `“${word}” was not said in this clip.`)
          return
        }
        const length = Math.max(
          0.5,
          effect.end_time - effect.start_time,
        )
        changeEffectWindow(effect.id, {
          start_time: Math.round(res.start * 10) / 10,
          end_time: Math.round((res.start + length) * 10) / 10,
        })
        toast.success(res.message)
      } catch (err) {
        toast.error(apiError(err, 'Could not find that word in the clip.'))
      } finally {
        setWordBusy(null)
      }
    },
    [projectId, changeEffectWindow, toast],
  )

  const persistEffects = useCallback(async () => {
    try {
      let effectsToSave = [...effects]
      const activeEffectId =
        selectedEffectId ??
        effectsToSave.find((e) => e.template_id === selectedTemplateId)?.id
      if (activeEffectId && draftOptions && Object.keys(draftOptions).length > 0) {
        effectsToSave = effectsToSave.map((e) =>
          e.id === activeEffectId
            ? { ...e, options_json: { ...(e.options_json || {}), ...draftOptions } }
            : e,
        )
      }
      const saved = await effectsApi.save(
        projectId,
        effectsToSave.map((e, i) => {
          const s = Number.isFinite(Number(e.start_time)) ? Math.max(0, Number(e.start_time)) : 0.0
          const curEnd = Number.isFinite(Number(e.end_time)) ? Number(e.end_time) : s + 3.0
          return {
            id: typeof e.id === 'number' ? e.id : undefined,
            template_id: parseInt(e.template_id, 10) || 1,
            start_time: Math.round(s * 10) / 10,
            end_time: Math.round(Math.max(s + 0.1, curEnd) * 10) / 10,
            options_json: e.options_json || {},
            order_index: i,
          }
        }),
      )
      setEffects(saved)
      return saved
    } catch (err) {
      toast.error(apiError(err, 'Could not save the effects.'))
      throw err
    }
  }, [effects, selectedEffectId, selectedTemplateId, draftOptions, projectId, setEffects, toast])

  /* ------------------------------------------------------------ subtitles -- */
  const changeSubtitle = useCallback(
    (subtitleId, patch) => {
      setSubtitles(subtitles.map((s) => (s.id === subtitleId ? { ...s, ...patch } : s)))
    },
    [subtitles, setSubtitles],
  )

  const addSubtitle = useCallback(
    (at) => {
      const start = Math.max(0, Math.round((at ?? timeline.playhead) * 10) / 10)
      const next = {
        id: `tmp-${Date.now()}`,
        start_time: start,
        end_time: Math.min(start + 2, project?.duration || start + 2),
        text: 'New subtitle',
        words_json: null,
      }
      setSubtitles([...subtitles, next])
      setSelectedSubtitleId(next.id)
    },
    [timeline.playhead, project, subtitles, setSubtitles],
  )

  const deleteSubtitle = useCallback(
    async (subtitleId) => {
      const target = subtitles.find((s) => s.id === subtitleId)
      const remaining = subtitles.filter((s) => s.id !== subtitleId)
      setSubtitles(remaining)
      setSelectedSubtitleId(null)
      try {
        if (target && typeof target.id === 'number') {
          await subtitlesApi.remove(projectId, target.id)
        }
      } catch (err) {
        toast.error(apiError(err, 'Could not delete that subtitle.'))
      }
    },
    [subtitles, setSubtitles, projectId, toast],
  )

  /* --------------------------------------------------------------- saving -- */
  const handleSave = useCallback(async () => {
    try {
      const trimStart = Number.isFinite(Number(timeline.trim?.start))
        ? Math.max(0, Number(timeline.trim.start))
        : 0.0
      const trimEnd = Number.isFinite(Number(timeline.trim?.end))
        ? Math.max(trimStart + 0.1, Number(timeline.trim.end))
        : project?.duration || 10.0
      await saveProject({
        trim_start: trimStart,
        trim_end: trimEnd,
      })
      await saveSubtitles(
        subtitles.map((s) => {
          const st = Number.isFinite(Number(s.start_time)) ? Math.max(0, Number(s.start_time)) : 0.0
          const et = Number.isFinite(Number(s.end_time))
            ? Math.max(st + 0.1, Number(s.end_time))
            : st + 1.0
          return {
            id: typeof s.id === 'number' ? s.id : undefined,
            start_time: Math.round(st * 1000) / 1000,
            end_time: Math.round(et * 1000) / 1000,
            text: String(s.text || ''),
            words_json: s.words_json || null,
          }
        }),
      )
      await persistEffects()
      toast.success('Saved.')
    } catch {
      /* individual toasts already shown */
    }
  }, [saveProject, saveSubtitles, persistEffects, subtitles, timeline.trim, project, toast])

  /* -------------------------------------------------------------- preview -- */
  const renderStill = useCallback(async () => {
    if (!selectedTemplate) return
    setStillLoading(true)
    setStillError('')
    try {
      const blob = await projects.previewStill(projectId, {
        fx: selectedTemplate.fx,
        time: Math.max(0, Math.min(timeline.playhead, project?.duration || timeline.playhead)),
        options_json: draftOptions,
        start_time: Math.max(0, timeline.playhead - 1.2),
        end_time: Math.min(project?.duration || timeline.playhead + 1.2, timeline.playhead + 1.2),
      })
      setStill((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(blob)
      })
    } catch (err) {
      setStillError(apiError(err, 'Could not render that preview frame.'))
    } finally {
      setStillLoading(false)
    }
  }, [selectedTemplate, draftOptions, timeline.playhead, project, projectId])
  /* --------------------------------------------------------------- render -- */
  const startRender = useCallback(async () => {
    if (!effects.length) {
      toast.error('Add at least one effect before rendering.')
      return
    }
    const missingImages = effects.find((e) => templatesById[e.template_id]?.needs_images)
    if (missingImages && (images?.count || 0) < 3) {
      toast.info('✨ Auto-capturing video frames for image cards...')
    }
    try {
      const trimStart = Number.isFinite(Number(timeline.trim?.start))
        ? Math.max(0, Number(timeline.trim.start))
        : 0.0
      const trimEnd = Number.isFinite(Number(timeline.trim?.end))
        ? Math.max(trimStart + 0.1, Number(timeline.trim.end))
        : project?.duration || 10.0
      const hasSubtitles = subtitles && subtitles.length > 0
      const shouldBurnSubs = hasSubtitles ? (project?.burn_subtitles !== false) : !!project?.burn_subtitles
      await saveProject({
        trim_start: trimStart,
        trim_end: trimEnd,
        burn_subtitles: shouldBurnSubs,
      })
      await saveSubtitles(
        subtitles.map((s) => {
          const st = Number.isFinite(Number(s.start_time)) ? Math.max(0, Number(s.start_time)) : 0.0
          const et = Number.isFinite(Number(s.end_time))
            ? Math.max(st + 0.1, Number(s.end_time))
            : st + 1.0
          return {
            id: typeof s.id === 'number' ? s.id : undefined,
            start_time: Math.round(st * 1000) / 1000,
            end_time: Math.round(et * 1000) / 1000,
            text: String(s.text || ''),
            words_json: s.words_json || null,
          }
        }),
      )
      await persistEffects()
      const created = await renderApi.start(projectId, {
        burn_subtitles: shouldBurnSubs,
        subtitle_font: String(subtitleStyle?.font || 'Inter'),
        subtitle_size: parseInt(subtitleStyle?.size, 10) || 58,
        subtitle_color: String(subtitleStyle?.color || 'FFFFFF'),
        subtitle_bold: subtitleStyle?.bold !== false,
        subtitle_uppercase: subtitleStyle?.uppercase !== false,
        subtitle_boxed: subtitleStyle?.boxed === true,
        subtitle_highlight_color: String(subtitleStyle?.highlightColor || 'E5252A'),
        brand_tag: subtitleStyle?.brandTag ? String(subtitleStyle.brandTag).trim() : '',
      })
      setJob(created)
      setRendering(true)
      toast.info(
        shouldBurnSubs
          ? '🎬 Rendering video with auto-synced viral subtitles & templates!'
          : 'Render started — this can take a few minutes.'
      )
    } catch (err) {
      toast.error(apiError(err, 'Could not start the render.'))
    }
  }, [
    effects,
    images,
    templatesById,
    saveProject,
    saveSubtitles,
    persistEffects,
    subtitles,
    project,
    timeline.trim,
    projectId,
    toast,
    subtitleStyle,
  ])

  // Poll the render job while it runs.
  const { data: jobPoll } = usePolling(
    () => (job ? renderApi.job(job.id) : Promise.resolve(null)),
    {
      interval: 1500,
      enabled: !!job && (job.status === 'queued' || job.status === 'running'),
      stopWhen: (r) => r && (r.status === 'done' || r.status === 'failed'),
    },
  )

  useEffect(() => {
    if (jobPoll) {
      setJob(jobPoll)
      if (jobPoll.status === 'done') {
        setRendering(false)
        toast.success('Render complete!')
        navigate(`/result/${projectId}`, { state: { job: jobPoll } })
      }
      if (jobPoll.status === 'failed') {
        setRendering(false)
        toast.error('The render failed. Check the details below.')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobPoll])

  /* ------------------------------------------------------------ playback -- */
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      if (
        timeline.trim.end &&
        (v.currentTime < timeline.trim.start || v.currentTime >= timeline.trim.end - 0.05)
      ) {
        v.currentTime = timeline.trim.start
        timeline.movePlayhead(timeline.trim.start)
      }
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [timeline])

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (timeline.trim.end && v.currentTime >= timeline.trim.end) {
      v.pause()
      v.currentTime = timeline.trim.start
      setPlaying(false)
      timeline.movePlayhead(timeline.trim.start)
      return
    }
    timeline.movePlayhead(v.currentTime)
  }, [timeline])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
    }
  }, [projectId])

  /* ---------------------------------------------------------- shortcuts -- */
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable
      if (typing) return

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        timeline.movePlayhead(timeline.playhead - (e.shiftKey ? 1 : 0.1))
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        timeline.movePlayhead(timeline.playhead + (e.shiftKey ? 1 : 0.1))
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedSubtitleId) {
          e.preventDefault()
          deleteSubtitle(selectedSubtitleId)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [togglePlay, timeline, selectedSubtitleId, deleteSubtitle])

  // Keep the video in sync with the trim range.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (v.currentTime < timeline.trim.start - 0.05 || v.currentTime > timeline.trim.end + 0.05) {
      if (!playing) v.currentTime = timeline.trim.start
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.trim.start, timeline.trim.end])

  const isVertical = (project?.height || 0) >= (project?.width || 0)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-gradient">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-cyan-glow" />
          <p className="text-sm text-white/50">Loading your project…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-app-gradient">
      {/* top bar */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/[0.08] bg-ink-950/80 px-5 py-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate('/upload')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white border border-white/[0.1] transition-all hover:bg-white/[0.12] hover:scale-105 active:scale-95"
            title="Back to projects"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-white">{project?.original_filename}</p>
            <p className="text-[11px] text-slate-400 font-medium">
              {project?.width}×{project?.height} · {project?.duration?.toFixed(1)}s ·{' '}
              {isVertical ? 'Vertical 9:16' : 'Landscape'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="hidden cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 sm:flex">
            <input
              type="checkbox"
              checked={!!project?.burn_subtitles}
              onChange={(e) => saveProject({ burn_subtitles: e.target.checked })}
              className="h-3.5 w-3.5 accent-cyan-glow"
            />
            Burn Subtitles
          </label>
          <button
            onClick={startRender}
            disabled={rendering || !effects.length}
            className="btn-primary px-5 py-2 text-xs font-bold shadow-glow"
          >
            {rendering ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-950/30 border-t-ink-950" />
                Rendering Reel…
              </>
            ) : (
              <>
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
                Render & Export Reel
              </>
            )}
          </button>
        </div>
      </header>

      {/* workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[248px_minmax(0,1fr)_320px]">
        {/* gallery */}
        <aside className="panel hidden min-h-0 overflow-hidden lg:block border border-white/[0.08]">
          <TemplateGallery
            templates={templates}
            loading={templatesLoading}
            selectedId={selectedTemplateId}
            onSelect={selectTemplate}
            effects={effects}
            onRemoveEffect={removeEffectByTemplateId}
            onApplyViralTrio={applyAllSuggestions}
          />
        </aside>

        {/* center */}
        <main className="scroll-thin min-h-0 overflow-y-auto">
          {project?.status === 'transcribing' && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-cyan-glow/40 bg-cyan-glow/10 px-4 py-2.5 text-xs text-cyan-300 shadow-md">
              <div className="flex items-center gap-2.5 font-medium">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
                <span>⚡ AI is transcribing audio & generating reel captions... Please wait a few seconds.</span>
              </div>
              <span className="text-[10px] text-cyan-200/60 font-mono">Live Processing</span>
            </div>
          )}

          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="panel shrink-0 p-4">
              <VideoPreview
                projectId={projectId}
                videoRef={videoRef}
                playing={playing}
                onTimeUpdate={onTimeUpdate}
                onEnded={() => setPlaying(false)}
                still={still}
                stillLoading={stillLoading}
                stillError={stillError}
                onRefreshStill={renderStill}
                onDismissStill={() => setStill(null)}
                trim={timeline.trim}
                subtitles={subtitles}
                playhead={timeline.playhead}
                subtitleStyle={subtitleStyle}
              />
            </div>

            {/* effect stack */}
            <div className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <h2 className="text-sm font-bold text-white">
                  Effects{' '}
                  <span className="ml-1 rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-white/50">
                    {effects.length}
                  </span>
                </h2>
                <button
                  onClick={addEffect}
                  disabled={!selectedTemplate}
                  className="btn-accent px-3 py-1.5 text-[11px]"
                >
                  + Add to timeline
                </button>
              </div>

              <div className="scroll-thin max-h-[300px] flex-1 overflow-y-auto p-2.5">
                {effects.length === 0 && (
                  <div className="my-2 rounded-xl border border-cyan-glow/40 bg-gradient-to-br from-cyan-glow/10 via-purple-500/10 to-transparent p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-glow/20 text-cyan-300 font-bold">⚡</span>
                      <h3 className="text-sm font-bold text-white">1-Click Viral Reel Plan</h3>
                    </div>
                    <p className="mt-1 text-xs text-white/70">
                      Auto-apply 3 viral templates timed directly to your speech:
                    </p>
                    <div className="my-2.5 flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
                      <span className="rounded-md bg-rose-500/20 px-2 py-0.5 font-medium text-rose-300 border border-rose-500/30">#06 Hook Word</span>
                      <span className="text-white/40">➔</span>
                      <span className="rounded-md bg-blue-500/20 px-2 py-0.5 font-medium text-blue-300 border border-blue-500/30">#23 Glass Stats</span>
                      <span className="text-white/40">➔</span>
                      <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-medium text-emerald-300 border border-emerald-500/30">#27 Check Pills</span>
                    </div>
                    <button
                      onClick={applyAllSuggestions}
                      className="btn-accent mt-1 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-lg shadow-cyan-glow/20 transition hover:scale-[1.02]"
                    >
                      <span>⚡</span>
                      <span>Apply 1-Click Viral Plan</span>
                    </button>
                    <p className="mt-2 text-[10px] text-white/40">
                      Or pick any individual template on the left and click "+ Add to timeline".
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {effects.map((effect, index) => {
                    const tpl = templatesById[effect.template_id]
                    const isSel = effect.id === selectedEffectId
                    return (
                      <div
                        key={effect.id}
                        onClick={() => selectEffect(effect.id)}
                        className={`group flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                          isSel
                            ? 'border-cyan-glow/70 bg-cyan-glow/10'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-[10px] font-black text-cyan-glow">
                          {tpl ? String(tpl.number).padStart(2, '0') : '—'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-white">
                            {tpl?.name || 'Effect'}
                          </p>
                          <p className="truncate text-[10px] text-white/40">
                            {effect.start_time.toFixed(1)}s → {effect.end_time.toFixed(1)}s
                            {tpl?.needs_images && (
                              <span className="ml-1.5 text-cyan-300">auto-cards from video</span>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            snapEffectToWord(effect)
                          }}
                          disabled={wordBusy === effect.id}
                          className="shrink-0 rounded-lg p-1.5 text-white/25 transition hover:bg-cyan-glow/15 hover:text-cyan-glow disabled:opacity-40"
                          title="Land this effect on a word you say in the clip"
                        >
                          {wordBusy === effect.id ? (
                            <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-cyan-glow" />
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="7" />
                              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
                              <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeEffect(effect.id)
                          }}
                          className="shrink-0 rounded-lg p-1.5 text-white/25 transition hover:bg-rose-500/20 hover:text-rose-300"
                          title="Remove effect"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {job && (
            <div className="mt-3">
              <RenderProgress job={job} />
            </div>
          )}
        </main>

        {/* options */}
        <aside className="panel scroll-thin hidden min-h-0 overflow-y-auto lg:block">
          <OptionsForm
            template={selectedTemplate}
            values={draftOptions}
            onChange={updateOptions}
            images={{ ...images, projectId }}
            onImagesChanged={() => projects.images(projectId).then(setImages).catch(() => {})}
            selectedEffect={effects.find((e) => e.id === selectedEffectId)}
            onTimingChange={(patch) => selectedEffectId && changeEffectWindow(selectedEffectId, patch)}
            timelineDuration={timeline.duration}
            subtitles={subtitles}
            playhead={timeline.playhead}
          />
          <div className="border-t border-white/10 px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-white/70">
              <input
                type="checkbox"
                checked={!!project?.burn_subtitles}
                onChange={(e) => saveProject({ burn_subtitles: e.target.checked })}
                className="h-3.5 w-3.5 accent-cyan-glow"
              />
              Burn subtitles into the final video
            </label>
            <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
              The effect engine adds visuals only. Subtitles are burned afterwards with ffmpeg,
              bottom-centre above the safe margin.
            </p>
          </div>
        </aside>
      </div>

      {/* bottom timeline */}
      <div className="shrink-0 px-3 pb-3">
        <Timeline
          project={project}
          templates={templates}
          effects={effects}
          subtitles={subtitles}
          timeline={timeline}
          playing={playing}
          onTogglePlay={togglePlay}
          onTrimChange={(s, e) => timeline.setTrimRange(s, e)}
          onSave={handleSave}
          saving={saving}
          onEffectChange={changeEffectWindow}
          onEffectSelect={selectEffect}
          selectedEffectId={selectedEffectId}
          onSubtitleChange={changeSubtitle}
          onSubtitleSelect={setSelectedSubtitleId}
          selectedSubtitleId={selectedSubtitleId}
          onSubtitleDelete={deleteSubtitle}
          onSubtitleEdit={(s) => {
            const text = window.prompt('Edit subtitle text', s.text)
            if (text !== null) changeSubtitle(s.id, { text })
          }}
          onSubtitleAdd={addSubtitle}
          subtitleLoading={project?.status === 'transcribing'}
          transcribing={project?.status === 'transcribing'}
          onTranscribe={transcribe}
          onSubtitlePolish={polishSubtitles}
          onSubtitleImport={importScript}
          onPreviewFrame={renderStill}
          previewLoading={stillLoading}
          subtitleStyle={subtitleStyle}
          onStyleChange={setSubtitleStyle}
        />
      </div>
    </div>
  )
}
