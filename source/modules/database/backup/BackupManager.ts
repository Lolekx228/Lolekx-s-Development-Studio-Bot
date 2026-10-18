/* eslint-disable no-await-in-loop */

import { observable, runInAction } from "mobx"
import { downloadBlob } from "../../../common/dom/downloadBlob"
import { toSnakeCase } from "../../../common/object/toSnakeCase"
import type { EditorManagerLike } from "../../editor/EditorManager"
import { messageOf } from "../../message/helpers/messageOf"
import type { MessageData } from "../../message/state/data/MessageData"
import type { DatabaseManager } from "../DatabaseManager"
import type { Backup } from "./types/Backup"
import type { BackupData } from "./types/BackupData"
import type { ExportData } from "./types/ExportData"
import backupFormat from './format'
import {getOpenedBackup,rememberOpenedBackup} from './openedBackup'

export class BackupManager {
  private readonly databaseManager: DatabaseManager
  private readonly editorManager: EditorManagerLike

  @observable backups: BackupData[] = []
  @observable activeName = ""

  constructor(
    databaseManager: DatabaseManager,
    editorManager: EditorManagerLike,
  ) {
    this.databaseManager = databaseManager
    this.editorManager = editorManager
    this.activeName = getOpenedBackup(editorManager)?.backup.name || ""

    databaseManager.initialized
      .then(async () => {
        await this.loadBackupList()
      })
      .catch(() => {})
  }

  private async loadBackupList() {
    const backups: BackupData[] = []

    let cursor = await this.databaseManager.database
      .transaction("backup")
      .objectStore("backup")
      .index("name")
      .openKeyCursor()

    while (cursor) {
      backups.push({
        id: cursor.primaryKey,
        name: cursor.key,
      })

      cursor = await cursor.continue()
    }

    runInAction(() => {
      this.backups = backups
    })
  }

  private async getId(name: string) {
    return this.databaseManager.database
      .transaction("backup")
      .objectStore("backup")
      .index("name")
      .getKey(name)
  }

  async loadBackup(name: string) {
    const backup = await this.databaseManager.database
      .transaction("backup")
      .objectStore("backup")
      .index("name")
      .get(name)

    if (!backup) return

    this.activeName = backup.name
    rememberOpenedBackup(this.editorManager,{backup})

    if (backup.messages.some(message => backupFormat.isV2(message.data))) {
      sessionStorage.setItem('lds-v2-backup-import', JSON.stringify({version:8,backups:[backup]}))
      location.assign(process.env.NEXT_PUBLIC_BASE_PATH + '/components/')
      return
    }

    this.editorManager.set(
      "messages",
      backup.messages.map(({ data, ...message }) => ({
        ...messageOf(data),
        ...message,
      })),
    )
    this.editorManager.set("targets", backup.targets)
    for (const target of this.editorManager.targets) {
      target.fetch().catch(() => {})
    }
  }

  async saveBackup(backup: string | Backup) {
    const fromEditor = typeof backup === "string"
    if (typeof backup === "string") {
      const name = backup
      const id = await this.getId(backup)

      backup = {
        id,
        name: backup,
        messages: this.editorManager.messages.map(message => ({
          data: {
            ...message.data,
            files: undefined,
          },
          reference: message.reference,
        })),
        targets: this.editorManager.targets.map(target => ({
          url: target.url,
        })),
      }
      const opened=getOpenedBackup(this.editorManager)
      if(opened?.backup.name===name && opened.messageIndex!==undefined){
        const previous=await this.databaseManager.database.transaction('backup').objectStore('backup').index('name').get(name)
        if(previous && opened.backup.id!==undefined && previous.id!==opened.backup.id)throw Error('Бекап изменился. Откройте его заново.')
        const preserved=JSON.parse(JSON.stringify(previous||opened.backup)) as Backup
        if(opened.messageIndex<0 || opened.messageIndex>=preserved.messages.length)throw Error('Сообщение удалено из бекапа. Откройте его заново.')
        preserved.messages.splice(opened.messageIndex,opened.messageCount||1,...backup.messages)
        backup={...preserved,id,name,targets:backup.targets.map((target,index)=>({...preserved.targets[index],...target}))}
      }
    } else {
      backup = {
        ...backup,
        id: await this.getId(backup.name),
      }
    }

    if (!backup.id) delete backup.id

    await this.databaseManager.database
      .transaction("backup", "readwrite")
      .objectStore("backup")
      .put(backup)

    await this.loadBackupList()
    if (fromEditor) {
      this.activeName = backup.name
      const opened=getOpenedBackup(this.editorManager)
      rememberOpenedBackup(this.editorManager,{backup,messageIndex:opened?.backup.name===backup.name?opened.messageIndex:undefined,messageCount:this.editorManager.messages.length})
    }
  }

