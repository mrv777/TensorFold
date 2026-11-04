import { useAuthoredText } from '../../../lib/preferences/useAuthoredText'
import type { DoctorSummary } from '../../../lib/readiness-doctor'
import type { Automation } from '../../../lib/types'
import { CommandStatusSummary, Metric } from '../ui'
import { scheduleTime } from '../brief'
import type {
  AttentionRow,
  CommandStatusSummary as CommandStatusSummaryModel,
  ConnectorHealthSignal,
  LiveJob,
  RunningWorkSummary,
  Tone,
} from '../model'

interface StatusMetricsProps {
  statusSummary: CommandStatusSummaryModel
  statusExpanded: boolean
  toggleStatusExpanded: () => void
  attentionRows: AttentionRow[]
  unreadSignals: number
  pendingApprovals: number
  liveJobs: LiveJob[]
  runningWorkSummary: RunningWorkSummary
  connectedCount: number
  connectorRows: { length: number }
  connectorActionCount: number
  gapCount: number
  connectorHealthRows: Array<{ connector: unknown; health: ConnectorHealthSignal }>
  nextBrief: number | null
  primaryBrief: Automation | null
  missionRows: { length: number }
  activeMissions: number
  readinessSummary: DoctorSummary
  readinessTone: Tone
}

export function StatusMetrics(props: StatusMetricsProps) {
  const tx = useAuthoredText()
  const {
    statusSummary,
    statusExpanded,
    toggleStatusExpanded,
    attentionRows,
    unreadSignals,
    pendingApprovals,
    liveJobs,
    runningWorkSummary,
    connectedCount,
    connectorRows,
    connectorActionCount,
    gapCount,
    connectorHealthRows,
    nextBrief,
    primaryBrief,
    missionRows,
    activeMissions,
    readinessSummary,
    readinessTone,
  } = props
  const blockedJobs = runningWorkSummary.statusCounts.stalled + runningWorkSummary.statusCounts.failed + runningWorkSummary.statusCounts.dead_letter
  // Only what has something to say: a wall of zero tiles reads as noise, not reassurance.
  const metrics = [
    { show: attentionRows.length > 0, node: <Metric icon="bell" label={tx("Attention")} value={String(attentionRows.length)} detail={`${unreadSignals} unread signals`} tone={attentionRows.some((r) => r.tone === 'critical') ? 'critical' : 'normal'} key='attention' /> },
    { show: pendingApprovals > 0, node: <Metric icon="shield" label={tx("Approvals")} value={String(pendingApprovals)} detail={pendingApprovals ? 'Waiting on you' : 'Queue clear'} tone={pendingApprovals ? 'high' : 'good'} key='approvals' /> },
    { show: liveJobs.length > 0 || blockedJobs > 0, node: <Metric icon="terminal" label={tx("Live Jobs")} value={String(liveJobs.length)} detail={`${runningWorkSummary.statusCounts.queued} queued / ${runningWorkSummary.statusCounts.stalled + runningWorkSummary.statusCounts.failed + runningWorkSummary.statusCounts.dead_letter} blocked`} tone={runningWorkSummary.statusCounts.failed || runningWorkSummary.statusCounts.dead_letter ? 'critical' : runningWorkSummary.statusCounts.stalled ? 'high' : liveJobs.length ? 'normal' : 'good'} key='jobs' /> },
    { show: connectorActionCount > 0 || connectorHealthRows.some((row) => row.health.tone === 'critical'), node: <Metric icon="plug" label={tx("Connectors")} value={`${connectedCount}/${connectorRows.length || 0}`} detail={connectorActionCount ? `${connectorActionCount} actions` : `${gapCount} gaps`} tone={connectorHealthRows.some((row) => row.health.tone === 'critical') ? 'critical' : connectorActionCount ? 'high' : gapCount ? 'high' : 'good'} key='connectors' /> },
    { show: nextBrief != null, node: <Metric icon="clock" label={tx("Next Brief")} value={nextBrief ? scheduleTime(nextBrief) : 'None'} detail={primaryBrief?.name ?? 'No daily run'} tone={nextBrief ? 'normal' : 'low'} key='brief' /> },
    { show: activeMissions > 0, node: <Metric icon="spark" label={tx("Missions")} value={String(activeMissions)} detail={`${missionRows.length} total`} tone={activeMissions ? 'normal' : 'low'} key='missions' /> },
    { show: readinessSummary.error > 0 || readinessSummary.warning > 0, node: <Metric icon="check" label={tx("Readiness")} value={readinessSummary.error ? 'Blocked' : readinessSummary.warning ? 'Review' : readinessSummary.checking ? 'Checking' : 'Ready'} detail={`${readinessSummary.ok}/${readinessSummary.total || 0} ready`} tone={readinessTone} key='readiness' /> },
  ]
  const shown = metrics.filter((metric) => metric.show).map((metric) => metric.node)

  return (
    <CommandStatusSummary summary={statusSummary} expanded={statusExpanded} onToggle={toggleStatusExpanded}>
      {shown.length
        ? <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{shown}</div>
        : <p className="px-1 py-1 text-[13px] text-ink-3">{tx("Nothing needs you right now. Approvals, running work and connector problems will show up here.")}</p>}
    </CommandStatusSummary>
  )
}
