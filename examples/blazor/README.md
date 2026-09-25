# 🔷 TableX Blazor (.NET 8) Example

This is a complete, runnable **Blazor Server / Web App** demonstrating TableX native Blazor components (`<TableX>` and `<TableXColumn>`) with server-side pagination, multi-column filtering, global search, and Excel export.

## Features Demonstrated

- 🔷 **Native Blazor Components**: `<TableX TItem="Employee">` and `<TableXColumn>` with type-safe parameters.
- ⚡ **Zero SignalR Latency**: Table interactions (filtering, sorting, density, Excel export) execute on the client with zero network hops.
- 🔍 **Interactive Column Filters**: Multi-choice dropdown filtering (`FilterOptions="Probation,Permanent,Temporary,Resigned,Consultant"`).
- 📊 **1-Click Full-Dataset Export**: Direct client-side Excel export covering all 150 rows.
- 🔄 **EF Core / LINQ Binding**: Minimal API endpoint using `.ToPagedResponse(query, ...)`.

## Running the Example Locally

From this directory:

```bash
dotnet run
```

Then open `http://localhost:5000` (or the port printed in your console) in your browser.
