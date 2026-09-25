using TableX.AspNetCore;
using TableX.Example.Blazor.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseAntiforgery();

var statuses = new[] { "Probation", "Permanent", "Temporary", "Resigned", "Consultant" };
var companies = new[] { "IPAI", "CIS", "NexGrid", "Acme Corp" };
var departments = new[] { "Engineering", "Marketing", "Sales", "Support", "HR" };

var employees = Enumerable.Range(1, 150).Select(i => new Employee
{
    Id = $"EMP{i:D4}",
    Name = i switch
    {
        1 => "Manju Singh",
        2 => "Ravi Kumar",
        3 => "Satish Ramjanam",
        4 => "Pawan Diwakar",
        _ => $"Employee {i}"
    },
    Email = $"employee{i}@example.com",
    Company = companies[i % companies.Length],
    Status = statuses[i % statuses.Length],
    Mobile = $"98{i:D8}",
    Department = departments[i % departments.Length],
    Score = Math.Round(60.0 + (i * 7 % 40) + (i % 10) * 0.1, 1),
}).ToList();

app.MapGet("/api/employees", (TableXQuery query) =>
{
    return employees.AsQueryable().ToPagedResponse(query, options => options
        .Sortable(e => e.Id, e => e.Name, e => e.Company, e => e.Status, e => e.Department, e => e.Score)
        .Searchable(e => e.Name, e => e.Email, e => e.Company, e => e.Id)
        .Filterable("status", e => e.Status)
        .Filterable("company", e => e.Company)
        .Filterable("department", e => e.Department)
        .DefaultSort(e => e.Id, SortDirection.Ascending));
});

app.MapRazorComponents<TableX.Example.Blazor.App>()
    .AddInteractiveServerRenderMode();

app.Run();
