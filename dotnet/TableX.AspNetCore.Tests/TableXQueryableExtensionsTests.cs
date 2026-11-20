using Xunit;

namespace TableX.AspNetCore.Tests;

public class TestStudent
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Department { get; set; } = "Engineering";
    public StudentStatus Status { get; set; }
    public double Score { get; set; }
    public DateTime EnrolledAt { get; set; }
}

public class TableXQueryableExtensionsTests
{
    private readonly List<TestStudent> _students =
    [
        new() { Id = 1, Name = "Alice Johnson", Email = "alice@example.com", Department = "Engineering", Status = StudentStatus.Active, Score = 95.5, EnrolledAt = new DateTime(2024, 1, 10, 9, 0, 0, DateTimeKind.Utc) },
        new() { Id = 2, Name = "Bob Smith", Email = "bob@example.com", Department = "Marketing", Status = StudentStatus.Pending, Score = 82.0, EnrolledAt = new DateTime(2024, 1, 15, 16, 45, 0, DateTimeKind.Utc) },
        new() { Id = 3, Name = "Charlie Brown", Email = "charlie@example.com", Department = "Engineering", Status = StudentStatus.Active, Score = 88.0, EnrolledAt = new DateTime(2024, 2, 5, 12, 0, 0, DateTimeKind.Utc) },
        new() { Id = 4, Name = "Diana Prince", Email = null, Department = "Sales", Status = StudentStatus.Suspended, Score = 74.0, EnrolledAt = new DateTime(2024, 3, 20, 8, 30, 0, DateTimeKind.Utc) },
        new() { Id = 5, Name = "Evan Wright", Email = "evan@example.com", Department = "Engineering", Status = StudentStatus.Alumni, Score = 91.0, EnrolledAt = new DateTime(2024, 4, 1, 0, 0, 0, DateTimeKind.Utc) },
    ];

    [Fact]
    public void ToPagedResponse_DefaultQuery_ReturnsFirstPageAndTotal()
    {
        var query = TableXQuery.Default;
        var response = _students.AsQueryable().ToPagedResponse(query, options => options
            .Sortable(s => s.Name, s => s.Score)
            .Searchable(s => s.Name, s => s.Email)
            .Filterable("status", s => s.Status));

        Assert.Equal(5, response.Total);
        Assert.Equal(5, response.Items.Count);
        Assert.Equal(1, response.Page);
        Assert.Equal(PageSizes.Default, response.PageSize);
    }

    [Fact]
    public void ToPagedResponse_Sort_OrdersCorrectly()
    {
        var query = new TableXQuery
        {
            Sort = [new SortSpec("Score", SortDirection.Descending)]
        };

        var response = _students.AsQueryable().ToPagedResponse(query, options => options
            .Sortable(s => s.Score));

        Assert.Equal("Alice Johnson", response.Items[0].Name); // 95.5
        Assert.Equal("Diana Prince", response.Items[^1].Name); // 74.0
    }

    [Fact]
    public void ToPagedResponse_Filter_FiltersByEnum()
    {
        var query = new TableXQuery
        {
            Filter = new Dictionary<string, string> { ["status"] = "Active" }
        };

        var response = _students.AsQueryable().ToPagedResponse(query, options => options
            .Filterable("status", s => s.Status));

        Assert.Equal(2, response.Total);
        Assert.All(response.Items, s => Assert.Equal(StudentStatus.Active, s.Status));
    }

    [Fact]
    public void ToPagedResponse_Filter_Range_FiltersNumericRange()
    {
        var query = new TableXQuery
        {
            Filter = new Dictionary<string, string> { ["score"] = "80..92" }
        };

        var response = _students.AsQueryable().ToPagedResponse(query, options => options
            .Filterable("score", s => s.Score));

        // 82.0 (Bob), 88.0 (Charlie), 91.0 (Evan)
        Assert.Equal(3, response.Total);
        Assert.All(response.Items, s => Assert.True(s.Score >= 80 && s.Score <= 92));
    }

    [Fact]
    public void ToPagedResponse_Search_FiltersMatchingFields()
    {
        var query = new TableXQuery { Q = "Smith" };

        var response = _students.AsQueryable().ToPagedResponse(query, options => options
            .Searchable(s => s.Name, s => s.Email));

        Assert.Equal(1, response.Total);
        Assert.Equal("Bob Smith", response.Items[0].Name);
    }

    [Fact]
    public async Task ToPagedResponseAsync_EvaluatesAsyncBridge()
    {
        var query = TableXQuery.Default;
        var response = await _students.AsQueryable().ToPagedResponseAsync(query, options => options
            .Sortable(s => s.Name));

        Assert.Equal(5, response.Total);
        Assert.Equal(5, response.Items.Count);
    }

