// The client -> server half of the NexGrid contract.
//
//   ?page=2&pageSize=25&sort=name:asc&sort=createdAt:desc&q=smith&filter[status]=Active
//
// Parsing is a line-by-line port of `parseQuery` in packages/core/src/serialize.ts,
// including the parts that look sloppy but are not:
//
//   * Numbers use JavaScript's parseInt semantics, not int.TryParse. `?page=2x`
//     is 2 in the browser, so it is 2 here; a server that disagreed with the
//     client about what a URL means would page differently after a refresh.
//   * Nothing is ever rejected. A bad page becomes 1, a page size outside the
//     allowlist becomes 10, a sort token with no field is dropped. The grid must
//     survive a hand-edited or truncated URL, and a 400 in the middle of a
//     paginated table is a worse answer than the first page.
//
// Every value here is UNTRUSTED. Field names reach a query only by matching an
// allowlist registered in NexGridQueryOptions; see NexGridQueryableExtensions.

using System.Collections.ObjectModel;
using System.Globalization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Primitives;

namespace NexGrid.AspNetCore;

/// <summary>
/// A NexGrid page/sort/search/filter request, bound from the query string.
/// </summary>
/// <remarks>
/// <para>
/// In an MVC or API controller the type binds itself — the
/// <see cref="ModelBinderAttribute"/> below points at
/// <see cref="NexGridQueryModelBinder"/>, so no startup registration is needed:
/// </para>
/// <code>
/// [HttpGet("/api/students")]
/// public Task&lt;PagedResponse&lt;Student&gt;&gt; Get(NexGridQuery query) => ...;
/// </code>
/// <para>
/// In a minimal API the <see cref="BindAsync(HttpContext)"/> hook does the same job:
/// </para>
/// <code>
/// app.MapGet("/api/students", (NexGridQuery query, AppDbContext db) => ...);
/// </code>
/// <para>
/// Anywhere else — a Razor Page, a middleware, a test — call
/// <see cref="Parse(IQueryCollection)"/> directly.
/// </para>
/// </remarks>
[ModelBinder(BinderType = typeof(NexGridQueryModelBinder))]
public sealed class NexGridQuery
{
    private static readonly IReadOnlyDictionary<string, string> NoFilters =
        new ReadOnlyDictionary<string, string>(new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase));

    /// <summary>The query-string key carrying the 1-based page number.</summary>
    public const string PageKey = "page";

    /// <summary>The query-string key carrying the rows-per-page.</summary>
    public const string PageSizeKey = "pageSize";

    /// <summary>The repeatable query-string key carrying <c>field:dir</c> sort tokens.</summary>
    public const string SortKey = "sort";

    /// <summary>The query-string key carrying the global search text.</summary>
    public const string SearchKey = "q";

    /// <summary>The prefix of a per-column filter key: <c>filter[status]</c>.</summary>
    public const string FilterKeyPrefix = "filter[";

    /// <summary>An empty query: page 1, default page size, no sort, search or filters.</summary>
    public static NexGridQuery Default { get; } = new();

    /// <summary>The 1-based page number. Always at least 1.</summary>
    public int Page { get; init; } = 1;

    /// <summary>Rows per page. Always a member of <see cref="PageSizes.All"/>.</summary>
    public int PageSize { get; init; } = PageSizes.Default;

    /// <summary>
    /// The requested sorts, primary first. Field names are untrusted client input.
    /// </summary>
    public IReadOnlyList<SortSpec> Sort { get; init; } = Array.Empty<SortSpec>();

    /// <summary>
    /// The global search text, or <see langword="null"/> when the user has not
    /// searched. Never an empty string.
    /// </summary>
    public string? Q { get; init; }

    /// <summary>
    /// Per-column filters from <c>filter[field]=value</c>, keyed
    /// case-insensitively. Field names are untrusted client input.
    /// </summary>
    public IReadOnlyDictionary<string, string> Filter { get; init; } = NoFilters;

    /// <summary>The primary sort, or <see langword="null"/> when the grid is unsorted.</summary>
    public SortSpec? PrimarySort => Sort.Count > 0 ? Sort[0] : null;

    /// <summary>Read one filter value, or <see langword="null"/> when it was not supplied.</summary>
    /// <param name="field">The column id, matched case-insensitively.</param>
    /// <returns>The raw filter value, or <see langword="null"/>.</returns>
    public string? GetFilter(string field)
    {
        ArgumentNullException.ThrowIfNull(field);
        return Filter.TryGetValue(field, out var value) ? value : null;
    }

    /// <summary>
    /// Parse a NexGrid query out of an <see cref="IQueryCollection"/>.
    /// </summary>
    /// <param name="query">The request's query collection. <see langword="null"/> yields <see cref="Default"/>.</param>
    /// <returns>A query with every value already coerced into range.</returns>
    public static NexGridQuery Parse(IQueryCollection? query)
    {
        if (query is null || query.Count == 0)
        {
            return Default;
        }

        var page = ParsePage(query[PageKey]);
        var pageSize = ParsePageSize(query[PageSizeKey]);
        var sort = ParseSort(query[SortKey]);
        var search = ParseSearch(query[SearchKey]);
        var filter = ParseFilters(query);

        return new NexGridQuery
        {
            Page = page,
            PageSize = pageSize,
            Sort = sort,
            Q = search,
            Filter = filter,
        };
    }

    /// <summary>
    /// Parse a NexGrid query out of a raw query string, with or without the
    /// leading <c>?</c>. Useful in tests and background jobs that replay a URL.
    /// </summary>
    /// <param name="queryString">A URL query string, e.g. <c>?page=2&amp;sort=name:asc</c>.</param>
    /// <returns>A query with every value already coerced into range.</returns>
    public static NexGridQuery Parse(string? queryString)
    {
        if (string.IsNullOrEmpty(queryString))
        {
            return Default;
        }

        var text = queryString[0] == '?' ? queryString : "?" + queryString;
        return Parse(new QueryCollection(QueryHelpers.ParseQuery(text)));
    }

    /// <summary>
    /// Minimal API binding hook. ASP.NET Core calls this for any
    /// <see cref="NexGridQuery"/> parameter on a route handler.
    /// </summary>
    /// <param name="httpContext">The current request.</param>
    /// <returns>The parsed query; never <see langword="null"/> and never faults.</returns>
    public static ValueTask<NexGridQuery?> BindAsync(HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        return ValueTask.FromResult<NexGridQuery?>(Parse(httpContext.Request.Query));
    }

    /// <summary>Render this query back to a query string (no leading <c>?</c>).</summary>
    /// <returns>A query string that <see cref="Parse(string)"/> round-trips.</returns>
    public string ToQueryString()
    {
        var parts = new List<string>(4 + Sort.Count + Filter.Count)
        {
            PageKey + "=" + Page.ToString(CultureInfo.InvariantCulture),
            PageSizeKey + "=" + PageSize.ToString(CultureInfo.InvariantCulture),
        };

        foreach (var spec in Sort)
        {
            parts.Add(SortKey + "=" + Uri.EscapeDataString(spec.ToToken()));
        }

        if (!string.IsNullOrEmpty(Q))
        {
            parts.Add(SearchKey + "=" + Uri.EscapeDataString(Q));
        }

        foreach (var pair in Filter)
        {
            parts.Add(Uri.EscapeDataString(FilterKeyPrefix + pair.Key + "]") + "=" + Uri.EscapeDataString(pair.Value));
        }

        return string.Join("&", parts);
    }

    private static int ParsePage(StringValues values)
    {
        // core: `Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1`
        var parsed = JsParseInt(values.Count > 0 ? values[0] : null);
        return parsed is >= 1 ? parsed.Value : 1;
    }

    private static int ParsePageSize(StringValues values)
    {
        var parsed = JsParseInt(values.Count > 0 ? values[0] : null);
        return parsed.HasValue ? PageSizes.Coerce(parsed.Value) : PageSizes.Default;
    }

    private static IReadOnlyList<SortSpec> ParseSort(StringValues values)
    {
        if (values.Count == 0)
        {
            return Array.Empty<SortSpec>();
        }

        var sorts = new List<SortSpec>(values.Count);
        foreach (var token in values)
        {
            if (SortSpec.TryParse(token, out var spec))
            {
                sorts.Add(spec);
            }
        }

        return sorts.Count == 0 ? Array.Empty<SortSpec>() : new ReadOnlyCollection<SortSpec>(sorts);
    }

    private static string? ParseSearch(StringValues values)
    {
        // core takes `params.get("q")`, the FIRST value, and drops it when falsy.
        var first = values.Count > 0 ? values[0] : null;
        return string.IsNullOrEmpty(first) ? null : first;
    }

    private static IReadOnlyDictionary<string, string> ParseFilters(IQueryCollection query)
    {
        Dictionary<string, string>? filters = null;

        foreach (var pair in query)
        {
            var key = pair.Key;

            // core's regex is /^filter\[(.+)\]$/ — at least one character inside
            // the brackets. The prefix match is case-insensitive here because
            // every other key lookup on IQueryCollection is; a client that sends
            // `Filter[status]` should not be silently ignored.
            if (key.Length <= FilterKeyPrefix.Length ||
                key[^1] != ']' ||
                !key.StartsWith(FilterKeyPrefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var field = key[FilterKeyPrefix.Length..^1];
            if (field.Length == 0)
            {
                continue;
            }

            // Repeated keys: core iterates every entry and assigns, so the last
            // one wins. StringValues preserves that order.
            var value = pair.Value.Count > 0 ? pair.Value[^1] : null;
            (filters ??= new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase))[field] = value ?? string.Empty;
        }

        return filters is null ? NoFilters : new ReadOnlyDictionary<string, string>(filters);
    }

    /// <summary>
    /// JavaScript's <c>parseInt(value, 10)</c>: leading whitespace and an optional
    /// sign, then as many decimal digits as there are, stopping at the first
    /// character that is not one. Returns <see langword="null"/> for JS <c>NaN</c>.
    /// </summary>
    private static int? JsParseInt(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }

        var i = 0;
        while (i < value.Length && char.IsWhiteSpace(value[i]))
        {
            i++;
        }

        var negative = false;
        if (i < value.Length && (value[i] == '+' || value[i] == '-'))
        {
            negative = value[i] == '-';
            i++;
        }

        var start = i;
        long magnitude = 0;
        while (i < value.Length && value[i] is >= '0' and <= '9')
        {
            // JS would keep going as a double; saturating at int.MaxValue keeps
            // the same "absurdly large page" outcome without overflowing.
            if (magnitude <= int.MaxValue)
            {
                magnitude = (magnitude * 10) + (value[i] - '0');
            }

            i++;
        }

        if (i == start)
        {
            return null;
        }

        if (magnitude > int.MaxValue)
        {
            magnitude = int.MaxValue;
        }

        return negative ? (int)-magnitude : (int)magnitude;
    }
}
