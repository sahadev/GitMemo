import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = resolve(root, 'dist/client/index.html')
const serverEntryPath = resolve(root, 'dist/server/entry-server.js')

const template = readFileSync(templatePath, 'utf-8')
const { render } = await import(pathToFileURL(serverEntryPath).href)

function pageHtml(path) {
  const appHtml = render(path)
  return template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
}

writeFileSync(resolve(root, 'dist/client/index.html'), pageHtml('/'))

mkdirSync(resolve(root, 'dist/client/readme'), { recursive: true })
writeFileSync(resolve(root, 'dist/client/readme/index.html'), pageHtml('/readme/'))

rmSync(resolve(root, 'dist/server'), { recursive: true, force: true })
