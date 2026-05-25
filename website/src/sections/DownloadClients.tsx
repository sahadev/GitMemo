import { useEffect, useState } from 'react'
import { Apple, Cpu, Download, Smartphone, type LucideIcon } from 'lucide-react'
import { useI18n } from '../i18n/useI18n'

const LATEST_RELEASE_API = 'https://api.github.com/repos/sahadev/GitMemo/releases/latest'
const FALLBACK_RELEASE_VERSION = 'v1.0.65'
const FIXED_ANDROID_VERSION = 'v1.0.77'
const FIXED_ANDROID_ABI = 'arm64-v8a'
const FIXED_ANDROID_APK_URL = 'https://gitmemo.kakacut.cn/mobile/gitmemo-android-arm64-v8a-release.apk'
const DOWNLOADS_MANIFEST_URL = (import.meta.env.VITE_DOWNLOAD_MANIFEST_URL || '').trim()

interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  assets: GitHubReleaseAsset[]
}

interface DownloadManifestAsset {
  name: string
  url: string
}

interface DownloadManifest {
  version: string
  assets: Partial<Record<DownloadItem['key'], DownloadManifestAsset>>
}

interface DownloadItem {
  key: 'macosAppleSilicon' | 'macosIntel' | 'androidApk'
  icon: LucideIcon
  fallbackHref: string
  assetPattern?: RegExp
  ext: string
  abi?: string
  fixedVersion?: string
  useManifest?: boolean
}

const downloads: DownloadItem[] = [
  {
    key: 'macosAppleSilicon',
    icon: Apple,
    fallbackHref: 'https://github.com/sahadev/GitMemo/releases/download/v1.0.65/GitMemo_v1.0.65_aarch64.dmg',
    assetPattern: /^GitMemo_v?.+_aarch64\.dmg$/,
    ext: '.dmg',
  },
  {
    key: 'macosIntel',
    icon: Cpu,
    fallbackHref: 'https://github.com/sahadev/GitMemo/releases/download/v1.0.65/GitMemo_v1.0.65_x86_64.dmg',
    assetPattern: /^GitMemo_v?.+_(?:x86_64|x64)\.dmg$/,
    ext: '.dmg',
  },
  {
    key: 'androidApk',
    icon: Smartphone,
    fallbackHref: FIXED_ANDROID_APK_URL,
    ext: '.apk',
    abi: FIXED_ANDROID_ABI,
    fixedVersion: FIXED_ANDROID_VERSION,
    useManifest: false,
  },
]

interface DownloadClientsProps {
  showHeader?: boolean
  showVersion?: boolean
}

export default function DownloadClients({ showHeader = true, showVersion = false }: DownloadClientsProps) {
  const { t } = useI18n()
  const [release, setRelease] = useState<GitHubRelease | null>(null)
  const [manifest, setManifest] = useState<DownloadManifest | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch(LATEST_RELEASE_API, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub release request failed: ${response.status}`)
        return response.json() as Promise<GitHubRelease>
      })
      .then(setRelease)
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') {
          console.warn(error)
        }
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!DOWNLOADS_MANIFEST_URL) return

    const controller = new AbortController()

    fetch(DOWNLOADS_MANIFEST_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Download manifest request failed: ${response.status}`)
        return response.json() as Promise<DownloadManifest>
      })
      .then(setManifest)
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') {
          console.warn(error)
        }
      })

    return () => controller.abort()
  }, [])

  return (
    <section id="downloads" className="relative z-10 w-full max-w-6xl min-w-0 scroll-mt-8">
      {showHeader && (
        <div className="mx-auto max-w-[20rem] text-center sm:max-w-3xl">
          <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-3">
            {t('download.label')}
          </p>
          <h2 className="text-2xl leading-tight sm:text-4xl font-bold text-text">
            {t('download.title')}
          </h2>
          <p className="mt-4 text-sm leading-7 sm:text-lg text-text-secondary">
            {t('download.subtitle')}
          </p>
        </div>
      )}

      <div className={`${showHeader ? 'mt-10' : ''} grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6`}>
        {downloads.map((item) => {
          const Icon = item.icon
          const title = t(`download.${item.key}.title`)
          const manifestAsset = item.useManifest === false ? undefined : manifest?.assets[item.key]
          const asset = item.assetPattern
            ? release?.assets.find((candidate) => item.assetPattern?.test(candidate.name))
            : undefined
          const version = item.fixedVersion ?? manifest?.version ?? release?.tag_name ?? FALLBACK_RELEASE_VERSION
          return (
            <a
              key={item.key}
              href={manifestAsset?.url ?? asset?.browser_download_url ?? item.fallbackHref}
              className="group flex min-h-34 min-w-0 flex-col justify-between rounded-lg border border-border bg-surface/80 p-5 text-left shadow-[0_16px_40px_rgba(0,0,0,0.08)] transition-colors hover:border-[rgba(0,122,255,0.45)] hover:bg-surface-2/80"
              aria-label={`${t('download.action')} ${title}`}
            >
              <div>
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-1 shrink-0 text-text">
                      <Icon size={24} strokeWidth={2.2} />
                    </span>
                    <h3 className="min-w-0 text-xl sm:text-2xl font-bold text-text">
                      {title}
                    </h3>
                  </div>
                  {showVersion && (
                    <span className="shrink-0 rounded-full border border-green/30 px-2 py-0.5 text-xs font-medium text-green">
                      {version}
                    </span>
                  )}
                </div>
                <p className="mt-6 text-sm sm:text-base text-text-secondary">
                  {t(`download.${item.key}.desc`)}
                </p>
                {item.abi && (
                  <p className="mt-3 text-xs sm:text-sm text-text-secondary">
                    {t('download.abi')}: <span className="font-medium text-text">{item.abi}</span>
                  </p>
                )}
              </div>

              <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm sm:text-base text-text-secondary">
                  {item.ext}
                </span>
                <span className="inline-flex shrink-0 items-center gap-2 text-sm sm:text-base font-semibold text-accent transition-colors group-hover:text-accent-light">
                  {t('download.action')}
                  <Download size={18} />
                </span>
              </div>
            </a>
          )
        })}
      </div>
    </section>
  )
}
