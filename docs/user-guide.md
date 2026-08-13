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
- **My Work** — My Projects, My Tasks (this section only appears once you have any connection at all to a project — owner, sponsor, team member, or task assignee — at any stage)

The bar at the top of the page shows the current page's title and any page-specific action buttons (like "New request").

## Dashboard

The Dashboard opens with four summary tiles — Active projects, On track, At risk, and a fourth tile that's either "Pending requests" (admins) or "In backlog" (everyone else).

Below that is an **Active projects** table. This is portfolio-wide, not just your own projects — you can search by name, sort any column, and filter by Status or Phase, plus a tag filter above the table. Click **View** on any row to open that project.

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
- **Tasks** — anyone can browse, search, sort, and filter tasks, and expand a task to see its checklist, comments, and history. A task has a title, an optional longer description, an assignee, a status, start/end dates, and tags. A new task starts **Unassigned** by default — assigning someone opens a search-and-pick list of people and teams (with an explicit "Unassigned" option), same pattern as picking a program. Tasks with both a start and end date show on a **collapsible Timeline** above the task list. **Anyone can post a comment on a task**, regardless of whether they own the project. If a task is assigned to you, you'll see a **Done** button to mark it complete (with an optional closing comment) even if you're not the project owner, and you can also check off items on that task's **checklist** even though you can't add or remove checklist items yourself. Creating, editing, or deleting a task itself — including adding/removing checklist items and tags — is owner/admin-only.
- **RAID log** (Risks, Assumptions, Issues, Dependencies) — everyone can view and expand history, but adding or editing an item is owner/admin-only. Unlike Tasks, there's no exception here for someone the item might concern — if you're not the owner, you can't log a risk yourself; you'd need to ask the owner or an admin to add it.
- **Documentation** — everyone can browse folders and open documents. Adding, moving, or deleting a document is owner/admin-only.
- **Metadata** — project ID, value area, categories, business unit, delivery methodology, T-shirt size, and the originating request if there is one. A **Financial detail** section (estimated value, cost estimate, confidence ratings) only appears if you have financial-view permission — today, that's admins only, so most users won't see dollar figures anywhere in the app, even on a project they own.
- **Change Log** — a read-only audit trail of who changed what, when. Financial changes are deliberately excluded from this log to keep dollar figures from leaking to anyone without financial-view permission.

One thing worth knowing: only an admin can reassign a project's **Owner**, and only an admin can delete a project — both of those are unavailable even to the current owner.

## Submitting a request

Use **Submit a Request** to propose a new project. You'll fill in:

- Project title, business unit, and a description of the problem or opportunity (all required)
- An optional sponsor name
- A description of the expected value — for most users this is a simple free-text box ("what's the expected value?"); if you have financial-view permission, you'll instead get structured fields for a dollar estimate, frequency, and confidence rating
- Tags, and a proposed team (who you think should work on it)

There's no category picker on this form — categories get set later, when a PMO admin reviews and approves the request.

After you submit, your request is **Pending** until a PMO admin reviews it. If approved, it becomes a real project — the request's status will change to **Backlog**, **Planned**, or **Active** to match wherever the project landed (you generally won't see a literal "Approved" status; look for one of those three instead). If rejected, you'll see optional feedback from the reviewer.

## My Requests

Shows only your own submitted requests, with status, PMO feedback, and a quick link to the resulting project once one exists. What you can do depends on status:

- **Pending** — you can **Revoke** it yourself (withdraw it before a PMO admin reviews it) or edit it.
- **Rejected** or **Revoked** — you can **Edit & resubmit**, which resets it back to Pending and clears the old feedback. (Note: the button is labeled "Resubmit request" even the first time you edit a still-pending request — that's just how the label reads, not a sign anything was rejected.)
- **Backlog / Planned / Active** — your request was approved; use the linked-project icon to jump straight to it.

## My Projects & My Tasks

These only show up in the sidebar once you have some connection to a project — owner, sponsor, team member, or task assignee — at any stage.

- **My Projects** — split into five tabs: **Sponsor**, **Owner: Active**, **Owner: Not Started** (Planned, Backlog, or Hold), **Contributor** (on the team or assigned a task), and **Completed**. A project shows up in every tab that applies to you — if you're both the owner and the sponsor of the same active project, it appears under both. Completed projects get their own tab regardless of what your role was, with a badge per role so you can tell how you were involved. Each card shows health, status, owner, due date, and a "My tasks: X/Y done" count — purely informational, with a View link into each project.
- **My Tasks** — every task assigned to you, split into Open and Completed tabs, searchable and filterable by project or status. You can comment on any task and mark your own open tasks **Done**. There's no time-logging feature in the app — commenting and marking done are the two actions available to you as a plain assignee.

## Tags vs. Categories

These look similar but work differently:

- **Tags** are a flexible, multi-select label you can filter by on almost every list page (Dashboard, Portfolio, Roadmap, and the project list pages all have a tag filter). A project, a resource, or a request can carry any number of tags.
- **Categories** act more like tabs — a project can belong to multiple categories, and it'll show up under each corresponding tab on pages like Active, Backlog, Planned, Completed, and Roadmap. You can't set a project's categories yourself unless you're its owner or an admin; otherwise they're set when a request is approved.

## Permissions at a glance

- **Editing a project**: you can edit a project if you're an admin, or if you're that project's designated **Owner**. Being on the team isn't enough on its own — ownership is what unlocks editing.
- **Financial data**: dollar estimates and confidence ratings are visible only to admins today, everywhere in the app — including on a project you own, on requests, and on the submission form (which shows you a plain-text value description instead).
- **Tasks vs. RAID**: any assignee can mark their own task done and comment on it; RAID log entries can only be added by the project's owner or an admin, with no exception for people the issue might concern.
- **Sidebar differences**: as a regular member, you won't see Future Planning, Prioritize Backlog, Resources, Capacity, the Requests review queue, Import/Export Projects, or Administration — those are covered in the **[Admin Guide](../admin-guide/)**.
