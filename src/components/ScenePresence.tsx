import type { ReactNode } from 'react'
import { motion, useIsPresent } from 'motion/react'
import { useMotionPreference } from '../motion/useMotionPreference'
import { MOTION } from '../motion/design'

export function ScenePresence({ children, className, delay = 0, as = 'div' }: { children: ReactNode; className: string; delay?: number; as?: 'div' | 'aside' | 'section' }) {
  const present = useIsPresent()
  const reduced = useMotionPreference()
  const Element = as === 'aside' ? motion.aside : as === 'section' ? motion.section : motion.div
  return <Element className={className} data-scene-ui inert={!present} aria-hidden={!present}
    style={present ? undefined : { position: 'absolute', pointerEvents: 'none' }}
    initial={reduced ? false : { opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: reduced ? 0 : -6, transition: { duration: reduced ? 0 : MOTION.ui.exit, delay: 0 } }}
    transition={{ duration: reduced ? 0 : MOTION.ui.enter, ease: MOTION.ease, delay: reduced ? 0 : delay }}>
    {children}
  </Element>
}
