namespace TableX.Example.Blazor.Models;

public sealed class Employee
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Email { get; init; }
    public required string Company { get; init; }
    public required string Status { get; init; }
    public required string Mobile { get; init; }
    public required string Department { get; init; }
    public double Score { get; init; }
}
