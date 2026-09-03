// Where the browser bundle lives once the package is referenced.
//
// The paths are constants rather than something the Tag Helper emits, because a
// page with three grids on it must not end up with three copies of a 34 KB
// script. Reference them once in _Layout.cshtml; the Tag Helper only checks at
// run time that the global actually arrived.

namespace TableX.AspNetCore;

/// <summary>
/// Paths to the static web assets this package publishes under
/// <c>_content/NexGrid.AspNetCore/</c>.
/// </summary>
/// <remarks>
/// <example>
/// <code>
/// &lt;link rel="stylesheet" href="@TableXAssets.StylesheetPath" /&gt;
/// &lt;script src="@TableXAssets.ScriptPath"&gt;&lt;/script&gt;
/// </code>
/// </example>
/// </remarks>
public static class TableXAssets
{
    /// <summary>The static web asset root this package publishes to.</summary>
    public const string ContentRoot = "/_content/NexGrid.AspNetCore";

    /// <summary>Legacy asset path for backwards compatibility.</summary>
    public const string LegacyContentRoot = "/_content/TableX.AspNetCore";

    /// <summary>
    /// The shared TableX stylesheet — the same file every adapter uses, so a
    /// Razor grid and a React grid render identically.
    /// </summary>
    public const string StylesheetPath = ContentRoot + "/tablex.css";

    /// <summary>
    /// The self-contained browser bundle. Defines the <c>TableX</c> global that
    /// <see cref="TableXTagHelper"/>'s init script calls into. Load it once per page.
    /// </summary>
    public const string ScriptPath = ContentRoot + "/tablex.global.js";

    /// <summary>The name of the browser global the bundle defines.</summary>
    public const string GlobalName = "TableX";
}
