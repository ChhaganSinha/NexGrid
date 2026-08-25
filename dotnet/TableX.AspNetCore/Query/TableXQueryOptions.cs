// The allowlist. This type is the security boundary of the whole package.
//
// A grid sends column ids it was configured with, but the query string is public:
// anyone can ask to sort by `PasswordHash`, filter on `IsDeleted`, or search a
// column the UI never renders. TableX answers that by never turning a client
// string into a member access. Sorting and filtering are looked up in the
// dictionaries below — built from expressions the SERVER wrote — and a key that
// is not there is dropped. There is no reflection path from a query-string value
// to a property, so there is nothing to escape and nothing to sanitise.

using System.Linq.Expressions;

namespace TableX.AspNetCore;

/// <summary>
/// Declares which members of <typeparamref name="T"/> a TableX request is
/// allowed to sort by, search, and filter on.
/// </summary>
/// <typeparam name="T">The entity or DTO being paged.</typeparam>
/// <remarks>
/// <para>
/// Nothing is allowed by default. A <c>sort</c> or <c>filter[...]</c> key that was
/// not registered here is ignored — never reflected into an expression — so an
/// untrusted query string cannot reach a member the server did not opt in.
/// </para>
/// <example>
/// <code>
/// .ToPagedResponseAsync(query, options => options
///     .Sortable(s => s.Name, s => s.CreatedAt)
///     .Searchable(s => s.Name, s => s.Email)
///     .Filterable("status", s => s.Status)
///     .DefaultSort(s => s.CreatedAt, SortDirection.Descending))
/// </code>
/// </example>
/// </remarks>
public sealed class TableXQueryOptions<T>
{
    private readonly Dictionary<string, LambdaExpression> _sortable = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, LambdaExpression> _filterable = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<Expression<Func<T, string?>>> _searchable = [];

    internal IReadOnlyDictionary<string, LambdaExpression> SortableMembers => _sortable;

    internal IReadOnlyDictionary<string, LambdaExpression> FilterableMembers => _filterable;

    internal IReadOnlyList<Expression<Func<T, string?>>> SearchableMembers => _searchable;

    internal LambdaExpression? DefaultSortMember { get; private set; }

    internal SortDirection DefaultSortDirection { get; private set; }

    /// <summary>
    /// Allow sorting by these members. Each key is the member's own name, matched
    /// case-insensitively against the column id the grid sends — so
    /// <c>s =&gt; s.CreatedAt</c> answers <c>?sort=createdAt:desc</c>.
    /// </summary>
    /// <param name="members">Member selectors, e.g. <c>s =&gt; s.Name, s =&gt; s.CreatedAt</c>.</param>
    /// <returns>This instance, for chaining.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="members"/> is <see langword="null"/>.</exception>
    /// <exception cref="ArgumentException">
    /// A selector is not a simple member access, so no key can be inferred from it.
    /// Use <see cref="Sortable(string, Expression{Func{T, object}})"/> and name it explicitly.
    /// </exception>
    public TableXQueryOptions<T> Sortable(params Expression<Func<T, object?>>[] members)
    {
        ArgumentNullException.ThrowIfNull(members);

        foreach (var member in members)
        {
            ArgumentNullException.ThrowIfNull(member);

            if (!TableXExpressions.TryGetMemberName(member.Body, out var name))
            {
                throw new ArgumentException(
                    "A sortable selector must be a simple member access such as 's => s.Name'. " +
                    "For a computed expression, use Sortable(key, selector) to name it explicitly.",
                    nameof(members));
            }

            _sortable[name] = TableXExpressions.Retype(member);
        }

        return this;
    }

    /// <summary>
    /// Allow sorting by <paramref name="selector"/> under an explicit key. Use this
    /// when the grid's column id differs from the member name, or when ordering by
    /// a computed expression such as <c>s =&gt; s.LastName + s.FirstName</c>.
    /// </summary>
    /// <param name="key">The column id the grid sends in <c>sort=&lt;key&gt;:dir</c>.</param>
    /// <param name="selector">What to order by. Must be translatable by your LINQ provider.</param>
    /// <returns>This instance, for chaining.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="key"/> or <paramref name="selector"/> is <see langword="null"/>.</exception>
    /// <exception cref="ArgumentException"><paramref name="key"/> is empty or whitespace.</exception>
    public TableXQueryOptions<T> Sortable(string key, Expression<Func<T, object?>> selector)
    {
        ValidateKey(key);
        ArgumentNullException.ThrowIfNull(selector);

        _sortable[key] = TableXExpressions.Retype(selector);
        return this;
    }

