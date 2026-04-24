import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { screenshotMaxWidth, screenshotQuality, screenshotsDir, tempDir } from './config'
import { runCommand } from './process'
import type { ScreenshotAssetCapture } from './types'

const parseSipsDimensions = (stdout: string): { width: number | null; height: number | null } => {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const widthLine = lines.find((line) => line.includes('pixelWidth:'))
  const heightLine = lines.find((line) => line.includes('pixelHeight:'))

  const width = Number.parseInt(
    String(widthLine || '')
      .split(':')
      .pop() || '',
    10,
  )
  const height = Number.parseInt(
    String(heightLine || '')
      .split(':')
      .pop() || '',
    10,
  )

  return {
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
  }
}

const optimizeScreenshot = async (inputPath: string, outputPath: string): Promise<string> => {
  const args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', String(screenshotQuality)]

  if (screenshotMaxWidth > 0) {
    args.push('-Z', String(screenshotMaxWidth))
  }

  args.push(inputPath, '--out', outputPath)

  const optimized = await runCommand(args)
  if (optimized.exitCode === 0 && fs.existsSync(outputPath)) {
    return outputPath
  }

  return inputPath
}

const getDimensions = async (
  filePath: string,
): Promise<{ width: number | null; height: number | null }> => {
  const result = await runCommand(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', filePath])
  if (result.exitCode !== 0) {
    return { width: null, height: null }
  }

  return parseSipsDimensions(result.stdout)
}

export const captureScreenshot = async (
  observedAt: string,
): Promise<ScreenshotAssetCapture | null> => {
  const tempId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  const rawPath = path.join(tempDir, `${tempId}-raw.jpg`)
  const optimizedPath = path.join(tempDir, `${tempId}-optimized.jpg`)

  const capture = await runCommand(['screencapture', '-x', '-t', 'jpg', rawPath])
  if (capture.exitCode !== 0 || !fs.existsSync(rawPath)) {
    return null
  }

  let finalTempPath = rawPath
  try {
    finalTempPath = await optimizeScreenshot(rawPath, optimizedPath)
    if (finalTempPath === optimizedPath && fs.existsSync(rawPath)) {
      fs.rmSync(rawPath, { force: true })
    }

    const bytes = fs.readFileSync(finalTempPath)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const assetId = sha256
    const storagePath = path.join(screenshotsDir, `${assetId}.jpg`)

    if (!fs.existsSync(storagePath)) {
      fs.renameSync(finalTempPath, storagePath)
      finalTempPath = storagePath
    } else {
      fs.rmSync(finalTempPath, { force: true })
      finalTempPath = storagePath
    }

    const stat = fs.statSync(storagePath)
    const dims = await getDimensions(storagePath)

    return {
      observedAt,
      assetId,
      sha256,
      storagePath,
      bytes: stat.size,
      width: dims.width,
      height: dims.height,
    }
  } finally {
    if (fs.existsSync(rawPath)) {
      fs.rmSync(rawPath, { force: true })
    }
    if (fs.existsSync(optimizedPath) && optimizedPath !== finalTempPath) {
      fs.rmSync(optimizedPath, { force: true })
    }
  }
}
