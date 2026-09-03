# 💻 NexGrid Examples

This directory contains complete, runnable example applications demonstrating NexGrid across different frameworks and languages:

| Example Directory | Language / Framework | Description |
| :--- | :--- | :--- |
| 💛 [**`react-javascript/`**](react-javascript/) | **React (Pure JavaScript / JSX)** | Complete React + Vite app written in plain `.jsx` with zero TypeScript required. Features client-side pagination, summary aggregations, and JSDoc typing. |
| ⚛️ [**`react-vite/`**](react-vite/) | **React (TypeScript / TSX)** | Controlled grid with simulated server-side pagination, custom cell badges, multi-column sorting, and mock API. |
| 🌐 [**`nextjs/`**](nextjs/) | **Next.js (App Router)** | Server Components, URL-synchronized query parameters (`useUrlQuery`), and server actions. |
| 🅰️ [**`angular/`**](angular/) | **Angular 17+ (Standalone)** | Modern Angular standalone component using Signals, typed columns, and client/server pagination. |
| 🍦 [**`vanilla-html/`**](vanilla-html/) | **Vanilla HTML / JS** | Zero-build HTML page using `<script src="tablex.global.js">` directly in the browser. |
| 🔷 [**`aspnet-mvc/`**](aspnet-mvc/) | **ASP.NET Core MVC** | Tag Helpers `<table-x>` with EF Core query translation, sorting, and Excel export. |

---

## 🚀 Running Any Example Locally

Each example is self-contained. Navigate to its folder and run:

```bash
cd examples/<example-folder>
npm install
npm run dev
```
