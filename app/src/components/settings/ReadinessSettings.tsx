import { useAuthoredText } from '../../lib/preferences/useAuthoredText'
import { authoredText } from '../../lib/preferences/language-packs'
import { useStore as useLocaleStore } from '../../lib/store'
import { ALL_SETTINGS_SECTIONS, type SettingsSection } from './shared'
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { api } from '../../lib/ipc'
import { Icon } from '../../lib/icons'
import { buildReadinessDoctor, listReadinessProviderProbes, summarizeDoctor, type DoctorArea, type DoctorCheck, type DoctorStatus, type ProbeState, type RemoteSnapshotProbeValue } from '../../lib/readiness-doctor'
import type { ConnectorEvent, CliDefinition, CliToolStatus, ConnectorDefinition, PersistedProviderStatus, PersistenceFailure, Readiness, SecurityControlSnapshot, WebhookEndpoint } from '../../lib/types'
import { Button } from '../ui'
import { Section, SettingsPane, Spinner, type SettingsSectionContext } from './shared'

const AREA_LABELS: Record<DoctorArea, string> = {
  get models() { return authoredText(useLocaleStore.getState().settings?.uiPreferences?.locale, "Models") },
  get connectors() { return authoredText(useLocaleStore.getState().settings?.uiPreferences?.locale, "Connectors") },
  get remote() { return authoredText(useLocaleStore.getState().settings?.uiPreferences?.locale, "Remote") },
  get terminals() { return authoredText(useLocaleStore.getState().settings?.uiPreferences?.locale, "Terminals") },
  get security() { return authoredText(useLocaleStore.getState().settings?.uiPreferences?.locale, "Security") },
}

const AREA_ORDER: DoctorArea[] = ['models', 'remote', 'connectors', 'terminals', 'security']

const STATUS_META: Record<DoctorStatus, { label: string; dot: string }> = {
  ok: { get label() { return authoredText(useLocaleStore.getState().settings?.uiPreferences?.locale, "Ready") }, dot: 'bg-positive' },
  warning: { get label() { return authoredText(useLocaleStore.getState().settings?.uiPreferences?.locale, "Needs review") }, dot: 'bg-warn' },
  error: { get label() { return authoredText(useLocaleStore.getState().settings?.uiPreferences?.locale, "Not working") }, dot: 'bg-danger' },
  checking: { get label() { return authoredText(useLocaleStore.getState().settings?.uiPreferences?.locale, "Checking") }, dot: 'bg-ink-4' },
  off: { get label() { return authoredText(useLocaleStore.getState().settings?.uiPreferences?.locale, "Not set up") }, dot: 'bg-ink-5' },
}

function areaGroups(checks: DoctorCheck[]) {
  return AREA_ORDER.map((area) => ({ area, checks: checks.filter((check) => check.area === area) })).filter((group) => group.checks.length)
}

function statusDot(status: DoctorStatus) {
  const meta = STATUS_META[status]
  return status === 'checking'
    ? <span className="mt-1 flex w-3 shrink-0 justify-center"><Spinner size={11} /></span>
    : <span className="mt-[7px] flex w-3 shrink-0 justify-center" title={meta.label}><span className={clsx('size-1.5 rounded-full', meta.dot)} /></span>
}

