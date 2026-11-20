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
        var term = query.Q?.Trim();
        if (string.IsNullOrEmpty(term) || options.SearchableMembers.Count == 0)
        {
            return source;
        }

        var row = Expression.Parameter(typeof(T), "row");
        var lowerTerm = term.ToLowerInvariant();
        var termExpression = TableXExpressions.Parameterize(lowerTerm, typeof(string));
        var nullLiteral = Expression.Constant(null, typeof(string));

        Expression? predicate = null;
        foreach (var selector in options.SearchableMembers)
        {
            var member = TableXExpressions.Rebind(selector.Body, selector.Parameters[0], row);

            // Null guard + `ToLower().Contains(lowerTerm)` translates to
            // `col IS NOT NULL AND LOWER(col) LIKE '%term%'` on EF Core (SQL Server,
            // PostgreSQL, SQLite, MySQL) and runs case-insensitively on LINQ to Objects.
            var lowered = Expression.Call(member, TableXExpressions.StringToLower);
            var clause = Expression.AndAlso(
                Expression.NotEqual(member, nullLiteral),
                Expression.Call(lowered, TableXExpressions.StringContains, termExpression));

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
            // treats an empty or whitespace value as "no filter", so it must not become
            // `WHERE Status = ''`.
            if (string.IsNullOrWhiteSpace(entry.Value))
            {
                continue;
            }

            var rawVal = entry.Value.Trim();
            if (rawVal == "..")
            {
                continue;
            }

            // Not allowlisted: dropped without ever touching a member.
            if (!options.FilterableMembers.TryGetValue(entry.Key, out var selector))
            {
                continue;
            }

            var rowParam = Expression.Parameter(typeof(T), "row");

            // Pipe-delimited multi-select OR tokens: "Active|Pending"
            if (rawVal.Contains('|', StringComparison.Ordinal))
            {
                var tokens = rawVal.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                Expression? orPredicate = null;
                foreach (var token in tokens)
                {
                    if (token == "..")
                    {
                        continue;
                    }

                    if (TryBuildSingleFilterPredicate(token, entry.Key, selector, rowParam, options, out var tokenPredicate) &&
                        tokenPredicate is not null)
                    {
                        orPredicate = orPredicate is null
                            ? tokenPredicate
                            : Expression.OrElse(orPredicate, tokenPredicate);
                    }
                }

                if (orPredicate is not null)
                {
                    source = source.Where(Expression.Lambda<Func<T, bool>>(orPredicate, rowParam));
                }

                continue;
            }

            if (TryBuildSingleFilterPredicate(rawVal, entry.Key, selector, rowParam, options, out var predicate) &&
                predicate is not null)
            {
                source = source.Where(Expression.Lambda<Func<T, bool>>(predicate, rowParam));
            }
        }

        return source;
    }

    private static bool TryBuildSingleFilterPredicate<T>(
        string rawVal,
        string filterKey,
        LambdaExpression selector,
        ParameterExpression rowParam,
        TableXQueryOptions<T> options,
        out Expression? predicate)
    {
        var returnType = selector.ReturnType;
        var underlyingType = Nullable.GetUnderlyingType(returnType) ?? returnType;
        var isComparable =
            (underlyingType.IsPrimitive && underlyingType != typeof(bool) && underlyingType != typeof(char)) ||
            underlyingType == typeof(decimal) ||
            underlyingType == typeof(DateTime) ||
            underlyingType == typeof(DateOnly) ||
            underlyingType == typeof(DateTimeOffset) ||
            underlyingType == typeof(TimeOnly);

        var memberExpr = TableXExpressions.Rebind(selector.Body, selector.Parameters[0], rowParam);

        // 1. Range filter syntax: "min..max", "min..", "..max"
        if (rawVal.Contains("..", StringComparison.Ordinal) && isComparable)
        {
            var parts = rawVal.Split([".."], StringSplitOptions.None);
            var minStr = parts[0].Trim();
            var maxStr = parts.Length > 1 ? parts[1].Trim() : string.Empty;

            Expression? rangePredicate = null;

            if (!string.IsNullOrEmpty(minStr) && TableXExpressions.TryConvertFilterValue(minStr, returnType, out var minVal))
            {
                var gte = Expression.GreaterThanOrEqual(memberExpr, TableXExpressions.Parameterize(minVal, returnType));
                rangePredicate = gte;
            }

            if (!string.IsNullOrEmpty(maxStr) && TableXExpressions.TryConvertFilterValue(maxStr, returnType, out var maxVal))
            {
                if (TableXExpressions.IsDateOnlyFilterToken(maxStr))
                {
                    maxVal = AdjustDateEndOfDay(maxVal, underlyingType);
                }

                var lte = Expression.LessThanOrEqual(memberExpr, TableXExpressions.Parameterize(maxVal, returnType));
                rangePredicate = rangePredicate is null ? lte : Expression.AndAlso(rangePredicate, lte);
            }

            if (rangePredicate is not null)
            {
                predicate = rangePredicate;
                return true;
            }
        }

        // 2. Comparison prefix operators: >=, <=, !=, >, <, =
        if (isComparable &&
            TryParseOperatorFilter(rawVal, out var op, out var operand) &&
            TableXExpressions.TryConvertFilterValue(operand, returnType, out var opVal))
        {
            var isDateOnlyOp = TableXExpressions.IsDateOnlyFilterToken(operand);

            if (op == "=" && isDateOnlyOp && (underlyingType == typeof(DateTime) || underlyingType == typeof(DateTimeOffset)))
            {
                var endOfDay = AdjustDateEndOfDay(opVal, underlyingType);
                predicate = Expression.AndAlso(
                    Expression.GreaterThanOrEqual(memberExpr, TableXExpressions.Parameterize(opVal, returnType)),
                    Expression.LessThanOrEqual(memberExpr, TableXExpressions.Parameterize(endOfDay, returnType)));
            }
            else
            {
                var adjustedVal = (op is "<=" or ">") && isDateOnlyOp
                    ? AdjustDateEndOfDay(opVal, underlyingType)
                    : opVal;
                var paramExpr = TableXExpressions.Parameterize(adjustedVal, returnType);
                predicate = op switch
                {
                    ">=" => Expression.GreaterThanOrEqual(memberExpr, paramExpr),
                    "<=" => Expression.LessThanOrEqual(memberExpr, paramExpr),
                    "!=" => Expression.NotEqual(memberExpr, paramExpr),
                    ">" => Expression.GreaterThan(memberExpr, paramExpr),
                    "<" => Expression.LessThan(memberExpr, paramExpr),
                    _ => Expression.Equal(memberExpr, paramExpr),
                };
            }

            return true;
        }

        // 3. Date-only value against DateTime / DateTimeOffset matches the full calendar day
        if ((underlyingType == typeof(DateTime) || underlyingType == typeof(DateTimeOffset)) &&
            TableXExpressions.IsDateOnlyFilterToken(rawVal) &&
            TableXExpressions.TryConvertFilterValue(rawVal, returnType, out var dayStart))
        {
            var dayEnd = AdjustDateEndOfDay(dayStart, underlyingType);
            predicate = Expression.AndAlso(
                Expression.GreaterThanOrEqual(memberExpr, TableXExpressions.Parameterize(dayStart, returnType)),
                Expression.LessThanOrEqual(memberExpr, TableXExpressions.Parameterize(dayEnd, returnType)));
            return true;
        }

        // 4. String members: null-safe case-insensitive match (Equals or Contains)
        if (underlyingType == typeof(string))
        {
            var nullLiteral = Expression.Constant(null, typeof(string));
            var lowerFilter = rawVal.ToLowerInvariant();
            var termParam = TableXExpressions.Parameterize(lowerFilter, typeof(string));
            var loweredMember = Expression.Call(memberExpr, TableXExpressions.StringToLower);

            var mode = options.FilterStringModes.TryGetValue(filterKey, out var configuredMode)
                ? configuredMode
                : TableXStringFilterMode.Equals;

            Expression matchExpr = mode == TableXStringFilterMode.Contains
                ? Expression.Call(loweredMember, TableXExpressions.StringContains, termParam)
                : Expression.Equal(loweredMember, termParam);

            predicate = Expression.AndAlso(Expression.NotEqual(memberExpr, nullLiteral), matchExpr);
            return true;
        }

        // 5. Typed equality (Enum, Bool, Number, Guid, DateOnly, TimeOnly, exact timestamp)
        if (!TableXExpressions.TryConvertFilterValue(rawVal, returnType, out var value))
        {
            predicate = null;
            return false;
        }

        predicate = Expression.Equal(memberExpr, TableXExpressions.Parameterize(value, returnType));
        return true;
    }

    private static object? AdjustDateEndOfDay(object? value, Type underlyingType)
    {
        if (underlyingType == typeof(DateTime) && value is DateTime dt)
        {
            return dt.Date.AddDays(1).AddTicks(-1);
        }

        if (underlyingType == typeof(DateTimeOffset) && value is DateTimeOffset dto)
        {
            return new DateTimeOffset(dto.Date.AddDays(1).AddTicks(-1), dto.Offset);
        }

        return value;
    }

    private static bool TryParseOperatorFilter(string rawVal, out string op, out string operand)
    {
        ReadOnlySpan<string> operators = [">=", "<=", "!=", ">", "<", "="];
        foreach (var candidate in operators)
        {
            if (rawVal.StartsWith(candidate, StringComparison.Ordinal))
            {
                var rest = rawVal[candidate.Length..].Trim();
                if (rest.Length > 0)
                {
                    op = candidate;
                    operand = rest;
                    return true;
                }
            }
        }

        op = string.Empty;
        operand = string.Empty;
        return false;
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
