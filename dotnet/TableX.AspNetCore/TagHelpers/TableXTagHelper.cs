// <nex-grid> — the mount point, the configuration, and the one line that starts
// the grid.
//
// Three pieces of output, deliberately kept apart:
//
//   1. A <div> the browser bundle mounts into. It stays empty on the server; the
//      grid is server-DRIVEN, not server-rendered, so there is no markup here to
//      go stale against the data the endpoint returns.
//   2. A <script type="application/json"> block holding the configuration.
//      Configuration never goes inside executable JavaScript. System.Text.Json's
//      default encoder escapes `<`, `>` and `&`, so no caption or endpoint a
//      developer supplies can close the element early, and the browser hands the
//      contents back as inert text.
//   3. A small init script that reads the block, parses it, and calls
//      TableX.createTableX. It waits for DOMContentLoaded when the document is
//      still parsing, so the tag works in the middle of a page as well as after it.
//
// The bundle itself is NOT emitted here. A page with three grids should load one
// copy of the script; see TableXAssets.

using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Razor.TagHelpers;

namespace TableX.AspNetCore;

/// <summary>
/// Renders a TableX: a mount point, a JSON configuration block, and the call
/// that starts the browser bundle.
/// </summary>
/// <remarks>
/// <para>Register the Tag Helpers once, in <c>_ViewImports.cshtml</c>:</para>
/// <code>@addTagHelper *, TableX.AspNetCore</code>
/// <para>Then, with the bundle referenced from your layout:</para>
/// <code>
/// &lt;nex-grid caption="Students" endpoint="/api/students" enable-selection="true"&gt;
///     &lt;nex-grid-column field="name" header="Name" min-width="180" /&gt;
///     &lt;nex-grid-column field="email" header="Email" /&gt;
///     &lt;nex-grid-column field="status" header="Status" align="Center" /&gt;
/// &lt;/nex-grid&gt;
/// </code>
/// <para>
/// The grid handle is left on the container element as <c>element.tablex</c>, so
/// other scripts can call <c>refresh()</c>, <c>getSelection()</c> or
/// <c>update()</c> on it.
/// </para>
/// </remarks>
[HtmlTargetElement(TagName)]
[RestrictChildren(TableXColumnTagHelper.TagName)]
public class TableXTagHelper : TagHelper
{
    /// <summary>The element name this Tag Helper targets.</summary>
    public const string TagName = "nex-grid";

    private const string MissingBundleMessage =
        "TableX: the browser bundle is not loaded. Reference " +
        TableXAssets.ScriptPath + " from your layout before this grid renders.";

    /// <summary>
    /// Accessible name for the table, and the default export file prefix. Required.
    /// </summary>
    [HtmlAttributeName("caption")]
    public string? Caption { get; set; }

    /// <summary>
    /// The endpoint the grid fetches itself, expecting a
    /// <see cref="PagedResponse{T}"/> body. Omit only when another script drives
    /// the grid through <c>element.tablex.update(...)</c>.
    /// </summary>
    [HtmlAttributeName("endpoint")]
    public string? Endpoint { get; set; }

    /// <summary>
    /// Endpoint used to collect the whole filtered dataset for export. Defaults to
    /// <see cref="Endpoint"/>.
    /// </summary>
    [HtmlAttributeName("fetch-endpoint")]
    public string? FetchEndpoint { get; set; }

    /// <summary>The element's <c>id</c>. Generated when omitted.</summary>
    [HtmlAttributeName("id")]
    public string? Id { get; set; }

    /// <summary>
    /// Initial row density: <c>Compact</c>, <c>Default</c> or <c>Comfortable</c>,
    /// matched case-insensitively. Defaults to <see cref="TableXDensity.Default"/>.
    /// </summary>
    [HtmlAttributeName("density")]
    public string? Density { get; set; }

    /// <summary>
    /// Colour scheme: <c>Light</c>, <c>Dark</c> or <c>Auto</c>, matched
    /// case-insensitively. Defaults to <see cref="TableXTheme.Light"/>.
    /// </summary>
    [HtmlAttributeName("theme")]
    public string? Theme { get; set; }

