// One column's sort intent, and the `field:dir` token it travels as.
//
// The token grammar is deliberately forgiving, and it is copied from core's
// `parseSortToken` rather than reinvented: the field is everything before the
// LAST colon (so a field containing a colon survives a round trip), a missing or
// unrecognised direction means ascending, and an empty field is not a sort at
// all. Being lenient here is safe because the field name is never trusted — it is
// matched against the caller's allowlist in TableXQueryOptions before it can
// influence a query.

using System.Diagnostics.CodeAnalysis;

namespace TableX.AspNetCore;

/// <summary>Sort direction for a single column.</summary>
public enum SortDirection
{
    /// <summary>Ascending order — the wire token <c>asc</c>.</summary>
    Ascending = 0,

    /// <summary>Descending order — the wire token <c>desc</c>.</summary>
    Descending = 1,
}

/// <summary>
/// One column's sort intent, e.g. <c>name:asc</c>.
/// </summary>
/// <param name="Field">
/// The column id the client asked to sort by. Untrusted: it only takes effect if
/// it matches a member registered with <see cref="TableXQueryOptions{T}.Sortable(string, System.Linq.Expressions.Expression{System.Func{T, object}})"/>.
/// </param>
/// <param name="Direction">The direction to sort in.</param>
public sealed record SortSpec(string Field, SortDirection Direction)
{
    /// <summary>The wire token for <see cref="SortDirection.Ascending"/>.</summary>
    public const string AscendingToken = "asc";

    /// <summary>The wire token for <see cref="SortDirection.Descending"/>.</summary>
    public const string DescendingToken = "desc";

    /// <summary>
    /// Parse one <c>field:dir</c> token exactly the way <c>@nexgrid/core</c> does.
    /// </summary>
    /// <param name="token">A raw <c>sort</c> query-string value, e.g. <c>createdAt:desc</c>.</param>
    /// <param name="spec">The parsed sort intent, or <see langword="null"/> when the token has no field.</param>
    /// <returns>
    /// <see langword="true"/> when the token yielded a sort. A token with no field
    /// (<c>""</c> or <c>":desc"</c>) yields <see langword="false"/> and is dropped;
    /// an unrecognised direction (<c>"name:sideways"</c>) falls back to ascending.
    /// </returns>
    public static bool TryParse(string? token, [NotNullWhen(true)] out SortSpec? spec)
    {
        spec = null;
        if (string.IsNullOrEmpty(token))
        {
            return false;
        }

        var separator = token.LastIndexOf(':');
        var field = separator < 0 ? token : token[..separator];
        if (field.Length == 0)
        {
            return false;
        }

        var direction = separator < 0
            ? SortDirection.Ascending
            : token.AsSpan(separator + 1).Equals(DescendingToken.AsSpan(), StringComparison.Ordinal)
                ? SortDirection.Descending
                : SortDirection.Ascending;

        spec = new SortSpec(field, direction);
        return true;
    }

    /// <summary>Render this sort back to its <c>field:dir</c> wire token.</summary>
    /// <returns>A token that <see cref="TryParse"/> round-trips.</returns>
    public string ToToken() =>
        Field + ":" + (Direction == SortDirection.Descending ? DescendingToken : AscendingToken);
}
