---
layout: page
title: User Guide
permalink: /user-guide/
---

This guide covers what any PMO Hub user can see and do. If you're a PMO Admin, there's a separate **[Admin Guide](../admin-guide/)** covering the additional tools available to that role.

## Getting around

The sidebar is organized into a few sections:

- **Overview** — Home, Roadmap, Portfolio
- **Projects** — Active, Planned, Backlog, Hold, Completed
- **My Requests** — Submit a Request, My Requests
- **My Work** — My Projects, My Tasks, My Work Requests, My Capacity (this section appears once your account is linked to a resource, since My Tasks always has a personal use — adding a to-do for yourself — even before you're connected to any project or work request)

The bar at the top of the page shows the current page's title and any page-specific action buttons (like "New request"). A **Light / System / Dark** theme toggle sits in the sidebar below the nav — your choice is remembered on that browser.

## Search

The search box under the PMO Hub logo works from anywhere in the app and looks across **Projects** and **Work Requests** by name/title and description, showing live results as you type — grouped by type, each with a badge for its stage or status so closed-out matches (Completed projects, Declined/Withdrawn/Complete requests) are still findable but clearly marked. Press Escape, click away, or pick a result to close it.

- **Projects** — every project matches, regardless of stage; picking one opens it directly.
- **Work Requests** — you'll only find requests you submitted or are assigned to (the same ones you can already reach from My Requests and My Work Requests) — search doesn't expose anyone else's. Admins search every request in the system, same as the Work Requests admin page. Picking a result takes you to wherever that request already lives, with its title pre-filled into that page's own search.

## Home

Home is what you land on after logging in — a personalized view of what needs you, not a portfolio-wide browse.

**Needs your attention** leads the page: any project you own that's past its target end date, tasks and to-dos assigned to you due within 3 days (or overdue), high-severity open RAID items on projects you own, and your work request status — a request sent back to you needing more detail (or, for admins, counts of project/work requests awaiting review). Click any item to jump straight to it. Below that, **Your projects** is a compact strip of the active projects you own or sponsor, and admins get a **Portfolio pulse** strip (active count, RAG split, projects missing an owner or sponsor) linking to the full [Portfolio Health](../admin-guide/#portfolio-health) page.

At the bottom of the page — since it doesn't fit "needs your attention" but still needed a home — everyone sees a **Rejected proposals** list (every rejected request across the whole org, not just yours, with a date-range filter) and, if you're a project sponsor, a **Projects you sponsor** table with an inline **Edit financials** shortcut.

## Roadmap

A month-by-month timeline (Gantt-style) of active and planned projects, grouped by category. You can:

- Switch the date window between **Next 12 months**, **Last 12 months**, or a **specific year**
- Filter by category tab or by tag
- Click the eye icon on any row to jump to that project

Below the timeline is an **Upcoming milestones** list, pulling undone milestones from active projects — Project, Milestone, Due, and Owner (the project's owner), searchable and with Project and Owner both sortable and filterable.

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

Opening a project gives you tabs across the top: **Information, People, Milestones, Plan, To-Do, RAID log,** and **Documentation**.

- **Information** — everything about the project itself, as one scrollable page. A left-hand nav jumps you to any of six sections without leaving the page: **Identity & Classification** (name, description, priority, value area, T-shirt size, business unit, delivery methodology, project ID, categories, tags), **Schedule, Stage & Lifecycle** (stage, status, phase, start/target-end dates, the milestone timeline, and the Put on hold / Resume / Mark complete actions), **Progress & Health** (progress %, health, current blocker), **Financials** (estimated value, cost estimate, confidence ratings — only appears if you have financial-view permission; today that's admins only, so most users won't see dollar figures anywhere in the app, even on a project they own), **Relationships** (Depends on, Program — with its own Add/Change picker, since a project can only belong to one at a time — and the originating request if there is one), and **System & Audit** (created date, last edited). A **Change Log** section — a read-only audit trail of who changed what, when, with financial changes deliberately excluded to keep dollar figures from leaking to anyone without financial-view permission — sits at the very bottom. Everyone can see all of it; if you can edit the project, each section (other than Relationships and System & Audit) has its own **Edit** button that turns it into a form in place, with **Save**/**Cancel** replacing it while you're editing — only an admin or the project **owner** can change its stage (put on hold, resume, mark complete). Sponsor, Owner, and Requirements Owner live on the **People** tab instead.
- **People** — **Sponsor, Owner,** and **Requirements Owner** sit at the top, followed by who's on the team. Reassigning Sponsor or Owner is admin-only, but a project's own **owner** can set its **Requirements Owner** themselves — an Edit button there turns the section into a form in place, the same Save/Cancel pattern as Information (an owner's Edit form only offers the Requirements Owner field; Sponsor and Owner show read-only next to it). Only the owner or an admin can add or remove team members. Each row also has an **allocation tier** dropdown (Owner/Lead, Core, Light touch, or Not set) — set by the owner or an admin — that says roughly how much of that person's time this project is expected to take; it feeds directly into their load on the [Capacity](../admin-guide/#capacity) page. An owner who wants their own time counted needs to be on the team themselves, same as anyone else — there's no separate "owner allocation" field. Click the **(i)** next to "Team members" for a quick reminder of what each tier assumes.
- **Milestones** — anyone can view the list and a milestone's history. Adding, editing, completing, or deleting a milestone is owner/admin-only.
- **Plan** (formerly "Tasks") — anyone can browse, search, filter, and expand a task to see its description, checklist, comments, and history. A task has a title, an optional longer description (its own expandable row, not shown inline), an assignee, a status (To Do, In Progress, On Hold, or Done), start/end dates or a working-day duration, an optional dependency on another task, and tags. A new task starts **Unassigned** by default — assigning someone opens a search-and-pick list of people and teams (with an explicit "Unassigned" option), same pattern as picking a program. Tasks can be nested into a hierarchy — a task can be dragged to reorder it among its siblings, or **Promote**/**Demote** (in the **⋮** menu) indents it under the one above it or moves it back out, the same way Microsoft Planner/Project handle sub-tasks; a summary task (one with subtasks) takes its Start/End automatically from the earliest/latest dates among its children, and those fields lock once it has children. A task can instead depend on another task in the same project — set a working-day **Duration** and pick a predecessor, and its Start/End auto-calculate as the next working day after that predecessor ends. Each task shows a sequential **ID** based on its position in that outline, and a parent task can be collapsed to hide its subtasks. (Dragging, Promote, and Demote are only available when no search or filter is active, since they act on the task's true position — searching or filtering shows a flat, unindented list instead, and dragging a task onto one at a different level is rejected — reorder within the same level, or use Promote/Demote to change levels.) The **⋮** menu also has **Add task before** / **Add task after** (inserts a new sibling task right next to this one) alongside Edit and Delete. Deleting a task with subtasks deletes the whole subtree. The **collapsible Timeline** above the task list mirrors that same list exactly — same order, same indentation, same expand/collapse state, so a drag, a promote/demote, or collapsing a parent shows up in the timeline too. A task with dates falling in the current window gets a bar; one with dates outside the window shows "Outside this range," and one with no dates at all shows "No dates set" — either way its row still appears so the hierarchy stays intact. Default is a 1-month window starting today, with 1/2/3-month and custom-range options. A **Set baseline** button (owner/admin-only) snapshots every task's current dates — past baselines are kept, never overwritten, and the timeline's **Compare to baseline** dropdown overlays a saved baseline as a dashed ghost bar against the live bar to show plan-vs-actual drift. A **List / Grid** toggle at the top switches the whole view: **Grid** is a dense, spreadsheet-style table (owner/admin-only to edit) where every field — title, assignee, status, start/end, duration, depends on — is an inline input or dropdown that saves the moment you change it, plus a row at the bottom for typing in several new tasks in a row without opening the Add Task dialog each time; it's meant for fast bulk entry and editing, not restructuring the outline, so promote/demote/drag and the Timeline stay List-only. **Anyone can post a comment on a task**, regardless of whether they own the project. A circle to the left of a task's title is the completion toggle — if the task is assigned to you, clicking it (with an optional closing comment) marks it done even if you're not the project owner, and clicking a completed task's checkmark reopens it. You can also check off items on that task's **checklist** even though you can't add or remove checklist items yourself. Creating, editing, or deleting a task itself — including adding/removing checklist items, tags, and promoting/demoting — is owner/admin-only.
- **To-Do** — a lightweight list for action items, follow-ups, access requests, reminders, and other work that doesn't belong on the project plan. A to-do has just a title, an optional description, an individual assignee, a due date, and a status — **Not Started** (the default for a new to-do), **In Progress**, or **Done** — no hierarchy, scheduling, or checklist. Anyone can browse, search, sort, filter, comment, and expand a to-do's history; creating, editing, or deleting one is owner/admin-only, but the assignee can always mark their own to-do done (or reopen it, which sends it back to In Progress, since Done-but-not-really means it was worked on already) themselves — moving from Not Started to In Progress otherwise takes editing the to-do. Every to-do you're assigned also shows up in your **My Tasks** sidebar page, under its own To-Do tab — both Not Started and In Progress count as "open" there, alongside Completed.
- **RAID log** (Risks, Assumptions, Issues, Dependencies) — everyone can view and expand history, but adding or editing an item is owner/admin-only. Unlike Tasks, there's no exception here for someone the item might concern — if you're not the owner, you can't log a risk yourself; you'd need to ask the owner or an admin to add it.
- **Documentation** — everyone can browse folders and open documents. Adding, moving, or deleting a document is owner/admin-only.

One thing worth knowing: only an admin can reassign a project's **Sponsor** or **Owner**, and only an admin can delete a project — those are unavailable even to the current owner (Delete lives next to the People tab's Edit button, at the top of that tab). The owner can, however, set the project's **Requirements Owner** themselves.

## Submitting a request

**Submit a Request** covers two different kinds of ask, as two tabs on the same page — each tab explains what it's for right at the top:

- **Project Request** — a full-scale project with its own timeline, milestones, team, and budget. Goes through PMO review before it's approved and scheduled. You'll fill in:
  - Project title, business unit, and a description of the problem or opportunity (all required)
  - An optional sponsor — search-and-pick from existing individuals, same picker pattern used elsewhere in the app, not a free-text name
  - A description of the expected value — for most users this is a simple free-text box ("what's the expected value?"); if you have financial-view permission, you'll instead get optional structured fields for a value type, dollar estimate, frequency, and confidence rating — none of these are required to submit
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

## My Projects, My Tasks, My Work Requests & My Capacity

These show up in the sidebar once your account is linked to a resource. My Projects and My Work Requests will be empty until you actually have some connection to a project or work request, but My Tasks and My Capacity always have something useful to offer — My Tasks is where you manage your own personal to-dos, connection or not, and My Capacity always lets you set your BAU %.

- **My Projects** — split into five tabs: **Sponsor**, **Owner: Active**, **Owner: Not Started** (Planned, Backlog, or Hold), **Contributor** (on the team or assigned a task), and **Completed**. A project shows up in every tab that applies to you — if you're both the owner and the sponsor of the same active project, it appears under both. Completed projects get their own tab regardless of what your role was, with a badge per role so you can tell how you were involved. Each card shows health, status, owner, due date, and a "My tasks: X/Y done" count — purely informational, with a View link into each project.
- **My Tasks** — a **Plan** / **To-Do** tab selector, each split into its own Open and Completed tabs, searchable and filterable by project or status. **Plan** shows every project task assigned to you, with the same detail as the project's own Plan tab — description, checklist, tags, comments, and history, not just the title and due date. **To-Do** shows every lightweight to-do item assigned to you, project-linked or not — see **Personal to-dos** below. You can comment on any item, check off your own checklist items on a task, and click the circle to the left of a title to mark it done (or click a done item's checkmark to reopen it). There's no time-logging feature in the app — commenting and marking done are the two write actions available to you as a plain assignee.
- **My Capacity** — a card at the top lets you self-report your **BAU (non-project) %**, roughly how much of your time normally goes to non-project work. Below that, **Previous / Current / Next month** tabs show an **Estimated total load** for whichever month you pick — your BAU % plus the allocation % for every project you're on the team for that's active that month, plus a prorated share of your open work requests — with a breakdown line spelling out how the total was built. Each project below it shows its allocation tier and computed %, with an edit icon to **override that % for yourself** if it doesn't match reality (this always wins over the computed default, and never changes the tier itself — that's still set from the project's own People tab). A project not shown for the selected month is on hold, completed, unscheduled, or just not active that month; a note at the bottom says how many are hidden that way.

### Personal to-dos

An **Add a to-do** button on the My Tasks → To-Do tab creates a to-do that isn't attached to any project — just a title, an optional description, a due date, and a status (Not Started, In Progress, or Done), the same as a project to-do but without a project or an assignee picker, since it's always assigned to you. Use it for anything you need to get done by a certain day that doesn't belong to a project — a certification renewal, a follow-up with HR, a personal reminder.

Unlike project to-dos, which anyone can see, a personal to-do is **private** — visible only to you and PMO Admins, never to other members (admins have their own org-wide view — see the Admin Guide's **Personal To-Dos** page). You can edit or delete your own at any time; there's no owner/admin approval step, since it's yours to manage. It shows a "Personal" badge instead of a project name everywhere it appears, and otherwise behaves exactly like a project to-do — comments, change log, the Late badge if its due date passes, and the same Open/Completed split.
- **My Work Requests** — work requests sent to you, split into three tabs: **Waiting for approval** (New or Needs Info), **In progress** (Accepted), and **Completed** (Complete, Declined, or Withdrawn), each with its own search. If the requester gave a requested completion date, you'll see it on the row before you act. For anything **New**, you choose one of three responses: **Accept** (set an estimated completion date and estimated hours — this is what drives your load on the Capacity page; the completion date defaults to whatever the requester asked for, but you can change it), **Send back** (ask the requester for more information, with a note explaining what you need), or **Decline** (with a note explaining why). Once **Accepted**, you're not locked in — you can still **Send back** for more info or **Reassign** it to someone better suited (this clears the estimate and returns it to New for them), right alongside **Mark complete** when the work is actually done. Marking something complete lets you leave an optional note back to the requester — handy for pointing them at the result or flagging anything they should know.

## Late items

A red **Late** badge shows up anywhere a project, task, to-do, milestone, or work request has a date that's already passed without being closed out — its target end date, due date, target date, or committed completion date. It's computed on the fly, not a status you set yourself, and it disappears the moment the item is completed, marked done, or otherwise resolved. A project on Hold whose target end date has already passed still shows Late, since being paused doesn't make the original date any less passed.

You'll see it wherever that item normally shows up — the project/task/milestone lists, the project detail page, Roadmap, Portfolio, Capacity — and specifically on **your own** work: My Projects, My Tasks, and My Work Requests all surface it too, so an owner or assignee sees at a glance which of their own items have slipped, not just admins reviewing everyone else's.

## Tags vs. Categories

These look similar but work differently:

- **Tags** are a flexible, multi-select label you can filter by on almost every list page (Portfolio, Roadmap, and the project list pages all have a tag filter). A project, a resource, or a request can carry any number of tags.
- **Categories** act more like tabs — a project can belong to multiple categories, and it'll show up under each corresponding tab on pages like Active, Backlog, Planned, Completed, and Roadmap. You can't set a project's categories yourself unless you're its owner or an admin; otherwise they're set when a request is approved.

## Permissions at a glance

- **Editing a project**: you can edit a project if you're an admin, or if you're that project's designated **Owner**. Being on the team isn't enough on its own — ownership is what unlocks editing. One exception within that: even the owner can't reassign **Sponsor** or **Owner** — only an admin can — though the owner can set **Requirements Owner**.
- **Financial data**: dollar estimates and confidence ratings are visible only to admins today, everywhere in the app — including on a project you own, on requests, and on the submission form (which shows you a plain-text value description instead).
- **Tasks vs. RAID**: any assignee can mark their own task done and comment on it; RAID log entries can only be added by the project's owner or an admin, with no exception for people the issue might concern.
- **Sidebar differences**: as a regular member, you won't see Future Planning, Prioritize Backlog, Resources, Capacity, the Requests review queue, Import/Export Projects, or Administration — those are covered in the **[Admin Guide](../admin-guide/)**.
