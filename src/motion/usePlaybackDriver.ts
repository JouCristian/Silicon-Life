import { useEffect } from 'react'
import { useLabStore } from '../stores/useLabStore'
import { MOTION } from './design'
import { presentationClock, timelineFor } from './timeline'

export function usePlaybackDriver(reduced: boolean) {
  useEffect(() => {
    let frame = 0, previous = 0
    const update = (now: number) => {
      const dt = previous && !document.hidden ? (now - previous) / 1000 : 0
      previous = now
      const s = useLabStore.getState()
      const timeline = timelineFor(s.history[s.traceIndex], s.phase)
      const duration = reduced ? MOTION.flow.reduced : timeline.duration
      if (presentationClock.update(s.playbackEpoch, s.inspection, s.playing, dt, duration)) s.tick()
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    const resetTime = () => { previous = 0 }
    document.addEventListener('visibilitychange', resetTime)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', resetTime) }
  }, [reduced])
}
