#!/usr/bin/env node
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptsDir = path.join(root, 'scripts')
const stateDir = path.join(root, 'target', 'windows-pairing')
const statePath = path.join(stateDir, 'state.json')
const port = Number(process.env.GITMEMO_PAIRING_PORT || '47832')
const keyPath = process.env.GITMEMO_WINDOWS_SSH_KEY || path.join(os.homedir(), '.ssh', 'gitmemo_windows_ed25519')
const publicKeyPath = `${keyPath}.pub`

const state = loadState()
if (!Array.isArray(state.devices)) state.devices = []
if (!Array.isArray(state.jobs)) state.jobs = []
if (!Array.isArray(state.logs)) state.logs = []
if (!Array.isArray(state.agents)) state.agents = []
normalizeState()

function loadState() {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    return { devices: [], jobs: [] }
  }
}

function saveState() {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

function ensureKey() {
  if (!existsSync(keyPath)) {
    mkdirSync(path.dirname(keyPath), { recursive: true })
    const result = spawnSync('ssh-keygen', ['-t', 'ed25519', '-f', keyPath, '-N', '', '-C', 'gitmemo-windows-remote'], {
      stdio: 'inherit',
    })
    if (result.status !== 0) {
      throw new Error('Failed to create Windows SSH key with ssh-keygen')
    }
  }

  return readFileSync(publicKeyPath, 'utf8').trim()
}

const publicKey = ensureKey()

function lanAddresses() {
  const addresses = []
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address)
      }
    }
  }
  return addresses
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function headerValue(value) {
  return String(value).replace(/[\r\n"]/g, '_')
}

function psSingleQuote(value) {
  return String(value).replaceAll("'", "''")
}

function publicUrl(address = 'MAC_IP') {
  return `http://${address}:${port}`
}

function windowsArtifacts() {
  const outDir = path.join(root, 'release-assets', 'windows')
  if (!existsSync(outDir)) return []
  return readdirSync(outDir)
    .map((name) => {
      const filePath = path.join(outDir, name)
      try {
        const stat = statSync(filePath)
        if (!stat.isFile()) return null
        return {
          name,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          href: `/artifacts/windows/${encodeURIComponent(name)}`,
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function latestWindowsInstaller() {
  return (
    windowsArtifacts()
      .filter((artifact) => /\.(exe|msi)$/i.test(artifact.name))
      .sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)))[0] || null
  )
}

function windowsScreenshots() {
  const outDir = path.join(stateDir, 'screenshots')
  if (!existsSync(outDir)) return []
  return readdirSync(outDir)
    .map((name) => {
      const filePath = path.join(outDir, name)
      try {
        const stat = statSync(filePath)
        if (!stat.isFile()) return null
        return {
          name,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          href: `/screenshots/windows/${encodeURIComponent(name)}`,
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)))
}

function bootstrapCommand(address = 'MAC_IP') {
  const base = publicUrl(address)
  return `Set-ExecutionPolicy -Scope Process Bypass -Force; irm '${psSingleQuote(base)}/run_bootstrap.ps1' | iex`
}

function installEnvCommand(address = 'MAC_IP') {
  const base = publicUrl(address)
  return `Set-ExecutionPolicy -Scope Process Bypass -Force; irm '${psSingleQuote(base)}/run_install_env.ps1' | iex`
}

function agentCommand(address = 'MAC_IP') {
  const base = publicUrl(address)
  return `$ErrorActionPreference='Stop'; try { Set-ExecutionPolicy -Scope Process Bypass -Force; $p=Join-Path $env:TEMP 'gitmemo-lan-agent.ps1'; Invoke-WebRequest '${psSingleQuote(base)}/run_agent.ps1' -UseBasicParsing -OutFile $p; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; if($LASTEXITCODE -ne 0){ throw "GitMemo LAN agent exited with code $LASTEXITCODE" } } catch { Write-Host ''; Write-Host 'GitMemo LAN agent failed:' -ForegroundColor Red; Write-Host $_.Exception.ToString(); Read-Host 'Press Enter to close' }`
}

function windowsAgentScript(address = 'MAC_IP') {
  const base = publicUrl(address)
  return [
    "$ErrorActionPreference='Stop'",
    `$u='${psSingleQuote(base)}'`,
    "$agentId = \"$env:COMPUTERNAME-$env:USERNAME-\" + ([guid]::NewGuid().ToString('N'))",
    "$registerBody=@{agentId=$agentId;username=$env:USERNAME;computerName=$env:COMPUTERNAME;startedAt=(Get-Date).ToString('o')}|ConvertTo-Json -Depth 4",
    'Invoke-RestMethod -Method Post -Uri "$u/api/agent/register" -ContentType "application/json" -Body $registerBody | Out-Null',
    "Write-Host \"GitMemo LAN agent connected: $agentId\" -ForegroundColor Green",
    "Write-Host 'Keep this window open while the Mac controls this Windows machine.'",
    "function Invoke-AgentCommand($command) {",
    "  $exit=0",
    "  $stdout=''",
    "  $stderr=''",
    "  try {",
    "    $safeId=([string]$command.id) -replace '[^A-Za-z0-9_.-]','_'",
    "    $prefix=Join-Path $env:TEMP \"gitmemo-agent-$safeId\"",
    "    $scriptPath=\"$prefix.ps1\"",
    "    $outPath=\"$prefix.out.log\"",
    "    $errPath=\"$prefix.err.log\"",
    "    Remove-Item $scriptPath,$outPath,$errPath -ErrorAction SilentlyContinue",
    "    Set-Content -Path $scriptPath -Value ([string]$command.script) -Encoding UTF8",
    "    $timeoutMs=600000",
    "    if($command.PSObject.Properties.Name -contains 'timeoutMs'){ $timeoutMs=[int]$command.timeoutMs }",
    "    if($timeoutMs -lt 1000){ $timeoutMs=600000 }",
    "    $proc=Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$scriptPath) -RedirectStandardOutput $outPath -RedirectStandardError $errPath -PassThru",
    "    $cancelled=$false",
    "    $timedOut=$false",
    "    function Read-AgentLogSnapshot {",
    "      $parts=@()",
    "      if(Test-Path $outPath){ $parts += (Get-Content -Raw -Path $outPath -ErrorAction SilentlyContinue) }",
    "      if($stderr){ $parts += $stderr }",
    "      if(Test-Path $errPath){ $parts += (Get-Content -Raw -Path $errPath -ErrorAction SilentlyContinue) }",
    "      $snapshot=($parts -join [Environment]::NewLine).Trim()",
    "      if($snapshot -and $snapshot.Length -gt 200000){$snapshot=$snapshot.Substring($snapshot.Length-200000)}",
    "      return $snapshot",
    "    }",
    "    function Send-AgentProgress([string]$snapshot) {",
    "      $progressBody=@{agentId=$agentId;commandId=$command.id;log=$snapshot}|ConvertTo-Json -Depth 5",
    "      try {",
    "        $response=Invoke-RestMethod -Method Post -Uri \"$u/api/agent/progress\" -ContentType 'application/json' -Body $progressBody",
    "        return (($null -ne $response) -and ($response.cancel -eq $true))",
    "      } catch {",
    "        return $false",
    "      }",
    "    }",
    "    $deadline=[DateTime]::UtcNow.AddMilliseconds($timeoutMs)",
    "    $lastProgressLength=-1",
    "    while(-not $proc.HasExited){",
    "      if([DateTime]::UtcNow -ge $deadline){",
    "        try { $proc.Kill() } catch { }",
    "        $exit=124",
    "        $timedOut=$true",
    "        $stderr=\"GitMemo agent command timed out after $([Math]::Round($timeoutMs / 1000)) seconds.\"",
    "        break",
    "      }",
    "      Start-Sleep -Seconds 5",
    "      $snapshot=Read-AgentLogSnapshot",
    "      if(Send-AgentProgress $snapshot){",
    "        try { $proc.Kill() } catch { }",
    "        $exit=130",
    "        $cancelled=$true",
    "        $stderr='GitMemo agent command cancelled by Mac.'",
    "        break",
    "      }",
    "      if($snapshot -and $snapshot.Length -ne $lastProgressLength){",
    "        $lastProgressLength=$snapshot.Length",
    "      }",
    "    }",
    "    if($cancelled -or $timedOut){",
    "      try { $proc.WaitForExit(5000) | Out-Null } catch { }",
    "    }",
    "    if($proc.HasExited -and -not $cancelled -and -not $timedOut){",
    "      $exit=$proc.ExitCode",
    "    }",
    "    if(Test-Path $outPath){ $stdout=Get-Content -Raw -Path $outPath -ErrorAction SilentlyContinue }",
    "    if(Test-Path $errPath){ $stderr=($stderr + [Environment]::NewLine + (Get-Content -Raw -Path $errPath -ErrorAction SilentlyContinue)).Trim() }",
    "  } catch {",
    "    $stderr=$_.Exception.ToString()",
    "    $exit=1",
    "  }",
    "  $log=($stdout + [Environment]::NewLine + $stderr).Trim()",
    "  if($log -and $log.Length -gt 200000){$log=$log.Substring($log.Length-200000)}",
    "  if($log){Write-Host $log}",
    "  $body=@{agentId=$agentId;commandId=$command.id;exitCode=$exit;log=$log}|ConvertTo-Json -Depth 5",
    "  Invoke-RestMethod -Method Post -Uri \"$u/api/agent/result\" -ContentType 'application/json' -Body $body | Out-Null",
    "}",
    "while($true){",
    "  try {",
    "    $next=Invoke-RestMethod -Method Get -Uri \"$u/api/agent/next?agentId=$agentId\"",
    "    if($next -and $next.id){",
    "      Write-Host \"Running GitMemo command: $($next.title)\" -ForegroundColor Cyan",
    "      Invoke-AgentCommand $next",
    "    }",
    "  } catch {",
    "    Write-Warning $_.Exception.Message",
    "  }",
    "  Start-Sleep -Seconds 2",
    "}",
  ].join('\n')
}

function windowsLogRunnerScript({ source, scriptName, args = [] }, address = 'MAC_IP') {
  const base = publicUrl(address)
  const psArgs = args.join(', ')
  return [
    "$ErrorActionPreference='Continue'",
    `$u='${psSingleQuote(base)}'`,
    `$p=Join-Path $env:TEMP '${psSingleQuote(scriptName)}'`,
    `$l=Join-Path $env:TEMP '${psSingleQuote(scriptName.replace(/\.ps1$/i, '.log'))}'`,
    `Invoke-WebRequest "$u/${psSingleQuote(scriptName)}" -OutFile $p`,
    'Remove-Item $l -ErrorAction SilentlyContinue',
    "function Quote-ProcessArg([string]$Value) { '\"' + ($Value -replace '\"', '\\\"') + '\"' }",
    "$exit=1",
    "$stdout=''",
    "$stderr=''",
    "$raw=''",
    "$diag=''",
    "$argValues = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $p)",
    `$argValues += @(${psArgs})`,
    "$psi = New-Object System.Diagnostics.ProcessStartInfo",
    "$psi.FileName = 'powershell.exe'",
    "$psi.Arguments = (($argValues | ForEach-Object { Quote-ProcessArg $_ }) -join ' ')",
    "$psi.UseShellExecute = $false",
    "$psi.RedirectStandardOutput = $true",
    "$psi.RedirectStandardError = $true",
    "try {",
    "  $proc = [System.Diagnostics.Process]::Start($psi)",
    "  $stdout = $proc.StandardOutput.ReadToEnd()",
    "  $stderr = $proc.StandardError.ReadToEnd()",
    "  $proc.WaitForExit()",
    "  $exit = $proc.ExitCode",
    "  $raw = ($stdout + [Environment]::NewLine + $stderr).Trim()",
    "} catch {",
    "  $diag = $_.Exception.ToString()",
    "  $raw = $diag",
    "  $exit = 1",
    "}",
    "$raw | Out-File -FilePath $l -Encoding UTF8",
    "if($raw){Write-Host $raw}",
    "if($raw -and $raw.Length -gt 200000){$raw=$raw.Substring($raw.Length-200000)}",
    "$diagnostics = @{ arguments = $psi.Arguments; stdoutLength = $stdout.Length; stderrLength = $stderr.Length; runnerError = $diag }",
    `$body=@{source='${psSingleQuote(source)}';username=$env:USERNAME;computerName=$env:COMPUTERNAME;exitCode=$exit;log=[string]$raw;diagnostics=$diagnostics}|ConvertTo-Json -Depth 6`,
    "$uploaded=$false",
    'try { Invoke-RestMethod -Method Post -Uri "$u/api/log" -ContentType "application/json" -Body $body | Out-Null; $uploaded=$true } catch { Write-Warning "Failed to upload GitMemo log: $($_.Exception.Message)" }',
    "Write-Host ''",
    "if($uploaded){Write-Host 'GitMemo log uploaded to the LAN pairing page.'}",
    "if($exit){Write-Host \"GitMemo command failed with exit code $exit.\" -ForegroundColor Red}else{Write-Host 'GitMemo command completed successfully.' -ForegroundColor Green}",
    "Read-Host 'Press Enter to close this window'",
  ].join('\n')
}

function normalizeRemoteAddress(value) {
  if (!value) return null
  return String(value).replace(/^::ffff:/, '')
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1024 * 1024) {
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (error) {
        reject(error)
      }
    })
  })
}

function parseLargeBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1024 * 1024 * 4) {
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (error) {
        const sanitized = stripInvalidJsonControls(data)
        if (sanitized !== data) {
          try {
            resolve(JSON.parse(sanitized))
            return
          } catch {
            // Fall through to the lenient payload parser below.
          }
        }
        const fallback = parseLenientAgentPayload(data)
        if (fallback) {
          console.warn(`Accepted lenient agent payload after JSON parse failed: ${error.message}`)
          resolve(fallback)
          return
        }
        reject(error)
      }
    })
  })
}

