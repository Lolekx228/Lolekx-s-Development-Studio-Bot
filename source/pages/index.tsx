import { useObserver } from "mobx-react-lite"
import { applySnapshot, destroy, getSnapshot, SnapshotOut } from "mobx-state-tree"
import type { GetServerSidePropsContext } from "next"
import React, { useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { base64UrlEncode } from "../common/base64/base64UrlEncode"
import { ModalManagerContext } from "../common/modal/ModalManagerContext"
import { Footer } from "../common/page/Footer"
import { Header } from "../common/page/Header"
import { PageHead } from "../common/page/PageHead"
import { PreferencesModal } from "../common/settings/PreferencesModal"
import { useAutorun } from "../common/state/useAutorun"
import { useLazyValue } from "../common/state/useLazyValue"
import { useRequiredContext } from "../common/state/useRequiredContext"
import { timeout } from "../common/utilities/timeout"
import { Editor } from "../modules/editor/Editor"
import { EditorManager } from "../modules/editor/EditorManager"
import { EditorManagerProvider } from "../modules/editor/EditorManagerContext"
import { getEditorManagerFromQuery } from "../modules/editor/getEditorManagerFromQuery"
import { Preview } from "../modules/message/preview/Preview"
import { BotAccountProvider, AccountButton } from '../modules/editor/bot/BotAccount'
import {messageOf} from '../modules/message/helpers/messageOf'
import {rememberOpenedBackup} from '../modules/database/backup/openedBackup'
import backupFormat from '../modules/database/backup/format'

const Container = styled.div`
  display: flex;
  flex-direction: column;

  height: 100%;
`

const View = styled.main.attrs({ translate: "no" })`
  max-height: calc(100% - 48px);

  display: flex;
  flex-direction: row-reverse;
  align-items: stretch;

  flex: 1;

  & > * {
    flex: 1;
    height: 100%;
    overflow-y: scroll;
  }
`

export type MainProps = {
  state: SnapshotOut<typeof EditorManager>
  mobile: boolean
}

export default function Main(props: MainProps) {
  const { state } = props
  const [mobile, setMobile] = useState(false)
  const [bridgeMode,setBridgeMode]=useState<'bot'|'webhook'>('bot')

  const editorManager = useLazyValue(() => EditorManager.create(state))
  useEffect(() => () => destroy(editorManager), [editorManager])

  useEffect(() => {
    const restored = getEditorManagerFromQuery(Object.fromEntries(new URLSearchParams(location.search)))
    applySnapshot(editorManager, getSnapshot(restored)); destroy(restored)
    const transfer=sessionStorage.getItem('lds-classic-editor-import')
    if(transfer){
      try{
        const value=JSON.parse(transfer)
        if(!Array.isArray(value.messages)||!value.messages.length||value.messages.some((item:any)=>!item.data||backupFormat.isV2(item.data)))throw Error('Неверный формат классического сообщения.')
        editorManager.set('messages',value.messages.map((item:any)=>({...messageOf(item.data),reference:item.reference||''})))
        editorManager.set('targets',value.targets||[])
        if(value.openedBackup){backupFormat.parseModern({version:8,backups:[value.openedBackup.backup]});rememberOpenedBackup(editorManager,value.openedBackup)}
        if(value.deliveryMode==='webhook')setBridgeMode('webhook')
      }catch{console.warn('Не удалось открыть сообщение в классическом редакторе. Исходный бекап остаётся в библиотеке.')}
      finally{sessionStorage.removeItem('lds-classic-editor-import')}
    }
    const query = window.matchMedia('(max-width: 700px)')
    const resize = () => setMobile(query.matches)
    resize(); query.addEventListener('change', resize)
    return () => query.removeEventListener('change', resize)
  }, [editorManager])
  const cancelRef = useRef<() => void>()
  useAutorun(() => {
    const messages = editorManager.messages.map(message => ({
      data: message.data,
    }))

    cancelRef.current?.()
    cancelRef.current = timeout(() => {
      const json = JSON.stringify({ messages })
      const base64 = base64UrlEncode(json)

      history.replaceState({ __N: false }, "", `${location.pathname}?data=${base64}`)
    }, 500)
  })

  const [activeTab, setActiveTab] = useState<"Preview" | "Editor">("Editor")

  const modalManager = useRequiredContext(ModalManagerContext)
  const spawnSettingsModal = () =>
    modalManager.spawn({ render: () => <PreferencesModal /> })

  return useObserver(() => (
    <EditorManagerProvider value={editorManager}>
      <BotAccountProvider initialMode={bridgeMode}>
      <PageHead
        title="LDS Studio"
        description="Discord message editor."
      >
        <meta key="referrer" name="referrer" content="strict-origin" />
      </PageHead>
      <Container>
        <Header
          account={<AccountButton />}
          items={[
            { name: "Components V2", to: `${process.env.NEXT_PUBLIC_BASE_PATH}/components/`, newWindow: true },
            { name: "Source Code", to: "https://github.com/Lolekx228/Lolekx-s-Development-Studio-Bot", newWindow: true },
            { name: "Settings", handler: spawnSettingsModal },
          ]}
          tabs={
            mobile
              ? {
                  items: ["Editor", "Preview"],
                  current: activeTab,
                  onChange: setActiveTab,
                }
              : undefined
          }
        />
        <View>
          {(!mobile || activeTab === "Preview") && (
            <div>
              <Preview />
            </div>
          )}
          {(!mobile || activeTab === "Editor") && (
            <div>
              <Editor />
              <Footer />
            </div>
          )}
        </View>
      </Container>
      </BotAccountProvider>
    </EditorManagerProvider>
  ))
}

export const getStaticProps = () => ({ props: {
  state: getSnapshot(getEditorManagerFromQuery({})), mobile: false,
} })
