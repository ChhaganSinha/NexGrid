// The three enumerations a Razor author picks from, and the parser the Tag
// Helpers read them with.
//
// The Tag Helper properties themselves are STRINGS, deliberately. Razor compiles
// a non-string Tag Helper attribute as a C# expression, so an enum-typed property
// would force `align="TableXColumnAlign.Center"` into every column — noise in
// markup that is otherwise plain HTML. Taking the string and parsing it here
// accepts `align="Center"`, `align="center"` and `align="@myAlign"` alike, and
// still rejects a typo with a message naming the values that would have worked.

namespace TableX.AspNetCore;

internal static class TableXAttribute
{
    /// <summary>Parse an enum-valued Tag Helper attribute, or throw naming the valid values.</summary>
    internal static TEnum? ParseEnum<TEnum>(string? raw, string tagName, string attributeName)
        where TEnum : struct, Enum
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        if (Enum.TryParse<TEnum>(raw.Trim(), ignoreCase: true, out var parsed) && Enum.IsDefined(parsed))
        {
            return parsed;
        }

        throw new InvalidOperationException(
            $"<{tagName}> attribute '{attributeName}' has value '{raw}'. Valid values are: {string.Join(", ", Enum.GetNames<TEnum>())}.");
    }
}

/// <summary>Row height preset applied to the grid root.</summary>
public enum TableXDensity
{
    /// <summary>Standard rows (44 px).</summary>
    Default = 0,

    /// <summary>Compact rows (36 px).</summary>
    Compact = 1,

    /// <summary>Comfortable rows (52 px).</summary>
    Comfortable = 2,
}

/// <summary>Colour scheme applied to the grid root.</summary>
public enum TableXTheme
{
    /// <summary>Always light.</summary>
    Light = 0,

    /// <summary>Always dark.</summary>
    Dark = 1,

    /// <summary>Follow the operating system's <c>prefers-color-scheme</c>.</summary>
    Auto = 2,
}

/// <summary>Horizontal alignment of a column's header and cells.</summary>
public enum TableXColumnAlign
{
    /// <summary>Left aligned (the default).</summary>
    Left = 0,

    /// <summary>Centred.</summary>
    Center = 1,

    /// <summary>Right aligned — the usual choice for numbers.</summary>
    Right = 2,
}

/// <summary>Row selection mode when <c>enable-selection</c> is turned on.</summary>
public enum TableXSelectionMode
{
    /// <summary>Multiple rows can be selected via checkboxes (the default).</summary>
    Multi = 0,

    /// <summary>At most one row can be selected at a time via radio buttons.</summary>
    Single = 1,
}

/// <summary>Toolbar export button presentation mode.</summary>
public enum TableXExportMode
{
    /// <summary>Single button opening a dropdown menu with Excel, CSV, and Clipboard options (the default).</summary>
    Menu = 0,

    /// <summary>1-click Excel export button paired with a chevron dropdown for CSV and Clipboard.</summary>
    Split = 1,

    /// <summary>Direct 1-click Excel export button.</summary>
    Excel = 2,

    /// <summary>Direct 1-click CSV export button.</summary>
    Csv = 3,
}

/// <summary>Sticky horizontal pin side for a column.</summary>
public enum TableXColumnPin
{
    /// <summary>Freeze column to the left edge during horizontal scrolling.</summary>
    Left = 0,

    /// <summary>Freeze column to the right edge during horizontal scrolling.</summary>
    Right = 1,
}

/// <summary>Built-in summary footer calculation for a column.</summary>
public enum TableXAggregation
{
    /// <summary>Sum of numeric values on the current page.</summary>
    Sum = 0,

    /// <summary>Arithmetic mean of numeric values on the current page.</summary>
    Avg = 1,

    /// <summary>Row count on the current page.</summary>
    Count = 2,

    /// <summary>Minimum numeric value on the current page.</summary>
    Min = 3,

    /// <summary>Maximum numeric value on the current page.</summary>
    Max = 4,
}

/// <summary>Editor control rendered when inline cell editing is triggered.</summary>
public enum TableXEditType
{
    /// <summary>Plain text input (the default).</summary>
    Text = 0,

    /// <summary>Numeric input.</summary>
    Number = 1,

    /// <summary>Dropdown select populated from <c>edit-options</c>.</summary>
    Select = 2,
}
