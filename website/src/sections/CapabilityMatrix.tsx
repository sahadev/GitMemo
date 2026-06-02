import { Check, Minus, X, type LucideIcon } from 'lucide-react'
import { useI18n } from '../i18n/useI18n'

type Status = 'yes' | 'no' | 'partial' | 'required'

interface MatrixRow {
  featureKey: string
  desktop: Status
  cli: Status
  mcp: Status
  android: Status
}

const rows: MatrixRow[] = [
  { featureKey: 'matrix.feature.readSearch', desktop: 'yes', cli: 'yes', mcp: 'yes', android: 'yes' },
  { featureKey: 'matrix.feature.createDocs', desktop: 'yes', cli: 'yes', mcp: 'yes', android: 'yes' },
  { featureKey: 'matrix.feature.clipboard', desktop: 'yes', cli: 'no', mcp: 'no', android: 'partial' },
  { featureKey: 'matrix.feature.aiArchive', desktop: 'partial', cli: 'required', mcp: 'yes', android: 'no' },
  { featureKey: 'matrix.feature.sessionCapture', desktop: 'partial', cli: 'yes', mcp: 'no', android: 'no' },
  { featureKey: 'matrix.feature.editorSetup', desktop: 'partial', cli: 'yes', mcp: 'no', android: 'no' },
  { featureKey: 'matrix.feature.gitOps', desktop: 'partial', cli: 'yes', mcp: 'partial', android: 'partial' },
  { featureKey: 'matrix.feature.mobile', desktop: 'no', cli: 'no', mcp: 'no', android: 'yes' },
]

const statusConfig: Record<Status, { icon: LucideIcon; className: string; labelKey: string }> = {
  yes: {
    icon: Check,
    className: 'border-green/30 bg-green/10 text-green',
    labelKey: 'matrix.status.yes',
  },
  no: {
    icon: X,
    className: 'border-slate-500/20 bg-slate-500/10 text-text-secondary',
    labelKey: 'matrix.status.no',
  },
  partial: {
    icon: Minus,
    className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500',
    labelKey: 'matrix.status.partial',
  },
  required: {
    icon: Check,
    className: 'border-accent/30 bg-accent/10 text-accent',
    labelKey: 'matrix.status.required',
  },
}

function StatusCell({ status }: { status: Status }) {
  const { t } = useI18n()
  const config = statusConfig[status]
  const Icon = config.icon
  const label = t(config.labelKey)
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${config.className}`}
      aria-label={label}
      title={label}
    >
      <Icon size={13} />
    </span>
  )
}

export default function CapabilityMatrix() {
  const { t } = useI18n()
  const columns = [
    { key: 'desktop', labelKey: 'matrix.desktop' },
    { key: 'cli', labelKey: 'matrix.cli' },
    { key: 'mcp', labelKey: 'matrix.mcp' },
    { key: 'android', labelKey: 'matrix.android' },
  ] as const

  return (
    <section id="entry-points" className="py-24 px-6 border-t border-border scroll-mt-20">
      <div className="mx-auto max-w-5xl">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4 text-center">{t('matrix.label')}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-text text-center mb-4">{t('matrix.title')}</h2>
        <p className="text-text-secondary text-center max-w-2xl mx-auto mb-12">{t('matrix.subtitle')}</p>

        <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
          <table className="w-full min-w-[720px] table-fixed text-sm">
            <colgroup>
              <col className="w-[36%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-4 text-left font-medium text-text-secondary">{t('matrix.capability')}</th>
                {columns.map((column) => (
                  <th key={column.key} className="border-l border-border/40 px-4 py-4 text-center font-semibold text-text">
                    {t(column.labelKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.featureKey} className="border-b border-border/50 last:border-b-0">
                  <td className="px-4 py-4 font-medium text-text">{t(row.featureKey)}</td>
                  {columns.map((column) => (
                    <td key={column.key} className="border-l border-border/40 px-4 py-4 text-center">
                      <StatusCell status={row[column.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 w-full overflow-x-auto text-center">
          <p className="inline-block whitespace-nowrap text-xs leading-relaxed text-text-secondary">{t('matrix.note')}</p>
        </div>
      </div>
    </section>
  )
}
