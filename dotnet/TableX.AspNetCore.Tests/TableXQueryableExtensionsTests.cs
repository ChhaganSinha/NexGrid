using Xunit;

namespace TableX.AspNetCore.Tests;

public class TestStudent
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public StudentStatus Status { get; set; }
    public double Score { get; set; }
}

public class TableXQueryableExtensionsTests
{
    private readonly List<TestStudent> _students =
    [
        new() { Id = 1, Name = "Alice Johnson", Email = "alice@example.com", Status = StudentStatus.Active, Score = 95.5 },
        new() { Id = 2, Name = "Bob Smith", Email = "bob@example.com", Status = StudentStatus.Pending, Score = 82.0 },
        new() { Id = 3, Name = "Charlie Brown", Email = "charlie@example.com", Status = StudentStatus.Active, Score = 88.0 },
        new() { Id = 4, Name = "Diana Prince", Email = "diana@example.com", Status = StudentStatus.Suspended, Score = 74.0 },
        new() { Id = 5, Name = "Evan Wright", Email = "evan@example.com", Status = StudentStatus.Alumni, Score = 91.0 },
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
}