function stripInvalidJsonControls(data) {
  return String(data).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

function parseLenientAgentPayload(data) {
  const agentId = data.match(/"agentId"\s*:\s*"([^"]+)"/)?.[1]
  const commandId = data.match(/"commandId"\s*:\s*"([^"]+)"/)?.[1]
  const exitCodeMatches = [...data.matchAll(/"exitCode"\s*:\s*(-?\d+)/g)]
  const exitCodeValue = exitCodeMatches.at(-1)?.[1]
  const exitCode = exitCodeValue == null ? undefined : Number(exitCodeValue)

  if (!agentId && !commandId) return null

  const inferredExitCode = looksLikeAgentFailure(data) && (!Number.isFinite(exitCode) || exitCode === 0) ? 1 : exitCode

  return {
    agentId: agentId || '',
    commandId: commandId || '',
    exitCode: Number.isFinite(inferredExitCode) ? inferredExitCode : undefined,
    log: data,
  }
}

function looksLikeAgentFailure(log) {
  return /failed to build app|No Windows bundle artifacts found|Command ".+" not found|ERR_PNPM_|RuntimeException|exited with code [1-9]\d*/i.test(
    String(log || ''),
  )
}

function normalizeState() {
  let changed = false
  for (const job of state.jobs) {
    if (job.command?.startsWith('[agent]') && typeof job.cancelRequested !== 'boolean') {
      job.cancelRequested = false
      changed = true
    }
    if (job.status === 'success' && looksLikeAgentFailure(job.log)) {
      job.status = 'failed'
      if (!job.exitCode) job.exitCode = 1
      changed = true
    }
  }
  if (changed) saveState()
}


function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(payload)
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function upsertDevice(device, requestAddress) {
  const addresses = Array.isArray(device.addresses) ? device.addresses.filter(Boolean) : []
  if (requestAddress && !addresses.includes(requestAddress)) addresses.unshift(requestAddress)

  const normalized = {
    username: String(device.username || '').trim(),
    computerName: String(device.computerName || '').trim(),
    port: Number(device.port || 22),
    addresses: [...new Set(addresses)],
    pairedAt: new Date().toISOString(),
  }

  if (!normalized.username || !normalized.computerName || normalized.addresses.length === 0) {
    throw new Error('Missing username, computerName, or addresses')
  }

  const index = state.devices.findIndex(
    (existing) => existing.username === normalized.username && existing.computerName === normalized.computerName,
  )
  if (index >= 0) {
    state.devices[index] = normalized
  } else {
    state.devices.unshift(normalized)
  }
  saveState()
  return normalized
}

function storeLog(payload, requestAddress) {
  const logText =
    typeof payload.log === 'string'
      ? payload.log
      : payload.log == null
        ? ''
        : JSON.stringify(payload.log, null, 2)
  const log = {
    source: String(payload.source || 'windows').trim(),
    username: String(payload.username || '').trim(),
    computerName: String(payload.computerName || '').trim(),
    exitCode: payload.exitCode ?? null,
    remoteAddress: requestAddress,
    receivedAt: new Date().toISOString(),
    log: logText,
    diagnostics: payload.diagnostics ?? null,
  }
  state.logs.unshift(log)
  state.logs = state.logs.slice(0, 20)
  saveState()
  return log
}

function upsertAgent(payload, requestAddress) {
  const agent = {
    id: String(payload.agentId || '').trim(),
    username: String(payload.username || '').trim(),
    computerName: String(payload.computerName || '').trim(),
    remoteAddress: requestAddress,
    startedAt: String(payload.startedAt || new Date().toISOString()),
    lastSeenAt: new Date().toISOString(),
    queue: [],
  }
  if (!agent.id) throw new Error('Missing agentId')

  const index = state.agents.findIndex((candidate) => candidate.id === agent.id)
  if (index >= 0) {
    state.agents[index] = { ...state.agents[index], ...agent, queue: state.agents[index].queue || [] }
  } else {
    state.agents.unshift(agent)
  }
  saveState()
  return state.agents.find((candidate) => candidate.id === agent.id)
}

function findAgent(agentId) {
  const agent = state.agents.find((candidate) => candidate.id === agentId)
  if (!agent) throw new Error(`Unknown agent: ${agentId}`)
  if (!Array.isArray(agent.queue)) agent.queue = []
  return agent
}

function touchAgent(agentId) {
  const agent = state.agents.find((candidate) => candidate.id === agentId)
  if (agent) agent.lastSeenAt = new Date().toISOString()
  return agent
}

function defaultAgent() {
  const agent = state.agents[0]
  if (!agent) throw new Error('No Windows LAN agent connected')
  if (!Array.isArray(agent.queue)) agent.queue = []
  return agent
}

function queueAgentCommand(agent, title, script, options = {}) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const job = {
    id,
    command: `[agent] ${title}`,
    status: 'queued',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    cancelRequested: false,
    log: '',
  }
  state.jobs.unshift(job)
  state.jobs = state.jobs.slice(0, 10)
  agent.queue.push({ id, title, script, timeoutMs: options.timeoutMs || 600000 })
  saveState()
  return job
}

