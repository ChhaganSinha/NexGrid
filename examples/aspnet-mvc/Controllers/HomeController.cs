using Microsoft.AspNetCore.Mvc;
using NexGrid.AspNetCore;
using NexGrid.Example.Mvc.Models;

namespace NexGrid.Example.Mvc.Controllers;

/// <summary>
/// The page that hosts the grid, and the endpoint that feeds it.
/// </summary>
public sealed class HomeController : Controller
{
    private readonly StudentStore _store;

    public HomeController(StudentStore store) => _store = store;

    /// <summary>The Razor view containing the &lt;nex-grid&gt; Tag Helper.</summary>
    public IActionResult Index()
    {
        ViewData["Statuses"] = StudentStore.Statuses;
        return View();
    }

    /// <summary>
    /// GET /api/students — one page of rows for a NexGrid request.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Two things are doing all the work:
    /// </para>
    /// <para>
    /// <b><c>NexGridQuery query</c></b> binds itself off the query string. There
    /// is no <c>[FromQuery]</c>, no startup registration, and no validation to
    /// write: parsing mirrors <c>@nexgrid/core</c>'s <c>parseQuery</c> exactly,
    /// including how it degrades. <c>?page=0</c> becomes page 1,
    /// <c>?pageSize=99999</c> becomes 10, <c>?sort=:desc</c> is dropped. A
    /// hand-edited URL produces a usable grid rather than a 400 in the middle of
    /// a paginated table.
    /// </para>
    /// <para>
    /// <b><c>ToPagedResponse</c></b> applies search, filters, sorting and paging
    /// in that order — matching decides which rows count, so it runs before the
    /// count the pager is drawn from — and returns
    /// <c>{ items, page, pageSize, total, totalPages }</c>, the shape every
    /// NexGrid adapter expects.
    /// </para>
    /// <para>
    /// The <c>options</c> lambda is the SECURITY BOUNDARY, not a convenience.
    /// Column ids arrive from a public query string, so anyone can ask to sort
    /// by <c>passwordHash</c> or filter on <c>isDeleted</c>. Nothing is sortable,
    /// searchable or filterable unless it is named here; a key that is not in
    /// the allowlist is dropped without ever reaching a member. There is no
    /// reflection path from a query-string value to a property, which is why
    /// there is nothing to escape and nothing to sanitise.
    /// </para>
    /// <para>
    /// Against EF Core this is the same method with
    /// <c>db.Students.AsNoTracking()</c> in place of <c>_store.Query</c> and
    /// <c>ToPagedResponseAsync(..., ct)</c> in place of the sync call; it leaves
    /// as two SQL statements — a COUNT and a windowed SELECT.
    /// </para>
    /// </remarks>
    [HttpGet("/api/students")]
    [Produces("application/json")]
    public PagedResponse<Student> Students(NexGridQuery query) =>
        _store.Query.ToPagedResponse(query, options => options
            .Sortable(
                s => s.Name,
                s => s.Email,
                s => s.Department,
                s => s.Status,
                s => s.Score,
                s => s.EnrolledAt,
                s => s.Scholarship)
            .Searchable(
                s => s.Name,
                s => s.Email,
                s => s.Department)
            .Filterable("status", s => s.Status)
            .Filterable("department", s => s.Department)
            // Worth setting on every grid: Skip/Take over an unordered query has
            // no defined row order, so without it a user can page forward and
            // see the same record twice.
            .DefaultSort(s => s.EnrolledAt, SortDirection.Descending));

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error() => View();
}
