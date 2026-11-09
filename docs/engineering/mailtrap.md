# Mailtrap email integration

MentorMAMA uses Django's email interface through `django-anymail` and Mailtrap's
HTTP API. The application does not call Mailtrap directly from authentication
views.

## Environments

- Local development uses Django's console backend regardless of inherited
  environment variables. The outbox and worker still run, but rendered
  messages are printed to the API/worker console and do not consume Mailtrap
  quota.
- QA and staging may set `USE_MAILTRAP=true` and provide a
  `MAILTRAP_SANDBOX_ID`. Messages are captured and are not delivered to real
  recipients.
- Production sets `USE_MAILTRAP=true`, provides `MAILTRAP_API_TOKEN`, leaves
  `MAILTRAP_SANDBOX_ID` empty, and uses a verified Mailtrap sending domain.
- Automated tests use Django's locmem backend and never contact Mailtrap.

The Mailtrap API backend is intentional: it uses HTTPS and switches between
Sandbox and production by the presence of `MAILTRAP_SANDBOX_ID`. SMTP remains a
fallback integration option if a deployment environment later requires it.

Never commit `MAILTRAP_API_TOKEN`, place it in frontend variables, or paste it
into application logs. If a token is exposed, revoke it in Mailtrap and issue a
replacement.