    /// <summary>
    /// Include these string members in the global search. A search matches a row
    /// when ANY of them contains the term.
    /// </summary>
    /// <param name="members">String member selectors, e.g. <c>s =&gt; s.Name, s =&gt; s.Email</c>.</param>
    /// <returns>This instance, for chaining.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="members"/> is <see langword="null"/>.</exception>
    /// <remarks>
    /// Case sensitivity follows the data source: on SQL Server with a default
    /// collation the match is case-insensitive, while against an in-memory
    /// <see cref="IQueryable{T}"/> it is ordinal. Only string members are accepted
    /// because <c>Contains</c> is the operation being translated; project a
    /// non-string column into a string in your query first if you need to search it.
    /// </remarks>
    public TableXQueryOptions<T> Searchable(params Expression<Func<T, string?>>[] members)
    {
        ArgumentNullException.ThrowIfNull(members);

        foreach (var member in members)
        {
            ArgumentNullException.ThrowIfNull(member);
            _searchable.Add(member);
        }

        return this;
    }

    /// <summary>
    /// Allow the per-column filter <c>filter[<paramref name="key"/>]=value</c>,
    /// compared for equality against <paramref name="selector"/>.
    /// </summary>
    /// <param name="key">The filter key the grid sends, matched case-insensitively.</param>
    /// <param name="selector">The member to compare. Strings, enums, numbers, booleans, GUIDs and date/time types are converted from the raw value.</param>
    /// <returns>This instance, for chaining.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="key"/> or <paramref name="selector"/> is <see langword="null"/>.</exception>
    /// <exception cref="ArgumentException"><paramref name="key"/> is empty or whitespace.</exception>
    /// <remarks>
    /// A supplied value that will not convert to the member's type — <c>?filter[age]=old</c>
    /// — drops the filter rather than failing the request, matching how the rest of
    /// the wire format degrades.
    /// </remarks>
    public TableXQueryOptions<T> Filterable(string key, Expression<Func<T, object?>> selector)
    {
        ValidateKey(key);
        ArgumentNullException.ThrowIfNull(selector);

        _filterable[key] = TableXExpressions.Retype(selector);
        return this;
    }

    /// <summary>
    /// Allow the per-column filter for a member, keyed by the member's own name.
    /// </summary>
    /// <param name="selector">A simple member access, e.g. <c>s =&gt; s.Status</c>.</param>
    /// <returns>This instance, for chaining.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="selector"/> is <see langword="null"/>.</exception>
    /// <exception cref="ArgumentException"><paramref name="selector"/> is not a simple member access.</exception>
    public TableXQueryOptions<T> Filterable(Expression<Func<T, object?>> selector)
    {
        ArgumentNullException.ThrowIfNull(selector);

        if (!TableXExpressions.TryGetMemberName(selector.Body, out var name))
        {
            throw new ArgumentException(
                "A filterable selector must be a simple member access such as 's => s.Status'. " +
                "For a computed expression, use Filterable(key, selector) to name it explicitly.",
                nameof(selector));
        }

        _filterable[name] = TableXExpressions.Retype(selector);
        return this;
    }

    /// <summary>
    /// Order by this member when the request carries no usable sort.
    /// </summary>
    /// <param name="selector">What to order by.</param>
    /// <param name="direction">The direction to order in.</param>
    /// <returns>This instance, for chaining.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="selector"/> is <see langword="null"/>.</exception>
    /// <remarks>
    /// Worth setting on every grid. <c>Skip</c>/<c>Take</c> over an unordered SQL
    /// query has no defined row order, so without a default sort a user can page
    /// forward and see the same record twice.
    /// </remarks>
    public TableXQueryOptions<T> DefaultSort(
        Expression<Func<T, object?>> selector,
        SortDirection direction = SortDirection.Ascending)
    {
        ArgumentNullException.ThrowIfNull(selector);

        DefaultSortMember = TableXExpressions.Retype(selector);
        DefaultSortDirection = direction;
        return this;
    }

    private static void ValidateKey(string key)
    {
        ArgumentNullException.ThrowIfNull(key);

        if (string.IsNullOrWhiteSpace(key))
        {
            throw new ArgumentException("A TableX allowlist key must not be empty.", nameof(key));
        }
    }
}
