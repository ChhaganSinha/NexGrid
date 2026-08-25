using System.Globalization;

namespace TableX.Example.Mvc.Models;

/// <summary>
/// A 200-row in-memory dataset, standing in for a database.
/// </summary>
/// <remarks>
/// <para>
/// It exposes <see cref="Query"/> as an <see cref="IQueryable{T}"/> for one
/// reason: that is the exact shape <c>ToPagedResponse</c> composes onto, so the
/// controller in this example is character-for-character what it would be
/// against EF Core — swap <c>_store.Query</c> for <c>db.Students.AsNoTracking()</c>
/// and nothing else moves.
/// </para>
/// <para>
/// One real difference to know about: <c>Searchable</c> translates to
/// <c>string.Contains</c>, whose case sensitivity follows the data source. Over
/// this in-memory list the match is ORDINAL (so <c>sharma</c> does not find
/// <c>Sharma</c>); on SQL Server with a default collation the same code is
/// case-insensitive.
/// </para>
/// </remarks>
public sealed class StudentStore
{
    private static readonly string[] FirstNames =
    [
        "Aditi", "Rahul", "Meera", "Jonas", "Priya", "Chen", "Sofia", "Omar",
        "Elena", "Tomas", "Nadia", "Hiroshi", "Grace", "Malik", "Ingrid", "Yusuf",
        "Clara", "Diego", "Anika", "Peter",
    ];

    private static readonly string[] LastNames =
    [
        "Sharma", "Okafor", "Lindqvist", "Alvarez", "Tanaka", "Fitzgerald", "Novak",
        "Haddad", "Kowalski", "Mbeki", "Rossi", "Andersen", "Duarte", "Volkov",
    ];

    private static readonly string[] Departments =
    [
        "Computer Science", "Mechanical", "Electrical", "Mathematics", "Physics", "Economics",
    ];

    /// <summary>The status values the grid's filter offers.</summary>
    public static IReadOnlyList<string> Statuses { get; } =
        ["Active", "Pending", "Suspended", "Alumni"];

    private readonly List<Student> _students = Build(200);

    /// <summary>The dataset as a composable query.</summary>
    public IQueryable<Student> Query => _students.AsQueryable();

    private static List<Student> Build(int count)
    {
        var rows = new List<Student>(count);
        var start = new DateOnly(2021, 1, 1);

        for (var i = 0; i < count; i++)
        {
            var first = FirstNames[(i * 7 + 3) % FirstNames.Length];
            var last = LastNames[(i * 5 + 1) % LastNames.Length];

            rows.Add(new Student
            {
                Id = 1000 + i,
                Name = $"{first} {last}",
                Email = $"{first}.{last}{i}".ToLower(CultureInfo.InvariantCulture) + "@example.edu",
                Department = Departments[(i * 5 + 2) % Departments.Length],
                Status = Statuses[(int)(PseudoRandom(i + 1) * Statuses.Count)],
                Score = (int)Math.Round(45 + (PseudoRandom(i + 101) * 55)),
                EnrolledAt = start.AddDays((i * 7) + (i % 5)),
                Scholarship = PseudoRandom(i + 7) > 0.68,
            });
        }

        return rows;
    }

    /// <summary>A sine hash: reproducible pseudo-randomness in <c>[0, 1)</c>.</summary>
    private static double PseudoRandom(int seed)
    {
        var x = Math.Sin(seed * 12.9898) * 43758.5453;
        return x - Math.Floor(x);
    }
}
