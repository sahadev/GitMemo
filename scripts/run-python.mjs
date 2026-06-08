#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('Usage: node scripts/run-python.mjs <script.py> [...args]')
  process.exit(1)
}

const candidates = []
if (process.env.PYTHON) candidates.push([process.env.PYTHON])
if (process.platform === 'win32') {
  candidates.push(['py', '-3'], ['python'], ['python3'])
} else {
  candidates.push(['python3'], ['python'], ['py', '-3'])
}

let lastError = null

for (const candidate of candidates) {
  const [command, ...prefixArgs] = candidate
  const result = spawnSync(command, [...prefixArgs, ...args], {
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      lastError = result.error
      continue
    }
    throw result.error
  }

  if (process.platform === 'win32' && result.status === 9009) {
    lastError = new Error(`${command} exited with Windows command-not-found status 9009`)
    continue
  }

  process.exit(result.status ?? 1)
}

console.error('Unable to find Python. Tried PYTHON, python3, python, and py -3.')
if (lastError) console.error(lastError.message)
process.exit(1)