function setAgentJobResult(payload) {
  touchAgent(String(payload.agentId || ''))
  const job = state.jobs.find((candidate) => candidate.id === payload.commandId)
  if (!job) return null
  const exitCode = Number(payload.exitCode)
  const log = String(payload.log || '')
  const inferredFailure = looksLikeAgentFailure(log)
  const normalizedExitCode = Number.isFinite(exitCode) ? exitCode : 1
  const effectiveExitCode = normalizedExitCode === 0 && inferredFailure ? 1 : normalizedExitCode
  job.status = job.cancelRequested ? 'cancelled' : effectiveExitCode === 0 ? 'success' : 'failed'
  job.exitCode = effectiveExitCode
  job.finishedAt = new Date().toISOString()
  job.log = log
  saveState()
  return job
}

function setAgentJobProgress(payload) {
  touchAgent(String(payload.agentId || ''))
  const job = state.jobs.find((candidate) => candidate.id === payload.commandId)
  if (!job) return null
  if (['success', 'failed', 'cancelled'].includes(job.status)) {
    return job
  }
  job.status = job.cancelRequested ? 'cancelling' : 'running'
  if (typeof payload.log === 'string' && payload.log.length > 0) {
    job.log = payload.log
  }
  if (job.log.length > 200000) job.log = job.log.slice(-200000)
  saveState()
  return job
}

function cancelAgentJob(jobId) {
  const job = state.jobs.find((candidate) => candidate.id === jobId)
  if (!job) throw new Error(`Unknown job: ${jobId}`)

  for (const agent of state.agents) {
    if (!Array.isArray(agent.queue)) continue
    agent.queue = agent.queue.filter((command) => command.id !== jobId)
  }

  job.cancelRequested = true
  if (job.status === 'queued') {
    job.status = 'cancelled'
    job.exitCode = 130
    job.finishedAt = new Date().toISOString()
  } else if (job.status === 'running') {
    job.status = 'cancelling'
  }
  saveState()
  return job
}

function agentTestScript() {
  return [
    'hostname',
    'whoami',
    '$PSVersionTable.PSVersion.ToString()',
    'Get-Location',
  ].join('\n')
}

function agentPreflightScript() {
  return [
    '$commands = "winget", "git", "node", "corepack", "pnpm", "python", "py", "rustup", "cargo"',
    'foreach($name in $commands){',
    '  $cmd = Get-Command $name -ErrorAction SilentlyContinue',
    '  if($cmd){',
    '    Write-Host "$name => $($cmd.Source)"',
    '  } else {',
    '    Write-Host "$name => MISSING"',
    '  }',
    '}',
    'Write-Host ""',
    'Write-Host "PATH:"',
    '$env:PATH -split ";" | ForEach-Object { Write-Host "  $_" }',
  ].join('\n')
}

function agentBuildPreflightScript() {
  return [
    '$ErrorActionPreference = "Continue"',
    '$commands = "git", "node", "pnpm", "python", "py", "rustup", "cargo"',
    'foreach($name in $commands){',
    '  $cmd = Get-Command $name -ErrorAction SilentlyContinue',
    '  if($cmd){ Write-Host "$name => $($cmd.Source)" } else { Write-Host "$name => MISSING" }',
    '}',
    'Write-Host ""',
    'Write-Host "Rust toolchains:"',
    '& rustup show active-toolchain 2>&1',
    'Write-Host ""',
    'Write-Host "Installed Rust targets:"',
    '& rustup target list --installed 2>&1',
    'Write-Host ""',
    '$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\\Installer\\vswhere.exe"',
    'Write-Host "vswhere => $vswhere"',
    'if(Test-Path $vswhere){',
    '  $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath',
    '  if($vsPath){',
    '    Write-Host "Visual Studio with VC tools => $vsPath"',
    '    $vcvars = Join-Path $vsPath "VC\\Auxiliary\\Build\\vcvarsall.bat"',
    '    if(Test-Path $vcvars){ Write-Host "vcvarsall => $vcvars" } else { Write-Host "vcvarsall => MISSING" }',
    '  } else {',
    '    Write-Host "Visual Studio with VC tools => MISSING"',
    '  }',
    '} else {',
    '  Write-Host "vswhere => MISSING"',
    '}',
    'Write-Host ""',
    '$kitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\\10\\Lib"',
    'if(Test-Path $kitsRoot){',
    '  Write-Host "Windows SDK libs => $kitsRoot"',
    '  Get-ChildItem $kitsRoot -Directory | Sort-Object Name -Descending | Select-Object -First 3 | ForEach-Object { Write-Host "  $($_.Name)" }',
    '} else {',
    '  Write-Host "Windows SDK libs => MISSING"',
    '}',
  ].join('\n')
}

function agentInstallEnvScript() {
  return [
    `$u='${publicUrl(lanAddresses()[0] || '127.0.0.1')}'`,
    "$p=Join-Path $env:TEMP 'gitmemo-install_windows_build_env.ps1'",
    'Invoke-WebRequest "$u/install_windows_build_env.ps1" -OutFile $p',
    '& powershell -NoProfile -ExecutionPolicy Bypass -File $p',
  ].join('\n')
}

function agentBuildScript(commandId) {
  return [
    "$ErrorActionPreference='Stop'",
    `$u='${publicUrl(lanAddresses()[0] || '127.0.0.1')}'`,
    `$jobId='${psSingleQuote(commandId)}'`,
    "$remoteRoot=Join-Path $HOME 'GitMemoRemote'",
    "$project=Join-Path $remoteRoot \"GitMemo-$jobId\"",
    "$archive=Join-Path $remoteRoot \"GitMemo-$jobId.tar.gz\"",
    'Write-Host "Preparing remote build workspace..."',
    "New-Item -ItemType Directory -Force -Path $remoteRoot | Out-Null",
    "if(Test-Path $project){Remove-Item -Recurse -Force $project}",
    "New-Item -ItemType Directory -Force -Path $project | Out-Null",
    'Write-Host "Downloading source archive..."',
    "Invoke-WebRequest \"$u/api/source.tar.gz\" -OutFile $archive",
    'Write-Host ("Downloaded source archive: {0:n0} bytes" -f (Get-Item $archive).Length)',
    'Write-Host "Extracting source archive..."',
    "tar -xzf $archive -C $project",
    "$env:npm_config_registry='https://registry.npmmirror.com'",
    "$env:npm_config_fetch_retries='5'",
    "$env:npm_config_fetch_retry_maxtimeout='120000'",
    "$env:npm_config_fetch_timeout='300000'",
    "$env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL='sparse'",
    "$env:CARGO_NET_RETRY='5'",
    "$env:CARGO_HTTP_TIMEOUT='600'",
    "Write-Host \"Using npm registry: $env:npm_config_registry\"",
    "$cargoDir=Join-Path $project '.cargo'",
    "New-Item -ItemType Directory -Force -Path $cargoDir | Out-Null",
    "$cargoConfig=@'",
    "[source.crates-io]",
    "replace-with = \"rsproxy-sparse\"",
    "",
    "[source.rsproxy-sparse]",
    "registry = \"sparse+https://rsproxy.cn/index/\"",
    "",
    "[net]",
    "git-fetch-with-cli = true",
    "'@",
    "Set-Content -Path (Join-Path $cargoDir 'config.toml') -Value $cargoConfig -Encoding UTF8",
    'Write-Host "Using Cargo sparse registry mirror: rsproxy.cn"',
    'Write-Host "Running Windows desktop build script..."',
    "& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $project 'scripts\\build_windows_desktop.ps1') -StageAssets",
    "$buildExit=$LASTEXITCODE",
    'if($buildExit -ne 0){ Write-Error "Windows desktop build script failed with exit code $buildExit"; exit $buildExit }',
    "$assets=Join-Path $project 'release-assets'",
    "if(Test-Path $assets){",
    "  Write-Host 'Uploading Windows artifacts back to Mac...'",
    "  Get-ChildItem $assets -File | ForEach-Object {",
    "    $name=[Uri]::EscapeDataString($_.Name)",
    "    $artifactUri=\"$u/api/agent/artifact?jobId=$jobId&filename=$name\"",
    "    if(Get-Command curl.exe -ErrorAction SilentlyContinue){",
    "      & curl.exe --fail --silent --show-error --request POST --connect-timeout 30 --max-time 300 --header 'Content-Type: application/octet-stream' --data-binary \"@$($_.FullName)\" $artifactUri | Out-Null",
    "      if($LASTEXITCODE -ne 0){ throw \"curl.exe failed to upload artifact $($_.Name) with exit code $LASTEXITCODE\" }",
    "    } else {",
    "      Invoke-WebRequest -TimeoutSec 300 -Method Post -Uri $artifactUri -InFile $_.FullName -ContentType 'application/octet-stream' | Out-Null",
    "    }",
    "    Write-Host \"Uploaded $($_.Name)\"",
    "  }",
    "}",
  ].join('\n')
}

