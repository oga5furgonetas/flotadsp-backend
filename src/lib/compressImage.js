/**
 * Comprime una imagen en el navegador antes de subirla.
 * Equivalente a la función `lu` del bundle original: redimensiona al lado
 * máximo indicado y exporta JPEG con la calidad dada.
 */
export function compressImage(file, maxSide = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxSide || height > maxSide) {
        const scale = maxSide / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir'))),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Imagen inválida'))
    }
    img.src = url
  })
}
