// The three enumerations a Razor author picks from, and the parser the Tag
// Helpers read them with.
//
// The Tag Helper properties themselves are STRINGS, deliberately. Razor compiles
// a non-string Tag Helper attribute as a C# expression, so an enum-typed property
// would force `align="NexGridColumnAlign.Center"` into every column — noise in
// markup that is otherwise plain HTML. Taking the string and parsing it here
// accepts `align="Center"`, `align="center"` and `align="@myAlign"` alike, and
// still rejects a typo with a message naming the values that would have worked.

namespace NexGrid.AspNetCore;

internal static class NexGridAttribute
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
public enum NexGridDensity
{
    /// <summary>Standard rows (44 px).</summary>
    Default = 0,

    /// <summary>Compact rows (36 px).</summary>
    Compact = 1,

    /// <summary>Comfortable rows (52 px).</summary>
    Comfortable = 2,
}

/// <summary>Colour scheme applied to the grid root.</summary>
public enum NexGridTheme
{
    /// <summary>Always light.</summary>
    Light = 0,

    /// <summary>Always dark.</summary>
    Dark = 1,

    /// <summary>Follow the operating system's <c>prefers-color-scheme</c>.</summary>
    Auto = 2,
}

/// <summary>Horizontal alignment of a column's header and cells.</summary>
public enum NexGridColumnAlign
{
    /// <summary>Left aligned (the default).</summary>
    Left = 0,

    /// <summary>Centred.</summary>
    Center = 1,

    /// <summary>Right aligned — the usual choice for numbers.</summary>
    Right = 2,
}
