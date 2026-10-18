import type {EditorManagerLike} from '../../editor/EditorManager'
import type {Backup} from './types/Backup'
export type OpenedBackup={backup:Backup;messageIndex?:number;messageCount?:number}
const opened=new WeakMap<EditorManagerLike,OpenedBackup>()
export function getOpenedBackup(editor:EditorManagerLike){return opened.get(editor)}
export function rememberOpenedBackup(editor:EditorManagerLike,value:OpenedBackup){opened.set(editor,value)}
