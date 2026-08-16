# OGS Account

When you sign in to OGS, Seki-Sabaki remembers the session only if Electron
`safeStorage` encryption is available.

The app stores an encrypted OGS JWT and encrypted OGS session cookie in
`ogs-session.json` under Electron's user data directory, alongside non-secret
account metadata needed to restore the session. It does not store your OGS
password and does not write OGS credentials to `settings.json`.

On app start, the OGS session is restored through the main process. If encrypted
storage is unavailable, if Electron reports the unprotected `basic_text`
backend, or if the stored credentials cannot be decrypted, Seki-Sabaki leaves
you signed out and you can sign in again.

Use **Logout** in the OGS workspace to clear the stored JWT, session cookie, and
account metadata.
