'use client'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

gsap.registerPlugin(ScrollTrigger)

const ROUTE_STOP_IDS = ['overview', 'region', 'wallet', 'xrpl', 'trade-desk', 'share', 'footer'] as const

function buildRoutePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const midY = (previous.y + current.y) / 2
    path += ` C ${previous.x} ${midY} ${current.x} ${midY} ${current.x} ${current.y}`
  }

  return path
}

function setDrawState(path: SVGPathElement | null) {
  if (!path) return 0
  const length = path.getTotalLength()
  gsap.set(path, {
    strokeDasharray: length,
    strokeDashoffset: length,
  })
  return length
}

export default function HomeMotionScene() {
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const pageRouteSvgRef = useRef<SVGSVGElement | null>(null)
  const pageRouteGlowRef = useRef<SVGPathElement | null>(null)
  const pageRoutePathRef = useRef<SVGPathElement | null>(null)
  const pageRouteDashRef = useRef<SVGPathElement | null>(null)
  const pageRouteNodeRefs = useRef<Array<HTMLDivElement | null>>([])
  const reduceMotion = usePrefersReducedMotion()

  useEffect(() => {
    const scene = sceneRef.current
    const scope = scene?.parentElement
    if (!scene || !scope) return

    const mm = gsap.matchMedia()
    let cleanupRouteLayout = () => {}
    const ctx = gsap.context(() => {
      const ambientNodes = gsap.utils.toArray<HTMLElement>('[data-home-ambient-node]')
      const heroAccentNodes = gsap.utils.toArray<HTMLElement>('[data-home-hero-accent]')
      const revealNodes = gsap.utils.toArray<HTMLElement>('[data-home-reveal]')
      const heroSection = document.querySelector<HTMLElement>('[data-home-reveal="hero"]')
      const heroCopy = document.querySelector<HTMLElement>('[data-home-hero-copy="true"]')
      const heroActions = document.querySelector<HTMLElement>('[data-home-hero-actions="true"]')
      const heroStage = document.querySelector<HTMLElement>('[data-home-hero-stage="true"]')
      const heroCore = document.querySelector<HTMLElement>('[data-home-hero-core="true"]')
      const heroGrid = document.querySelector<HTMLElement>('[data-home-hero-grid="true"]')
      const heroScan = document.querySelector<HTMLElement>('[data-home-hero-scan="true"]')
      const heroRoutePath = document.querySelector<SVGPathElement>('[data-home-hero-route-path]')
      const heroRouteGlow = document.querySelector<SVGPathElement>('[data-home-hero-route-glow]')
      const heroMarkers = gsap.utils.toArray<SVGGElement>('[data-home-hero-marker]')
      const heroBadges = gsap.utils.toArray<HTMLElement>('[data-home-hero-badge]')
      const pageRouteLayer = document.querySelector<HTMLElement>('[data-home-page-route-layer]')
      const pageVeil = document.querySelector<HTMLElement>('[data-home-page-veil]')
      const pageRosettes = gsap.utils.toArray<HTMLElement>('[data-home-page-rosette]')
      const pageNodeHalos = gsap.utils.toArray<HTMLElement>('[data-home-page-node-halo]')
      const statNodes = gsap.utils.toArray<HTMLElement>('[data-home-reveal="stat"]')
      const scrollSections = revealNodes.filter(
        (node) => node.dataset.homeReveal && node.dataset.homeReveal !== 'hero' && node.dataset.homeReveal !== 'stat',
      )
      const routeNodes = pageRouteNodeRefs.current.filter(Boolean) as HTMLDivElement[]

      let pageRouteDrawTween: gsap.core.Tween | null = null
      let resizeFrame = 0

      const layoutPageRoute = () => {
        if (!pageRouteSvgRef.current || !pageRoutePathRef.current || !pageRouteGlowRef.current || !pageRouteDashRef.current) {
          return
        }

        const scopeRect = scope.getBoundingClientRect()
        const width = scope.clientWidth
        const height = scope.scrollHeight

        const laneMap: Record<(typeof ROUTE_STOP_IDS)[number], number> = {
          overview: 0.28,
          region: 0.76,
          wallet: 0.32,
          xrpl: 0.7,
          'trade-desk': 0.36,
          share: 0.68,
          footer: 0.5,
        }

        const points = ROUTE_STOP_IDS.map((id) => {
          const anchor = scope.querySelector<HTMLElement>(`[data-home-route-stop="${id}"]`)
          if (!anchor) return null

          const anchorRect = anchor.getBoundingClientRect()
          return {
            id,
            x: width * laneMap[id],
            y: anchorRect.top - scopeRect.top + Math.min(anchorRect.height * 0.38, 180),
          }
        }).filter(Boolean) as Array<{ id: (typeof ROUTE_STOP_IDS)[number]; x: number; y: number }>

        pageRouteSvgRef.current.setAttribute('viewBox', `0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`)

        const mainPath = buildRoutePath(points)
        const dashPath = buildRoutePath(
          points.map((point, index) => ({
            x: point.x + (index % 2 === 0 ? 12 : -12),
            y: point.y + (index % 2 === 0 ? -8 : 8),
          })),
        )

        pageRouteGlowRef.current.setAttribute('d', mainPath)
        pageRoutePathRef.current.setAttribute('d', mainPath)
        pageRouteDashRef.current.setAttribute('d', dashPath)

        routeNodes.forEach((node, index) => {
          const point = points[index]
          if (!point) {
            gsap.set(node, { autoAlpha: 0 })
            return
          }

          gsap.set(node, {
            x: point.x,
            y: point.y,
            xPercent: -50,
            yPercent: -50,
          })
        })

        pageRouteDrawTween?.scrollTrigger?.kill()
        pageRouteDrawTween?.kill()

        setDrawState(pageRouteGlowRef.current)
        setDrawState(pageRoutePathRef.current)

        pageRouteDrawTween = gsap.to([pageRouteGlowRef.current, pageRoutePathRef.current], {
          strokeDashoffset: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: scope,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.9,
          },
        })
      }

      const handleResize = () => {
        cancelAnimationFrame(resizeFrame)
        resizeFrame = window.requestAnimationFrame(() => {
          layoutPageRoute()
        })
      }

      if (reduceMotion) {
        const motionNodes = [
          ...ambientNodes,
          ...heroAccentNodes,
          ...revealNodes,
          ...heroMarkers,
          ...heroBadges,
          ...pageRosettes,
          ...routeNodes,
          ...pageNodeHalos,
          heroStage,
          heroCore,
          heroGrid,
          heroScan,
          pageRouteLayer,
          pageVeil,
        ].filter(Boolean)

        gsap.set(motionNodes, {
          clearProps: 'opacity,visibility,transform',
        })
        gsap.set([heroRoutePath, heroRouteGlow, pageRoutePathRef.current, pageRouteGlowRef.current], {
          strokeDasharray: 'none',
          strokeDashoffset: 0,
        })
        gsap.set(pageRouteDashRef.current, { clearProps: 'opacity,visibility,transform' })
        layoutPageRoute()
        return () => {
          cancelAnimationFrame(resizeFrame)
        }
      }

      layoutPageRoute()
      window.addEventListener('resize', handleResize)

      if (heroStage) {
        gsap.set(heroStage, {
          transformPerspective: 1400,
          transformOrigin: '50% 50%',
        })
      }
      if (heroCore) {
        gsap.set(heroCore, { transformOrigin: '50% 50%' })
      }

      setDrawState(heroRouteGlow)
      setDrawState(heroRoutePath)

      gsap.set(routeNodes, {
        autoAlpha: 0.22,
        scale: 0.8,
      })
      gsap.set(pageNodeHalos, {
        scale: 0.92,
        opacity: 0.42,
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

      if (pageVeil) {
        gsap.to(pageVeil, {
          backgroundPosition: '140px 180px',
          duration: 28,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
      }

      pageRosettes.forEach((node, index) => {
        gsap.to(node, {
          rotate: index % 2 === 0 ? 360 : -360,
          duration: 24 + index * 7,
          ease: 'none',
          repeat: -1,
        })
        gsap.to(node, {
          y: index % 2 === 0 ? -12 : 12,
          duration: 6.4 + index,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
      })

      pageNodeHalos.forEach((node, index) => {
        gsap.to(node, {
          scale: 1.22,
          opacity: 0.2,
          duration: 2 + index * 0.16,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
      })

      if (pageRouteDashRef.current) {
        gsap.to(pageRouteDashRef.current, {
          strokeDashoffset: -120,
          duration: 8,
          ease: 'none',
          repeat: -1,
        })
      }

      const introTimeline = gsap.timeline({
        defaults: { duration: 0.95, ease: 'power3.out' },
        smoothChildTiming: true,
      })

      introTimeline.addLabel('intro')

      if (pageRouteLayer) {
        introTimeline.from(pageRouteLayer, { autoAlpha: 0, duration: 1.1 }, 'intro')
      }
      if (pageVeil) {
        introTimeline.from(pageVeil, { autoAlpha: 0, scale: 1.04, duration: 1.25 }, 'intro')
      }
      if (heroSection) {
        introTimeline.from(heroSection, { autoAlpha: 0, y: 32, scale: 0.986, duration: 1.12 }, 'intro')
      }
      if (heroCopy) {
        introTimeline.from(heroCopy, { autoAlpha: 0, x: -24, y: 18, duration: 1.05 }, 'intro+=0.08')
      }
      if (heroActions) {
        introTimeline.from(heroActions, { autoAlpha: 0, y: 18, duration: 0.82 }, 'intro+=0.42')
      }
      if (heroStage) {
        introTimeline.from(
          heroStage,
          {
            autoAlpha: 0,
            y: 42,
            rotateY: -10,
            rotateX: 10,
            scale: 0.94,
            duration: 1.18,
            ease: 'power4.out',
          },
          'intro+=0.12',
        )
      }
      if (heroCore) {
        introTimeline.from(
          heroCore,
          { autoAlpha: 0, scale: 0.9, duration: 1.02, ease: 'power4.out' },
          'intro+=0.26',
        )
      }
      if (heroGrid) {
        introTimeline.from(heroGrid, { autoAlpha: 0, scale: 1.05, duration: 1.08 }, 'intro+=0.22')
      }
      if (heroScan) {
        introTimeline.from(heroScan, { autoAlpha: 0, xPercent: -6, duration: 1.05 }, 'intro+=0.26')
      }
      if (heroRouteGlow && heroRoutePath) {
        introTimeline.to([heroRouteGlow, heroRoutePath], { strokeDashoffset: 0, duration: 1.12 }, 'intro+=0.36')
      }
      if (heroMarkers.length > 0) {
        introTimeline.from(
          heroMarkers,
          {
            autoAlpha: 0,
            scale: 0,
            transformOrigin: '50% 50%',
            stagger: 0.08,
            duration: 0.5,
            ease: 'back.out(1.8)',
          },
          'intro+=0.72',
        )
      }
      if (heroBadges.length > 0) {
        introTimeline.from(
          heroBadges,
          {
            autoAlpha: 0,
            x: (index: number) => (index % 2 === 0 ? -16 : 16),
            y: 14,
            stagger: 0.05,
            duration: 0.7,
          },
          'intro+=0.54',
        )
      }
      if (statNodes.length > 0) {
        introTimeline.from(
          statNodes,
          {
            autoAlpha: 0,
            y: 20,
            scale: 0.98,
            stagger: 0.08,
            duration: 0.82,
            clearProps: 'opacity,visibility,transform',
          },
          'intro+=0.62',
        )
      }
      if (heroAccentNodes.length > 0) {
        introTimeline.from(
          heroAccentNodes,
          {
            autoAlpha: 0,
            scale: 0.88,
            y: 12,
            stagger: 0.08,
            duration: 0.9,
            clearProps: 'opacity,visibility,transform',
          },
          'intro+=0.28',
        )
      }
      if (routeNodes[0]) {
        introTimeline.to(
          routeNodes[0],
          {
            autoAlpha: 1,
            scale: 1.02,
            duration: 0.7,
            ease: 'power3.out',
          },
          'intro+=0.84',
        )
      }

      scrollSections.forEach((node, index) => {
        const sectionTimeline = gsap.timeline({
          paused: true,
          defaults: { duration: 0.85, ease: 'power3.out' },
        })

        const sectionId = node.dataset.homeReveal as (typeof ROUTE_STOP_IDS)[number] | undefined
        const routeNode = sectionId ? routeNodes[ROUTE_STOP_IDS.indexOf(sectionId)] : null

        sectionTimeline
          .addLabel('enter')
          .from(
            node,
            {
              autoAlpha: 0,
              y: 42,
              scale: 0.985,
              clearProps: 'opacity,visibility,transform',
            },
            'enter',
          )
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

        if (routeNode) {
          sectionTimeline.to(
            routeNode,
            {
              autoAlpha: 0.96,
              scale: 1,
              duration: 0.65,
              ease: 'power3.out',
            },
            'enter+=0.06',
          )
        }

        ScrollTrigger.create({
          id: `home-section-${index}`,
          trigger: node,
          start: 'top 78%',
          once: true,
          onEnter: () => sectionTimeline.play(),
        })
      })

      mm.add(
        {
          isDesktop: '(min-width: 1024px)',
          isCompact: '(max-width: 1023px)',
        },
        (context) => {
          const { isDesktop } = context.conditions as { isDesktop?: boolean }
          const localTweens: gsap.core.Tween[] = []

          heroAccentNodes.forEach((node, index) => {
            localTweens.push(
              gsap.to(node, {
                x: index % 2 === 0 ? (isDesktop ? 8 : 4) : isDesktop ? -8 : -4,
                y: index % 3 === 0 ? (isDesktop ? -9 : -5) : isDesktop ? 9 : 5,
                duration: 2.4 + index * 0.22,
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true,
              }),
            )
          })

          heroBadges.forEach((node, index) => {
            localTweens.push(
              gsap.to(node, {
                x: index % 2 === 0 ? 6 : -6,
                y: index % 2 === 0 ? -8 : 8,
                duration: 4.8 + index * 0.24,
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true,
              }),
            )
          })

          heroMarkers.forEach((node, index) => {
            localTweens.push(
              gsap.to(node, {
                scale: 1.08 + index * 0.01,
                duration: 2.2 + index * 0.16,
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true,
                transformOrigin: '50% 50%',
              }),
            )
          })

          if (!heroSection) {
            return () => {
              localTweens.forEach((tween) => tween.kill())
            }
          }

          const stageXTo = heroStage
            ? gsap.quickTo(heroStage, 'x', { duration: 0.55, ease: 'power3.out' })
            : null
          const stageYTo = heroStage
            ? gsap.quickTo(heroStage, 'y', { duration: 0.55, ease: 'power3.out' })
            : null
          const stageRotateXTo = heroStage
            ? gsap.quickTo(heroStage, 'rotationX', { duration: 0.7, ease: 'power3.out' })
            : null
          const stageRotateYTo = heroStage
            ? gsap.quickTo(heroStage, 'rotationY', { duration: 0.7, ease: 'power3.out' })
            : null
          const coreXTo = heroCore
            ? gsap.quickTo(heroCore, 'x', { duration: 0.6, ease: 'power3.out' })
            : null
          const coreYTo = heroCore
            ? gsap.quickTo(heroCore, 'y', { duration: 0.6, ease: 'power3.out' })
            : null

          const interactiveNodes = [...heroAccentNodes, ...heroBadges].map((node, index) => ({
            xTo: gsap.quickTo(node, 'x', { duration: 0.45, ease: 'power3.out' }),
            yTo: gsap.quickTo(node, 'y', { duration: 0.45, ease: 'power3.out' }),
            depth: (isDesktop ? 14 : 8) + index * (isDesktop ? 2 : 1.6),
          }))

          const handlePointerMove = (event: PointerEvent) => {
            const bounds = heroSection.getBoundingClientRect()
            const offsetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
            const offsetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2

            stageXTo?.(offsetX * (isDesktop ? 10 : 5))
            stageYTo?.(offsetY * (isDesktop ? 8 : 4))
            stageRotateXTo?.(-offsetY * (isDesktop ? 7 : 4))
            stageRotateYTo?.(offsetX * (isDesktop ? 10 : 6))
            coreXTo?.(offsetX * (isDesktop ? 16 : 9))
            coreYTo?.(offsetY * (isDesktop ? 11 : 6))

            interactiveNodes.forEach(({ xTo, yTo, depth }, index) => {
              const direction = index % 2 === 0 ? 1 : -1
              xTo(offsetX * depth * direction)
              yTo(offsetY * (depth * 0.66))
            })
          }

          const handlePointerLeave = () => {
            stageXTo?.(0)
            stageYTo?.(0)
            stageRotateXTo?.(0)
            stageRotateYTo?.(0)
            coreXTo?.(0)
            coreYTo?.(0)
            interactiveNodes.forEach(({ xTo, yTo }) => {
              xTo(0)
              yTo(0)
            })
          }

          heroSection.addEventListener('pointermove', handlePointerMove)
          heroSection.addEventListener('pointerleave', handlePointerLeave)

          return () => {
            heroSection.removeEventListener('pointermove', handlePointerMove)
            heroSection.removeEventListener('pointerleave', handlePointerLeave)
            localTweens.forEach((tween) => tween.kill())
          }
        },
      )

      ScrollTrigger.refresh()

      cleanupRouteLayout = () => {
        cancelAnimationFrame(resizeFrame)
        window.removeEventListener('resize', handleResize)
        pageRouteDrawTween?.scrollTrigger?.kill()
        pageRouteDrawTween?.kill()
      }
    }, scope)

    return () => {
      cleanupRouteLayout()
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
      <div data-home-page-route-layer className="absolute inset-0">
        <div data-home-page-veil className="home-page-veil absolute inset-x-[4%] inset-y-0" />
        <div
          data-home-page-rosette
          className="home-page-rosette absolute left-[6%] top-[14%] h-40 w-40"
        />
        <div
          data-home-page-rosette
          className="home-page-rosette absolute right-[8%] top-[38%] h-52 w-52"
        />
        <div
          data-home-page-rosette
          className="home-page-rosette absolute left-[18%] top-[72%] h-44 w-44"
        />

        <svg
          ref={pageRouteSvgRef}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <linearGradient id="home-page-route-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d2a762" />
              <stop offset="52%" stopColor="#7fb0d9" />
              <stop offset="100%" stopColor="#5c987c" />
            </linearGradient>
          </defs>
          <path
            ref={pageRouteGlowRef}
            stroke="rgba(210,167,98,0.12)"
            strokeWidth="26"
            strokeLinecap="round"
          />
          <path
            ref={pageRoutePathRef}
            stroke="url(#home-page-route-gradient)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            ref={pageRouteDashRef}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeDasharray="7 11"
          />
        </svg>

        {ROUTE_STOP_IDS.map((id, index) => (
          <div
            key={id}
            ref={(node) => {
              pageRouteNodeRefs.current[index] = node
            }}
            data-home-page-route-node={id}
            className="home-page-route-node absolute left-0 top-0"
          >
            <span data-home-page-node-halo className="home-page-route-node-halo" />
            <span className="home-page-route-node-frame" />
            <span className="home-page-route-node-core" />
          </div>
        ))}
      </div>

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
