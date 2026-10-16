# GraphQL query limits

The GraphQL endpoint applies both field-depth and complexity validation before
resolver execution. Defaults are a maximum depth of 5 (`GQL_MAX_DEPTH`) and a
maximum complexity of 1000 (`GQL_MAX_COMPLEXITY`). Complexity includes literal
`limit`/`first` list multipliers and named fragment selections. Configure these
environment variables consistently across replicas; they are not network
specific.

Queries over either configured limit are rejected with a GraphQL error and do
not execute resolvers. Queries at or below both limits keep the existing
response behavior. Clients can reduce nesting and list page sizes to address a
rejected query. This enforcement does not require a migration or change to
GraphQL schema fields.