function agentInstallLatestArtifactScript() {
  const artifact = latestWindowsInstaller()
  if (!artifact) throw new Error('No Windows installer artifact available')

  return [
    "$ErrorActionPreference='Stop'",
    `$installerUrl='${psSingleQuote(`${publicUrl(lanAddresses()[0] || '127.0.0.1')}${artifact.href}`)}'`,
    `$installerName='${psSingleQuote(artifact.name)}'`,
    "$downloadDir=Join-Path $env:TEMP 'GitMemoInstaller'",
    "$installer=Join-Path $downloadDir $installerName",
    "New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null",
    "Write-Host \"Downloading installer: $installerUrl\"",
    "Invoke-WebRequest -UseBasicParsing -Uri $installerUrl -OutFile $installer",
    "Write-Host (\"Downloaded installer: {0} ({1:n0} bytes)\" -f $installer, (Get-Item $installer).Length)",
    "try { Unblock-File -Path $installer -ErrorAction SilentlyContinue } catch { }",
    "Write-Host 'Installing GitMemo silently...'",
    "if($installerName -match '\\.msi$'){",
    "  $proc=Start-Process msiexec.exe -ArgumentList @('/i', $installer, '/qn', '/norestart') -Wait -PassThru",
    "} else {",
    "  $proc=Start-Process -FilePath $installer -ArgumentList @('/S') -Wait -PassThru",
    "}",
    "if($proc.ExitCode -ne 0){ throw \"Installer exited with code $($proc.ExitCode)\" }",
    "Write-Host 'Installer completed successfully.'",
    "$candidateRoots=@(",
    "  (Join-Path $env:LOCALAPPDATA 'Programs'),",
    "  $env:LOCALAPPDATA,",
    "  $env:ProgramFiles,",
    "  ${env:ProgramFiles(x86)}",
    ") | Where-Object { $_ -and (Test-Path $_) }",
    "$matches=@()",
    "foreach($root in $candidateRoots){",
    "  $matches += Get-ChildItem -Path $root -Filter '*GitMemo*.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 10",
    "}",
    "if($matches.Count -gt 0){",
    "  Write-Host 'Installed executable candidates:'",
    "  $matches | Select-Object -First 20 | ForEach-Object { Write-Host (\"  {0}\" -f $_.FullName) }",
    "} else {",
    "  Write-Host 'Install finished, but no GitMemo executable was found in common install roots.'",
    "}",
  ].join('\n')
}

function agentCaptureScreenshotScript(commandId) {
  return [
    "$ErrorActionPreference='Stop'",
    `$u='${publicUrl(lanAddresses()[0] || '127.0.0.1')}'`,
    `$jobId='${psSingleQuote(commandId)}'`,
    "$dir=Join-Path $env:TEMP 'GitMemoScreenshots'",
    "New-Item -ItemType Directory -Force -Path $dir | Out-Null",
    "$timestamp=Get-Date -Format 'yyyyMMdd-HHmmss'",
    "$file=Join-Path $dir (\"gitmemo-windows-screenshot-$timestamp.png\")",
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$win32=@'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class GitMemoCaptureWin32 {",
    "  [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);",
    "}",
    "'@",
    "try { Add-Type -TypeDefinition $win32 -ErrorAction SilentlyContinue } catch { }",
    "$currentPid=$PID",
    "$hidden=0",
    "$windowNamePattern='(?i)(GitMemo LAN agent|Windows PowerShell|PowerShell|Command Prompt|Debuggable Package|cmd\\.exe|powershell\\.exe)'",
    "Get-Process | Where-Object {",
    "  $_.Id -ne $currentPid -and $_.MainWindowHandle -ne 0 -and (",
    "    $_.ProcessName -match '^(powershell|pwsh|WindowsTerminal|cmd|OpenConsole)$' -or",
    "    $_.MainWindowTitle -match $windowNamePattern",
    "  )",
    "} | ForEach-Object {",
    "  try { if([GitMemoCaptureWin32]::ShowWindowAsync($_.MainWindowHandle, 6)){ $script:hidden++ } } catch { }",
    "}",
    "if($hidden -gt 0){ Write-Host \"Minimized $hidden terminal window(s) before screenshot.\"; Start-Sleep -Milliseconds 600 }",
    "$bounds=[System.Windows.Forms.SystemInformation]::VirtualScreen",
    "$bitmap=New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height",
    "$graphics=[System.Drawing.Graphics]::FromImage($bitmap)",
    "try {",
    "  $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)",
    "  $bitmap.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)",
    "} finally {",
    "  $graphics.Dispose()",
    "  $bitmap.Dispose()",
    "}",
    "Write-Host (\"Captured screenshot: {0} ({1:n0} bytes)\" -f $file, (Get-Item $file).Length)",
    "$name=[Uri]::EscapeDataString((Split-Path -Leaf $file))",
    "$uri=\"$u/api/agent/screenshot-upload?jobId=$jobId&filename=$name\"",
    "if(Get-Command curl.exe -ErrorAction SilentlyContinue){",
    "  & curl.exe --fail --silent --show-error --request POST --connect-timeout 30 --max-time 300 --header 'Content-Type: image/png' --data-binary \"@$file\" $uri | Out-Null",
    "  if($LASTEXITCODE -ne 0){ throw \"curl.exe failed to upload screenshot with exit code $LASTEXITCODE\" }",
    "} else {",
    "  Invoke-WebRequest -TimeoutSec 300 -Method Post -Uri $uri -InFile $file -ContentType 'image/png' | Out-Null",
    "}",
    "Write-Host 'Screenshot uploaded to Mac.'",
  ].join('\n')
}

