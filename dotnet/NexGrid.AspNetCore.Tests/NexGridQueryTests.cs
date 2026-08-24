using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using Xunit;

namespace NexGrid.AspNetCore.Tests;

public class NexGridQueryTests
{
    [Fact]
    public void Default_HasExpectedValues()
    {
        var query = NexGridQuery.Default;

        Assert.Equal(1, query.Page);
        Assert.Equal(PageSizes.Default, query.PageSize);
        Assert.Empty(query.Sort);
        Assert.Null(query.Q);
        Assert.Empty(query.Filter);
        Assert.Null(query.PrimarySort);
    }

    [Fact]
    public void Parse_NullOrEmpty_ReturnsDefault()
    {
        Assert.Equal(1, NexGridQuery.Parse((IQueryCollection?)null).Page);
        Assert.Equal(1, NexGridQuery.Parse(string.Empty).Page);
        Assert.Equal(1, NexGridQuery.Parse("   ").Page);
    }

    [Fact]
    public void Parse_FullQueryString_ExtractsAllComponents()
    {
        var qs = "?page=3&pageSize=50&sort=name:asc&sort=score:desc&q=john&filter[status]=Active&filter[department]=Engineering";
        var query = NexGridQuery.Parse(qs);

        Assert.Equal(3, query.Page);
        Assert.Equal(50, query.PageSize);
        Assert.Equal(2, query.Sort.Count);
        Assert.Equal("name", query.Sort[0].Field);
        Assert.Equal(SortDirection.Ascending, query.Sort[0].Direction);
        Assert.Equal("score", query.Sort[1].Field);
        Assert.Equal(SortDirection.Descending, query.Sort[1].Direction);
        Assert.Equal("john", query.Q);
        Assert.Equal(2, query.Filter.Count);
        Assert.Equal("Active", query.GetFilter("status"));
        Assert.Equal("Engineering", query.GetFilter("department"));
        Assert.Equal("name", query.PrimarySort?.Field);
    }

    [Fact]
    public void Parse_InvalidValues_DegradesSafely()
    {
        var qs = "?page=-5&pageSize=999&sort=:asc&sort=invalid_dir:sideways";
        var query = NexGridQuery.Parse(qs);

        Assert.Equal(1, query.Page);
        Assert.Equal(PageSizes.Default, query.PageSize);
        Assert.Single(query.Sort);
        Assert.Equal("invalid_dir", query.Sort[0].Field);
        Assert.Equal(SortDirection.Ascending, query.Sort[0].Direction); // falls back to asc
    }

    [Fact]
    public void SortSpec_ToToken_RoundTrips()
    {
        var spec1 = new SortSpec("createdAt", SortDirection.Descending);
        Assert.Equal("createdAt:desc", spec1.ToToken());

        Assert.True(SortSpec.TryParse("createdAt:desc", out var parsed));
        Assert.Equal(spec1, parsed);
    }
}
