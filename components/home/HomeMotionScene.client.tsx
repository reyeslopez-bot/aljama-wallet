'use client'

import { gsap } from 'gsap'
import { useEffect, useRef } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useAdaptiveExperience } from '@/hooks/useAdaptiveExperience'

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
  let length = 0
  try {
    length = path.getTotalLength()
  } catch {
    return 0
  }
  gsap.set(path, {
    strokeDasharray: length,
    strokeDashoffset: length,
  })
  return length
}

function getPathPoint(path: SVGPathElement | null, distance: number) {
  if (!path) return null
  try {
    return path.getPointAtLength(distance)
  } catch {
    return null
  }
}

export default function HomeMotionScene() {
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const pageRouteSvgRef = useRef<SVGSVGElement | null>(null)
  const pageRouteGlowRef = useRef<SVGPathElement | null>(null)
  const pageRoutePathRef = useRef<SVGPathElement | null>(null)
  const pageRouteActiveRef = useRef<SVGPathElement | null>(null)
  const pageRouteSignalRef = useRef<HTMLDivElement | null>(null)
  const pageRouteNodeRefs = useRef<Array<HTMLDivElement | null>>([])
  const routeLayerReadyRef = useRef(false)
  const { shouldReduceMotion, shouldUseLightweightMode } = useAdaptiveExperience()

  useEffect(() => {
    const scene = sceneRef.current
    const scope = scene?.parentElement
    if (!scene || !scope) return

    routeLayerReadyRef.current = false
    scene.dataset.routeLayerReady = 'false'

    const mm = gsap.matchMedia()
    let cleanupRouteLayout = () => {}
    const ctx = gsap.context(() => {
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
      const pageNodeHalos = gsap.utils.toArray<HTMLElement>('[data-home-page-node-halo]')
      const statNodes = gsap.utils.toArray<HTMLElement>('[data-home-reveal="stat"]')
      const scrollSections = revealNodes.filter(
        (node) => node.dataset.homeReveal && node.dataset.homeReveal !== 'hero' && node.dataset.homeReveal !== 'stat',
      )
      const routeNodes = pageRouteNodeRefs.current.filter(Boolean) as HTMLDivElement[]

      let resizeFrame = 0
      let routeDrawCompleted = false
      let routeProgress = 0
      let routeActiveLength = 0

      const updateRouteProgress = (progress: number) => {
        routeProgress = Math.max(0, Math.min(progress, 1))

        if (pageRouteActiveRef.current && routeActiveLength > 0) {
          gsap.set(pageRouteActiveRef.current, {
            autoAlpha: routeProgress > 0.01 ? 1 : 0,
            strokeDashoffset: routeActiveLength * (1 - routeProgress),
          })
        }

        const activePoint = routeActiveLength > 0
          ? getPathPoint(pageRouteActiveRef.current, routeActiveLength * routeProgress)
          : null

        if (pageRouteSignalRef.current) {
          if (!activePoint) {
            gsap.set(pageRouteSignalRef.current, { autoAlpha: 0 })
          } else {
            gsap.set(pageRouteSignalRef.current, {
              autoAlpha: 1,
              x: activePoint.x,
              y: activePoint.y,
              xPercent: -50,
              yPercent: -50,
            })
          }
        }

        routeNodes.forEach((node, index) => {
          const distance = Math.abs(routeProgress * Math.max(routeNodes.length - 1, 1) - index)
          const intensity = Math.max(0.24, 0.72 - distance * 0.22)
          gsap.set(node, {
            autoAlpha: intensity,
            scale: distance < 0.55 ? 1.02 : 0.84,
          })
        })

        pageNodeHalos.forEach((node, index) => {
          const distance = Math.abs(routeProgress * Math.max(pageNodeHalos.length - 1, 1) - index)
          gsap.set(node, {
            opacity: distance < 0.55 ? 0.28 : 0.08,
            scale: distance < 0.55 ? 1.62 : 1,
          })
        })
      }

      const layoutPageRoute = () => {
        if (
          !pageRouteSvgRef.current ||
          !pageRoutePathRef.current ||
          !pageRouteGlowRef.current ||
          !pageRouteActiveRef.current
        ) {
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

        pageRouteGlowRef.current.setAttribute('d', mainPath)
        pageRoutePathRef.current.setAttribute('d', mainPath)
        pageRouteActiveRef.current.setAttribute('d', mainPath)

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

        setDrawState(pageRouteGlowRef.current)
        setDrawState(pageRoutePathRef.current)
        routeActiveLength = setDrawState(pageRouteActiveRef.current)
        if (routeDrawCompleted) {
          gsap.set([pageRouteGlowRef.current, pageRoutePathRef.current], { strokeDashoffset: 0 })
        }
        updateRouteProgress(routeProgress)
      }

      const handleResize = () => {
        cancelAnimationFrame(resizeFrame)
        resizeFrame = window.requestAnimationFrame(() => {
          layoutPageRoute()
        })
      }

      const setRouteLayerReady = (isReady: boolean) => {
        routeLayerReadyRef.current = isReady
        scene.dataset.routeLayerReady = isReady ? 'true' : 'false'
      }

      if (shouldUseLightweightMode) {
        setRouteLayerReady(false)
        gsap.set(pageRouteLayer, { autoAlpha: 0 })
        return () => {
          cancelAnimationFrame(resizeFrame)
        }
      }

      if (shouldReduceMotion) {
        const motionNodes = [
          ...heroAccentNodes,
          ...revealNodes,
          ...heroMarkers,
          ...heroBadges,
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
        gsap.set(
          [heroRoutePath, heroRouteGlow, pageRoutePathRef.current, pageRouteGlowRef.current, pageRouteActiveRef.current],
          {
          strokeDasharray: 'none',
          strokeDashoffset: 0,
          },
        )
        layoutPageRoute()
        updateRouteProgress(1)
        setRouteLayerReady(true)
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
        autoAlpha: 0.24,
        scale: 0.84,
      })
      gsap.set(pageNodeHalos, {
        scale: 1,
        opacity: 0.08,
      })

      const introTimeline = gsap.timeline({
        defaults: { duration: 0.95, ease: 'power3.out' },
        smoothChildTiming: true,
      })

      introTimeline.addLabel('intro')

      if (pageRouteLayer) {
        introTimeline.from(pageRouteLayer, { autoAlpha: 0, duration: 1.1 }, 'intro')
      }
      if (pageVeil) {
        introTimeline.from(pageVeil, { autoAlpha: 0, duration: 1 }, 'intro')
      }
      if (heroSection) {
        introTimeline.from(heroSection, { autoAlpha: 0, y: 24, scale: 0.992, duration: 1 }, 'intro')
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
            y: 30,
            rotateY: -6,
            rotateX: 6,
            scale: 0.97,
            duration: 1.02,
            ease: 'power4.out',
          },
          'intro+=0.12',
        )
      }
      if (heroCore) {
        introTimeline.from(
          heroCore,
          { autoAlpha: 0, scale: 0.95, duration: 0.9, ease: 'power4.out' },
          'intro+=0.26',
        )
      }
      if (heroGrid) {
        introTimeline.from(heroGrid, { autoAlpha: 0, duration: 0.9 }, 'intro+=0.22')
      }
      if (heroScan) {
        introTimeline.from(heroScan, { autoAlpha: 0, duration: 0.8 }, 'intro+=0.26')
      }
      if (pageRouteGlowRef.current && pageRoutePathRef.current) {
        introTimeline.to(
          [pageRouteGlowRef.current, pageRoutePathRef.current],
          { strokeDashoffset: 0, duration: 1.18, ease: 'power2.inOut' },
          'intro+=0.18',
        )
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
            y: 10,
            stagger: 0.05,
            duration: 0.6,
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
            autoAlpha: 0.56,
            scale: 0.92,
            duration: 0.6,
            ease: 'power3.out',
          },
          'intro+=0.84',
        )
      }
      introTimeline.call(() => {
        routeDrawCompleted = true
        updateRouteProgress(routeProgress)
      })

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
              autoAlpha: 0.56,
              scale: 0.92,
              duration: 0.55,
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

          const handlePointerMove = (event: PointerEvent) => {
            const bounds = heroSection.getBoundingClientRect()
            const offsetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
            const offsetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2

            stageXTo?.(offsetX * (isDesktop ? 8 : 4))
            stageYTo?.(offsetY * (isDesktop ? 6 : 3))
            stageRotateXTo?.(-offsetY * (isDesktop ? 4 : 2.5))
            stageRotateYTo?.(offsetX * (isDesktop ? 5 : 3))
            coreXTo?.(offsetX * (isDesktop ? 10 : 5))
            coreYTo?.(offsetY * (isDesktop ? 8 : 4))
          }

          const handlePointerLeave = () => {
            stageXTo?.(0)
            stageYTo?.(0)
            stageRotateXTo?.(0)
            stageRotateYTo?.(0)
            coreXTo?.(0)
            coreYTo?.(0)
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

      ScrollTrigger.create({
        id: 'home-page-route-progress',
        trigger: scope,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          updateRouteProgress(self.progress)
        },
      })

      ScrollTrigger.refresh()
      setRouteLayerReady(true)

      cleanupRouteLayout = () => {
        cancelAnimationFrame(resizeFrame)
        window.removeEventListener('resize', handleResize)
      }
    }, scope)

    return () => {
      cleanupRouteLayout()
      mm.revert()
      ctx.revert()
    }
  }, [shouldReduceMotion, shouldUseLightweightMode])

  return (
    <div
      ref={sceneRef}
      aria-hidden="true"
      data-route-layer-ready="false"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div data-home-page-route-layer className="absolute inset-0">
        <div data-home-page-veil className="home-page-veil absolute inset-x-[4%] inset-y-0" />

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
            stroke="rgba(210,167,98,0.08)"
            strokeWidth="18"
            strokeLinecap="round"
          />
          <path
            ref={pageRoutePathRef}
            stroke="url(#home-page-route-gradient)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            ref={pageRouteActiveRef}
            className="home-page-route-active"
            stroke="url(#home-page-route-gradient)"
            strokeWidth="4.6"
            strokeLinecap="round"
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

        <div ref={pageRouteSignalRef} className="home-page-route-signal absolute left-0 top-0">
          <span className="home-page-route-signal-halo" />
          <span className="home-page-route-signal-core" />
        </div>
      </div>

      <div
        data-home-ambient-node
        className="absolute -left-24 top-20 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(210,167,98,0.16),rgba(210,167,98,0)_68%)] blur-3xl"
      />
      <div
        data-home-ambient-node
        className="absolute right-[-8rem] top-[16rem] h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(78,120,160,0.14),rgba(78,120,160,0)_68%)] blur-3xl"
      />
    </div>
  )
}
