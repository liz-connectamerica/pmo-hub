---
layout: page
title: Changelog
permalink: /changelog/
---

A dated log of feature and fix changes to PMO Hub, newest first. Each entry is titled by the area of the app it changed. Use the search box below to filter by keyword (area name, feature, or anything in the description).


<div class="changelog-search">
  <input type="search" id="changelog-search-input" placeholder="Search changes… (e.g. &quot;tasks&quot;, &quot;baseline&quot;, &quot;sponsor&quot;)" autocomplete="off" aria-label="Search the changelog">
  <div class="changelog-count" id="changelog-count"></div>
</div>

<div id="changelog-list">

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
