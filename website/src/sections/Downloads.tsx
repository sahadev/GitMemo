import DownloadClients from './DownloadClients'

export default function Downloads() {
  return (
    <section className="px-6 py-20 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <DownloadClients showVersion />
      </div>
    </section>
  )
}
