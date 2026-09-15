import { Box3, Matrix4, Mesh, Vector3, type Object3D } from 'three'

export const PREVIEW_POSITION: [number, number, number] = [1.6, 1.1, 1.9]
export const PREVIEW_TARGET: [number, number, number] = [0, 0, 0]
const FIT_MARGIN = 1.12

export function measurePreview(object: Object3D) {
  object.updateWorldMatrix(true, true)
  const center = new Box3().setFromObject(object).getCenter(new Vector3())
  const view = new Matrix4().lookAt(new Vector3(...PREVIEW_POSITION), new Vector3(), new Vector3(0, 1, 0)).invert()
  view.multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z))
  const projected = new Box3()
  const transform = new Matrix4()
  const box = new Box3()

  // Bola pembatas menyisakan banyak ruang kosong untuk mobil yang rendah.
  // Ukur setiap mesh di bidang kamera agar ban dan aero tetap masuk bingkai.
  object.traverseVisible(child => {
    if (!(child instanceof Mesh)) return
    child.geometry.computeBoundingBox()
    const bounds = child.geometry.boundingBox
    if (!bounds) return
    transform.multiplyMatrices(view, child.matrixWorld)
    projected.union(box.copy(bounds).applyMatrix4(transform))
  })

  const width = 2 * Math.max(Math.abs(projected.min.x), Math.abs(projected.max.x))
  const height = 2 * Math.max(Math.abs(projected.min.y), Math.abs(projected.max.y))
  return {
    center,
    width: Number.isFinite(width) && width > 0 ? width : 1.6,
    height: Number.isFinite(height) && height > 0 ? height : 1.6,
  }
}

export function previewFitZoom(width: number, height: number, bounds: { width: number; height: number }) {
  return Math.max(1, Math.min(width / bounds.width, height / bounds.height) / FIT_MARGIN)
}
