import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCanvasCommands } from '@/features/editor/hooks/useCanvasCommands'
import type { Command } from '@/features/editor/hooks/useCanvasCommands'

function createMockCommand(desc: string): Command {
  return {
    execute: vi.fn(),
    undo: vi.fn(),
    description: desc,
    timestamp: Date.now(),
  }
}

describe('useCanvasCommands', () => {
  beforeEach(() => {
    useCanvasCommands.setState({
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
    })
  })

  it('pushes command to undo stack', () => {
    const cmd = createMockCommand('test')
    useCanvasCommands.getState().pushCommand(cmd)

    const state = useCanvasCommands.getState()
    expect(state.undoStack).toHaveLength(1)
    expect(state.canUndo).toBe(true)
    expect(state.canRedo).toBe(false)
  })

  it('undo pops from undo stack and pushes to redo stack', () => {
    const cmd = createMockCommand('test')
    useCanvasCommands.getState().pushCommand(cmd)
    useCanvasCommands.getState().undo()

    const state = useCanvasCommands.getState()
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(1)
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(true)
    expect(cmd.undo).toHaveBeenCalledOnce()
  })

  it('redo pops from redo stack and pushes to undo stack', () => {
    const cmd = createMockCommand('test')
    useCanvasCommands.getState().pushCommand(cmd)
    useCanvasCommands.getState().undo()
    useCanvasCommands.getState().redo()

    const state = useCanvasCommands.getState()
    expect(state.undoStack).toHaveLength(1)
    expect(state.redoStack).toHaveLength(0)
    expect(state.canUndo).toBe(true)
    expect(state.canRedo).toBe(false)
    expect(cmd.execute).toHaveBeenCalledOnce()
  })

  it('undo on empty stack does nothing', () => {
    useCanvasCommands.getState().undo()
    const state = useCanvasCommands.getState()
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(0)
  })

  it('new command clears redo stack', () => {
    const cmd1 = createMockCommand('first')
    const cmd2 = createMockCommand('second')

    useCanvasCommands.getState().pushCommand(cmd1)
    useCanvasCommands.getState().undo()
    expect(useCanvasCommands.getState().canRedo).toBe(true)

    useCanvasCommands.getState().pushCommand(cmd2)
    expect(useCanvasCommands.getState().redoStack).toHaveLength(0)
    expect(useCanvasCommands.getState().canRedo).toBe(false)
  })

  it('respects max undo depth of 50', () => {
    for (let i = 0; i < 55; i++) {
      useCanvasCommands.getState().pushCommand(createMockCommand(`cmd-${i}`))
    }

    const state = useCanvasCommands.getState()
    expect(state.undoStack).toHaveLength(50)
    expect(state.undoStack[0].description).toBe('cmd-5')
    expect(state.undoStack[49].description).toBe('cmd-54')
  })

  it('does not mutate stack when cmd.undo() throws', () => {
    const cmd = createMockCommand('throws-on-undo')
    ;(cmd.undo as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('undo failed')
    })

    useCanvasCommands.getState().pushCommand(cmd)
    useCanvasCommands.getState().undo()

    // Stack must be unchanged: undo threw, so no state transition should occur
    const state = useCanvasCommands.getState()
    expect(state.undoStack).toHaveLength(1)
    expect(state.redoStack).toHaveLength(0)
    expect(state.canUndo).toBe(true)
    expect(state.canRedo).toBe(false)
  })

  it('does not mutate stack when cmd.execute() throws during redo', () => {
    const cmd = createMockCommand('throws-on-redo')
    useCanvasCommands.getState().pushCommand(cmd)
    useCanvasCommands.getState().undo()

    // Now arm execute to throw when redo calls it
    ;(cmd.execute as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('redo failed')
    })
    useCanvasCommands.getState().redo()

    // Stack must be unchanged: redo threw, so no state transition should occur
    const state = useCanvasCommands.getState()
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(1)
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(true)
  })
})
