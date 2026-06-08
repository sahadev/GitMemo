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

const productName = 'LAN Control'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
const scriptsDir = path.join(root, 'scripts')
const stateDir = path.resolve(process.env.LAN_CONTROL_STATE_DIR || path.join(root, '.state'))
const artifactsDir = path.resolve(process.env.LAN_CONTROL_ARTIFACTS_DIR || path.join(root, 'artifacts'))
const screenshotsDir = path.join(stateDir, 'screenshots')
const statePath = path.join(stateDir, 'state.json')
const port = Number(process.env.LAN_CONTROL_PORT || '47832')
const keyPath = process.env.LAN_CONTROL_SSH_KEY || path.join(stateDir, 'ssh', 'lan_control_windows_ed25519')
const publicKeyPath = `${keyPath}.pub`

const state = loadState()
for (const key of ['devices', 'jobs', 'logs', 'agents']) {
  if (!Array.isArray(state[key])) state[key] = []
}
normalizeState()

function loadState() {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    return { devices: [], jobs: [], logs: [], agents: [] }
  }
}

function saveState() {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

function ensureKey() {
  if (!existsSync(keyPath)) {
    mkdirSync(path.dirname(keyPath), { recursive: true })
    const result = spawnSync('ssh-keygen', ['-t', 'ed25519', '-f', keyPath, '-N', '', '-C', 'lan-control-windows-remote'], {
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
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address)
    }
  }
  return addresses
}

function defaultHostAddress(req) {
  const localAddress = normalizeRemoteAddress(req?.socket?.localAddress)
  if (localAddress && !localAddress.startsWith('127.')) return localAddress
  return lanAddresses()[0] || localAddress || '127.0.0.1'
}

function normalizeRemoteAddress(value) {
  if (!value) return null
  return String(value).replace(/^::ffff:/, '')
}

function publicUrl(address = 'HOST_IP') {
  return `http://${address}:${port}`
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

function bootstrapCommand(address = 'HOST_IP') {
  const base = publicUrl(address)
  return `Set-ExecutionPolicy -Scope Process Bypass -Force; irm '${psSingleQuote(base)}/run_bootstrap.ps1' | iex`
}

function installEnvCommand(address = 'HOST_IP') {
  const base = publicUrl(address)
  return `Set-ExecutionPolicy -Scope Process Bypass -Force; irm '${psSingleQuote(base)}/run_install_env.ps1' | iex`
}

function agentCommand(address = 'HOST_IP') {
  const base = publicUrl(address)
  return `$ErrorActionPreference='Stop'; try { Set-ExecutionPolicy -Scope Process Bypass -Force; $p=Join-Path $env:TEMP 'lan-control-agent.ps1'; Invoke-WebRequest '${psSingleQuote(base)}/run_agent.ps1' -UseBasicParsing -OutFile $p; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; if($LASTEXITCODE -ne 0){ throw "LAN Control agent exited with code $LASTEXITCODE" } } catch { Write-Host ''; Write-Host 'LAN Control agent failed:' -ForegroundColor Red; Write-Host $_.Exception.ToString(); Read-Host 'Press Enter to close' }`
}

function windowsAgentScript(address = 'HOST_IP') {
  const base = publicUrl(address)
  return [
    "$ErrorActionPreference='Stop'",
    `$u='${psSingleQuote(base)}'`,
    "$agentId = \"$env:COMPUTERNAME-$env:USERNAME-\" + ([guid]::NewGuid().ToString('N'))",
    "$registerBody=@{agentId=$agentId;username=$env:USERNAME;computerName=$env:COMPUTERNAME;startedAt=(Get-Date).ToString('o');baseUrl=$u}|ConvertTo-Json -Depth 4",
    'Invoke-RestMethod -Method Post -Uri "$u/api/agent/register" -ContentType "application/json" -Body $registerBody | Out-Null',
    "Write-Host \"LAN Control agent connected: $agentId\" -ForegroundColor Green",
    "Write-Host 'Keep this window open while this machine is controlled over the LAN.'",
    "function Invoke-AgentCommand($command) {",
    "  $exit=0",
    "  $stdout=''",
    "  $stderr=''",
    "  try {",
    "    $safeId=([string]$command.id) -replace '[^A-Za-z0-9_.-]','_'",
    "    $prefix=Join-Path $env:TEMP \"lan-control-agent-$safeId\"",
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
    "    while(-not $proc.HasExited){",
    "      if([DateTime]::UtcNow -ge $deadline){",
    "        try { $proc.Kill() } catch { }",
    "        $exit=124",
    "        $timedOut=$true",
    "        $stderr=\"LAN Control command timed out after $([Math]::Round($timeoutMs / 1000)) seconds.\"",
    "        break",
    "      }",
    "      Start-Sleep -Seconds 5",
    "      $snapshot=Read-AgentLogSnapshot",
    "      if(Send-AgentProgress $snapshot){",
    "        try { $proc.Kill() } catch { }",
    "        $exit=130",
    "        $cancelled=$true",
    "        $stderr='LAN Control command cancelled.'",
    "        break",
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
    "      Write-Host \"Running LAN command: $($next.title)\" -ForegroundColor Cyan",
    "      Invoke-AgentCommand $next",
    "    }",
    "  } catch {",
    "    Write-Warning $_.Exception.Message",
    "  }",
    "  Start-Sleep -Seconds 2",
    "}",
  ].join('\n')
}

function windowsLogRunnerScript({ source, scriptName, args = [] }, address = 'HOST_IP') {
  const base = publicUrl(address)
  const psArgs = args.join(', ')
  return [
    "$ErrorActionPreference='Continue'",
    `$u='${psSingleQuote(base)}'`,
    `$p=Join-Path $env:TEMP '${psSingleQuote(scriptName)}'`,
    `$l=Join-Path $env:TEMP '${psSingleQuote(scriptName.replace(/\.ps1$/i, '.log'))}'`,
    `Invoke-WebRequest "$u/scripts/${psSingleQuote(scriptName)}" -OutFile $p`,
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
    'try { Invoke-RestMethod -Method Post -Uri "$u/api/log" -ContentType "application/json" -Body $body | Out-Null; $uploaded=$true } catch { Write-Warning "Failed to upload LAN Control log: $($_.Exception.Message)" }',
    "Write-Host ''",
    "if($uploaded){Write-Host 'Log uploaded to LAN Control.'}",
    "if($exit){Write-Host \"Command failed with exit code $exit.\" -ForegroundColor Red}else{Write-Host 'Command completed successfully.' -ForegroundColor Green}",
    "Read-Host 'Press Enter to close this window'",
  ].join('\n')
}

function parseBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > maxBytes) {
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (error) {
        const fallback = parseLenientAgentPayload(data)
        if (fallback) return resolve(fallback)
        reject(error)
      }
    })
  })
}

