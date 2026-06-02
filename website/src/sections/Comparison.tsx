import { useI18n } from '../i18n/useI18n'

const features = [
  'cmp.features.aiBackup',
  'cmp.features.notes',
  'cmp.features.clipboard',
  'cmp.features.gitNative',
  'cmp.features.mcp',
  'cmp.features.localFirst',
  'cmp.features.openSource',
  'cmp.features.appSize',
  'cmp.features.price',
]

type Status = 'yes' | 'no' | 'partial' | string

interface Product {
  nameKey: string
  highlight?: boolean
  values: Status[]
}

const products: Product[] = [
  { nameKey: 'cmp.products.obsidian', values: ['no', 'yes', 'no', 'partial', 'partial', 'yes', 'no', '~200MB', 'Free + paid sync'] },
  { nameKey: 'cmp.products.gitmemo', highlight: true, values: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes', '~16MB', 'Free forever'] },
]

function Cell({ value }: { value: Status }) {
  if (value === 'yes') return <span className="text-green font-medium">&#10003;</span>
  if (value === 'no') return <span className="text-[#64748b]">&#10005;</span>
  if (value === 'partial') return <span className="text-yellow-500">~</span>
  return <span className="text-text-secondary text-sm">{value}</span>
}

export default function Comparison() {
  const { t } = useI18n()

  return (
    <section id="comparison" className="py-24 px-6 border-t border-border scroll-mt-20">
      <div className="max-w-4xl mx-auto">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4 text-center">{t('cmp.label')}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-text text-center mb-4">{t('cmp.title')}</h2>
        <p className="text-text-secondary text-center max-w-xl mx-auto mb-12">{t('cmp.subtitle')}</p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] table-fixed overflow-hidden rounded-lg text-sm">
            <colgroup>
              <col className="w-[32%]" />
              <col className="w-[34%]" />
              <col className="w-[34%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-4 px-4 text-text-secondary font-medium">{t('cmp.feature')}</th>
                {products.map((p) => (
                  <th
                    key={p.nameKey}
                    className={`border-l border-border/40 py-4 px-4 font-semibold text-center ${p.highlight ? 'bg-[rgba(0,122,255,0.04)] text-accent' : 'bg-surface-2/35 text-text'}`}
                  >
                    {t(p.nameKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feat, i) => (
                <tr key={feat} className="border-b border-border/50">
                  <td className="py-3 px-4 text-text-secondary">{t(feat)}</td>
                  {products.map((p) => (
                    <td
                      key={p.nameKey}
                      className={`border-l border-border/40 py-3 px-4 text-center ${p.highlight ? 'bg-[rgba(0,122,255,0.04)]' : 'bg-surface-2/35'}`}
                    >
                      <Cell value={p.values[i]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-text-secondary text-xs mt-6">
          {t('cmp.note')} <span className="text-text">{t('cmp.note2')}</span>
        </p>
      </div>
    </section>
  )
}
