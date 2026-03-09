# UI/UX flow review + one-page consolidation plan

## Current flow map

1. `HomeConsentGate` blocks all site routes until telemetry/location consent is set in storage/session keys.
2. Consent accepted => `LayoutClient` + `Navbar` + route content render.
3. Home route composes 7 vertical sections with hash navigation and GSAP route animation.
4. Login is a separate route (`/[locale]/login`) with a second gate animation and independent auth form state.

## Seamless flow improvements (HCI-aligned)

### 1) Collapse to one secure-gate page shell

Use one page that progressively unlocks modules instead of route jumps:

- Stage A: **Consent + login/register** (single card with tabbed mode)
- Stage B: **Wallet actions** (create/connect)
- Stage C: **Dynamic wallet info + market/trade panels**

Implementation:

- Keep `HomeConsentGate` behavior but move `ConsentEntryGate` and `LoginGate` into one orchestrator component on home page.
- Remove hard dependency on `/${locale}/login`; open auth mode in-page.
- Keep hash anchors only for deep-linking; do not depend on section scrolling for critical actions.

### 2) Reduce interaction latency + cognitive load

- Put primary CTA cluster (`Create`, `Connect`, `Unlock`) in one persistent action rail near the top.
- Keep only one dominant action per state (visibility + mapping). Secondary actions as text links.
- Apply minimum mobile hit target of `44x44` and keep dangerous/irreversible actions spatially separated.

### 3) Motion policy updates

- Keep intro animation once; disable re-entry choreography for subsequent sections.
- Replace parallel timelines with tokenized motion presets and shared hooks.
- Disable pointer-parallax for coarse pointers (mobile/tablet touch) to avoid accidental CPU cost.

### 4) Portable-device interpretation

- Current tests already enforce no horizontal overflow and in-viewport behavior; preserve those checks when consolidating page shell.
- Pin dynamic info card behavior to bottom sheet on small screens (<768px) rather than draggable floating card.
- Collapse market/trade visuals behind segmented controls on mobile to reduce scroll fatigue.

## GSAP refactor direction

### Extract from monolith timelines

Split scene logic into isolated hooks:

- `useHomeRouteLayout(scopeRef)` for route path compute + resize
- `useHomeIntroTimeline(nodes)` for first-load sequence only
- `useHomeSectionReveal(nodes)` for scroll-trigger reveal
- `usePointerParallax(targets, { desktopOnly: true })`

### Standardize animation config format

Use a typed motion token file:

```ts
// motion/tokens.ts
export const MOTION = {
  fast: { duration: 0.18, ease: 'power2.out' },
  base: { duration: 0.45, ease: 'power3.out' },
  enter: { duration: 0.85, ease: 'power3.out' },
  hero: { duration: 1.02, ease: 'power4.out' },
} as const
```

And consume via helper:

```ts
// motion/animate.ts
import { gsap } from 'gsap'
import { MOTION } from './tokens'

export function animateEnter(target: gsap.TweenTarget, vars: gsap.TweenVars = {}) {
  return gsap.from(target, { autoAlpha: 0, y: 16, ...MOTION.enter, ...vars })
}
```

### Gate orchestration target

```tsx
// components/home/SecureGateShell.client.tsx
'use client'

export function SecureGateShell() {
  // stage: consent -> auth -> wallet
  // render one page; do not navigate away
  return null
}
```

## Nesting/weight snapshot (heuristic)

Heaviest UI units now:

- `LoginGate`: ~744 lines in one component; highest control-flow depth in sampled set.
- `DynamicInfoCard`: ~626 lines with mixed concerns (session sync, drag, theme, network-time).
- `HomeMotionScene`: ~491 lines with route layout + intro + section reveal + pointer parallax in one effect.
- `ConsentEntryGate`: ~435 lines; duplicates motion patterns also present in `LoginGate`.

Action: split each heavy component into `view`, `state`, and `motion` modules and cap component file size around 220-280 LOC.

## Concrete migration sequence

1. Create `SecureGateShell` and render inside home page above existing sections.
2. Move consent/auth state transitions into one reducer (`gateStateMachine.ts`).
3. Inline login route behavior into shell and deprecate route-level login page.
4. Refactor GSAP into reusable hooks + motion tokens.
5. Convert mobile dynamic info card to bottom-sheet mode.
6. Keep existing Playwright overflow/viewport tests; add one new e2e flow for consent->auth->wallet on single page.
