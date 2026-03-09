# UI/UX Flow Review + Single-Page Refactor Plan

## 1) Current flow map (as implemented)

## Entry + routing surfaces
- Home route renders one long-scrolling page with multiple sections: hero, region/compliance, wallet access, XRPL, trade desk, share, footer.
- Login gate is a separate full-screen gate with its own language switcher, auth modes, and heavy GSAP scene logic.
- Consent entry gate is a separate full-screen gate with similar scene choreography and language switcher behavior.

## Wallet funnel
1. User lands on home.
2. Primary CTAs route to `#create` and `#connect` anchors.
3. Create Wallet and Connect Wallet are separate cards in wallet section.
4. Dynamic Info card overlays/supports wallet state and profile details.

## Motion system
- Home has global `HomeMotionScene` with route path drawing, section reveal timelines, hero effects, and scroll trigger orchestration.
- Login gate and consent gate each include custom intro timelines + pointer-parallax loops + state-sync animations.
- Result: animation code duplication across at least 3 heavy client components.

---

## 2) Primary UX friction points blocking “seamless” behavior

1. **Context switching between full-screen gates and long-scrolling home.**
   - User mental model resets between secure gate and operational wallet UI.
   - Language switch UI duplicated across surfaces.

2. **Too many concurrent visual systems.**
   - Home route animation layer + section card animations + floating info card + separate gate scene stacks.
   - On lower-power mobile devices this will increase main-thread pressure and perceived latency during pointer/scroll.

3. **Auth/consent not progressive in-page.**
   - Secure gate and consent feel like separate apps rather than a staged progression inside one shell.

4. **CTA intent split.**
   - Create and Connect as two equal hero actions before identity confirmation can create decision overhead.

5. **Potential Fitts-law inefficiency on portable devices.**
   - Some action clusters are visually dense with small secondary controls (status pills, icon controls, language toggles) that can become thumb-unfriendly under text scaling.

---

## 3) Single-page target architecture (recommended)

Implement one route shell with stacked stateful panes:

```txt
SecureGatePane (always first)
  -> ConsentPane (conditional, inline)
    -> WalletWorkspacePane
      - DynamicWalletHeader
      - Create/Connect segmented control
      - Service modules (XRPL/market/trade)
      - Persistent DynamicInfoCard (mobile bottom-sheet mode)
```

### Concrete state machine
Use a single app-stage enum and derive visibility/interaction from it:

```ts
export type AppStage =
  | 'locked'
  | 'consent-required'
  | 'wallet-ready'

export type WalletMode = 'create' | 'connect'
```

Rules:
- `locked`: only secure gate inputs interactive.
- `consent-required`: secure gate summary collapses; consent pane opens inline.
- `wallet-ready`: wallet workspace enabled; secure/consent preserved as collapsible history chips.

This removes full-page transitions and keeps user orientation stable.

---

## 4) GSAP refactor to support single-page architecture

## 4.1 Extract duplicated scene logic into a shared controller
Create reusable hook:

```ts
// hooks/useGateSceneMotion.ts
'use client'

import { gsap } from 'gsap'
import { useEffect } from 'react'

type GateSceneMotionArgs = {
  root: React.RefObject<HTMLElement>
  panel: React.RefObject<HTMLElement>
  reduceMotion: boolean
  selectors: {
    stage: string
    core: string
    auras: string
    lines: string
    elements: string[]
  }
  parallax?: {
    stageX: number
    stageY: number
    rotateX: number
    rotateY: number
    coreX: number
    coreY: number
  }
}

export function useGateSceneMotion(args: GateSceneMotionArgs) {
  useEffect(() => {
    if (!args.root.current || args.reduceMotion) return

    let cleanupPointer = () => {}
    const setup = () => {
      const root = args.root.current
      const panel = args.panel.current
      if (!root || !panel) return

      const stage = root.querySelector<HTMLElement>(args.selectors.stage)
      const core = root.querySelector<HTMLElement>(args.selectors.core)
      const auras = [...root.querySelectorAll<HTMLElement>(args.selectors.auras)]
      const lines = [...root.querySelectorAll<SVGPathElement>(args.selectors.lines)]

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.from(panel, { autoAlpha: 0, y: 24, scale: 0.98, duration: 0.7 })
      if (stage) tl.from(stage, { autoAlpha: 0, y: 14, scale: 0.97, duration: 0.6 }, '<0.08')
      if (auras.length) tl.from(auras, { autoAlpha: 0, scale: 0.8, duration: 0.5, stagger: 0.04 }, '<0.04')
      if (lines.length) tl.from(lines, { scaleX: 0, transformOrigin: '50% 50%', duration: 0.5, stagger: 0.03 }, '<0.05')

      args.selectors.elements.forEach((selector) => {
        const nodes = [...root.querySelectorAll<HTMLElement>(selector)]
        if (!nodes.length) return
        tl.from(nodes, { autoAlpha: 0, y: 10, duration: 0.35, stagger: 0.03 }, '<0.02')
      })

      auras.forEach((node, index) => {
        gsap.to(node, {
          rotate: index % 2 ? -360 : 360,
          duration: 30 + index * 6,
          ease: 'none',
          repeat: -1,
        })
      })

      if (!args.parallax || !stage || !core || typeof gsap.quickTo !== 'function') return

      const sx = gsap.quickTo(stage, 'x', { duration: 0.35, ease: 'power3.out' })
      const sy = gsap.quickTo(stage, 'y', { duration: 0.35, ease: 'power3.out' })
      const rx = gsap.quickTo(panel, 'rotationX', { duration: 0.45, ease: 'power3.out' })
      const ry = gsap.quickTo(panel, 'rotationY', { duration: 0.45, ease: 'power3.out' })
      const cx = gsap.quickTo(core, 'x', { duration: 0.35, ease: 'power3.out' })
      const cy = gsap.quickTo(core, 'y', { duration: 0.35, ease: 'power3.out' })

      const handleMove = (event: PointerEvent) => {
        const bounds = panel.getBoundingClientRect()
        const ox = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
        const oy = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
        sx(ox * args.parallax.stageX)
        sy(oy * args.parallax.stageY)
        rx(-oy * args.parallax.rotateX)
        ry(ox * args.parallax.rotateY)
        cx(ox * args.parallax.coreX)
        cy(oy * args.parallax.coreY)
      }

      const handleLeave = () => {
        sx(0); sy(0); rx(0); ry(0); cx(0); cy(0)
      }

      panel.addEventListener('pointermove', handleMove)
      panel.addEventListener('pointerleave', handleLeave)
      cleanupPointer = () => {
        panel.removeEventListener('pointermove', handleMove)
        panel.removeEventListener('pointerleave', handleLeave)
      }
    }

    const ctx = typeof gsap.context === 'function' ? gsap.context(setup, args.root) : null
    if (!ctx) setup()

    return () => {
      cleanupPointer()
      ctx?.revert()
    }
  }, [args])
}
```

