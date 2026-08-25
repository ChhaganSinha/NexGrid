// Turn a TableXQuery plus an allowlist into one page of rows.
//
// The pipeline order is fixed by the adapter spec and is not arbitrary: search
// and filters decide WHICH rows match, so they must run before the count that the
// pager is drawn from; sort decides the order that Skip/Take slices; and the page
// window is applied last, against the ordered set.
//
// Everything is composed onto the caller's IQueryable, so on EF Core the whole
// thing leaves as two SQL statements — a COUNT and a windowed SELECT — and no row
// the user is not looking at is ever materialised.

using System.Linq.Expressions;

namespace TableX.AspNetCore;

/// <summary>
/// Applies a <see cref="TableXQuery"/> to an <see cref="IQueryable{T}"/> and
/// projects the result into a <see cref="PagedResponse{T}"/>.
/// </summary>
public static class TableXQueryableExtensions
{
    /// <summary>
    /// Apply search, filters, sorting and paging, then return one page of rows
    /// with the full filtered count.
    /// </summary>
    /// <typeparam name="T">The row type.</typeparam>
    /// <param name="source">The query to page. Composed onto, never enumerated in full.</param>
    /// <param name="query">The client's request, already coerced into range by <see cref="TableXQuery.Parse(Microsoft.AspNetCore.Http.IQueryCollection)"/>.</param>
    /// <param name="configure">Declares which members may be sorted, searched and filtered. Nothing is allowed unless it is registered here.</param>
    /// <returns>One page of rows plus the total count across all pages.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="source"/> or <paramref name="query"/> is <see langword="null"/>.</exception>
    /// <example>
    /// <code>
    /// var page = db.Students.AsNoTracking().ToPagedResponse(query, options => options
    ///     .Sortable(s => s.Name, s => s.CreatedAt)
    ///     .Searchable(s => s.Name, s => s.Email)
    ///     .Filterable("status", s => s.Status));
    /// </code>
    /// </example>
    public static PagedResponse<T> ToPagedResponse<T>(
        this IQueryable<T> source,
        TableXQuery query,
        Action<TableXQueryOptions<T>>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(query);

        var options = BuildOptions(configure);
        var matching = ApplySearch(source, query, options);
        matching = ApplyFilters(matching, query, options);
        var ordered = ApplySort(matching, query, options);

        var total = ordered.Count();
        var (page, pageSize, skip) = ResolveWindow(query, total);
        var items = ordered.Skip(skip).Take(pageSize).ToList();

        return new PagedResponse<T>(items, page, pageSize, total);
    }

