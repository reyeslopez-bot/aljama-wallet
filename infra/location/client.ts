export type LocationConsent = 'granted' | 'denied' | 'unset'

const LOCATION_CONSENT_KEY = 'aljama.location.consent'
const LOCATION_CONSENT_EVENT = 'aljama:location-consent'

function hasWindow() {
  return typeof window !== 'undefined'
}

export function getLocationConsent(): LocationConsent {
  if (!hasWindow()) return 'unset'
  const value = window.localStorage.getItem(LOCATION_CONSENT_KEY)
  if (value === 'granted' || value === 'denied') return value
  return 'unset'
}

export function setLocationConsent(value: Exclude<LocationConsent, 'unset'>) {
  if (!hasWindow()) return
  window.localStorage.setItem(LOCATION_CONSENT_KEY, value)
  window.dispatchEvent(new Event(LOCATION_CONSENT_EVENT))
}

export function onLocationConsentChange(handler: () => void) {
  if (!hasWindow()) return () => {}
  window.addEventListener(LOCATION_CONSENT_EVENT, handler)
  return () => window.removeEventListener(LOCATION_CONSENT_EVENT, handler)
}

export function canUseGeolocation() {
  if (!hasWindow()) return false

  const policy = (
    document as Document & {
      permissionsPolicy?: { allowsFeature?: (feature: string) => boolean }
      featurePolicy?: { allowsFeature?: (feature: string) => boolean }
    }
  ).permissionsPolicy ??
    (
      document as Document & {
        featurePolicy?: { allowsFeature?: (feature: string) => boolean }
      }
    ).featurePolicy

  if (!policy?.allowsFeature) return true

  try {
    return policy.allowsFeature('geolocation')
  } catch {
    return true
  }
}
