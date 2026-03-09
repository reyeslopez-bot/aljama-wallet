import userEvent from '@testing-library/user-event'

export const HUMAN_DELAYS = {
  click: 12,
  type: 18,
  shortSettle: 20,
  mediumSettle: 40,
} as const

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function createHuman() {
  return {
    async click(element: Element, settleMs: number = HUMAN_DELAYS.shortSettle) {
      const user = userEvent.setup({ delay: HUMAN_DELAYS.click })
      await user.click(element)
      await pause(settleMs)
    },
    async type(element: Element, text: string, settleMs: number = HUMAN_DELAYS.mediumSettle) {
      const user = userEvent.setup({ delay: HUMAN_DELAYS.type })
      await user.type(element, text)
      await pause(settleMs)
    },
    async clear(element: Element, settleMs: number = HUMAN_DELAYS.shortSettle) {
      const user = userEvent.setup({ delay: HUMAN_DELAYS.type })
      await user.clear(element)
      await pause(settleMs)
    },
  }
}