    /// <summary>
    /// Extra class names for the grid root. Distinct from the element's own
    /// <c>class</c> attribute, which stays on the mount point: the grid renders
    /// <c>.tbx-root</c> INSIDE the container, and this is what lands there.
    /// </summary>
    [HtmlAttributeName("grid-class")]
    public string? GridClass { get; set; }

    /// <summary>Show the global search field. Defaults to <see langword="true"/>.</summary>
    [HtmlAttributeName("enable-search")]
    public bool? EnableSearch { get; set; }

    /// <summary>Placeholder for the search field. Overrides the locale default.</summary>
    [HtmlAttributeName("search-placeholder")]
    public string? SearchPlaceholder { get; set; }

    /// <summary>Show row selection checkboxes. Defaults to <see langword="false"/>.</summary>
    [HtmlAttributeName("enable-selection")]
    public bool? EnableSelection { get; set; }

    /// <summary>Show the Excel/CSV export menu. Defaults to <see langword="true"/>.</summary>
    [HtmlAttributeName("enable-export")]
    public bool? EnableExport { get; set; }

    /// <summary>Export file prefix. Defaults to a slug of <see cref="Caption"/>.</summary>
    [HtmlAttributeName("export-file-name")]
    public string? ExportFileName { get; set; }

    /// <summary>Show the automatic <c>S.No.</c> column. Defaults to <see langword="true"/>.</summary>
    [HtmlAttributeName("show-serial-number")]
    public bool? ShowSerialNumber { get; set; }

    /// <summary>Initial 1-based page. Defaults to 1.</summary>
    [HtmlAttributeName("page")]
    public int? Page { get; set; }

    /// <summary>
    /// Initial rows per page. Coerced to <see cref="PageSizes.All"/>, so an
    /// unsupported value silently becomes <see cref="PageSizes.Default"/>.
    /// </summary>
    [HtmlAttributeName("page-size")]
    public int? PageSize { get; set; }

    /// <summary>
    /// Initial sort as a <c>field:dir</c> token, e.g. <c>createdAt:desc</c>.
    /// A token with no field is ignored.
    /// </summary>
    [HtmlAttributeName("sort")]
    public string? Sort { get; set; }

    /// <summary>Initial global search text.</summary>
    [HtmlAttributeName("search")]
    public string? Search { get; set; }

    /// <summary>
    /// Emit the init script. Set <see langword="false"/> to render only the
    /// container and the configuration block and call
    /// <c>TableX.createTableX</c> yourself — the way to add custom cell
    /// renderers, which are functions and cannot travel through JSON.
    /// </summary>
    [HtmlAttributeName("init")]
    public bool AutoInit { get; set; } = true;

    /// <summary>
    /// CSP nonce for the init script, for apps serving a strict
    /// <c>script-src</c> policy.
    /// </summary>
    [HtmlAttributeName("nonce")]
    public string? Nonce { get; set; }

    /// <summary>
    /// Collect the child column definitions, then render the container,
    /// configuration and init script.
    /// </summary>
    /// <param name="context">The Tag Helper context.</param>
    /// <param name="output">The output for this element.</param>
    /// <returns>A task that completes when the element has been rendered.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="context"/> or <paramref name="output"/> is <see langword="null"/>.</exception>
    /// <exception cref="InvalidOperationException">
    /// <c>caption</c> was omitted. It is the table's accessible name, so a grid
    /// without one is not shippable and failing loudly beats shipping it.
    /// </exception>
    public override async Task ProcessAsync(TagHelperContext context, TagHelperOutput output)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(output);

        if (string.IsNullOrWhiteSpace(Caption))
        {
            throw new InvalidOperationException(
                $"<{TagName}> requires a 'caption' attribute. It is the table's accessible name and the default export file name.");
        }

        // Seeded BEFORE the child content runs; <nex-grid-column> fills it in
        // source order, which is column order.
        var columns = new TableXColumnCollection();
        context.Items[typeof(TableXColumnCollection)] = columns;
        await output.GetChildContentAsync().ConfigureAwait(false);

