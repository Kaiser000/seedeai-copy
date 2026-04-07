import { InputPage } from '@/features/input/InputPage'
import { EditorPage } from '@/features/editor/EditorPage'
import { useEditorStore } from '@/features/editor/stores/useEditorStore'

function App() {
  const currentPage = useEditorStore((state) => state.currentPage)

  return currentPage === 'input' ? <InputPage /> : <EditorPage />
}

export default App
