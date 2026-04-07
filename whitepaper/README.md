# Whitepaper (LaTeX)

The **main whitepaper source** is **`municoins-whitepaper.tex` at the repository root** (not inside this folder).

## Overleaf

1. Create a new **Blank Project** and **upload** `municoins-whitepaper.tex` from the repo root (or upload a ZIP of the whole repository and open that file).
2. Set the **main document** to `municoins-whitepaper.tex` (**Menu → Main document**).
3. Compiler: **pdfLaTeX** (default) works with this file. If you use fontspec tricks, switch to **XeLaTeX**—not required here.

## Packages

The file uses standard Overleaf TeX Live packages: `amsmath`, `tikz`, `pgfplots`, `hyperref`, `cleveref`, `booktabs`, `microtype`. No shell escape or `--enable-write18` is needed.

## Figures

Graphics are **TikZ / pgfplots** embedded in the `.tex` file—no external SVG/PNG required. You can add `\\includegraphics` for logos by uploading images to Overleaf and using `\\graphicspath{{./images/}}`.

## Legacy

The older `token-valuation-algorithm.tex` (repo root) remains as a historical algorithm-only extract; **this whitepaper supersedes** it as the narrative document for investors and integrators.

## Implementation sync

`municoins-whitepaper.tex` is updated periodically so the **architecture / trust-boundary** narrative matches the repo (Deno services, Rust sidecar + network policy, WASM UIs). **On-chain economics and mathematics** (bifurcated capital, WAD ledger, Intersect fusion) are **normative** in the whitepaper; they do not change when only off-chain tooling changes, unless `contracts/` and this document are revised together.

## Series names

- **Series A** — **A**ccumulation (emphasis on participating in global returns while held).
- **Series T** — **T**reasury (treasury-bill–style framing, horizons and claim/reissue windows).

Both are documented in the Introduction of `municoins-whitepaper.tex`; the reference ledger may still use one contract and one global index until a future deployment partitions series on-chain.
