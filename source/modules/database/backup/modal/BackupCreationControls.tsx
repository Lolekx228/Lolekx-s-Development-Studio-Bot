import { useObserver } from "mobx-react-lite"
import React, { useState } from "react"
import { PrimaryButton } from "../../../../common/input/button/PrimaryButton"
import { InputField } from "../../../../common/input/text/InputField"
import { useRequiredContext } from "../../../../common/state/useRequiredContext"
import { BackupManagerContext } from "../BackupManagerContext"

export function BackupCreationControls() {
  const backupManager = useRequiredContext(BackupManagerContext)

  const [editedName, setBackupName] = useState<string | null>(null)
  const [status, setStatus] = useState("")

  return useObserver(() => {
    const backupName = editedName ?? backupManager.activeName
    return (
    <><InputField
      id="backup-name"
      value={backupName}
      onChange={setBackupName}
      label="Backup name"
    >
      <PrimaryButton
        disabled={backupName.trim().length === 0}
        onClick={async () => {
          try {
            await backupManager.saveBackup(backupName.trim())
            setBackupName(null)
            setStatus('Сохранено: ' + backupName.trim())
          } catch(error) { setStatus((error as Error).message) }
        }}
      >
        {backupManager.backups.some(backup => backup.name === backupName.trim())
          ? "Overwrite"
          : "Save"}
      </PrimaryButton>
    </InputField><p role="status" aria-live="polite">{status}</p></>
    )
  })
}
