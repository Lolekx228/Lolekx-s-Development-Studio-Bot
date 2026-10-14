import { useObserver } from "mobx-react-lite"
import React, { useRef, useState } from "react"
import { PrimaryButton } from "../../../../common/input/button/PrimaryButton"
import { SecondaryButton } from "../../../../common/input/button/SecondaryButton"
import { ModalAction } from "../../../../common/modal/layout/ModalAction"
import { ModalBody } from "../../../../common/modal/layout/ModalBody"
import { ModalContainer } from "../../../../common/modal/layout/ModalContainer"
import { ModalFooter } from "../../../../common/modal/layout/ModalFooter"
import { ModalHeader } from "../../../../common/modal/layout/ModalHeader"
import { ModalTitle } from "../../../../common/modal/layout/ModalTitle"
import { ModalContext } from "../../../../common/modal/ModalContext"
import { useLazyValue } from "../../../../common/state/useLazyValue"
import { useRequiredContext } from "../../../../common/state/useRequiredContext"
import { remove } from "../../../../icons/remove"
import type { EditorManagerLike } from "../../../editor/EditorManager"
import { DatabaseManager } from "../../DatabaseManager"
import { DatabaseManagerProvider } from "../../DatabaseManagerContext"
import { PersistentStorageWarning } from "../../persist/PersistentStorageWarning"
import { BackupManager } from "../BackupManager"
import { BackupManagerProvider } from "../BackupManagerContext"
import { BackupCreationControls } from "./BackupCreationControls"
import { BackupList } from "./BackupList"

export type BackupsModalProps = {
  editorManager: EditorManagerLike
}

export function BackupsModal(props: BackupsModalProps) {
  const { editorManager } = props

  const databaseManager = useLazyValue(() => new DatabaseManager())
  const backupManager = useLazyValue(
    () => new BackupManager(databaseManager, editorManager),
  )

  const modal = useRequiredContext(ModalContext)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importStatus,setImportStatus]=useState('')
  const [pastedJson,setPastedJson]=useState('')

  return useObserver(() => (
    <DatabaseManagerProvider value={databaseManager}>
      <BackupManagerProvider value={backupManager}>
        <ModalContainer>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={async event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                try{await backupManager.importBackups(file);setImportStatus('Бекапы импортированы. Нажмите Load у нужного. Components V2 откроются в отдельном редакторе.')}catch(error){setImportStatus((error as Error).message)}
              } else setImportStatus('Файл не выбран. Можно вставить содержимое JSON ниже.')
            }}
          />
          <ModalHeader>
            <ModalTitle>Backups</ModalTitle>
            <ModalAction
              icon={remove}
              label="Close"
              onClick={() => modal.dismiss()}
            />
          </ModalHeader>
          {databaseManager.shouldShowPersistenceWarning && (
            <ModalBody>
              <PersistentStorageWarning />
            </ModalBody>
          )}
          <ModalBody>
            {importStatus && <p role="status" aria-live="polite">{importStatus}</p>}
            <BackupList />
          </ModalBody>
          <ModalBody>
            <BackupCreationControls />
            <details><summary>Вставить JSON бекапов</summary><textarea aria-label="JSON бекапов" value={pastedJson} onChange={event=>setPastedJson(event.target.value)} rows={6} style={{width:'100%',boxSizing:'border-box'}}/><SecondaryButton onClick={async()=>{try{await backupManager.importBackups(new Blob([pastedJson],{type:'application/json'}));setImportStatus('Бекапы импортированы. Нажмите Load у нужного.');setPastedJson('')}catch(error){setImportStatus((error as Error).message)}}}>Импортировать JSON</SecondaryButton></details>
          </ModalBody>
          <ModalFooter>
            <SecondaryButton onClick={async () => backupManager.exportAll()}>
              Export All
            </SecondaryButton>
            <SecondaryButton onClick={() => fileInputRef.current?.click()}>
              Import
            </SecondaryButton>
            <PrimaryButton onClick={() => modal.dismiss()}>Close</PrimaryButton>
          </ModalFooter>
        </ModalContainer>
      </BackupManagerProvider>
    </DatabaseManagerProvider>
  ))
}
