// MVC model binding for TableXQuery.
//
// It is attached to the type with [ModelBinder] rather than shipped as an
// IModelBinderProvider the app has to register, because the binder has nothing to
// configure: the wire format is fixed by the contract. `Get(TableXQuery query)`
// works in a controller the moment the package is referenced.
//
// Binding never fails. TableXQuery.Parse coerces rather than rejects, so the
// binder always reports success and ModelState stays clean — a malformed grid URL
// is not a validation error the user can act on.

using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace TableX.AspNetCore;

/// <summary>
/// Binds a <see cref="TableXQuery"/> action parameter from the request's query
/// string. Wired up automatically by the <c>[ModelBinder]</c> attribute on
/// <see cref="TableXQuery"/>; you never need to register it.
/// </summary>
public sealed class TableXQueryModelBinder : IModelBinder
{
    /// <summary>
    /// Parse the request's query string into a <see cref="TableXQuery"/> and mark
    /// the model bound.
    /// </summary>
    /// <param name="bindingContext">The MVC binding context.</param>
    /// <returns>A completed task; binding is synchronous and cannot fail.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="bindingContext"/> is <see langword="null"/>.</exception>
    public Task BindModelAsync(ModelBindingContext bindingContext)
    {
        ArgumentNullException.ThrowIfNull(bindingContext);

        var query = TableXQuery.Parse(bindingContext.HttpContext.Request.Query);
        bindingContext.Result = ModelBindingResult.Success(query);
        return Task.CompletedTask;
    }
}