export function ReadinessSettings({ ctx }: { ctx: SettingsSectionContext }) {
  const tx = useAuthoredText()
  const [providerReadiness, setProviderReadiness] = useState<Record<string, ProbeState<Readiness>>>({})
  const [localClis, setLocalClis] = useState<ProbeState<Array<CliDefinition | CliToolStatus>>>({ status: 'checking' })
  const [remoteProbes, setRemoteProbes] = useState<Record<string, ProbeState<RemoteSnapshotProbeValue>>>({})
  const [connectors, setConnectors] = useState<ProbeState<ConnectorDefinition[]>>({ status: 'checking' })
  const [connectorEvents, setConnectorEvents] = useState<ConnectorEvent[]>([])
  const [providerStatus, setProviderStatus] = useState<PersistedProviderStatus | null>(null)
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([])
  const [securityControls, setSecurityControls] = useState<SecurityControlSnapshot | null>(ctx.securityControls ?? null)
  const [persistenceFailure, setPersistenceFailure] = useState<PersistenceFailure | null>(ctx.securityControls?.lastPersistenceFailure ?? null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const providerEntries = useMemo(() => listReadinessProviderProbes(ctx.draft), [ctx.draft.providers, tx])
  const remoteHosts = ctx.draft.remoteOrchestrators ?? []

  useEffect(() => {
    api.getProviderStatus().then(setProviderStatus).catch(() => setProviderStatus(null))
    api.getWebhooks().then((snapshot) => setWebhooks(snapshot.endpoints)).catch(() => setWebhooks([]))
    api.getSecurityControls().then((snapshot) => {
      setSecurityControls(snapshot)
      setPersistenceFailure(snapshot.lastPersistenceFailure)
    }).catch(() => {})
  }, [refreshNonce])

  useEffect(() => {
    setSecurityControls(ctx.securityControls ?? null)
    setPersistenceFailure(ctx.securityControls?.lastPersistenceFailure ?? null)
  }, [ctx.securityControls])

  useEffect(() => api.onPersistenceFailure(setPersistenceFailure), [])

  useEffect(() => {
    let cancelled = false
    const initial = Object.fromEntries(providerEntries.map((entry) => [entry.key, { status: 'checking' as const }]))
    setProviderReadiness(initial)
    for (const entry of providerEntries) {
      api.getModelReadiness({ providerId: entry.providerId, accountId: entry.accountId })
        .then((value) => {
          if (cancelled) return
          setProviderReadiness((current) => ({ ...current, [entry.key]: { status: 'ok', value } }))
        })
        .catch((error) => {
          if (cancelled) return
          setProviderReadiness((current) => ({ ...current, [entry.key]: { status: 'error', message: String(error?.message ?? error) } }))
        })
    }
    return () => { cancelled = true }
  }, [providerEntries, refreshNonce])

  useEffect(() => {
    let cancelled = false
    setLocalClis({ status: 'checking' })
    // Probed statuses (installed/version) let the doctor prove each launcher distinctly; the
    // plain registry fallback still renders entries as 'not probed yet' rather than hiding them.
    api.listCliTools()
      .then((value) => { if (!cancelled) setLocalClis({ status: 'ok', value }) })
      .catch(() => api.listClis()
        .then((value) => { if (!cancelled) setLocalClis({ status: 'ok', value }) })
        .catch((error) => { if (!cancelled) setLocalClis({ status: 'error', message: String(error?.message ?? error) }) }))
    return () => { cancelled = true }
  }, [refreshNonce])

  useEffect(() => {
    let cancelled = false
    setConnectors({ status: 'checking' })
    api.getAssistantSnapshot()
      .then((snapshot) => { if (!cancelled) { setConnectors({ status: 'ok', value: snapshot.connectors }); setConnectorEvents(snapshot.events ?? []) } })
      .catch((error) => { if (!cancelled) setConnectors({ status: 'error', message: String(error?.message ?? error) }) })
    return () => { cancelled = true }
  }, [refreshNonce])

  useEffect(() => {
    let cancelled = false
    const enabled = remoteHosts.filter((host) => host.enabled && host.serverUrl?.trim() && host.authToken?.trim())
    setRemoteProbes(Object.fromEntries(enabled.map((host) => [host.id, { status: 'checking' as const }])))
    for (const host of enabled) {
      api.getRemoteSnapshot(host.id)
        .then((value) => { if (!cancelled) setRemoteProbes((current) => ({ ...current, [host.id]: { status: value.ok === false ? 'error' : 'ok', value } })) })
        .catch((error) => { if (!cancelled) setRemoteProbes((current) => ({ ...current, [host.id]: { status: 'error', message: String(error?.message ?? error) } })) })
    }
    return () => { cancelled = true }
  }, [remoteHosts, refreshNonce])

  const checks = useMemo(() => buildReadinessDoctor({
    settings: ctx.draft,
    providerReadiness,
    providerStatus,
    localClis,
    remoteProbes,
    studioRemote: ctx.studioStatus,
    connectors,
    connectorEvents,
    webhooks,
    persistenceFailure,
    securityControls,
  }), [ctx.draft, providerReadiness, providerStatus, localClis, remoteProbes, ctx.studioStatus, connectors, connectorEvents, webhooks, persistenceFailure, securityControls, tx])
  const summary = summarizeDoctor(checks)
  const problems = checks.filter((check) => check.status === 'error' || check.status === 'warning')
  const passing = checks.filter((check) => check.status === 'ok' || check.status === 'checking')
  const notSetUp = checks.filter((check) => check.status === 'off')
  const [showPassing, setShowPassing] = useState(false)
  const [showNotSetUp, setShowNotSetUp] = useState(false)

  const jump = (section?: string) => {
    if (section && ALL_SETTINGS_SECTIONS.some((item) => item.id === section)) ctx.goToSection(section as SettingsSection)
  }

  return (
    <SettingsPane>
      <Section title={tx("Readiness")} desc={tx("Checks for the models, connections and tools you use.")}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[14px] text-ink">
            <span className={clsx('size-2 shrink-0 rounded-full', problems.length ? (summary.error ? 'bg-danger' : 'bg-warn') : summary.checking ? 'bg-ink-4' : 'bg-positive')} />
            {problems.length
              ? (problems.length === 1 ? tx("1 thing needs your attention.") : tx("{value0} things need your attention.", { value0: problems.length }))
              : summary.checking ? tx("Checking…") : tx("Everything you use is working.")}
          </div>
          <Button variant="ghost" size="sm" icon="refresh" onClick={() => setRefreshNonce((value) => value + 1)}>{tx("Check again")}</Button>
        </div>
        {problems.length > 0 && <CheckList checks={problems} jump={jump} />}
        {passing.length > 0 && (
          <div className="mt-4">
            <button type="button" onClick={() => setShowPassing((value) => !value)} aria-expanded={showPassing} className="flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink-2">
              <Icon name={showPassing ? 'chevronDown' : 'chevronRight'} size={12} />
              {(passing.length === 1 ? tx("1 check passing") : tx("{value0} checks passing", { value0: passing.length }))}
            </button>
            {showPassing && <div className="mt-2"><CheckList checks={passing} jump={jump} /></div>}
          </div>
        )}
        {notSetUp.length > 0 && (
          <div className="mt-2">
            <button type="button" onClick={() => setShowNotSetUp((value) => !value)} aria-expanded={showNotSetUp} className="flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink-2">
              <Icon name={showNotSetUp ? 'chevronDown' : 'chevronRight'} size={12} />
              {(notSetUp.length === 1 ? tx("1 optional feature not set up") : tx("{value0} optional features not set up", { value0: notSetUp.length }))}
            </button>
            {showNotSetUp && <div className="mt-2"><CheckList checks={notSetUp} jump={jump} /></div>}
          </div>
        )}
      </Section>
    </SettingsPane>
  )
}

function CheckList({ checks, jump }: { checks: DoctorCheck[]; jump: (section?: string) => void }) {
  return (
    <div className="space-y-4">
      {areaGroups(checks).map((group) => (
        <div key={group.area}>
          <div className="mb-1 text-[12px] font-medium text-ink-3">{AREA_LABELS[group.area]}</div>
          <div className="divide-y divide-line">
            {group.checks.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 py-2.5">
                {statusDot(item.status)}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-ink">{item.title}</div>
                  <div className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{item.detail}</div>
                </div>
                {item.section && item.action && (
                  <Button variant="ghost" size="sm" onClick={() => jump(item.section)}>{item.action}</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
