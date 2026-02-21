const LOCATION_RUNTIME_EVENT = 'aljama:location-runtime'

let runtimeLocationAccess = false

function hasWindow() {
  return typeof window !== 'undefined'
}

export function hasRuntimeLocationAccess() {
  return runtimeLocationAccess
}

export function setRuntimeLocationAccess(granted: boolean) {
  runtimeLocationAccess = granted
  if (!hasWindow()) return
  window.dispatchEvent(new Event(LOCATION_RUNTIME_EVENT))
}

export function onRuntimeLocationAccessChange(handler: () => void) {
  if (!hasWindow()) return () => {}
  window.addEventListener(LOCATION_RUNTIME_EVENT, handler)
  return () => window.removeEventListener(LOCATION_RUNTIME_EVENT, handler)
}