function agentDiagnoseGitSyncScript() {
  return [
    "$ErrorActionPreference='Continue'",
    "function Write-Step([string]$name) { Write-Host ''; Write-Host \"== $name ==\" -ForegroundColor Cyan }",
    "function Read-ConfigValue([string]$text, [string]$key) {",
    "  $pattern = '(?m)^\\s*' + [regex]::Escape($key) + '\\s*=\\s*\"([^\"]*)\"'",
    "  $match = [regex]::Match($text, $pattern)",
    "  if($match.Success){ return $match.Groups[1].Value }",
    "  return ''",
    "}",
    "function Invoke-LoggedCommand([string]$label, [scriptblock]$script) {",
    "  Write-Step $label",
    "  try {",
    "    & $script 2>&1 | ForEach-Object { Write-Host $_ }",
    "    Write-Host \"exit=$LASTEXITCODE\"",
    "  } catch {",
    "    Write-Host $_.Exception.ToString() -ForegroundColor Red",
    "  }",
    "}",
    "function Resolve-AgentTool([string]$name) {",
    "  $cmd = Get-Command $name -ErrorAction SilentlyContinue",
    "  if($cmd){ return $cmd.Source }",
    "  $candidates = @(",
    "    (Join-Path $env:ProgramFiles \"Git\\usr\\bin\\$name.exe\"),",
    "    (Join-Path ${env:ProgramFiles(x86)} \"Git\\usr\\bin\\$name.exe\"),",
    "    (Join-Path $env:ProgramFiles \"Git\\mingw64\\bin\\$name.exe\"),",
    "    (Join-Path ${env:ProgramFiles(x86)} \"Git\\mingw64\\bin\\$name.exe\"),",
    "    (Join-Path $env:ProgramFiles \"Git\\cmd\\$name.exe\"),",
    "    (Join-Path ${env:ProgramFiles(x86)} \"Git\\cmd\\$name.exe\")",
    "  )",
    "  foreach($candidate in $candidates){ if($candidate -and (Test-Path $candidate)){ return $candidate } }",
    "  return ''",
    "}",
    "function Write-PublicKeySummary([string]$publicKey) {",
    "  $publicKey = $publicKey.Trim()",
    "  if(-not $publicKey){ return }",
    "  $parts = $publicKey -split ' '",
    "  if($parts.Length -ge 2) {",
    "    $short = $parts[1]",
    "    if($short.Length -gt 48){ $short = $short.Substring(0, 48) + '...' }",
    "    Write-Host \"public_key_type=$($parts[0])\"",
    "    Write-Host \"public_key_body_prefix=$short\"",
    "    try {",
    "      $keyBytes = [Convert]::FromBase64String($parts[1])",
    "      $sha = [System.Security.Cryptography.SHA256]::Create()",
    "      try {",
    "        $hash = $sha.ComputeHash($keyBytes)",
    "        $fingerprint = [Convert]::ToBase64String($hash).TrimEnd('=')",
    "        Write-Host \"public_key_sha256=SHA256:$fingerprint\"",
    "      } finally {",
    "        $sha.Dispose()",
    "      }",
    "    } catch {",
    "      Write-Host \"public_key_sha256=unavailable: $($_.Exception.Message)\"",
    "    }",
    "  }",
    "}",
    "function Read-OpenSshString([byte[]]$bytes, [ref]$offset) {",
    "  if($offset.Value + 4 -gt $bytes.Length){ throw 'Unexpected end of OpenSSH key data' }",
    "  $len = ([int]$bytes[$offset.Value] -shl 24) -bor ([int]$bytes[$offset.Value + 1] -shl 16) -bor ([int]$bytes[$offset.Value + 2] -shl 8) -bor [int]$bytes[$offset.Value + 3]",
    "  $offset.Value += 4",
    "  if($len -lt 0 -or $offset.Value + $len -gt $bytes.Length){ throw 'Invalid OpenSSH key string length' }",
    "  $value = [System.Text.Encoding]::ASCII.GetString($bytes, $offset.Value, $len)",
    "  $offset.Value += $len",
    "  return $value",
    "}",
    "function Write-PrivateKeyFormatSummary([string]$path) {",
    "  try {",
    "    $lines = Get-Content -Path $path -ErrorAction Stop",
    "    $body = ($lines | Where-Object { $_ -notmatch '^-----' }) -join ''",
    "    $bytes = [Convert]::FromBase64String($body)",
    "    $magic = [System.Text.Encoding]::ASCII.GetString($bytes, 0, [Math]::Min(15, $bytes.Length))",
    "    if($magic -ne \"openssh-key-v1`0\"){ Write-Host \"private_key_format=unknown\"; return }",
    "    $offset = 15",
    "    $refOffset = [ref]$offset",
    "    $cipher = Read-OpenSshString $bytes $refOffset",
    "    $kdf = Read-OpenSshString $bytes $refOffset",
    "    Write-Host \"private_key_format=openssh-key-v1\"",
    "    Write-Host \"private_key_cipher=$cipher\"",
    "    Write-Host \"private_key_kdf=$kdf\"",
    "    Write-Host (\"private_key_encrypted={0}\" -f (($cipher -ne 'none') -or ($kdf -ne 'none')))",
    "  } catch {",
    "    Write-Host \"private_key_format_check_failed=$($_.Exception.Message)\"",
    "  }",
    "}",
    "Write-Step 'Machine'",
    "Write-Host \"computer=$env:COMPUTERNAME\"",
    "Write-Host \"user=$env:USERNAME\"",
    "Write-Host \"home=$HOME\"",
    "Write-Host \"time=$((Get-Date).ToString('o'))\"",
    "Write-Step 'Tools'",
    "$sshExe = Resolve-AgentTool 'ssh'",
    "$sshKeygenExe = Resolve-AgentTool 'ssh-keygen'",
    "foreach($name in @('git','ssh','ssh-keygen')) {",
    "  $resolved = if($name -eq 'ssh') { $sshExe } elseif($name -eq 'ssh-keygen') { $sshKeygenExe } else { (Resolve-AgentTool $name) }",
    "  if($resolved){ Write-Host \"$name=$resolved\" } else { Write-Host \"$name=MISSING\" }",
    "}",
    "$syncDir = Join-Path $HOME '.gitmemo'",
    "$configPath = Join-Path $syncDir '.metadata\\config.toml'",
    "Write-Step 'GitMemo Config'",
    "Write-Host \"sync_dir=$syncDir exists=$(Test-Path $syncDir)\"",
    "Write-Host \"config=$configPath exists=$(Test-Path $configPath)\"",
    "$remote = ''",
    "$branch = ''",
    "$sshKeyPath = ''",
    "if(Test-Path $configPath) {",
    "  $configText = Get-Content -Raw -Path $configPath",
    "  $remote = Read-ConfigValue $configText 'remote'",
    "  $branch = Read-ConfigValue $configText 'branch'",
    "  $sshKeyPath = Read-ConfigValue $configText 'ssh_key_path'",
    "  $hasToken = [regex]::IsMatch($configText, '(?m)^\\s*access_token\\s*=\\s*\"[^\"]+\"')",
    "  Write-Host \"remote=$remote\"",
    "  Write-Host \"branch=$branch\"",
    "  Write-Host \"ssh_key_path=$sshKeyPath\"",
    "  Write-Host \"access_token_present=$hasToken\"",
    "} else {",
    "  Write-Host 'config file is missing'",
    "}",
    "if($remote -and $remote -notmatch '^(git@|ssh://)') {",
    "  Write-Host 'WARNING: remote is not an SSH URL, so Gitee SSH public keys will not be used.' -ForegroundColor Yellow",
    "}",
    "Write-Step 'SSH Key'",
    "$effectiveKey = $sshKeyPath",
    "if(-not $effectiveKey) {",
    "  foreach($candidate in @('id_ed25519','id_rsa','id_ecdsa')) {",
    "    $path = Join-Path (Join-Path $HOME '.ssh') $candidate",
    "    if(Test-Path $path){ $effectiveKey = $path; break }",
    "  }",
    "}",
    "Write-Host \"effective_key=$effectiveKey\"",
    "if($effectiveKey -and (Test-Path $effectiveKey)) {",
    "  Write-Host \"key_exists=True\"",
    "  Write-Host \"key_file=$((Get-Item $effectiveKey).FullName)\"",
    "  Write-Host \"key_size=$((Get-Item $effectiveKey).Length)\"",
    "  Write-PrivateKeyFormatSummary $effectiveKey",
    "  $existingPub = \"$effectiveKey.pub\"",
    "  $tmpPub = Join-Path $env:TEMP 'gitmemo-diagnose-key.pub'",
    "  if(Test-Path $existingPub) {",
    "    Write-Host \"public_key_file=$existingPub\"",
    "    $pub = (Get-Content -Raw -Path $existingPub).Trim()",
    "    Write-PublicKeySummary $pub",
    "    if($sshKeygenExe){ & $sshKeygenExe -lf $existingPub 2>&1 | ForEach-Object { Write-Host $_ } }",
    "  } elseif($sshKeygenExe) {",
    "    & $sshKeygenExe -y -f $effectiveKey | Set-Content -Path $tmpPub -Encoding ascii",
    "    if($LASTEXITCODE -eq 0 -and (Test-Path $tmpPub)) {",
    "      $pub = (Get-Content -Raw -Path $tmpPub).Trim()",
    "      Write-PublicKeySummary $pub",
    "      & $sshKeygenExe -lf $tmpPub 2>&1 | ForEach-Object { Write-Host $_ }",
    "    } else {",
    "      Write-Host 'failed to derive public key from private key' -ForegroundColor Red",
    "    }",
    "  } else {",
    "    Write-Host 'ssh-keygen is unavailable and .pub file is missing' -ForegroundColor Red",
    "  }",
    "} else {",
    "  Write-Host 'key_exists=False' -ForegroundColor Yellow",
    "}",
    "Write-Step 'Repository State'",
    "if(Test-Path $syncDir) {",
    "  Push-Location $syncDir",
    "  try {",
    "    git rev-parse --show-toplevel 2>&1 | ForEach-Object { Write-Host $_ }",
    "    git remote -v 2>&1 | ForEach-Object { Write-Host $_ }",
    "    git branch --show-current 2>&1 | ForEach-Object { Write-Host \"current_branch=$_\" }",
    "    git status --short --branch 2>&1 | ForEach-Object { Write-Host $_ }",
    "  } finally { Pop-Location }",
    "} else {",
    "  Write-Host 'sync dir is missing'",
    "}",
    "$sshOptions = '-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2'",
    "if($effectiveKey -and (Test-Path $effectiveKey)) {",
    "  $env:GIT_SSH_COMMAND = \"ssh -i `\"$effectiveKey`\" -o IdentitiesOnly=yes $sshOptions\"",
    "} else {",
    "  $env:GIT_SSH_COMMAND = \"ssh $sshOptions\"",
    "}",
    "$env:GIT_TERMINAL_PROMPT = '0'",
    "$env:GCM_INTERACTIVE = 'Never'",
    "Write-Step 'Git SSH Command'",
    "Write-Host $env:GIT_SSH_COMMAND",
    "$sshHost = 'gitee.com'",
    "if($remote -match '@([^:/]+)[:/]') { $sshHost = $matches[1] }",
    "if($sshExe) {",
    "  Invoke-LoggedCommand \"SSH auth test git@$sshHost\" { & $sshExe -i $effectiveKey -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -T \"git@$sshHost\" }",
    "} else {",
    "  Write-Step \"SSH auth test git@$sshHost\"",
    "  Write-Host 'ssh executable is unavailable outside Git; skipping direct ssh test.' -ForegroundColor Yellow",
    "}",
    "Invoke-LoggedCommand 'Git ls-remote origin' {",
    "  if(Test-Path $syncDir) {",
    "    Push-Location $syncDir",
    "    try { git ls-remote --heads origin } finally { Pop-Location }",
    "  } else {",
    "    Write-Host 'sync dir is missing'",
    "  }",
    "}",
    "Invoke-LoggedCommand 'Git ls-remote origin with verbose SSH' {",
    "  if(Test-Path $syncDir) {",
    "    $previousSshCommand = $env:GIT_SSH_COMMAND",
    "    try {",
    "      if($effectiveKey -and (Test-Path $effectiveKey)) {",
    "        $env:GIT_SSH_COMMAND = \"ssh -vvv -i `\"$effectiveKey`\" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2\"",
    "      } else {",
    "        $env:GIT_SSH_COMMAND = \"ssh -vvv -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2\"",
    "      }",
    "      Push-Location $syncDir",
    "      try { git ls-remote --heads origin } finally { Pop-Location }",
    "    } finally {",
    "      $env:GIT_SSH_COMMAND = $previousSshCommand",
    "    }",
    "  } else {",
    "    Write-Host 'sync dir is missing'",
    "  }",
    "}",
  ].join('\n')
}

