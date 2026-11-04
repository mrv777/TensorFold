import { useAuthoredText } from '../../lib/preferences/useAuthoredText'
import { useUiText } from '../../lib/preferences/hooks'
import { requestConversationSearch } from '../search/search-events'
import { useMemo, useRef, useState } from 'react'
import { useStore } from '../../lib/store'
import { api } from '../../lib/ipc'
import clsx from 'clsx'
import { Icon } from '../../lib/icons'
import type { Thread } from '../../lib/types'
import { Menu, MenuItem } from '../ui'
import { ThreadTrustBadge } from '../ThreadTrustBadge'
import { CortheonBadge } from '../CortheonBadge'
import { WorkActivityMenu } from '../work-activity/WorkActivityMenu'

export function ChatWorkspaceHeader({ title, thread }: { title: string; thread: Thread | null | undefined }) {
  const tx = useAuthoredText()
  const text = useUiText()
  const threads = useStore((state) => state.threads)
  const setView = useStore((state) => state.setView)
  const [creating, setCreating] = useState(false)
  const lock = useRef(false)
  const recent = useMemo(() => threads.filter((item) => item.kind === 'chat' && !item.archivedAt).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20), [threads])
  const newChat = async () => {
    if (lock.current) return
    lock.current = true; setCreating(true)
    try { await useStore.getState().newChat() }
    catch { useStore.getState().setNotice({ kind: 'error', message: tx("Could not open a chat. Your current work is still here; try New chat again.") }) }
    finally { lock.current = false; setCreating(false) }
  }
  const quiet = 'no-drag flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent'
  const iconButton = 'no-drag flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent'
  // One toolbar row, as in a native Mac window: the sidebar button opens the complete workspace,
  // the chat title is the recent-chats menu, and the rest are quiet destinations on the right.
  return <header aria-label={tx("Full chat navigation")} className="drag relative z-10 shrink-0 border-b border-line/60 bg-canvas">
    <nav aria-label={tx("Chat workspace")} className={clsx('flex h-12 items-center gap-1 pr-3', api.platform === 'linux' ? 'pl-3' : 'pl-[96px]')}>
      <button type="button" data-full-layout-switch aria-label={tx("Show sidebar")} title={tx("Show sidebar: projects, tasks and every tool")} onClick={() => useStore.getState().setFullWorkspaceLayout('workspace')} className={iconButton}><Icon name="sidebar" size={16} /></button>
      <button type="button" disabled={creating} aria-label={text('common.newChat')} title={text('common.newChat')} onClick={() => void newChat()} className={iconButton}><Icon name="edit" size={15} /></button>
      <Menu width={300} trigger={(open) => <button type="button" aria-expanded={open} aria-label={tx("Recent chats")} className="no-drag ml-1 flex h-8 min-w-0 max-w-[360px] items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"><span className="truncate">{title || "TensorFold"}</span><Icon name="chevronDown" size={12} className="shrink-0 text-ink-3" /></button>}>
        {(close) => <><div className="px-2.5 py-2 text-[12px] text-ink-2">{tx("Recent chats")}</div>{recent.length ? recent.map((item) => <MenuItem key={item.id} icon="message" active={thread?.id === item.id} onClick={() => { setView({ name: 'thread', id: item.id }); close() }}>{item.title || tx("Untitled chat")}{item.incognito ? tx(" · Not saved") : ''}</MenuItem>) : <p role="status" className="px-2.5 py-3 text-[13px] text-ink-2">{tx("No chats yet. Start one with New chat.")}</p>}<MenuItem icon="grid" onClick={() => { useStore.getState().setFullWorkspaceLayout('workspace'); close() }}>{tx("All conversations in workspace")}</MenuItem></>}
      </Menu>
      {thread && <ThreadTrustBadge thread={thread} />}
      {thread && <CortheonBadge thread={thread} />}
      <span className="flex-1" />
      <button type="button" className={quiet} onClick={() => setView({ name: 'models' })}>{tx("Models")}</button>
      <button type="button" className={quiet} onClick={() => setView({ name: 'bots' })}>{tx("Bots")}</button>
      <button type="button" aria-label={text('common.search')} title={text('common.search')} className={iconButton} onClick={() => requestConversationSearch({ scope: 'all' })}><Icon name="search" size={15} /></button>
      <div className="no-drag"><WorkActivityMenu variant="icon" /></div>
      <button type="button" aria-label={text('common.settings')} title={text('common.settings')} className={iconButton} onClick={() => setView({ name: 'settings', section: 'app' })}><Icon name="settings" size={15} /></button>
    </nav>
  </header>
}
