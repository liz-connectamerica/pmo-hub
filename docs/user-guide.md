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

Opening a project gives you tabs across the top: **Overview, Team, Milestones, Tasks, RAID log, Documentation, Metadata,** and **Change Log**.

- **Overview** — stage, status, phase, priority, progress, dates, description, sponsor, owner, tags, dependencies, program, and a mini milestone timeline. Everyone can see this; only the project's **owner** or an admin can edit it or change its stage (put on hold, resume, mark complete). The **Program** field sits next to Depends on — Add/Change program opens a search-and-pick list, same pattern as adding a dependency; a project can only belong to one program at a time.
- **Team** — who's assigned. Only the owner or an admin can add or remove people.
- **Milestones** — anyone can view the list and a milestone's history. Adding, editing, completing, or deleting a milestone is owner/admin-only.
- **Tasks** — anyone can browse, search, filter, and expand a task to see its description, checklist, comments, and history. A task has a title, an optional longer description (its own expandable row, not shown inline), an assignee, a status, start/end dates, and tags. A new task starts **Unassigned** by default — assigning someone opens a search-and-pick list of people and teams (with an explicit "Unassigned" option), same pattern as picking a program. Tasks can be nested into a hierarchy — a task can be dragged to reorder it among its siblings, or **Promote**/**Demote** (in the **⋮** menu) indents it under the one above it or moves it back out, the same way Microsoft Planner/Project handle sub-tasks. Each task shows a sequential **ID** based on its position in that outline, and a parent task can be collapsed to hide its subtasks. (Dragging, Promote, and Demote are only available when no search or filter is active, since they act on the task's true position — searching or filtering shows a flat, unindented list instead, and dragging a task onto one at a different level is rejected — reorder within the same level, or use Promote/Demote to change levels.) The **⋮** menu also has **Add task before** / **Add task after** (inserts a new sibling task right next to this one) alongside Edit and Delete. Deleting a task with subtasks deletes the whole subtree. The **collapsible Timeline** above the task list mirrors that same list exactly — same order, same indentation, same expand/collapse state, so a drag, a promote/demote, or collapsing a parent shows up in the timeline too. A task with dates falling in the current window gets a bar; one with dates outside the window shows "Outside this range," and one with no dates at all shows "No dates set" — either way its row still appears so the hierarchy stays intact. Default is a 1-month window starting today, with 1/2/3-month and custom-range options. **Anyone can post a comment on a task**, regardless of whether they own the project. A circle to the left of a task's title is the completion toggle — if the task is assigned to you, clicking it (with an optional closing comment) marks it done even if you're not the project owner, and clicking a completed task's checkmark reopens it. You can also check off items on that task's **checklist** even though you can't add or remove checklist items yourself. Creating, editing, or deleting a task itself — including adding/removing checklist items, tags, and promoting/demoting — is owner/admin-only.
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

- **Work Request** — a smaller ask for someone's time, not a full project. No PMO review needed. Fill in a title, description, and who it's for (search and pick an individual resource — work requests are always assigned to a specific person, not a team). It lands directly in that person's queue as **New**, with nothing further for you to do until they respond.

## My Requests

Also two tabs, matching the two request types:

- **Project Requests** — your own submitted project requests, with status, PMO feedback, and a quick link to the resulting project once one exists. What you can do depends on status: **Pending** ones can be **Revoked** yourself or edited; **Rejected** or **Revoked** ones can be **Edited & resubmitted**, which resets to Pending and clears the old feedback (the button is labeled "Resubmit request" even the first time you edit a still-pending request — that's just how the label reads); **Backlog/Planned/Active** means it was approved — use the linked-project icon to jump to it.
- **Work Requests** — work requests you've sent to someone else, with their current status and any note they've left you. You can **Withdraw** a request yourself while it's **New** or **Needs Info**. If one comes back **Needs Info**, you can instead **Reply** with the missing detail, which sends it back to **New** for the assignee to reconsider. Every work request keeps a full history of who did what and when, visible via the history icon.

An admin-only **Work Requests** oversight page (see the [Admin Guide](../admin-guide/)) lists every work request across the org and can reassign or delete one if needed.

## My Projects, My Tasks & My Work Requests

These only show up in the sidebar once you have some connection to a project — owner, sponsor, team member, or task assignee — at any stage, **or** someone has sent you a work request.

- **My Projects** — split into five tabs: **Sponsor**, **Owner: Active**, **Owner: Not Started** (Planned, Backlog, or Hold), **Contributor** (on the team or assigned a task), and **Completed**. A project shows up in every tab that applies to you — if you're both the owner and the sponsor of the same active project, it appears under both. Completed projects get their own tab regardless of what your role was, with a badge per role so you can tell how you were involved. Each card shows health, status, owner, due date, and a "My tasks: X/Y done" count — purely informational, with a View link into each project.
- **My Tasks** — every task assigned to you, split into Open and Completed tabs, searchable and filterable by project or status. Each row shows the same detail as the project's own Tasks tab — description, checklist, tags, comments, and history, not just the title and due date. You can comment on any task, check off your own checklist items, and click the circle to the left of a task's title to mark it done (or click a done task's checkmark to reopen it). There's no time-logging feature in the app — commenting and marking done are the two write actions available to you as a plain assignee.
- **My Work Requests** — work requests sent to you, split into **Open work requests** (New, Needs Info, or Accepted) and **Completed work requests** (Complete, Declined, or Withdrawn) tabs, with its own search. For anything **New**, you choose one of three responses: **Accept** (set an estimated completion date and estimated hours — this is what drives your load on the Capacity page), **Send back** (ask the requester for more information, with a note explaining what you need), or **Decline** (with a note explaining why). Once you've **Accepted** one, mark it **Complete** when the work is done.

## Tags vs. Categories

These look similar but work differently:

- **Tags** are a flexible, multi-select label you can filter by on almost every list page (Dashboard, Portfolio, Roadmap, and the project list pages all have a tag filter). A project, a resource, or a request can carry any number of tags.
- **Categories** act more like tabs — a project can belong to multiple categories, and it'll show up under each corresponding tab on pages like Active, Backlog, Planned, Completed, and Roadmap. You can't set a project's categories yourself unless you're its owner or an admin; otherwise they're set when a request is approved.

## Permissions at a glance

- **Editing a project**: you can edit a project if you're an admin, or if you're that project's designated **Owner**. Being on the team isn't enough on its own — ownership is what unlocks editing.
- **Financial data**: dollar estimates and confidence ratings are visible only to admins today, everywhere in the app — including on a project you own, on requests, and on the submission form (which shows you a plain-text value description instead).
- **Tasks vs. RAID**: any assignee can mark their own task done and comment on it; RAID log entries can only be added by the project's owner or an admin, with no exception for people the issue might concern.
- **Sidebar differences**: as a regular member, you won't see Future Planning, Prioritize Backlog, Resources, Capacity, the Requests review queue, Import/Export Projects, or Administration — those are covered in the **[Admin Guide](../admin-guide/)**.
