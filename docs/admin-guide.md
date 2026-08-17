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

You also have a **Delete** button on any request — it does not touch the project itself even if one is linked; the request is just hidden (see **Deleted Items** below) until restored, at which point the link, if there was one, is exactly as it was.

The full picture, request through project retirement — the dashed arrow is **Delete**, available from any state shown here, not just the two pictured:

<pre class="mermaid">
flowchart TD
    Submit(["Member submits a request"]) --> Pending["Pending"]
    Pending -->|"Admin reviews &amp; finalizes:<br/>priority · value area · dates"| Decision{"Approve?"}
    Pending -->|"Submitter withdraws"| Revoked["Revoked"]
    Decision -->|"No — with feedback"| Rejected["Rejected"]
    Decision -->|"Yes"| Stage{"Dates entered?"}

    Rejected -->|"Edit &amp; resubmit"| Pending
    Revoked -->|"Edit &amp; resubmit"| Pending

    Stage -->|"Neither date"| Backlog["Backlog"]
    Stage -->|"Only one, or both<br/>not started yet"| Planned["Planned"]
    Stage -->|"Both, today in range"| Active["Active"]

    Backlog -->|"Owner/Admin schedules"| Planned
    Planned -->|"Today enters range — automatic"| Active
    Backlog -->|"Owner/Admin"| Hold["Hold"]
    Planned -->|"Owner/Admin"| Hold
    Active -->|"Owner/Admin"| Hold
    Hold -->|"Resume"| Backlog
    Hold -->|"Resume"| Planned
    Hold -->|"Resume"| Active
    Active -->|"Owner/Admin marks complete"| Complete["Complete"]

    Rejected -.->|"Admin deletes — any state"| Deleted[("Deleted Items")]

    classDef startNode fill:#FFFFFF,stroke:#8B8FA3,color:#1D1F2B,stroke-width:1.5px,stroke-dasharray:3 3;
    classDef reqNode fill:#EDEAFB,stroke:#4A3F91,color:#2A2360,stroke-width:1.5px;
    classDef decisionNode fill:#F3F4F7,stroke:#565A72,color:#1D1F2B,stroke-width:1.5px;
    classDef backlogNode fill:#F0EFEA,stroke:#8B8672,color:#3F3B2E,stroke-width:1.5px;
    classDef plannedNode fill:#E1EEFA,stroke:#1D5A96,color:#123A61,stroke-width:1.5px;
    classDef activeNode fill:#E1F5EE,stroke:#0D6B4F,color:#0A4A37,stroke-width:1.5px;
    classDef holdNode fill:#FCF1DD,stroke:#B9790A,color:#7A4F06,stroke-width:1.5px;
    classDef completeNode fill:#E1F0E5,stroke:#1C8A63,color:#125B41,stroke-width:1.5px;
    classDef deletedNode fill:#FAEAEA,stroke:#B23A3A,color:#7A2626,stroke-width:1.5px;

    class Submit startNode
    class Pending,Rejected,Revoked reqNode
    class Decision,Stage decisionNode
    class Backlog backlogNode
    class Planned plannedNode
    class Active activeNode
    class Hold holdNode
    class Complete completeNode
    class Deleted deletedNode
</pre>

## Programs

A program is a named collection of projects — each project can belong to at most one program, or none. Every program has a **Program ID** (P1, P2, P3…, assigned automatically), a name, description, and business objective, plus three resource-linked roles: **Program Sponsor**, **Program Manager**, and **Business Owner**.

- **The Programs list** supports search (by name or ID) and sortable column headers, the same pattern as the project list pages.
- **Opening a program** takes you to its own full page, the same way opening a project does — not a popup. Its linked projects are grouped into sections by stage (Active, Planned, Backlog, Hold, Completed), skipping any stage with nothing in it.
- **Creating a program** is admin-only — use **New Program** on the Programs list.
- **Editing a program's name, description, and business objective** is available to a PMO Admin or that program's own **Program Manager**. Reassigning the Sponsor, Manager, or Business Owner roles themselves is admin-only, the same restriction as reassigning a project's Owner.
- **Linking projects** happens from either side: the program's own page has a search-and-add panel (plus a remove button per linked project), and New/Edit Project both have a Program picker. A Program Manager can only pull in projects they can already edit some other way (as owner, sponsor, or manager of a different program) — they can't reach into an arbitrary project owned by someone else just because they manage a program.
- **A Program Manager gets Owner-level edit rights on every project linked to their program** — general fields, team, milestones, tasks, RAID, documents — but not financials. Financial view/edit stays admin-only or gated to that specific project's own Sponsor, unchanged.
- **Deleting a program** is admin-only and just unlinks its projects — they keep existing with no program, nothing about them is deleted.

