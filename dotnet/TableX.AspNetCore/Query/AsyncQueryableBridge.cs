// Async execution without an EF Core dependency.
//
// `ToPagedResponseAsync` has to run two database round trips, and on EF Core both
// must be genuinely asynchronous — a blocking Count() inside a request handler is
// exactly the thread-pool starvation this package should not cause. The obvious
// way to get that is a PackageReference to Microsoft.EntityFrameworkCore, which
// this package refuses: TableX.AspNetCore must stay usable over Dapper-backed
// IQueryables, LINQ to Objects, and whatever the app already has, and it must not
// pin an EF Core version onto anybody.
//
// So the async path is discovered instead of referenced:
//
//   * Materialising a page needs nothing special. EF Core's IQueryable<T> is also
//     an IAsyncEnumerable<T>, which is a BCL interface, so `await foreach` is a
//     plain type test with no reflection at all.
//   * Counting has no such interface. It goes through IAsyncQueryProvider, found
//     by full type name and cached per provider type. That interface's
//     ExecuteAsync<TResult>(Expression, CancellationToken) is what EF Core's own
//     CountAsync calls, and it has been stable across every EF Core major version.
//
// Anything that is not async-capable falls back to the synchronous path, which is
// the correct answer for LINQ to Objects and for unit tests.

using System.Collections.Concurrent;
using System.Linq.Expressions;
using System.Reflection;
using System.Runtime.ExceptionServices;

namespace TableX.AspNetCore;

internal static class AsyncQueryableBridge
{
    private const string AsyncQueryProviderTypeName = "Microsoft.EntityFrameworkCore.Query.IAsyncQueryProvider";

    private static readonly ConcurrentDictionary<Type, MethodInfo?> ExecuteAsyncByProvider = new();

    /// <summary>Count the rows, asynchronously when the provider supports it.</summary>
    internal static async Task<int> CountAsync<T>(IQueryable<T> source, CancellationToken cancellationToken)
    {
        var executeAsync = ExecuteAsyncByProvider.GetOrAdd(source.Provider.GetType(), FindExecuteAsync);
        if (executeAsync is null)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return source.Count();
        }

        var countCall = Expression.Call(
            typeof(Queryable),
            nameof(Queryable.Count),
            [typeof(T)],
            source.Expression);

        Task<int> pending;
        try
        {
            pending = (Task<int>?)executeAsync
                .MakeGenericMethod(typeof(Task<int>))
                .Invoke(source.Provider, [countCall, cancellationToken])
                ?? throw new InvalidOperationException("The async query provider returned no result for Count.");
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            // Surface the provider's own exception (and its stack) rather than the
            // reflection wrapper the caller can do nothing with.
            ExceptionDispatchInfo.Capture(ex.InnerException).Throw();
            throw;
        }

        return await pending.ConfigureAwait(false);
    }

    /// <summary>Materialise the query, asynchronously when the provider supports it.</summary>
    internal static async Task<List<T>> ToListAsync<T>(IQueryable<T> source, CancellationToken cancellationToken)
    {
        if (source is IAsyncEnumerable<T> asyncSource)
        {
            var rows = new List<T>();
            await foreach (var row in asyncSource.WithCancellation(cancellationToken).ConfigureAwait(false))
            {
                rows.Add(row);
            }

            return rows;
        }

        cancellationToken.ThrowIfCancellationRequested();
        return source.ToList();
    }

    private static MethodInfo? FindExecuteAsync(Type providerType)
    {
        var contract = Array.Find(
            providerType.GetInterfaces(),
            candidate => string.Equals(candidate.FullName, AsyncQueryProviderTypeName, StringComparison.Ordinal));

        if (contract is null)
        {
            return null;
        }

        foreach (var method in contract.GetMethods())
        {
            if (!method.IsGenericMethodDefinition ||
                !string.Equals(method.Name, "ExecuteAsync", StringComparison.Ordinal))
            {
                continue;
            }

            var parameters = method.GetParameters();
            if (parameters.Length == 2 &&
                parameters[0].ParameterType == typeof(Expression) &&
                parameters[1].ParameterType == typeof(CancellationToken))
            {
                return method;
            }
        }

        return null;
    }
}