function agentCreateGitmemoGiteeKeyScript() {
  return [
    "$ErrorActionPreference='Stop'",
    "function Get-SshFingerprint([string]$publicKey) {",
    "  $parts = $publicKey.Trim() -split ' '",
    "  if($parts.Length -lt 2){ return '' }",
    "  $keyBytes = [Convert]::FromBase64String($parts[1])",
    "  $sha = [System.Security.Cryptography.SHA256]::Create()",
    "  try {",
    "    $hash = $sha.ComputeHash($keyBytes)",
    "    return 'SHA256:' + ([Convert]::ToBase64String($hash).TrimEnd('='))",
    "  } finally {",
    "    $sha.Dispose()",
    "  }",
    "}",
    "function Find-GitBash {",
    "  $candidates = @(",
    "    (Join-Path $env:ProgramFiles 'Git\\bin\\bash.exe'),",
    "    (Join-Path ${env:ProgramFiles(x86)} 'Git\\bin\\bash.exe'),",
    "    (Join-Path $env:ProgramFiles 'Git\\usr\\bin\\bash.exe'),",
    "    (Join-Path ${env:ProgramFiles(x86)} 'Git\\usr\\bin\\bash.exe'),",
    "    (Join-Path $env:ProgramFiles 'Git\\mingw64\\bin\\bash.exe'),",
    "    (Join-Path ${env:ProgramFiles(x86)} 'Git\\mingw64\\bin\\bash.exe')",
    "  )",
    "  foreach($candidate in $candidates){ if($candidate -and (Test-Path $candidate)){ return $candidate } }",
    "  return ''",
    "}",
    "function Find-SshKeygen {",
    "  $cmd = Get-Command ssh-keygen -ErrorAction SilentlyContinue",
    "  if($cmd){ return $cmd.Source }",
    "  $candidates = @(",
    "    (Join-Path $env:WINDIR 'Sysnative\\OpenSSH\\ssh-keygen.exe'),",
    "    (Join-Path $env:WINDIR 'System32\\OpenSSH\\ssh-keygen.exe'),",
    "    (Join-Path $env:ProgramFiles 'Git\\usr\\bin\\ssh-keygen.exe'),",
    "    (Join-Path ${env:ProgramFiles(x86)} 'Git\\usr\\bin\\ssh-keygen.exe'),",
    "    (Join-Path $env:ProgramFiles 'Git\\mingw64\\bin\\ssh-keygen.exe'),",
    "    (Join-Path ${env:ProgramFiles(x86)} 'Git\\mingw64\\bin\\ssh-keygen.exe')",
    "  )",
    "  foreach($candidate in $candidates){ if($candidate -and (Test-Path $candidate)){ return $candidate } }",
    "  return ''",
    "}",
    "function Ensure-SshKeygen {",
    "  $sshKeygen = Find-SshKeygen",
    "  if($sshKeygen){ return $sshKeygen }",
    "  Write-Host 'ssh-keygen was not found; installing Windows OpenSSH Client...'",
    "  $capability = Get-WindowsCapability -Online | Where-Object { $_.Name -like 'OpenSSH.Client*' } | Select-Object -First 1",
    "  if(-not $capability){ throw 'OpenSSH.Client Windows capability was not found.' }",
    "  if($capability.State -ne 'Installed') {",
    "    Add-WindowsCapability -Online -Name $capability.Name | Out-Host",
    "  }",
    "  $sshKeygen = Find-SshKeygen",
    "  if(-not $sshKeygen){ throw 'ssh-keygen is still unavailable after installing OpenSSH Client.' }",
    "  return $sshKeygen",
    "}",
    "$sshDir = Join-Path $HOME '.ssh'",
    "New-Item -ItemType Directory -Force -Path $sshDir | Out-Null",
    "$timestamp = Get-Date -Format 'yyyyMMddHHmmss'",
    "$keyName = \"id_ed25519_gitmemo_gitee_$timestamp\"",
    "$keyPath = Join-Path $sshDir $keyName",
    "$bash = Find-GitBash",
    "$comment = \"gitmemo-gitee-$env:COMPUTERNAME-$timestamp\"",
    "if($bash) {",
    "  Write-Host \"Using Git Bash: $bash\"",
    "  $bashCommand = \"mkdir -p ~/.ssh && ssh-keygen -q -t ed25519 -f ~/.ssh/$keyName -N '' -C '$comment'\"",
    "  & $bash -lc $bashCommand",
    "} else {",
    "  $sshKeygen = Ensure-SshKeygen",
    "  Write-Host \"Using ssh-keygen: $sshKeygen\"",
    "  $cmdLine = '\"' + $sshKeygen + '\" -q -t ed25519 -f \"' + $keyPath + '\" -N \"\" -C \"' + $comment + '\"'",
    "  & cmd.exe /C $cmdLine",
    "}",
    "if($LASTEXITCODE -ne 0){ throw \"ssh-keygen failed with exit code $LASTEXITCODE\" }",
    "if(-not (Test-Path $keyPath)){ throw \"Generated key was not found: $keyPath\" }",
    "$pubPath = \"$keyPath.pub\"",
    "$pub = (Get-Content -Raw -Path $pubPath).Trim()",
    "$fingerprint = Get-SshFingerprint $pub",
    "$configPath = Join-Path $HOME '.gitmemo\\.metadata\\config.toml'",
    "if(-not (Test-Path $configPath)){ throw \"GitMemo config was not found: $configPath\" }",
    "$backupPath = \"$configPath.backup-$timestamp\"",
    "Copy-Item $configPath $backupPath -Force",
    "$tomlPath = $keyPath.Replace('\\', '\\\\')",
    "$lines = @(Get-Content -Path $configPath)",
    "$next = New-Object System.Collections.Generic.List[string]",
    "$inGit = $false",
    "$setKey = $false",
    "$sawGit = $false",
    "foreach($line in $lines) {",
    "  if($line -match '^\\s*\\[[^\\]]+\\]\\s*$') {",
    "    if($inGit -and -not $setKey) {",
    "      $next.Add(\"ssh_key_path = `\"$tomlPath`\"\")",
    "      $setKey = $true",
    "    }",
    "    $inGit = ($line -match '^\\s*\\[git\\]\\s*$')",
    "    if($inGit){ $sawGit = $true }",
    "  }",
    "  if($inGit -and $line -match '^\\s*ssh_key_path\\s*=') {",
    "    if(-not $setKey){ $next.Add(\"ssh_key_path = `\"$tomlPath`\"\"); $setKey = $true }",
    "    continue",
    "  }",
    "  $next.Add($line)",
    "}",
    "if($inGit -and -not $setKey) { $next.Add(\"ssh_key_path = `\"$tomlPath`\"\"); $setKey = $true }",
    "if(-not $sawGit) {",
    "  $next.Insert(0, \"ssh_key_path = `\"$tomlPath`\"\")",
    "  $next.Insert(0, '[git]')",
    "}",
    "Set-Content -Path $configPath -Value $next -Encoding UTF8",
    "$savedText = Get-Content -Raw -Path $configPath",
    "if($savedText -notmatch [regex]::Escape($tomlPath)){ throw 'Failed to persist ssh_key_path in GitMemo config.' }",
    "Write-Host \"Generated key: $keyPath\"",
    "Write-Host \"Public key: $pubPath\"",
    "Write-Host \"Fingerprint: $fingerprint\"",
    "Write-Host \"GitMemo config backup: $backupPath\"",
    "Write-Host ''",
    "Write-Host 'Add this public key to Gitee:'",
    "Write-Host $pub",
  ].join('\n')
}

function pickDevice(body = {}) {
  const device = state.devices[Number(body.deviceIndex || 0)]
  if (!device) throw new Error('No paired device available')
  const address = String(body.address || device.addresses[0] || '').trim()
  if (!address) throw new Error('No address available for paired device')
  return { device, address }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, GITMEMO_WINDOWS_SSH_KEY: keyPath, ...(options.env || {}) },
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.on('close', (code) => resolve({ code, output }))
  })
}

function startJob(command, args) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const job = {
    id,
    command: [command, ...args].join(' '),
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    log: '',
  }
  state.jobs.unshift(job)
  state.jobs = state.jobs.slice(0, 10)
  saveState()

  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, GITMEMO_WINDOWS_SSH_KEY: keyPath },
  })

  const append = (chunk) => {
    job.log += chunk.toString()
    if (job.log.length > 200000) job.log = job.log.slice(-200000)
    saveState()
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.on('close', (code) => {
    job.status = code === 0 ? 'success' : 'failed'
    job.exitCode = code
    job.finishedAt = new Date().toISOString()
    saveState()
  })

  return job
}

