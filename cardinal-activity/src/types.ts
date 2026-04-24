export type WindowSample = {
  observedAt: string
  appName: string
  windowTitle: string
  bundleId: string | null
  ownerPid: number | null
}

export type ScreenshotAssetCapture = {
  observedAt: string
  assetId: string
  sha256: string
  storagePath: string
  bytes: number
  width: number | null
  height: number | null
}
