================================================================================
MuniCoins systems
================================================================================

This section is a **map of subsystems**: what each part does and **which paths in the repository** implement it. Paths are written from the **repository root** (the directory that contains ``contracts/``, ``src/``, ``sidecar/``, and so on).

For the economic model and mathematics, see ``municoins-whitepaper.tex`` at the repository root. For Markdown security and deployment notes, see ``docs/security/`` and ``docs/deployment/``.

.. toctree::
   :maxdepth: 2

   on-chain
   intersect
   token-node
   issuance
   sidecar
   ui-viewers
   security-ops
   whitepaper-math

Building this documentation
---------------------------

Requires Python and `Sphinx <https://www.sphinx-doc.org/>`_ (``pip install sphinx``). From **this** directory (``docs/systems/``):

.. code-block:: text

   sphinx-build -b html . _build

Open ``_build/html/index.html`` in a browser. Alternatively, ``make html`` if you use the included ``Makefile``.

When reading paths below, open the same paths in your checkout or forge/Git hosting UI; Sphinx does not embed the Solidity or TypeScript sources by default.
