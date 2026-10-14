import type { SnapshotIn } from 'mobx-state-tree'
import type { EditorManager } from './EditorManager'
export const DEFAULT_EDITOR_MANAGER_STATE: SnapshotIn<typeof EditorManager> = {
  messages: [{ content: 'Добро пожаловать в **LDS Studio**!\nНажми Clear All, чтобы начать новое сообщение.',
    embeds: [{ title: 'Твоё сообщение', description: 'Добавь заголовок, текст, поля и изображения. Предпросмотр обновится сразу.', color: { hue: 235, saturation: 0.6, value: 0.95 } }] }], targets: [{}],
}
