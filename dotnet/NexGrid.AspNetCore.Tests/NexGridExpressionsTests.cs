using System.Globalization;
using Xunit;

namespace NexGrid.AspNetCore.Tests;

public enum StudentStatus
{
    Active,
    Pending,
    Suspended,
    Alumni
}

public class NexGridExpressionsTests
{
    [Theory]
    [InlineData("123", typeof(int), 123)]
    [InlineData("45.67", typeof(double), 45.67)]
    [InlineData("true", typeof(bool), true)]
    [InlineData("false", typeof(bool), false)]
    [InlineData("True", typeof(bool?), true)]
    [InlineData("Active", typeof(StudentStatus), StudentStatus.Active)]
    [InlineData("pending", typeof(StudentStatus), StudentStatus.Pending)]
    [InlineData("2026-08-24", typeof(DateOnly), "2026-08-24")]
    [InlineData("14:30:00", typeof(TimeOnly), "14:30:00")]
    public void TryConvertFilterValue_ValidInputs_ConvertsExpectedValue(string input, Type targetType, object expected)
    {
        var success = NexGridExpressions.TryConvertFilterValue(input, targetType, out var result);

        Assert.True(success);
        if (targetType == typeof(DateOnly))
        {
            Assert.Equal(DateOnly.Parse((string)expected, CultureInfo.InvariantCulture), result);
        }
        else if (targetType == typeof(TimeOnly))
        {
            Assert.Equal(TimeOnly.Parse((string)expected, CultureInfo.InvariantCulture), result);
        }
        else
        {
            Assert.Equal(expected, result);
        }
    }

    [Theory]
    [InlineData("not-a-number", typeof(int))]
    [InlineData("not-a-bool", typeof(bool))]
    [InlineData("UnknownStatus", typeof(StudentStatus))]
    [InlineData("invalid-guid", typeof(Guid))]
    public void TryConvertFilterValue_InvalidInputs_ReturnsFalse(string input, Type targetType)
    {
        var success = NexGridExpressions.TryConvertFilterValue(input, targetType, out var result);
        Assert.False(success);
        Assert.Null(result);
    }
}
