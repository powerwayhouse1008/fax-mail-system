# Windows Fax Mail Agent

This agent lets the web application queue a fax for a Windows PC. It supports:

- `windows_fax`: Windows Fax and Scan / a fax server. This mode passes the recipient number automatically.
- `sharp_pcfax`: prints the queued PDF through SumatraPDF, fills the SHARP recipient dialog, and starts transmission. This requires the SHARP PC-Fax driver and an interactive signed-in Windows session.

## Install

1. Apply `supabase/schema.sql` and set the same strong `DESKTOP_FAX_AGENT_KEY` on the web server and agent.
2. Run `build.bat` on Windows.
3. Create `%APPDATA%\FaxMailAgent\config.json` from `config.example.json`. Printer names must exactly match **Settings > Printers & scanners** (for example `SHARP MX-2661 FAX`).
4. Run `dist\FaxMailAgent.exe`. Register it as a logon scheduled task so it always receives jobs while the SHARP dialog can be automated.

Automated installation after building:

```powershell
.\install-agent.ps1 -ServerUrl "https://your-web-app.example.com" -AgentKey "same-value-as-DESKTOP_FAX_AGENT_KEY"
```

Each PC uses a distinct `agent_id`; select that ID in the web app. Treat `agent_key` as a password. Use HTTPS for `server_url`.
