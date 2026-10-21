import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
const snapshot = () => typeof window !== 'undefined' && window.matchMedia(query).matches
function subscribe(change: () => void) {
  const media = window.matchMedia(query)
  media.addEventListener('change', change)
  return () => media.removeEventListener('change', change)
}

/** Reacts to preference changes while the page is open, as well as initial preference. */
export function useMotionPreference() {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
