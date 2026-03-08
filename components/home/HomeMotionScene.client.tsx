'use client'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

gsap.registerPlugin(ScrollTrigger)

export default function HomeMotionScene() {
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = usePrefersReducedMotion()

  useEffect(() => {
    const scene = sceneRef.current
    const scope = scene?.parentElement
    if (!scene || !scope) return

    const mm = gsap.matchMedia()
    const ctx = gsap.context(() => {
      const ambientNodes = gsap.utils.toArray<HTMLElement>('[data-home-ambient-node]')
      const heroAccentNodes = gsap.utils.toArray<HTMLElement>('[data-home-hero-accent]')
      const revealNodes = gsap.utils.toArray<HTMLElement>('[data-home-reveal]')
      const heroSection = document.querySelector<HTMLElement>('[data-home-reveal="hero"]')
      const heroCopy = document.querySelector<HTMLElement>('[data-home-hero-copy="true"]')
      const heroActions = document.querySelector<HTMLElement>('[data-home-hero-actions="true"]')
      const statNodes = gsap.utils.toArray<HTMLElement>('[data-home-reveal="stat"]')
      const scrollSections = revealNodes.filter(
        (node) => node.dataset.homeReveal && node.dataset.homeReveal !== 'hero' && node.dataset.homeReveal !== 'stat',
      )

      if (reduceMotion) {
        gsap.set([...ambientNodes, ...heroAccentNodes, ...revealNodes], {
          clearProps: 'opacity,visibility,transform',
        })
        return
      }

      const introTimeline = gsap.timeline({
        defaults: { duration: 0.9, ease: 'power3.out' },
        smoothChildTiming: true,
      })
      const introLeadNodes = [heroCopy, heroActions].filter(Boolean)

      introTimeline
        .addLabel('intro')
        .from(introLeadNodes, { autoAlpha: 0, y: 22, stagger: 0.08 }, 'intro')
        .from(heroSection, { autoAlpha: 0, y: 26, scale: 0.985 }, 'intro')
        .from(
          statNodes,
          {
            autoAlpha: 0,
            y: 20,
            scale: 0.98,
            stagger: 0.08,
            clearProps: 'opacity,visibility,transform',
          },
          'intro+=0.22',
        )
        .from(
          heroAccentNodes,
          {
            autoAlpha: 0,
            scale: 0.88,
            y: 12,
            stagger: 0.08,
            clearProps: 'opacity,visibility,transform',
          },
          'intro+=0.12',
        )

      scrollSections.forEach((node, index) => {
        const sectionTimeline = gsap.timeline({
          paused: true,
          defaults: { duration: 0.85, ease: 'power3.out' },
        })

        sectionTimeline
          .addLabel('enter')
          .from(node, {
            autoAlpha: 0,
            y: 42,
            scale: 0.985,
            clearProps: 'opacity,visibility,transform',
          }, 'enter')
          .from(
            node.querySelectorAll(':scope > *'),
            {
              autoAlpha: 0,
              y: 18,
              stagger: 0.06,
              duration: 0.7,
              clearProps: 'opacity,visibility,transform',
            },
            'enter+=0.08',
          )

        ScrollTrigger.create({
          id: `home-section-${index}`,
          trigger: node,
          start: 'top 78%',
          once: true,
          onEnter: () => sectionTimeline.play(),
        })
      })

      ambientNodes.forEach((node, index) => {
        gsap.to(node, {
          xPercent: index % 2 === 0 ? 8 : -10,
          yPercent: index === 1 ? 10 : -8,
          scale: 1.06 + index * 0.03,
          rotate: index % 2 === 0 ? 8 : -8,
          duration: 14 + index * 3,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
      })

      mm.add(
        {
          isDesktop: '(min-width: 1024px)',
          isCompact: '(max-width: 1023px)',
        },
        (context) => {
          const { isDesktop } = context.conditions as { isDesktop?: boolean }

          heroAccentNodes.forEach((node, index) => {
            gsap.to(node, {
              x: index % 2 === 0 ? (isDesktop ? 8 : 4) : isDesktop ? -8 : -4,
              y: index % 3 === 0 ? (isDesktop ? -9 : -5) : isDesktop ? 9 : 5,
              duration: 2.4 + index * 0.22,
              ease: 'sine.inOut',
              repeat: -1,
              yoyo: true,
            })
          })

          if (!heroSection || heroAccentNodes.length === 0) return

          const quickSetters = heroAccentNodes.map((node, index) => ({
            xTo: gsap.quickTo(node, 'x', { duration: 0.45, ease: 'power3.out' }),
            yTo: gsap.quickTo(node, 'y', { duration: 0.45, ease: 'power3.out' }),
            depth: (isDesktop ? 16 : 8) + index * (isDesktop ? 3 : 2),
          }))

          const handlePointerMove = (event: PointerEvent) => {
            const bounds = heroSection.getBoundingClientRect()
            const offsetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
            const offsetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
            quickSetters.forEach(({ xTo, yTo, depth }, index) => {
              const direction = index % 2 === 0 ? 1 : -1
              xTo(offsetX * depth * direction)
              yTo(offsetY * (depth * 0.65))
            })
          }

          const handlePointerLeave = () => {
            quickSetters.forEach(({ xTo, yTo }) => {
              xTo(0)
              yTo(0)
            })
          }

          heroSection.addEventListener('pointermove', handlePointerMove)
          heroSection.addEventListener('pointerleave', handlePointerLeave)

          return () => {
            heroSection.removeEventListener('pointermove', handlePointerMove)
            heroSection.removeEventListener('pointerleave', handlePointerLeave)
          }
        },
      )

      ScrollTrigger.refresh()
    }, scope)

    return () => {
      mm.revert()
      ctx.revert()
    }
  }, [reduceMotion])

  return (
    <div
      ref={sceneRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div
        data-home-ambient-node
        className="absolute -left-24 top-20 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(210,167,98,0.16),rgba(210,167,98,0)_68%)] blur-3xl"
      />
      <div
        data-home-ambient-node
        className="absolute right-[-8rem] top-[16rem] h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(78,120,160,0.14),rgba(78,120,160,0)_68%)] blur-3xl"
      />
      <div
        data-home-ambient-node
        className="absolute bottom-32 left-[12%] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(92,152,124,0.12),rgba(92,152,124,0)_70%)] blur-3xl"
      />
      <div
        data-home-ambient-node
        className="absolute inset-x-[18%] top-[28rem] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
    </div>
  )
}
