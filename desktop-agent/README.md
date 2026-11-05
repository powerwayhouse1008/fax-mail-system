# Windows Fax Mail Agent

This agent lets the web application queue a fax for a Windows PC. It supports:

- `windows_fax`: Windows Fax and Scan / a fax server. This mode passes the recipient number automatically.
- `printer`: any installed printer or FAX print driver, including SHARP devices. Generic Windows print drivers do not expose a standard API for filling a vendor fax-recipient dialog, so a SHARP driver may still show its recipient window. Use Windows Fax mode or the SHARP vendor SDK for fully unattended dialing.

## Install

1. Apply `supabase/schema.sql` and set the same strong `DESKTOP_FAX_AGENT_KEY` on the web server and agent.
2. Run `build.bat` on Windows.
3. Create `%APPDATA%\FaxMailAgent\config.json` from `config.example.json`. Printer names must exactly match **Settings > Printers & scanners** (for example `SHARP MX-2661 FAX`).
4. Run `dist\FaxMailAgent.exe`. Add it to Windows Startup if it should always receive jobs.

Each PC uses a distinct `agent_id`; select that ID in the web app. Treat `agent_key` as a password. Use HTTPS for `server_url`.
