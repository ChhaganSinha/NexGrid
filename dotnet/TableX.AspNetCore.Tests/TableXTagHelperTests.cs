using System.Text.Json;
using Microsoft.AspNetCore.Razor.TagHelpers;
using Xunit;

namespace TableX.AspNetCore.Tests;

public class TableXTagHelperTests
{
    [Fact]
    public async Task ProcessAsync_SerializesAllEnterpriseGridAndColumnOptions()
    {
        var grid = new TableXTagHelper
        {
            Id = "emp-grid",
            Caption = "Employees",
            Endpoint = "/api/employees",
            StorageKey = "emp-grid-v1",
            EnableSelection = true,
            SelectionMode = "Single",
            ExportMode = "Split",
            MaxExportRows = 5000,
            EnableColumnReorder = true,
            EnableColumnResize = true,
            EnableSummaryRow = true,
            EnableBulkActions = true,
            ShowFilterPills = true,
            AutoInit = false,
        };

        var columnsToRun = new TableXColumnTagHelper[]
        {
            new()
            {
                Field = "name",
                Header = "Employee",
                MinWidth = 200,
                Pinned = "Left",
            },
            new()
            {
                Field = "status",
                Header = "Status",
                Align = "Center",
                Editable = true,
                EditType = "Select",
                EditOptions = "Active, Pending, Suspended",
                Filterable = true,
                FilterOptions = "Active,Pending,Suspended",
            },
            new()
            {
                Field = "score",
                Header = "Score",
                Align = "Right",
                FilterType = "NumberRange",
                Aggregation = "Avg",
                AggregationLabel = "Avg:",
                Editable = true,
                EditType = "Number",
            },
        };

        var html = await RenderGridAsync(grid, async ctx =>
        {
            foreach (var col in columnsToRun)
            {
                var colOutput = CreateEmptyOutput(TableXColumnTagHelper.TagName);
                await col.ProcessAsync(ctx, colOutput);
            }
        });

        var json = ExtractConfigJson(html);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal("Employees", root.GetProperty("caption").GetString());
        Assert.Equal("/api/employees", root.GetProperty("endpoint").GetString());
        Assert.Equal("emp-grid-v1", root.GetProperty("storageKey").GetString());
        Assert.Equal("single", root.GetProperty("selectionMode").GetString());
        Assert.Equal("split", root.GetProperty("exportMode").GetString());
        Assert.Equal(5000, root.GetProperty("maxExportRows").GetInt32());
        Assert.True(root.GetProperty("enableColumnReorder").GetBoolean());
        Assert.True(root.GetProperty("enableSummaryRow").GetBoolean());

        var cols = root.GetProperty("columns");
        Assert.Equal(3, cols.GetArrayLength());

        var nameMeta = cols[0].GetProperty("meta");
        Assert.Equal("left", nameMeta.GetProperty("pinned").GetString());

        var statusMeta = cols[1].GetProperty("meta");
        Assert.True(statusMeta.GetProperty("editable").GetBoolean());
        Assert.Equal("select", statusMeta.GetProperty("editType").GetString());
        Assert.Equal(["Active", "Pending", "Suspended"], statusMeta.GetProperty("editOptions").EnumerateArray().Select(e => e.GetString()!).ToArray());

        var scoreMeta = cols[2].GetProperty("meta");
        Assert.Equal("number-range", scoreMeta.GetProperty("filterType").GetString());
        Assert.Equal("avg", scoreMeta.GetProperty("aggregation").GetString());
        Assert.Equal("Avg:", scoreMeta.GetProperty("aggregationLabel").GetString());
        Assert.Equal("number", scoreMeta.GetProperty("editType").GetString());
    }

