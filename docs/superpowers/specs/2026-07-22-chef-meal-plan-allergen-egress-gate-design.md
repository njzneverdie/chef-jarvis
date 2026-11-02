# Chef Meal Plan Allergen Egress Gate Design

**Date:** 2026-07-22  
**Status:** Approved approach (A), pending written-spec review

## Problem

`chef-meal-plan` validates generated recipes during the AI parsing and repair
pipeline, but its successful AI response and two broad-request fallback
responses do not pass through one shared final allergen check. A future return
path or a fallback regression could therefore serialize an ingredient from a
user's saved allergen family even when earlier validation was bypassed.

## Safety invariant

Every JSON response produced by the `chef-meal-plan` request handler must use a
single request-scoped response function. If the response contains a non-null
`plan`, every `plan.ingredients[].name` and `plan.ingredients[].usda_query`
must be free of the authenticated user's saved allergen families.

The invariant applies to:

- successful AI-generated and provider-adapted plans;
- the fallback returned when Gemini is not configured;
- the fallback returned after all generation models fail;
- any future response path that includes a plan.

Responses without a plan, including authentication, configuration,
clarification, quota, named-recipe, and generic error responses, pass through
the same function but contain no ingredients to expose.

## Architecture

The existing top-level `respond` remains a JSON/CORS serializer. Inside the
request handler, a request-scoped `safeRespond` captures a nullable validated
profile and becomes the only function used for JSON responses.

Before serialization, `safeRespond` calls a pure shared response-safety helper.
That helper:

1. Returns unchanged for bodies without a non-null `plan`.
2. Fails closed when a plan exists before a profile has been loaded.
3. Reuses the existing bilingual allergen-family matching behavior from
   `named-recipe-integrity.js`, restricted to the profile's `allergies` values.
4. Throws a deliberately non-sensitive allergen-safety error when any outgoing
   recipe content conflicts with an allergen family.

The handler's existing `try`/`catch` converts that failure into an error response
without a plan or ingredients. If quota is still reserved, the existing catch
path refunds it before responding. The gate rejects the entire recipe; it never
deletes individual ingredients because doing so would leave quantities,
substitutions, steps, and nutrition internally inconsistent.

## Data flow

1. Early request errors call `safeRespond` while its profile is null; these
   responses have no plan and are serialized normally.
2. After the profile query succeeds, the request-scoped profile is assigned.
3. Every later return, including all plan and fallback returns, calls
   `safeRespond`.
4. `safeRespond` validates any plan immediately before JSON serialization.
5. In the metered success branch, the gate runs before quota ownership is
   cleared and before success is logged. An unsafe plan therefore reaches the
   existing catch path with its quota reservation intact and is refunded.
6. An unsafe plan throws into the existing failure path and is never sent.

`OPTIONS` responses remain direct `Response` objects because they have no JSON
recipe body or ingredients.

## Testing

Tests use the pure response-safety helper with real allergen matching, not a
mock. A table covers these response categories:

- AI/provider success;
- Gemini-unconfigured fallback;
- all-models-failed fallback;
- clarification and error responses without a plan.

For each plan-producing category and every supported allergen family, an unsafe
ingredient is inserted and the helper must reject it. Safe alternatives such as
explicitly allergen-free labels remain accepted according to existing matcher
rules.

A source-contract test also verifies that the handler contains no direct
`return respond(...)` path and that all three current plan-producing branches
return through `safeRespond`. This protects future edits from bypassing the
single egress gate.

The focused test must be observed failing before production code is added, then
passing after the minimal implementation. The full unit suite and project
syntax/PWA checks must pass before completion.

## Non-goals

- Changing the allergen-family vocabulary.
- Rewriting fallback recipe selection.
- Sanitizing or partially editing unsafe recipes.
- Changing database schema, RLS, authentication, or API response success shapes.
- Deploying the Edge Function as part of this code-only change unless separately
  requested.
