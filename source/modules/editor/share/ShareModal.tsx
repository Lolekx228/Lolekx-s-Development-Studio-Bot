import React, { useEffect, useState } from "react"
import { copyTextToClipboard } from "../../../common/dom/copyTextToClipboard"
import { PrimaryButton } from "../../../common/input/button/PrimaryButton"
import { SecondaryButton } from "../../../common/input/button/SecondaryButton"
import { ModalAction } from "../../../common/modal/layout/ModalAction"
import { ModalBody } from "../../../common/modal/layout/ModalBody"
import { ModalContainer } from "../../../common/modal/layout/ModalContainer"
import { ModalFooter } from "../../../common/modal/layout/ModalFooter"
import { ModalHeader } from "../../../common/modal/layout/ModalHeader"
import { ModalTitle } from "../../../common/modal/layout/ModalTitle"
import { ModalContext } from "../../../common/modal/ModalContext"
import { useRequiredContext } from "../../../common/state/useRequiredContext"
import type { ShortenResponse } from "../../../common/utilities/shorten"
import { remove } from "../../../icons/remove"
import { Markdown } from "../../markdown/Markdown"
import type { EditorManagerLike } from "../EditorManager"
import { getEditorUrl } from "../getEditorUrl"

export type ShareModalProps = {
  editorManager: EditorManagerLike
}

export function ShareModal(props: ShareModalProps) {
  const { editorManager } = props

  const modal = useRequiredContext(ModalContext)

  const [response, setResponse] = useState<ShortenResponse | null>()

  useEffect(() => {
    const url = getEditorUrl(editorManager)

    setResponse({ id: "local", url, expires: new Date(8640000000000000) })
  }, [editorManager])

  let content = "Getting short URL..."
  if (response) {
    const formattedExpires = response.expires.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    })

    content = `URL: <${response.url}>\nThis link contains your message. It does not expire.`
  } else if (response === null) {
    content = "Failed getting short URL. Please try again later."
  }

  return (
    <ModalContainer>
      <ModalHeader>
        <ModalTitle>Share</ModalTitle>
        <ModalAction
          icon={remove}
          label="Close"
          onClick={() => modal.dismiss()}
        />
      </ModalHeader>
      <ModalBody>
        <Markdown content={content} />
      </ModalBody>
      <ModalFooter>
        <SecondaryButton
          disabled={!response}
          onClick={() => {
            copyTextToClipboard(response?.url ?? "")
          }}
        >
          Copy Link
        </SecondaryButton>
        <PrimaryButton
          onClick={() => {
            modal.dismiss()
          }}
        >
          Close
        </PrimaryButton>
      </ModalFooter>
    </ModalContainer>
  )
}
