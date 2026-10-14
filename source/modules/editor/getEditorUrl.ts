import { base64UrlEncode } from "../../common/base64/base64UrlEncode"
import type { EditorManagerLike } from "./EditorManager"

export const getEditorUrl = (manager: EditorManagerLike) => {
  const messages = manager.messages.map(message => ({
    data: message.data,
  }))

  const json = JSON.stringify({ messages })
  const base64 = base64UrlEncode(json)

  return String(new URL(`${typeof location !== "undefined" ? location.origin + location.pathname : "https://lolekx228.github.io/Lolekx-s-Development-Studio-Bot/"}?data=${base64}`))
}
