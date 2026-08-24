// <nex-grid-column /> — one column definition, declared in markup.
//
// The element renders nothing. It exists so a Razor author can describe columns
// where the grid is, instead of hand-writing a JSON literal in a <script> block,
// and so mistakes ("aling", "sortable=yes") are caught by the Razor compiler
// rather than discovered as a missing column in the browser.
//
// Each instance pushes itself onto a collection the parent <nex-grid> seeded in
// TagHelperContext.Items before it awaited its child content. That is the
// supported way for Tag Helpers to talk to their parent, and it preserves source
// order, which is column order.

using System.Globalization;
using Microsoft.AspNetCore.Razor.TagHelpers;

namespace NexGrid.AspNetCore;

/// <summary>
/// Declares one column of a <see cref="NexGridTagHelper">&lt;nex-grid&gt;</see>.
/// </summary>
/// <remarks>
/// <example>
/// <code>
/// &lt;nex-grid caption="Students" endpoint="/api/students"&gt;
///     &lt;nex-grid-column field="name" header="Name" min-width="180" /&gt;
///     &lt;nex-grid-column field="score" header="Score" align="Right" width="90" /&gt;
///     &lt;nex-grid-column field="status" header="Status" align="Center" filterable="true"
///                      filter-options="Active,Suspended,Alumni" /&gt;
/// &lt;/nex-grid&gt;
/// </code>
/// </example>
/// </remarks>
[HtmlTargetElement(TagName, ParentTag = NexGridTagHelper.TagName, TagStructure = TagStructure.WithoutEndTag)]
public class NexGridColumnTagHelper : TagHelper
{
    /// <summary>The element name this Tag Helper targets.</summary>
    public const string TagName = "nex-grid-column";

    /// <summary>
    /// The row property this column reads, and the column id used in
    /// <c>sort=&lt;field&gt;:dir</c> and <c>filter[&lt;field&gt;]</c>. Required.
    /// </summary>
    /// <remarks>
    /// Must match the JSON property name your endpoint returns — <c>createdAt</c>,
    /// not <c>CreatedAt</c>, under ASP.NET Core's camelCase default.
    /// </remarks>
    [HtmlAttributeName("field")]
    public string? Field { get; set; }

    /// <summary>
    /// Header text. Defaults to <see cref="Field"/> with its first letter
    /// capitalised, so <c>field="email"</c> renders as <c>Email</c>.
    /// </summary>
    [HtmlAttributeName("header")]
    public string? Header { get; set; }

    /// <summary>
    /// Whether the header is clickable to sort. Defaults to <see langword="true"/>;
    /// set <c>false</c> for columns your endpoint cannot order by.
    /// </summary>
    [HtmlAttributeName("sortable")]
    public bool? Sortable { get; set; }

    /// <summary>
    /// Header and cell alignment: <c>Left</c>, <c>Center</c> or <c>Right</c>,
    /// matched case-insensitively. Defaults to <see cref="NexGridColumnAlign.Left"/>.
    /// </summary>
    [HtmlAttributeName("align")]
    public string? Align { get; set; }

    /// <summary>Fixed column width in pixels.</summary>
    [HtmlAttributeName("width")]
    public int? Width { get; set; }

    /// <summary>Minimum column width in pixels. Ignored when <see cref="Width"/> is set.</summary>
    [HtmlAttributeName("min-width")]
    public int? MinWidth { get; set; }

    /// <summary>Proportional width unit, used when no explicit width is given.</summary>
    [HtmlAttributeName("flex")]
    public int? Flex { get; set; }

    /// <summary>Start hidden. The column is still listed in the Columns menu.</summary>
    [HtmlAttributeName("hidden")]
    public bool? Hidden { get; set; }

    /// <summary>Whether the Columns menu may toggle this column. Defaults to <see langword="true"/>.</summary>
    [HtmlAttributeName("hideable")]
    public bool? Hideable { get; set; }

    /// <summary>Whether this column appears in CSV and Excel exports. Defaults to <see langword="true"/>.</summary>
    [HtmlAttributeName("exportable")]
    public bool? Exportable { get; set; }

    /// <summary>
    /// Marks the column as server-filterable, sent as
    /// <c>filter[&lt;field&gt;]=value</c>. Register the matching member with
    /// <see cref="NexGridQueryOptions{T}.Filterable(string, System.Linq.Expressions.Expression{System.Func{T, object}})"/>
    /// or the filter is ignored.
    /// </summary>
    [HtmlAttributeName("filterable")]
    public bool? Filterable { get; set; }

    /// <summary>The filter key to send when it differs from <see cref="Field"/>.</summary>
    [HtmlAttributeName("filter-field")]
    public string? FilterField { get; set; }

    /// <summary>
    /// Comma-separated allowed filter values, e.g. <c>"Active,Suspended,Alumni"</c>.
    /// Renders a picker instead of a free-text box. Blank entries are dropped.
    /// </summary>
    [HtmlAttributeName("filter-options")]
    public string? FilterOptions { get; set; }

    /// <summary>
    /// Contribute this column to the parent grid and remove the element from the output.
    /// </summary>
    /// <param name="context">The Tag Helper context, carrying the parent's column collection.</param>
    /// <param name="output">The output for this element; always suppressed.</param>
    /// <exception cref="ArgumentNullException"><paramref name="context"/> or <paramref name="output"/> is <see langword="null"/>.</exception>
    /// <exception cref="InvalidOperationException"><c>field</c> was omitted or blank.</exception>
    public override void Process(TagHelperContext context, TagHelperOutput output)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(output);

        output.SuppressOutput();

        if (string.IsNullOrWhiteSpace(Field))
        {
            throw new InvalidOperationException(
                $"<{TagName}> requires a 'field' attribute naming the row property it reads.");
        }

        if (context.Items.TryGetValue(typeof(NexGridColumnCollection), out var bag) &&
            bag is NexGridColumnCollection columns)
        {
            columns.Add(ToConfig(Field));
        }
    }

    private NexGridColumnConfig ToConfig(string field)
    {
        var meta = new NexGridColumnMetaConfig
        {
            Width = Width,
            MinWidth = MinWidth,
            Flex = Flex,
            Align = NexGridConfigSerializer.ToToken(
                NexGridAttribute.ParseEnum<NexGridColumnAlign>(Align, TagName, "align")),
            Hidden = Hidden,
            Hideable = Hideable,
            Exportable = Exportable,
            ServerFilterable = Filterable,
            ServerFilterField = FilterField,
            FilterOptions = ParseFilterOptions(FilterOptions),
        };

        return new NexGridColumnConfig
        {
            AccessorKey = field,
            Header = Header ?? TitleCase(field),
            // Only written when explicitly turned off — core's default is already true.
            EnableSorting = Sortable == false ? false : null,
            Meta = meta.HasValues ? meta : null,
        };
    }

    private static IReadOnlyList<string>? ParseFilterOptions(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var values = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return values.Length == 0 ? null : values;
    }

    /// <summary>
    /// Capitalise the first letter, matching core's <c>getColumnTitle</c> fallback
    /// so the header and the Columns menu entry read the same.
    /// </summary>
    private static string TitleCase(string field) =>
        field.Length == 0
            ? field
            : char.ToUpper(field[0], CultureInfo.InvariantCulture) + field[1..];
}

/// <summary>The column list a &lt;nex-grid&gt; seeds for its children to fill.</summary>
internal sealed class NexGridColumnCollection : List<NexGridColumnConfig>
{
}
