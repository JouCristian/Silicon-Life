import { useEffect } from 'react'
import { useLabStore } from '../stores/useLabStore'
import { MOTION } from './design'
import { presentationClock, timelineFor } from './timeline'
import { transferSteps } from './transferPlayback'

export function usePlaybackDriver(reduced: boolean) {
  useEffect(() => {
    let frame = 0, previous = 0
    const update = (now: number) => {
      const dt = previous && !document.hidden ? (now - previous) / 1000 : 0
      previous = now
      const s = useLabStore.getState()
      if (s.fastRunning && !document.hidden) s.fastBatch()
      const timeline = timelineFor(s.history[s.traceIndex], s.phase)
      const duration = s.transferPlayback.mode === 'transfer' ? transferSteps(s.history[s.traceIndex])[s.transferPlayback.index]?.end ?? timeline.duration : timeline.duration
      const rate = s.playbackRate * (reduced ? duration / MOTION.flow.reduced : 1)
      if (presentationClock.update(s.playbackEpoch, s.inspection, s.playing, dt, duration, rate)) s.tick()
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    const resetTime = () => { previous = 0 }
    document.addEventListener('visibilitychange', resetTime)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', resetTime) }
  }, [reduced])
}
