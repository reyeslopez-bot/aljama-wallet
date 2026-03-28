export const CONTACT_CATEGORY_VALUES = [
  'wallet_setup',
  'account_login',
  'payments_transfers',
  'xrpl_trading',
  'compliance_security',
  'bug_report',
  'partnership',
  'other',
] as const

export type ContactCategory = (typeof CONTACT_CATEGORY_VALUES)[number]

export const SUPPORT_DRAWER_OPEN_EVENT = 'aljama:support-open'

export type SupportDrawerOpenDetail = {
  source?: string
  category?: ContactCategory | null
  questionId?: string | null
}

export function openSupportDrawer(detail: SupportDrawerOpenDetail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<SupportDrawerOpenDetail>(SUPPORT_DRAWER_OPEN_EVENT, { detail }))
}

export function isContactCategory(value: string | null | undefined): value is ContactCategory {
  return Boolean(value && CONTACT_CATEGORY_VALUES.includes(value as ContactCategory))
}

export function getContactCategoryLabel(category: ContactCategory): string {
  switch (category) {
    case 'wallet_setup':
      return 'Wallet setup'
    case 'account_login':
      return 'Account / login'
    case 'payments_transfers':
      return 'Payments / transfers'
    case 'xrpl_trading':
      return 'XRPL / trading'
    case 'compliance_security':
      return 'Compliance / security'
    case 'bug_report':
      return 'Bug report'
    case 'partnership':
      return 'Partnership'
    case 'other':
      return 'Other'
  }
}

export function getSupportReplyWindow(): string {
  return process.env.SUPPORT_ACK_WINDOW?.trim() || 'within 1 business day'
}
