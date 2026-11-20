// The JSON handed to TableX.createTableX.
//
// Shaped to mirror TableXOptions in @nexgrid/vanilla exactly, with every
// optional value nullable so an unset Tag Helper attribute is OMITTED rather than
// written as a default. That matters: writing `"enableSearch": true` would pin the
// value even if the JS default later changes, and the two would drift.
//
// Serialization deliberately keeps System.Text.Json's DEFAULT encoder. It escapes
// `<`, `>` and `&` to \uXXXX, which means no caption, header, or endpoint a
// developer feeds in can close the surrounding <script> element early. That is
// the whole XSS story for this file, and it is why the config travels in a
// separate application/json block instead of being interpolated into executable JS.

using System.Text.Json;
using System.Text.Json.Serialization;

namespace TableX.AspNetCore;

internal static class TableXConfigSerializer
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };

    internal static string Serialize(TableXConfig config) => JsonSerializer.Serialize(config, Options);

    /// <summary>
    /// Quote a value as a JavaScript string literal safe to inline in a
    /// <c>&lt;script&gt;</c> element. JSON string syntax is a subset of
    /// JavaScript's, and the default encoder escapes every <c>&lt;</c> to a
    /// unicode escape, so the literal cannot terminate the element.
    /// </summary>
    internal static string ToJsString(string value) => JsonSerializer.Serialize(value, Options);

    internal static string? ToToken(TableXDensity? density) => density switch
    {
        TableXDensity.Compact => "compact",
        TableXDensity.Default => "default",
        TableXDensity.Comfortable => "comfortable",
        _ => null,
    };

    internal static string? ToToken(TableXTheme? theme) => theme switch
    {
        TableXTheme.Light => "light",
        TableXTheme.Dark => "dark",
        TableXTheme.Auto => "auto",
        _ => null,
    };

    internal static string? ToToken(TableXColumnAlign? align) => align switch
    {
        TableXColumnAlign.Left => "left",
        TableXColumnAlign.Center => "center",
        TableXColumnAlign.Right => "right",
        _ => null,
    };

    internal static string? ToToken(TableXSelectionMode? mode) => mode switch
    {
        TableXSelectionMode.Multi => "multi",
        TableXSelectionMode.Single => "single",
        _ => null,
    };

    internal static string? ToToken(TableXExportMode? mode) => mode switch
    {
        TableXExportMode.Menu => "menu",
        TableXExportMode.Split => "split",
        TableXExportMode.Excel => "excel",
        TableXExportMode.Csv => "csv",
        _ => null,
    };

    internal static string? ToToken(TableXColumnPin? pin) => pin switch
    {
        TableXColumnPin.Left => "left",
        TableXColumnPin.Right => "right",
        _ => null,
    };

    internal static string? ToToken(TableXAggregation? aggregation) => aggregation switch
    {
        TableXAggregation.Sum => "sum",
        TableXAggregation.Avg => "avg",
        TableXAggregation.Count => "count",
        TableXAggregation.Min => "min",
        TableXAggregation.Max => "max",
        _ => null,
    };

    internal static string? ToToken(TableXEditType? editType) => editType switch
    {
        TableXEditType.Text => "text",
        TableXEditType.Number => "number",
        TableXEditType.Select => "select",
        _ => null,
    };

    internal static string? NormalizeFilterType(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var normalized = raw.Trim().ToLowerInvariant();
        return normalized switch
        {
            "numberrange" => "number-range",
            "daterange" => "date-range",
            _ => normalized,
        };
    }
}

internal sealed class TableXConfig
{
    public string Caption { get; set; } = string.Empty;

    public IReadOnlyList<TableXColumnConfig> Columns { get; set; } = [];

    public object? Data { get; set; }

    public int? Total { get; set; }

    public bool? ClientSidePagination { get; set; }

    public string? Endpoint { get; set; }

    public string? FetchEndpoint { get; set; }

    public string? Density { get; set; }

    public string? Theme { get; set; }

    public string? ClassName { get; set; }

    public bool? EnableSearch { get; set; }

    public string? SearchPlaceholder { get; set; }

    public bool? EnableSelection { get; set; }

    public string? SelectionMode { get; set; }

    public bool? EnableColumnFilters { get; set; }

    public bool? EnableColumnResize { get; set; }

    public bool? EnableColumnReorder { get; set; }

    public bool? EnableSorting { get; set; }

    public bool? EnableExport { get; set; }

    public string? ExportMode { get; set; }

    public bool? QuickExport { get; set; }

    public int? MaxExportRows { get; set; }

    public string? ExportFileName { get; set; }

    public string? StorageKey { get; set; }

    public bool? EnableSummaryRow { get; set; }

    public bool? EnableBulkActions { get; set; }

    public bool? ShowFilterPills { get; set; }

    public bool? ShowToolbar { get; set; }

    public bool? ShowFooter { get; set; }

    public bool? EnableColumns { get; set; }

    public bool? EnableDensity { get; set; }

    public bool? EnablePagination { get; set; }

    public bool? EnableRowsPerPage { get; set; }

    public bool? EnableJumpToPage { get; set; }

    public bool? ShowSerialNumber { get; set; }

    public TableXQueryConfig? Query { get; set; }
}

internal sealed class TableXQueryConfig
{
    public int Page { get; set; } = 1;

    public int PageSize { get; set; } = PageSizes.Default;

    public IReadOnlyList<TableXSortConfig> Sort { get; set; } = [];

    public string? Q { get; set; }

    public IReadOnlyDictionary<string, string>? Filter { get; set; }
}

internal sealed class TableXSortConfig
{
    public string Field { get; set; } = string.Empty;

    /// <summary>The wire token, <c>asc</c> or <c>desc</c> — core's property name is `dir`.</summary>
    public string Dir { get; set; } = SortSpec.AscendingToken;
}

internal sealed class TableXColumnConfig
{
    public string? Id { get; set; }

    public string? AccessorKey { get; set; }

    public string? Header { get; set; }

    public bool? EnableSorting { get; set; }

    public IReadOnlyList<TableXColumnConfig>? Columns { get; set; }

    public TableXColumnMetaConfig? Meta { get; set; }
}

internal sealed class TableXColumnMetaConfig
{
    public int? Width { get; set; }

    public int? MinWidth { get; set; }

    public int? Flex { get; set; }

    public string? Align { get; set; }

    public string? Pinned { get; set; }

    public bool? Hidden { get; set; }

    public bool? Hideable { get; set; }

    public bool? Exportable { get; set; }

    public bool? ServerFilterable { get; set; }

    public string? ServerFilterField { get; set; }

    public string? SortField { get; set; }

    public string? FilterType { get; set; }

    public string? FilterPlaceholder { get; set; }

    public IReadOnlyList<string>? FilterOptions { get; set; }

    public string? Aggregation { get; set; }

    public string? AggregationLabel { get; set; }

    public bool? Editable { get; set; }

    public string? EditType { get; set; }

    public IReadOnlyList<string>? EditOptions { get; set; }

    /// <summary>True when at least one hint was set; an all-null meta object is not written.</summary>
    internal bool HasValues =>
        Width is not null ||
        MinWidth is not null ||
        Flex is not null ||
        Align is not null ||
        Pinned is not null ||
        Hidden is not null ||
        Hideable is not null ||
        Exportable is not null ||
        ServerFilterable is not null ||
        ServerFilterField is not null ||
        SortField is not null ||
        FilterType is not null ||
        FilterPlaceholder is not null ||
        FilterOptions is not null ||
        Aggregation is not null ||
        AggregationLabel is not null ||
        Editable is not null ||
        EditType is not null ||
        EditOptions is not null;
}
