# Desktop app

This is a thin Windows client. It opens the central Next.js server; Fax API credentials never ship with the desktop app.

Set `FAX_SERVER_URL` before packaging. The value is embedded into the installer and the desktop app never receives the Fax API token.

Example on PowerShell:

```powershell
$env:FAX_SERVER_URL = "https://fax.example.com"
npm run desktop:dist
```
