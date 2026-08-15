# ADR 005: Git CLI over libgit2

## Context
CodexOS needs deep integration with git repositories.

## Decision
We chose to use the git CLI executable directly over the `git2` rust crate.

## Consequences
- **Pros:** Full feature set of Git, simple to invoke, standard CLI output, no C bindings required, native SSH integration works flawlessly out of the box.
- **Cons:** Requires the user to have Git installed on their system PATH. String parsing is slightly more fragile than structured data.
