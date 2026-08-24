# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.x     | ✅        |

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report privately via GitHub's *Security → Report a vulnerability* on this repository, or email **Chhagan Sinha** directly at [sinhachhagan@outlook.com](mailto:sinhachhagan@outlook.com). Include:

- affected package(s) and version(s)
- a description of the issue and its impact
- reproduction steps or a proof of concept


You will receive an acknowledgement within 72 hours. We aim to release a fix
and coordinated disclosure within 90 days.

## Design notes relevant to security

- **CSV/Excel export** neutralizes spreadsheet formula injection: cell values
  beginning with `=`, `+`, `-`, `@`, tab, or CR are prefixed with `'` per OWASP
  guidance.
- **Server extensions (`NexGrid.AspNetCore`)** only sort/filter fields that the
  host application explicitly allowlists — arbitrary property paths from the
  query string are never reflected into expressions.
- The vanilla renderer writes cell values as **text nodes** (never `innerHTML`)
  unless a consumer explicitly returns a DOM node from a custom renderer.