  async deleteBackup(name: string) {
    const id = await this.getId(name)
    if (!id) return

    await this.databaseManager.database
      .transaction("backup", "readwrite")
      .objectStore("backup")
      .delete(id)

    await this.loadBackupList()
  }

  async exportBackup(name: string) {
    const backup = await this.databaseManager.database
      .transaction("backup")
      .objectStore("backup")
      .index("name")
      .get(name)

    if (!backup) return

    const backupData: ExportData = {
      version: 8,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      backups: [backup].map(({ id, ...backup }) => backup),
    }

    const blob = new Blob([JSON.stringify(backupData, undefined, 2), "\n"], {
      type: "application/json",
    })

    downloadBlob(blob, `${name}.json`)
  }

  async exportAll() {
    const backups: Backup[] = []

    let cursor = await this.databaseManager.database
      .transaction("backup")
      .objectStore("backup")
      .openCursor()

    while (cursor) {
      backups.push({
        ...cursor.value,
        id: undefined,
      })

      cursor = await cursor.continue()
    }

    const backupData: ExportData = {
      version: 8,
      backups,
    }

    const blob = new Blob([JSON.stringify(backupData, undefined, 2), "\n"], {
      type: "application/json",
    })

    downloadBlob(blob, "backups.json")
  }

  private async getSafeBackupName(name: string) {
    if (!(await this.getId(name))) {
      return name
    }

    for (let number = 1; true; number++) {
      const proposedName = `${name} (${number})`

      if (!(await this.getId(proposedName))) {
        return proposedName
      }
    }
  }

  async importBackups(blob: Blob) {
    if(blob.size>10*1024*1024)throw Error('Файл бекапов слишком большой (максимум 10 МБ).')
    let exportData = JSON.parse(await blob.text()) as ExportData

    if(exportData.version === 7 || exportData.version === 8){
      const backups=backupFormat.parseModern(exportData)
      await this.databaseManager.initialized
      for(const backup of backups)await this.saveBackup({...backup,name:await this.getSafeBackupName(backup.name),id:undefined})
      return backups.length
    }
    if(![1,2,3,4,5,6].includes(exportData.version))throw Error('Неизвестная версия бекапа. Поддерживаются версии 1–8.')

    switch (exportData.version) {
      case 1:
      case 2: {
        exportData = {
          version: 3,
          backups: [
            {
              name: exportData.name,
              message: toSnakeCase(exportData.message) as MessageData,
            },
          ],
        }
      }
      // falls through
      case 3: {
        exportData = {
          version: 4,
          backups: exportData.backups.map(({ message, ...backup }) => ({
            ...backup,
            messages: [message],
          })),
        }
      }
      // falls through
      case 4:
        exportData = {
          version: 5,
          backups: exportData.backups.map(({ webhookUrl, ...backup }) => ({
            ...backup,
            target: {
              url: webhookUrl,
            },
          })),
        }
      // falls through
      case 5:
        exportData = {
          version: 6,
          backups: exportData.backups.map(
            ({ messages, target, ...backup }) => ({
              ...backup,
              messages: messages.map(data => ({
                data,
                reference: target.message,
              })),
              target: {
                url: target.url,
              },
            }),
          ),
        }
      // falls through
      case 6:
        exportData = {
          version: 7,
          backups: exportData.backups.map(({ target, ...backup }) => ({
            ...backup,
            targets: [{ url: target.url ?? "" }],
          })),
        }
      // falls through
        for (const backup of exportData.backups) {
          await this.saveBackup({
            ...backup,
            name: await this.getSafeBackupName(backup.name),
            id: undefined,
          })
        }
    }
  }
}
