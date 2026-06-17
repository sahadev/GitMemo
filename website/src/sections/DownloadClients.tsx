import { useEffect, useState } from 'react'
import { Apple, Cpu, Download, Laptop, Smartphone, type LucideIcon } from 'lucide-react'
import { useI18n } from '../i18n/useI18n'

const LATEST_RELEASE_API = 'https://api.github.com/repos/sahadev/GitMemo/releases/latest'
const FALLBACK_RELEASE_VERSION = 'v1.0.65'
const FIXED_ANDROID_VERSION = (import.meta.env.VITE_ANDROID_APK_VERSION || '').trim()
const FIXED_WINDOWS_VERSION = (import.meta.env.VITE_WINDOWS_DESKTOP_VERSION || '').trim()
const FIXED_ANDROID_ABI = 'arm64-v8a'
const STABLE_ANDROID_APK_URL = `https://gitmemo.kakacut.cn/mobile/gitmemo-android-${FIXED_ANDROID_ABI}-release.apk`
const STABLE_WINDOWS_EXE_URL = 'https://gitmemo.kakacut.cn/desktop/windows/gitmemo-windows-x64-setup.exe'
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
  key: 'macosAppleSilicon' | 'macosIntel' | 'windowsDesktop' | 'androidApk'
  icon: LucideIcon
  fallbackHref: string
  assetPattern?: RegExp
  ext: string
  detailKeys: string[]
  fixedVersion?: string
  useManifest?: boolean
  comingSoon?: boolean
}

const downloads: DownloadItem[] = [
  {
    key: 'macosAppleSilicon',
    icon: Apple,
    fallbackHref: 'https://github.com/sahadev/GitMemo/releases/download/v1.0.65/GitMemo_v1.0.65_aarch64.dmg',
    assetPattern: /^GitMemo_v?.+_aarch64\.dmg$/,
    ext: '.dmg',
    detailKeys: ['download.macosAppleSilicon.detail'],
  },
  {
    key: 'macosIntel',
    icon: Cpu,
    fallbackHref: 'https://github.com/sahadev/GitMemo/releases/download/v1.0.65/GitMemo_v1.0.65_x86_64.dmg',
    assetPattern: /^GitMemo_v?.+_(?:x86_64|x64)\.dmg$/,
    ext: '.dmg',
    detailKeys: ['download.macosIntel.detail'],
  },
  {
    key: 'windowsDesktop',
    icon: Laptop,
    fallbackHref: STABLE_WINDOWS_EXE_URL,
    ext: '.exe · x64',
    detailKeys: ['download.windowsDesktop.detail', 'download.windowsDesktop.arch'],
    fixedVersion: FIXED_WINDOWS_VERSION || undefined,
  },
  {
    key: 'androidApk',
    icon: Smartphone,
    fallbackHref: STABLE_ANDROID_APK_URL,
    ext: '.apk',
    detailKeys: ['download.androidApk.detail', 'download.androidApk.arch'],
    fixedVersion: FIXED_ANDROID_VERSION || undefined,
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

      <div className={`${showHeader ? 'mt-10' : ''} grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6`}>
        {downloads.map((item) => {
          const Icon = item.icon
          const title = t(`download.${item.key}.title`)
          const details = item.detailKeys.map((key) => t(key))
          const manifestAsset = !item.comingSoon && item.useManifest !== false ? manifest?.assets[item.key] : undefined
          const asset = !item.comingSoon && item.assetPattern
            ? release?.assets.find((candidate) => item.assetPattern?.test(candidate.name))
            : undefined
          const version = item.fixedVersion ?? manifest?.version ?? release?.tag_name ?? FALLBACK_RELEASE_VERSION
          const cardContent = (
            <>
              <div>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 text-text">
                    <Icon size={24} strokeWidth={2.2} />
                  </span>
                  <h3 className="min-w-0 text-2xl font-bold leading-none text-text">
                    {title}
                  </h3>
                </div>
                <div className="mt-4 flex min-h-7 flex-wrap items-center gap-2">
                  {details.map((detail) => (
                    <span
                      key={detail}
                      className="rounded-md border border-border bg-surface-2/70 px-2 py-1 text-xs font-medium leading-none text-text-secondary"
                    >
                      {detail}
                    </span>
                  ))}
                </div>
                <p className="mt-6 text-sm sm:text-base text-text-secondary">
                  {t(`download.${item.key}.desc`)}
                </p>
              </div>

              <div className="mt-10 flex items-center justify-between gap-3 border-t border-border/70 pt-4">
                <div className="flex min-w-0 items-center gap-2 text-xs text-text-secondary">
                  <span>
                    {item.ext}
                  </span>
                  {showVersion && (
                    <span className="shrink-0 rounded-full border border-green/30 bg-green/5 px-2 py-0.5 text-[11px] font-medium leading-none text-green">
                      {item.comingSoon ? t('download.comingSoon') : version}
                    </span>
                  )}
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent transition-colors group-hover:text-accent-light">
                  {item.comingSoon ? t('download.comingSoon') : t('download.action')}
                  {!item.comingSoon && <Download size={16} />}
                </span>
              </div>
            </>
          )
          if (item.comingSoon) {
            return (
              <div
                key={item.key}
                className="group flex min-h-34 min-w-0 flex-col justify-between rounded-lg border border-border bg-surface/80 p-5 text-left shadow-[0_16px_40px_rgba(0,0,0,0.08)]"
              >
                {cardContent}
              </div>
            )
          }
          return (
            <a
              key={item.key}
              href={manifestAsset?.url ?? asset?.browser_download_url ?? item.fallbackHref}
              className="group flex min-h-34 min-w-0 flex-col justify-between rounded-lg border border-border bg-surface/80 p-5 text-left shadow-[0_16px_40px_rgba(0,0,0,0.08)] transition-colors hover:border-[rgba(0,122,255,0.45)] hover:bg-surface-2/80"
              aria-label={`${t('download.action')} ${title} ${details.join(' ')}`}
            >
              {cardContent}
            </a>
          )
        })}
      </div>
    </section>
  )
}
