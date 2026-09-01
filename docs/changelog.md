---
layout: page
title: Changelog
permalink: /changelog/
---

A dated log of feature and fix changes to PMO Hub, newest first — one entry per day, grouped by the area(s) of the app it touched. Use the search box below to filter by keyword (area name, feature, or anything in the description).


<div class="changelog-search">
  <input type="search" id="changelog-search-input" placeholder="Search changes… (e.g. &quot;tasks&quot;, &quot;baseline&quot;, &quot;sponsor&quot;)" autocomplete="off" aria-label="Search the changelog">
  <div class="changelog-count" id="changelog-count"></div>
</div>

<div id="changelog-list">

<div class="changelog-entry" id="cl-2026-09-01">
  <h2>My Projects</h2>
  <p class="changelog-date">September 1, 2026 · 8:50 AM – 10:20 AM</p>
  <ul>
    <li><strong>My Projects:</strong> Every tab (Sponsor, Owner: Active, Owner: Not Started, Contributor, Completed) is now the same searchable, sortable table instead of cards, with column filters on Status, Stage, Priority, and Owner. The Value area column was replaced with Priority.</li>
    <li><strong>Backlog, Planned, Prioritize Backlog:</strong> The description at the top of each page no longer looks like a warning — switched from a colored banner to plain text, and reworded Backlog/Planned to be informative rather than directive (e.g. "They'll move to Planned once a start date is assigned" instead of "Assign a start date"), since most readers of those pages can't take that action themselves. Portfolio Health's "how this works" note got the same banner-to-plain-text treatment.</li>
    <li><strong>Home:</strong> Removed the Rejected proposals section — it wasn't shown anywhere else in the app, so this retires that browsing view.</li>
    <li><strong>Documentation site:</strong> The home page no longer shows an empty "On this page & search" sidebar (it had no headings to list). Added a Light/System/Dark theme toggle, matching the app's own.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-31">
  <h2>Home &amp; Dark Mode</h2>
  <p class="changelog-date">August 31, 2026 · 2:45 PM – 4:50 PM</p>
  <ul>
    <li>New <strong>Home</strong> page replaces Dashboard as the default landing page. Leads with <strong>Needs your attention</strong> — your late owned projects, tasks/to-dos due within 3 days, high-severity open RAID items on projects you own, and work request status (sent-back-to-you for members, review-queue counts for admins) — followed by a compact strip of your own projects, an admin-only Portfolio pulse (active count, RAG split, missing owner/sponsor), and quick links. <strong>Rejected proposals</strong> and the <strong>Projects you sponsor</strong> financials table — Dashboard's only content with no other home in the app — moved to the bottom of Home; the old portfolio-wide Active-projects table wasn't carried over since that same data is already browsable on the Active page.</li>
    <li>Added <strong>dark mode</strong> — a Light/System/Dark toggle in the sidebar, persisted per-browser and applied before first paint. Every page, badge, health dot, and chart color now has a dark-mode equivalent.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-28">
  <h2>View As</h2>
  <p class="changelog-date">August 28, 2026 · 10:16 AM – 12:37 PM</p>
  <ul>
    <li><strong>View As:</strong> The "Member" preview (now labeled <strong>Myself, as a Member</strong>) resolves to your own linked resource, showing your actual My Projects/My Tasks/My Work Requests instead of an empty generic simulation — useful for sanity-checking your own account at Member permission level. Falls back to the old generic preview only if your account isn't linked to a resource. "My View" is unchanged.</li>
    <li><strong>People tab:</strong> A project's own Owner can now set that project's <strong>Requirements Owner</strong> directly, without needing an admin. Sponsor and Owner remain admin-only.</li>
    <li><strong>To-Do:</strong> A project's To-Do tab now has sortable columns — click To-Do, Assignee, Status, or Due to sort, matching the pattern already used on My Tasks and the admin Personal To-Dos page.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-27">
  <h2>Portfolio Health</h2>
  <p class="changelog-date">August 27, 2026 · 12:41 PM – 7:05 PM</p>
  <ul>
    <li>New <strong>Portfolio Health</strong> page under Overview (admin-only) — a click-to-drill dashboard of eight metrics: portfolio stage funnel, RAG status for active projects, late projects by stage, late tasks (plan tasks + to-dos combined, bucketed by how many per project), open RAID risks &amp; issues by severity, projects missing an Owner or Sponsor, Owner load, stale active projects, and blank fields on active projects. Click any bar to expand exactly which projects make up that number.</li>
    <li><strong>Portfolio Health:</strong> Added monthly snapshots — captured automatically on the 1st of each month, or on demand with a new <strong>Capture snapshot now</strong> button. A month picker lets you view any past snapshot through the same dashboard and drill-downs, and a <strong>Download PDF</strong> button opens a clean print view for sharing. The RAG card now shows a real trend strip across recent snapshots, once more than one exists.</li>
    <li><strong>All Projects:</strong> Added a column for every field Bulk Edit can set — T-shirt Size, Health, Delivery Methodology, Opportunity Type, and both confidence ratings joined the existing columns, all sortable and filterable. Every filter (Stage excepted, since it can never be blank) now also offers a <strong>Not set</strong> option, to isolate exactly which projects are missing a given field.</li>
    <li>New <strong>global search</strong> in the sidebar, under the logo, available to everyone — searches Projects and Work Requests by name/title and description with live results as you type. Work request results are scoped to what you can already see (your own submitted/assigned; everything for admins), and picking one routes to wherever it already lives.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-26">
  <h2>Capacity</h2>
  <p class="changelog-date">August 26, 2026 · 10:45 AM – 5:05 PM</p>
  <ul>
    <li><strong>Capacity:</strong> The Teams tab now shows two rows per team: the team's own row (projects assigned directly to the team), and a new <strong>Team members (avg)</strong> row showing the average %-load across that team's individual members — collapsed by default, expandable into each member's own full row.</li>
    <li><strong>Team:</strong> Added an (i) icon next to "Team members" on a project's Team tab explaining what each allocation tier assumes and how it feeds into Capacity.</li>
    <li><strong>Team:</strong> A project's <strong>owner</strong> is now automatically added to the team and defaulted to the <strong>Owner/Lead</strong> allocation tier the moment they're set as owner — new project, edit, schedule/backlog conversion, bulk edit, or import. This only fills in a default: changing their tier afterward sticks, it's never overwritten back. Ran a one-time backfill so every existing project's owner is correctly reflected this way too.</li>
    <li><strong>Resources:</strong> Renamed the Load column to <strong>Current Load</strong>, and made it and the Work requests column sortable, like every other column. On the Teams tab, the Members count is now a button that expands into an alphabetical roster of that team's members. Action buttons in the expanded Projects and Members lists now sit to the left of each item instead of stretched to the far right.</li>
    <li><strong>My Capacity:</strong> New page under My Work — self-report your non-project (BAU) % here (moved off My Tasks), see every project you're on the team for with its allocation tier and computed %, and override that % for yourself if it doesn't match reality. An "Estimated total load" figure combines BAU % with your project allocations for a chosen month (Previous / Current / Next tabs), plus a prorated share of your open work requests — the same math the admin Capacity page uses.</li>
    <li><strong>Capacity:</strong> A team member's allocation tier now also scales by the project's <strong>T-shirt size</strong> — e.g. Owner/Lead on an XL project carries more assumed load than the same role on an XS one — instead of a flat rate regardless of size.</li>
    <li><strong>Administration:</strong> Added a <strong>Capacity Weights</strong> page for admins to tune the tier base %s and T-shirt size %s that drive every capacity calculation in the app, with a live preview of the resulting matrix.</li>
    <li><strong>Roadmap:</strong> The Upcoming milestones table's Status column (always "Upcoming," so it carried no information) is replaced with a sortable, filterable <strong>Owner</strong> column, matching how Project already worked.</li>
    <li><strong>Information:</strong> Replaced the Overview and Metadata tabs with a single new <strong>Information</strong> tab (now first) — Identity & Classification, Schedule/Stage & Lifecycle, Progress & Health, Financials, Relationships, and System & Audit, plus the Change Log tab folded in as its last section. All of it lives on one scrollable page with a sticky left-hand nav that jumps to a section on click.</li>
    <li><strong>Information:</strong> Each section edits in place — an Edit button turns it into a form with Save/Cancel, right there on the page, replacing the old full-project and financials modals for everything reachable from this tab. Description now lives under Project Name in Identity & Classification; Current Blocker lives in Progress & Health, alongside Health (previously only editable through the old modal and never actually shown anywhere).</li>
    <li><strong>Project detail:</strong> The stage/status/priority badges and the top tab bar (Information, People, Milestones, Plan, etc.) now stay visible while scrolling through a tab's content, on every tab — previously the whole page scrolled together.</li>
    <li><strong>People:</strong> Renamed the project's Team tab to <strong>People</strong>. It now opens with Sponsor, Owner, and a new <strong>Requirements Owner</strong> role — admin-only to reassign, edited in place — above the existing team list and add-member picker. Requirements Owner is also settable when creating a new project. Program moved from the old Information-tab strip into the Relationships section (it's a project-to-program link, not a person), and that strip's Delete button moved to People.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-25-capacity">
  <h2>Capacity</h2>
  <p class="changelog-date">August 25, 2026 · 5:46 PM</p>
  <ul>
    <li>Replaced the flat project-count heat map with a combined %-load figure per resource per month: a self-reported BAU % baseline, a per-project allocation tier set on the project's Team tab (Owner/Lead, Core, Light touch), and open work requests prorated into the same total.</li>
    <li>Heat map cells are now colored by % load (Light / Moderate / Full / Over-allocated) instead of raw project count. Expanding a row shows BAU %, each project's tier, and each work request's approximate %.</li>
    <li>Added a BAU (non-project) % self-report control to My Tasks, and a Load column to the Resources page linking into Capacity.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-25-plan">
  <h2>Plan</h2>
  <p class="changelog-date">August 25, 2026 · 4:16 PM</p>
  <ul>
    <li>Added a List/Grid toggle to the top of the Plan tab. Grid is a dense, spreadsheet-style table (owner/admin-only to edit) where title, assignee, status, start/end, duration, and depends-on are all inline inputs or dropdowns that save the moment you change them -- no modal per edit.</li>
    <li>A row at the bottom of Grid lets you type a task title and hit Enter to add it, then refocuses automatically so you can keep adding several tasks in a row without opening the Add Task dialog each time.</li>
    <li>Grid shows the full outline, summary tasks included, with the same start/end locking rules as the task modal -- summary and dependency-driven tasks show computed dates rather than editable ones. Hierarchy restructuring (promote/demote/drag) and the Timeline stay List-only.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-25-todo">
  <h2>To-Do</h2>
  <p class="changelog-date">August 25, 2026 · 12:45 PM – 1:02 PM</p>
  <ul>
    <li>Expanded to-do status from Open/Done to Not Started / In Progress / Done, with Not Started as the default for a new to-do. Both Not Started and In Progress count as "open" everywhere the app already checked for not-Done -- the My Tasks Open tab, the Late badge, the project To-Do tab.</li>
    <li>Reopening a completed to-do now sends it back to In Progress rather than Not Started, since marking something done that wasn't actually finished means work had already started on it.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-25-requests">
  <h2>Requests</h2>
  <p class="changelog-date">August 25, 2026 · 12:17 PM – 12:35 PM</p>
  <ul>
    <li>Sponsor on the Submit a Request &gt; Project Request form is now a search-and-pick individual picker, the same pattern used elsewhere in the app, instead of a free-text field.</li>
    <li>A PMO Admin can now set Delivery Methodology (Agile/Waterfall/Hybrid) in the "Finalize before approving" section when reviewing a request -- previously a project created this way always landed with no methodology set at all. It's optional, not required, so it doesn't block approving a request when it isn't known yet.</li>
    <li>Financial fields (value type, dollar estimate, frequency, confidence) are no longer required for an admin to submit a project request -- they're shown since admins have financial-view permission, but leaving them blank no longer blocks submission.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-20-import-work-requests">
  <h2>Import Work Requests</h2>
  <p class="changelog-date">August 20, 2026 · 10:40 AM</p>
  <ul>
    <li>Added a new admin-only "Import Work Requests" page under Data Tools, matching the existing Import Projects pattern: download a template, fill it in, upload it, review a per-row validation preview, then commit.</li>
    <li>This is a backfill tool for work that's already underway or finished, so it skips the New &rarr; Accept negotiation entirely -- every imported row lands directly in Accepted or Complete status. Columns: Title, Description, Requester Email, Assignee Email, Requested Completion Date, and Status (Accepted/Complete, defaults to Accepted).</li>
    <li>Since acceptance is assumed, the requested completion date doubles as the committed/estimated completion date -- there's no separate negotiated-date field.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-20-work-requests">
  <h2>Work Requests</h2>
  <p class="changelog-date">August 20, 2026 · 10:40 AM</p>
  <ul>
    <li>A requester can now mark their own Accepted work request complete (with an optional closing note), not just the assignee -- useful when the person doing the work isn't in the habit of logging in to update status themselves.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-19-todo">
  <h2>To-Do</h2>
  <p class="changelog-date">August 19, 2026 · 2:00 PM – 2:10 PM</p>
  <ul>
    <li>Added a new To-Do tab to every project: a lightweight list for action items, follow-ups, access requests, and reminders -- title, description, an individual assignee, a due date, and a simple Open/Done status, with comments and a change log. No hierarchy, scheduling, or checklist.</li>
    <li>My Tasks gained a top-level Plan/To-Do tab selector, each with its own Open/Completed sub-tabs, so every to-do assigned to someone shows up in their personal view the same way Plan tasks already do. The sidebar's My Tasks badge count now includes open to-dos too.</li>
    <li>Marking a to-do done now prompts for an optional closing comment, the same as Plan tasks.</li>
    <li>Creating, editing, and deleting a to-do is owner/admin-only; the assignee can always toggle their own to-do done/open.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-19-plan">
  <h2>Plan</h2>
  <p class="changelog-date">August 19, 2026 · 2:00 PM</p>
  <ul>
    <li>The project's Tasks tab is renamed to Plan -- same functionality (hierarchy, dependencies, duration, baselines), display-only rename to make room for the new To-Do tab alongside it.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-19-team">
  <h2>Team</h2>
  <p class="changelog-date">August 19, 2026 · 11:22 AM – 11:24 AM</p>
  <ul>
    <li>The "Add a team member" picker on a project's Team tab gained an Individuals/Teams selector (matching the Resources and Capacity pages), so a Team-type resource can be added to a project's team directly, not just individuals.</li>
    <li>A team's manager now shows next to its name on the Team tab, both in the current team list and in the add-member picker, whenever that team has a manager set.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-19-help-documentation-3">
  <h2>Help Documentation</h2>
  <p class="changelog-date">August 19, 2026 · 10:46 AM – 10:50 AM</p>
  <ul>
    <li>Added this Changelog page: a dated, searchable log of feature and fix changes, titled by the app area each entry changed.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-19-tasks">
  <h2>Tasks</h2>
  <p class="changelog-date">August 19, 2026 · 10:05 AM – 10:29 AM</p>
  <ul>
    <li>Added an On Hold status alongside To Do, In Progress, and Done.</li>
    <li>Added task dependencies (Finish-to-Start, one predecessor per task) with a working-day Duration field; a summary task's Start/End now roll up automatically from its subtasks.</li>
    <li>Added versioned baselines — "Set baseline" snapshots every task's current dates, and the timeline can compare against any saved baseline with a ghost bar.</li>
    <li>"Depends on" is now a search-as-you-type picker instead of a plain dropdown; the "Compare to baseline" dropdown moved to the top-right of the timeline.</li>
    <li>Adding a task now keeps the previous task's indentation level; fixed spacing between the Add task and Timeline buttons.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-18-tags">
  <h2>Tags</h2>
  <p class="changelog-date">August 18, 2026 · 4:11 PM</p>
  <ul>
    <li>Fixed a bug where tag saves on Resources, Projects, and Tasks could silently fail — and still show a "Tags updated" success message — while viewing as another user. This had been quietly breaking tag-based team-member recommendations.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-17-work-requests">
  <h2>Work Requests</h2>
  <p class="changelog-date">August 17, 2026 · 12:27 PM – 4:42 PM</p>
  <ul>
    <li>Added the Work Requests feature: submit, track, and manage lightweight requests separately from full project requests.</li>
    <li>Restructured navigation between Submit a Request and My Requests.</li>
    <li>Added a requested completion date, plus a sortable/filterable My Requests table.</li>
    <li>Added search, sort, and filter to the admin Work Requests page.</li>
    <li>Added reassign/send-back from Accepted, a completion note, and clearer My Work Requests tabs.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-17-late-items">
  <h2>Late Items</h2>
  <p class="changelog-date">August 17, 2026 · 3:11 PM – 3:38 PM</p>
  <ul>
    <li>Introduced a shared "Late" badge concept across projects, tasks, milestones, and work requests.</li>
    <li>Fixed icon/text spacing in the Late badge.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-17-manage-users-1">
  <h2>Manage Users</h2>
  <p class="changelog-date">August 17, 2026 · 5:15 PM</p>
  <ul>
    <li>Added search, sort, and Active/Deactivated tabs.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-17-help-documentation-1">
  <h2>Help Documentation</h2>
  <p class="changelog-date">August 17, 2026 · 5:07 PM</p>
  <ul>
    <li>Made the docs site navigable: added a sidebar table of contents, search, and lifecycle diagrams.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-14-deleted-items">
  <h2>Deleted Items</h2>
  <p class="changelog-date">August 14, 2026 · 10:53 AM – 11:40 AM</p>
  <ul>
    <li>Added soft delete plus a new Deleted Items admin page, with view and restore built in.</li>
    <li>Added search to Deleted Items.</li>
    <li>Fixed the All Projects list to keep its scroll position after selecting a row.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-13-manage-users-2">
  <h2>Manage Users</h2>
  <p class="changelog-date">August 13, 2026 · 2:21 PM – 2:42 PM</p>
  <ul>
    <li>Added last login and per-user activity history.</li>
    <li>Replaced the Auth-based "Last login" value with a real Last Active timestamp, and fixed a bug where it never actually updated.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-13-dashboard">
  <h2>Dashboard</h2>
  <p class="changelog-date">August 13, 2026 · 2:04 PM</p>
  <ul>
    <li>A project's tags now show underneath its name.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-13-tasks">
  <h2>Tasks</h2>
  <p class="changelog-date">August 13, 2026 · 11:22 AM – 1:41 PM</p>
  <ul>
    <li>Major rework: tasks are unassigned by default, and gained checklists, start/end dates with a timeline, tags, and an expandable extended description.</li>
    <li>Added task hierarchy (parent/child), drag-to-reorder, and consolidated row actions into a single menu.</li>
    <li>Replaced the Done button with a circle/checkmark toggle, right-aligned row actions, and brought My Tasks to parity with the project Tasks view.</li>
    <li>The timeline now mirrors the list exactly, including task IDs; an end date before the start date is now rejected.</li>
    <li>Fixed a stale My Tasks sidebar badge count.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-12-raid-log">
  <h2>RAID Log</h2>
  <p class="changelog-date">August 12, 2026 · 9:29 AM</p>
  <ul>
    <li>Replaced the "add member" owner prompt with a search-and-pick panel.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-12-prioritize-backlog-1">
  <h2>Prioritize Backlog</h2>
  <p class="changelog-date">August 12, 2026 · 10:10 AM – 10:52 AM</p>
  <ul>
    <li>Default Priority is now "Needs prioritization" instead of "Critical".</li>
    <li>Fixed estimated frequency getting discarded when no opportunity type was set.</li>
    <li>Added value frequency and confidence to the display.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-12-my-projects">
  <h2>My Projects</h2>
  <p class="changelog-date">August 12, 2026 · 11:23 AM – 11:28 AM</p>
  <ul>
    <li>Split into role-based tabs.</li>
    <li>Tabs with no projects in them are now hidden instead of showing empty.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-12-projects-1">
  <h2>Projects</h2>
  <p class="changelog-date">August 12, 2026 · 1:16 PM – 2:26 PM</p>
  <ul>
    <li>Added a "Health not set" state instead of defaulting every project to green.</li>
    <li>Removed the unused Sponsor Email field.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-12-programs-1">
  <h2>Programs</h2>
  <p class="changelog-date">August 12, 2026 · 3:34 PM – 4:02 PM</p>
  <ul>
    <li>Added Programs — a grouping layer over projects — with their own detail page grouped by stage, and list search/sort.</li>
    <li>A project now shows its Program on the Overview tab.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-11-prioritize-backlog-2">
  <h2>Prioritize Backlog</h2>
  <p class="changelog-date">August 11, 2026 · 1:55 PM – 4:30 PM</p>
  <ul>
    <li>Collapsed to a single global ranking.</li>
    <li>Added collapsible sections and a search box.</li>
    <li>Priority ranks now persist immediately, flag manual overrides, and can be reset; added Undo for the most recent ranking move.</li>
    <li>Documented the ranking and matrix logic in-app.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-11-projects-2">
  <h2>Projects</h2>
  <p class="changelog-date">August 11, 2026 · 2:48 PM – 3:30 PM</p>
  <ul>
    <li>Project sponsors now link to a resource, with a sponsor financial view.</li>
    <li>Sponsored projects show up in My Projects, tagged as Sponsor.</li>
    <li>All Projects bulk edit now uses the sponsor resource picker.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-11-navigation">
  <h2>Navigation</h2>
  <p class="changelog-date">August 11, 2026 · 3:51 PM – 4:47 PM</p>
  <ul>
    <li>Nav sections now default to collapsed, with an expand/collapse-all control and an anchored sidebar footer.</li>
    <li>Reordered nav sections and folded Intake's Requests into Projects.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-10-prioritize-backlog-3">
  <h2>Prioritize Backlog</h2>
  <p class="changelog-date">August 10, 2026 · 3:53 PM</p>
  <ul>
    <li>New page: a value/effort matrix plus a drag-to-reorder ranked list.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-10-all-projects">
  <h2>All Projects</h2>
  <p class="changelog-date">August 10, 2026 · 4:07 PM – 4:41 PM</p>
  <ul>
    <li>Extended bulk edit with sizing and financial fields.</li>
    <li>Moved the New Project button here from Active.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-10-export-projects">
  <h2>Export Projects</h2>
  <p class="changelog-date">August 10, 2026 · 4:19 PM – 4:29 PM</p>
  <ul>
    <li>New admin tool: one-click Excel export of every project's scalar fields.</li>
    <li>Export now includes priority rank columns.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-10-capacity">
  <h2>Capacity</h2>
  <p class="changelog-date">August 10, 2026 · 5:39 PM</p>
  <ul>
    <li>Replaced manual capacity % entry with a resource capacity timeline.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-10-resources">
  <h2>Resources</h2>
  <p class="changelog-date">August 10, 2026 · 5:46 PM – 5:53 PM</p>
  <ul>
    <li>Removed the Total resources tile.</li>
    <li>Resources and Capacity pages are now restricted to admins only.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-08-10-help-documentation-2">
  <h2>Help Documentation</h2>
  <p class="changelog-date">August 10, 2026 · 6:13 PM – 6:20 PM</p>
  <ul>
    <li>Added the hosted user and admin documentation site.</li>
    <li>Minor visual polish: removed the underline from button links.</li>
  </ul>
</div>

</div>

<p class="changelog-note" id="changelog-empty" hidden>No matching entries.</p>

<script>
(function () {
  var input = document.getElementById('changelog-search-input');
  var entries = Array.prototype.slice.call(document.querySelectorAll('.changelog-entry'));
  var countEl = document.getElementById('changelog-count');
  var emptyEl = document.getElementById('changelog-empty');
  var total = entries.length;

  function render(query) {
    var q = query.trim().toLowerCase();
    var shown = 0;
    entries.forEach(function (entry) {
      var match = !q || entry.textContent.toLowerCase().indexOf(q) >= 0;
      entry.hidden = !match;
      if (match) shown++;
    });
    countEl.textContent = q ? ('Showing ' + shown + ' of ' + total) : (total + ' changes');
    emptyEl.hidden = shown !== 0;
  }

  if (input) {
    input.addEventListener('input', function () { render(input.value); });
    render('');
  }
})();
</script>