    [Fact]
    public async Task ProcessAsync_ColumnGroup_SerializesNestedColumnsHierarchy()
    {
        var grid = new TableXTagHelper
        {
            Id = "grouped-grid",
            Caption = "Directory",
            AutoInit = false,
        };

        var group = new TableXColumnGroupTagHelper
        {
            Id = "contact",
            Header = "Contact Info",
        };

        var html = await RenderGridAsync(grid, async ctx =>
        {
            var groupContext = new TagHelperContext(
                TableXColumnGroupTagHelper.TagName,
                new TagHelperAttributeList(),
                ctx.Items,
                Guid.NewGuid().ToString("N"));

            var groupOutput = new TagHelperOutput(
                TableXColumnGroupTagHelper.TagName,
                new TagHelperAttributeList(),
                async (_, _) =>
                {
                    var emailCol = new TableXColumnTagHelper { Field = "email", Header = "Email" };
                    await emailCol.ProcessAsync(groupContext, CreateEmptyOutput(TableXColumnTagHelper.TagName));

                    var phoneCol = new TableXColumnTagHelper { Field = "phone", Header = "Phone" };
                    await phoneCol.ProcessAsync(groupContext, CreateEmptyOutput(TableXColumnTagHelper.TagName));

                    return new DefaultTagHelperContent();
                });

            await group.ProcessAsync(groupContext, groupOutput);
        });

        var json = ExtractConfigJson(html);
        using var doc = JsonDocument.Parse(json);
        var cols = doc.RootElement.GetProperty("columns");
        Assert.Equal(1, cols.GetArrayLength());

        var grp = cols[0];
        Assert.Equal("contact", grp.GetProperty("id").GetString());
        Assert.Equal("Contact Info", grp.GetProperty("header").GetString());
        Assert.False(grp.TryGetProperty("accessorKey", out _));

        var children = grp.GetProperty("columns");
        Assert.Equal(2, children.GetArrayLength());
        Assert.Equal("email", children[0].GetProperty("accessorKey").GetString());
        Assert.Equal("phone", children[1].GetProperty("accessorKey").GetString());
    }

    [Fact]
    public async Task ProcessAsync_ClientSideData_SerializesRowsAndEscapesScriptClosers()
    {
        var rows = new[]
        {
            new { Id = 1, Name = "Alice </script> Johnson" },
        };

        var grid = new TableXTagHelper
        {
            Id = "client-grid",
            Caption = "Users",
            Data = rows,
            ClientSidePagination = true,
            AutoInit = false,
        };

        var html = await RenderGridAsync(grid, _ => Task.CompletedTask);
        Assert.DoesNotContain("</script> Johnson", html, StringComparison.OrdinalIgnoreCase);

        var json = ExtractConfigJson(html);
        using var doc = JsonDocument.Parse(json);
        Assert.True(doc.RootElement.GetProperty("clientSidePagination").GetBoolean());
        Assert.Equal("Alice </script> Johnson", doc.RootElement.GetProperty("data")[0].GetProperty("name").GetString());
    }

    [Fact]
    public async Task ProcessAsync_InvalidEnumAttribute_ThrowsHelpfulMessage()
    {
        var grid = new TableXTagHelper
        {
            Caption = "Users",
            ExportMode = "Pdf",
        };

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => RenderGridAsync(grid, _ => Task.CompletedTask));

        Assert.Contains("export-mode", ex.Message);
        Assert.Contains("Split", ex.Message);
    }

    private static async Task<string> RenderGridAsync(
        TableXTagHelper grid,
        Func<TagHelperContext, Task> runChildren)
    {
        var items = new Dictionary<object, object>();
        var context = new TagHelperContext(
            TableXTagHelper.TagName,
            new TagHelperAttributeList(),
            items,
            Guid.NewGuid().ToString("N"));

        var output = new TagHelperOutput(
            TableXTagHelper.TagName,
            new TagHelperAttributeList(),
            async (_, _) =>
            {
                await runChildren(context);
                return new DefaultTagHelperContent();
            });

        await grid.ProcessAsync(context, output);
        return output.PostElement.GetContent();
    }

    private static TagHelperOutput CreateEmptyOutput(string tagName) =>
        new(
            tagName,
            new TagHelperAttributeList(),
            (_, _) => Task.FromResult<TagHelperContent>(new DefaultTagHelperContent()));

    private static string ExtractConfigJson(string postHtml)
    {
        const string closeTag = "</script>";
        var start = postHtml.IndexOf('>', StringComparison.Ordinal) + 1;
        var end = postHtml.IndexOf(closeTag, start, StringComparison.Ordinal);
        return postHtml[start..end];
    }
}
