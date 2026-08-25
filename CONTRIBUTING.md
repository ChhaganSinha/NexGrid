# Contributing to TableX

Thank you for your interest in contributing! TableX is an open-source, MIT-licensed
project and we welcome issues, discussions, and pull requests.

## Repository layout

```
packages/core       @tablex/core       Framework-agnostic engine (types, state, export, theme CSS)
packages/vanilla    @tablex/vanilla    Zero-dependency DOM renderer (also powers ASP.NET)
packages/react      @tablex/react      React / Next.js component
packages/angular    @tablex/angular    Angular standalone component
dotnet/             TableX.AspNetCore  ASP.NET Core Tag Helper + IQueryable server extensions
examples/           Runnable sample apps for every platform
docs/               Documentation (guides + API reference)
```

## Prerequisites

- Node.js >= 18 and npm >= 9
- .NET SDK 8.0+ (only for the ASP.NET package)

## Getting started

```bash
npm install          # installs all JS workspaces
npm run build        # builds core -> vanilla -> react -> angular
npm run typecheck    # strict TypeScript across all packages
```

For the .NET package:

```bash
cd dotnet
dotnet build
```

## Development guidelines

1. **`@tablex/core` is the contract.** Query/response types, pagination math,
   export logic, and the CSS theme live there. Framework adapters must not fork
   this logic — import it.
2. **Feature parity across adapters.** A feature added to one adapter (React,
   Angular, vanilla) should be added to all of them, or tracked with an issue.
3. **Server-driven by design.** The grid never sorts/filters/paginates
   client-side. All data operations are expressed as `QueryState` and answered
   with `PagedResponse<T>`. Do not add client-side data processing.
4. **Zero runtime dependencies.** Packages must not add runtime dependencies
   without prior discussion in an issue.
5. **Accessibility is not optional.** Interactive elements need accessible
   names; tables need captions; keyboard operation must keep working.
6. **Strict TypeScript.** All packages compile under `strict` with
   `noUncheckedIndexedAccess`.

## Commit / PR conventions

- Use clear, imperative commit messages (`Add column pinning to react adapter`).
- One logical change per PR; include a description of *why*, not just *what*.
- Update documentation in `docs/` when behavior changes.
- Add or update tests where the package has them.

## Reporting bugs

Open an issue with:
- the package and version (`@tablex/react 0.1.0`, `TableX.AspNetCore 0.1.0`, ...)
- a minimal reproduction (StackBlitz / repo / code snippet)
- expected vs actual behavior

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
