const FONTS = [
  { family: 'AlibabaPuHuiTi', url: '/fonts/AlibabaPuHuiTi-Regular.woff2', weight: 'normal' },
  { family: 'AlibabaPuHuiTi', url: '/fonts/AlibabaPuHuiTi-Bold.woff2', weight: 'bold' },
  { family: 'NotoSansSC', url: '/fonts/NotoSansSC-Regular.woff2', weight: 'normal' },
]

let fontsLoaded = false
let loadingPromise: Promise<void> | null = null

export async function loadFonts(): Promise<void> {
  if (fontsLoaded) return
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const loadPromises = FONTS.map(async (font) => {
      try {
        const fontFace = new FontFace(font.family, `url(${font.url})`, {
          weight: font.weight,
        })
        const loaded = await fontFace.load()
        document.fonts.add(loaded)
      } catch (err) {
        // Font file may not exist yet - continue without it; text will fall back to system fonts
        console.warn(`[FontLoader] Failed to load font ${font.family} ${font.weight}:`, (err as Error).message)
      }
    })

    await Promise.allSettled(loadPromises)
    fontsLoaded = true
  })()

  return loadingPromise
}

export function areFontsLoaded(): boolean {
  return fontsLoaded
}
