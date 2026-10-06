# Local archive developer instructions

This subproject is the user-requested Node.js local archive service. It is separate from the upstream Manifest V3 extension.
Keep Markdown images in images/ using portable relative paths; keep the title-based HTML self-contained and retain two lossless PNG reading profiles.
Preserve original image bytes, article extraction semantics, actual-scroll stitching, overlap validation, and local-only service binding.
Version display/tag uses releaseVersion; package.version must remain valid npm SemVer.
Run the relevant local tests, and `pnpm build` if SingleFile bundle inputs change.
Never commit data/, archives/, logs/, secrets, or real article content. Keep upstream and dependency notices.
