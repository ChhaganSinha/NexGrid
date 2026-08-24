using Microsoft.AspNetCore.Components;

namespace NexGrid.AspNetCore.Components;

/// <summary>
/// Declares a column inside a Blazor <see cref="NexGrid{TItem}"/>.
/// </summary>
public class NexGridColumn : ComponentBase
{
    [CascadingParameter]
    internal NexGridColumnCollection? ColumnCollection { get; set; }

    /// <summary>
    /// The JSON property name this column reads. Required.
    /// </summary>
    [Parameter]
    public string Field { get; set; } = string.Empty;

    /// <summary>
    /// Header text. Defaults to <see cref="Field"/> with its first letter capitalised.
    /// </summary>
    [Parameter]
    public string? Header { get; set; }

    /// <summary>
    /// Whether the header is clickable to sort. Defaults to <see langword="true"/>.
    /// </summary>
    [Parameter]
    public bool Sortable { get; set; } = true;

    /// <summary>
    /// Header and cell alignment: <see cref="NexGridColumnAlign.Left"/>, <see cref="NexGridColumnAlign.Center"/>, or <see cref="NexGridColumnAlign.Right"/>.
    /// </summary>
    [Parameter]
    public NexGridColumnAlign Align { get; set; } = NexGridColumnAlign.Left;

    /// <summary>Fixed column width in pixels.</summary>
    [Parameter]
    public int? Width { get; set; }

    /// <summary>Minimum column width in pixels.</summary>
    [Parameter]
    public int? MinWidth { get; set; }

    /// <summary>Proportional width unit.</summary>
    [Parameter]
    public int? Flex { get; set; }

    /// <summary>Start hidden. The column is still listed in the Columns menu.</summary>
    [Parameter]
    public bool Hidden { get; set; }

    /// <summary>Whether the Columns menu may toggle this column. Defaults to <see langword="true"/>.</summary>
    [Parameter]
    public bool Hideable { get; set; } = true;

    /// <summary>Whether this column appears in CSV and Excel exports. Defaults to <see langword="true"/>.</summary>
    [Parameter]
    public bool Exportable { get; set; } = true;

    /// <summary>Marks the column as server-filterable.</summary>
    [Parameter]
    public bool Filterable { get; set; }

    /// <summary>The filter key to send when it differs from <see cref="Field"/>.</summary>
    [Parameter]
    public string? FilterField { get; set; }

    /// <summary>Comma-separated allowed filter values (e.g. <c>"Active,Pending,Suspended"</c>).</summary>
    [Parameter]
    public string? FilterOptions { get; set; }

    /// <inheritdoc />
    protected override void OnInitialized()
    {
        if (string.IsNullOrWhiteSpace(Field))
        {
            throw new InvalidOperationException("<NexGridColumn> requires a non-empty 'Field' parameter.");
        }

        var meta = new NexGridColumnMetaConfig
        {
            Width = Width,
            MinWidth = MinWidth,
            Flex = Flex,
            Align = NexGridConfigSerializer.ToToken(Align),
            Hidden = Hidden ? true : null,
            Hideable = !Hideable ? false : null,
            Exportable = !Exportable ? false : null,
            ServerFilterable = Filterable ? true : null,
            ServerFilterField = FilterField,
            FilterOptions = ParseFilterOptions(FilterOptions),
        };

        ColumnCollection?.Add(new NexGridColumnConfig
        {
            AccessorKey = Field,
            Header = Header ?? (Field.Length > 0 ? char.ToUpper(Field[0], System.Globalization.CultureInfo.InvariantCulture) + Field[1..] : Field),
            EnableSorting = !Sortable ? false : null,
            Meta = meta.HasValues ? meta : null,
        });
    }

    private static IReadOnlyList<string>? ParseFilterOptions(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var parts = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length == 0 ? null : parts;
    }
}
