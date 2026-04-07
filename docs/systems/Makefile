# Minimal Makefile for Sphinx (optional; `sphinx-build -b html . _build` is enough).
SPHINXOPTS ?=
SPHINXBUILD = sphinx-build
SOURCEDIR = .
BUILDDIR = _build

.PHONY: html clean

html:
	$(SPHINXBUILD) -b html $(SOURCEDIR) $(BUILDDIR) $(SPHINXOPTS)

clean:
	rm -rf $(BUILDDIR)
