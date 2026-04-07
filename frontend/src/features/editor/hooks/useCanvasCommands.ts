import { create } from 'zustand'

/**
 * Reversible command pattern for the canvas undo/redo system.
 *
 * Lifecycle:
 *  1. An action handler (Toolbar, ChatDialog, etc.) constructs a Command and calls execute() once.
 *  2. The same Command is handed to pushCommand(), which adds it to the undoStack.
 *  3. undo() pops from undoStack, calls cmd.undo(), moves cmd to redoStack.
 *  4. redo() pops from redoStack, calls cmd.execute() again, moves cmd back to undoStack.
 *
 * Contract for implementors:
 *  - execute() and undo() must be inverses of each other.
 *  - Both may be called multiple times; do NOT assume canvas state is identical to creation time.
 *  - Both may throw if Fabric.js objects were removed externally — callers handle this.
 *  - timestamp is recorded for future analytics/grouping but not currently used.
 */
export interface Command {
  execute(): void
  undo(): void
  description: string
  timestamp: number
}

// Limits memory usage; 50 commands covers typical editing sessions comfortably.
const MAX_UNDO_DEPTH = 50

interface CommandState {
  undoStack: Command[]
  redoStack: Command[]
  canUndo: boolean
  canRedo: boolean
  pushCommand: (cmd: Command) => void
  undo: () => void
  redo: () => void
}

export const useCanvasCommands = create<CommandState>()((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  pushCommand: (cmd) => {
    set((state) => {
      const newStack = [...state.undoStack, cmd]
      if (newStack.length > MAX_UNDO_DEPTH) {
        newStack.shift()
      }
      return {
        undoStack: newStack,
        redoStack: [],
        canUndo: true,
        canRedo: false,
      }
    })
  },

  undo: () => {
    const { undoStack } = get()
    if (undoStack.length === 0) {
      console.warn('[useCanvasCommands] Undo called with empty stack')
      return
    }

    const cmd = undoStack[undoStack.length - 1]
    try {
      cmd.undo()
    } catch (err) {
      console.error('[useCanvasCommands] cmd.undo() threw:', {
        description: cmd.description,
        error: (err as Error).message,
        stack: (err as Error).stack,
      })
      return // Do not mutate stack on failure to avoid inconsistency
    }

    set((state) => {
      const newUndo = state.undoStack.slice(0, -1)
      const newRedo = [...state.redoStack, cmd]
      return {
        undoStack: newUndo,
        redoStack: newRedo,
        canUndo: newUndo.length > 0,
        canRedo: true,
      }
    })
  },

  redo: () => {
    const { redoStack } = get()
    if (redoStack.length === 0) {
      console.warn('[useCanvasCommands] Redo called with empty stack')
      return
    }

    const cmd = redoStack[redoStack.length - 1]
    try {
      cmd.execute()
    } catch (err) {
      console.error('[useCanvasCommands] cmd.execute() threw during redo:', {
        description: cmd.description,
        error: (err as Error).message,
        stack: (err as Error).stack,
      })
      return // Do not mutate stack on failure
    }

    set((state) => {
      const newRedo = state.redoStack.slice(0, -1)
      const newUndo = [...state.undoStack, cmd]
      return {
        undoStack: newUndo,
        redoStack: newRedo,
        canUndo: true,
        canRedo: newRedo.length > 0,
      }
    })
  },
}))
