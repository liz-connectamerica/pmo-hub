---
layout: page
title: Admin Guide
permalink: /admin-guide/
---

This guide covers the tools only available to the **PMO Admin** role. It assumes you've read the **[User Guide](../user-guide/)** — everything there still applies; this is what's added on top.

## Requests (Intake)

The **Requests** page (with a live count badge for pending items) is where new project proposals get reviewed. Tabs let you filter by **All, Pending, Backlog, Planned, Active, Rejected, Revoked**.

Opening a pending request shows the full proposal — submitter, business unit, sponsor, description, value type, and (admin-only) the dollar estimate, value justification, and cost estimate with confidence ratings. A **"Finalize before approving"** section lets you set or override:

- Priority, Value Area, Business Unit, T-shirt size, Categories
- Either real Start/Target-End dates, **or**, if the timeline isn't known yet, an optional target quarter range (this just keeps it visible on the Future Planning timeline while it sits in Backlog)
- Free-text feedback to the submitter

Then **Approve** or **Reject**.

**On Approve**, the project's landing stage is computed automatically from the dates you entered:

| Dates entered | Landing stage |
|---|---|
| Neither start nor end | Backlog |
| Only one of start/end | Planned |
| Both, and today falls inside the range | Active |
| Both, but the range hasn't started yet | Planned |

A full project record is created immediately — not a placeholder — carrying over the description, proposed team, tags, and any financial estimates. The request itself updates to **Backlog**, **Planned**, or **Active** to match. There is no lasting "Approved" status — don't expect to see that word stick around; it's replaced right away by wherever the project landed.

