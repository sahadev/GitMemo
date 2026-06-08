# LAN Control

LAN Control is a standalone local-network control tool for Windows verification machines.
It is intentionally self-contained and does not depend on the host repository.

## Start

```bash
cd lan-control
npm start
```

Open the printed URL from a Windows computer on the same LAN. The page provides
copyable PowerShell commands for:

- starting the LAN Agent without SSH;
- optional OpenSSH bootstrap;
- optional Windows build environment installation.

## Runtime Data

By default, all runtime state stays inside this directory:

- state and logs: `.state/state.json`
- generated SSH key: `.state/ssh/lan_control_windows_ed25519`
- screenshots: `.state/screenshots/`
- files served to Windows: `artifacts/`

Drop an installer into `artifacts/`, then use **Install Latest Artifact** from
the LAN Agent section.

## Environment Variables

- `LAN_CONTROL_PORT`: server port, default `47832`
- `LAN_CONTROL_STATE_DIR`: custom state directory
- `LAN_CONTROL_ARTIFACTS_DIR`: custom artifact directory
- `LAN_CONTROL_SSH_KEY`: custom SSH private key path

## Security Notes

LAN Control currently has no authentication. Run it only on a trusted local
network, stop it when verification is finished, and do not expose the port to
the public internet.
