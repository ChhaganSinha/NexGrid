namespace NexGrid.Example.Mvc.Models;

/// <summary>
/// The row type the grid pages through.
/// </summary>
/// <remarks>
/// Property names matter: ASP.NET Core serializes them camelCase by default, so
/// <c>EnrolledAt</c> reaches the browser as <c>enrolledAt</c> — which is exactly
/// what <c>&lt;nex-grid-column field="enrolledAt" /&gt;</c> has to say.
/// </remarks>
public sealed class Student
{
    public int Id { get; init; }

    public string Name { get; init; } = string.Empty;

    public string Email { get; init; } = string.Empty;

    public string Department { get; init; } = string.Empty;

    /// <summary>
    /// A string rather than an enum, so it serializes as <c>"Active"</c> without
    /// a converter. An enum works too — <c>Filterable</c> parses the raw filter
    /// value into the member's type, enums included.
    /// </summary>
    public string Status { get; init; } = "Active";

    public int Score { get; init; }

    /// <summary>Serializes as <c>"2021-03-08"</c> under System.Text.Json.</summary>
    public DateOnly EnrolledAt { get; init; }

    public bool Scholarship { get; init; }
}