## Prioritize Backlog

A value-vs-effort view for deciding what to schedule next. Filter by category tab (or "All") — there's **one overall priority ranking** across every non-complete project, and each category tab just shows the projects in it, in that same order. Reordering within a tab only changes what you see elsewhere if the move crosses a project that shares a category with it — moving a project past others outside its own category(ies) leaves its position in those categories' tabs untouched. A project in two categories has a single rank, so it's possible for a drag in one of its tabs to shift where it lands in the other.

- The **matrix** plots projects by Value $ (estimated amount) against T-shirt size, into four quadrants (Quick Wins, Major Projects, Fill-ins, Reconsider). Click the **?** next to its title for exactly how High/Low is decided on each axis.
- The **ranked list** is the actual editing surface — drag rows to reorder. Every sized project gets a real, saved rank immediately, seeded by a value-per-effort score; dragging one flags it **Manual** so it stops moving automatically. Click the **?** next to its title for exactly how that starting score is calculated.
- **Undo** appears right after a drag and reverts just that one move (position and Manual flag both), but only the most recent one. **Reset to default** clears every Manual flag and re-sorts everyone by the automatic score — it shows a before/after preview of what would move before anything saves.
- Search filters both the matrix and the ranked list by project name — rank numbers stay tied to the project's true position even when a search narrows what's visible.
- Projects missing a value estimate or T-shirt size show up in a separate **Needs sizing** panel instead of the matrix, since they can't be meaningfully plotted yet.

## Resources

Manage the roster of **individuals** and **teams** (tabs at the top). For an individual: name, role/title, team, email (auto-links to their login account if the email matches), and tags. For a team: name, manager, and a member checklist. Add, edit, or delete from here — deleting asks for confirmation first.

A team can be assigned to a project directly (separately from its individual members each being assigned) — this matters for how the Capacity page reads team workload, below.

