// The server -> client half of the TableX contract.
//
// The property names are pinned with [JsonPropertyName] instead of relying on
// ASP.NET Core's camelCase default. The wire format is normative — every TableX
// adapter reads `items`/`total`/`totalPages` — so it must not change when an app
// sets a different JsonSerializerOptions.PropertyNamingPolicy for its own DTOs.

using System.Text.Json.Serialization;

namespace TableX.AspNetCore;

/// <summary>
/// Exactly one page of rows plus the FULL filtered count, as every TableX
/// adapter expects it.
/// </summary>
/// <typeparam name="T">The row type.</typeparam>
/// <remarks>
/// Serializes as
/// <c>{ "items": [...], "page": 2, "pageSize": 25, "total": 1284, "totalPages": 52 }</c>.
/// <para>
/// <see cref="Total"/> is the count after search and filters but before paging —
/// it is what drives the pager, so returning <c>Items.Count</c> there silently
/// collapses the grid to a single page.
/// </para>
/// </remarks>
public sealed class PagedResponse<T>
{
    /// <summary>Create an empty response.</summary>
    public PagedResponse()
    {
    }

    /// <summary>Create a response for one page of rows.</summary>
    /// <param name="items">The rows on this page.</param>
    /// <param name="page">The 1-based page number these rows came from.</param>
    /// <param name="pageSize">The rows-per-page used to produce them.</param>
    /// <param name="total">The total number of rows matching the query, across all pages.</param>
    /// <exception cref="ArgumentNullException"><paramref name="items"/> is <see langword="null"/>.</exception>
    public PagedResponse(IReadOnlyList<T> items, int page, int pageSize, int total)
    {
        ArgumentNullException.ThrowIfNull(items);
        Items = items;
        Page = page;
        PageSize = pageSize;
        Total = total;
    }

    /// <summary>The rows on this page — never the full dataset.</summary>
    [JsonPropertyName("items")]
    public IReadOnlyList<T> Items { get; init; } = Array.Empty<T>();

    /// <summary>The 1-based page number these rows came from.</summary>
    [JsonPropertyName("page")]
    public int Page { get; init; } = 1;

    /// <summary>The rows-per-page used to produce this page.</summary>
    [JsonPropertyName("pageSize")]
    public int PageSize { get; init; } = PageSizes.Default;

    /// <summary>
    /// The total number of rows matching the query's search and filters, across
    /// every page. This is what the pager counts with.
    /// </summary>
    [JsonPropertyName("total")]
    public int Total { get; init; }

    /// <summary>
    /// Page count derived from <see cref="Total"/> and <see cref="PageSize"/>.
    /// Always at least 1, so the pager has something to render when there are no rows.
    /// </summary>
    [JsonPropertyName("totalPages")]
    public int TotalPages =>
        Math.Max(1, (int)Math.Ceiling(Math.Max(0, Total) / (double)Math.Max(1, PageSize)));
}