        var containerId = string.IsNullOrWhiteSpace(Id)
            ? "tbx-" + Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture)[..12]
            : Id;
        var configId = containerId + "-config";

        output.TagName = "div";
        output.TagMode = TagMode.StartTagAndEndTag;
        output.Attributes.SetAttribute("id", containerId);
        output.Attributes.SetAttribute("data-tablex-config", configId);
        output.Content.SetHtmlContent(HtmlString.Empty);

        var json = TableXConfigSerializer.Serialize(BuildConfig(columns));

        var markup = new StringBuilder();
        markup.Append("<script type=\"application/json\" id=\"")
              .Append(HtmlEncoder.Default.Encode(configId))
              .Append("\">")
              .Append(json)
              .Append("</script>");

        if (AutoInit)
        {
            markup.Append("<script");
            if (!string.IsNullOrEmpty(Nonce))
            {
                markup.Append(" nonce=\"").Append(HtmlEncoder.Default.Encode(Nonce)).Append('"');
            }

            markup.Append('>').Append(BuildInitScript(containerId, configId)).Append("</script>");
        }

        output.PostElement.AppendHtml(markup.ToString());
    }

    private TableXConfig BuildConfig(IReadOnlyList<TableXColumnConfig> columns) => new()
    {
        Caption = Caption ?? string.Empty,
        Columns = columns,
        Endpoint = NullIfBlank(Endpoint),
        FetchEndpoint = NullIfBlank(FetchEndpoint),
        Density = TableXConfigSerializer.ToToken(
            TableXAttribute.ParseEnum<TableXDensity>(Density, TagName, "density")),
        Theme = TableXConfigSerializer.ToToken(
            TableXAttribute.ParseEnum<TableXTheme>(Theme, TagName, "theme")),
        ClassName = NullIfBlank(GridClass),
        EnableSearch = EnableSearch,
        SearchPlaceholder = NullIfBlank(SearchPlaceholder),
        EnableSelection = EnableSelection,
        EnableExport = EnableExport,
        ExportFileName = NullIfBlank(ExportFileName),
        ShowSerialNumber = ShowSerialNumber,
        Query = BuildQueryConfig(),
    };

    /// <summary>
    /// Only written when the author asked for something other than the defaults;
    /// otherwise the bundle's own <c>defaultQuery()</c> applies.
    /// </summary>
    private TableXQueryConfig? BuildQueryConfig()
    {
        var sort = SortSpec.TryParse(Sort, out var spec)
            ? new[] { new TableXSortConfig { Field = spec.Field, Dir = spec.Direction == SortDirection.Descending ? SortSpec.DescendingToken : SortSpec.AscendingToken } }
            : Array.Empty<TableXSortConfig>();

        var search = NullIfBlank(Search);

        if (Page is null && PageSize is null && sort.Length == 0 && search is null)
        {
            return null;
        }

        return new TableXQueryConfig
        {
            Page = Page is > 0 ? Page.Value : 1,
            PageSize = PageSize is null ? PageSizes.Default : PageSizes.Coerce(PageSize.Value),
            Sort = sort,
            Q = search,
        };
    }

    private string BuildInitScript(string containerId, string configId)
    {
        var container = TableXConfigSerializer.ToJsString(containerId);
        var config = TableXConfigSerializer.ToJsString(configId);
        var warning = TableXConfigSerializer.ToJsString(MissingBundleMessage);

        return
            "(function(){" +
                "var host=document.getElementById(" + container + ")," +
                    "data=document.getElementById(" + config + ");" +
                "if(!host||!data)return;" +
                "function start(){" +
                    "var api=window." + TableXAssets.GlobalName + ";" +
                    "if(!api||typeof api.createTableX!==\"function\"){" +
                        "if(window.console&&window.console.error)window.console.error(" + warning + ");" +
                        "return;" +
                    "}" +
                    "host.tablex=api.createTableX(host,JSON.parse(data.textContent));" +
                "}" +
                "if(document.readyState===\"loading\")" +
                    "document.addEventListener(\"DOMContentLoaded\",start);" +
                "else start();" +
            "})();";
    }

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
