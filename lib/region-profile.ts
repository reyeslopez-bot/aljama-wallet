export type UiRegion = 'us' | 'eu' | 'mena' | 'apac' | 'latam'
export type ComplianceTarget = 'gdpr' | 'soc2' | 'iso'
export type RegionSelectionMode = 'auto' | 'manual'

export const REGION_KEY = 'aljama.region'
export const DETECTED_REGION_KEY = 'aljama.region.detected'
export const REGION_PROFILE_KEY = 'aljama.region.profileEnabled'
export const REGION_SELECTION_MODE_KEY = 'aljama.region.selectionMode'
export const REGION_SYNC_EVENT = 'aljama:region-sync'

const SUPPORTED_REGIONS = new Set<UiRegion>(['us', 'eu', 'mena', 'apac', 'latam'])
const REGION_COMPLIANCE_TARGETS: Record<UiRegion, ComplianceTarget> = {
  apac: 'iso',
  eu: 'gdpr',
  latam: 'iso',
  mena: 'iso',
  us: 'soc2',
}

export function isSupportedRegion(value: string | null): value is UiRegion {
  return Boolean(value && SUPPORTED_REGIONS.has(value as UiRegion))
}

export function isRegionSelectionMode(value: string | null): value is RegionSelectionMode {
  return value === 'auto' || value === 'manual'
}

export function resolveComplianceTarget(region: UiRegion): ComplianceTarget {
  return REGION_COMPLIANCE_TARGETS[region]
}
