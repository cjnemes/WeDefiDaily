# Project Management Guidelines

To keep implementation aligned with the roadmap and maintain high signal in GitHub, use the following practices for issues and pull requests.

## Issues
- **Use the Roadmap Deliverable form** – every roadmap item should be opened via the `Roadmap Deliverable` issue template (`.github/ISSUE_TEMPLATE/roadmap-task.yml`). The form captures background, scope, implementation plan, validation strategy, docs/runbooks, and rollout notes so any contributor can pick up the work.
- **Label by phase & workstream** – the template prompts for phase selection and affected workstreams; keep those accurate so the board can be filtered by roadmap slice.
- **Keep the acceptance checklist live** – update the checklist as progress is made (e.g., mark tests/docs once complete) and link evidence in the "Attachments" section.
- **Cross-link dependencies & follow-ups** – record blocking issues/PRs in the dedicated field; open follow-up roadmap tickets when new scope emerges.
- **Share milestones** – drop comments when major steps land (schema pushed, job runs, UI screenshot, etc.) so reviewers have context before the PR arrives.

## Pull Requests
- **Branch naming** – continue using `phase-<roadmap-id>/<short-description>` (e.g., `phase-2c/gammaswap-fetcher`) so context is obvious.
- **Mandatory PR template** – `.github/PULL_REQUEST_TEMPLATE.md` enumerates linked issues, validation commands, rollout steps, documentation updates, and risk notes. Fill out each section candidly; unchecked boxes must include an explanation.
- **Evidence required** – include logs/output from `npm run sync:...`, `npm run process:alerts`, screenshots of UI states, or database queries as appropriate. Attachments should also be pasted back into the originating issue.
- **Manage scope** – aim for <400 LOC per PR. If work spans backend + frontend + runbooks, split into staged PRs referencing the same issue.
- **Post-merge hygiene** – close the issue via `Fixes #123`, update `docs/roadmap-issue-tracker.md`, and note follow-up tasks in the issue before closing.

## Triaging & Releases
- Run a weekly review of open issues against `docs/roadmap.md` milestones.
- Maintain a "Next Up" column referencing the current phase to avoid overcommitting.
- Cut a release PR (or tag) after each roadmap phase, summarizing shipped endpoints/jobs and linking issues that were closed.

## Issue Hygiene
- Close or archive issues as soon as roadmap items ship; drop a closing comment summarizing evidence (logs/screenshots) and linking the merged PR.
- Re-label lingering issues each weekly review: move blocked work into backlog, clear stale assignees, and refresh the checklist status.
- Before opening new work, search for duplicates/outdated tickets and close or consolidate them—`blank_issues_enabled` is off, so all new tickets must use templates.
- Keep `docs/roadmap-issue-tracker.md` in sync with GitHub issue numbers whenever issues open/close or phases change.
