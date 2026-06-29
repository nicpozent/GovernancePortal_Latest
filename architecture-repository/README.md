# Birgma — Architecture Repository (ABB / SBB)

A TOGAF-style **Architecture Repository**: the reusable, technology-neutral
**Architecture Building Blocks (ABBs)** derived from the Governance Portal, each
paired with the concrete **Solution Building Block (SBB)** that realizes it here.

## Why this exists
An **ABB** is a capability defined *independently of any product* — its function,
interfaces, dependencies and standards. An **SBB** is the concrete realization
(the actual product/code). Separating them lets the enterprise **reuse the
capability and its requirements** across solutions while swapping the realization.
See [`../docs/ARCHITECTURE-BUILDING-BLOCKS.md`](../docs/ARCHITECTURE-BUILDING-BLOCKS.md)
for the full derivation, dependency map and maturity assessment.

## Structure
One directory per ABB, grouped by TOGAF domain. Each ABB directory contains the
neutral capability definition and a nested `sbb/` directory with its realization:

```
architecture-repository/
├── CATALOG.md                      # index of every ABB → SBB
├── business/     | data/ | application/ | technology/
│   └── <ID>-<abb-name>/
│       ├── ABB.md                  # the Architecture Building Block (neutral)
│       └── sbb/
│           └── SBB.md              # the Solution Building Block (this project)
└── tools/generate.mjs              # regenerates the tree from one manifest
```

Domains: **Business** (B1–B8), **Data** (D1–D7), **Application** (A1–A11),
**Technology** (T1–T8) — 34 building blocks. Start at [`CATALOG.md`](CATALOG.md).

## The reusable core
The spine is **T1 Identity Provider → A1 Token Validation → A2 Policy Decision
Point → business capabilities**, backed by **D3/D4 Immutable Ledgers**. Those, plus
**A5 Directory Sync** and **A7 Notification**, are the blocks most worth promoting
into shared enterprise services; the Technology-domain ABBs (T1/T6/T7/T8) are
enterprise-shared services this solution *consumes*.

## Regenerating
The tree is generated from a single manifest so ABB/SBB content stays consistent:

```
node tools/generate.mjs        # run from this directory's parent (repo root)
```

Edit the `CATALOG` array in `tools/generate.mjs` and re-run to update.

## Promoting this to its own repository
This lives inside the application repo today for convenience. To split it into a
standalone Architecture Repository while keeping history:

```
git subtree split --prefix=architecture-repository -b architecture-repo
# then push that branch to a new remote, or:
git clone <new-empty-remote> arch && cd arch && \
  git pull <this-repo> architecture-repo
```

(Or simply copy the `architecture-repository/` directory into a fresh repo and
`git init`.) The structure is self-contained and has no build dependency on the
application code.