An individual's row also shows a **Work requests** column — a plain-text count of their open (New, Needs Info, or Accepted) work requests, with total estimated hours for any that have been given one. Teams don't get this column, since work requests are always assigned to an individual, never a team. The **Open tasks** and **Work requests** columns each flag how many are Late in a small red badge, same concept covered in the [User Guide](../user-guide/#late-items).

## Capacity

A month-by-month timeline showing how loaded each individual or team is, so you can see who's about to be slammed vs. who's freeing up. Switch between **Individuals** and **Teams** tabs — these are always shown separately, never blended together.

- Each resource is a row, colored per month by how many projects overlap that month (free / 1 / 2 / 3+), using the same color scale throughout.
- Click a row to expand it into the actual project bars for that resource, plus — for an individual — a **Work requests** section underneath listing their open work requests (title, status, requester, estimated hours, and due date), the same expand action as projects.
- A project counts toward the timeline if it's **Active or Planned with real dates**, or **Backlog with a target quarter estimate**. Projects on Hold, Completed, or Backlog with no estimate at all aren't placeable and don't count — if a resource has any of those, you'll see a small note when you expand their row rather than a silent gap.
- **Teams** show their own row for projects assigned directly to the team, plus one row per member underneath for that person's own individual load — these are intentionally kept separate rather than combined into one number, since "the team has 2 direct projects" and "one member is swamped" are different facts worth seeing independently. Teams don't have a work requests section of their own, since work requests are always assigned to an individual.
- Rows are sorted by how many projects are actually shown on the timeline (most first), then alphabetically as a tiebreaker (last name for individuals, team name for teams).
- This page is read-only — to actually change a project's schedule or target quarter, use Future Planning or the project's own Edit modal.
- Each individual row also carries a trailing **Work requests** column, separate from the month grid — it's a plain hours/count summary of that person's open work requests, not folded into the project-count coloring, since work requests measure hours rather than project overlap. Teams don't get this column.

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

## Work Requests

An admin-only oversight page listing every work request across the org, regardless of who submitted or was assigned it — searchable by title, sortable on every column, and filterable by Requester, Assigned to, and Status. Two things are only available here:

- **Reassign** — move a work request to a different individual resource. Useful if the wrong person was picked at submission, or someone's out and their open requests need to move.
- **Delete** — same soft-delete pattern as projects and requests; it disappears from every view (including the assignee's and requester's own pages) until restored from **Deleted Items**.

Unlike project requests, work requests never pass through an approval queue — there's no admin gate here to review or approve, by design. This page exists purely for visibility and cleanup, not gatekeeping. See the [User Guide](../user-guide/) for how submission, acceptance, and the full status lifecycle (New → Needs Info / Accepted / Declined / Withdrawn → Complete) work from a regular user's side.

## Manage Users

Create accounts, edit name/role (Admin or Member), reset a password, or deactivate/reactivate someone (you can't deactivate yourself). Passwords are set directly and must be shared with the person yourself — **no email is ever sent** by this app for account creation or password resets.

Each row also shows **Last active** — updated every time that person opens or reloads the app, not just when they type in a password, so it reflects real usage rather than sitting frozen at whenever their browser session happened to start ("Never" if they haven't opened the app at all yet). A history icon opens that user's **activity** — everything they've logged across every project (task/milestone/RAID changes, field edits) — filterable to the last 7, 30, or 90 days, each entry linking back to its project.

This is separate from **Resources**: an account's role lives on the `profiles` record managed here, while a person's project-staffing record lives on Resources. The two link automatically when the email addresses match — there's no manual "link account" button.

## Manage Tags

Tags are a single shared pool used across projects, resources, and requests — the same tag can be applied to any of them. Rename or delete from here; deleting strips the tag from everything currently wearing it (with a confirmation first). Note that tag colors are automatically derived from the tag's name — there's no manual color picker, and renaming a tag may change its displayed color.

## Manage Values

Manages three independent dropdown lists: **Value Area**, **Business Unit**, and **Category**. Renaming cascades everywhere that value is currently used. Deleting only removes it from the picker for *new* selections — anything already using that value keeps displaying it as-is, it just can't be newly assigned going forward.

## Deleted Items

Deleting a project, request, or work request no longer erases it — it's hidden from everyone (including other admins, everywhere it would normally show up) until someone restores it from here, in its own tab (**Projects** / **Requests** / **Work Requests**). Each row shows who deleted it and when, plus two actions:

- **View** opens a read-only summary — everything the item had (for a project: overview fields, team, milestones, tasks, RAID log, documents; for a request: its full proposal) — with a banner confirming you're looking at a deleted item and a **Restore** button right there. Nothing in this view is editable; it's a preview, not the live project/request page.
- **Restore** puts it right back where it was, fully intact — tasks, milestones, RAID items, documents, team, everything, since none of that was ever actually removed.

This only protects deletes that happen going forward — anything deleted before this existed is really gone, same as before.

## Financial data & permissions

`canViewFinancials` is currently a hard admin-only gate — there's no per-user override yet. This controls visibility of: estimated value amount, opportunity type, frequency, value confidence, value justification, cost estimate, and cost confidence — everywhere in the app, including a project's own owner if that owner isn't also an admin. Editing financials additionally requires being able to edit the project at all, but since financial *viewing* is already admin-only, editing ends up admin-only too in practice.

## View As

Lets you preview the app as a generic Member, or as a specific person (even someone with no login yet). This is a **read-only simulation** — the real session backing it is still yours, so every write is intercepted and blocked while simulating, to prevent anything from being saved under the wrong identity. Use it to sanity-check what a specific user will see, not to act on their behalf.

## Known quirks worth knowing about

- Requests still list "Approved" as a possible status in some places, but the approval flow always writes Backlog/Planned/Active instead — you won't see "Approved" persist.
- The Portfolio page's "Estimated cost" line reads from a legacy `requests.cost` column, separate from the `cost_estimate` field used everywhere else, and isn't gated by financial-view permission. Nothing in the current app writes to that legacy column anymore, so this should be dormant — but if old data still has it populated, it would show a dollar figure to non-admins. Worth a periodic spot-check.
- A "Dept" field appears in a couple of admin views but has no corresponding input anywhere in the current request forms — expect it to always be blank.
- A user's activity history on Manage Users only goes back to when per-user attribution was added to project field-change logging. Older project-level field changes were logged with just a name, not an account id, so they won't show up under that person's activity (task/milestone/RAID activity isn't affected — those were always logged with an id).
