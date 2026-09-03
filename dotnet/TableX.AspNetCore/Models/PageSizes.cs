// The rows-per-page allowlist, mirrored from @nexgrid/core's PAGE_SIZES.
//
// It lives on the server as well as in the browser because the client-side value
// is only a suggestion: a hand-edited `?pageSize=100000` must not be allowed to
// ask the database for a hundred thousand rows. Coercing here, rather than
// validating and rejecting, matches core's `parseQuery` — an unusable value
// degrades to the default instead of failing the request.

using System.Collections.ObjectModel;

namespace TableX.AspNetCore;

/// <summary>
/// The rows-per-page values TableX accepts, shared verbatim with
/// <c>@nexgrid/core</c>'s <c>PAGE_SIZES</c>.
/// </summary>
public static class PageSizes
{
    private static readonly int[] Allowed = [10, 25, 50, 100];

    /// <summary>Rows per page used when none was supplied, or when the supplied value is not allowed.</summary>
    public const int Default = 10;

    /// <summary>The allowed page sizes, in the order the grid's rows-per-page selector lists them.</summary>
    public static IReadOnlyList<int> All { get; } = new ReadOnlyCollection<int>(Allowed);

    /// <summary>Is <paramref name="value"/> one of the allowed page sizes?</summary>
    /// <param name="value">A candidate rows-per-page value.</param>
    /// <returns><see langword="true"/> when the value appears in <see cref="All"/>.</returns>
    public static bool IsAllowed(int value) => Array.IndexOf(Allowed, value) >= 0;

    /// <summary>
    /// Return <paramref name="value"/> when it is allowed, otherwise <see cref="Default"/>.
    /// Never throws: an out-of-range page size is a client mistake, not a server error.
    /// </summary>
    /// <param name="value">A candidate rows-per-page value.</param>
    /// <returns>An allowed page size.</returns>
    public static int Coerce(int value) => IsAllowed(value) ? value : Default;
}
