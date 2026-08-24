// Nothing NexGrid-specific has to be registered here.
//
// `NexGridQuery` binds itself (it carries its own [ModelBinder]), the Tag
// Helpers are discovered from _ViewImports.cshtml, and the browser bundle and
// stylesheet are static web assets that `UseStaticFiles` already serves.
//
// The one line that is about this example rather than about NexGrid is the
// in-memory store: a real app would register a DbContext instead, and the
// controller would not change.

using NexGrid.Example.Mvc.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();

// Stands in for `builder.Services.AddDbContext<AppDbContext>(...)`.
builder.Services.AddSingleton<StudentStore>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

// Serves both wwwroot/ and the RCL's _content/NexGrid.AspNetCore/ assets.
app.UseStaticFiles();

app.UseRouting();

// Attribute-routed actions (the /api/students endpoint) …
app.MapControllers();

// … and the conventional MVC route for the page itself.
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
