# Release sequence

All public `@roost2d/*` packages share one version and release gate.

1. Run the CI and release verification on the candidate commit.
2. Verify the root/package READMEs, quick start, Chikn integration guide, `AGENTS.md`, and `llms.txt` describe the exact candidate APIs and package versions.
3. Publish the lockstep engine package set as a prerelease such as `0.1.0-rc.0` to npm `next` using trusted publishing.
4. Publish the companion asset runtime with its matching release-candidate version to `next` and run its isolated cross-repository consumer check.
5. When the candidate is accepted, make the version-only stable commit (for example `0.1.0`) and publish it to `latest`.

The Pages workflow is manual and contains only documentation plus the small manifest-input showcase. It never ships the full asset corpus.