**On Reject**, the request becomes **Rejected** with your feedback attached and a rejected-date stamp (this is what powers the Dashboard's rejected-proposals age filter, which everyone can see).

You also have a **Delete** button on any request — this only unlinks it from its project if one exists; it does not delete the project itself.

## Prioritize Backlog

A value-vs-effort view for deciding what to schedule next. Filter by category tab (or "All") — there's **one overall priority ranking** across every non-complete project, and each category tab just shows the projects in it, in that same order. Reordering within a tab only changes what you see elsewhere if the move crosses a project that shares a category with it — moving a project past others outside its own category(ies) leaves its position in those categories' tabs untouched. A project in two categories has a single rank, so it's possible for a drag in one of its tabs to shift where it lands in the other.

- The **matrix** plots projects by Value $ (estimated amount) against T-shirt size, into four quadrants (Quick Wins, Major Projects, Fill-ins, Reconsider).
- The **ranked list** is the actual editing surface — drag rows to reorder. New projects without a saved rank yet are seeded by a value-per-effort score, then you can drag them anywhere.
- Projects missing a value estimate or T-shirt size show up in a separate **Needs sizing** panel instead of the matrix, since they can't be meaningfully plotted yet.

## Resources

Manage the roster of **individuals** and **teams** (tabs at the top). For an individual: name, role/title, team, email (auto-links to their login account if the email matches), and tags. For a team: name, manager, and a member checklist. Add, edit, or delete from here — deleting asks for confirmation first.

A team can be assigned to a project directly (separately from its individual members each being assigned) — this matters for how the Capacity page reads team workload, below.

## Capacity

A month-by-month timeline showing how loaded each individual or team is, so you can see who's about to be slammed vs. who's freeing up. Switch between **Individuals** and **Teams** tabs — these are always shown separately, never blended together.

- Each resource is a row, colored per month by how many projects overlap that month (free / 1 / 2 / 3+), using the same color scale throughout.
- Click a row to expand it into the actual project bars for that resource.
- A project counts toward the timeline if it's **Active or Planned with real dates**, or **Backlog with a target quarter estimate**. Projects on Hold, Completed, or Backlog with no estimate at all aren't placeable and don't count — if a resource has any of those, you'll see a small note when you expand their row rather than a silent gap.
- **Teams** show their own row for projects assigned directly to the team, plus one row per member underneath for that person's own individual load — these are intentionally kept separate rather than combined into one number, since "the team has 2 direct projects" and "one member is swamped" are different facts worth seeing independently.
- Rows are sorted by how many projects are actually shown on the timeline (most first), then alphabetically as a tiebreaker (last name for individuals, team name for teams).
- This page is read-only — to actually change a project's schedule or target quarter, use Future Planning or the project's own Edit modal.

## Future Planning

Similar timeline to Roadmap, but scoped to backlog projects with only a target-quarter estimate, plus active/planned projects with real dates, all on one quarter-by-quarter view. From here you can:

- Click the calendar icon on an estimated project to **change its target quarter** (a simple dropdown, not drag-and-drop)
- **Schedule now** to convert an estimate into real start/end dates
- See two callout lists: **Needs an estimate** (backlog projects with no target quarter at all) and **Missing a schedule** (active/planned projects with no start/end date — usually a sign of a bad import)

## All Projects

A single admin-only table of every project regardless of stage, with the full set of filters (category, business unit, stage, status, phase, priority, value area, sponsor, owner). Two things live here that don't exist elsewhere:

- **New project** — create a project directly, bypassing the request/approval workflow entirely (useful for adding already-in-flight work).
- **Bulk edit** — select multiple rows and set one field across all of them at once: Sponsor, Owner, Business Unit, Value Area, Priority, Status, Phase, T-shirt Size, Health, Delivery Methodology, Opportunity Type, Opportunity Type Confidence, or Cost Estimate Confidence.

## Import Projects

Download the template, fill it in, and upload it. Expected columns: Project Name (required), Sponsor, Owner Email, Business Unit, Stage, Status, Phase, Priority, Category (comma-separated), Value Area, Start Date, Target End Date, Progress %, Description, Current Blockers, Tags (comma-separated — new tags are created automatically), Target Quarter, Target Year.

Every row is validated before you commit anything — you'll see a green check or a red alert with a specific error message per row (bad stage/priority/category values, unparseable dates, or a target quarter on a non-Backlog row). Only valid rows get imported; fix errors in the spreadsheet and re-upload rather than editing inline.

**Important:** there's no duplicate detection. Every valid row is always inserted as a new project — re-uploading a template you've already imported will create duplicates for every row that was already brought in. Only include genuinely new rows in each upload.

## Export Projects

One click downloads every project's scalar fields (not tasks, milestones, RAID, documents, or team) as an Excel file — status, dates, financials, and a single `Priority Rank` column reflecting its position in the one overall Prioritize Backlog ranking.

## Manage Users

Create accounts, edit name/role (Admin or Member), reset a password, or deactivate/reactivate someone (you can't deactivate yourself). Passwords are set directly and must be shared with the person yourself — **no email is ever sent** by this app for account creation or password resets.

This is separate from **Resources**: an account's role lives on the `profiles` record managed here, while a person's project-staffing record lives on Resources. The two link automatically when the email addresses match — there's no manual "link account" button.

## Manage Tags

Tags are a single shared pool used across projects, resources, and requests — the same tag can be applied to any of them. Rename or delete from here; deleting strips the tag from everything currently wearing it (with a confirmation first). Note that tag colors are automatically derived from the tag's name — there's no manual color picker, and renaming a tag may change its displayed color.

## Manage Values

Manages three independent dropdown lists: **Value Area**, **Business Unit**, and **Category**. Renaming cascades everywhere that value is currently used. Deleting only removes it from the picker for *new* selections — anything already using that value keeps displaying it as-is, it just can't be newly assigned going forward.

## Financial data & permissions

`canViewFinancials` is currently a hard admin-only gate — there's no per-user override yet. This controls visibility of: estimated value amount, opportunity type, frequency, value confidence, value justification, cost estimate, and cost confidence — everywhere in the app, including a project's own owner if that owner isn't also an admin. Editing financials additionally requires being able to edit the project at all, but since financial *viewing* is already admin-only, editing ends up admin-only too in practice.

## View As

Lets you preview the app as a generic Member, or as a specific person (even someone with no login yet). This is a **read-only simulation** — the real session backing it is still yours, so every write is intercepted and blocked while simulating, to prevent anything from being saved under the wrong identity. Use it to sanity-check what a specific user will see, not to act on their behalf.

## Known quirks worth knowing about

- Requests still list "Approved" as a possible status in some places, but the approval flow always writes Backlog/Planned/Active instead — you won't see "Approved" persist.
- The Portfolio page's "Estimated cost" line reads from a legacy `requests.cost` column, separate from the `cost_estimate` field used everywhere else, and isn't gated by financial-view permission. Nothing in the current app writes to that legacy column anymore, so this should be dormant — but if old data still has it populated, it would show a dollar figure to non-admins. Worth a periodic spot-check.
- A "Dept" field appears in a couple of admin views but has no corresponding input anywhere in the current request forms — expect it to always be blank.
