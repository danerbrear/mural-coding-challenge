/**
 * Builds HATEOAS pagination links for list endpoints.
 * @param basePath - Full path to the collection (e.g. "https://api.example.com/products")
 * @param limitNum - Page size used for this request
 * @param requestNextToken - nextToken from the current request (for "self" link)
 * @param responseNextToken - nextToken to return for the next page (for "next" link); only "next" is added when present
 */
export function paginationLinks(
  basePath: string,
  limitNum: number,
  requestNextToken?: string,
  responseNextToken?: string
): Record<string, { href: string; rel: string }> {
  const limitParam = `limit=${limitNum}`;
  const selfQuery =
    requestNextToken != null && requestNextToken !== ""
      ? `${limitParam}&nextToken=${encodeURIComponent(requestNextToken)}`
      : limitParam;
  const links: Record<string, { href: string; rel: string }> = {
    self: { href: `${basePath}?${selfQuery}`, rel: "self" },
    first: { href: `${basePath}?${limitParam}`, rel: "first" },
  };
  if (responseNextToken != null && responseNextToken !== "") {
    links.next = {
      href: `${basePath}?${limitParam}&nextToken=${encodeURIComponent(responseNextToken)}`,
      rel: "next",
    };
  }
  return links;
}
