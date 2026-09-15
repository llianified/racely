import { describe, expect, it, vi } from 'vitest'
import type { EventManager } from '@react-three/fiber'
import { guardPointerEventManager } from '../components/game/scene/scene-recovery'

function eventManager(connect = vi.fn()): EventManager<HTMLElement> {
  return { enabled: true, priority: 1, connect }
}

describe('3D scene pointer event recovery', () => {
  it('ignores a missing event target after its Canvas has detached', () => {
    const manager = eventManager()
    const connect = manager.connect

    guardPointerEventManager(manager).connect?.(null as unknown as HTMLElement)

    expect(connect).not.toHaveBeenCalled()
  })

  it('forwards a mounted event target to the default pointer manager', () => {
    const target = {} as HTMLElement
    const manager = eventManager()
    const connect = manager.connect

    guardPointerEventManager(manager).connect?.(target)

    expect(connect).toHaveBeenCalledOnce()
    expect(connect).toHaveBeenCalledWith(target)
  })
})
