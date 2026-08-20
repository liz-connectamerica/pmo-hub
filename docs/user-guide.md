---
layout: page
title: User Guide
permalink: /user-guide/
---

This guide covers what any PMO Hub user can see and do. If you're a PMO Admin, there's a separate **[Admin Guide](../admin-guide/)** covering the additional tools available to that role.

## Getting around

The sidebar is organized into a few sections:

- **Overview** — Dashboard, Roadmap, Portfolio
- **Projects** — Active, Planned, Backlog, Hold, Completed
- **My Requests** — Submit a Request, My Requests
- **My Work** — My Projects, My Tasks, My Work Requests (this section only appears once you have any connection at all to a project — owner, sponsor, team member, or task assignee — or you've been sent a work request, at any stage)

The bar at the top of the page shows the current page's title and any page-specific action buttons (like "New request").

## Dashboard

The Dashboard opens with four summary tiles — Active projects, On track, At risk, and a fourth tile that's either "Pending requests" (admins) or "In backlog" (everyone else).

Below that is an **Active projects** table. This is portfolio-wide, not just your own projects — you can search by name, sort any column, and filter by Status or Phase, plus a tag filter above the table. A project's tags show as chips under its name, if it has any. Click **View** on any row to open that project.

At the bottom, everyone sees a **Rejected proposals** list — every rejected request across the whole org, not just yours, with a date-range filter (last 30/90 days, last year, all time). This is intentionally visible to everyone, not just the person who submitted it.

## Roadmap

A month-by-month timeline (Gantt-style) of active and planned projects, grouped by category. You can:

- Switch the date window between **Next 12 months**, **Last 12 months**, or a **specific year**
- Filter by category tab or by tag
- Click the eye icon on any row to jump to that project

Below the timeline is an **Upcoming milestones** list, pulling undone milestones from active projects, with its own search and sort.

Roadmap is read-only — you can change what you're looking at, but nothing here is editable.

## Portfolio

A card-based view of every project that isn't yet completed (active, planned, backlog, or on hold), grouped into sections by Value Area. Each card shows a stage pill, description, progress, owner, and target end date (plus a hold reason, if applicable). Click a card to open the project. Like Roadmap, this is a browsing view — there's no inline editing here.

## Programs

A program groups a set of related projects together, with its own ID (P1, P2…), name, description, business objective, and three named roles: Program Sponsor, Program Manager, and Business Owner. Anyone can browse the Programs list (searchable, sortable columns) and open a program's own page — its linked projects show up grouped by stage. Editing a program (or the projects linked to it) is limited to a PMO Admin or that program's own Program Manager — see the Admin Guide's Programs section for exactly what that covers.

## Projects: Active, Planned, Backlog, Hold, Completed

These five list pages cover a project's lifecycle:

- **Active** — currently underway (today falls within its start/end dates)
- **Planned** — scheduled with real dates, but hasn't started yet
- **Backlog** — approved but not yet scheduled with real dates (it may have a rough target quarter instead — see the Admin Guide's Future Planning section)
- **Hold** — paused, with a hold reason
- **Completed** — finished

Each page supports search, category tabs, sorting, and column filters. The action buttons available to you on a given row depend on your relationship to that project — see [Permissions at a glance](#permissions-at-a-glance) below.

### Project detail page

Opening a project gives you tabs across the top: **Overview, Team, Milestones, Plan, To-Do, RAID log, Documentation, Metadata,** and **Change Log**.

- **Overview** — stage, status, phase, priority, progress, dates, description, sponsor, owner, tags, dependencies, program, and a mini milestone timeline. Everyone can see this; only the project's **owner** or an admin can edit it or change its stage (put on hold, resume, mark complete). The **Program** field sits next to Depends on — Add/Change program opens a search-and-pick list, same pattern as adding a dependency; a project can only belong to one program at a time.
- **Team** — who's assigned. Only the owner or an admin can add or remove people.
- **Milestones** — anyone can view the list and a milestone's history. Adding, editing, completing, or deleting a milestone is owner/admin-only.
- **Plan** (formerly "Tasks") — anyone can browse, search, filter, and expand a task to see its description, checklist, comments, and history. A task has a title, an optional longer description (its own expandable row, not shown inline), an assignee, a status (To Do, In Progress, On Hold, or Done), start/end dates or a working-day duration, an optional dependency on another task, and tags. A new task starts **Unassigned** by default — assigning someone opens a search-and-pick list of people and teams (with an explicit "Unassigned" option), same pattern as picking a program. Tasks can be nested into a hierarchy — a task can be dragged to reorder it among its siblings, or **Promote**/**Demote** (in the **⋮** menu) indents it under the one above it or moves it back out, the same way Microsoft Planner/Project handle sub-tasks; a summary task (one with subtasks) takes its Start/End automatically from the earliest/latest dates among its children, and those fields lock once it has children. A task can instead depend on another task in the same project — set a working-day **Duration** and pick a predecessor, and its Start/End auto-calculate as the next working day after that predecessor ends. Each task shows a sequential **ID** based on its position in that outline, and a parent task can be collapsed to hide its subtasks. (Dragging, Promote, and Demote are only available when no search or filter is active, since they act on the task's true position — searching or filtering shows a flat, unindented list instead, and dragging a task onto one at a different level is rejected — reorder within the same level, or use Promote/Demote to change levels.) The **⋮** menu also has **Add task before** / **Add task after** (inserts a new sibling task right next to this one) alongside Edit and Delete. Deleting a task with subtasks deletes the whole subtree. The **collapsible Timeline** above the task list mirrors that same list exactly — same order, same indentation, same expand/collapse state, so a drag, a promote/demote, or collapsing a parent shows up in the timeline too. A task with dates falling in the current window gets a bar; one with dates outside the window shows "Outside this range," and one with no dates at all shows "No dates set" — either way its row still appears so the hierarchy stays intact. Default is a 1-month window starting today, with 1/2/3-month and custom-range options. A **Set baseline** button (owner/admin-only) snapshots every task's current dates — past baselines are kept, never overwritten, and the timeline's **Compare to baseline** dropdown overlays a saved baseline as a dashed ghost bar against the live bar to show plan-vs-actual drift. **Anyone can post a comment on a task**, regardless of whether they own the project. A circle to the left of a task's title is the completion toggle — if the task is assigned to you, clicking it (with an optional closing comment) marks it done even if you're not the project owner, and clicking a completed task's checkmark reopens it. You can also check off items on that task's **checklist** even though you can't add or remove checklist items yourself. Creating, editing, or deleting a task itself — including adding/removing checklist items, tags, and promoting/demoting — is owner/admin-only.
- **To-Do** — a lightweight list for action items, follow-ups, access requests, reminders, and other work that doesn't belong on the project plan. A to-do has just a title, an optional description, an individual assignee, a due date, and an **Open/Done** status — no hierarchy, scheduling, or checklist. Anyone can browse, search, filter, comment, and expand a to-do's history; creating, editing, or deleting one is owner/admin-only, but the assignee can always mark their own to-do done (or reopen it) themselves. Every to-do you're assigned also shows up in your **My Tasks** sidebar page, under its own To-Do tab.
- **RAID log** (Risks, Assumptions, Issues, Dependencies) — everyone can view and expand history, but adding or editing an item is owner/admin-only. Unlike Tasks, there's no exception here for someone the item might concern — if you're not the owner, you can't log a risk yourself; you'd need to ask the owner or an admin to add it.
- **Documentation** — everyone can browse folders and open documents. Adding, moving, or deleting a document is owner/admin-only.
- **Metadata** — project ID, value area, categories, business unit, delivery methodology, T-shirt size, and the originating request if there is one. A **Financial detail** section (estimated value, cost estimate, confidence ratings) only appears if you have financial-view permission — today, that's admins only, so most users won't see dollar figures anywhere in the app, even on a project they own.
- **Change Log** — a read-only audit trail of who changed what, when. Financial changes are deliberately excluded from this log to keep dollar figures from leaking to anyone without financial-view permission.

One thing worth knowing: only an admin can reassign a project's **Owner**, and only an admin can delete a project — both of those are unavailable even to the current owner.

## Submitting a request

**Submit a Request** covers two different kinds of ask, as two tabs on the same page — each tab explains what it's for right at the top:

- **Project Request** — a full-scale project with its own timeline, milestones, team, and budget. Goes through PMO review before it's approved and scheduled. You'll fill in:
  - Project title, business unit, and a description of the problem or opportunity (all required)
  - An optional sponsor name
  - A description of the expected value — for most users this is a simple free-text box ("what's the expected value?"); if you have financial-view permission, you'll instead get structured fields for a dollar estimate, frequency, and confidence rating
  - Tags, and a proposed team (who you think should work on it)

  There's no category picker on this form — categories get set later, when a PMO admin reviews and approves the request. After you submit, it's **Pending** until reviewed. If approved, it becomes a real project — status changes to **Backlog**, **Planned**, or **Active** to match wherever the project landed (you generally won't see a literal "Approved" status). If rejected, you'll see optional feedback from the reviewer.

- **Work Request** — a smaller ask for someone's time, not a full project. No PMO review needed. Fill in a title, description, an optional **requested completion date** (when you'd ideally like it done by), and who it's for (search and pick an individual resource — work requests are always assigned to a specific person, not a team). It lands directly in that person's queue as **New**, with nothing further for you to do until they respond. Whoever accepts it can keep your requested date or set a different one — see below for how that shows up on your side.

A work request's full lifecycle — dashed arrows are a **Reassign**, which resets straight back to New for the new person, no matter which side (requester or assignee) triggered it:

<pre class="mermaid">
flowchart TD
    Submit(["Requester submits, picks an assignee"]) --> New["New"]
    New -->|"Assignee accepts"| Accepted["Accepted"]
    New -->|"Assignee sends back"| NeedsInfo["Needs Info"]
    New -->|"Assignee declines"| Declined["Declined"]
    New -->|"Requester withdraws"| Withdrawn["Withdrawn"]
    NeedsInfo -->|"Requester replies"| New
    NeedsInfo -->|"Requester withdraws"| Withdrawn
    NeedsInfo -.->|"Reassigned"| New
    Accepted -->|"Assignee sends back"| NeedsInfo
    Accepted -.->|"Reassigned"| New
    Accepted -->|"Assignee marks complete"| Complete["Complete"]

    classDef startNode fill:#FFFFFF,stroke:#8B8FA3,color:#1D1F2B,stroke-width:1.5px,stroke-dasharray:3 3;
    classDef reqNode fill:#EDEAFB,stroke:#4A3F91,color:#2A2360,stroke-width:1.5px;
    classDef holdNode fill:#FCF1DD,stroke:#B9790A,color:#7A4F06,stroke-width:1.5px;
    classDef plannedNode fill:#E1EEFA,stroke:#1D5A96,color:#123A61,stroke-width:1.5px;
    classDef completeNode fill:#E1F0E5,stroke:#1C8A63,color:#125B41,stroke-width:1.5px;
    classDef deletedNode fill:#FAEAEA,stroke:#B23A3A,color:#7A2626,stroke-width:1.5px;

    class Submit startNode
    class New reqNode
    class NeedsInfo holdNode
    class Accepted plannedNode
    class Complete completeNode
    class Declined,Withdrawn deletedNode
</pre>

## My Requests

Also two tabs, matching the two request types:

- **Project Requests** — your own submitted project requests, with status, PMO feedback, and a quick link to the resulting project once one exists. What you can do depends on status: **Pending** ones can be **Revoked** yourself or edited; **Rejected** or **Revoked** ones can be **Edited & resubmitted**, which resets to Pending and clears the old feedback (the button is labeled "Resubmit request" even the first time you edit a still-pending request — that's just how the label reads); **Backlog/Planned/Active** means it was approved — use the linked-project icon to jump to it.
- **Work Requests** — work requests you've sent to someone else, with their current status and any note they've left you. **Request**, **Assigned to**, and **Est. completion** are all sortable (click the column header), and **Assigned to** also has a filter icon. The **Est. completion** column shows the date the assignee actually committed to — if that's different from the date you originally asked for, a small note underneath shows what you'd requested, so an adjusted date doesn't slip by unnoticed. You can **Withdraw** a request yourself while it's **New** or **Needs Info**. If one comes back **Needs Info**, you can instead **Reply** with the missing detail, which sends it back to **New** for the assignee to reconsider. You can also **Reassign** one of your own requests to a different person at any point before it's finished — including after it's been **Accepted** — since it's yours, this doesn't require the assignee's say-so; doing this clears any estimate and sends it back to **New** for the new person to accept on their own terms. Once a request is **Accepted**, you can also **Mark complete** yourself, with an optional closing note — handy if the assignee did the work but isn't in the habit of logging in to update it themselves. Every work request keeps a full history of who did what and when, visible via the history icon.

An admin-only **Work Requests** oversight page (see the [Admin Guide](../admin-guide/)) lists every work request across the org and can reassign or delete one if needed.

## My Projects, My Tasks & My Work Requests

These only show up in the sidebar once you have some connection to a project — owner, sponsor, team member, or task assignee — at any stage, **or** someone has sent you a work request.

- **My Projects** — split into five tabs: **Sponsor**, **Owner: Active**, **Owner: Not Started** (Planned, Backlog, or Hold), **Contributor** (on the team or assigned a task), and **Completed**. A project shows up in every tab that applies to you — if you're both the owner and the sponsor of the same active project, it appears under both. Completed projects get their own tab regardless of what your role was, with a badge per role so you can tell how you were involved. Each card shows health, status, owner, due date, and a "My tasks: X/Y done" count — purely informational, with a View link into each project.
- **My Tasks** — a **Plan** / **To-Do** tab selector, each split into its own Open and Completed tabs, searchable and filterable by project or status. **Plan** shows every project task assigned to you, with the same detail as the project's own Plan tab — description, checklist, tags, comments, and history, not just the title and due date. **To-Do** shows every lightweight to-do item assigned to you across all projects, the same way. You can comment on any item, check off your own checklist items on a task, and click the circle to the left of a title to mark it done (or click a done item's checkmark to reopen it). There's no time-logging feature in the app — commenting and marking done are the two write actions available to you as a plain assignee.
- **My Work Requests** — work requests sent to you, split into three tabs: **Waiting for approval** (New or Needs Info), **In progress** (Accepted), and **Completed** (Complete, Declined, or Withdrawn), each with its own search. If the requester gave a requested completion date, you'll see it on the row before you act. For anything **New**, you choose one of three responses: **Accept** (set an estimated completion date and estimated hours — this is what drives your load on the Capacity page; the completion date defaults to whatever the requester asked for, but you can change it), **Send back** (ask the requester for more information, with a note explaining what you need), or **Decline** (with a note explaining why). Once **Accepted**, you're not locked in — you can still **Send back** for more info or **Reassign** it to someone better suited (this clears the estimate and returns it to New for them), right alongside **Mark complete** when the work is actually done. Marking something complete lets you leave an optional note back to the requester — handy for pointing them at the result or flagging anything they should know.

## Late items

A red **Late** badge shows up anywhere a project, task, to-do, milestone, or work request has a date that's already passed without being closed out — its target end date, due date, target date, or committed completion date. It's computed on the fly, not a status you set yourself, and it disappears the moment the item is completed, marked done, or otherwise resolved. A project on Hold whose target end date has already passed still shows Late, since being paused doesn't make the original date any less passed.

You'll see it wherever that item normally shows up — the project/task/milestone lists, the project detail page, Roadmap, Portfolio, Capacity — and specifically on **your own** work: My Projects, My Tasks, and My Work Requests all surface it too, so an owner or assignee sees at a glance which of their own items have slipped, not just admins reviewing everyone else's.

## Tags vs. Categories

These look similar but work differently:

- **Tags** are a flexible, multi-select label you can filter by on almost every list page (Dashboard, Portfolio, Roadmap, and the project list pages all have a tag filter). A project, a resource, or a request can carry any number of tags.
- **Categories** act more like tabs — a project can belong to multiple categories, and it'll show up under each corresponding tab on pages like Active, Backlog, Planned, Completed, and Roadmap. You can't set a project's categories yourself unless you're its owner or an admin; otherwise they're set when a request is approved.

## Permissions at a glance

- **Editing a project**: you can edit a project if you're an admin, or if you're that project's designated **Owner**. Being on the team isn't enough on its own — ownership is what unlocks editing.
- **Financial data**: dollar estimates and confidence ratings are visible only to admins today, everywhere in the app — including on a project you own, on requests, and on the submission form (which shows you a plain-text value description instead).
- **Tasks vs. RAID**: any assignee can mark their own task done and comment on it; RAID log entries can only be added by the project's owner or an admin, with no exception for people the issue might concern.
- **Sidebar differences**: as a regular member, you won't see Future Planning, Prioritize Backlog, Resources, Capacity, the Requests review queue, Import/Export Projects, or Administration — those are covered in the **[Admin Guide](../admin-guide/)**.
