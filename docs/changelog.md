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

<div class="changelog-entry" id="cl-2026-09-23">
  <h2>Structured Blockers; Information tab: one Edit button; filter/timeline additions</h2>
  <p class="changelog-date">September 23, 2026</p>
  <ul>
    <li>The <strong>Portfolio</strong> page's filter bar now includes <strong>Commitment</strong>, alongside the existing Category/Stage/Owner/Tag filters — narrow any Value Area section down to just its Must, Should, Want, Won't, or Needs-commitment projects.</li>
    <li>The <strong>Commitment Review</strong> page's <strong>Should</strong> tab now has the same Checklist/Timeline toggle as Must — a roadmap-style timeline of scheduled Should projects, with undated ones broken out separately.</li>
    <li><strong>Roadmap</strong> and <strong>Future Planning</strong> both gain a <strong>Filter by commitment</strong> button, next to their existing Filter by tag button. Future Planning didn't have a tag filter before now — it does, matching Roadmap.</li>
    <li>A project's <strong>Blockers</strong> are no longer a single free-text field — each blocker is now its own tracked item with a title, reason (picklist), blocked-since and target-resolution dates, an owner, an escalation flag, its own comment thread, and a change log. Lives on a new <strong>Documentation &gt; Blockers</strong> sub-tab, with Open/Resolved views and quick Mark resolved/Reopen actions. <strong>Progress &amp; Health</strong> now shows an open-blocker summary with a <strong>View blockers</strong> button instead of the old text field, and the Executive Summary card, a linked project's mini summary on request review, and My Projects' Blockers column all reflect the new open-blocker count. Existing free-text blockers were carried over automatically into individual records, so nothing already on record was lost.</li>
    <li><strong>Home</strong>: an open blocker assigned to you now shows up under Needs Your Attention, the same way assigned RAID items already do.</li>
    <li><strong>Fixed:</strong> a long title in a Needs Your Attention card (a work request, a blocker, a to-do) could overflow the card instead of wrapping, since the main content area had no minimum-width guard against a flex layout quirk.</li>
    <li><strong>Fixed:</strong> the "New work request assigned to you" card on Home showed a blank icon instead of the clipboard icon used everywhere else for work requests.</li>
    <li>A project's <strong>Information</strong> tab now has a single <strong>Edit</strong> button, pinned above the section nav so it's visible no matter which section you've scrolled to, instead of five separate Edit buttons scattered down the page. Clicking it puts every section you have permission to edit into its form at once — Financials only joins in if you separately have financial-view permission — and one <strong>Save</strong> writes all of it together. <strong>Delete project</strong> moved to the same spot.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-22">
  <h2>Added: Commitment Portfolio Review page</h2>
  <p class="changelog-date">September 22, 2026</p>
  <ul>
    <li>New admin-only <strong>Commitment Review</strong> page under Overview, built for prepping and running an Executive Committee portfolio call: an Overview tab with completeness stats across tiers; a <strong>Must</strong> tab with a sortable data-verification checklist plus a roadmap-style timeline of scheduled Must projects; a <strong>Should</strong> tab for assigning owners/dates and re-triaging commitment, with a "show only incomplete" filter; and a lightweight <strong>Want/Won't</strong> discussion view. Every project's expandable detail panel, across all three tiers, includes a team viewer with an add/remove picker.</li>
    <li>Every field edited here — owner, start/end dates, Commitment, team membership — writes straight to the same project record the rest of the app uses and goes through the normal change-log audit trail, so nothing is a separate draft that needs re-entering later.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-21">
  <h2>Fixed: request self-edit permissions, more line-break display gaps</h2>
  <p class="changelog-date">September 21, 2026</p>
  <ul>
    <li><strong>Fixed:</strong> a submitter editing their own pending request (title, description, value, etc. — not the Revoke action) could hit "Could not save: new row violates row-level security policy for table 'requests'" and lose nothing, but also save nothing. The underlying database policy had only ever allowed a submitter's self-edit to go through if it revoked the request; a general content edit while it stayed Pending was silently blocked. Fixed at the database level — an admin's permissions are unchanged, and a submitter still can't set a request to anything other than Pending or Revoked themselves.</li>
    <li><strong>Fixed:</strong> a few more spots where a multi-paragraph description rendered as a run-on wall of text instead of preserving line breaks — the request review screen's Description and value-justification fields (the one reported), the Executive Summary card's blocker note and exec note, a project's own blocker note, and the Deleted Items RAID preview. The Summarize tab's emailed/PDF report needed a different fix (real &lt;br&gt; tags instead of CSS), since that renderer avoids styling that Outlook's rendering engine doesn't reliably honor.</li>
    <li>Documentation's <strong>Scope</strong> tab now splits into <strong>In Scope</strong> and <strong>Out of Scope</strong>. In Scope works exactly as Scope always has; Out of Scope drops the status workflow entirely — an item there is simply excluded, with an optional note on why. A single Add button above the two tabs targets whichever one is open, and a toggle in the add/edit form lets you reclassify an item between the two. Every existing Scope item defaulted to In Scope, so nothing already tracked changed meaning.</li>
    <li>A Risk's <strong>Probability</strong> is now High/Medium/Low, matching its Impact rating, instead of a 0&ndash;100% number. Existing risks converted automatically using the same thresholds the app's own severity calculation already used, so no risk's computed severity changed as a result.</li>
    <li><strong>Fixed:</strong> a RAID risk or issue with no owner set displayed the literal word "null" instead of appearing blank.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-17">
  <h2>Home: flag projects that need data confirmed</h2>
  <p class="changelog-date">September 17, 2026</p>
  <ul>
    <li>An <strong>Active</strong> project you own that hasn't had its data confirmed within the admin-set threshold now shows up under Needs your attention on your Home page — the same check that already drives the Reminders "needs confirmation" flag, so the two stay consistent.</li>
    <li><strong>Fixed:</strong> clearing an Active project's dates (or leaving it with a not-yet-started range) didn't move it back to Backlog/Planned the way entering real dates already promotes a Backlog/Planned project forward. An Active project that's simply running past its end date is unaffected — that's normal lateness, not a reason to change its stage.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-16">
  <h2>Reminders: late milestones, richer flagged-item detail; inactive resources</h2>
  <p class="changelog-date">September 16, 2026</p>
  <ul>
    <li><strong>Late milestones</strong> are now a flag type on the Reminders page, alongside late projects/tasks/work requests and stale data confirmations. A milestone has no assignee of its own, so a late one is attributed to whoever owns its project.</li>
    <li>Expanding a person's row now shows a lot more per flagged item: a type badge (Project/Task/Milestone/Work request/Confirmation), its project where relevant, its due date, and how many days late it is — instead of a single ambiguous tag. Stale confirmations show days since last confirmed instead, since they don't have a due date.</li>
    <li>The stale data confirmation flag now only applies to <strong>Active</strong>-stage projects — a Backlog, Planned, Hold, or Complete project no longer gets flagged for needing reconfirmation, on Reminders, the Resources flag count, or the "Needs review" badge on its own Information tab.</li>
    <li>Resources can now be flagged <strong>Inactive — no longer with the organization</strong>. They drop out of pickers for new assignments (Sponsor, Owner, Requirements Owner, task/to-do assignee, RAID owner, "add a team member"), but anything already assigned to them is untouched and now shows an inline <strong>Inactive</strong> badge next to their name everywhere it appears. A new <strong>Needs reassignment</strong> flag on Reminders rolls up any open work still sitting with an inactive person, attributed to the project owner. Admins can still add an inactive person to a project's team directly, for entering a project retroactively.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-14">
  <h2>Replaced Priority with Commitment</h2>
  <p class="changelog-date">September 14, 2026</p>
  <ul>
    <li>The old Priority field (Critical/High/Medium/Low/Needs prioritization) is retired — its data had drifted to the point that most projects were just sitting at "Needs prioritization," with no real signal behind it. In its place: <strong>Commitment</strong> (Must/Should/Want), visible to everyone but set by admins only, defaulting to "Needs commitment" rather than silently reading as low priority. Every project starts unset — nothing was carried over from the old field.</li>
    <li>Commitment shows everywhere Priority used to (Portfolio lists, My Projects, Completed, a project's Information tab, project headers, Summarize, Export, Deleted Items), is filterable/sortable, and can be bulk-edited from <strong>All Projects</strong>.</li>
    <li>The Requests review screen's old required "Priority" field — which hadn't actually flowed into the created project for a while — is now an optional Commitment picker that does.</li>
    <li>Prioritize Backlog, Future Planning, and Roadmap are unchanged for now; wiring Commitment into those views is a deliberate next step, not part of this change.</li>
    <li><strong>Fixed:</strong> a bug introduced by the above — approving a request could silently fail to close the review window after creating the project, so clicking Approve again created another full duplicate project from the same request. Both decision buttons now lock immediately once a decision starts saving.</li>
    <li>Added a fourth Commitment value, <strong>Won't</strong> — for the popular idea that keeps coming up but doesn't hold up on its own merits, distinct from "Needs commitment" (nobody's decided yet).</li>
    <li><strong>Fixed:</strong> Commitment was rendering as an always-editable dropdown for admins regardless of whether Identity & Classification was actually in edit mode. It now only becomes editable when Edit is clicked and the viewer is an admin; everyone else always sees the read-only badge.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-11">
  <h2>Fixed View As showing the admin's own requests</h2>
  <p class="changelog-date">September 11, 2026</p>
  <ul>
    <li><strong>Fixed:</strong> using View As to preview a specific person showed the admin's own Project Requests and Work Requests on My Requests, instead of the previewed person's — along with a few related spots (the "Needs Info" badge, a Home attention notification, and global search's work-request scoping) that had the same underlying issue.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-10">
  <h2>Fixed a date-display bug in Summarize, plus line breaks in long text</h2>
  <p class="changelog-date">September 10, 2026</p>
  <ul>
    <li><strong>Fixed:</strong> the Summarize tab's generated report could show milestone and reporting-period dates one day earlier than the actual stored date (for anyone in a US timezone). Information and Milestones were never affected — this was purely a display bug in how the report formatted dates, not a problem with the dates themselves.</li>
    <li><strong>Fixed:</strong> line breaks in task/to-do descriptions, RAID descriptions and mitigation/solution, requirement and scope descriptions, decision rationale, meeting recaps, project and work request descriptions, value justification, and PMO/rejection feedback were being collapsed onto one line when displayed, even though they were saved correctly. Comments already handled this right; every other long-text field now matches.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-09">
  <h2>Reminders, Home &amp; RAID</h2>
  <p class="changelog-date">September 9, 2026</p>
  <ul>
    <li>New admin-only <strong>Reminders</strong> page — flags anyone with a late project they own, a late task or work request assigned to them, or an owned project whose data hasn't been confirmed in a while. Sortable by person or by how long since their last reminder, defaulting to the most overdue first, with filter chips including a "Due for a nudge" shortcut — the same search and filters also narrow the no-linked-account section below. Expanding a row shows the actual late items, each one a link straight to it. Two thresholds (days since confirmed, days since last reminded) are now admin-editable from the page instead of hardcoded.</li>
    <li><strong>Log reminder</strong> records who you reached out to, when, and how (Email, Teams, Phone, In person, Other) — every person's history is shown before you log another, so it's easy to avoid double-reminding. Resources with the same flags but no PMO Hub login get their own section, since a reminder for them is just your own record of reaching out some other way.</li>
    <li><strong>Manage Users:</strong> new Reminders column showing each user's current flags and when they were last reminded. <strong>Resources:</strong> a small flags badge next to the existing linked/unlinked icon for any project they own that's late or unconfirmed.</li>
    <li><strong>Home:</strong> Needs your attention now also surfaces open <strong>Risks</strong> and <strong>Dependencies</strong> assigned to you personally on any project, not just Issues (Assumptions are skipped — they have no real "open" state).</li>
    <li><strong>RAID:</strong> Risks now have an optional free-form <strong>Impact description</strong> field, the same idea as the one Issues already had — separate from a Risk's existing High/Medium/Low Impact rating.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-08">
  <h2>Plan tab fixes, Import Projects cleanup &amp; a navigation bug</h2>
  <p class="changelog-date">September 8, 2026</p>
  <ul>
    <li>Toggling a task's action menu (or its comments, description, or change log) on the project detail page no longer jumps you back to the top of the tab — your scroll position is preserved.</li>
    <li>Fixed <strong>Demote</strong> on Plan tasks: it now moves a task exactly one level deeper, becoming a child of the nearest task at its own level, instead of sometimes attaching it as a child of a task that was already nested deeper.</li>
    <li><strong>Import Projects:</strong> Sponsor is now a "Sponsor Email" column that links to a resource on match, the same as Owner Email already did, instead of storing a free-text name with no linkage. Priority validation now recognizes "Needs prioritization." The Business Unit dropdown was updated to the current Manage Values list. Target Quarter/Target Year are no longer part of the import — set those afterward from Future Planning if needed. Stage is now derived from Start Date/Target End Date like the rest of the app; the column only accepts an explicit Hold or Complete override, and a Complete row gets its progress and completed date set automatically, matching Mark complete.</li>
    <li><strong>Fixed:</strong> creating a project with <strong>New project</strong>, or approving a project request, could leave the whole app unable to navigate anywhere — clicking into any project, from search, the sidebar, or a list, silently did nothing until the page was reloaded. Both flows now reload the new project from the database instead of building it by hand in the browser, which had been falling out of sync with what every other project actually looks like.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-03">
  <h2>Portfolio, Project Detail, Summarize &amp; Documentation</h2>
  <p class="changelog-date">September 3, 2026 · 9:40 AM – 4:40 PM</p>
  <ul>
    <li><strong>Portfolio:</strong> Project tags now show as chips under the project name, same as the Completed projects page.</li>
    <li>The admin-only <strong>Delete</strong> project button moved from the People tab to Information → Identity &amp; Classification, next to that section's Edit button.</li>
    <li>New <strong>Summarize</strong> tab on the project detail page — generates a live, stakeholder-ready status report from the project's current data (stage/status/priority, owner/sponsor/target end, progress, recently-completed and upcoming milestones, Requirements/Scope/Plan completion, open RAID risks/issues by severity), with three optional narrative fields (Executive Summary, Asks &amp; Decisions Needed, What's Next) that autosave with no history kept. No financial data is included. <strong>Copy for email</strong> copies a formatted version that pastes cleanly into Outlook via Paste Special → Keep Source Formatting, and <strong>Download PDF</strong> uses the browser's print dialog.</li>
    <li><strong>Documentation:</strong> Two new sections — <strong>Decisions</strong>, a simple log (decision, optional rationale, who decided it, and the date, with no status workflow), and <strong>Meeting Minutes</strong>, a searchable list of meeting notes (title, date/time, attendees picked from the resource roster, and a recap). "Decided by" on a decision is an optional picker over the resource roster, not free text.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-02">
  <h2>Roadmap, Executive Summary, Programs, Data Confirmation &amp; Sponsor Permissions</h2>
  <p class="changelog-date">September 2, 2026 · 9:15 AM – 4:10 PM</p>
  <ul>
    <li><strong>Roadmap:</strong> An Active or Planned project whose target end date has already passed now shows a red "Late by N days — target end [date]" indicator in its timeline row, instead of the misleading "No schedule set" (it does have a schedule — it's just overdue). A project with real dates entirely in the future, outside the visible window, now says "Outside this range" instead, matching the Plan tab's own timeline wording.</li>
    <li>New admin-only <strong>Executive Summary</strong> page — lists only projects flagged for it, one focused card each (health/stage/status, owner, sponsor, target end, progress, current blocker, open RAID counts, and an optional discussion note). Flag a project from a new admin-only <strong>Executive Review</strong> section on its Information tab; nobody else can see or set the flag. A first pass while the team works out what should roll up at that level — for now it's deliberately just the flagged projects' own data, no aggregation.</li>
    <li>A project's <strong>Sponsor</strong> now gets the same edit rights its <strong>Owner</strong> already has — Milestones, Plan, RAID, To-Do, Documentation, Requirements/Scope, Team, Information tab fields, and stage changes (put on hold, resume, mark complete). Financial edit rights are unchanged, since a project's sponsor already had those.</li>
    <li>New <strong>"Confirm still accurate"</strong> action on a project's Information tab (System &amp; Audit) — logs who checked a project's data and when, with an optional note, without changing any fields. A header badge shows freshness (green if recent, amber "needs review" once it's been over 60 days, neutral if never confirmed). Editing any of the project's own fields counts as a confirmation too, since fixing something is itself a way of validating it — confirmations show up alongside real edits in the Change Log, visually distinct from a field change.</li>
    <li><strong>Programs:</strong> Program Sponsor and Business Owner now get the same program-management rights Program Manager already had — adding/removing linked projects, editing program name/description/objective. Reassigning who holds Sponsor, Manager, or Business Owner stays admin-only.</li>
    <li><strong>Programs:</strong> A program's Linked projects list now supports drag-and-drop priority ordering, settable by the Sponsor, Manager, or Business Owner — a rank pill shows next to any project that's been given an order, and the edit view turns the list into a single drag-orderable list to set it.</li>
  </ul>
</div>

<div class="changelog-entry" id="cl-2026-09-01">
  <h2>My Projects, Documentation, RAID log &amp; Portfolio</h2>
  <p class="changelog-date">September 1, 2026 · 8:50 AM – 5:20 PM</p>
  <ul>
    <li><strong>Portfolio:</strong> Added an Owner filter, alongside the existing Category, Stage, and Tag filters.</li>
    <li><strong>RAID log:</strong> Issues now have an optional free-form <strong>Impact</strong> field, describing what happens if the issue isn't resolved — separate from Risk's existing Impact (High/Medium/Low).</li>
    <li><strong>Home:</strong> "Needs your attention" now also lists any open RAID issue assigned to you personally, on any project — not just high-severity issues on projects you own (that existing entry is unchanged, and the two are deduped so the same issue never shows twice).</li>
    <li><strong>RAID log &amp; Documentation:</strong> Each item in the left-hand sub-nav now shows a count badge for its open items (not at a terminal status — Closed for risks/issues, Resolved for dependencies, Completed/Deferred/Cancelled for requirements/scope). Attachments has no status concept, so it has no badge.</li>
    <li><strong>RAID log:</strong> Now a left-hand sub-nav split into Risks, Assumptions, Issues, and Dependencies, styled like the Information and Documentation tabs — one section at a time instead of all four stacked on a single scrolling page. Search, add, edit/delete, and change-log all work the same, just scoped to whichever section is active.</li>
    <li><strong>Documentation tab:</strong> Split into three sections behind a left-hand sub-nav, styled like the Information tab's — <strong>Requirements</strong> and <strong>Scope</strong> (new: add individual items, track status through Planned, In Progress, Completed, Deferred, or Cancelled, with an auto-tracked completed date, comments, and a change log — same interaction pattern as To-Do), and <strong>Attachments</strong> (the existing document/link structure, with the "Document type" field and the "still needed" banner removed — that list wasn't fully baked and will return with real templates later). A project's <strong>Requirements Owner</strong> can add and manage Requirements and Scope items, in addition to the project owner, admin, and program manager. Along the way, fixed a bug where To-Do change-log entries weren't actually being saved to the database.</li>
    <li><strong>My Projects:</strong> Every tab (Sponsor, Owner: Active, Owner: Not Started, Contributor, Completed) is now the same searchable, sortable table instead of cards, with column filters on Status, Stage, Priority, and Owner. The Value area column was replaced with Priority.</li>
    <li><strong>Backlog, Planned, Prioritize Backlog:</strong> The description at the top of each page no longer looks like a warning — switched from a colored banner to plain text, and reworded Backlog/Planned to be informative rather than directive (e.g. "They'll move to Planned once a start date is assigned" instead of "Assign a start date"), since most readers of those pages can't take that action themselves. Portfolio Health's "how this works" note got the same banner-to-plain-text treatment.</li>
    <li><strong>Home:</strong> Removed the Rejected proposals section — it wasn't shown anywhere else in the app, so this retires that browsing view.</li>
    <li><strong>Documentation site:</strong> The home page no longer shows an empty "On this page & search" sidebar (it had no headings to list). Added a Light/System/Dark theme toggle, matching the app's own.</li>
    <li>New <strong>Summary</strong> page under Overview, visible to everyone — a read-only, portfolio-wide "what's going on" pulse: stage funnel, active-project breakdowns by category and status, recently completed/kicked-off projects, an On Hold list, and upcoming milestones. Every component drills into a page or project any Member can already reach — no financial data, no new permissions.</li>
    <li>Scrollbars now follow <strong>dark mode</strong> too, instead of showing the browser's default light track/thumb on a dark page.</li>
    <li><strong>Portfolio:</strong> Replaced the 2-column, description-heavy card grid with a compact, collapsible table per Value Area (health, name, category, stage, progress, owner, due) — a Collapse/Expand-all shortcut, plus new Category and Stage filters alongside the existing tag filter. Description and estimated cost are gone from the row (cost was previously visible to everyone regardless of financial-view permission).</li>
    <li><strong>Programs:</strong> A program's detail page no longer permanently renders as a live edit form for anyone who can edit it — <strong>View</strong> is now the default (read-only About card, a new stats strip covering linked/active project counts, a RAG mini-bar, average progress, late and on-hold counts, plus a richer linked-projects list and an <strong>Upcoming &amp; late milestones</strong> list across every linked project), with an explicit <strong>Edit</strong> button that swaps in the form. The Programs list shows avatar initials for each role and a RAG-dot project-count pill.</li>
    <li><strong>Home:</strong> "Needs your attention" now flags overdue milestones on projects you own, alongside late projects and open high-severity RAID items. <strong>Projects you sponsor</strong> swapped Estimated value/Cost estimate/Edit financials for Owner, T-shirt Size, Stage, and Progress — financial editing is still available from the project's own Information tab.</li>
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
