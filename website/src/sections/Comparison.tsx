import { useI18n } from '../i18n'

const features = [
  'cmp.features.aiBackup',
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
  { nameKey: 'cmp.products.obsidian', values: ['no', 'no', 'partial', 'no', 'yes', 'no', '~200MB', 'Free + $50/yr'] },
  { nameKey: 'cmp.products.notion', values: ['no', 'no', 'no', 'yes', 'no', 'no', 'Web', 'Free + $10/mo'] },
  { nameKey: 'cmp.products.novi', values: ['no', 'no', 'no', 'yes', 'yes', 'no', '~30MB', '$12.99'] },
  { nameKey: 'cmp.products.gitmemo', highlight: true, values: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', '~16MB', 'Free forever'] },
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
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-4xl mx-auto">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4 text-center">{t('cmp.label')}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-text text-center mb-4">{t('cmp.title')}</h2>
        <p className="text-text-secondary text-center max-w-xl mx-auto mb-12">{t('cmp.subtitle')}</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-4 px-4 text-text-secondary font-medium">{t('cmp.feature')}</th>
                {products.map((p) => (
                  <th key={p.nameKey} className={`py-4 px-4 font-semibold text-center ${p.highlight ? 'text-accent' : 'text-text'}`}>
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
                    <td key={p.nameKey} className={`py-3 px-4 text-center ${p.highlight ? 'bg-[rgba(0,122,255,0.04)]' : ''}`}>
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
