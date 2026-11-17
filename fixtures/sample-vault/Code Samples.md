---
tags: dev
created: 2025-03-01
---
# Code Samples

Inline code like `#not-a-tag` and `[[Not A Link]]` must be ignored.

```ts
// #also-not-a-tag
const link = "[[Fenced Link]]";
```

URLs with fragments are not tags: https://example.com/page#fragment and
[docs](https://example.com/docs#section).

Issue #123 and year #2025 are numbers, not tags.

Real tag: #dev/typescript. Real link: [[Welcome]].