    /// <summary>
    /// Asynchronous <see cref="ToPagedResponse{T}"/>.
    /// </summary>
    /// <typeparam name="T">The row type.</typeparam>
    /// <param name="source">The query to page. Composed onto, never enumerated in full.</param>
    /// <param name="query">The client's request, already coerced into range by <see cref="TableXQuery.Parse(Microsoft.AspNetCore.Http.IQueryCollection)"/>.</param>
    /// <param name="configure">Declares which members may be sorted, searched and filtered. Nothing is allowed unless it is registered here.</param>
    /// <param name="cancellationToken">Cancels both round trips.</param>
    /// <returns>One page of rows plus the total count across all pages.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="source"/> or <paramref name="query"/> is <see langword="null"/>.</exception>
    /// <remarks>
    /// Runs asynchronously against any provider that exposes EF Core's async
    /// query surface; other providers (LINQ to Objects, in-memory test doubles)
    /// fall back to the synchronous path. This package takes no dependency on
    /// Entity Framework Core to make that work.
    /// </remarks>
    /// <example>
    /// <code>
    /// var page = await db.Students.AsNoTracking().ToPagedResponseAsync(query, options => options
    ///     .Sortable(s => s.Name, s => s.CreatedAt)
    ///     .Searchable(s => s.Name, s => s.Email)
    ///     .Filterable("status", s => s.Status), cancellationToken);
    /// </code>
    /// </example>
    public static async Task<PagedResponse<T>> ToPagedResponseAsync<T>(
        this IQueryable<T> source,
        TableXQuery query,
        Action<TableXQueryOptions<T>>? configure = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(query);

        var options = BuildOptions(configure);
        var matching = ApplySearch(source, query, options);
        matching = ApplyFilters(matching, query, options);
        var ordered = ApplySort(matching, query, options);

        var total = await AsyncQueryableBridge.CountAsync(ordered, cancellationToken).ConfigureAwait(false);
        var (page, pageSize, skip) = ResolveWindow(query, total);
        var items = await AsyncQueryableBridge
            .ToListAsync(ordered.Skip(skip).Take(pageSize), cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<T>(items, page, pageSize, total);
    }

    private static TableXQueryOptions<T> BuildOptions<T>(Action<TableXQueryOptions<T>>? configure)
    {
        var options = new TableXQueryOptions<T>();
        configure?.Invoke(options);
        return options;
    }

    /// <summary>
    /// The page window, clamped to what actually exists. A stale bookmark pointing
    /// at page 40 of a table that now has 3 pages should show the last page, not
    /// an empty grid reporting hundreds of records.
    /// </summary>
    private static (int Page, int PageSize, int Skip) ResolveWindow(TableXQuery query, int total)
    {
        var pageSize = PageSizes.Coerce(query.PageSize);
        var totalPages = Math.Max(1, (int)Math.Ceiling(Math.Max(0, total) / (double)pageSize));
        var page = Math.Min(Math.Max(1, query.Page), totalPages);
        return (page, pageSize, (page - 1) * pageSize);
    }

    private static IQueryable<T> ApplySearch<T>(
        IQueryable<T> source,
        TableXQuery query,
        TableXQueryOptions<T> options)
    {
        var term = query.Q;
        if (string.IsNullOrEmpty(term) || options.SearchableMembers.Count == 0)
        {
            return source;
        }

        var row = Expression.Parameter(typeof(T), "row");
        var termExpression = TableXExpressions.Parameterize(term, typeof(string));
        var nullLiteral = Expression.Constant(null, typeof(string));

        Expression? predicate = null;
        foreach (var selector in options.SearchableMembers)
        {
            var member = TableXExpressions.Rebind(selector.Body, selector.Parameters[0], row);

            // The null guard keeps LINQ to Objects from throwing on a null column
            // and costs a harmless `IS NOT NULL` in SQL.
            var clause = Expression.AndAlso(
                Expression.NotEqual(member, nullLiteral),
                Expression.Call(member, TableXExpressions.StringContains, termExpression));

            predicate = predicate is null ? clause : Expression.OrElse(predicate, clause);
        }

        return predicate is null ? source : source.Where(Expression.Lambda<Func<T, bool>>(predicate, row));
    }

    private static IQueryable<T> ApplyFilters<T>(
        IQueryable<T> source,
        TableXQuery query,
        TableXQueryOptions<T> options)
    {
        if (query.Filter.Count == 0 || options.FilterableMembers.Count == 0)
        {
            return source;
        }

        foreach (var entry in query.Filter)
        {
            // `filter[status]=` reaches the server when a picker is cleared. Core
            // treats an empty value as "no filter", so it must not become
            // `WHERE Status = ''`.
            if (string.IsNullOrEmpty(entry.Value))
            {
                continue;
            }

            // Not allowlisted: dropped without ever touching a member.
            if (!options.FilterableMembers.TryGetValue(entry.Key, out var selector))
            {
                continue;
            }

            if (!TableXExpressions.TryConvertFilterValue(entry.Value, selector.ReturnType, out var value))
            {
                continue;
            }

            var row = Expression.Parameter(typeof(T), "row");
            var member = TableXExpressions.Rebind(selector.Body, selector.Parameters[0], row);
            var comparison = Expression.Equal(member, TableXExpressions.Parameterize(value, selector.ReturnType));

            source = source.Where(Expression.Lambda<Func<T, bool>>(comparison, row));
        }

        return source;
    }

    private static IQueryable<T> ApplySort<T>(
        IQueryable<T> source,
        TableXQuery query,
        TableXQueryOptions<T> options)
    {
        var expression = source.Expression;
        var applied = 0;

        foreach (var spec in query.Sort)
        {
            // Not allowlisted: dropped without ever touching a member.
            if (!options.SortableMembers.TryGetValue(spec.Field, out var selector))
            {
                continue;
            }

            expression = Order<T>(expression, selector, spec.Direction, first: applied == 0);
            applied++;
        }

        if (applied == 0)
        {
            if (options.DefaultSortMember is null)
            {
                return source;
            }

            expression = Order<T>(expression, options.DefaultSortMember, options.DefaultSortDirection, first: true);
        }

        return source.Provider.CreateQuery<T>(expression);
    }

    /// <summary>
    /// Append one <c>OrderBy</c>/<c>ThenBy</c> to the query expression.
    /// Built as an expression rather than by calling <see cref="Queryable"/>
    /// directly because the key type is only known at run time — and because
    /// closing over the real key type (not <see cref="object"/>) is what lets EF
    /// Core translate the ordering into SQL instead of throwing.
    /// </summary>
    private static Expression Order<T>(
        Expression source,
        LambdaExpression selector,
        SortDirection direction,
        bool first)
    {
        var method = (first, direction) switch
        {
            (true, SortDirection.Descending) => nameof(Queryable.OrderByDescending),
            (true, _) => nameof(Queryable.OrderBy),
            (false, SortDirection.Descending) => nameof(Queryable.ThenByDescending),
            (false, _) => nameof(Queryable.ThenBy),
        };

        return Expression.Call(
            typeof(Queryable),
            method,
            [typeof(T), selector.ReturnType],
            source,
            Expression.Quote(selector));
    }
}
