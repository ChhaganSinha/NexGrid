using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Xunit;

namespace TableX.AspNetCore.Tests;

public class TableXModelBinderTests
{
    [Fact]
    public async Task BindModelAsync_ExtractsQueryAndSetsModelResult()
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.QueryString = new QueryString("?page=2&pageSize=25&sort=name:asc");

        var bindingContext = new DefaultModelBindingContext
        {
            ActionContext = new Microsoft.AspNetCore.Mvc.ActionContext
            {
                HttpContext = httpContext
            },
            ModelName = "query",
            ModelState = new ModelStateDictionary(),
            ModelMetadata = new EmptyModelMetadataProvider().GetMetadataForType(typeof(TableXQuery)),
        };

        var binder = new TableXQueryModelBinder();
        await binder.BindModelAsync(bindingContext);

        Assert.True(bindingContext.Result.IsModelSet);
        var boundQuery = Assert.IsType<TableXQuery>(bindingContext.Result.Model);
        Assert.Equal(2, boundQuery.Page);
        Assert.Equal(25, boundQuery.PageSize);
        Assert.Single(boundQuery.Sort);
        Assert.Equal("name", boundQuery.Sort[0].Field);
    }
}
