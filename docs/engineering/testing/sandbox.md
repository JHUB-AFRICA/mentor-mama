# Provider Sandbox Matrix

| Provider or dependency | Sandbox/test mode | Credentials source | Verification notes |
|---|---|---|---|
| M-Pesa | Not used in the pilot workflow | None | Agent verification makes no M-Pesa requests. |
| Email/OTP | Mailtrap Sandbox for local, QA, and staging | Local environment only; never printed or committed | Existing authentication tests use the dedicated local E2E account and no personal mailbox. |
| Offline session reliability | Synthetic browser request interruption plus browser IndexedDB | None | Playwright aborts only the local session POST. The queue contains synthetic test data and reconnects to the local API. |

Production credentials are prohibited in agent-run VERIFY unless a human authorizes a scoped production smoke test for that session.
