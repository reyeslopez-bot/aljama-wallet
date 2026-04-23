export function estimateDataUrlBytes(dataUrl: string): number {
  const [, payload = ''] = dataUrl.split(',', 2)
  const paddingLength = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((payload.length * 3) / 4) - paddingLength)
}
