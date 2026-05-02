import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = resolve(root, 'dist/client/index.html')
const serverEntryPath = resolve(root, 'dist/server/entry-server.js')

const template = readFileSync(templatePath, 'utf-8')
const { render } = await import(pathToFileURL(serverEntryPath).href)
const appHtml = render()
const html = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)

writeFileSync(resolve(root, 'dist/client/index.html'), html)
rmSync(resolve(root, 'dist/server'), { recursive: true, force: true })
