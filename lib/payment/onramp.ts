const DEFAULT_ONRAMP_URL_TEMPLATE = 'https://global.transak.com?walletAddress={address}'

export function resolveOnRampTemplate(rawTemplate: string | undefined | null): string {
  const trimmed = rawTemplate?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_ONRAMP_URL_TEMPLATE
}

export function isUsingDefaultOnRampTemplate(rawTemplate: string | undefined | null): boolean {
  const trimmed = rawTemplate?.trim()
  return !trimmed
}

export function buildOnRampUrl(
  address: string,
  rawTemplate: string | undefined | null,
): string {
  const template = resolveOnRampTemplate(rawTemplate)

  if (template.includes('{address}')) {
    return template.replaceAll('{address}', encodeURIComponent(address))
  }

  const separator = template.includes('?') ? '&' : '?'
  return `${template}${separator}walletAddress=${encodeURIComponent(address)}`
}

export const onRampDefaults = {
  template: DEFAULT_ONRAMP_URL_TEMPLATE,
} as const
