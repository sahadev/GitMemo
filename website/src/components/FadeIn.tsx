import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
}

interface Props {
  children: ReactNode
  className?: string
  delay?: number
}

export default function FadeIn({ children, className, delay = 0 }: Props) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