function parseLenientAgentPayload(data) {
  const agentId = data.match(/"agentId"\s*:\s*"([^"]+)"/)?.[1]
  const commandId = data.match(/"commandId"\s*:\s*"([^"]+)"/)?.[1]
  const exitCodeMatches = [...data.matchAll(/"exitCode"\s*:\s*(-?\d+)/g)]
  const exitCodeValue = exitCodeMatches.at(-1)?.[1]
  if (!agentId && !commandId) return null
  return {
    agentId: agentId || '',
    commandId: commandId || '',
    exitCode: exitCodeValue == null ? undefined : Number(exitCodeValue),
    log: stripInvalidJsonControls(data),
  }
}

function stripInvalidJsonControls(data) {
  return String(data).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

function looksLikeAgentFailure(log) {
  return /Command ".+" not found|RuntimeException|exited with code [1-9]\d*|terminating error|Exception calling/i.test(
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

function listFiles(dir, hrefPrefix) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .map((name) => {
      const filePath = path.join(dir, name)
      try {
        const stat = statSync(filePath)
        if (!stat.isFile()) return null
        return {
          name,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          href: `${hrefPrefix}/${encodeURIComponent(name)}`,
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)))
}

function artifacts() {
  return listFiles(artifactsDir, '/artifacts')
}

function screenshots() {
  return listFiles(screenshotsDir, '/screenshots')
}

function latestInstaller() {
  return artifacts().find((artifact) => /\.(exe|msi)$/i.test(artifact.name)) || null
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
  if (index >= 0) state.devices[index] = normalized
  else state.devices.unshift(normalized)
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
  state.logs = state.logs.slice(0, 30)
  saveState()
  return log
}

function upsertAgent(payload, requestAddress) {
  const agent = {
    id: String(payload.agentId || '').trim(),
    username: String(payload.username || '').trim(),
    computerName: String(payload.computerName || '').trim(),
    remoteAddress: requestAddress,
    baseUrl: String(payload.baseUrl || '').trim(),
    startedAt: String(payload.startedAt || new Date().toISOString()),
    lastSeenAt: new Date().toISOString(),
    queue: [],
  }
  if (!agent.id) throw new Error('Missing agentId')
  const index = state.agents.findIndex((candidate) => candidate.id === agent.id)
  if (index >= 0) state.agents[index] = { ...state.agents[index], ...agent, queue: state.agents[index].queue || [] }
  else state.agents.unshift(agent)
  saveState()
  return state.agents.find((candidate) => candidate.id === agent.id)
}

function findAgent(agentId) {
  const agent = state.agents.find((candidate) => candidate.id === agentId)
  if (!agent) throw new Error(`Unknown agent: ${agentId}`)
  if (!Array.isArray(agent.queue)) agent.queue = []
  return agent
}

function defaultAgent() {
  const agent = [...state.agents].sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))[0]
  if (!agent) throw new Error('No LAN agent connected')
  if (!Array.isArray(agent.queue)) agent.queue = []
  return agent
}

function agentBaseUrl(agent) {
  return agent.baseUrl || publicUrl(lanAddresses()[0] || '127.0.0.1')
}

function touchAgent(agentId) {
  const agent = state.agents.find((candidate) => candidate.id === agentId)
  if (agent) agent.lastSeenAt = new Date().toISOString()
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
  state.jobs = state.jobs.slice(0, 20)
  agent.queue.push({ id, title, script, timeoutMs: options.timeoutMs || 600000 })
  saveState()
  return job
}

function setAgentJobProgress(payload) {
  touchAgent(String(payload.agentId || ''))
  const job = state.jobs.find((candidate) => candidate.id === payload.commandId)
  if (!job) return null
  if (['success', 'failed', 'cancelled'].includes(job.status)) return job
  job.status = job.cancelRequested ? 'cancelling' : 'running'
  if (typeof payload.log === 'string' && payload.log.length > 0) job.log = payload.log
  if (job.log.length > 200000) job.log = job.log.slice(-200000)
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

function pickDevice(body = {}) {
  const device = state.devices[Number(body.deviceIndex || 0)]
  if (!device) throw new Error('No paired SSH device available')
  const address = String(body.address || device.addresses[0] || '').trim()
  if (!address) throw new Error('No address available for paired device')
  return { device, address }
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, LAN_CONTROL_SSH_KEY: keyPath },
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

function agentTestScript() {
  return ['hostname', 'whoami', '$PSVersionTable.PSVersion.ToString()', 'Get-Location'].join('\n')
}

function agentPreflightScript() {
  return [
    '$commands = "winget", "git", "ssh", "ssh-keygen", "node", "corepack", "pnpm", "python", "py", "rustup", "cargo"',
    'foreach($name in $commands){',
    '  $cmd = Get-Command $name -ErrorAction SilentlyContinue',
    '  if($cmd){ Write-Host "$name => $($cmd.Source)" } else { Write-Host "$name => MISSING" }',
    '}',
    'Write-Host ""',
    'Write-Host "PATH:"',
    '$env:PATH -split ";" | ForEach-Object { Write-Host "  $_" }',
  ].join('\n')
}

function agentInstallEnvScript(baseUrl) {
  return [
    "$ErrorActionPreference='Stop'",
    `$u='${psSingleQuote(baseUrl)}'`,
    "$p=Join-Path $env:TEMP 'lan-control-install_windows_build_env.ps1'",
    'Invoke-WebRequest "$u/scripts/install_windows_build_env.ps1" -OutFile $p',
    '& powershell -NoProfile -ExecutionPolicy Bypass -File $p',
  ].join('\n')
}

function agentInstallArtifactScript(baseUrl, artifact) {
  if (!artifact) throw new Error('No installer artifact available')
  return [
    "$ErrorActionPreference='Stop'",
    `$installerUrl='${psSingleQuote(`${baseUrl}${artifact.href}`)}'`,
    `$installerName='${psSingleQuote(artifact.name)}'`,
    "$downloadDir=Join-Path $env:TEMP 'LanControlInstaller'",
    "$installer=Join-Path $downloadDir $installerName",
    "New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null",
    "Write-Host \"Downloading artifact: $installerUrl\"",
    "Invoke-WebRequest -UseBasicParsing -Uri $installerUrl -OutFile $installer",
    "Write-Host (\"Downloaded artifact: {0} ({1:n0} bytes)\" -f $installer, (Get-Item $installer).Length)",
    "try { Unblock-File -Path $installer -ErrorAction SilentlyContinue } catch { }",
    "if($installerName -match '\\.msi$'){",
    "  Write-Host 'Installing MSI silently...'",
    "  $proc=Start-Process msiexec.exe -ArgumentList @('/i', $installer, '/qn', '/norestart') -Wait -PassThru",
    "} else {",
    "  Write-Host 'Running installer with /S...'",
    "  $proc=Start-Process -FilePath $installer -ArgumentList @('/S') -Wait -PassThru",
    "}",
    "if($proc.ExitCode -ne 0){ throw \"Installer exited with code $($proc.ExitCode)\" }",
    "Write-Host 'Artifact installation completed successfully.'",
  ].join('\n')
}

function agentCaptureScreenshotScript(commandId, baseUrl) {
  return [
    "$ErrorActionPreference='Stop'",
    `$u='${psSingleQuote(baseUrl)}'`,
    `$jobId='${psSingleQuote(commandId)}'`,
    "$dir=Join-Path $env:TEMP 'LanControlScreenshots'",
    "New-Item -ItemType Directory -Force -Path $dir | Out-Null",
    "$timestamp=Get-Date -Format 'yyyyMMdd-HHmmss'",
    "$file=Join-Path $dir (\"lan-control-screenshot-$timestamp.png\")",
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$win32=@'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class LanControlCaptureWin32 {",
    "  [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);",
    "}",
    "'@",
    "try { Add-Type -TypeDefinition $win32 -ErrorAction SilentlyContinue } catch { }",
    "$currentPid=$PID",
    "$hidden=0",
    "$windowNamePattern='(?i)(LAN Control agent|Windows PowerShell|PowerShell|Command Prompt|Debuggable Package|cmd\\.exe|powershell\\.exe)'",
    "Get-Process | Where-Object {",
    "  $_.Id -ne $currentPid -and $_.MainWindowHandle -ne 0 -and (",
    "    $_.ProcessName -match '^(powershell|pwsh|WindowsTerminal|cmd|OpenConsole)$' -or",
    "    $_.MainWindowTitle -match $windowNamePattern",
    "  )",
    "} | ForEach-Object {",
    "  try { if([LanControlCaptureWin32]::ShowWindowAsync($_.MainWindowHandle, 6)){ $script:hidden++ } } catch { }",
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
    "Write-Host 'Screenshot uploaded.'",
  ].join('\n')
}

function renderPage(req) {
  const hostAddress = defaultHostAddress(req)
  const urls = lanAddresses().map((address) => `${publicUrl(address)}/`)
  const bootstrap = bootstrapCommand(hostAddress)
  const install = installEnvCommand(hostAddress)
  const agent = agentCommand(hostAddress)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${productName}</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #16181d; }
    main { max-width: 1080px; margin: 0 auto; padding: 28px 20px 56px; }
    section { background: #fff; border: 1px solid #d8dde6; border-radius: 8px; padding: 18px; margin-top: 16px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    p { line-height: 1.55; }
    a { color: #1769e0; }
    code, pre, textarea { font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #10141c; color: #edf3ff; border-radius: 8px; padding: 14px; }
    textarea { box-sizing: border-box; width: 100%; border: 1px solid #b7c1d1; border-radius: 8px; padding: 10px; background: transparent; color: inherit; }
    button { border: 1px solid #b7c1d1; background: #fff; color: #111827; border-radius: 6px; padding: 9px 12px; cursor: pointer; margin: 0 8px 8px 0; }
    button.primary { border-color: #1769e0; background: #1769e0; color: #fff; }
    .muted { color: #5f6b7a; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .item { border: 1px solid #e0e5ee; border-radius: 8px; padding: 12px; margin-top: 10px; }
    .log { max-height: 420px; overflow: auto; }
    img.shot { max-width: 100%; height: auto; border: 1px solid #d8dde6; border-radius: 6px; }
    @media (prefers-color-scheme: dark) {
      body { background: #111318; color: #ecf0f7; }
      section { background: #181b22; border-color: #303744; }
      button { background: #202632; color: #f5f7fb; border-color: #4a5568; }
      button.primary { background: #4b8dff; border-color: #4b8dff; color: #07101f; }
      .muted { color: #a7b1c2; }
      .item { border-color: #303744; }
    }
  </style>
</head>
<body>
  <main>
    <h1>${productName}</h1>
    <p class="muted">Local-network control for Windows verification machines.</p>

    <section>
      <h2>Open From Windows</h2>
      <div class="grid">${urls.map((url) => `<pre>${htmlEscape(url)}</pre>`).join('')}</div>
    </section>

    <section>
      <h2>LAN Agent</h2>
      <pre id="agent">${htmlEscape(agent)}</pre>
      <button onclick="copyText('agent')">Copy Agent Command</button>
    </section>

    <section>
      <h2>Optional SSH Bootstrap</h2>
      <pre id="bootstrap">${htmlEscape(bootstrap)}</pre>
      <button onclick="copyText('bootstrap')">Copy SSH Bootstrap</button>
    </section>

    <section>
      <h2>Optional Build Environment</h2>
      <pre id="install">${htmlEscape(install)}</pre>
      <button onclick="copyText('install')">Copy Installer Command</button>
    </section>

    <section>
      <h2>Artifacts</h2>
      <div id="artifacts" class="muted">Loading...</div>
    </section>

    <section>
      <h2>Screenshots</h2>
      <div id="screenshots" class="muted">Loading...</div>
    </section>

    <section>
      <h2>SSH Devices</h2>
      <div id="devices" class="muted">Loading...</div>
      <p>
        <button onclick="refreshStatus()">Refresh</button>
        <button onclick="testSsh()">Test SSH</button>
      </p>
    </section>

    <section>
      <h2>LAN Agents</h2>
      <div id="agents" class="muted">Loading...</div>
      <p>
        <button onclick="testAgent()">Test Agent</button>
        <button onclick="preflightAgent()">Preflight</button>
        <button onclick="installEnvViaAgent()">Install Build Env</button>
        <button onclick="captureScreenshot()">Capture Screenshot</button>
        <button class="primary" onclick="installLatestArtifact()">Install Latest Artifact</button>
      </p>
      <textarea id="customScript" rows="8" placeholder="PowerShell script to run on the connected Windows agent"></textarea>
      <p><button class="primary" onclick="runPowerShell()">Run PowerShell</button></p>
    </section>

    <section>
      <h2>Uploaded Logs</h2>
      <textarea id="manualLog" rows="7" placeholder="Paste Windows console output here"></textarea>
      <p><button onclick="uploadManualLog()">Upload Manual Log</button></p>
      <div id="logs" class="muted">Loading...</div>
    </section>

    <section>
      <h2>Jobs</h2>
      <div id="jobs" class="muted">Loading...</div>
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
    function renderStatus(status) {
      const artifacts = document.getElementById('artifacts');
      if (!status.artifacts.length) {
        artifacts.textContent = 'No artifacts yet. Put installers in the artifacts directory.';
      } else {
        artifacts.innerHTML = status.artifacts.map((artifact) => '<div class="item"><strong>' +
          escapeHtml(artifact.name) + '</strong><br><span class="muted">' + formatBytes(artifact.size) +
          ' - ' + escapeHtml(artifact.mtime) + '</span><p><a href="' +
          escapeHtml(artifact.href) + '">Download</a></p></div>').join('');
      }

      const screenshots = document.getElementById('screenshots');
      if (!status.screenshots.length) {
        screenshots.textContent = 'No screenshots yet.';
      } else {
        screenshots.innerHTML = status.screenshots.slice(0, 8).map((shot) => '<div class="item"><strong>' +
          escapeHtml(shot.name) + '</strong><br><span class="muted">' + formatBytes(shot.size) +
          ' - ' + escapeHtml(shot.mtime) + '</span><p><a href="' + escapeHtml(shot.href) +
          '" target="_blank">Open</a></p><img class="shot" alt="Windows screenshot" src="' +
          escapeHtml(shot.href) + '" /></div>').join('');
      }

      const devices = document.getElementById('devices');
      if (!status.devices.length) {
        devices.textContent = 'No paired SSH device yet.';
      } else {
        devices.innerHTML = status.devices.map((device) => '<div class="item"><strong>' +
          escapeHtml(device.username) + '@' + escapeHtml(device.computerName) + '</strong><br>Addresses: ' +
          escapeHtml(device.addresses.join(', ')) + '<br>Port: ' + escapeHtml(device.port) +
          '<br>Paired: ' + escapeHtml(device.pairedAt) + '</div>').join('');
      }

      const agents = document.getElementById('agents');
      if (!status.agents.length) {
        agents.textContent = 'No LAN agent connected yet.';
      } else {
        agents.innerHTML = status.agents.map((agent) => '<div class="item"><strong>' +
          escapeHtml(agent.username || '') + '@' + escapeHtml(agent.computerName || '') +
          '</strong><br>ID: ' + escapeHtml(agent.id) +
          '<br>Address: ' + escapeHtml(agent.remoteAddress || '') +
          '<br>Base URL: ' + escapeHtml(agent.baseUrl || '') +
          '<br>Last seen: ' + escapeHtml(agent.lastSeenAt || '') +
          '<br>Queued: ' + escapeHtml((agent.queue || []).length) + '</div>').join('');
      }

      const logs = document.getElementById('logs');
      if (!status.logs.length) {
        logs.textContent = 'No uploaded logs yet.';
      } else {
        logs.innerHTML = status.logs.map((entry) => '<div class="item"><strong>' +
          escapeHtml(entry.source) + '</strong> exit=' + escapeHtml(entry.exitCode) + ' ' +
          escapeHtml(entry.username || '') + '@' + escapeHtml(entry.computerName || '') +
          '<br><span class="muted">' + escapeHtml(entry.receivedAt) + ' from ' +
          escapeHtml(entry.remoteAddress || '') + '</span><pre class="log">' +
          escapeHtml(entry.log || '') + '</pre></div>').join('');
      }

      const jobs = document.getElementById('jobs');
      if (!status.jobs.length) {
        jobs.textContent = 'No jobs yet.';
      } else {
        jobs.innerHTML = status.jobs.map((job) => '<div class="item"><strong>' + escapeHtml(job.status) +
          '</strong> ' + escapeHtml(job.command) + '<br><span class="muted">' + escapeHtml(job.startedAt) +
          (job.finishedAt ? ' - ' + escapeHtml(job.finishedAt) : '') + '</span>' +
          (isCancellableAgentJob(job) ? '<p><button onclick="cancelAgentJob(\\'' + escapeHtml(job.id) + '\\')">Cancel Agent Job</button></p>' : '') +
          '<pre class="log">' + escapeHtml(job.log || '') + '</pre></div>').join('');
      }
    }
    async function refreshStatus() {
      renderStatus(await api('/api/status'));
    }
    async function testSsh() {
      const result = await api('/api/test-ssh', { method: 'POST', body: '{}' });
      alert(result.output || ('Exit code: ' + result.code));
      await refreshStatus();
    }
    async function testAgent() {
      const result = await api('/api/agent/test', { method: 'POST', body: '{}' });
      alert('Queued agent test job ' + result.id);
      await refreshStatus();
    }
    async function preflightAgent() {
      const result = await api('/api/agent/preflight', { method: 'POST', body: '{}' });
      alert('Queued preflight job ' + result.id);
      await refreshStatus();
    }
    async function installEnvViaAgent() {
      const result = await api('/api/agent/install-env', { method: 'POST', body: '{}' });
      alert('Queued build environment installation job ' + result.id);
      await refreshStatus();
    }
    async function captureScreenshot() {
      const result = await api('/api/agent/capture-screenshot', { method: 'POST', body: '{}' });
      alert('Queued screenshot job ' + result.id);
      await refreshStatus();
    }
    async function installLatestArtifact() {
      const result = await api('/api/agent/install-artifact', { method: 'POST', body: '{}' });
      alert('Queued artifact installation job ' + result.id);
      await refreshStatus();
    }
    async function runPowerShell() {
      const textarea = document.getElementById('customScript');
      const script = textarea.value.trim();
      if (!script) {
        alert('Enter a PowerShell script first.');
        return;
      }
      const result = await api('/api/agent/run-powershell', {
        method: 'POST',
        body: JSON.stringify({ title: 'Custom PowerShell', script }),
      });
      alert('Queued PowerShell job ' + result.id);
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
        body: JSON.stringify({ source: 'manual', username: '', computerName: '', exitCode: null, log }),
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
    const localAddress = defaultHostAddress(req)

    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, renderPage(req))
    }

    if (req.method === 'GET' && url.pathname === '/scripts/bootstrap_windows_ssh.ps1') {
      return sendText(res, 200, readFileSync(path.join(scriptsDir, 'bootstrap_windows_ssh.ps1')), 'text/plain; charset=utf-8')
    }

    if (req.method === 'GET' && url.pathname === '/scripts/install_windows_build_env.ps1') {
      return sendText(res, 200, readFileSync(path.join(scriptsDir, 'install_windows_build_env.ps1')), 'text/plain; charset=utf-8')
    }

    if (req.method === 'GET' && url.pathname === '/run_bootstrap.ps1') {
      return sendText(
        res,
        200,
        windowsLogRunnerScript(
          {
            source: 'bootstrap',
            scriptName: 'bootstrap_windows_ssh.ps1',
            args: [
              "'-PublicKey'",
              `'${psSingleQuote(publicKey)}'`,
              "'-PairingServerUrl'",
              '$u',
              "'-MacPrivateKeyPath'",
              `'${psSingleQuote(keyPath)}'`,
            ],
          },
          localAddress,
        ),
        'text/plain; charset=utf-8',
      )
    }

    if (req.method === 'GET' && url.pathname === '/run_install_env.ps1') {
      return sendText(
        res,
        200,
        windowsLogRunnerScript({ source: 'install-env', scriptName: 'install_windows_build_env.ps1' }, localAddress),
        'text/plain; charset=utf-8',
      )
    }

    if (req.method === 'GET' && url.pathname === '/run_agent.ps1') {
      console.log(`Serving LAN agent script to ${normalizeRemoteAddress(req.socket.remoteAddress)}`)
      return sendText(res, 200, windowsAgentScript(localAddress), 'text/plain; charset=utf-8')
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      return send(res, 200, {
        devices: state.devices,
        jobs: state.jobs,
        logs: state.logs,
        agents: state.agents,
        artifacts: artifacts(),
        screenshots: screenshots(),
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/pair') {
      const body = await parseBody(req)
      const paired = upsertDevice(body, normalizeRemoteAddress(req.socket.remoteAddress))
      console.log(`Paired ${paired.username}@${paired.computerName}: ${paired.addresses.join(', ')}`)
      return send(res, 200, { ok: true, device: paired })
    }

    if (req.method === 'POST' && url.pathname === '/api/log') {
      const body = await parseBody(req, 4 * 1024 * 1024)
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

    if (req.method === 'POST' && url.pathname === '/api/agent/progress') {
      const body = await parseBody(req, 4 * 1024 * 1024)
      const job = setAgentJobProgress(body)
      return send(res, 200, { ok: true, cancel: Boolean(job?.cancelRequested) })
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/result') {
      const body = await parseBody(req, 4 * 1024 * 1024)
      setAgentJobResult(body)
      return send(res, 200, { ok: true })
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
      const job = queueAgentCommand(defaultAgent(), 'Preflight', agentPreflightScript())
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/install-env') {
      const agent = defaultAgent()
      const job = queueAgentCommand(agent, 'Install Windows Build Environment', agentInstallEnvScript(agentBaseUrl(agent)), {
        timeoutMs: 2 * 60 * 60 * 1000,
      })
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/install-artifact') {
      const agent = defaultAgent()
      const artifact = latestInstaller()
      const job = queueAgentCommand(agent, 'Install Latest Artifact', agentInstallArtifactScript(agentBaseUrl(agent), artifact), {
        timeoutMs: 30 * 60 * 1000,
      })
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/capture-screenshot') {
      const agent = defaultAgent()
      const job = queueAgentCommand(agent, 'Capture Screenshot', '', { timeoutMs: 5 * 60 * 1000 })
      agent.queue[agent.queue.length - 1].script = agentCaptureScreenshotScript(job.id, agentBaseUrl(agent))
      saveState()
      return send(res, 200, job)
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/run-powershell') {
      const body = await parseBody(req)
      const script = String(body.script || '').trim()
      if (!script) return send(res, 400, { error: 'Missing script' })
      const title = String(body.title || 'Custom PowerShell').trim().slice(0, 80) || 'Custom PowerShell'
      const timeoutMs = Number(body.timeoutMs || 10 * 60 * 1000)
      const job = queueAgentCommand(defaultAgent(), title, script, { timeoutMs })
      return send(res, 200, job)
    }

    if (req.method === 'GET' && url.pathname.startsWith('/artifacts/')) {
      const filename = path.basename(decodeURIComponent(url.pathname.slice('/artifacts/'.length)))
      const filePath = path.join(artifactsDir, filename)
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

    if (req.method === 'GET' && url.pathname.startsWith('/screenshots/')) {
      const filename = path.basename(decodeURIComponent(url.pathname.slice('/screenshots/'.length)))
      const filePath = path.join(screenshotsDir, filename)
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

    if (req.method === 'POST' && url.pathname === '/api/agent/screenshot-upload') {
      const filename = path.basename(url.searchParams.get('filename') || '')
      if (!filename) return send(res, 400, { error: 'Missing filename' })
      mkdirSync(screenshotsDir, { recursive: true })
      const outPath = path.join(screenshotsDir, filename)
      const writer = createWriteStream(outPath)
      req.pipe(writer)
      writer.on('finish', () => {
        console.log(`Downloaded Windows screenshot: ${outPath}`)
        send(res, 200, { ok: true, path: outPath })
      })
      writer.on('error', (error) => send(res, 500, { error: error.message }))
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/agent/artifact-upload') {
      const filename = path.basename(url.searchParams.get('filename') || '')
      if (!filename) return send(res, 400, { error: 'Missing filename' })
      mkdirSync(artifactsDir, { recursive: true })
      const outPath = path.join(artifactsDir, filename)
      const writer = createWriteStream(outPath)
      req.pipe(writer)
      writer.on('finish', () => {
        console.log(`Downloaded Windows artifact: ${outPath}`)
        send(res, 200, { ok: true, path: outPath })
      })
      writer.on('error', (error) => send(res, 500, { error: error.message }))
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

    return send(res, 404, { error: 'Not found' })
  } catch (error) {
    console.error(error)
    return send(res, 500, { error: error.message || String(error) })
  }
})

server.listen(port, '0.0.0.0', () => {
  mkdirSync(artifactsDir, { recursive: true })
  console.log(`${productName} server is running.`)
  console.log(`SSH key: ${keyPath}`)
  console.log(`State: ${stateDir}`)
  console.log(`Artifacts: ${artifactsDir}`)
  console.log('')
  console.log('Open one of these URLs from the Windows computer:')
  for (const address of lanAddresses()) {
    console.log(`  ${publicUrl(address)}/`)
  }
  console.log('')
  console.log('Keep this process running while controlling Windows.')
})
