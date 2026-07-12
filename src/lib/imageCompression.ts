export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export async function imageFileToStorageDataUrl(
  file: File,
  options: { maxSize?: number; quality?: number } = {}
): Promise<string> {
  if (!file.type.startsWith('image/')) return readFileAsDataUrl(file)

  const maxSize = options.maxSize ?? 900
  const quality = options.quality ?? 0.72
  const sourceUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Failed to load image'))
      element.src = sourceUrl
    })

    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) return readFileAsDataUrl(file)

    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return readFileAsDataUrl(file)
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}
