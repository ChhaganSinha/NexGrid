namespace TableX.AspNetCore.Components;

/// <summary>
/// Primary Blazor component alias for <see cref="TableX{TItem}"/> (<c>&lt;NexGrid&gt;</c>).
/// </summary>
/// <typeparam name="TItem">The row item type.</typeparam>
public class NexGrid<TItem> : TableX<TItem>
{
}

/// <summary>
/// Primary Blazor component alias for <see cref="TableXColumn"/> (<c>&lt;NexGridColumn&gt;</c>).
/// </summary>
public class NexGridColumn : TableXColumn
{
}

/// <summary>
/// Primary Blazor component alias for <see cref="TableXColumnGroup"/> (<c>&lt;NexGridColumnGroup&gt;</c>).
/// </summary>
public class NexGridColumnGroup : TableXColumnGroup
{
}
