// The JSON handed to TableX.createTableX.
//
// Shaped to mirror TableXOptions in @tablex/vanilla exactly, with every
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
}

internal sealed class TableXConfig
{
    public string Caption { get; set; } = string.Empty;

    public IReadOnlyList<TableXColumnConfig> Columns { get; set; } = [];

    public string? Endpoint { get; set; }

    public string? FetchEndpoint { get; set; }

    public string? Density { get; set; }

    public string? Theme { get; set; }

    public string? ClassName { get; set; }

    public bool? EnableSearch { get; set; }

    public string? SearchPlaceholder { get; set; }

    public bool? EnableSelection { get; set; }

    public bool? EnableExport { get; set; }

    public string? ExportFileName { get; set; }

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
    public string AccessorKey { get; set; } = string.Empty;

    public string? Header { get; set; }

    public bool? EnableSorting { get; set; }

    public TableXColumnMetaConfig? Meta { get; set; }
}

internal sealed class TableXColumnMetaConfig
{
    public int? Width { get; set; }

    public int? MinWidth { get; set; }

    public int? Flex { get; set; }

    public string? Align { get; set; }

    public bool? Hidden { get; set; }

    public bool? Hideable { get; set; }

    public bool? Exportable { get; set; }

    public bool? ServerFilterable { get; set; }

    public string? ServerFilterField { get; set; }

    public IReadOnlyList<string>? FilterOptions { get; set; }

    /// <summary>True when at least one hint was set; an all-null meta object is not written.</summary>
    internal bool HasValues =>
        Width is not null ||
        MinWidth is not null ||
        Flex is not null ||
        Align is not null ||
        Hidden is not null ||
        Hideable is not null ||
        Exportable is not null ||
        ServerFilterable is not null ||
        ServerFilterField is not null ||
        FilterOptions is not null;
}
