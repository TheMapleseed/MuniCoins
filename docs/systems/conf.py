# Sphinx configuration for the MuniCoins systems map (repository paths are relative to repo root).
# Build: from this directory, run:  sphinx-build -b html . _build

project = "MuniCoins systems"
copyright = "MuniCoins contributors"
author = "MuniCoins"

extensions: list[str] = []
templates_path: list[str] = []
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]

html_theme = "alabaster"
html_theme_options = {
    "description": "Where each subsystem lives in the repository",
    "fixed_sidebar": True,
}
html_title = "MuniCoins systems"

nitpicky = False