function renderPage(req) {
  const hostAddress = normalizeRemoteAddress(req.socket.localAddress) || lanAddresses()[0] || '127.0.0.1'
  const urls = lanAddresses().map((address) => `${publicUrl(address)}/`)
  const bootstrap = bootstrapCommand(hostAddress)
  const install = installEnvCommand(hostAddress)
  const agent = agentCommand(hostAddress)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GitMemo Windows Pairing</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #16181d; }
    main { max-width: 980px; margin: 0 auto; padding: 32px 20px 56px; }
    section { background: #fff; border: 1px solid #d8dde6; border-radius: 8px; padding: 20px; margin-top: 16px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    p { line-height: 1.6; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #10141c; color: #edf3ff; border-radius: 8px; padding: 14px; }
    button { border: 1px solid #b7c1d1; background: #fff; color: #111827; border-radius: 6px; padding: 9px 12px; cursor: pointer; }
    button.primary { border-color: #1769e0; background: #1769e0; color: #fff; }
    button + button { margin-left: 8px; }
    .muted { color: #5f6b7a; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
    .device { border: 1px solid #e0e5ee; border-radius: 8px; padding: 12px; }
    .log { max-height: 420px; overflow: auto; }
    @media (prefers-color-scheme: dark) {
      body { background: #111318; color: #ecf0f7; }
      section { background: #181b22; border-color: #303744; }
      button { background: #202632; color: #f5f7fb; border-color: #4a5568; }
      button.primary { background: #4b8dff; border-color: #4b8dff; color: #07101f; }
      .muted { color: #a7b1c2; }
      .device { border-color: #303744; }
    }
  </style>
</head>
<body>
  <main>
    <h1>GitMemo Windows Pairing</h1>
    <p class="muted">Run these commands from the Windows computer on the same LAN.</p>

    <section>
      <h2>Open This Page From Windows</h2>
      <div class="grid">
        ${urls.map((url) => `<pre>${htmlEscape(url)}</pre>`).join('')}
      </div>
    </section>

    <section>
      <h2>1. Bootstrap SSH</h2>
      <p class="muted">Run in an elevated PowerShell window on Windows.</p>
      <pre id="bootstrap">${htmlEscape(bootstrap)}</pre>
      <button onclick="copyText('bootstrap')">Copy</button>
    </section>

    <section>
      <h2>2. Install Build Environment</h2>
      <p class="muted">Run in an elevated PowerShell window after SSH bootstrap. Open a new shell after installation.</p>
      <pre id="install">${htmlEscape(install)}</pre>
      <button onclick="copyText('install')">Copy</button>
    </section>

    <section>
      <h2>Fallback: LAN Agent Without SSH</h2>
      <p class="muted">Use this when Windows OpenSSH Server is stuck. Run in an elevated PowerShell window and keep it open.</p>
      <pre id="agent">${htmlEscape(agent)}</pre>
      <button onclick="copyText('agent')">Copy</button>
    </section>

    <section>
      <h2>Windows Artifacts</h2>
      <div id="artifacts" class="muted">No Windows artifacts yet.</div>
    </section>

    <section>
      <h2>Windows Screenshots</h2>
      <div id="screenshots" class="muted">No Windows screenshots yet.</div>
    </section>

    <section>
      <h2>3. Paired Devices</h2>
      <div id="devices" class="muted">Loading...</div>
      <p>
        <button onclick="refreshStatus()">Refresh</button>
        <button onclick="testSsh()">Test SSH</button>
        <button class="primary" onclick="startBuild()">Start Windows Build</button>
      </p>
    </section>

    <section>
      <h2>LAN Agents</h2>
      <div id="agents" class="muted">No LAN agent connected yet.</div>
      <p>
        <button onclick="testAgent()">Test Agent</button>
        <button onclick="preflightAgent()">Preflight Agent</button>
        <button onclick="installEnvViaAgent()">Install Build Env Via Agent</button>
        <button onclick="captureScreenshot()">Capture Screenshot</button>
        <button class="primary" onclick="startAgentBuild()">Start Build Via Agent</button>
      </p>
    </section>

    <section>
      <h2>Uploaded Windows Logs</h2>
      <p class="muted">If automatic upload fails, paste the Windows console output here and upload it.</p>
      <textarea id="manualLog" rows="8" style="box-sizing:border-box;width:100%;border:1px solid #b7c1d1;border-radius:8px;padding:10px;font:inherit;background:transparent;color:inherit;"></textarea>
      <p>
        <button onclick="uploadManualLog()">Upload Manual Log</button>
      </p>
      <div id="logs" class="muted">No uploaded logs yet.</div>
    </section>

    <section>
      <h2>Build Jobs</h2>
      <div id="jobs" class="muted">No jobs yet.</div>
    </section>
  </main>
  <script>
    async function copyText(id) {
      await navigator.clipboard.writeText(document.getElementById(id).textContent);
    }
    async function api(path, options = {}) {
      const response = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text); } catch { payload = text; }
      if (!response.ok) throw new Error(typeof payload === 'string' ? payload : payload.error || response.statusText);
      return payload;
    }
    function renderStatus(status) {
      const devices = document.getElementById('devices');
      if (!status.devices.length) {
        devices.textContent = 'No paired Windows device yet.';
      } else {
        devices.innerHTML = status.devices.map((device, index) => '<div class="device"><strong>' +
          device.username + '@' + device.computerName + '</strong><br>Addresses: ' +
          device.addresses.join(', ') + '<br>Port: ' + device.port + '<br>Paired: ' + device.pairedAt +
          '</div>').join('');
      }
      const artifacts = document.getElementById('artifacts');
      if (!status.artifacts || !status.artifacts.length) {
        artifacts.textContent = 'No Windows artifacts yet.';
      } else {
        artifacts.innerHTML = status.artifacts.map((artifact) => '<div class="device"><strong>' +
          escapeHtml(artifact.name) + '</strong><br><span class="muted">' +
          formatBytes(artifact.size) + ' - ' + escapeHtml(artifact.mtime) +
          '</span><p><a href="' + escapeHtml(artifact.href) + '">Download</a></p></div>').join('');
      }
      const screenshots = document.getElementById('screenshots');
      if (!status.screenshots || !status.screenshots.length) {
        screenshots.textContent = 'No Windows screenshots yet.';
      } else {
        screenshots.innerHTML = status.screenshots.slice(0, 6).map((shot) => '<div class="device"><strong>' +
          escapeHtml(shot.name) + '</strong><br><span class="muted">' +
          formatBytes(shot.size) + ' - ' + escapeHtml(shot.mtime) +
          '</span><p><a href="' + escapeHtml(shot.href) + '" target="_blank">Open</a></p>' +
          '<img alt="Windows screenshot" src="' + escapeHtml(shot.href) + '" style="max-width:100%;height:auto;border:1px solid #d8dde6;border-radius:6px;" /></div>').join('');
      }
      const jobs = document.getElementById('jobs');
      if (!status.jobs.length) {
        jobs.textContent = 'No jobs yet.';
      } else {
        jobs.innerHTML = status.jobs.map((job) => '<div class="device"><strong>' + job.status +
          '</strong> ' + job.command + '<br><span class="muted">' + job.startedAt +
          (job.finishedAt ? ' - ' + job.finishedAt : '') + '</span>' +
          (isCancellableAgentJob(job) ? '<p><button onclick="cancelAgentJob(\\'' + job.id + '\\')">Cancel Agent Job</button></p>' : '') +
          '<pre class="log">' +
          escapeHtml(job.log || '') + '</pre></div>').join('');
      }
      const agents = document.getElementById('agents');
      if (!status.agents.length) {
        agents.textContent = 'No LAN agent connected yet.';
      } else {
        agents.innerHTML = status.agents.map((agent) => '<div class="device"><strong>' +
          escapeHtml(agent.username || '') + '@' + escapeHtml(agent.computerName || '') +
          '</strong><br>ID: ' + escapeHtml(agent.id) +
          '<br>Address: ' + escapeHtml(agent.remoteAddress || '') +
          '<br>Last seen: ' + escapeHtml(agent.lastSeenAt || '') +
          '<br>Queued: ' + escapeHtml((agent.queue || []).length) + '</div>').join('');
      }
      const logs = document.getElementById('logs');
      if (!status.logs.length) {
        logs.textContent = 'No uploaded logs yet.';
      } else {
        logs.innerHTML = status.logs.map((entry) => '<div class="device"><strong>' +
          escapeHtml(entry.source) + '</strong> exit=' + escapeHtml(entry.exitCode) + ' ' +
          escapeHtml(entry.username || '') + '@' + escapeHtml(entry.computerName || '') +
          '<br><span class="muted">' + escapeHtml(entry.receivedAt) + ' from ' +
          escapeHtml(entry.remoteAddress || '') + '</span><pre class="log">' +
          escapeHtml(entry.log || '') + '</pre></div>').join('');
      }
    }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    }
    function formatBytes(value) {
      const bytes = Number(value || 0);
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }
    function isCancellableAgentJob(job) {
      return String(job.command || '').startsWith('[agent]') && ['queued', 'running', 'cancelling'].includes(job.status);
    }
    async function refreshStatus() {
      renderStatus(await api('/api/status'));
    }
    async function testSsh() {
      const result = await api('/api/test-ssh', { method: 'POST', body: '{}' });
      alert(result.output || ('Exit code: ' + result.code));
      await refreshStatus();
    }
    async function startBuild() {
      const result = await api('/api/build', { method: 'POST', body: '{}' });
      alert('Started build job ' + result.id);
      await refreshStatus();
    }
    async function testAgent() {
      const result = await api('/api/agent/test', { method: 'POST', body: '{}' });
      alert('Queued agent test job ' + result.id);
      await refreshStatus();
    }
    async function preflightAgent() {
      const result = await api('/api/agent/preflight', { method: 'POST', body: '{}' });
      alert('Queued agent preflight job ' + result.id);
      await refreshStatus();
    }
    async function installEnvViaAgent() {
      const result = await api('/api/agent/install-env', { method: 'POST', body: '{}' });
      alert('Queued build environment installation job ' + result.id);
      await refreshStatus();
    }
    async function startAgentBuild() {
      const result = await api('/api/agent/build', { method: 'POST', body: '{}' });
      alert('Queued agent build job ' + result.id);
      await refreshStatus();
    }
    async function captureScreenshot() {
      const result = await api('/api/agent/capture-screenshot', { method: 'POST', body: '{}' });
      alert('Queued screenshot job ' + result.id);
      await refreshStatus();
    }
    async function cancelAgentJob(jobId) {
      await api('/api/agent/cancel', { method: 'POST', body: JSON.stringify({ jobId }) });
      await refreshStatus();
    }
    async function uploadManualLog() {
      const textarea = document.getElementById('manualLog');
      const log = textarea.value.trim();
      if (!log) {
        alert('Paste log output first.');
        return;
      }
      await api('/api/log', {
        method: 'POST',
        body: JSON.stringify({
          source: 'manual',
          username: '',
          computerName: '',
          exitCode: null,
          log,
        }),
      });
      textarea.value = '';
      await refreshStatus();
    }
    refreshStatus();
    setInterval(refreshStatus, 3000);
  </script>
</body>
</html>`
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `localhost:${port}`}`)

    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, renderPage(req))
    }

    if (req.method === 'GET' && url.pathname === '/bootstrap_windows_ssh.ps1') {
      return sendText(res, 200, readFileSync(path.join(scriptsDir, 'bootstrap_windows_ssh.ps1')), 'text/plain; charset=utf-8')
    }

    if (req.method === 'GET' && url.pathname === '/install_windows_build_env.ps1') {
      return sendText(res, 200, readFileSync(path.join(scriptsDir, 'install_windows_build_env.ps1')), 'text/plain; charset=utf-8')
    }

    if (req.method === 'GET' && url.pathname === '/run_bootstrap.ps1') {
      return sendText(
        res,
        200,
        windowsLogRunnerScript({
          source: 'bootstrap',
          scriptName: 'bootstrap_windows_ssh.ps1',
          args: [
            "'-PublicKey'",
            `'${psSingleQuote(publicKey)}'`,
            "'-PairingServerUrl'",
            '$u',
          ],
        }, normalizeRemoteAddress(req.socket.localAddress) || lanAddresses()[0] || '127.0.0.1'),
        'text/plain; charset=utf-8',
      )
    }

    if (req.method === 'GET' && url.pathname === '/run_install_env.ps1') {
      return sendText(
        res,
        200,
        windowsLogRunnerScript({
          source: 'install-env',
          scriptName: 'install_windows_build_env.ps1',
        }, normalizeRemoteAddress(req.socket.localAddress) || lanAddresses()[0] || '127.0.0.1'),
        'text/plain; charset=utf-8',
      )
    }

    if (req.method === 'GET' && url.pathname === '/run_agent.ps1') {
      console.log(`Serving LAN agent script to ${normalizeRemoteAddress(req.socket.remoteAddress)}`)
      return sendText(
        res,
        200,
        windowsAgentScript(normalizeRemoteAddress(req.socket.localAddress) || lanAddresses()[0] || '127.0.0.1'),
        'text/plain; charset=utf-8',
      )
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      return send(res, 200, {
        devices: state.devices,
        jobs: state.jobs,
        logs: state.logs,
        agents: state.agents,
        artifacts: windowsArtifacts(),
        screenshots: windowsScreenshots(),
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/pair') {
      const body = await parseBody(req)
      const paired = upsertDevice(body, normalizeRemoteAddress(req.socket.remoteAddress))
      console.log(`Paired ${paired.username}@${paired.computerName}: ${paired.addresses.join(', ')}`)
      return send(res, 200, { ok: true, device: paired })
    }

    if (req.method === 'POST' && url.pathname === '/api/log') {
      const body = await parseLargeBody(req)
      const log = storeLog(body, normalizeRemoteAddress(req.socket.remoteAddress))
      console.log(`Received Windows log: ${log.source} exit=${log.exitCode}`)
      return send(res, 200, { ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/register') {
      const body = await parseBody(req)
      const agent = upsertAgent(body, normalizeRemoteAddress(req.socket.remoteAddress))
      console.log(`Agent connected: ${agent.id}`)
      return send(res, 200, { ok: true })
    }

    if (req.method === 'GET' && url.pathname === '/api/agent/next') {
      const agent = findAgent(url.searchParams.get('agentId') || '')
      agent.lastSeenAt = new Date().toISOString()
      const command = agent.queue.shift() || null
      if (command) {
        const job = state.jobs.find((candidate) => candidate.id === command.id)
        if (job) job.status = 'running'
      }
      saveState()
      return send(res, 200, command || {})
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/result') {
      const body = await parseLargeBody(req)
      setAgentJobResult(body)
      return send(res, 200, { ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/progress') {
      const body = await parseLargeBody(req)
      const job = setAgentJobProgress(body)
      return send(res, 200, { ok: true, cancel: Boolean(job?.cancelRequested) })
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/cancel') {
      const body = await parseBody(req)
      const job = cancelAgentJob(String(body.jobId || ''))
      return send(res, 200, { ok: true, job })
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/test') {
      const job = queueAgentCommand(defaultAgent(), 'Test Agent', agentTestScript())
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/preflight') {
      const job = queueAgentCommand(defaultAgent(), 'Preflight Agent', agentPreflightScript())
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/build-preflight') {
      const job = queueAgentCommand(defaultAgent(), 'Build Preflight Agent', agentBuildPreflightScript())
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/install-env') {
      const job = queueAgentCommand(defaultAgent(), 'Install Windows Build Environment', agentInstallEnvScript(), {
        timeoutMs: 2 * 60 * 60 * 1000,
      })
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/build') {
      const agent = defaultAgent()
      const job = queueAgentCommand(agent, 'Build Windows Desktop', '', {
        timeoutMs: 4 * 60 * 60 * 1000,
      })
      agent.queue[agent.queue.length - 1].script = agentBuildScript(job.id)
      saveState()
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/install-artifact') {
      const job = queueAgentCommand(defaultAgent(), 'Install Latest Windows Artifact', agentInstallLatestArtifactScript(), {
        timeoutMs: 15 * 60 * 1000,
      })
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/capture-screenshot') {
      const agent = defaultAgent()
      const job = queueAgentCommand(agent, 'Capture Windows Screenshot', '', {
        timeoutMs: 5 * 60 * 1000,
      })
      agent.queue[agent.queue.length - 1].script = agentCaptureScreenshotScript(job.id)
      saveState()
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/diagnose-git-sync') {
      const job = queueAgentCommand(defaultAgent(), 'Diagnose Git Sync', agentDiagnoseGitSyncScript(), {
        timeoutMs: 10 * 60 * 1000,
      })
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/create-gitee-ssh-key') {
      const job = queueAgentCommand(defaultAgent(), 'Create GitMemo Gitee SSH Key', agentCreateGitmemoGiteeKeyScript(), {
        timeoutMs: 5 * 60 * 1000,
      })
      return send(res, 200, job)
    }

    if (req.method === 'GET' && url.pathname === '/api/source.tar.gz') {
      res.writeHead(200, {
        'Content-Type': 'application/gzip',
        'Cache-Control': 'no-store',
      })
      const tar = spawn('tar', [
        '--exclude',
        '.git',
        '--exclude',
        '.DS_Store',
        '--exclude',
        '*/.DS_Store',
        '--exclude',
        '._*',
        '--exclude',
        '*/._*',
        '--exclude',
        '.claude',
        '--exclude',
        'target',
        '--exclude',
        'desktop/src-tauri/target',
        '--exclude',
        'desktop/src-tauri/gen/android',
        '--exclude',
        'desktop/node_modules',
        '--exclude',
        'desktop/dist',
        '--exclude',
        'website',
        '--exclude',
        'website/node_modules',
        '--exclude',
        'website/dist',
        '--exclude',
        'release-assets',
        '-czf',
        '-',
        '-C',
        root,
        '.',
      ], {
        env: { ...process.env, COPYFILE_DISABLE: '1' },
      })
      tar.stdout.pipe(res)
      tar.stderr.on('data', (chunk) => process.stderr.write(chunk))
      return
    }

    if (req.method === 'GET' && url.pathname.startsWith('/artifacts/windows/')) {
      const filename = path.basename(decodeURIComponent(url.pathname.slice('/artifacts/windows/'.length)))
      const filePath = path.join(root, 'release-assets', 'windows', filename)
      if (!filename || !existsSync(filePath)) return send(res, 404, { error: 'Artifact not found' })
      const stat = statSync(filePath)
      if (!stat.isFile()) return send(res, 404, { error: 'Artifact not found' })
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${headerValue(filename)}"`,
        'Cache-Control': 'no-store',
      })
      createReadStream(filePath).pipe(res)
      return
    }

    if (req.method === 'GET' && url.pathname.startsWith('/screenshots/windows/')) {
      const filename = path.basename(decodeURIComponent(url.pathname.slice('/screenshots/windows/'.length)))
      const filePath = path.join(stateDir, 'screenshots', filename)
      if (!filename || !existsSync(filePath)) return send(res, 404, { error: 'Screenshot not found' })
      const stat = statSync(filePath)
      if (!stat.isFile()) return send(res, 404, { error: 'Screenshot not found' })
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      })
      createReadStream(filePath).pipe(res)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/artifact') {
      const filename = path.basename(url.searchParams.get('filename') || '')
      if (!filename) return send(res, 400, { error: 'Missing filename' })
      const outDir = path.join(root, 'release-assets', 'windows')
      mkdirSync(outDir, { recursive: true })
      const outPath = path.join(outDir, filename)
      const writer = createWriteStream(outPath)
      req.pipe(writer)
      writer.on('finish', () => {
        console.log(`Downloaded Windows artifact: ${outPath}`)
        send(res, 200, { ok: true, path: outPath })
      })
      writer.on('error', (error) => {
        send(res, 500, { error: error.message })
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/screenshot-upload') {
      const filename = path.basename(url.searchParams.get('filename') || '')
      if (!filename) return send(res, 400, { error: 'Missing filename' })
      const outDir = path.join(stateDir, 'screenshots')
      mkdirSync(outDir, { recursive: true })
      const outPath = path.join(outDir, filename)
      const writer = createWriteStream(outPath)
      req.pipe(writer)
      writer.on('finish', () => {
        console.log(`Downloaded Windows screenshot: ${outPath}`)
        send(res, 200, { ok: true, path: outPath })
      })
      writer.on('error', (error) => {
        send(res, 500, { error: error.message })
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/test-ssh') {
      const body = await parseBody(req)
      const { device, address } = pickDevice(body)
      const remote = `${device.username}@${address}`
      const result = await runCommand('ssh', [
        '-i',
        keyPath,
        '-p',
        String(device.port || 22),
        '-o',
        'IdentitiesOnly=yes',
        '-o',
        'StrictHostKeyChecking=accept-new',
        '-o',
        'ConnectTimeout=10',
        remote,
        'hostname',
      ])
      return send(res, result.code === 0 ? 200 : 500, result)
    }

    if (req.method === 'POST' && url.pathname === '/api/build') {
      const body = await parseBody(req)
      const { device, address } = pickDevice(body)
      const remote = `${device.username}@${address}`
      const job = startJob('bash', [path.join(scriptsDir, 'windows_remote_build.sh'), remote, String(device.port || 22)])
      return send(res, 200, job)
    }

    return send(res, 404, { error: 'Not found' })
  } catch (error) {
    console.error(error)
    return send(res, 500, { error: error.message || String(error) })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log('GitMemo Windows pairing server is running.')
  console.log(`SSH key: ${keyPath}`)
  console.log('')
  console.log('Open one of these URLs from the Windows computer:')
  for (const address of lanAddresses()) {
    console.log(`  ${publicUrl(address)}/`)
  }
  console.log('')
  console.log('Keep this process running while pairing or building.')
})