    [Fact]
    public void ToPagedResponse_Search_IsCaseInsensitiveAndNullSafe()
    {
        var query = new TableXQuery { Q = "  smith  " };

        var response = _students.AsQueryable().ToPagedResponse(query, options => options
            .Searchable(s => s.Name, s => s.Email));

        Assert.Equal(1, response.Total);
        Assert.Equal("Bob Smith", response.Items[0].Name);
    }

    [Fact]
    public void ToPagedResponse_StringFilters_SupportCaseInsensitiveEqualsAndContains()
    {
        // Exact (case-insensitive) match via Filterable
        var deptQuery = new TableXQuery
        {
            Filter = new Dictionary<string, string> { ["department"] = "engineering" }
        };
        var deptRes = _students.AsQueryable().ToPagedResponse(deptQuery, options => options
            .Filterable(s => s.Department));
        Assert.Equal(3, deptRes.Total);

        // Substring (case-insensitive) match via FilterableContains
        var nameQuery = new TableXQuery
        {
            Filter = new Dictionary<string, string> { ["name"] = "john", ["email"] = "EXAMPLE.COM" }
        };
        var nameRes = _students.AsQueryable().ToPagedResponse(nameQuery, options => options
            .FilterableContains(s => s.Name, s => s.Email));
        Assert.Equal(1, nameRes.Total);
        Assert.Equal("Alice Johnson", nameRes.Items[0].Name);
    }

    [Fact]
    public void ToPagedResponse_DateTimeFilters_IncludeEndOfDayInRangesAndSingleDates()
    {
        // Bob enrolled at 2024-01-15 16:45:00 UTC -> must be included when upper bound is "2024-01-15"
        var rangeQuery = new TableXQuery
        {
            Filter = new Dictionary<string, string> { ["enrolledAt"] = "2024-01-01..2024-01-15" }
        };
        var rangeRes = _students.AsQueryable().ToPagedResponse(rangeQuery, options => options
            .Filterable(s => s.EnrolledAt));
        Assert.Equal(2, rangeRes.Total); // Alice (Jan 10) and Bob (Jan 15 16:45)

        // Single calendar date matches timestamp on that date
        var dayQuery = new TableXQuery
        {
            Filter = new Dictionary<string, string> { ["enrolledAt"] = "2024-01-15" }
        };
        var dayRes = _students.AsQueryable().ToPagedResponse(dayQuery, options => options
            .Filterable(s => s.EnrolledAt));
        Assert.Equal(1, dayRes.Total);
        Assert.Equal("Bob Smith", dayRes.Items[0].Name);
    }

    [Fact]
    public void ToPagedResponse_OperatorAndMultiSort_WorkTogether()
    {
        var query = new TableXQuery
        {
            Filter = new Dictionary<string, string> { ["score"] = ">=80" },
            Sort =
            [
                new SortSpec("department", SortDirection.Ascending),
                new SortSpec("score", SortDirection.Descending),
            ],
        };

        var res = _students.AsQueryable().ToPagedResponse(query, options => options
            .Filterable(s => s.Score)
            .Sortable(s => s.Department, s => s.Score));

        // >= 80: Alice (Eng, 95.5), Evan (Eng, 91.0), Charlie (Eng, 88.0), Bob (Mkt, 82.0)
        Assert.Equal(4, res.Total);
        Assert.Equal(["Alice Johnson", "Evan Wright", "Charlie Brown", "Bob Smith"], res.Items.Select(s => s.Name).ToArray());
    }

    [Fact]
    public void ToPagedResponse_MultiSelectPipeFilter_CombinesEnumAndStringTokensWithOr()
    {
        var enumOrQuery = new TableXQuery
        {
            Filter = new Dictionary<string, string> { ["status"] = "Active|Pending" },
        };

        var enumRes = _students.AsQueryable().ToPagedResponse(enumOrQuery, options => options
            .Filterable("status", s => s.Status));

        // Alice (Active), Bob (Pending), Charlie (Active)
        Assert.Equal(3, enumRes.Total);
        Assert.All(enumRes.Items, s => Assert.True(s.Status is StudentStatus.Active or StudentStatus.Pending));

        var stringOrQuery = new TableXQuery
        {
            Filter = new Dictionary<string, string> { ["department"] = "marketing|sales" },
        };

        var stringRes = _students.AsQueryable().ToPagedResponse(stringOrQuery, options => options
            .Filterable(s => s.Department));

        // Bob (Marketing) + Diana (Sales)
        Assert.Equal(2, stringRes.Total);
        Assert.Equal(["Bob Smith", "Diana Prince"], stringRes.Items.Select(s => s.Name).ToArray());
    }
}