Apply to:
- `LoginGate`
- `ConsentEntryGate`
- Any secure-stage variants

This removes duplicate timeline/parallax code and standardizes format.

## 4.2 Split HomeMotionScene into modules
Current `HomeMotionScene` should be split by concern:
- `useHomeHeroMotion`
- `useHomeRouteMapMotion`
- `useHomeSectionRevealMotion`

Then gate each by stage:
- `locked`: disable non-gate scroll triggers.
- `wallet-ready`: enable route map + section reveals.

## 4.3 Motion budget policy
Add static caps:
- max concurrent infinite loops in viewport: **<= 3**
- default duration floor: **>= 300ms** for state changes
- `prefers-reduced-motion`: disable continuous rotation/parallax, keep opacity/position only

---

## 5) Function nesting / heaviness assessment

Heuristic scan (`python` script) across `components/home` + `hooks` produced:

| File | LOC | Max brace depth | Largest function span (lines) | Risk |
|---|---:|---:|---:|---|
| `components/home/XrplTradeDesk.client.tsx` | 1651 | 6 | 179 | High |
| `components/home/CreateWalletPanel.tsx` | 1254 | 7 | 266 | High |
| `components/home/XrplMarketPanel.client.tsx` | 1221 | 6 | 159 | High |
| `components/home/DynamicInfoCard.client.tsx` | 788 | 6 | 135 | Medium-High |
| `components/home/LoginGate.tsx` | 769 | 6 | 239 | High |
| `components/home/HomeMotionScene.client.tsx` | 528 | 7 | 156 | High |
| `components/home/ConsentEntryGate.client.tsx` | 458 | 5 | 168 | Medium-High |

Interpretation:
- Multiple view modules are carrying both rendering + orchestration + IO + animation state.
- Maintainability risk is high; hotfix velocity and regression probability are impacted.

### Refactor threshold policy
For home/gate domain components:
- Soft cap: **450 LOC/component**
- Hard cap: **700 LOC/component**
- Extract any function > **90 lines** into dedicated hook/service
- Keep JSX render function mostly declarative; move side-effect logic to hooks

---

## 6) Portable-device interpretation + concrete fixes

## 6.1 Interaction geometry
- Keep primary controls at min 44x44 CSS px hit area.
- Increase horizontal gaps between destructive/committing actions.
- Promote a bottom-anchored primary action bar for thumb zone on phone widths.

## 6.2 Dynamic info card behavior
- Desktop: draggable floating card (current behavior retained).
- Mobile (`< md`): convert to bottom sheet with 2 snap points (collapsed/expanded), disable drag-to-corner logic.
- Keep expanded content inside `max-h-[70vh] overflow-auto` to avoid viewport spill under text scaling.

## 6.3 Motion and battery
- Disable pointer parallax on coarse pointers:

```ts
const coarsePointer = window.matchMedia('(pointer: coarse)').matches
if (coarsePointer) return
```

- Reduce active blur/shadow layers on mobile for better compositing.

## 6.4 One-page secure flow on mobile
- Stage header fixed at top with compact progress chip: `Secure → Consent → Wallet`.
- Animate vertical transitions within same page container, not route changes.
- Keep secure context visible as collapsed summary after unlock for trust continuity.

---

## 7) Immediate implementation order (lowest risk)

1. Extract shared gate motion hook and migrate Login/Consent.
2. Introduce `AppStage` state machine in one page shell.
3. Inline consent pane after successful auth in same route.
4. Split `HomeMotionScene` into 3 hooks + stage gating.
5. Mobile bottom-sheet mode for dynamic info card.
6. Enforce component size thresholds via CI lint rule (custom script).

