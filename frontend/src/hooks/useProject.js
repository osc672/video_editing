import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiError, effects as effectsApi, projects, subtitles } from '../api/client'

/**
 * Loads a project and keeps its subtitles and effect list in sync with the
 * backend. All mutations go through this hook so the UI never drifts.
 */
export function useProject(projectId, toast) {
  const [project, setProject] = useState(null)
  const [subtitlesList, setSubtitlesList] = useState([])
  const [effectsList, setEffectsList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [p, subs, fx] = await Promise.all([
        projects.get(projectId),
        subtitles.list(projectId),
        effectsApi.list(projectId),
      ])
      setProject(p)
      setSubtitlesList(subs)
      setEffectsList(fx)
      setError(null)
    } catch (err) {
      setError(err)
      console.error('[useProject] failed to load project', err)
      toast?.error(apiError(err, 'Could not load this project.'))
    } finally {
      setLoading(false)
    }
  }, [projectId, toast])

  useEffect(() => {
    load()
  }, [load])

  const saveProject = useCallback(
    async (patch) => {
      setSaving(true)
      try {
        const updated = await projects.patch(projectId, patch)
        setProject(updated)
        return updated
      } catch (err) {
        toast?.error(apiError(err, 'Could not save your changes.'))
        throw err
      } finally {
        setSaving(false)
      }
    },
    [projectId, toast],
  )

  const saveSubtitles = useCallback(
    async (list) => {
      setSaving(true)
      try {
        const saved = await subtitles.save(projectId, list)
        setSubtitlesList(saved)
        return saved
      } catch (err) {
        toast?.error(apiError(err, 'Could not save the subtitles.'))
        throw err
      } finally {
        setSaving(false)
      }
    },
    [projectId, toast],
  )

  const saveEffects = useCallback(
    async (list) => {
      setSaving(true)
      try {
        const saved = await effectsApi.save(projectId, list)
        setEffectsList(saved)
        return saved
      } catch (err) {
        toast?.error(apiError(err, 'Could not save the effects.'))
        throw err
      } finally {
        setSaving(false)
      }
    },
    [projectId, toast],
  )

  const transcribe = useCallback(
    async (options) => {
      try {
        setProject((prev) => (prev ? { ...prev, status: 'transcribing' } : prev))
        await subtitles.transcribe(projectId, options)
        toast?.info('Transcribing your clip… this can take a minute.')
      } catch (err) {
        setProject((prev) => (prev ? { ...prev, status: 'uploaded' } : prev))
        toast?.error(apiError(err, 'Transcription could not start.'))
      }
    },
    [projectId, toast],
  )

  const polishSubtitles = useCallback(
    async (payload) => {
      setSaving(true)
      try {
        const polished = await subtitles.polish(projectId, payload)
        setSubtitlesList(polished)
        toast?.success('Subtitles polished into clean reel copy!')
        return polished
      } catch (err) {
        toast?.error(apiError(err, 'Could not polish subtitles.'))
        throw err
      } finally {
        setSaving(false)
      }
    },
    [projectId, toast],
  )

  const importScript = useCallback(
    async (scriptText) => {
      setSaving(true)
      try {
        const imported = await subtitles.importScript(projectId, scriptText)
        setSubtitlesList(imported)
        toast?.success('Script imported and synced to timeline!')
        return imported
      } catch (err) {
        toast?.error(apiError(err, 'Failed to import script.'))
        throw err
      } finally {
        setSaving(false)
      }
    },
    [projectId, toast],
  )

  const imageCount = useMemo(() => project?.image_count ?? 0, [project])

  return {
    project,
    setProject,
    subtitles: subtitlesList,
    setSubtitles: setSubtitlesList,
    effects: effectsList,
    setEffects: setEffectsList,
    loading,
    error,
    saving,
    imageCount,
    reload: load,
    saveProject,
    saveSubtitles,
    saveEffects,
    transcribe,
    polishSubtitles,
    importScript,
  }
}
