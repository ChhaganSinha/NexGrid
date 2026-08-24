// Expression-tree plumbing shared by the options builder and the IQueryable
// extensions.
//
// Two decisions here are worth the explanation:
//
// 1. Selectors are stored UNWRAPPED. `Expression<Func<T, object>>` forces the
//    compiler to wrap a value-typed member in a Convert node — `s => (object)s.Age`
//    — and ordering by `object` is not something a database provider can
//    translate. Stripping the Convert at registration time recovers the real
//    member type, so Queryable.OrderBy is closed over `int` and EF Core emits
//    `ORDER BY [Age]`.
//
// 2. Runtime values are boxed, not baked in. Expression.Constant(value) makes the
//    value a literal in the generated SQL, which defeats query-plan caching and
//    produces a distinct plan per search term. Reading the value off a field of a
//    small box object reproduces exactly the shape a C# closure has, which every
//    provider already knows to lift into a parameter.

using System.Linq.Expressions;
using System.Reflection;
using System.Globalization;
using System.Diagnostics.CodeAnalysis;

namespace NexGrid.AspNetCore;

internal static class NexGridExpressions
{
    internal static readonly MethodInfo StringContains =
        typeof(string).GetMethod(nameof(string.Contains), [typeof(string)])
        ?? throw new InvalidOperationException("string.Contains(string) is missing from the runtime.");

    /// <summary>Strip the boxing Convert the compiler adds for <c>Func&lt;T, object&gt;</c>.</summary>
    internal static Expression Unwrap(Expression body)
    {
        while (body is UnaryExpression { NodeType: ExpressionType.Convert or ExpressionType.ConvertChecked } unary &&
               unary.Type == typeof(object))
        {
            body = unary.Operand;
        }

        return body;
    }

    /// <summary>
    /// Re-type a <c>Func&lt;T, object&gt;</c> selector to its real member type so
    /// <see cref="Queryable"/> can close over it.
    /// </summary>
    internal static LambdaExpression Retype<T>(Expression<Func<T, object?>> selector)
    {
        var body = Unwrap(selector.Body);
        return Expression.Lambda(body, selector.Parameters);
    }

    /// <summary>
    /// The name of the member a selector reads, used as the default allowlist key.
    /// <c>s =&gt; s.Profile.City</c> yields <c>City</c>, matching the flat column
    /// id the grid sends.
    /// </summary>
    internal static bool TryGetMemberName(Expression body, [NotNullWhen(true)] out string? name)
    {
        if (Unwrap(body) is MemberExpression member)
        {
            name = member.Member.Name;
            return true;
        }

        name = null;
        return false;
    }

    /// <summary>Rewrite <paramref name="body"/> so it reads from <paramref name="target"/>.</summary>
    internal static Expression Rebind(Expression body, ParameterExpression source, ParameterExpression target) =>
        new ParameterReplacer(source, target).Visit(body);

    /// <summary>
    /// Lift a runtime value into the tree as a provider-parameterizable member
    /// access rather than a constant.
    /// </summary>
    internal static Expression Parameterize(object? value, Type type)
    {
        var boxType = typeof(ValueBox<>).MakeGenericType(type);
        var box = Activator.CreateInstance(boxType, value)
            ?? throw new InvalidOperationException($"Could not box a value of type '{type}'.");
        return Expression.Field(Expression.Constant(box, boxType), nameof(ValueBox<object>.Value));
    }

    /// <summary>
    /// Convert a raw <c>filter[field]=value</c> string to the member's type.
    /// A value that will not convert is a client mistake, so the caller drops the
    /// filter instead of failing the request.
    /// </summary>
    internal static bool TryConvertFilterValue(string raw, Type targetType, out object? value)
    {
        value = null;
        var type = Nullable.GetUnderlyingType(targetType) ?? targetType;

        if (type == typeof(string))
        {
            value = raw;
            return true;
        }

        if (type.IsEnum)
        {
            if (Enum.TryParse(type, raw, ignoreCase: true, out var parsedEnum))
            {
                value = parsedEnum;
                return true;
            }

            return false;
        }

        if (type == typeof(bool))
        {
            if (bool.TryParse(raw, out var parsedBool))
            {
                value = parsedBool;
                return true;
            }

            return false;
        }

        if (type == typeof(Guid))
        {
            if (Guid.TryParse(raw, out var parsedGuid))
            {
                value = parsedGuid;
                return true;
            }

            return false;
        }

        if (type == typeof(DateTime))
        {
            if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsedDate))
            {
                value = parsedDate;
                return true;
            }

            return false;
        }

        if (type == typeof(DateTimeOffset))
        {
            if (DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsedOffset))
            {
                value = parsedOffset;
                return true;
            }

            return false;
        }

        if (type == typeof(DateOnly))
        {
            if (DateOnly.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDay))
            {
                value = parsedDay;
                return true;
            }

            return false;
        }

        if (type == typeof(TimeOnly))
        {
            if (TimeOnly.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedTime))
            {
                value = parsedTime;
                return true;
            }

            return false;
        }

        if (typeof(IConvertible).IsAssignableFrom(type))
        {
            try
            {
                value = Convert.ChangeType(raw, type, CultureInfo.InvariantCulture);
                return true;
            }
            catch (Exception ex) when (ex is FormatException or InvalidCastException or OverflowException)
            {
                return false;
            }
        }

        return false;
    }

    /// <summary>Holds a value so the tree can read it as a field access, the way a closure does.</summary>
    private sealed class ValueBox<TValue>
    {
        public readonly TValue Value;

        public ValueBox(TValue value) => Value = value;
    }

    private sealed class ParameterReplacer : ExpressionVisitor
    {
        private readonly ParameterExpression _source;
        private readonly ParameterExpression _target;

        internal ParameterReplacer(ParameterExpression source, ParameterExpression target)
        {
            _source = source;
            _target = target;
        }

        protected override Expression VisitParameter(ParameterExpression node) =>
            ReferenceEquals(node, _source) ? _target : base.VisitParameter(node);
    }
}
