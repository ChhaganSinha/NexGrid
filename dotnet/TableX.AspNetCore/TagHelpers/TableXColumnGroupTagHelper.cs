// <nex-grid-column-group> — multi-tier grouped header column container.

using Microsoft.AspNetCore.Razor.TagHelpers;

namespace TableX.AspNetCore;

/// <summary>
/// Groups child <see cref="TableXColumnTagHelper">&lt;nex-grid-column&gt;</see> elements under a
/// shared top-tier header cell (<c>colspan</c>).
/// </summary>
[HtmlTargetElement(TagName, ParentTag = TableXTagHelper.TagName)]
[HtmlTargetElement(TagName, ParentTag = TableXTagHelper.AliasTagName)]
[HtmlTargetElement(AliasTagName, ParentTag = TableXTagHelper.TagName)]
[HtmlTargetElement(AliasTagName, ParentTag = TableXTagHelper.AliasTagName)]
[RestrictChildren(TableXColumnTagHelper.TagName, TableXColumnTagHelper.AliasTagName)]
public class TableXColumnGroupTagHelper : TagHelper
{
    /// <summary>The primary element name this Tag Helper targets.</summary>
    public const string TagName = "nex-grid-column-group";

    /// <summary>Alias element name (<c>&lt;table-x-column-group&gt;</c>).</summary>
    public const string AliasTagName = "table-x-column-group";

    /// <summary>Group header text displayed across all child columns. Required.</summary>
    [HtmlAttributeName("header")]
    public string? Header { get; set; }

    /// <summary>Optional group column identifier.</summary>
    [HtmlAttributeName("id")]
    public string? Id { get; set; }

    /// <summary>Collect child columns into a grouped header definition.</summary>
    /// <param name="context">The Tag Helper context.</param>
    /// <param name="output">The output for this element; always suppressed.</param>
    public override async Task ProcessAsync(TagHelperContext context, TagHelperOutput output)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(output);

        output.SuppressOutput();

        if (string.IsNullOrWhiteSpace(Header))
        {
            throw new InvalidOperationException(
                $"<{TagName}> requires a 'header' attribute naming the column group.");
        }

        if (!context.Items.TryGetValue(typeof(TableXColumnCollection), out var parentBag) ||
            parentBag is not TableXColumnCollection parentColumns)
        {
            return;
        }

        var childColumns = new TableXColumnCollection();
        context.Items[typeof(TableXColumnCollection)] = childColumns;
        try
        {
            await output.GetChildContentAsync().ConfigureAwait(false);
        }
        finally
        {
            context.Items[typeof(TableXColumnCollection)] = parentColumns;
        }

        if (childColumns.Count > 0)
        {
            parentColumns.Add(new TableXColumnConfig
            {
                Id = string.IsNullOrWhiteSpace(Id) ? null : Id,
                Header = Header,
                Columns = childColumns,
            });
        }
    }
}
