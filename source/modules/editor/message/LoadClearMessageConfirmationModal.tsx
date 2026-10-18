import React, { useState } from "react"
import { PrimaryButton } from "../../../common/input/button/PrimaryButton"
import { SecondaryButton } from "../../../common/input/button/SecondaryButton"
import { InputError } from "../../../common/input/error/InputError"
import { ModalAction } from "../../../common/modal/layout/ModalAction"
import { ModalBody } from "../../../common/modal/layout/ModalBody"
import { ModalContainer } from "../../../common/modal/layout/ModalContainer"
import { ModalFooter } from "../../../common/modal/layout/ModalFooter"
import { ModalHeader } from "../../../common/modal/layout/ModalHeader"
import { ModalTitle } from "../../../common/modal/layout/ModalTitle"
import { ModalContext } from "../../../common/modal/ModalContext"
import { useRequiredContext } from "../../../common/state/useRequiredContext"
import { remove } from "../../../icons/remove"
import { Markdown } from "../../markdown/Markdown"
import { messageOf } from "../../message/helpers/messageOf"
import type { MessageData } from '../../message/state/data/MessageData'
import type { MessageLike } from "../../message/state/models/MessageModel"
import type { EditorManagerLike } from "../EditorManager"

export type LoadClearMessageConfirmationModalProps = {
  loadMessage?: (reference:string)=>Promise<{data:MessageData;reference:string}>
  editorManager: EditorManagerLike
  message: MessageLike
}

export function LoadClearMessageConfirmationModal(
  props: LoadClearMessageConfirmationModalProps,
) {
  const { editorManager, message } = props

  const modal = useRequiredContext(ModalContext)

  const [error, setError] = useState<string | undefined>()

  return (
    <ModalContainer>
      <ModalHeader>
        <ModalTitle>Clear & Load Message</ModalTitle>
        <ModalAction
          icon={remove}
          label="Close"
          onClick={() => modal.dismiss()}
        />
      </ModalHeader>
      <ModalBody>
        <Markdown
          content={
            "Loading a message link will remove all content from the current editor, if any." +
            " Are you sure you want to continue? This action cannot be reverted."
          }
        />
        <InputError error={error} />
      </ModalBody>
      <ModalFooter>
        <SecondaryButton onClick={() => modal.dismiss()}>
          Cancel
        </SecondaryButton>
        <PrimaryButton
          onClick={async () => {
            let data,reference=message.reference
            try {
              if(props.loadMessage){const result=await props.loadMessage(message.reference);data=result.data;reference=result.reference}else data = await editorManager.getMessage(message.reference)
            } catch(error) {
              setError((error as Error).message);return
            }
            if (!data) {
              setError(
                "The message link could not be loaded. Make sure a correct webhook URL is provided.",
              )
              return
            }

            if(((data.flags||0)&32768)||data.components?.some((item:any)=>item.type!==1)){
              sessionStorage.setItem('lds-v2-backup-import',JSON.stringify({version:8,backups:[{name:'Loaded message',messages:[{data,reference}],targets:editorManager.targets.map(target=>({url:target.url}))}]}))
              location.assign(process.env.NEXT_PUBLIC_BASE_PATH+'/components/')
              return
            }
            const newMessage = messageOf(data)
            newMessage.reference = reference

            const index = editorManager.messages.indexOf(message)
            const messages = [...editorManager.messages]
            messages.splice(index, 1, newMessage as MessageLike)
            editorManager.set("messages", messages)

            modal.dismiss()
          }}
        >
          Load
        </PrimaryButton>
      </ModalFooter>
    </ModalContainer>
  )
}
