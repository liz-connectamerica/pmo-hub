// ── Supabase connection ───────────────────────────────────────────────────────
var SUPABASE_URL = 'https://bnzrhmjhfnqfekrkjghh.supabase.co';
var SUPABASE_KEY = 'sb_publishable_2R6cXaudHMWLBFY3DA_RGg_4yeL7Wky';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// "View as" is a client-side simulation only — the real Supabase session never
// changes, so a write attempted while viewing as someone else would still be
// evaluated (and attributed) under the admin's own real identity, not the
// simulated one. To avoid any misattributed or incorrectly-permitted writes,
// every mutating call is blocked outright whenever a simulation is active.
(function() {
  var realFrom = sb.from.bind(sb);
  sb.from = function(table) {
    var builder = realFrom(table);
    if (!D.viewingAsMode) return builder;
    ['insert', 'update', 'delete', 'upsert'].forEach(function(method) {
      if (typeof builder[method] !== 'function') return;
      builder[method] = function() {
        showToast('Actions are disabled while viewing as another user');
        var blocked = {
          select: function(){ return blocked; },
          eq: function(){ return blocked; },
          single: function(){ return Promise.resolve({ data: null, error: { message: 'Blocked: read-only while viewing as another user' } }); },
          then: function(resolve){ resolve({ data: null, error: { message: 'Blocked: read-only while viewing as another user' } }); }
        };
        return blocked;
      };
    });
    return builder;
  };
})();

// ── Real data loading ─────────────────────────────────────────────────────────
// Fetches everything project-related from Supabase and reshapes it into the
// same in-memory shape the rest of the app already expects (D.projects), so
// the existing render code needs minimal changes. Each project keeps both a
// display name (e.g. p.owner) and, where it matters for permissions, a real
// linked account id (e.g. p.ownerId) alongside it.

function ymd(isoString) {
  if (!isoString) return null;
  return isoString.split('T')[0];
}

function groupBy(rows, key) {
  var out = {};
  (rows || []).forEach(function(row) {
    var k = row[key];
    if (!out[k]) out[k] = [];
    out[k].push(row);
  });
  return out;
}

function mapLog(rows) {
  return (rows || []).map(function(r){
    return { date: ymd(r.logged_at), actor: r.actor_name, action: r.action, detail: r.detail || '' };
  });
}

async function loadRequests() {
  var results = await Promise.all([
    sb.from('requests').select('*').is('deleted_at', null),
    sb.from('request_tags').select('*'),
    sb.from('request_team').select('*'),
    sb.from('tags').select('id, name'),
    sb.from('resources').select('id, name')
  ]);
  for (var i = 0; i < results.length; i++) {
    if (results[i].error) { console.error('loadRequests query failed:', results[i].error); return []; }
  }
  var requestRows = results[0].data || [];
  var reqTagRows = results[1].data || [];
  var reqTeamRows = results[2].data || [];
  var tagNameById = {}; (results[3].data || []).forEach(function(t){ tagNameById[t.id] = t.name; });
  var resourceNameById = {}; (results[4].data || []).forEach(function(r){ resourceNameById[r.id] = r.name; });
  var tagsByRequest = groupBy(reqTagRows, 'request_id');
  var teamByRequest = groupBy(reqTeamRows, 'request_id');

  return requestRows.map(function(r) {
    return {
      id: r.id, title: r.title, submitter: r.submitter_name, submitterId: r.submitter_id,
      dept: r.dept, date: r.submitted_at, status: r.status, priority: r.priority,
      value: r.value_area, impact: r.impact, description: r.description,
      effort: r.effort, cost: r.cost, feedback: r.feedback,
      linkedProject: r.linked_project, rejectedDate: r.rejected_date,
      businessUnit: r.business_unit, sponsor: r.sponsor, opportunityType: r.opportunity_type, opportunityTypeOther: r.opportunity_type_other,
      estimatedFrequency: r.estimated_frequency, estimatedType: r.estimated_type, estimatedAmount: r.estimated_amount,
      valueConfidence: r.value_confidence, costEstimate: r.cost_estimate, costConfidence: r.cost_confidence,
      valueJustification: r.value_justification, startDate: r.start_date, targetEndDate: r.target_end_date,
      editedByName: r.edited_by_name, editedAt: r.edited_at,
      tags: (tagsByRequest[r.id] || []).map(function(t){ return tagNameById[t.tag_id]; }).filter(Boolean),
      team: (teamByRequest[r.id] || []).map(function(t){ return resourceNameById[t.resource_id]; }).filter(Boolean)
    };
  });
}

async function loadWorkRequests() {
  var results = await Promise.all([
    sb.from('work_requests').select('*').is('deleted_at', null),
    sb.from('work_request_log').select('*'),
    sb.from('profiles').select('id, display_name'),
    sb.from('resources').select('id, name')
  ]);
  for (var i = 0; i < results.length; i++) {
    if (results[i].error) { console.error('loadWorkRequests query failed:', results[i].error); return []; }
  }
  var rows = results[0].data || [];
  var logRows = results[1].data || [];
  var logByWorkRequest = groupBy(logRows, 'work_request_id');
  var profileNameById = {}; (results[2].data || []).forEach(function(p){ profileNameById[p.id] = p.display_name; });
  var resourceNameById = {}; (results[3].data || []).forEach(function(r){ resourceNameById[r.id] = r.name; });

  return rows.map(function(r) {
    return {
      id: r.id, title: r.title, description: r.description,
      requesterId: r.requester_id, requesterName: profileNameById[r.requester_id] || '(no longer an account)',
      resourceId: r.resource_id, resourceName: resourceNameById[r.resource_id] || '(no longer a resource)',
      status: r.status, infoNote: r.info_note,
      estimatedHours: r.estimated_hours, estimatedCompletionDate: r.estimated_completion_date,
      requestedCompletionDate: r.requested_completion_date,
      acceptedAt: r.accepted_at, completedAt: r.completed_at, createdAt: r.created_at,
      log: mapLog(logByWorkRequest[r.id])
    };
  });
}

async function syncRequestStatus(requestId, updates) {
  if (!requestId) return;
  var r = D.requests.find(function(x){ return x.id === requestId; });
  if (!r) return;
  var dbUpdates = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.linkedProject !== undefined) dbUpdates.linked_project = updates.linkedProject;
  if (updates.feedback !== undefined) dbUpdates.feedback = updates.feedback;
  if (updates.rejectedDate !== undefined) dbUpdates.rejected_date = updates.rejectedDate;
  var result = await sb.from('requests').update(dbUpdates).eq('id', requestId);
  if (result.error) { console.error('Could not sync request status:', result.error); return; }
  Object.assign(r, updates);
}

async function loadFieldOptions() {
  var result = await sb.from('field_options').select('*');
  if (result.error) { console.error('loadFieldOptions query failed:', result.error); return; }
  var rows = result.data || [];
  function valuesFor(fieldName) {
    return rows.filter(function(r){ return r.field_name === fieldName; })
      .map(function(r){ return r.value; })
      .sort(function(a,b){ return a.localeCompare(b); });
  }
  VALUE_AREAS = valuesFor('value_area');
  BUSINESS_UNITS = valuesFor('business_unit');
  CATEGORIES = valuesFor('category');
}

async function loadTags() {
  var results = await Promise.all([
    sb.from('tags').select('*'),
    sb.from('project_tags').select('*'),
    sb.from('resource_tags').select('*'),
    sb.from('task_tags').select('*')
  ]);
  for (var i = 0; i < results.length; i++) {
    if (results[i].error) { console.error('loadTags query failed:', results[i].error); return { tags: [], projectTagsByProject: {}, resourceTagsByResource: {} }; }
  }
  var tagRows = results[0].data || [];
  var projectTagRows = results[1].data || [];
  var resourceTagRows = results[2].data || [];
  var taskTagRows = results[3].data || [];
  var nameById = {};
  tagRows.forEach(function(t){ nameById[t.id] = t.name; });
  var projectTagsByProject = groupBy(projectTagRows, 'project_id');
  var resourceTagsByResource = groupBy(resourceTagRows, 'resource_id');
  var taskTagsByTask = groupBy(taskTagRows, 'task_id');
  var projectTagNames = {};
  Object.keys(projectTagsByProject).forEach(function(pid){ projectTagNames[pid] = projectTagsByProject[pid].map(function(r){ return nameById[r.tag_id]; }).filter(Boolean); });
  var resourceTagNames = {};
  Object.keys(resourceTagsByResource).forEach(function(rid){ resourceTagNames[rid] = resourceTagsByResource[rid].map(function(r){ return nameById[r.tag_id]; }).filter(Boolean); });
  var taskTagNames = {};
  Object.keys(taskTagsByTask).forEach(function(tid){ taskTagNames[tid] = taskTagsByTask[tid].map(function(r){ return nameById[r.tag_id]; }).filter(Boolean); });
  return {
    tags: tagRows.map(function(t){ return { id: t.id, name: t.name }; }).sort(function(a,b){ return a.name.localeCompare(b.name); }),
    projectTagNames: projectTagNames,
    resourceTagNames: resourceTagNames,
    taskTagNames: taskTagNames
  };
}

async function loadResources() {
  var results = await Promise.all([
    sb.from('resources').select('*'),
    sb.from('resource_projects').select('*'),
    sb.from('resource_team_members').select('*')
  ]);
  for (var i = 0; i < results.length; i++) {
    if (results[i].error) { console.error('loadResources query failed:', results[i].error); return []; }
  }
  var resourceRows = results[0].data || [];
  var rpRows = results[1].data || [];
  var rtmRows = results[2].data || [];

  var nameById = {};
  resourceRows.forEach(function(r){ nameById[r.id] = r.name; });
  var projectsByResource = groupBy(rpRows, 'resource_id');
  var membersByTeam = groupBy(rtmRows, 'team_resource_id');
  var teamByMember = {};
  rtmRows.forEach(function(x){ teamByMember[x.member_resource_id] = x.team_resource_id; });

  return resourceRows.map(function(r) {
    var projectIds = (projectsByResource[r.id] || []).map(function(x){ return x.project_id; });
    var out = {
      id: r.id, name: r.name, role: r.title, type: r.type,
      firstName: r.first_name, lastName: r.last_name,
      projects: projectIds, email: r.email, userId: r.user_id,
      bauPercent: r.non_project_capacity
    };
    if (r.type === 'team') {
      out.members = (membersByTeam[r.id] || []).map(function(x){ return nameById[x.member_resource_id]; }).filter(Boolean);
      out.memberIds = (membersByTeam[r.id] || []).map(function(x){ return x.member_resource_id; });
      out.managerResourceId = r.manager_resource_id;
      out.managerName = r.manager_resource_id ? nameById[r.manager_resource_id] : null;
    } else {
      var teamId = teamByMember[r.id];
      out.teamId = teamId || null;
      out.teamName = teamId ? nameById[teamId] : null;
    }
    return out;
  });
}

async function loadPrograms() {
  var results = await Promise.all([
    sb.from('programs').select('*'),
    sb.from('resources').select('id, name')
  ]);
  for (var i = 0; i < results.length; i++) {
    if (results[i].error) { console.error('loadPrograms query failed:', results[i].error); return []; }
  }
  var programRows = results[0].data || [];
  var nameById = {};
  (results[1].data || []).forEach(function(r){ nameById[r.id] = r.name; });

  // Linked project membership is derived from projects.program_id at render
  // time (see programProjects()), not cached here -- one source of truth.
  return programRows.map(function(pr) {
    return {
      id: pr.id, programNumber: pr.program_number, name: pr.name, description: pr.description,
      businessObjective: pr.business_objective,
      sponsorResourceId: pr.sponsor_resource_id, sponsorName: pr.sponsor_resource_id ? (nameById[pr.sponsor_resource_id] || '') : '',
      managerResourceId: pr.manager_resource_id, managerName: pr.manager_resource_id ? (nameById[pr.manager_resource_id] || '') : '',
      businessOwnerResourceId: pr.business_owner_resource_id, businessOwnerName: pr.business_owner_resource_id ? (nameById[pr.business_owner_resource_id] || '') : '',
      createdAt: pr.created_at
    };
  });
}

async function loadAllProjects() {
  var results = await Promise.all([
    sb.from('projects').select('*').is('deleted_at', null),
    sb.from('profiles').select('id, display_name, is_active'),
    sb.from('resource_projects').select('*'),
    sb.from('milestones').select('*'),
    sb.from('milestone_log').select('*'),
    sb.from('tasks').select('*'),
    sb.from('task_log').select('*'),
    sb.from('task_comments').select('*'),
    sb.from('task_checklist_items').select('*'),
    sb.from('raid_items').select('*'),
    sb.from('raid_log').select('*'),
    sb.from('doc_folders').select('*'),
    sb.from('documents').select('*'),
    sb.from('resources').select('id, name, user_id'),
    sb.from('project_categories').select('*'),
    sb.from('project_dependencies').select('*'),
    sb.from('task_baselines').select('*'),
    sb.from('task_baseline_entries').select('*'),
    sb.from('todo_items').select('*'),
    sb.from('todo_comments').select('*'),
    sb.from('todo_log').select('*')
  ]);

  for (var i = 0; i < results.length; i++) {
    if (results[i].error) { console.error('loadAllProjects query failed:', results[i].error); return []; }
  }

  // Queried separately (not in the Promise.all above) so a missing/not-yet-
  // migrated project_priority_ranks table degrades to "no ranks yet" instead
  // of taking down the entire project load.
  var priorityRankResult = await sb.from('project_priority_ranks').select('*');
  if (priorityRankResult.error) console.error('Could not load priority ranks:', priorityRankResult.error);
  var priorityRankRows = priorityRankResult.data || [];

  var projectsRows      = results[0].data || [];
  var profilesRows      = results[1].data || [];
  var teamRows          = results[2].data || [];
  var milestoneRows     = results[3].data || [];
  var milestoneLogRows  = results[4].data || [];
  var taskRows          = results[5].data || [];
  var taskLogRows       = results[6].data || [];
  var commentRows       = results[7].data || [];
  var checklistRows     = results[8].data || [];
  var raidRows          = results[9].data || [];
  var raidLogRows       = results[10].data || [];
  var folderRows        = results[11].data || [];
  var docRows           = results[12].data || [];
  var resourceMiniRows  = results[13].data || [];
  var categoryRows      = results[14].data || [];
  var dependencyRows    = results[15].data || [];
  var baselineRows      = results[16].data || [];
  var baselineEntryRows = results[17].data || [];
  var todoRows           = results[18].data || [];
  var todoCommentRows    = results[19].data || [];
  var todoLogRows        = results[20].data || [];
  var priorityRankByProj = {};
  priorityRankRows.forEach(function(r){ priorityRankByProj[r.project_id] = { rank: r.rank, isOverride: r.is_override }; });

  var activeProfilesRows = profilesRows.filter(function(p){ return p.is_active !== false; });
  D.people = activeProfilesRows.map(function(p){ return p.display_name; });
  D.peopleByName = {};
  activeProfilesRows.forEach(function(p){ D.peopleByName[p.display_name] = p; });

  // Owner/assignee/team all resolve through resources now, not accounts.
  var resourceNameById = {};
  resourceMiniRows.forEach(function(r){ resourceNameById[r.id] = r.name; });

  var projectInfoById = {};
  projectsRows.forEach(function(pr){ projectInfoById[pr.id] = { id: pr.id, name: pr.name, stage: pr.stage, start: pr.start_date, end: pr.end_date }; });
  var dependenciesByProject = groupBy(dependencyRows, 'project_id');

  var teamByProject      = groupBy(teamRows, 'project_id');
  var categoriesByProj   = groupBy(categoryRows, 'project_id');
  var milestonesByProj   = groupBy(milestoneRows, 'project_id');
  var msLogByMilestone   = groupBy(milestoneLogRows, 'milestone_id');
  var tasksByProj        = groupBy(taskRows, 'project_id');
  var taskLogByTask      = groupBy(taskLogRows, 'task_id');
  var commentsByTask     = groupBy(commentRows, 'task_id');
  var checklistByTask    = groupBy(checklistRows, 'task_id');
  var raidByProj         = groupBy(raidRows, 'project_id');
  var raidLogByItem      = groupBy(raidLogRows, 'raid_item_id');
  var foldersByProj      = groupBy(folderRows, 'project_id');
  var docsByProj         = groupBy(docRows, 'project_id');
  var baselinesByProj    = groupBy(baselineRows, 'project_id');
  var baselineEntriesById = groupBy(baselineEntryRows, 'baseline_id');
  var todosByProj        = groupBy(todoRows, 'project_id');
  var todoCommentsByTodo = groupBy(todoCommentRows, 'todo_id');
  var todoLogByTodo      = groupBy(todoLogRows, 'todo_id');
  var folderNameById     = {};
  folderRows.forEach(function(f){ folderNameById[f.id] = f.name; });

  function mapLog(rows) {
    return (rows || []).map(function(r){
      return { date: ymd(r.logged_at), actor: r.actor_name, action: r.action, detail: r.detail || '' };
    });
  }

  // Personal to-dos (project_id is null) don't belong to any project, so
  // they'd otherwise be silently dropped by the per-project map below --
  // set them on D directly, the same side-effect pattern loadFieldOptions
  // uses for its own globals.
  D.personalTodos = todoRows.filter(function(td){ return !td.project_id; }).map(function(td) {
    return {
      id: td.id, title: td.title, description: td.description || '',
      assignee: td.assignee_name || (td.assignee_id ? resourceNameById[td.assignee_id] : ''),
      assigneeId: td.assignee_id, status: td.status, due: td.due_date,
      log: mapLog(todoLogByTodo[td.id]),
      comments: (todoCommentsByTodo[td.id] || []).map(function(c) {
        return { id: c.id, text: c.body, author: c.author_name, date: ymd(c.created_at) };
      })
    };
  });

  return projectsRows.map(function(pr) {
    var teamRowsForProj = teamByProject[pr.id] || [];
    var teamIds = teamRowsForProj.map(function(t){ return t.resource_id; });
    var teamNames = teamIds.map(function(id){ return resourceNameById[id] || id; });
    // Capacity-planning tier per team member -- how much of their time this
    // project is expected to take, set by the project owner (or admin),
    // separate from whether they're merely "on the team." Unset until
    // someone assigns one.
    var teamTiers = {};
    teamRowsForProj.forEach(function(t){ teamTiers[t.resource_id] = t.allocation_tier || null; });
    // A team member's own override of the %-of-time their tier implies for
    // this project, set from their My Capacity page. Always wins over the
    // computed tier/size default -- see effectiveAllocationPct.
    var teamOverrides = {};
    teamRowsForProj.forEach(function(t){ teamOverrides[t.resource_id] = t.allocation_pct_override != null ? t.allocation_pct_override : null; });

    var milestones = (milestonesByProj[pr.id] || []).map(function(m) {
      return {
        id: m.id, name: m.name, date: m.target_date, done: m.done,
        completedDate: m.completed_date,
        log: mapLog(msLogByMilestone[m.id])
      };
    });

    var tasks = (tasksByProj[pr.id] || []).map(function(t) {
      return {
        id: t.id, title: t.title, description: t.description || '',
        assignee: t.assignee_name || (t.assignee_id ? resourceNameById[t.assignee_id] : ''),
        assigneeId: t.assignee_id, status: t.status, start: t.start_date, end: t.end_date,
        parentTaskId: t.parent_task_id, position: t.position,
        duration: t.duration_days, dependsOnTaskId: t.depends_on_task_id,
        log: mapLog(taskLogByTask[t.id]),
        comments: (commentsByTask[t.id] || []).map(function(c) {
          return { id: c.id, text: c.body, author: c.author_name, date: ymd(c.created_at) };
        }),
        checklist: (checklistByTask[t.id] || []).slice().sort(function(a,b){ return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0; }).map(function(c) {
          return { id: c.id, text: c.text, done: c.done };
        })
      };
    });

    var todos = (todosByProj[pr.id] || []).map(function(td) {
      return {
        id: td.id, title: td.title, description: td.description || '',
        assignee: td.assignee_name || (td.assignee_id ? resourceNameById[td.assignee_id] : ''),
        assigneeId: td.assignee_id, status: td.status, due: td.due_date,
        log: mapLog(todoLogByTodo[td.id]),
        comments: (todoCommentsByTodo[td.id] || []).map(function(c) {
          return { id: c.id, text: c.body, author: c.author_name, date: ymd(c.created_at) };
        })
      };
    });

    var raid = { risks: [], assumptions: [], issues: [], dependencies: [] };
    (raidByProj[pr.id] || []).forEach(function(r) {
      var base = { id: r.id, desc: r.description, owner: r.owner_name, status: r.status, log: mapLog(raidLogByItem[r.id]) };
      if (r.type === 'risk') {
        raid.risks.push(Object.assign(base, { probability: r.probability, impact: r.impact, mitigation: r.mitigation }));
      } else if (r.type === 'assumption') {
        raid.assumptions.push(base);
      } else if (r.type === 'issue') {
        raid.issues.push(Object.assign(base, { severity: r.severity, solution: r.solution }));
      } else if (r.type === 'dependency') {
        raid.dependencies.push(base);
      }
    });

    var documents = (docsByProj[pr.id] || []).map(function(d) {
      return {
        id: d.id, category: d.category, name: d.name, sourceType: d.source_type,
        url: d.url, folder: d.folder_id ? (folderNameById[d.folder_id] || 'General') : 'General',
        dateAdded: d.added_at
      };
    });
    var docFolders = (foldersByProj[pr.id] || []).map(function(f){ return f.name; });
    var docFolderIds = {};
    (foldersByProj[pr.id] || []).forEach(function(f){ docFolderIds[f.name] = f.id; });
    if (docFolders.indexOf('General') < 0) docFolders.unshift('General');

    var priorityInfo = priorityRankByProj[pr.id] || null;

    var baselines = (baselinesByProj[pr.id] || []).slice()
      .sort(function(a,b){ return (a.created_at||'').localeCompare(b.created_at||''); })
      .map(function(b) {
        var entries = {};
        (baselineEntriesById[b.id] || []).forEach(function(e){ entries[e.task_id] = { start: e.start_date, end: e.end_date }; });
        return { id: b.id, label: b.label, createdAt: b.created_at, entries: entries };
      });

    return {
      id: pr.id, name: pr.name,
      owner: pr.owner_name || (pr.owner_id ? resourceNameById[pr.owner_id] : ''), ownerId: pr.owner_id,
      sponsor: pr.sponsor, sponsorResourceId: pr.sponsor_resource_id, programId: pr.program_id,
      requirementsOwner: pr.requirements_owner_name || (pr.requirements_owner_id ? resourceNameById[pr.requirements_owner_id] : ''), requirementsOwnerId: pr.requirements_owner_id,
      categories: (categoriesByProj[pr.id]||[]).map(function(c){ return c.category; }), businessUnit: pr.business_unit,
      dependencies: (dependenciesByProject[pr.id]||[]).map(function(d){ return projectInfoById[d.depends_on_project_id]; }).filter(Boolean),
      team: teamNames, teamIds: teamIds, teamTiers: teamTiers, teamOverrides: teamOverrides,
      status: pr.status, phase: pr.phase, progress: pr.progress,
      start: pr.start_date, end: pr.end_date, plannedStart: pr.planned_start,
      value: pr.value_area, priority: pr.priority, description: pr.description,
      blockers: pr.blockers, health: pr.health, stage: pr.stage, requestId: pr.request_id,
      holdReason: pr.hold_reason, preHoldStage: pr.pre_hold_stage, heldAt: pr.held_at,
      targetQuarter: pr.target_quarter, targetYear: pr.target_year, completedAt: pr.completed_at,
      targetEndQuarter: pr.target_end_quarter, targetEndYear: pr.target_end_year,
      deliveryMethodology: pr.delivery_methodology, projectNumber: pr.project_number, createdAt: pr.created_at, tshirtSize: pr.tshirt_size,
      estimatedAmount: pr.estimated_amount, estimatedFrequency: pr.estimated_frequency, estimatedType: pr.estimated_type,
      valueConfidence: pr.value_confidence, costEstimate: pr.cost_estimate, costConfidence: pr.cost_confidence,
      priorityRank: priorityInfo ? priorityInfo.rank : null,
      priorityIsOverride: priorityInfo ? !!priorityInfo.isOverride : false,
      milestones: milestones, tasks: tasks, todos: todos, raid: raid, baselines: baselines,
      documents: documents, docFolders: docFolders.length ? docFolders : ['General'], docFolderIds: docFolderIds
    };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pendingCount() { return D.requests.filter(function(r){ return r.status === 'Pending'; }).length; }
function backlogCount()  { return D.projects.filter(function(p){ return p.stage  === 'backlog'; }).length; }
function myOpenTasksCount() {
  var myId = D.myResourceId;
  if (!myId) return 0;
  var count = 0;
  D.projects.forEach(function(p){
    p.tasks.forEach(function(t){ if (t.assigneeId === myId && t.status !== 'Done') count++; });
    p.todos.forEach(function(td){ if (td.assigneeId === myId && td.status !== 'Done') count++; });
  });
  (D.personalTodos || []).forEach(function(td){ if (td.assigneeId === myId && td.status !== 'Done') count++; });
  return count;
}

// New work requests assigned to this person that haven't been triaged yet.
function myAssignedWorkRequestsNewCount() {
  var myId = D.myResourceId;
  if (!myId) return 0;
  return (D.workRequests || []).filter(function(w){ return w.resourceId === myId && w.status === 'New'; }).length;
}

// Work requests this person submitted that are waiting on a reply from them.
function mySubmittedWorkRequestsNeedsInfoCount() {
  if (!D.currentProfile) return 0;
  return (D.workRequests || []).filter(function(w){ return w.requesterId === D.currentProfile.id && w.status === 'Needs Info'; }).length;
}

function myProjects() {
  return D.projects;
}

function isMyContribution(p) {
  var myId = D.myResourceId;
  return !!(myId && ((p.teamIds||[]).indexOf(myId) >= 0 || p.tasks.some(function(t){ return t.assigneeId === myId; })));
}

function isMyOwnedProject(p) { return !!(D.myResourceId && p.ownerId === D.myResourceId); }

// Any relationship at all to a project (owner, sponsor, contributor), any
// stage -- used both to decide whether "My Work" shows in the nav at all,
// and as the base set for the Completed tab on My Projects.
function hasAnyRoleOn(p) {
  return isMyOwnedProject(p) || isProjectSponsor(p) || isMyContribution(p);
}

// Being resource-linked is enough on its own now -- My Tasks always has a
// legitimate personal use (adding a to-do for yourself) even with zero
// project or work-request involvement, so there's no reason to hide the
// entry point just because nothing's assigned yet.
function hasAssignedWork() {
  return !!D.myResourceId;
}

function currentUser() {
  return D.currentProfile ? D.currentProfile.display_name : '';
}

function canEdit(p) {
  if (D.role === 'admin') return true;
  if (p.ownerId && D.myResourceId && p.ownerId === D.myResourceId) return true;
  return isProgramManagerOf(programForProject(p));
}

function isProjectSponsor(p) {
  return !!(p && p.sponsorResourceId && D.myResourceId && p.sponsorResourceId === D.myResourceId);
}

function programForProject(p) {
  return p && p.programId ? D.programs.find(function(prog){ return prog.id === p.programId; }) : null;
}

function isProgramManagerOf(program) {
  return !!(program && program.managerResourceId && D.myResourceId && program.managerResourceId === D.myResourceId);
}

// Single gate for all financial detail (value/cost estimates + their confidence
// ratings) across the app. Admin-only, plus a project's own linked sponsor for
// that specific project. Pass the project when checking in a project context;
// omit it (e.g. for requests, which have no resource-linked sponsor) to fall
// back to the admin-only check.
function canViewFinancials(p) {
  return D.role === 'admin' || isProjectSponsor(p);
}

// Admin can always edit a project's financial detail, as can that project's
// linked sponsor. A non-admin, non-sponsor owner can only do so if they
// personally have financial-view permission on this project.
function canEditProjectFinancials(p) {
  return isProjectSponsor(p) || (canViewFinancials(p) && canEdit(p));
}

async function ensureOnTeam(p, res) {
  if (!res) return;
  if ((p.teamIds || []).indexOf(res.id) >= 0) return;
  var result = await sb.from('resource_projects').insert({ project_id: p.id, resource_id: res.id });
  if (result.error) { console.error('Could not add to team:', result.error); return; }
  p.team = p.team || []; p.teamIds = p.teamIds || [];
  p.team.push(res.name);
  p.teamIds.push(res.id);
}

// Factored out of the Team tab's own tier dropdown so the "owner is set"
// flows below can write a tier without depending on window.setAllocationTier
// having been defined yet (it's only assigned once pgProjectDetail has
// rendered at least once this session).
async function writeAllocationTier(pid, resourceId, tier) {
  return sb.from('resource_projects').update({ allocation_tier: tier || null }).eq('project_id', pid).eq('resource_id', resourceId);
}

// A project's owner is assumed to be its Owner/Lead for capacity purposes --
// adds them to the team if they're not already on it, and sets their
// allocation tier to Owner/Lead if it isn't already set to anything. Never
// overwrites a tier someone already explicitly chose.
async function applyOwnerAsLead(p) {
  if (!p || !p.ownerId) return;
  var ownerResource = D.resources.find(function(r){ return r.id === p.ownerId; });
  if (!ownerResource) return;
  await ensureOnTeam(p, ownerResource);
  p.teamTiers = p.teamTiers || {};
  if (!p.teamTiers[p.ownerId]) {
    var result = await writeAllocationTier(p.id, p.ownerId, 'Owner/Lead');
    if (!result.error) p.teamTiers[p.ownerId] = 'Owner/Lead';
  }
}

var TAG_COLOR_CLASSES = ['badge-purple','badge-teal','badge-amber','badge-red','badge-blue','badge-green','badge-coral'];
function tagColorClass(name) {
  var hash = 0;
  for (var i = 0; i < name.length; i++) { hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0; }
  return TAG_COLOR_CLASSES[Math.abs(hash) % TAG_COLOR_CLASSES.length];
}
function tagBadge(name) {
  return '<span class="badge ' + tagColorClass(name) + '">' + name + '</span>';
}

// A project "occupies time" either via real dates (active/planned) or a
// rough quarter estimate (backlog) - anything else (hold/complete, or
// missing both) isn't placeable on a timeline and returns null.
function projectTimeRange(p) {
  if ((p.stage === 'active' || p.stage === 'planned') && p.start && p.end) {
    return { start: new Date(p.start+'T00:00:00'), end: new Date(p.end+'T00:00:00') };
  }
  if (p.stage === 'backlog' && p.targetQuarter && p.targetYear) {
    var eq = p.targetEndQuarter || p.targetQuarter, ey = p.targetEndYear || p.targetYear;
    return {
      start: new Date(p.targetYear, (p.targetQuarter-1)*3, 1),
      end: new Date(ey, (eq-1)*3 + 3, 0) // last day of end quarter's last month
    };
  }
  return null;
}

// Reusable 12-month-window computation, shared by Roadmap and (eventually)
// Future Planning. Mode is one of: 'next12' (rolling forward, default),
// 'last12' (rolling backward, ending this month), 'year' (fixed Jan-Dec of
// a chosen year).
function computeDateWindow(mode, year) {
  var windowMonths = 12;
  var windowStart;
  if (mode === 'last12') {
    var now = new Date(); now.setDate(1); now.setHours(0,0,0,0);
    windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  } else if (mode === 'year') {
    windowStart = new Date(year, 0, 1);
  } else {
    windowStart = new Date(); windowStart.setDate(1); windowStart.setHours(0,0,0,0);
  }
  return { windowStart: windowStart, windowMonths: windowMonths };
}

function quarterOfDate(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return { quarter: Math.floor(d.getMonth()/3) + 1, year: d.getFullYear() };
}

function quartersInWindow(windowStart, windowMonths) {
  var quarters = [];
  var seen = {};
  for (var i = 0; i < windowMonths; i++) {
    var d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1);
    var q = Math.floor(d.getMonth()/3) + 1;
    var key = q + '-' + d.getFullYear();
    if (!seen[key]) { seen[key] = true; quarters.push({ quarter: q, year: d.getFullYear() }); }
  }
  return quarters;
}

function dateRangeControlHtml(mode, year, setModeFnName, setYearFnName) {
  var yearOpts = '';
  var thisYear = new Date().getFullYear();
  for (var y = thisYear - 2; y <= thisYear + 3; y++) {
    yearOpts += '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>';
  }
  return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">' +
    '<div class="tab-bar" style="margin-bottom:0">' +
      '<div class="tab' + (mode==='next12'?' active':'') + '" onclick="' + setModeFnName + '(\'next12\')">Next 12 months</div>' +
      '<div class="tab' + (mode==='last12'?' active':'') + '" onclick="' + setModeFnName + '(\'last12\')">Last 12 months</div>' +
      '<div class="tab' + (mode==='year'?' active':'') + '" onclick="' + setModeFnName + '(\'year\')">Specific year</div>' +
    '</div>' +
    (mode === 'year' ? '<select onchange="' + setYearFnName + '(this.value)">' + yearOpts + '</select>' : '') +
  '</div>';
}

function buildCategoryTabs(projects, currentFilter, setFnName) {
  var categoriesPresent = [];
  var hasUncategorized = false;
  projects.forEach(function(p){
    if (p.categories && p.categories.length) {
      p.categories.forEach(function(c){ if (categoriesPresent.indexOf(c) < 0) categoriesPresent.push(c); });
    } else hasUncategorized = true;
  });
  var tabList = ['All'].concat(categoriesPresent).concat(hasUncategorized ? ['Uncategorized'] : []);
  if (tabList.indexOf(currentFilter) < 0) currentFilter = 'All';
  var html = '<div class="tab-bar" style="margin-bottom:16px">' + tabList.map(function(c) {
    return '<div class="tab' + (currentFilter === c ? ' active' : '') + '" onclick="' + setFnName + '(\'' + c.replace(/'/g,"\\'") + '\')">' + c + '</div>';
  }).join('') + '</div>';
  return { html: html, resolvedFilter: currentFilter };
}

function projectMatchesCategoryTab(p, cat) {
  if (cat === 'All') return true;
  if (cat === 'Uncategorized') return !p.categories || !p.categories.length;
  return p.categories && p.categories.indexOf(cat) >= 0;
}

function searchBoxHtml(value, placeholder, id, onInputFnName) {
  return '<div class="task-filter-bar" style="margin-bottom:12px"><input type="text" id="' + id + '" placeholder="' + placeholder + '" value="' + (value||'').replace(/"/g,'&quot;') + '" oninput="' + onInputFnName + '(this.value)"></div>';
}

function tagFilterBarHtml(activeTags, openFnName) {
  return '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:14px">' +
    '<button class="btn btn-sm" onclick="' + openFnName + '()"><i class="ti ti-tag"></i> Filter by tag' + (activeTags.length ? ' (' + activeTags.length + ')' : '') + '</button>' +
    activeTags.map(function(t){ return tagBadge(t); }).join('') +
  '</div>';
}

function openTagPicker(currentTagNames, onSave, allowCreate) {
  if (allowCreate === undefined) allowCreate = true;
  var selected = currentTagNames.slice();
  var query = '';
  function render() {
    var q = query.trim().toLowerCase();
    var matches = D.tags.filter(function(t){ return t.name.toLowerCase().indexOf(q) >= 0; });
    var exactMatch = D.tags.some(function(t){ return t.name.toLowerCase() === q; });
    var listHtml = matches.map(function(t){
      var checked = selected.indexOf(t.name) >= 0;
      var esc = t.name.replace(/'/g,"\\'");
      var dotClass = tagColorClass(t.name);
      return '<label style="display:flex;align-items:center;padding:6px 0;cursor:pointer;font-size:13px"><input type="checkbox" style="margin-right:8px"' + (checked?' checked':'') + ' onchange="window.__tagToggle(\'' + esc + '\')"> <span class="badge ' + dotClass + '" style="padding:2px 8px">' + t.name + '</span></label>';
    }).join('');
    var createRow = (allowCreate && q && !exactMatch) ? '<div style="padding:8px 0 0;border-top:1px solid #eee;margin-top:6px"><button class="btn btn-sm btn-primary" onclick="window.__tagCreate()"><i class="ti ti-plus"></i> Create "' + query.trim().replace(/"/g,'&quot;') + '"</button></div>' : '';
    var selectedChips = selected.length
      ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">' + selected.map(function(n){
          var esc = n.replace(/'/g,"\\'");
          return '<span class="badge ' + tagColorClass(n) + '" style="display:inline-flex;align-items:center;gap:4px">' + n + ' <i class="ti ti-x" style="cursor:pointer" onclick="window.__tagToggle(\'' + esc + '\')"></i></span>';
        }).join('') + '</div>'
      : '';
    showModal(
      '<div class="modal-title">Tags <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
      selectedChips +
      '<input type="text" id="tag-search" placeholder="' + (allowCreate ? 'Search or create a tag…' : 'Search tags…') + '" value="' + query.replace(/"/g,'&quot;') + '" oninput="window.__tagSearch(this.value)">' +
      '<div style="max-height:220px;overflow-y:auto;margin-top:8px">' + (listHtml || '<span class="text-muted" style="font-size:13px">No matching tags</span>') + '</div>' +
      createRow +
      '<div class="modal-footer"><button class="btn btn-primary" onclick="window.__tagDone()">Done</button></div>'
    );
    var searchEl = document.getElementById('tag-search');
    if (searchEl) { searchEl.focus(); searchEl.selectionStart = searchEl.selectionEnd = searchEl.value.length; }
  }
  window.__tagSearch = function(val) { query = val; render(); };
  window.__tagToggle = function(name) {
    var i = selected.indexOf(name);
    if (i >= 0) selected.splice(i,1); else selected.push(name);
    render();
  };
  window.__tagCreate = async function() {
    if (!allowCreate) return;
    var q = document.getElementById('tag-search').value.trim();
    if (!q) return;
    var result = await sb.from('tags').insert({ name: q }).select().single();
    if (result.error) { showToast('Could not create tag: ' + result.error.message); return; }
    D.tags.push({ id: result.data.id, name: q });
    D.tags.sort(function(a,b){ return a.name.localeCompare(b.name); });
    selected.push(q);
    query = '';
    render();
  };
  window.__tagDone = async function() { closeModal(); await onSave(selected); };
  render();
}

// Applies a tag-picker's add/remove diff against a join table, returning
// the tags actually persisted (not just newTags) plus any that failed --
// e.g. a write silently blocked while "viewing as" someone (see the sb.from
// wrapper up top) previously still got reported as a successful save,
// since nothing checked these inserts/deletes for an error.
async function applyTagDiff(table, idColumn, idValue, oldTags, newTags) {
  var toAdd = newTags.filter(function(n){ return oldTags.indexOf(n) < 0; });
  var toRemove = oldTags.filter(function(n){ return newTags.indexOf(n) < 0; });
  var current = oldTags.slice();
  var failed = [];
  for (var i = 0; i < toAdd.length; i++) {
    var tag = D.tags.find(function(t){ return t.name === toAdd[i]; });
    if (!tag) continue;
    var record = { tag_id: tag.id }; record[idColumn] = idValue;
    var result = await sb.from(table).insert(record);
    if (result.error) failed.push(toAdd[i]); else current.push(toAdd[i]);
  }
  for (var j = 0; j < toRemove.length; j++) {
    var tagR = D.tags.find(function(t){ return t.name === toRemove[j]; });
    if (!tagR) continue;
    var result2 = await sb.from(table).delete().eq(idColumn, idValue).eq('tag_id', tagR.id);
    if (result2.error) failed.push(toRemove[j]); else current = current.filter(function(n){ return n !== toRemove[j]; });
  }
  return { tags: current, failed: failed };
}

function openFilterModal(label, choices, getSelected, toggleValue, clearAll, rerenderPage) {
  function render() {
    var selected = getSelected();
    var optsHtml = choices.map(function(c){
      var esc = c.replace(/'/g,"\\'");
      return '<label style="display:block;padding:7px 0;font-size:13px;cursor:pointer"><input type="checkbox" style="margin-right:8px"' + (selected.indexOf(c)>=0?' checked':'') + ' onchange="window.__filterModalToggle(\'' + esc + '\')"> ' + c + '</label>';
    }).join('');
    showModal('<div class="modal-title">Filter by ' + label + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
      '<div style="max-height:300px;overflow-y:auto">' + optsHtml + '</div>' +
      '<div class="modal-footer"><button class="btn" onclick="window.__filterModalClear()">Clear</button><button class="btn btn-primary" onclick="closeModal()">Done</button></div>');
  }
  window.__filterModalToggle = function(val) { toggleValue(val); rerenderPage(); render(); };
  window.__filterModalClear = function() { clearAll(); rerenderPage(); closeModal(); };
  render();
}

function refreshTaskView() {
  var m = location.hash.match(/^#\/project\/([^\/]+)/);
  if (m && document.getElementById('ptab-content')) {
    var activeTabEl = document.querySelector('[id^="ptab-"].tab.active');
    pgProjectDetail(m[1], activeTabEl ? activeTabEl.id.slice(5) : 'tasks');
  } else if (currentPage === 'my-tasks') {
    pgMyTasks();
  } else if (currentPage === 'admin-personal-todos') {
    pgAdminPersonalTodos();
  }
}

function openCompleteTaskPrompt(pid2, idx) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var task = pr.tasks[idx];
  showModal('<div class="modal-title">Mark "' + task.title + '" as done <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Add a comment (optional)</div><textarea id="complete-task-comment" rows="3" placeholder="Anything worth noting about this completion?"></textarea></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="complete-task-confirm"><i class="ti ti-check"></i> Mark done</button></div>');
  document.getElementById('complete-task-confirm').onclick = async function() {
    var commentText = document.getElementById('complete-task-comment').value.trim();
    var btn = document.getElementById('complete-task-confirm'); btn.disabled = true;
    await completeMyTask(pid2, idx, commentText);
    closeModal();
  };
}

async function completeMyTask(pid2, idx, commentText) {
  var pr = D.projects.find(function(x){return x.id===pid2;});
  var tk = pr.tasks[idx]; var old = tk.status;
  var result = await sb.from('tasks').update({ status: 'Done' }).eq('id', tk.id);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  tk.status='Done'; tk.log=tk.log||[];
  tk.log.push(await writeLog('task_log', 'task_id', tk.id, 'Updated', 'Status: "'+old+'" → "Done"'));
  if (commentText) {
    var commentResult = await sb.from('task_comments').insert({
      task_id: tk.id, author_id: D.currentProfile.id, author_name: D.currentProfile.display_name, body: commentText
    }).select().single();
    if (!commentResult.error) {
      tk.comments = tk.comments || [];
      tk.comments.push({ id: commentResult.data.id, text: commentText, author: D.currentProfile.display_name, date: ymd(commentResult.data.created_at) });
    }
  }
  refreshTaskView();
  showToast('Task marked complete');
}

function toggleTaskDoneIcon(pid2, idx) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var task = pr.tasks[idx];
  if (!task) return;
  if (task.status === 'Done') reopenTask(pid2, task.id);
  else openCompleteTaskPrompt(pid2, idx);
}

async function reopenTask(pid2, taskId) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var task = pr.tasks.find(function(x){ return x.id === taskId; });
  var old = task.status;
  var result = await sb.from('tasks').update({ status: 'To Do' }).eq('id', taskId);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  task.status = 'To Do';
  task.log = task.log || [];
  task.log.push(await writeLog('task_log', 'task_id', taskId, 'Updated', 'Status: "' + old + '" → "To Do"'));
  refreshTaskView();
  showToast('Task reopened');
}

function toggleTaskComments(pid2, taskId) {
  var key = pid2 + '|' + taskId;
  taskCommentsOpen[key] = !taskCommentsOpen[key];
  refreshTaskView();
}

async function addComment(pid2, taskId) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var tk = pr.tasks.find(function(x){ return x.id === taskId; });
  var el = document.getElementById('cmt-input-' + taskId);
  var text = el ? el.value.trim() : '';
  if (!text) { showToast('Comment cannot be empty'); return; }
  var result = await sb.from('task_comments').insert({
    task_id: taskId, author_id: D.currentProfile.id, author_name: D.currentProfile.display_name, body: text
  }).select().single();
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  tk.comments = tk.comments || [];
  tk.comments.push({ id: result.data.id, text: text, author: D.currentProfile.display_name, date: ymd(result.data.created_at) });
  refreshTaskView();
  showToast('Comment added');
}

async function openEditComment(pid2, taskId, cid) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var tk = pr.tasks.find(function(x){ return x.id === taskId; });
  var c = tk.comments.find(function(x){ return x.id === cid; });
  var text = prompt('Edit comment:', c.text);
  if (text == null) return;
  text = text.trim();
  if (!text) { showToast('Comment cannot be empty'); return; }
  var result = await sb.from('task_comments').update({ body: text, edited_at: new Date().toISOString() }).eq('id', cid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  c.text = text;
  refreshTaskView();
  showToast('Comment updated');
}

async function deleteComment(pid2, taskId, cid) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var tk = pr.tasks.find(function(x){ return x.id === taskId; });
  var result = await sb.from('task_comments').delete().eq('id', cid);
  if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
  tk.comments = tk.comments.filter(function(x){ return x.id !== cid; });
  refreshTaskView();
  showToast('Comment deleted');
}

// To-Do items are the lightweight counterpart to Plan tasks -- action
// items, follow-ups, access requests, reminders -- so they only carry a
// status plus a description/comments/change-log, not the full scheduling
// machinery. Marking one done offers an optional closing comment
// (mirroring Plan tasks); reopening is a direct toggle.
//
// A to-do is either project-scoped (pid2 is a real project id, backed by
// that project's p.todos) or personal -- not tied to any project, managed
// by whoever it's assigned to (pid2 is null, backed by D.personalTodos).
// Every handler below resolves through this one lookup so project and
// personal to-dos share the exact same comment/log/status logic.
function getTodoContainer(pid2) {
  if (pid2 == null) return D.personalTodos;
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  return pr ? pr.todos : null;
}

function toggleTodoDoneIcon(pid2, idx) {
  var list = getTodoContainer(pid2);
  var td = list && list[idx];
  if (!td) return;
  if (td.status === 'Done') reopenTodo(pid2, idx);
  else openCompleteTodoPrompt(pid2, idx);
}

async function reopenTodo(pid2, idx) {
  var td = getTodoContainer(pid2)[idx];
  // Reopening from Done means the work wasn't actually finished, not that
  // it never started -- back to In Progress, not Not Started.
  var result = await sb.from('todo_items').update({ status: 'In Progress' }).eq('id', td.id);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  td.status = 'In Progress';
  td.log = td.log || [];
  td.log.push(await writeLog('todo_log', 'todo_id', td.id, 'Updated', 'Status: "Done" → "In Progress"'));
  refreshTaskView();
  showToast('To-do reopened');
}

function openCompleteTodoPrompt(pid2, idx) {
  var td = getTodoContainer(pid2)[idx];
  showModal('<div class="modal-title">Mark "' + td.title + '" as done <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Add a comment (optional)</div><textarea id="complete-todo-comment" rows="3" placeholder="Anything worth noting about this completion?"></textarea></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="complete-todo-confirm"><i class="ti ti-check"></i> Mark done</button></div>');
  document.getElementById('complete-todo-confirm').onclick = async function() {
    var commentText = document.getElementById('complete-todo-comment').value.trim();
    var btn = document.getElementById('complete-todo-confirm'); btn.disabled = true;
    await completeMyTodo(pid2, idx, commentText);
    closeModal();
  };
}

async function completeMyTodo(pid2, idx, commentText) {
  var td = getTodoContainer(pid2)[idx];
  var old = td.status;
  var result = await sb.from('todo_items').update({ status: 'Done' }).eq('id', td.id);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  td.status = 'Done';
  td.log = td.log || [];
  td.log.push(await writeLog('todo_log', 'todo_id', td.id, 'Updated', 'Status: "' + old + '" → "Done"'));
  if (commentText) {
    var commentResult = await sb.from('todo_comments').insert({
      todo_id: td.id, author_id: D.currentProfile.id, author_name: D.currentProfile.display_name, body: commentText
    }).select().single();
    if (!commentResult.error) {
      td.comments = td.comments || [];
      td.comments.push({ id: commentResult.data.id, text: commentText, author: D.currentProfile.display_name, date: ymd(commentResult.data.created_at) });
    }
  }
  refreshTaskView();
  showToast('To-do marked complete');
}

function toggleTodoDescription(pid2, todoId) {
  var key = pid2 + '|' + todoId;
  todoDescOpen[key] = !todoDescOpen[key];
  refreshTaskView();
}

function toggleTodoComments(pid2, todoId) {
  var key = pid2 + '|' + todoId;
  todoCommentsOpen[key] = !todoCommentsOpen[key];
  refreshTaskView();
}

async function addTodoComment(pid2, todoId) {
  var td = getTodoContainer(pid2).find(function(x){ return x.id === todoId; });
  var el = document.getElementById('todo-cmt-input-' + todoId);
  var text = el ? el.value.trim() : '';
  if (!text) { showToast('Comment cannot be empty'); return; }
  var result = await sb.from('todo_comments').insert({
    todo_id: todoId, author_id: D.currentProfile.id, author_name: D.currentProfile.display_name, body: text
  }).select().single();
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  td.comments = td.comments || [];
  td.comments.push({ id: result.data.id, text: text, author: D.currentProfile.display_name, date: ymd(result.data.created_at) });
  refreshTaskView();
  showToast('Comment added');
}

async function openEditTodoComment(pid2, todoId, cid) {
  var td = getTodoContainer(pid2).find(function(x){ return x.id === todoId; });
  var c = td.comments.find(function(x){ return x.id === cid; });
  var text = prompt('Edit comment:', c.text);
  if (text == null) return;
  text = text.trim();
  if (!text) { showToast('Comment cannot be empty'); return; }
  var result = await sb.from('todo_comments').update({ body: text }).eq('id', cid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  c.text = text;
  refreshTaskView();
  showToast('Comment updated');
}

async function deleteTodoComment(pid2, todoId, cid) {
  var td = getTodoContainer(pid2).find(function(x){ return x.id === todoId; });
  var result = await sb.from('todo_comments').delete().eq('id', cid);
  if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
  td.comments = td.comments.filter(function(x){ return x.id !== cid; });
  refreshTaskView();
  showToast('Comment deleted');
}

function toggleTodoLog(pid2, todoId) {
  var key = pid2 + '|' + todoId;
  todoLogOpen[key] = !todoLogOpen[key];
  refreshTaskView();
}

function toggleTaskChecklist(pid2, taskId) {
  var key = pid2 + '|' + taskId;
  taskChecklistOpen[key] = !taskChecklistOpen[key];
  refreshTaskView();
}

async function addChecklistItem(pid2, taskId) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var tk = pr.tasks.find(function(x){ return x.id === taskId; });
  var el = document.getElementById('cl-input-' + taskId);
  var text = el ? el.value.trim() : '';
  if (!text) { showToast('Checklist item cannot be empty'); return; }
  var result = await sb.from('task_checklist_items').insert({ task_id: taskId, text: text }).select().single();
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  tk.checklist = tk.checklist || [];
  tk.checklist.push({ id: result.data.id, text: text, done: false });
  refreshTaskView();
}

async function toggleChecklistItem(pid2, taskId, itemId) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var tk = pr.tasks.find(function(x){ return x.id === taskId; });
  var item = tk.checklist.find(function(x){ return x.id === itemId; });
  if (!item) return;
  var result = await sb.from('task_checklist_items').update({ done: !item.done }).eq('id', itemId);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  item.done = !item.done;
  refreshTaskView();
}

async function deleteChecklistItem(pid2, taskId, itemId) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var tk = pr.tasks.find(function(x){ return x.id === taskId; });
  var result = await sb.from('task_checklist_items').delete().eq('id', itemId);
  if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
  tk.checklist = tk.checklist.filter(function(x){ return x.id !== itemId; });
  refreshTaskView();
}

function toggleTaskTimeline(pid2) {
  taskTimelineOpen[pid2] = !taskTimelineOpen[pid2];
  refreshTaskView();
}

function openTaskTagPicker(pid2, taskId) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var tk = pr.tasks.find(function(x){ return x.id === taskId; });
  openTagPicker(tk.tags || [], async function(newTags) {
    var result = await applyTagDiff('task_tags', 'task_id', taskId, tk.tags || [], newTags);
    tk.tags = result.tags;
    showToast(result.failed.length ? 'Could not save: ' + result.failed.join(', ') : 'Tags updated');
    refreshTaskView();
  });
}

function taskAssigneeLabel(tk) { return tk.assignee || 'Unassigned'; }

function taskDatesLabel(tk) {
  var label;
  if (tk.start && tk.end) label = tk.start + ' – ' + tk.end;
  else if (tk.end) label = 'End ' + tk.end;
  else if (tk.start) label = 'Start ' + tk.start;
  else return '—';
  return label + ' ' + lateBadgeHtml(isTaskLate(tk));
}

var taskTimelineRange = {};
function getTaskTimelineRange(pid) {
  if (!taskTimelineRange[pid]) taskTimelineRange[pid] = { mode: '1m', customStart: '', customEnd: '' };
  return taskTimelineRange[pid];
}

function setTaskTimelineRangeMode(pid2, mode) {
  var r = getTaskTimelineRange(pid2);
  r.mode = mode;
  if (mode === 'custom' && !r.customStart) {
    var today = new Date();
    var end = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    r.customStart = today.toISOString().slice(0,10);
    r.customEnd = end.toISOString().slice(0,10);
  }
  refreshTaskView();
}

function setTaskTimelineCustomDates(pid2, start, end) {
  var r = getTaskTimelineRange(pid2);
  r.customStart = start; r.customEnd = end;
  refreshTaskView();
}

function taskTimelineWindow(pid2) {
  var r = getTaskTimelineRange(pid2);
  var today = new Date(); today.setHours(0,0,0,0);
  if (r.mode === 'custom' && r.customStart && r.customEnd) {
    return { start: new Date(r.customStart + 'T00:00:00'), end: new Date(r.customEnd + 'T00:00:00') };
  }
  var months = r.mode === '2m' ? 2 : r.mode === '3m' ? 3 : 1;
  return { start: today, end: new Date(today.getFullYear(), today.getMonth() + months, today.getDate()) };
}

// Baselines snapshot every task's start/end at a point in time so the plan
// can be compared against how execution actually played out. Each "Set
// Baseline" creates a new, permanent row -- past baselines are never
// overwritten, so a project can be compared against its kickoff plan AND
// last quarter's replan side by side.
async function createTaskBaseline(pid2, label) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var result = await sb.from('task_baselines').insert({ project_id: pid2, label: label || null }).select().single();
  if (result.error) { showToast('Could not create baseline: ' + result.error.message); return; }
  var baselineId = result.data.id;
  var entries = pr.tasks.filter(function(t){ return t.start || t.end; }).map(function(t){
    return { baseline_id: baselineId, task_id: t.id, start_date: t.start || null, end_date: t.end || null };
  });
  var entriesMap = {};
  if (entries.length) {
    var insertResult = await sb.from('task_baseline_entries').insert(entries).select();
    if (insertResult.error) showToast('Baseline created, but could not save all task snapshots: ' + insertResult.error.message);
    (insertResult.data || []).forEach(function(e){ entriesMap[e.task_id] = { start: e.start_date, end: e.end_date }; });
  }
  pr.baselines = pr.baselines || [];
  pr.baselines.push({ id: baselineId, label: label || null, createdAt: result.data.created_at, entries: entriesMap });
  taskBaselineSelected[pid2] = baselineId;
  showToast('Baseline set');
  refreshTaskView();
}

window.openSetBaselineModal = function(pid2) {
  showModal('<div class="modal-title">Set baseline <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="text-muted" style="font-size:12px;margin-bottom:12px">Snapshots every task\'s current start/end date so it can be compared against execution later. Past baselines are kept, never overwritten.</div>' +
    '<div class="form-group"><div class="form-label">Label (optional)</div><input type="text" id="bl-label" placeholder="e.g. Kickoff plan"></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="bl-save"><i class="ti ti-check"></i> Set baseline</button></div>');
  document.getElementById('bl-save').onclick = async function() {
    document.getElementById('bl-save').disabled = true;
    await createTaskBaseline(pid2, document.getElementById('bl-label').value.trim());
    closeModal();
  };
};

window.setTaskBaselineSelection = function(pid2, bid) {
  taskBaselineSelected[pid2] = bid || '';
  refreshTaskView();
};

// outlineRows is the SAME array the task list renders (in the same order,
// same depth/collapse state, same search/filter already applied) so the
// timeline always matches the list exactly -- drags, promote/demote moves,
// and expand/collapse all just fall out of reusing that one source of truth.
function taskTimelineBlock(pid2, outlineRows) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var openNow = !!taskTimelineOpen[pid2];
  var toggleBtn = '<button class="btn btn-sm mb-12" onclick="toggleTaskTimeline(\'' + pid2 + '\')"><i class="ti ' + (openNow ? 'ti-chevron-up' : 'ti-chevron-down') + '"></i> Timeline</button>' +
    (openNow && canEdit(pr) ? ' <button class="btn btn-sm mb-12" onclick="openSetBaselineModal(\'' + pid2 + '\')"><i class="ti ti-flag"></i> Set baseline</button>' : '');
  if (!openNow) return toggleBtn;

  var baselines = pr.baselines || [];
  var selectedBaselineId = taskBaselineSelected[pid2] || '';
  var selectedBaseline = baselines.find(function(b){ return b.id === selectedBaselineId; }) || null;
  var baselinePicker = baselines.length
    ? '<div class="form-group" style="margin:0;min-width:220px"><div class="form-label" style="text-align:right">Compare to baseline</div><select onchange="setTaskBaselineSelection(\'' + pid2 + '\',this.value)">' +
        '<option value="">— None —</option>' +
        baselines.map(function(b){ return '<option value="' + b.id + '"' + (b.id===selectedBaselineId?' selected':'') + '>' + (b.label || (b.createdAt||'').slice(0,10) || 'Baseline') + '</option>'; }).join('') +
      '</select></div>'
    : '';

  var r = getTaskTimelineRange(pid2);
  var win = taskTimelineWindow(pid2);
  var winStart = win.start, winEnd = win.end;
  var totalDays = Math.max(1, (winEnd - winStart) / 86400000);

  var rangeTabs = '<div class="tab-bar" style="margin-bottom:0;display:inline-flex">' +
    [['1m','1 month'],['2m','2 months'],['3m','3 months'],['custom','Custom']].map(function(pair){
      return '<div class="tab' + (r.mode===pair[0]?' active':'') + '" onclick="setTaskTimelineRangeMode(\'' + pid2 + '\',\'' + pair[0] + '\')">' + pair[1] + '</div>';
    }).join('') +
    '</div>';
  var rangeCustom = r.mode === 'custom' ? '<div style="display:flex;gap:8px;align-items:center;margin-top:10px">' +
      '<input type="date" id="tl-custom-start-' + pid2 + '" value="' + (r.customStart||'') + '" onchange="setTaskTimelineCustomDates(\'' + pid2 + '\',this.value,document.getElementById(\'tl-custom-end-' + pid2 + '\').value)">' +
      '<span class="text-muted">to</span>' +
      '<input type="date" id="tl-custom-end-' + pid2 + '" value="' + (r.customEnd||'') + '" onchange="setTaskTimelineCustomDates(\'' + pid2 + '\',document.getElementById(\'tl-custom-start-' + pid2 + '\').value,this.value)">' +
      '</div>' : '';
  // Range tabs stay top-left; the baseline picker sits top-right of the same row.
  var rangeControl = '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">' + rangeTabs + baselinePicker + '</div>' + rangeCustom;

  var legend = '<div style="display:flex;gap:14px;flex-wrap:wrap;margin:14px 0">' + Object.keys(TASK_STATUS_COLORS).map(function(s){
    return '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#666"><span style="width:10px;height:10px;border-radius:3px;background:' + TASK_STATUS_COLORS[s] + ';display:inline-block"></span>' + s + '</div>';
  }).join('') + '</div>';

  if (!outlineRows.length) {
    return toggleBtn + '<div class="card mb-16" style="background:#faf9f7">' + rangeControl + legend +
      '<div class="text-muted" style="font-size:12px">No tasks to show</div></div>';
  }

  function dayOffset(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return (d - winStart) / 86400000;
  }

  var numTicks = Math.max(1, Math.ceil(totalDays / 7));
  var tickLabels = [];
  for (var ti = 0; ti < numTicks; ti++) {
    var td = new Date(winStart.getTime() + ti * 7 * 86400000);
    tickLabels.push(td.toLocaleString('en-US', { month: 'short', day: 'numeric' }));
  }
  var headerRow = '<div style="display:flex;gap:8px;margin-bottom:10px;padding-left:202px">' + tickLabels.map(function(lbl){ return '<div style="flex:1;font-size:11px;color:#999;text-align:center">' + lbl + '</div>'; }).join('') + '</div>';

  var rows = outlineRows.map(function(row) {
    var t = row.task;
    var collapsedNow = !!taskOutlineCollapsed[t.id];
    var chevron = row.hasChildren
      ? '<button class="btn btn-sm" style="padding:1px 4px;margin-right:4px" onclick="toggleTaskOutlineCollapse(\'' + pid2 + '\',\'' + t.id + '\')"><i class="ti ' + (collapsedNow?'ti-chevron-right':'ti-chevron-down') + '"></i></button>'
      : '<span style="display:inline-block;width:22px"></span>';

    var ghostHtml = '';
    if (selectedBaseline) {
      var be = selectedBaseline.entries[t.id];
      if (be && be.start && be.end) {
        var bs = new Date(be.start + 'T00:00:00'), bex = new Date(be.end + 'T00:00:00');
        if (bex >= winStart && bs <= winEnd) {
          var bStartOffset = Math.max(0, (bs - winStart) / 86400000);
          var bEndOffset = Math.min(totalDays, (bex - winStart) / 86400000 + 1);
          var bWidthPct = Math.max(1, bEndOffset - bStartOffset) / totalDays * 100;
          var bLeftPct = bStartOffset / totalDays * 100;
          ghostHtml = '<div class="tl-bar-ghost" style="left:' + bLeftPct + '%;width:' + bWidthPct + '%" title="Baseline: ' + be.start + ' – ' + be.end + '"></div>';
        }
      }
    }

    var barHtml;
    if (t.start && t.end) {
      var s = new Date(t.start + 'T00:00:00'), e = new Date(t.end + 'T00:00:00');
      if (e >= winStart && s <= winEnd) {
        var startOffset = Math.max(0, dayOffset(t.start));
        var endOffset = Math.min(totalDays, dayOffset(t.end) + 1);
        var widthPct = Math.max(1, endOffset - startOffset) / totalDays * 100;
        var leftPct = startOffset / totalDays * 100;
        var barColor = TASK_STATUS_COLORS[t.status] || '#534AB7';
        var lateNow = isTaskLate(t);
        barHtml = '<div class="tl-wrap">' + ghostHtml + '<div class="tl-bar" style="left:' + leftPct + '%;width:' + widthPct + '%;background:' + barColor + (lateNow ? ';box-shadow:inset 0 0 0 2px #B23A3A' : '') + '" title="' + (lateNow ? 'Late — ' : '') + t.status + '">' + (lateNow ? '<i class="ti ti-alert-triangle"></i> ' : '') + t.status + '</div></div>';
      } else {
        barHtml = '<div class="tl-wrap">' + ghostHtml + '<span class="text-muted" style="font-size:12px">Outside this range</span></div>';
      }
    } else {
      barHtml = '<div class="tl-wrap">' + ghostHtml + '<span class="text-muted" style="font-size:12px">No dates set</span></div>';
    }
    return '<div class="tl-row"><div class="tl-label" style="padding-left:' + (row.depth * 16) + 'px" title="' + t.title + '">' + chevron + '<span class="text-muted" style="margin-right:5px">' + row.taskNumber + '</span>' + t.title + '</div>' + barHtml + '</div>';
  }).join('');

  return toggleBtn +
    '<div class="card mb-16" style="background:#faf9f7">' + rangeControl + legend +
    (selectedBaseline ? '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#666;margin:-8px 0 14px"><span style="width:14px;height:6px;border:1px dashed #8a8a82;border-radius:3px;display:inline-block"></span> Baseline (' + (selectedBaseline.label || 'plan') + ')</div>' : '') +
    headerRow + rows + '</div>';
}

function toggleTaskDescription(pid2, taskId) {
  var key = pid2 + '|' + taskId;
  taskDescOpen[key] = !taskDescOpen[key];
  refreshTaskView();
}

function toggleTaskOutlineCollapse(pid2, taskId) {
  taskOutlineCollapsed[taskId] = !taskOutlineCollapsed[taskId];
  refreshTaskView();
}

// ── Task scheduling: working-day math, dependencies, rollups ───────────────
// "Duration" is in *working* days (Mon-Fri only) -- there's no holiday
// calendar anywhere in the app, so weekends are the only thing skipped.

function isWeekendDate(d) { var day = d.getDay(); return day === 0 || day === 6; }

function nextWorkingDay(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  while (isWeekendDate(d)) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// duration counts inclusively -- a 1-day task starts and ends the same day.
function addWorkingDays(dateStr, duration) {
  var d = new Date(dateStr + 'T00:00:00');
  var remaining = Math.max(1, duration) - 1;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (!isWeekendDate(d)) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

function workingDaysBetween(startStr, endStr) {
  if (!startStr || !endStr || endStr < startStr) return null;
  var d = new Date(startStr + 'T00:00:00'), end = new Date(endStr + 'T00:00:00');
  var count = 0;
  while (d <= end) { if (!isWeekendDate(d)) count++; d.setDate(d.getDate() + 1); }
  return count;
}

// Would setting task `taskId`'s predecessor to `candidateId` create a cycle?
// Walks candidateId's own predecessor chain looking for taskId.
function wouldCreateDependencyCycle(tasks, taskId, candidateId) {
  if (!candidateId) return false;
  if (candidateId === taskId) return true;
  var byId = {}; tasks.forEach(function(t){ byId[t.id] = t; });
  var seen = {}; var cur = candidateId;
  while (cur) {
    if (cur === taskId) return true;
    if (seen[cur]) return true; // an existing cycle elsewhere -- bail rather than loop forever
    seen[cur] = true;
    var t = byId[cur];
    cur = t ? t.dependsOnTaskId : null;
  }
  return false;
}

// Recomputes every task's start/end that's *derived* rather than directly
// set: a summary task (has children) always takes the earliest start /
// latest end among its descendants; a leaf task with a predecessor starts
// the next working day after that predecessor ends; a task with a
// duration but no predecessor gets its end filled in from start+duration.
// Runs as a fixed-point iteration (not a real topological sort) since it's
// cheap at these task counts and handles dependency + hierarchy edges
// uniformly without needing to build an explicit DAG order.
function recalcProjectSchedule(p) {
  var tasks = p.tasks;
  var byId = {}; tasks.forEach(function(t){ byId[t.id] = t; });
  var childrenOf = {};
  tasks.forEach(function(t){ var k = t.parentTaskId || 'root'; (childrenOf[k] = childrenOf[k] || []).push(t); });
  var changed = [];
  function markChanged(t) { if (changed.indexOf(t) < 0) changed.push(t); }

  var maxPasses = tasks.length + 2;
  for (var pass = 0; pass < maxPasses; pass++) {
    var anyChange = false;
    tasks.forEach(function(t) {
      var kids = childrenOf[t.id] || [];
      if (kids.length) {
        var starts = kids.map(function(k){ return k.start; }).filter(Boolean);
        var ends = kids.map(function(k){ return k.end; }).filter(Boolean);
        if (!starts.length || !ends.length) return;
        var newStart = starts.reduce(function(a,b){ return a < b ? a : b; });
        var newEnd = ends.reduce(function(a,b){ return a > b ? a : b; });
        if (t.start !== newStart || t.end !== newEnd) {
          t.start = newStart; t.end = newEnd;
          anyChange = true; markChanged(t);
        }
      } else if (t.dependsOnTaskId) {
        var pred = byId[t.dependsOnTaskId];
        if (!pred || !pred.end) return;
        var newStart2 = nextWorkingDay(pred.end);
        var newEnd2 = t.duration ? addWorkingDays(newStart2, t.duration) : t.end;
        if (t.start !== newStart2 || (t.duration && t.end !== newEnd2)) {
          t.start = newStart2; if (t.duration) t.end = newEnd2;
          anyChange = true; markChanged(t);
        }
      } else if (t.duration && t.start) {
        var newEnd3 = addWorkingDays(t.start, t.duration);
        if (t.end !== newEnd3) { t.end = newEnd3; anyChange = true; markChanged(t); }
      }
    });
    if (!anyChange) break;
  }
  return changed;
}

async function persistScheduleChanges(changed) {
  for (var i = 0; i < changed.length; i++) {
    await sb.from('tasks').update({ start_date: changed[i].start || null, end_date: changed[i].end || null }).eq('id', changed[i].id);
  }
}

// Every mutation that can affect derived dates (edit, add, delete, promote,
// demote) funnels through here so summary rollups and dependency chains
// never silently fall out of sync with what's actually in the outline.
async function recalcAndPersist(p) {
  var changed = recalcProjectSchedule(p);
  if (changed.length) await persistScheduleChanges(changed);
  return changed;
}

// Flattens a project's tasks into a depth-first outline (parent, then its
// children in position order, then the next sibling), matching how
// Microsoft Planner/Project number and indent task rows. Task numbers are
// assigned over the FULL outline before collapse-hiding, so collapsing a
// parent doesn't renumber the tasks still below it.
function buildTaskOutline(tasks) {
  var byParent = {};
  tasks.forEach(function(t){
    var key = t.parentTaskId || 'root';
    (byParent[key] = byParent[key] || []).push(t);
  });
  Object.keys(byParent).forEach(function(k){
    byParent[k].sort(function(a,b){ return (a.position||0) - (b.position||0); });
  });
  var flat = [];
  function walk(parentKey, depth, ancestorCollapsed) {
    (byParent[parentKey] || []).forEach(function(t) {
      var hasChildren = !!(byParent[t.id] && byParent[t.id].length);
      flat.push({ task: t, depth: depth, hasChildren: hasChildren, hidden: ancestorCollapsed });
      walk(t.id, depth + 1, ancestorCollapsed || !!taskOutlineCollapsed[t.id]);
    });
  }
  walk('root', 0, false);
  flat.forEach(function(row, i){ row.taskNumber = i + 1; });
  return flat;
}

function taskSiblings(tasks, parentId) {
  return tasks.filter(function(t){ return (t.parentTaskId || null) === (parentId || null); })
    .sort(function(a,b){ return (a.position||0) - (b.position||0); });
}

// Deleting a task cascades to its subtree at the DB layer (ON DELETE CASCADE);
// mirror that locally so orphaned subtask rows don't linger until reload.
function collectTaskDescendantIds(tasks, rootId) {
  var ids = [];
  function walk(parentId) {
    tasks.forEach(function(t){
      if ((t.parentTaskId || null) === parentId) { ids.push(t.id); walk(t.id); }
    });
  }
  walk(rootId);
  return ids;
}

async function reassignTaskPositions(orderedTasks) {
  for (var i = 0; i < orderedTasks.length; i++) {
    orderedTasks[i].position = i;
    await sb.from('tasks').update({ position: i }).eq('id', orderedTasks[i].id);
  }
}

async function demoteTask(pid2, taskId) {
  taskActionMenuOpen = null;
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var outline = buildTaskOutline(pr.tasks);
  var idx = outline.findIndex(function(row){ return row.task.id === taskId; });
  if (idx <= 0) { showToast('Cannot demote the first task'); return; }
  var task = outline[idx].task;
  var newParent = outline[idx - 1].task;
  var result = await sb.from('tasks').update({ parent_task_id: newParent.id }).eq('id', taskId);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  task.parentTaskId = newParent.id;
  var newSiblings = taskSiblings(pr.tasks, newParent.id).filter(function(t){ return t.id !== taskId; });
  newSiblings.push(task);
  await reassignTaskPositions(newSiblings);
  await recalcAndPersist(pr);
  refreshTaskView();
}

async function promoteTask(pid2, taskId) {
  taskActionMenuOpen = null;
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var task = pr.tasks.find(function(x){ return x.id === taskId; });
  if (!task.parentTaskId) { showToast('This task is already top-level'); return; }
  var oldParent = pr.tasks.find(function(x){ return x.id === task.parentTaskId; });
  var newParentId = oldParent.parentTaskId || null;
  var result = await sb.from('tasks').update({ parent_task_id: newParentId }).eq('id', taskId);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  task.parentTaskId = newParentId;
  var newSiblings = taskSiblings(pr.tasks, newParentId).filter(function(t){ return t.id !== taskId; });
  var oldParentIdx = newSiblings.findIndex(function(t){ return t.id === oldParent.id; });
  newSiblings.splice(oldParentIdx + 1, 0, task);
  await reassignTaskPositions(newSiblings);
  await recalcAndPersist(pr);
  refreshTaskView();
}

async function reorderTask(pid2, fromId, toId) {
  var pr = D.projects.find(function(x){ return x.id === pid2; });
  var fromTask = pr.tasks.find(function(x){ return x.id === fromId; });
  var toTask = pr.tasks.find(function(x){ return x.id === toId; });
  if (!fromTask || !toTask) return;
  if ((fromTask.parentTaskId || null) !== (toTask.parentTaskId || null)) {
    showToast('Drag within the same level to reorder — use Promote/Demote to move between levels');
    return;
  }
  var siblings = taskSiblings(pr.tasks, fromTask.parentTaskId || null);
  var fromIdx = siblings.indexOf(fromTask);
  var toIdx = siblings.indexOf(toTask);
  if (fromIdx < 0 || toIdx < 0) return;
  siblings.splice(fromIdx, 1);
  siblings.splice(toIdx, 0, fromTask);
  await reassignTaskPositions(siblings);
  refreshTaskView();
}

function attachTaskDragHandlers() {
  var draggedId = null;
  document.querySelectorAll('.task-row-draggable').forEach(function(el) {
    el.addEventListener('dragstart', function(ev) {
      draggedId = el.getAttribute('data-task-id');
      el.classList.add('task-dragging');
      ev.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', function() { el.classList.remove('task-dragging'); });
    el.addEventListener('dragover', function(ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; });
    el.addEventListener('drop', function(ev) {
      ev.preventDefault();
      var fromId = draggedId;
      var toId = el.getAttribute('data-task-id');
      var pid2 = el.getAttribute('data-pid');
      draggedId = null;
      if (!fromId || fromId === toId) return;
      reorderTask(pid2, fromId, toId);
    });
  });
}

var taskActionMenuOpen = null;
function toggleTaskActionMenu(ev, pid2, taskId) {
  ev.stopPropagation();
  taskActionMenuOpen = (taskActionMenuOpen === taskId) ? null : taskId;
  refreshTaskView();
}
document.addEventListener('click', function(ev) {
  if (taskActionMenuOpen) { taskActionMenuOpen = null; refreshTaskView(); }
});

function addTaskBefore(pid2, taskId) {
  taskActionMenuOpen = null;
  openTaskModal(pid2, null, { relativeToTaskId: taskId, relativePosition: 'before' });
}
function addTaskAfter(pid2, taskId) {
  taskActionMenuOpen = null;
  openTaskModal(pid2, null, { relativeToTaskId: taskId, relativePosition: 'after' });
}

// ── Task Grid view: a dense, spreadsheet-style alternative to the List
// view -- every schedulable field is an inline input/select that saves on
// blur/change, plus a bottom row for adding several tasks in a row without
// opening the Add Task modal each time. Hierarchy (promote/demote/drag) is
// still List-only; Grid is for editing field values quickly, not
// restructuring the outline.
function taskGridHtml(p, list, editable) {
  var assigneePool = individualResourceNames().concat(teamNames());
  var rows = list.map(function(row){ return taskGridRowHtml(p, row, assigneePool, editable); }).join('');

  var header = '<tr><th style="width:36px">ID</th><th style="min-width:220px">Task</th><th style="min-width:150px">Assignee</th><th style="min-width:120px">Status</th>' +
    '<th style="min-width:130px">Start</th><th style="min-width:130px">End</th><th style="min-width:90px">Duration</th><th style="min-width:180px">Depends on</th><th></th></tr>';

  var emptyNote = (p.tasks.length && !list.length)
    ? '<div class="empty-state" style="padding:20px"><i class="ti ti-search"></i><p>No tasks match your filters</p></div>'
    : '';

  return emptyNote + '<div class="table-wrap"><table class="tasks-table"><thead>' + header + '</thead><tbody>' +
    rows + (editable ? taskGridAddRowHtml(p) : '') +
    '</tbody></table></div>';
}

function taskGridRowHtml(p, row, assigneePool, editable) {
  var task = row.task;
  var hasChildren = row.hasChildren;
  var datesLocked = hasChildren || !!task.dependsOnTaskId;
  var indentPx = row.depth * 18;

  var assigneeOpts = '<option value=""' + (!task.assignee?' selected':'') + '>Unassigned</option>' +
    assigneePool.map(function(n){ return '<option' + (task.assignee===n?' selected':'') + '>' + n + '</option>'; }).join('');
  var statusOpts = ['To Do','In Progress','On Hold','Done'].map(function(s){ return '<option' + (task.status===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var descendantIds = collectTaskDescendantIds(p.tasks, task.id);
  var dependsPool = p.tasks.filter(function(x){ return x.id !== task.id && descendantIds.indexOf(x.id) < 0; });
  var dependsOpts = '<option value=""' + (!task.dependsOnTaskId?' selected':'') + '>— None —</option>' +
    dependsPool.map(function(x){ return '<option value="' + x.id + '"' + (task.dependsOnTaskId===x.id?' selected':'') + '>' + x.title + '</option>'; }).join('');

  var titleCell = '<div style="display:flex;align-items:center;gap:4px;padding-left:' + indentPx + 'px">' +
    (editable
      ? '<input type="text" class="grid-cell-input" value="' + (task.title||'').replace(/"/g,'&quot;') + '" onblur="gridSaveTitle(\'' + p.id + '\',\'' + task.id + '\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()">'
      : '<span style="font-size:13px">' + task.title + '</span>') +
    '</div>';
  var assigneeCell = editable
    ? '<select class="grid-cell-select" onchange="gridSaveAssignee(\'' + p.id + '\',\'' + task.id + '\',this.value)">' + assigneeOpts + '</select>'
    : '<span style="font-size:13px">' + (task.assignee || '—') + '</span>';
  var statusCell = editable
    ? '<select class="grid-cell-select" onchange="gridSaveStatus(\'' + p.id + '\',\'' + task.id + '\',this.value)">' + statusOpts + '</select>'
    : bdg(task.status);
  var startCell = '<input type="date" class="grid-cell-input" value="' + (task.start||'') + '"' + (datesLocked || !editable ? ' disabled' : ' onchange="gridSaveDate(\'' + p.id + '\',\'' + task.id + '\',\'start\',this.value)"') + '>';
  var endCell = '<input type="date" class="grid-cell-input" value="' + (task.end||'') + '"' + (datesLocked || !editable ? ' disabled' : ' onchange="gridSaveDate(\'' + p.id + '\',\'' + task.id + '\',\'end\',this.value)"') + '>';
  var durationCell = hasChildren
    ? '<span class="text-muted" style="font-size:12px">—</span>'
    : (editable
      ? '<input type="number" min="1" class="grid-cell-input" value="' + (task.duration||'') + '" onchange="gridSaveDuration(\'' + p.id + '\',\'' + task.id + '\',this.value)">'
      : '<span style="font-size:13px">' + (task.duration||'—') + '</span>');
  var dependsCell = hasChildren
    ? '<span class="text-muted" style="font-size:12px">—</span>'
    : (editable
      ? '<select class="grid-cell-select" onchange="gridSaveDependsOn(\'' + p.id + '\',\'' + task.id + '\',this.value)">' + dependsOpts + '</select>'
      : '<span style="font-size:13px">' + (function(){ var d = p.tasks.find(function(x){ return x.id === task.dependsOnTaskId; }); return d ? d.title : '—'; })() + '</span>');
  var actionsCell = editable ? '<button class="btn btn-sm btn-danger" title="Delete" onclick="gridDeleteTask(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-trash"></i></button>' : '';

  return '<tr><td class="text-muted">' + row.taskNumber + '</td><td>' + titleCell + '</td><td>' + assigneeCell + '</td><td>' + statusCell + '</td>' +
    '<td>' + startCell + '</td><td>' + endCell + '</td><td>' + durationCell + '</td><td>' + dependsCell + '</td><td>' + actionsCell + '</td></tr>';
}

function taskGridAddRowHtml(p) {
  return '<tr class="grid-add-row"><td class="text-muted"><i class="ti ti-plus"></i></td>' +
    '<td colspan="8"><input type="text" class="grid-cell-input" id="grid-add-title-' + p.id + '" placeholder="Add a task… (press Enter)" onkeydown="if(event.key===\'Enter\'){gridAddTask(\'' + p.id + '\',this.value);this.value=\'\';}"></td></tr>';
}

async function gridSaveTitle(pid, taskId, value) {
  var pr = D.projects.find(function(x){ return x.id === pid; });
  var task = pr.tasks.find(function(x){ return x.id === taskId; });
  var newTitle = value.trim();
  if (!newTitle) { showToast('Title cannot be empty'); refreshTaskView(); return; }
  if (newTitle === task.title) return;
  var result = await sb.from('tasks').update({ title: newTitle }).eq('id', taskId);
  if (result.error) { showToast('Could not save: ' + result.error.message); refreshTaskView(); return; }
  var old = task.title;
  task.title = newTitle;
  task.log = task.log || [];
  task.log.push(await writeLog('task_log', 'task_id', taskId, 'Updated', 'Title: "' + old + '" → "' + newTitle + '"'));
  refreshTaskView();
}

async function gridSaveAssignee(pid, taskId, value) {
  var pr = D.projects.find(function(x){ return x.id === pid; });
  var task = pr.tasks.find(function(x){ return x.id === taskId; });
  var name = value || '';
  if ((task.assignee||'') === name) return;
  var resource = name ? resolveResource(name) : null;
  var result = await sb.from('tasks').update({ assignee_id: resource ? resource.id : null, assignee_name: name || null }).eq('id', taskId);
  if (result.error) { showToast('Could not save: ' + result.error.message); refreshTaskView(); return; }
  var old = task.assignee || '(unassigned)';
  task.assignee = name; task.assigneeId = resource ? resource.id : null;
  task.log = task.log || [];
  task.log.push(await writeLog('task_log', 'task_id', taskId, 'Updated', 'Assignee: "' + old + '" → "' + (name||'(unassigned)') + '"'));
  await ensureOnTeam(pr, resource);
  refreshTaskView();
}

async function gridSaveStatus(pid, taskId, value) {
  var pr = D.projects.find(function(x){ return x.id === pid; });
  var task = pr.tasks.find(function(x){ return x.id === taskId; });
  if (task.status === value) return;
  var result = await sb.from('tasks').update({ status: value }).eq('id', taskId);
  if (result.error) { showToast('Could not save: ' + result.error.message); refreshTaskView(); return; }
  var old = task.status;
  task.status = value;
  task.log = task.log || [];
  task.log.push(await writeLog('task_log', 'task_id', taskId, 'Updated', 'Status: "' + old + '" → "' + value + '"'));
  refreshTaskView();
}

async function gridSaveDate(pid, taskId, field, value) {
  var pr = D.projects.find(function(x){ return x.id === pid; });
  var task = pr.tasks.find(function(x){ return x.id === taskId; });
  var newStart = field === 'start' ? (value || null) : task.start;
  var newEnd = field === 'end' ? (value || null) : task.end;
  if (newStart && newEnd && newEnd < newStart) { showToast('End date cannot be before start date'); refreshTaskView(); return; }
  var dbField = field === 'start' ? 'start_date' : 'end_date';
  var payload = {}; payload[dbField] = value || null;
  var result = await sb.from('tasks').update(payload).eq('id', taskId);
  if (result.error) { showToast('Could not save: ' + result.error.message); refreshTaskView(); return; }
  var old = field === 'start' ? task.start : task.end;
  if (field === 'start') task.start = value || null; else task.end = value || null;
  task.log = task.log || [];
  task.log.push(await writeLog('task_log', 'task_id', taskId, 'Updated', (field==='start'?'Start date':'End date') + ': "' + (old||'—') + '" → "' + (value||'—') + '"'));
  await recalcAndPersist(pr);
  refreshTaskView();
}

async function gridSaveDuration(pid, taskId, value) {
  var pr = D.projects.find(function(x){ return x.id === pid; });
  var task = pr.tasks.find(function(x){ return x.id === taskId; });
  var newDuration = value ? parseInt(value, 10) : null;
  if (newDuration != null && (isNaN(newDuration) || newDuration < 1)) { showToast('Duration must be a positive number'); refreshTaskView(); return; }
  if ((task.duration||null) === newDuration) return;
  var result = await sb.from('tasks').update({ duration_days: newDuration }).eq('id', taskId);
  if (result.error) { showToast('Could not save: ' + result.error.message); refreshTaskView(); return; }
  var old = task.duration;
  task.duration = newDuration;
  task.log = task.log || [];
  task.log.push(await writeLog('task_log', 'task_id', taskId, 'Updated', 'Duration: "' + (old||'—') + '" → "' + (newDuration||'—') + '"'));
  await recalcAndPersist(pr);
  refreshTaskView();
}

async function gridSaveDependsOn(pid, taskId, value) {
  var pr = D.projects.find(function(x){ return x.id === pid; });
  var task = pr.tasks.find(function(x){ return x.id === taskId; });
  var newDependsOn = value || null;
  if ((task.dependsOnTaskId||null) === newDependsOn) return;
  if (newDependsOn && wouldCreateDependencyCycle(pr.tasks, taskId, newDependsOn)) { showToast('That would create a circular dependency'); refreshTaskView(); return; }
  var result = await sb.from('tasks').update({ depends_on_task_id: newDependsOn }).eq('id', taskId);
  if (result.error) { showToast('Could not save: ' + result.error.message); refreshTaskView(); return; }
  var oldTask = pr.tasks.find(function(x){ return x.id === task.dependsOnTaskId; });
  var newTask = pr.tasks.find(function(x){ return x.id === newDependsOn; });
  task.dependsOnTaskId = newDependsOn;
  task.log = task.log || [];
  task.log.push(await writeLog('task_log', 'task_id', taskId, 'Updated', 'Depends on: "' + (oldTask?oldTask.title:'—') + '" → "' + (newTask?newTask.title:'—') + '"'));
  await recalcAndPersist(pr);
  refreshTaskView();
}

async function gridDeleteTask(pid, taskId) {
  var pr = D.projects.find(function(x){ return x.id === pid; });
  var idx = pr.tasks.findIndex(function(x){ return x.id === taskId; });
  if (idx < 0) return;
  if (!confirm('Delete "' + pr.tasks[idx].title + '"?')) return;
  await deleteTask(pid, idx);
}

async function gridAddTask(pid, titleRaw) {
  var title = (titleRaw || '').trim();
  if (!title) return;
  var p = D.projects.find(function(x){ return x.id === pid; });
  var fullOutline = buildTaskOutline(p.tasks);
  var relTask = fullOutline.length ? fullOutline[fullOutline.length - 1].task : null;
  var parentIdForInsert = relTask ? (relTask.parentTaskId || null) : null;
  var insertResult = await sb.from('tasks').insert({
    project_id: pid, title: title, status: 'To Do', parent_task_id: parentIdForInsert, position: 0
  }).select().single();
  if (insertResult.error) { showToast('Could not save: ' + insertResult.error.message); return; }
  var t2 = {
    id: insertResult.data.id, title: title, description: '', assignee: '', assigneeId: null, status: 'To Do',
    start: null, end: null, duration: null, dependsOnTaskId: null, parentTaskId: parentIdForInsert, position: 0,
    log: [], comments: [], checklist: [], tags: []
  };
  t2.log.push(await writeLog('task_log', 'task_id', t2.id, 'Created', ''));
  p.tasks.push(t2);
  var newSiblings = taskSiblings(p.tasks, parentIdForInsert).filter(function(x){ return x.id !== t2.id; });
  newSiblings.push(t2);
  await reassignTaskPositions(newSiblings);
  await recalcAndPersist(p);
  refreshTaskView();
  setTimeout(function(){ var el = document.getElementById('grid-add-title-' + pid); if (el) el.focus(); }, 0);
}

function teamNames() {
  return (D.resources || []).filter(function(r){ return r.type === 'team'; }).map(function(r){ return r.name; });
}

function individualResourceNames() {
  return (D.resources || []).filter(function(r){ return r.type === 'individual'; }).sort(function(a,b){ return a.name.localeCompare(b.name); }).map(function(r){ return r.name; });
}

function resolveAssignee(name) {
  return (D.peopleByName && D.peopleByName[name]) ? D.peopleByName[name] : null;
}

function resolveResource(name) {
  return D.resources.find(function(r){ return r.name === name; }) || null;
}

function roleLabel(r) {
  var m = { admin:'PMO Admin', member:'Member' };
  return m[r] || r;
}

function actorName() { return currentUser() || roleLabel(D.role); }

function pushLog(item, action, detail) {
  item.log = item.log || [];
  item.log.push({ date: new Date().toISOString().split('T')[0], actor: actorName(), action: action, detail: detail || '' });
}

var taskViewState = {};
function getTaskState(pid) {
  if (!taskViewState[pid]) taskViewState[pid] = { search:'', fAssignee:[], fStatus:[], openFilter:null, viewMode:'list' };
  return taskViewState[pid];
}

function setTaskViewMode(pid, mode) {
  getTaskState(pid).viewMode = mode;
  refreshTaskView();
}

var todoViewState = {};
function getTodoState(pid) {
  if (!todoViewState[pid]) todoViewState[pid] = { search:'', fAssignee:[], fStatus:[], openFilter:null };
  return todoViewState[pid];
}

var raidLogOpen = {};
var taskLogOpen = {};
var milestoneLogOpen = {};
var taskCommentsOpen = {};
var taskChecklistOpen = {};
var taskTimelineOpen = {};
var taskBaselineSelected = {};
var teamAddKind = {};
var teamTierInfoOpen = {};
var projectInfoEditing = null;
var peopleEditing = false;
var PROJECT_INFO_SUBTABS = [
  { key:'identity',      label:'Identity & Classification',   icon:'ti-tag' },
  { key:'schedule',      label:'Schedule, Stage & Lifecycle',  icon:'ti-calendar-time' },
  { key:'progress',      label:'Progress & Health',            icon:'ti-chart-line' },
  { key:'financials',    label:'Financials',                   icon:'ti-currency-dollar' },
  { key:'relationships', label:'Relationships',                icon:'ti-link' },
  { key:'audit',         label:'System & Audit',               icon:'ti-history' }
];
var taskDescOpen = {};
var taskOutlineCollapsed = {};
var todoLogOpen = {};
var todoCommentsOpen = {};
var todoDescOpen = {};
var raidSearchState = {};
var docFolderState = {};
var roadmapMsState = { sort:'due', dir:'asc', search:'', fProject:[], fOwner:[], openFilter:null };
var roadmapCategoryFilter = 'All';
var PHASE_COLORS = { 'Not Started':'#9B9B93', 'Discovery':'#185FA5', 'Design':'#534AB7', 'Build':'#1D9E75', 'Testing':'#EF9F27', 'Deployment':'#D85A30', 'Monitor':'#993556' };
var TASK_STATUS_COLORS = { 'To Do':'#9B9B93', 'In Progress':'#534AB7', 'On Hold':'#C98A2C', 'Done':'#1D9E75' };
var dashProjState = { sort:'priority', dir:'asc', search:'', fStatus:[], fPhase:[], openFilter:null, tagFilter:[] };
var resourcesPageState = { tab:'individual', sort:'firstName', dir:'asc', search:'', expandedId:null, expandedMembersId:null };
var capacityPageState = { tab:'individual', search:'', dateMode:'next12', dateYear: new Date().getFullYear(), expandedId:null, expandedAvgId:null };
var portfolioTagFilter = [];
var prioritizeBacklogState = { category:'All', dragPid:null, search:'', materializing:false, lastMove:null };
var backlogProjState = { sort:'name', dir:'asc', search:'', category:'All',
  filters: { tags:[], value:[], priority:[], owner:[] }, openFilter:null };
var plannedProjState = { sort:'name', dir:'asc', search:'', category:'All',
  filters: { tags:[], priority:[], owner:[] }, openFilter:null };
var activeProjState = { sort:'name', dir:'asc', search:'', category:'All',
  filters: { tags:[], status:[], priority:[], phase:[], owner:[] }, openFilter:null };
var completedProjState = { sort:'completedAt', dir:'desc', search:'', category:'All', tagFilter:[] };
var roadmapTagFilter = [];
var roadmapRangeMode = 'next12'; // 'next12' | 'last12' | 'year'
var roadmapSelectedYear = new Date().getFullYear();
var futurePlanningRangeMode = 'next12';
var futurePlanningSelectedYear = new Date().getFullYear();
var futurePlanningCategoryFilter = 'All';
var allProjectsState = {
  search: '', sort: 'name', dir: 'asc', selected: {},
  filters: { category:[], businessUnit:[], stage:[], status:[], phase:[], priority:[], value:[], sponsor:[], owner:[] },
  openFilter: null
};
var tagAdminState = { expandedId: null };
var myTasksState = { kind:'plan', sort:'end', dir:'asc', search:'', tab:'open', fProject:[], fStatus:[], openFilter:null };
var myProjectsPageState = { tab:'sponsor' };
var myCapacityPageState = { month:'current' };
var programsPageState = { search:'', sort:'id', dir:'asc' };
var PRIORITY_RANK = { 'Critical':0, 'High':1, 'Medium':2, 'Low':3, 'Needs prioritization':4 };
var rejectedFilterState = { range:'30' };

// Capacity planning: a team member's involvement in a given project is set
// as one of these tiers (by the project owner or an admin) rather than a
// raw percent, and each tier maps to an assumed %-of-time for the heat map.
// This is the base rate at a "typical" (M) project size -- see
// TSHIRT_SIZE_LOAD_MULTIPLIER and effectiveAllocationPct below for how a
// project's actual size scales it, and how a person can override the result
// for themselves from My Capacity. Both maps below are just fallback
// defaults -- loadCapacityWeights() overwrites them from the
// capacity_weights table at boot, and an admin can edit that table from
// Administration > Capacity Weights.
var ALLOCATION_TIERS = ['Owner/Lead', 'Core', 'Light touch'];
var ALLOCATION_TIER_PERCENT = { 'Owner/Lead': 50, 'Core': 25, 'Light touch': 10 };
// Being the Owner/Lead of an XL project is assumed to carry more load than
// the same role on an XS one -- this scales the base tier % by T-shirt size,
// centered on M (1x). A project with no size set also uses 1x.
var TSHIRT_SIZE_LOAD_MULTIPLIER = { XS: 0.2, S: 0.5, M: 1, L: 1.5, XL: 1.8 };
// Used to convert an accepted work request's estimated_hours into a %-of-month
// figure for the capacity heat map.
var STANDARD_WORK_WEEK_HOURS = 40;

function capacityWeightTierInputId(tier) { return 'caw-tier-' + tier.replace(/[^a-zA-Z0-9]/g, ''); }
function capacityWeightSizeInputId(sz) { return 'caw-size-' + sz; }

// Overwrites ALLOCATION_TIER_PERCENT / TSHIRT_SIZE_LOAD_MULTIPLIER from the
// single admin-editable row in capacity_weights, if one exists -- falls
// back to leaving the hardcoded defaults above in place otherwise (e.g.
// before the row has ever been created).
async function loadCapacityWeights() {
  var result = await sb.from('capacity_weights').select('*').eq('id', 'default');
  var row = result.data && result.data[0];
  if (!row) return;
  if (row.tier_percent) ALLOCATION_TIER_PERCENT = row.tier_percent;
  if (row.size_multiplier) TSHIRT_SIZE_LOAD_MULTIPLIER = row.size_multiplier;
}

// The actual %-of-time contribution a team member's tier implies for one
// project: the tier's base % weighted by the project's T-shirt size, unless
// that person has set their own override from My Capacity, which always
// wins over the computed default.
function effectiveAllocationPct(p, resourceId) {
  var override = p.teamOverrides ? p.teamOverrides[resourceId] : null;
  if (override != null) return override;
  var tier = p.teamTiers ? p.teamTiers[resourceId] : null;
  if (!tier) return 0;
  var base = ALLOCATION_TIER_PERCENT[tier] || 0;
  var mult = TSHIRT_SIZE_LOAD_MULTIPLIER[p.tshirtSize] || 1;
  return Math.round(base * mult);
}

function buildQuarterOptions() {
  var thisYear = new Date().getFullYear();
  var opts = [];
  for (var y = thisYear - 1; y <= thisYear + 4; y++) {
    for (var q = 1; q <= 4; q++) opts.push({ quarter: q, year: y, idx: y * 4 + q, label: 'Q' + q + ' ' + y });
  }
  return opts;
}

var STAGE_SORT_RANK = { active: 0, planned: 1, backlog: 2, hold: 3, complete: 4 };

var CHANGE_LOG_FIELDS = {
  name: 'Project Name', stage: 'Stage', status: 'Status', phase: 'Phase', priority: 'Priority',
  value: 'Value Area', businessUnit: 'Business Unit', sponsor: 'Sponsor', owner: 'Owner', requirementsOwner: 'Requirements Owner',
  start: 'Start Date', end: 'Target End Date', progress: 'Progress %', health: 'Health',
  description: 'Description', blockers: 'Blockers', holdReason: 'Hold Reason', deliveryMethodology: 'Delivery Methodology',
  tshirtSize: 'T-shirt Size'
};

// Compares a "before" snapshot to an "after" snapshot across every tracked
// Overview field and logs whichever ones actually changed. Pass before=null
// to log every present field as a fresh value (used when a project is first
// created from an approved request).
async function logProjectChanges(projectId, before, after, source) {
  var rows = [];
  Object.keys(CHANGE_LOG_FIELDS).forEach(function(field) {
    if (!(field in after) || after[field] === undefined) return; // field wasn't actually part of this update
    var oldVal = before ? before[field] : undefined;
    var newVal = after[field];
    var oldNorm = (oldVal == null || oldVal === '') ? null : String(oldVal);
    var newNorm = (newVal == null || newVal === '') ? null : String(newVal);
    if (oldNorm === newNorm) return;
    rows.push({
      project_id: projectId, field_name: field, field_label: CHANGE_LOG_FIELDS[field],
      old_value: oldNorm, new_value: newNorm,
      changed_by: D.currentProfile.id, changed_by_name: D.currentProfile.display_name, source: source
    });
  });
  if (!rows.length) return;
  await sb.from('project_change_log').insert(rows);
}

function teamPickerHtml(prefix, toggleFnName, selectedNames) {
  var individuals = individualResourceNames();
  var teams = D.resources.filter(function(r){ return r.type === 'team'; }).sort(function(a,b){ return a.name.localeCompare(b.name); });

  var individualRows = individuals.map(function(n) {
    var chk = selectedNames.indexOf(n) >= 0 ? ' checked' : '';
    return '<label class="member-check ' + prefix + '-team-row" data-name="' + n.toLowerCase() + '"><input type="checkbox" data-name="' + n.replace(/"/g,'&quot;') + '" onchange="' + toggleFnName + '(this)"' + chk + '> ' + n + '</label>';
  }).join('');

  var teamRows = teams.map(function(t) {
    var chk = selectedNames.indexOf(t.name) >= 0 ? ' checked' : '';
    return '<label class="member-check ' + prefix + '-team-row" data-name="' + t.name.toLowerCase() + '" style="display:flex;justify-content:space-between;align-items:center;grid-column:1 / -1">' +
      '<span><input type="checkbox" data-name="' + t.name.replace(/"/g,'&quot;') + '" onchange="' + toggleFnName + '(this)"' + chk + '> ' + t.name + '</span>' +
      (t.managerName ? '<span class="text-muted" style="font-size:11px">Manager: ' + t.managerName + '</span>' : '') +
    '</label>';
  }).join('');

  return '<div class="form-group"><div class="form-label">Team</div>' +
    '<div class="tab-bar" style="margin-bottom:8px">' +
      '<div class="tab active" id="' + prefix + '-team-tab-individual" onclick="switchTeamPickerTab(\'' + prefix + '\',\'individual\')">Individual</div>' +
      '<div class="tab" id="' + prefix + '-team-tab-team" onclick="switchTeamPickerTab(\'' + prefix + '\',\'team\')">Team</div>' +
    '</div>' +
    '<input type="text" id="' + prefix + '-team-search" placeholder="Search…" oninput="filterTeamPickerList(\'' + prefix + '\', this.value)">' +
    '<div id="' + prefix + '-team-list-individual" style="max-height:200px;overflow-y:auto;margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px">' + (individualRows || '<span class="text-muted" style="font-size:13px">No individuals available</span>') + '</div>' +
    '<div id="' + prefix + '-team-list-team" style="max-height:200px;overflow-y:auto;margin-top:8px;display:none;grid-template-columns:1fr;gap:6px">' + (teamRows || '<span class="text-muted" style="font-size:13px">No teams available</span>') + '</div>' +
  '</div>';
}

window.switchTeamPickerTab = function(prefix, tab) {
  document.getElementById(prefix + '-team-tab-individual').className = 'tab' + (tab === 'individual' ? ' active' : '');
  document.getElementById(prefix + '-team-tab-team').className = 'tab' + (tab === 'team' ? ' active' : '');
  document.getElementById(prefix + '-team-list-individual').style.display = tab === 'individual' ? 'grid' : 'none';
  document.getElementById(prefix + '-team-list-team').style.display = tab === 'team' ? 'grid' : 'none';
};

window.filterTeamPickerList = function(prefix, query) {
  var q = query.trim().toLowerCase();
  document.querySelectorAll('#' + prefix + '-team-list-individual .' + prefix + '-team-row, #' + prefix + '-team-list-team .' + prefix + '-team-row').forEach(function(row) {
    row.style.display = row.getAttribute('data-name').indexOf(q) >= 0 ? 'flex' : 'none';
  });
};

var CONFIDENCE_LEVELS = ['Rough guess','Somewhat confident','High confidence'];
function confidenceOptsHtml(selected) {
  return '<option value="">— Confidence —</option>' + CONFIDENCE_LEVELS.map(function(c){ return '<option' + (selected===c?' selected':'') + '>' + c + '</option>'; }).join('');
}

function computeStageFromDates(start, end) {
  if (!start && !end) return 'backlog';
  if (!start || !end) return 'planned';
  var today = new Date().toISOString().slice(0, 10);
  if (start <= today && today <= end) return 'active';
  return 'planned';
}

function fmtCost(n) {
  if (!n && n !== 0) return '—';
  return '$' + Number(n).toLocaleString();
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

// ── Late ─────────────────────────────────────────────────────────────────
// One shared "late" concept, reused everywhere a date is checked against
// today for a project, task, milestone, or work request that hasn't been
// closed out. A plain ISO-date string compare is enough since every date
// field involved is a bare YYYY-MM-DD, not a timestamp.
function todayStr() { return new Date().toISOString().slice(0, 10); }

function isProjectLate(p) { return !!(p.end && p.stage !== 'complete' && p.end < todayStr()); }
function isTaskLate(t) { return !!(t.end && t.status !== 'Done' && t.end < todayStr()); }
function isTodoLate(td) { return !!(td.due && td.status !== 'Done' && td.due < todayStr()); }
function isMilestoneLate(m) { return !!(m.date && !m.done && m.date < todayStr()); }
function isWorkRequestLate(w) {
  if (w.status === 'Accepted') return !!(w.estimatedCompletionDate && w.estimatedCompletionDate < todayStr());
  if (w.status === 'New' || w.status === 'Needs Info') return !!(w.requestedCompletionDate && w.requestedCompletionDate < todayStr());
  return false;
}

function lateBadgeHtml(isLate, title) {
  return isLate ? '<span class="badge badge-red badge-late" title="' + (title || 'Past its date and not yet closed out') + '"><i class="ti ti-alert-triangle" style="margin-right:4px"></i>Late</span>' : '';
}

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function daysLate(p) { return Math.round((new Date(todayStr()) - new Date(p.end)) / 86400000); }

// Issues carry a severity field directly; risks don't, so this derives an
// equivalent High/Medium/Low from the probability/impact pair already
// captured on every risk, using a simple probability-band x impact-weight
// score -- good enough to rank risks and issues on one shared scale.
function riskEffectiveSeverity(risk) {
  var impactWeight = { Low:1, Medium:2, High:3 }[risk.impact] || 2;
  var probBand = (risk.probability||0) >= 67 ? 3 : (risk.probability||0) >= 34 ? 2 : 1;
  var score = impactWeight * probBand;
  return score >= 6 ? 'High' : score >= 3 ? 'Medium' : 'Low';
}

// RAID items don't carry their own created_at on the client, so "days open"
// is read off the item's own log -- the "Created" entry if present, else the
// earliest logged date.
function raidOpenedDate(item) {
  var created = (item.log || []).filter(function(l){ return l.action === 'Created'; })[0];
  if (created) return created.date;
  var dates = (item.log || []).map(function(l){ return l.date; }).filter(Boolean).sort();
  return dates.length ? dates[0] : null;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
}

function bdg(s) {
  if (!s) return '';
  var map = {
    'On Track':'badge-teal','At Risk':'badge-amber','Planning':'badge-blue','Blocked':'badge-red','Complete':'badge-green','Completed':'badge-green','Not Started':'badge-gray',
    'Pending':'badge-amber','Approved':'badge-teal','Rejected':'badge-red','Backlog':'badge-amber','Active':'badge-teal','Planned':'badge-blue','Revoked':'badge-gray',
    'Done':'badge-teal','In Progress':'badge-purple','To Do':'badge-gray',
    'Open':'badge-red','Closed':'badge-teal',
    'Critical':'badge-red','High':'badge-coral','Medium':'badge-amber','Low':'badge-blue','Needs prioritization':'badge-gray'
  };
  return '<span class="badge ' + (map[s] || 'badge-gray') + '">' + s + '</span>';
}

function badgeIf(cls, s) {
  return s ? '<span class="badge ' + cls + '">' + s + '</span>' : '';
}

function hdot(h) {
  var c = { green:'#1D9E75', amber:'#EF9F27', red:'#E24B4A' }[h] || '#ccc';
  return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + c + ';margin-right:6px;vertical-align:middle"' + (h ? '' : ' title="Health not set"') + '></span>';
}

// Compact stand-in for a text label: a colored dot, same visual language as
// hdot(). Rough guess/Somewhat confident/High confidence map red/amber/green.
function confidenceDot(level) {
  if (!level) return '';
  var c = { 'Rough guess':'#E24B4A', 'Somewhat confident':'#EF9F27', 'High confidence':'#1D9E75' }[level] || '#ccc';
  return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + c + ';margin-left:5px;vertical-align:middle" title="Value confidence: ' + level + '"></span>';
}

function freqAbbr(freq) {
  return freq === 'Monthly' ? '/mo' : freq === 'Annually' ? '/yr' : '';
}

function stagePill(s) {
  var m = { backlog:{bg:'#FAEEDA',c:'#633806',l:'Backlog'}, planned:{bg:'#E6F1FB',c:'#0C447C',l:'Planned'}, active:{bg:'#E1F5EE',c:'#085041',l:'Active'}, complete:{bg:'#f0ede8',c:'#444',l:'Completed'}, hold:{bg:'#FBE7E3',c:'#993C1D',l:'Hold'} };
  var x = m[s] || m.backlog;
  return '<span class="stage-pill" style="background:' + x.bg + ';color:' + x.c + '">' + x.l + '</span>';
}

// Re-rendering a page replaces #content wholesale, which resets scroll to
// the top -- fine for navigation, disruptive for something like toggling a
// checkbox in a long list. Wrap the re-render so the user stays put.
function withScrollPreserved(fn) {
  // #content scrolls (overflow-y: auto), and a long table inside it is
  // often further wrapped in its own .table-wrap (overflow: auto, capped
  // height) that scrolls independently. The window/body never scrolls at
  // all. Both #content and .table-wrap get torn down and rebuilt by the
  // innerHTML replace, so both reset to scrollTop 0 -- save and restore
  // whichever of the two is actually holding the scroll position.
  var contentEl = document.getElementById('content');
  var contentY = contentEl ? contentEl.scrollTop : 0;
  var wrapEl = contentEl ? contentEl.querySelector('.table-wrap') : null;
  var wrapY = wrapEl ? wrapEl.scrollTop : 0;
  fn();
  contentEl = document.getElementById('content');
  if (contentEl) contentEl.scrollTop = contentY;
  wrapEl = contentEl ? contentEl.querySelector('.table-wrap') : null;
  if (wrapEl) wrapEl.scrollTop = wrapY;
}

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type === 'error' ? '#A32D2D' : '#1a1a1a';
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3000);
}

function addNotif(sub, msg, type) {
  if (!sub) return;
  D.notifications.push({ submitter:sub, msg:msg, type:type, date:new Date().toISOString().split('T')[0] });
}

function tb(title, actions) {
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-actions').innerHTML = actions || '';
}

function showModal(html, wide) {
  document.getElementById('modal-root').innerHTML =
    '<div class="modal-overlay" id="mov">' +
    '<div class="modal' + (wide ? ' modal-wide' : '') + '">' + html + '</div></div>';
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

// ── Navigation ──────────────────────────────────────────────────────────────

var currentPage = '';
var projectDetailReferrer = null;

var NAV_DEF = {
  admin: [
    { s:'Overview', items:[{id:'dashboard',icon:'ti-layout-dashboard',label:'Dashboard'},{id:'portfolio-health',icon:'ti-activity',label:'Portfolio Health'},{id:'roadmap',icon:'ti-road',label:'Roadmap'},{id:'future-planning',icon:'ti-calendar-time',label:'Future Planning'},{id:'prioritize-backlog',icon:'ti-arrows-sort',label:'Prioritize Backlog'},{id:'portfolio',icon:'ti-folder-open',label:'Portfolio'},{id:'programs',icon:'ti-folders',label:'Programs'}] },
    { s:'My Requests', items:[
      {id:'submit',       icon:'ti-send',  label:'Submit a Request'},
      {id:'my-requests',  icon:'ti-clock', label:'My Requests', badge:'my-requests'}
    ]},
    { s:'Projects', items:[
      {id:'projects', icon:'ti-briefcase',      label:'Active'},
      {id:'planned',  icon:'ti-calendar-event', label:'Planned'},
      {id:'backlog',  icon:'ti-stack-2',        label:'Backlog',         badge:'backlog'},
      {id:'hold',     icon:'ti-player-pause',   label:'Hold'},
      {id:'completed',icon:'ti-circle-check',   label:'Completed'},
      {id:'requests', icon:'ti-inbox',          label:'Requests',        badge:'pending'}
    ]},
    { s:'Resources', items:[
      {id:'resources', icon:'ti-users', label:'Resources'},
      {id:'capacity',  icon:'ti-gauge', label:'Capacity'}
    ]},
    { s:'Data Tools', items:[
      {id:'import-projects', icon:'ti-file-upload', label:'Import Projects'},
      {id:'import-work-requests', icon:'ti-file-upload', label:'Import Work Requests'},
      {id:'export-projects', icon:'ti-file-export', label:'Export Projects'}
    ]},
    { s:'Administration', items:[
      {id:'admin-users', icon:'ti-users-group', label:'Manage Users'},
      {id:'admin-tags', icon:'ti-tag', label:'Manage Tags'},
      {id:'admin-values', icon:'ti-list-details', label:'Manage Values'},
      {id:'all-projects', icon:'ti-table', label:'All Projects'},
      {id:'admin-work-requests', icon:'ti-clipboard-list', label:'Work Requests'},
      {id:'admin-personal-todos', icon:'ti-list-check', label:'Personal To-Dos'},
      {id:'admin-capacity-weights', icon:'ti-adjustments', label:'Capacity Weights'},
      {id:'deleted-items', icon:'ti-trash', label:'Deleted Items'}
    ]}
  ],
  member: [
    { s:'Overview', items:[
      {id:'dashboard', icon:'ti-layout-dashboard', label:'Dashboard'},
      {id:'roadmap',   icon:'ti-road',             label:'Roadmap'},
      {id:'portfolio', icon:'ti-folder-open',      label:'Portfolio'},
      {id:'programs',  icon:'ti-folders',           label:'Programs'}
    ]},
    { s:'My Requests', items:[
      {id:'submit',       icon:'ti-send',  label:'Submit a Request'},
      {id:'my-requests',  icon:'ti-clock', label:'My Requests', badge:'my-requests'}
    ]},
    { s:'Projects', items:[
      {id:'projects',  icon:'ti-briefcase',      label:'Active'},
      {id:'planned',   icon:'ti-calendar-event', label:'Planned'},
      {id:'backlog',   icon:'ti-stack-2',        label:'Backlog',         badge:'backlog'},
      {id:'hold',      icon:'ti-player-pause',   label:'Hold'},
      {id:'completed', icon:'ti-circle-check',   label:'Completed'}
    ]}
  ]
};

// Which sidebar sections are collapsed, keyed by section title. Persisted
// across sessions since this is a personal layout preference, not app state.
var navCollapsedState = (function() {
  try { return JSON.parse(localStorage.getItem('pmoHubNavCollapsed') || '{}'); } catch (e) { return {}; }
})();

// No stored entry means never touched -- defaults to collapsed.
function isNavSectionCollapsed(s) {
  return navCollapsedState[s] !== undefined ? navCollapsedState[s] : true;
}

function toggleNavSection(s) {
  navCollapsedState[s] = !isNavSectionCollapsed(s);
  try { localStorage.setItem('pmoHubNavCollapsed', JSON.stringify(navCollapsedState)); } catch (e) {}
  renderNav();
}

function renderNav() {
  var defs = (NAV_DEF[D.role] || []).slice();
  if (hasAssignedWork()) {
    // Right after Overview, not appended at the end.
    defs.splice(1, 0, { s:'My Work', items:[
      {id:'my-projects', icon:'ti-briefcase',   label:'My Projects'},
      {id:'my-tasks',    icon:'ti-check',       label:'My Tasks', badge:'my-tasks'},
      {id:'my-work-requests', icon:'ti-list-check', label:'My Work Requests', badge:'my-work-requests'},
      {id:'my-capacity', icon:'ti-gauge',       label:'My Capacity'}
    ]});
  }
  var anyExpanded = defs.some(function(sec){ return !isNavSectionCollapsed(sec.s); });
  var h = '<div class="nav-toggle-all" onclick="toggleAllNavSections()">' + (anyExpanded ? 'Collapse all' : 'Expand all') + '</div>';
  defs.forEach(function(sec) {
    var collapsed = isNavSectionCollapsed(sec.s);
    h += '<div class="sidebar-section" onclick="toggleNavSection(\'' + sec.s.replace(/'/g,"\\'") + '\')">' +
      '<span>' + sec.s + '</span><i class="ti ti-chevron-' + (collapsed ? 'right' : 'down') + '"></i></div>';
    if (!collapsed) {
      sec.items.forEach(function(item) {
        var cnt = item.badge === 'pending' ? pendingCount() : item.badge === 'backlog' ? backlogCount() : item.badge === 'my-tasks' ? myOpenTasksCount() : item.badge === 'my-work-requests' ? myAssignedWorkRequestsNewCount() : item.badge === 'my-requests' ? mySubmittedWorkRequestsNeedsInfoCount() : 0;
        var badge = cnt > 0 ? '<span class="nav-badge">' + cnt + '</span>' : '';
        h += '<div class="nav-item' + (currentPage === item.id ? ' active' : '') + '" onclick="nav(\'' + item.id + '\')">' +
             '<i class="ti ' + item.icon + '"></i>' + item.label + badge + '</div>';
      });
    }
  });
  document.getElementById('nav-menu').innerHTML = h;

  window.toggleAllNavSections = function() {
    var collapseThem = anyExpanded;
    defs.forEach(function(sec){ navCollapsedState[sec.s] = collapseThem; });
    try { localStorage.setItem('pmoHubNavCollapsed', JSON.stringify(navCollapsedState)); } catch (e) {}
    renderNav();
  };
}

var PAGE_RENDERERS = {
  dashboard:pgDashboard, portfolio:pgPortfolio, requests:pgRequests,
  backlog:pgBacklog, planned:pgPlanned, projects:pgProjects,
  completed:pgCompleted, roadmap:pgRoadmap, resources:pgResources,
  submit:pgSubmit, 'my-requests':pgMyRequests,
  'my-projects':pgMyProjectsResource, 'my-tasks':pgMyTasks,
  'import-projects':pgImportProjects, 'import-work-requests':pgImportWorkRequests, 'export-projects':pgExportProjects, 'admin-users':pgAdminUsers, 'admin-tags':pgAdminTags, 'admin-values':pgManageValues, 'future-planning':pgFuturePlanning, hold:pgHold, 'all-projects':pgAllProjects,
  'prioritize-backlog':pgPrioritizeBacklog, capacity:pgCapacity, programs:pgPrograms, 'deleted-items':pgDeletedItems,
  'my-work-requests':pgMyWorkRequests, 'admin-work-requests':pgAdminWorkRequests, 'admin-personal-todos':pgAdminPersonalTodos,
  'my-capacity':pgMyCapacity, 'admin-capacity-weights':pgAdminCapacityWeights,
  'portfolio-health':pgPortfolioHealth
};

function pageAllowedForRole(page, role) {
  if (page === 'my-projects' || page === 'my-tasks' || page === 'my-work-requests' || page === 'my-capacity') {
    return hasAssignedWork();
  }
  var defs = NAV_DEF[role] || [];
  for (var i = 0; i < defs.length; i++) {
    for (var j = 0; j < defs[i].items.length; j++) {
      if (defs[i].items[j].id === page) return true;
    }
  }
  return false;
}

function renderPage(page) {
  if (!PAGE_RENDERERS[page]) page = 'dashboard';
  currentPage = page;
  renderNav();
  if (!pageAllowedForRole(page, D.role)) {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>You do not have permission to view this page.</p></div>';
    return;
  }
  PAGE_RENDERERS[page]();
}

function nav(page) {
  renderPage(page);
  var targetHash = '#/' + page;
  if (location.hash !== targetHash) location.hash = targetHash;
}

function goToProject(pid, tab) {
  if (currentPage !== 'projectDetail') projectDetailReferrer = currentPage;
  pgProjectDetail(pid, tab || 'overview');
  var targetHash = '#/project/' + pid + '/' + (tab || 'overview');
  if (location.hash !== targetHash) location.hash = targetHash;
}

function handleRoute() {
  var hash = location.hash;
  var m = hash.match(/^#\/project\/([^\/]+)(?:\/([^\/]+))?/);
  if (m) { pgProjectDetail(m[1], m[2] || 'overview'); return; }
  var mProg = hash.match(/^#\/program\/([^\/]+)/);
  if (mProg) { pgProgramDetail(mProg[1]); return; }
  var m2 = hash.match(/^#\/([a-zA-Z0-9_-]+)/);
  if (m2) { renderPage(m2[1]); return; }
  renderPage('dashboard');
}
window.addEventListener('hashchange', handleRoute);

async function bootAppForUser(skipReload) {
  // supabase-js query/RPC builders are lazy thenables -- the request never
  // actually goes out unless something awaits or .then()s it.
  sb.rpc('touch_last_active').then(function(){}, function(){});
  var realRole = D.currentProfile.role;
  document.getElementById('current-user-display').textContent =
    D.currentProfile.display_name + ' · ' + roleLabel(realRole);

  var previewControl = document.getElementById('preview-role-control');
  var banner = document.getElementById('viewing-as-banner');
  var bannerText = document.getElementById('viewing-as-banner-text');

  previewControl.style.display = realRole === 'admin' ? 'block' : 'none';

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-root').style.display = 'flex';

  if (!skipReload) {
    document.getElementById('content').innerHTML = '<div class="empty-state" style="padding:60px"><i class="ti ti-loader-2"></i><p>Loading your projects…</p></div>';
    var loaded = await Promise.all([loadAllProjects(), loadResources(), loadRequests(), loadTags(), loadFieldOptions(), loadPrograms(), loadWorkRequests(), loadCapacityWeights()]);
    D.projects = loaded[0];
    D.resources = loaded[1];
    D.requests = loaded[2];
    var tagData = loaded[3];
    D.programs = loaded[5];
    D.workRequests = loaded[6];
    D.tags = tagData.tags;
    D.projects.forEach(function(p){ p.tags = tagData.projectTagNames[p.id] || []; p.tasks.forEach(function(t){ t.tags = tagData.taskTagNames[t.id] || []; }); });
    D.resources.forEach(function(r){ r.tags = tagData.resourceTagNames[r.id] || []; });
    await autoActivatePlannedProjects();
  }

  // Populate the View As list now that D.resources is guaranteed to be loaded.
  if (realRole === 'admin') {
    var specificResource = D.viewingAsMode === 'resource' && D.viewingAsResourceId
      ? D.resources.find(function(r){ return r.id === D.viewingAsResourceId; }) : null;
    var opts = '<option value=""' + (!D.viewingAsMode ? ' selected' : '') + '>My View</option>' +
      '<option value="member"' + (D.viewingAsMode === 'member' ? ' selected' : '') + '>Member</option>';
    if (specificResource) opts += '<option value="resource" selected>' + specificResource.name + '</option>';
    opts += '<option value="specific">Specific User…</option>';
    document.getElementById('preview-role-select').innerHTML = opts;
  }

  // Apply the "view as" override last, so a fresh data reload can never stomp it.
  var viewingResource = (D.viewingAsMode === 'resource' && D.viewingAsResourceId)
    ? D.resources.find(function(r){ return r.id === D.viewingAsResourceId; }) : null;
  if (viewingResource) {
    banner.style.display = 'flex';
    bannerText.textContent = 'Viewing as ' + viewingResource.name + ' (Member)' + (viewingResource.userId ? '' : ' — no account yet, this previews what they\'d see once granted access');
    D.role = 'member';
    D.myResourceId = viewingResource.id;
  } else if (D.viewingAsMode === 'member') {
    banner.style.display = 'flex';
    bannerText.textContent = 'Viewing as a Member (generic — no specific person or assignments)';
    D.role = 'member';
    D.myResourceId = null;
  } else {
    banner.style.display = 'none';
    D.role = realRole;
    var myResource = D.resources.find(function(r){ return r.userId === D.currentProfile.id; });
    D.myResourceId = myResource ? myResource.id : null;
  }
  renderNav();

  if (location.hash && location.hash.length > 1) {
    handleRoute();
  } else {
    nav('dashboard');
  }
}

function setViewAsMode(mode, resourceId) {
  if (D.currentProfile.role !== 'admin') return; // safety check; UI is already hidden for non-admins
  D.viewingAsMode = mode || null;
  D.viewingAsResourceId = mode === 'resource' ? (resourceId || null) : null;
  bootAppForUser(true);
}

function exitViewAs() {
  setViewAsMode(null, null);
}

function onViewAsSelectChange(val) {
  if (val === 'specific') { openViewAsUserSearchModal(); return; }
  if (val === '') { setViewAsMode(null, null); return; }
  if (val === 'member') { setViewAsMode('member', null); return; }
  if (val === 'resource') return; // already viewing this specific person; selecting it again is a no-op
}

function openViewAsUserSearchModal() {
  var people = D.resources.filter(function(r){ return r.type === 'individual'; }).sort(function(a,b){ return a.name.localeCompare(b.name); });
  function render(query) {
    var q = (query || '').trim().toLowerCase();
    var matches = people.filter(function(r){ return r.name.toLowerCase().indexOf(q) >= 0; });
    var listHtml = matches.map(function(r) {
      return '<div class="member-check" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:6px 4px" onclick="setViewAsMode(\'resource\',\'' + r.id + '\')">' +
        '<span>' + r.name + (r.userId ? '' : ' <span class="text-muted" style="font-size:11px">(no account yet)</span>') + '</span>' +
        '<i class="ti ti-chevron-right" style="color:#ccc"></i></div>';
    }).join('');
    showModal('<div class="modal-title">View as specific user <button class="btn btn-sm" onclick="closeModal();bootAppForUser(true)"><i class="ti ti-x"></i></button></div>' +
      '<input type="text" id="vau-search" placeholder="Search people…" value="' + query.replace(/"/g,'&quot;') + '" oninput="window.__vauSearch(this.value)">' +
      '<div style="max-height:260px;overflow-y:auto;margin-top:8px">' + (listHtml || '<span class="text-muted" style="font-size:13px">No matching people</span>') + '</div>');
    var el = document.getElementById('vau-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  }
  window.__vauSearch = function(v) { render(v); };
  render('');
}

async function refreshProjects() {
  D.projects = await loadAllProjects();
}

async function refreshResources() {
  D.resources = await loadResources();
}

async function refreshRequests() {
  D.requests = await loadRequests();
}

async function refreshTags() {
  var tagData = await loadTags();
  D.tags = tagData.tags;
  D.projects.forEach(function(p){ p.tags = tagData.projectTagNames[p.id] || []; p.tasks.forEach(function(t){ t.tags = tagData.taskTagNames[t.id] || []; }); });
  D.resources.forEach(function(r){ r.tags = tagData.resourceTagNames[r.id] || []; });
}

async function refreshPrograms() {
  D.programs = await loadPrograms();
}

// ── Dashboard ───────────────────────────────────────────────────────────────

function pgDashboard() {
  tb('Dashboard');
  var ps = myProjects();
  var active = ps.filter(function(p){ return p.stage === 'active'; });
  var onT = active.filter(function(p){ return p.status === 'On Track'; }).length;
  var atR = active.filter(function(p){ return p.status === 'At Risk';  }).length;

  var dst = dashProjState;
  var statusChoicesD = []; active.forEach(function(p){ if (p.status && statusChoicesD.indexOf(p.status) < 0) statusChoicesD.push(p.status); });
  var phaseChoicesD = []; active.forEach(function(p){ if (p.phase && phaseChoicesD.indexOf(p.phase) < 0) phaseChoicesD.push(p.phase); });

  var displayed = active.slice();
  if (dst.search) { var dq = dst.search.toLowerCase(); displayed = displayed.filter(function(p){ return p.name.toLowerCase().indexOf(dq) >= 0; }); }
  if (dst.fStatus.length) displayed = displayed.filter(function(p){ return dst.fStatus.indexOf(p.status) >= 0; });
  if (dst.fPhase.length) displayed = displayed.filter(function(p){ return dst.fPhase.indexOf(p.phase) >= 0; });
  if (dst.tagFilter.length) displayed = displayed.filter(function(p){ return dst.tagFilter.some(function(t){ return (p.tags||[]).indexOf(t) >= 0; }); });
  if (dst.sort) {
    displayed.sort(function(a, b) {
      var av, bv;
      if (dst.sort === 'priority') { av = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 9; bv = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 9; }
      else if (dst.sort === 'progress') { av = a.progress||0; bv = b.progress||0; }
      else { av = (a[dst.sort]||'').toString().toLowerCase(); bv = (b[dst.sort]||'').toString().toLowerCase(); }
      if (av < bv) return dst.dir === 'asc' ? -1 : 1;
      if (av > bv) return dst.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function dArrow(col) { if (dst.sort !== col) return ''; return '<span class="sort-arrow">' + (dst.dir === 'asc' ? '▲' : '▼') + '</span>'; }
  function dFilterIcon(col, choices) {
    if (!choices.length) return '';
    var active2 = (dst[col]||[]).length > 0;
    return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleDashFilterPanel(\'' + col + '\')"><i class="ti ti-filter' + (active2 ? ' th-filter-active' : '') + '"></i></button>';
  }

  var projRows = displayed.map(function(p) {
    var tagsLine = (p.tags && p.tags.length)
      ? '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;font-weight:400">' + p.tags.map(function(tg){ return tagBadge(tg); }).join('') + '</div>'
      : '';
    return '<tr>' +
      '<td class="bold"><div>' + hdot(p.health) + p.name + '</div>' + tagsLine + '</td><td>' + bdg(p.status) + ' ' + lateBadgeHtml(isProjectLate(p)) + '</td><td>' + bdg(p.priority) + '</td>' +
      '<td>' + badgeIf('badge-gray', p.phase) + '</td>' +
      '<td><div style="display:flex;align-items:center;gap:8px"><div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:' + p.progress + '%"></div></div><span class="text-muted">' + p.progress + '%</span></div></td>' +
      '<td class="text-muted">' + (p.owner || '—') + '</td>' +
      '<td>' + (p.blockers ? '<span style="color:#993C1D;font-size:12px"><i class="ti ti-alert-triangle"></i> Yes</span>' : '<span class="text-muted">—</span>') + '</td>' +
      '<td><button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button></td></tr>';
  }).join('');

  var dashSearchBar = '<div class="task-filter-bar"><input type="text" id="dash-proj-search" placeholder="Search projects by name…" value="' + dst.search.replace(/"/g,'&quot;') + '" oninput="onDashProjSearch(this.value)"></div>';

  var pendRows = '';
  if (D.role === 'admin') {
    D.requests.filter(function(r){ return r.status === 'Pending'; }).forEach(function(r) {
      pendRows += '<tr><td class="bold">' + r.title + '</td><td>' + r.submitter + '</td><td>' + r.dept + '</td>' +
        '<td>' + bdg(r.priority) + '</td><td><span class="badge badge-purple">' + r.value + '</span></td>' +
        '<td><button class="btn btn-sm" onclick="reviewRequest(\'' + r.id + '\')"><i class="ti ti-eye"></i> Review</button></td></tr>';
    });
  }

  var rejectedRows = '';
  var rejectedAll = D.requests.filter(function(r){ return r.status === 'Rejected'; });
  var rejRange = rejectedFilterState.range;
  var rejectedList = rejectedAll.filter(function(r){
    if (rejRange === 'all') return true;
    var rd = r.rejectedDate || r.date;
    if (!rd) return true;
    var days = (Date.now() - new Date(rd).getTime()) / 86400000;
    return days <= parseInt(rejRange);
  });
  if (true) { // rejected proposals visible to everyone
    rejectedList.forEach(function(r) {
      rejectedRows += '<tr><td class="bold">' + r.title + '</td><td>' + r.submitter + '</td><td>' + r.dept + '</td>' +
        '<td>' + bdg(r.priority) + '</td><td><span class="badge badge-purple">' + r.value + '</span></td>' +
        '<td class="text-muted">' + (r.rejectedDate || r.date || '—') + '</td>' +
        '<td><button class="btn btn-sm" onclick="reviewRequest(\'' + r.id + '\')"><i class="ti ti-eye"></i> View</button></td></tr>';
    });
  }

  var sponsoredProjects = D.myResourceId ? D.projects.filter(function(p){ return p.sponsorResourceId === D.myResourceId; }) : [];
  var sponsoredRows = sponsoredProjects.map(function(p) {
    return '<tr>' +
      '<td class="bold">' + hdot(p.health) + p.name + '</td>' +
      '<td>' + (EXPORT_STAGE_LABELS[p.stage] || p.stage) + '</td>' +
      '<td>' + (p.estimatedAmount != null ? fmtCost(p.estimatedAmount) : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.costEstimate != null ? fmtCost(p.costEstimate) : '<span class="text-muted">—</span>') + '</td>' +
      '<td><button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button> ' +
        '<button class="btn btn-sm" onclick="openEditProjectFinancialsModal(\'' + p.id + '\')"><i class="ti ti-edit"></i> Edit financials</button></td></tr>';
  }).join('');

  document.getElementById('content').innerHTML =
    '<div class="grid-4 mb-16">' +
      '<div class="metric"><div class="metric-label">Active projects</div><div class="metric-value">' + active.length + '</div></div>' +
      '<div class="metric"><div class="metric-label">On track</div><div class="metric-value" style="color:#1D9E75">' + onT + '</div></div>' +
      '<div class="metric"><div class="metric-label">At risk</div><div class="metric-value" style="color:#EF9F27">' + atR + '</div></div>' +
      (D.role === 'admin'
        ? '<div class="metric"><div class="metric-label">Pending requests</div><div class="metric-value" style="color:#534AB7">' + pendingCount() + '</div></div>'
        : '<div class="metric"><div class="metric-label">In backlog</div><div class="metric-value">' + backlogCount() + '</div></div>') +
    '</div>' +
    '<div class="card mb-16"><div class="section-title">Active projects</div>' + tagFilterBarHtml(dst.tagFilter, 'openDashTagFilter') + dashSearchBar +
      (displayed.length ? '<div class="table-wrap"><table>' +
      '<thead><tr>' +
        '<th class="sortable-th" onclick="setDashProjSort(\'name\')">Project ' + dArrow('name') + '</th>' +
        '<th class="sortable-th"><span onclick="setDashProjSort(\'status\')">Status ' + dArrow('status') + '</span>' + dFilterIcon('fStatus', statusChoicesD) + '</th>' +
        '<th class="sortable-th" onclick="setDashProjSort(\'priority\')">Priority ' + dArrow('priority') + '</th>' +
        '<th class="sortable-th"><span onclick="setDashProjSort(\'phase\')">Phase ' + dArrow('phase') + '</span>' + dFilterIcon('fPhase', phaseChoicesD) + '</th>' +
        '<th class="sortable-th" style="min-width:160px" onclick="setDashProjSort(\'progress\')">Progress ' + dArrow('progress') + '</th>' +
        '<th>Owner</th><th>Blockers</th><th></th></tr></thead>' +
      '<tbody>' + projRows + '</tbody></table></div>'
      : (active.length ? '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No projects match your search/filters</p></div>' : '<div class="empty-state" style="padding:24px"><i class="ti ti-briefcase"></i><p>No active projects</p></div>')) +
    '</div>' +
    (sponsoredProjects.length
      ? '<div class="card mb-16"><div class="section-title">Projects you sponsor <span class="badge badge-purple" style="margin-left:6px">' + sponsoredProjects.length + '</span></div>' +
        '<div class="form-sub" style="margin-bottom:12px">You can see and edit financial detail for these, even though they\'re not otherwise admin-only.</div>' +
        '<div class="table-wrap"><table><thead><tr><th>Project</th><th>Stage</th><th>Estimated value</th><th>Cost estimate</th><th></th></tr></thead>' +
        '<tbody>' + sponsoredRows + '</tbody></table></div></div>' : '') +
    (D.role === 'admin' && pendingCount() > 0
      ? '<div class="card mb-16"><div class="section-title">Pending approval <span class="badge badge-amber" style="margin-left:6px">' + pendingCount() + '</span></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Title</th><th>Submitter</th><th>Dept</th><th>Priority</th><th>Value area</th><th></th></tr></thead>' +
        '<tbody>' + pendRows + '</tbody></table></div></div>' : '') +
    (true // rejected proposals visible to everyone
      ? '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
        '<div class="section-title" style="margin-bottom:0">Rejected proposals <span class="badge badge-gray" style="margin-left:6px">' + rejectedList.length + '</span></div>' +
        '<select id="rej-range" onchange="setRejectedRange(this.value)" style="width:auto;max-width:170px">' +
          '<option value="30"' + (rejRange==='30'?' selected':'') + '>Last 30 days</option>' +
          '<option value="90"' + (rejRange==='90'?' selected':'') + '>Last 90 days</option>' +
          '<option value="365"' + (rejRange==='365'?' selected':'') + '>Last year</option>' +
          '<option value="all"' + (rejRange==='all'?' selected':'') + '>All time</option>' +
        '</select></div>' +
        (rejectedList.length
          ? '<div class="table-wrap"><table><thead><tr><th>Title</th><th>Submitter</th><th>Dept</th><th>Priority</th><th>Value area</th><th>Rejected</th><th></th></tr></thead>' +
            '<tbody>' + rejectedRows + '</tbody></table></div>'
          : '<div class="empty-state" style="padding:24px"><i class="ti ti-mood-empty"></i><p>No rejected proposals in this range</p></div>') +
        '</div>' : '');

  window.setRejectedRange = function(val) { rejectedFilterState.range = val; pgDashboard(); };
  window.setDashProjSort = function(col) {
    if (dst.sort === col) dst.dir = dst.dir === 'asc' ? 'desc' : 'asc'; else { dst.sort = col; dst.dir = 'asc'; }
    pgDashboard();
  };
  window.onDashProjSearch = function(val) {
    dst.search = val;
    pgDashboard();
    var el = document.getElementById('dash-proj-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.toggleDashFilterPanel = function(col) {
    var label = col === 'fStatus' ? 'Status' : 'Phase';
    var choices = col === 'fStatus' ? statusChoicesD : phaseChoicesD;
    openFilterModal(label, choices,
      function() { return dst[col] || []; },
      function(val) { var arr = dst[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { dst[col] = []; },
      pgDashboard
    );
  };
  window.openDashTagFilter = function() {
    openFilterModal('Tags', D.tags.map(function(t){ return t.name; }),
      function() { return dst.tagFilter; },
      function(val) { var i = dst.tagFilter.indexOf(val); if (i>=0) dst.tagFilter.splice(i,1); else dst.tagFilter.push(val); },
      function() { dst.tagFilter = []; },
      pgDashboard
    );
  };
}

// ── Portfolio ───────────────────────────────────────────────────────────────

function pgPortfolio() {
  tb('Portfolio');
  var stageOrder = { active: 0, planned: 1, backlog: 2, hold: 3, complete: 4 };
  var filtered = D.projects.filter(function(p){ return p.stage !== 'complete'; });
  if (portfolioTagFilter.length) filtered = filtered.filter(function(p){ return portfolioTagFilter.some(function(t){ return (p.tags||[]).indexOf(t) >= 0; }); });
  var byVal = {};
  filtered.forEach(function(p){ if (!byVal[p.value]) byVal[p.value] = []; byVal[p.value].push(p); });
  Object.keys(byVal).forEach(function(v) {
    byVal[v].sort(function(a, b) {
      var ar = stageOrder[a.stage]; if (ar == null) ar = 9;
      var br = stageOrder[b.stage]; if (br == null) br = 9;
      return ar - br;
    });
  });
  var cols = ['badge-purple','badge-teal','badge-blue','badge-coral','badge-amber'];
  var i = 0, h = tagFilterBarHtml(portfolioTagFilter, 'openPortfolioTagFilter');
  Object.keys(byVal).forEach(function(v) {
    var cl = cols[i++ % cols.length];
    var cards = byVal[v].map(function(p) {
      var req = p.requestId ? D.requests.find(function(r){ return r.id === p.requestId; }) : null;
      return '<div class="card card-sm" style="cursor:pointer;border:1px solid #e8e8e5;border-radius:10px" onclick="goToProject(\'' + p.id + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px"><span class="bold" style="font-size:13px">' + p.name + '</span>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0">' + stagePill(p.stage) + '<button class="btn btn-sm" onclick="event.stopPropagation();goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button></div></div>' +
        (p.stage === 'hold' && p.holdReason ? '<div class="text-muted mb-12" style="font-size:12px"><i class="ti ti-player-pause"></i> ' + p.holdReason + '</div>' : '') +
        '<div class="text-muted mb-12" style="line-height:1.5">' + (p.description||'') + '</div>' +
        (req && req.cost != null ? '<div class="text-muted mb-12" style="font-size:12px"><i class="ti ti-currency-dollar"></i> Estimated cost: ' + fmtCost(req.cost) + '</div>' : '') +
        '<div class="progress-bar mb-12"><div class="progress-fill" style="width:' + p.progress + '%"></div></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center"><span class="text-muted">' + (p.owner || 'No Owner') + '</span><span class="text-muted">' + (p.end || 'TBD') + ' ' + lateBadgeHtml(isProjectLate(p)) + '</span></div></div>';
    }).join('');
    h += '<div class="card mb-16"><div class="mb-12"><span class="badge ' + cl + '" style="font-size:13px;padding:5px 14px">' + v + '</span></div><div class="grid-2">' + cards + '</div></div>';
  });
  document.getElementById('content').innerHTML = (Object.keys(byVal).length ? h : h + '<div class="empty-state"><i class="ti ti-folder-open"></i><p>No projects yet</p></div>');
  window.openPortfolioTagFilter = function() {
    openFilterModal('Tags', D.tags.map(function(t){ return t.name; }),
      function() { return portfolioTagFilter; },
      function(val) { var i2 = portfolioTagFilter.indexOf(val); if (i2>=0) portfolioTagFilter.splice(i2,1); else portfolioTagFilter.push(val); },
      function() { portfolioTagFilter = []; },
      pgPortfolio
    );
  };
}

// ── Requests ────────────────────────────────────────────────────────────────

var requestsPageState = { activeTab: 'Pending', search: '', sort: 'date', dir: 'desc',
  filters: { submitter:[], businessUnit:[], priority:[], status:[] }, openFilter: null };

function pgRequests() {
  tb('Requests');
  var st = requestsPageState;
  var tabs = ['All','Pending','Backlog','Planned','Active','Rejected','Revoked'];

  var submitterChoices = [], businessUnitChoices = [];
  D.requests.forEach(function(r) {
    if (r.submitter && submitterChoices.indexOf(r.submitter) < 0) submitterChoices.push(r.submitter);
    if (r.businessUnit && businessUnitChoices.indexOf(r.businessUnit) < 0) businessUnitChoices.push(r.businessUnit);
  });
  submitterChoices.sort(); businessUnitChoices.sort();
  var priorityChoices = PRIORITIES.slice();
  var statusChoices = ['Pending','Backlog','Planned','Active','Rejected','Revoked'];

  function filtered(t) {
    var rows = t === 'All' ? D.requests.slice() : D.requests.filter(function(r){ return r.status === t; });
    if (st.search) { var q = st.search.toLowerCase(); rows = rows.filter(function(r){ return r.title.toLowerCase().indexOf(q) >= 0; }); }
    if (st.filters.submitter.length) rows = rows.filter(function(r){ return st.filters.submitter.indexOf(r.submitter) >= 0; });
    if (st.filters.businessUnit.length) rows = rows.filter(function(r){ return st.filters.businessUnit.indexOf(r.businessUnit) >= 0; });
    if (st.filters.priority.length) rows = rows.filter(function(r){ return st.filters.priority.indexOf(r.priority) >= 0; });
    if (st.filters.status.length) rows = rows.filter(function(r){ return st.filters.status.indexOf(r.status) >= 0; });
    rows.sort(function(a,b) {
      var av, bv;
      if (st.sort === 'priority') { av = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 9; bv = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 9; }
      else { av = a[st.sort]; bv = b[st.sort]; av = (av == null ? '' : av); bv = (bv == null ? '' : bv); if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); } }
      var cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return st.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }
  function filterIcon(col, active) { return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleReqFilter(\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>'; }

  function tbl(t) {
    var rows = filtered(t);
    if (!rows.length) return '<div class="empty-state"><i class="ti ti-inbox"></i><p>No matching requests</p></div>';
    return '<div class="table-wrap"><table><thead><tr>' +
      '<th class="sortable-th" onclick="setReqSort(\'title\')">Title ' + arrow('title') + '</th>' +
      '<th class="sortable-th"><span onclick="setReqSort(\'submitter\')">Submitter ' + arrow('submitter') + '</span>' + filterIcon('submitter', st.filters.submitter.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setReqSort(\'businessUnit\')">Business Unit ' + arrow('businessUnit') + '</span>' + filterIcon('businessUnit', st.filters.businessUnit.length>0) + '</th>' +
      '<th class="sortable-th" onclick="setReqSort(\'date\')">Date ' + arrow('date') + '</th>' +
      '<th class="sortable-th"><span onclick="setReqSort(\'priority\')">Priority ' + arrow('priority') + '</span>' + filterIcon('priority', st.filters.priority.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setReqSort(\'status\')">Status ' + arrow('status') + '</span>' + filterIcon('status', st.filters.status.length>0) + '</th>' +
      '<th></th></tr></thead><tbody>' +
      rows.map(function(r) {
        return '<tr><td class="bold">' + r.title + '</td><td>' + r.submitter + '</td><td>' + (r.businessUnit||'—') + '</td><td class="text-muted">' + r.date + '</td>' +
          '<td>' + (r.priority ? bdg(r.priority) : '<span class="text-muted">—</span>') + '</td><td>' + bdg(r.status) + '</td>' +
          '<td><button class="btn btn-sm" onclick="reviewRequest(\'' + r.id + '\')"><i class="ti ti-eye"></i> ' + (D.role === 'admin' && r.status === 'Pending' ? 'Review' : 'View') + '</button>' +
            (D.role === 'admin' ? ' <button class="btn btn-sm btn-danger" onclick="deleteRequest(\'' + r.id + '\')"><i class="ti ti-trash"></i></button>' : '') +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  var tabsHtml = tabs.map(function(t) {
    var extra = t === 'Pending' ? ' <span class="badge badge-amber" style="margin-left:4px">' + pendingCount() + '</span>' : '';
    return '<div class="tab' + (t === st.activeTab ? ' active' : '') + '" id="rtab-' + t + '" onclick="switchRTab(\'' + t + '\')">' + t + extra + '</div>';
  }).join('');

  document.getElementById('content').innerHTML =
    searchBoxHtml(st.search, 'Search requests by title…', 'requests-search', 'onRequestsSearch') +
    '<div class="tab-bar">' + tabsHtml + '</div><div id="req-body">' + tbl(st.activeTab) + '</div>';

  window.onRequestsSearch = function(v) {
    st.search = v; pgRequests();
    var el = document.getElementById('requests-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setReqSort = function(col) { if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; } pgRequests(); };
  window.toggleReqFilter = function(col) {
    var labelMap = { submitter:'Submitter', businessUnit:'Business Unit', priority:'Priority', status:'Status' };
    var choicesMap = { submitter:submitterChoices, businessUnit:businessUnitChoices, priority:priorityChoices, status:statusChoices };
    openFilterModal(labelMap[col], choicesMap[col],
      function() { return st.filters[col]; },
      function(val) { var arr = st.filters[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { st.filters[col] = []; },
      pgRequests
    );
  };
  window.switchRTab = function(t) { st.activeTab = t; pgRequests(); };
}

var reviewFinalizeDrafts = {};

function captureFinalizeDraft(id) {
  var priorityEl = document.getElementById('rv-priority');
  if (!priorityEl) return; // finalize section wasn't showing - nothing to capture
  reviewFinalizeDrafts[id] = {
    priority: priorityEl.value, value: document.getElementById('rv-value').value,
    businessUnit: document.getElementById('rv-bu').value,
    tshirtSize: document.getElementById('rv-tshirt').value,
    deliveryMethodology: document.getElementById('rv-methodology').value,
    start: document.getElementById('rv-start').value, end: document.getElementById('rv-end').value,
    quarterStart: document.getElementById('rv-q-start') ? document.getElementById('rv-q-start').value : '',
    quarterEnd: document.getElementById('rv-q-end') ? document.getElementById('rv-q-end').value : '',
    categories: Array.from(document.querySelectorAll('.rv-category-cb')).filter(function(cb){ return cb.checked; }).map(function(cb){ return cb.value; }),
    feedback: document.getElementById('rfb') ? document.getElementById('rfb').value : ''
  };
}

function reviewRequest(id) {
  var r = D.requests.find(function(x){ return x.id === id; });
  var canApprove = D.role === 'admin' && r.status === 'Pending';
  var canResubmit = (r.status === 'Rejected' || r.status === 'Revoked') && (r.submitterId === D.currentProfile.id || D.role === 'admin');
  var isAdmin = D.role === 'admin';
  var isOwnPending = r.status === 'Pending' && r.submitterId === D.currentProfile.id;
  var canEditRequest = isAdmin || isOwnPending;
  var linkedP = r.linkedProject ? D.projects.find(function(p){ return p.id === r.linkedProject; }) : null;

  var canFinancials = canViewFinancials();
  var estimateLabel = r.estimatedType ? 'Estimated ' + r.estimatedType : null;
  var estimateDisplay = (canFinancials && r.estimatedAmount != null)
    ? '<div><div class="form-label">' + estimateLabel + '</div>' + fmtCost(r.estimatedAmount) + (r.estimatedFrequency ? ' / ' + r.estimatedFrequency.toLowerCase() : '') + (r.valueConfidence ? ' <span class="badge badge-gray" style="font-size:10px">' + r.valueConfidence + '</span>' : '') + '</div>'
    : '';
  var costDisplay = (canFinancials && r.costEstimate != null)
    ? '<div><div class="form-label">Cost estimate</div>' + fmtCost(r.costEstimate) + (r.costConfidence ? ' <span class="badge badge-gray" style="font-size:10px">' + r.costConfidence + '</span>' : '') + '</div>'
    : '';
  var opportunityDisplay = r.opportunityType === 'Something else' ? (r.opportunityTypeOther || 'Something else') : (r.opportunityType || '—');

  var html =
    '<div class="modal-title"><div>' +
      '<div style="font-size:16px;font-weight:600;margin-bottom:8px">' + r.title + '</div>' +
      '<div style="display:flex;gap:6px">' + bdg(r.status) + (r.priority ? ' ' + bdg(r.priority) : '') + '</div>' +
    '</div><div style="display:flex;gap:6px">' +
      (canEditRequest ? '<button class="btn btn-sm" onclick="captureFinalizeDraft(\'' + r.id + '\');closeModal();openEditRequestModal(\'' + r.id + '\')"><i class="ti ti-edit"></i> Edit</button>' : '') +
      (isAdmin ? '<button class="btn btn-sm btn-danger" onclick="deleteRequest(\'' + r.id + '\')"><i class="ti ti-trash"></i> Delete</button>' : '') +
      '<button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button>' +
    '</div></div>' +
    (r.editedByName ? '<div class="info-banner info-blue" style="margin-bottom:12px"><i class="ti ti-info-circle"></i><div>Edited by ' + r.editedByName + ' on ' + fmtDate(r.editedAt) + '</div></div>' : '') +
    '<div class="grid-2 mb-16">' +
      '<div><div class="form-label">Submitted by</div>' + r.submitter + '</div>' +
      '<div><div class="form-label">Date</div>' + r.date + '</div>' +
      '<div><div class="form-label">Business Unit</div>' + (r.businessUnit || '—') + '</div>' +
      '<div><div class="form-label">Sponsor</div>' + (r.sponsor || '—') + '</div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Description</div><div style="background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6">' + (r.description||'') + '</div></div>' +
    '<div class="grid-2 mb-16">' +
      '<div><div class="form-label">Value type</div>' + opportunityDisplay + '</div>' +
      (r.value ? '<div><div class="form-label">Value area</div><span class="badge badge-purple">' + r.value + '</span></div>' : '') +
      estimateDisplay +
    '</div>' +
    (r.valueJustification && canFinancials ? '<div class="form-group"><div class="form-label">Value justification</div><div style="background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6">' + r.valueJustification + '</div></div>' : '') +
    (costDisplay ? '<div class="mb-16">' + costDisplay + '</div>' : '') +
    (r.tags && r.tags.length ? '<div class="form-group"><div class="form-label">Tags</div>' + r.tags.map(function(t){ return tagBadge(t); }).join(' ') + '</div>' : '') +
    (r.team && r.team.length ? '<div class="form-group"><div class="form-label">Proposed team</div>' + r.team.join(', ') + '</div>' : '') +
    (r.feedback ? '<div class="form-group"><div class="form-label">PMO feedback</div><div style="background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6;border-left:3px solid #534AB7">' + r.feedback + '</div></div>' : '');

  if (linkedP) {
    html += '<div class="divider"></div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div class="form-label" style="margin-bottom:0">Linked project</div>' +
      (D.role === 'admin' ? '<button class="btn btn-sm" onclick="closeModal();editProject(\'' + linkedP.id + '\')"><i class="ti ti-edit"></i> Edit project</button>' : '') + '</div>' +
      '<div style="background:#f5f5f3;padding:12px 16px;border-radius:8px;font-size:13px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span class="bold">' + linkedP.name + '</span>' + stagePill(linkedP.stage) + '</div>' +
        '<div class="grid-2" style="gap:8px 16px;font-size:12px">' +
          '<div><span class="text-muted">Status: </span>' + bdg(linkedP.status) + '</div>' +
          '<div><span class="text-muted">Phase: </span><span class="badge badge-gray">' + linkedP.phase + '</span></div>' +
          '<div><span class="text-muted">Owner: </span>' + (linkedP.owner || '—') + '</div>' +
          '<div><span class="text-muted">Due: </span>' + (linkedP.end || 'TBD') + '</div>' +
        '</div>' +
        '<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:11px;color:#777;margin-bottom:3px"><span>Progress</span><span>' + linkedP.progress + '%</span></div>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + linkedP.progress + '%"></div></div></div>' +
        (linkedP.blockers ? '<div class="blocker-note" style="margin-top:8px"><i class="ti ti-alert-triangle"></i> ' + linkedP.blockers + '</div>' : '') +
      '</div>';
  }

  if (canApprove) {
    var draft = reviewFinalizeDrafts[r.id] || {};
    var buOptsApprove = BUSINESS_UNITS.map(function(v){ return '<option' + ((draft.businessUnit||r.businessUnit)===v?' selected':'') + '>' + v + '</option>'; }).join('');
    var curPriorityApprove = draft.priority || r.priority || 'Needs prioritization';
    var priorOptsApprove = PRIORITIES.map(function(p){ return '<option value="' + p + '"' + (curPriorityApprove===p?' selected':'') + '>' + p + '</option>'; }).join('');
    var curTshirtApprove = 'tshirtSize' in draft ? draft.tshirtSize : (r.tshirtSize || '');
    var tshirtOptsApprove = '<option value="">— Not sized —</option>' + TSHIRT_SIZES.map(function(s){ return '<option' + (curTshirtApprove===s?' selected':'') + '>' + s + '</option>'; }).join('');
    var valOptsApprove = VALUE_AREAS.map(function(v){ return '<option' + ((draft.value||r.value)===v?' selected':'') + '>' + v + '</option>'; }).join('');
    var curMethodologyApprove = 'deliveryMethodology' in draft ? draft.deliveryMethodology : '';
    var methodologyOptsApprove = '<option value=""' + (!curMethodologyApprove?' selected':'') + '>— Select —</option>' +
      ['Agile','Waterfall','Hybrid'].map(function(m){ return '<option' + (curMethodologyApprove===m?' selected':'') + '>' + m + '</option>'; }).join('');
    var catCheckboxes = CATEGORIES.map(function(c){
      var checked = (draft.categories || []).indexOf(c) >= 0;
      return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;font-size:13px"><input type="checkbox" class="rv-category-cb" value="' + c + '"' + (checked?' checked':'') + '> ' + c + '</label>';
    }).join('');

    var qOpts = buildQuarterOptions();
    var qStartVal = draft.quarterStart ? parseInt(draft.quarterStart) : qOpts[0].idx;
    var qEndVal = draft.quarterEnd ? parseInt(draft.quarterEnd) : qStartVal;
    var qStartOpts = qOpts.map(function(o){ return '<option value="' + o.idx + '"' + (o.idx===qStartVal?' selected':'') + '>' + o.label + '</option>'; }).join('');
    var qEndOpts = qOpts.filter(function(o){ return o.idx >= qStartVal; }).map(function(o){ return '<option value="' + o.idx + '"' + (o.idx===qEndVal?' selected':'') + '>' + o.label + '</option>'; }).join('');

    html += '<div class="divider"></div><div class="section-title" style="font-size:14px">Finalize before approving</div>' +
      '<div class="grid-2">' +
        '<div class="form-group"><div class="form-label">Priority *</div><select id="rv-priority">' + priorOptsApprove + '</select></div>' +
        '<div class="form-group"><div class="form-label">Value area *</div><select id="rv-value"><option value="">— Select —</option>' + valOptsApprove + '</select></div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div class="form-group"><div class="form-label">Business Unit *</div><select id="rv-bu">' + buOptsApprove + '</select></div>' +
        '<div class="form-group"><div class="form-label">T-shirt size</div><select id="rv-tshirt">' + tshirtOptsApprove + '</select></div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div class="form-group"><div class="form-label">Delivery methodology</div><select id="rv-methodology">' + methodologyOptsApprove + '</select></div>' +
        '<div></div>' +
      '</div>' +
      '<div class="form-group"><div class="form-label">Categories</div><div>' + catCheckboxes + '</div></div>' +
      '<div class="form-sub" style="margin:12px 0 4px">If real dates are known, set them below and the project will land in Backlog, Planned, or Active automatically depending on whether the range has already started. Otherwise, an optional target quarter keeps it visible on the Future Planning timeline while it sits in Backlog.</div>' +
      '<div class="grid-2">' +
        '<div class="form-group"><div class="form-label">Start date</div><input type="date" id="rv-start" value="' + (draft.start!=null?draft.start:(r.startDate||'')) + '"></div>' +
        '<div class="form-group"><div class="form-label">Target end date</div><input type="date" id="rv-end" value="' + (draft.end!=null?draft.end:(r.targetEndDate||'')) + '"></div>' +
      '</div>' +
      '<div class="form-group"><div class="form-label">Target quarter (optional, used only if no dates above)</div>' +
      '<div class="grid-2"><select id="rv-q-start" onchange="onRvQStartChange()">' + qStartOpts + '</select><select id="rv-q-end">' + qEndOpts + '</select></div></div>' +
      '<div class="form-group"><div class="form-label">Feedback to submitter</div><textarea id="rfb" placeholder="Decision rationale…">' + (draft.feedback!=null?draft.feedback:(r.feedback||'')) + '</textarea></div>' +
      '<div class="modal-footer"><button class="btn btn-danger" onclick="decideReq(\'' + r.id + '\',\'Rejected\')"><i class="ti ti-x"></i> Reject</button>' +
      '<button class="btn btn-success" onclick="decideReq(\'' + r.id + '\',\'Approved\')"><i class="ti ti-check"></i> Approve</button></div>';

    window.onRvQStartChange = function() {
      var newStart = parseInt(document.getElementById('rv-q-start').value);
      var endEl = document.getElementById('rv-q-end');
      var curEnd = parseInt(endEl.value);
      var newEnd = curEnd < newStart ? newStart : curEnd;
      endEl.innerHTML = qOpts.filter(function(o){ return o.idx >= newStart; }).map(function(o){ return '<option value="' + o.idx + '"' + (o.idx===newEnd?' selected':'') + '>' + o.label + '</option>'; }).join('');
    };
  } else if (canResubmit) {
    html += '<div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button><button class="btn btn-primary" onclick="openEditResubmitModal(\'' + r.id + '\')"><i class="ti ti-edit"></i> Edit &amp; resubmit</button></div>';
  } else {
    html += '<div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>';
  }
  showModal(html);
}

function openEditRequestModal(id, overrides) {
  var r = D.requests.find(function(x){ return x.id === id; });
  var v = overrides || {};
  var curTitle = 'title' in v ? v.title : r.title;
  var curBu = 'bu' in v ? v.bu : r.businessUnit;
  var curSponsor = 'sponsor' in v ? v.sponsor : (r.sponsor || '');
  var curDesc = 'desc' in v ? v.desc : (r.description || '');
  var curOppType = 'oppType' in v ? v.oppType : r.opportunityType;
  var curOppOther = 'oppOther' in v ? v.oppOther : (r.opportunityTypeOther || '');
  var curEstFreq = 'estFreq' in v ? v.estFreq : r.estimatedFrequency;
  var curEstAmount = 'estAmount' in v ? v.estAmount : r.estimatedAmount;
  var curValueConfidence = 'valueConfidence' in v ? v.valueConfidence : r.valueConfidence;
  var curCostAmount = 'costAmount' in v ? v.costAmount : r.costEstimate;
  var curCostConfidence = 'costConfidence' in v ? v.costConfidence : r.costConfidence;
  var curJustification = 'justification' in v ? v.justification : (r.valueJustification || '');
  var buOpts = BUSINESS_UNITS.map(function(bu){ return '<option' + (curBu===bu?' selected':'') + '>' + bu + '</option>'; }).join('');
  var hasFinancial = canViewFinancials();
  var oppOpts = ['Revenue opportunity','Cost savings opportunity'].map(function(o){ return '<option' + (curOppType===o?' selected':'') + '>' + o + '</option>'; }).join('');
  var showEstimate = curOppType === 'Revenue opportunity' || curOppType === 'Cost savings opportunity';
  var estimateLabel = curOppType === 'Revenue opportunity' ? 'Estimated Revenue' : 'Estimated Savings';
  var isLegacyOther = curOppType === 'Something else';
  var selectedTags = ('tags' in v ? v.tags : r.tags) || [];
  var selectedTeam = (('team' in v ? v.team : r.team) || []).slice();

  var valueSectionHtml = hasFinancial
    ? (isLegacyOther ? '<div class="info-banner info-blue" style="margin-bottom:12px"><i class="ti ti-info-circle"></i><div>Originally submitted as: "' + curOppOther.replace(/</g,'&lt;') + '". Choose a value type below to add structured detail, or leave it unselected to keep this as-is.</div></div>' : '') +
      '<div class="form-group"><div class="form-label">Value type' + (isLegacyOther ? '' : ' *') + '</div><select id="er2-opp-type" onchange="onEditReqOppTypeChange()"><option value="">— Select —</option>' + oppOpts + '</select></div>' +
      '<div class="form-group" id="er2-estimate-row" style="display:' + (showEstimate?'block':'none') + '">' +
        '<div class="form-label" id="er2-estimate-label">' + estimateLabel + '</div>' +
        '<div class="grid-2"><select id="er2-est-freq"><option' + (curEstFreq==='Monthly'?' selected':'') + '>Monthly</option><option' + (curEstFreq==='Annually'?' selected':'') + '>Annually</option></select>' +
        '<input type="text" id="er2-est-amount" value="' + (curEstAmount!=null?curEstAmount:'') + '" placeholder="$ amount (optional)"></div>' +
        '<div class="form-group" style="margin-top:8px"><div class="form-label">Value confidence</div><select id="er2-value-confidence">' + confidenceOptsHtml(curValueConfidence) + '</select></div>' +
      '</div>' +
      '<div class="form-group"><div class="form-label">Value justification</div><div class="form-sub">How did you arrive at the estimated value?</div><textarea id="er2-justification" rows="3">' + curJustification.replace(/</g,'&lt;') + '</textarea></div>' +
      '<div class="form-group"><div class="form-label">Cost estimate</div>' +
        '<div class="grid-2"><input type="text" id="er2-cost-amount" value="' + (curCostAmount!=null?curCostAmount:'') + '" placeholder="$ amount (optional)"><select id="er2-cost-confidence">' + confidenceOptsHtml(curCostConfidence) + '</select></div>' +
      '</div>'
    : '<div class="form-group"><div class="form-label">What\'s the expected value? *</div><textarea id="er2-value-desc" rows="3">' + curOppOther.replace(/</g,'&lt;') + '</textarea></div>';

  showModal('<div class="modal-title">Edit request <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Project title *</div><input type="text" id="er2-title" value="' + curTitle.replace(/"/g,'&quot;') + '"></div>' +
    '<div class="form-group"><div class="form-label">Business Unit *</div><select id="er2-bu">' + buOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Sponsor</div><input type="text" id="er2-sponsor" value="' + curSponsor.replace(/"/g,'&quot;') + '" placeholder="Optional"></div>' +
    '<div class="form-group"><div class="form-label">Description *</div><textarea id="er2-desc" rows="4">' + curDesc.replace(/</g,'&lt;') + '</textarea></div>' +
    valueSectionHtml +
    '<div class="form-group"><div class="form-label">Tags</div><div id="er2-tags-chips" style="margin-bottom:8px">' + (selectedTags.length ? selectedTags.map(function(t){ return tagBadge(t); }).join(' ') : '<span class="text-muted" style="font-size:13px">No tags selected</span>') + '</div><button class="btn btn-sm" onclick="openEditReqTagPicker()"><i class="ti ti-tag"></i> Select tags</button></div>' +
    teamPickerHtml('er2', 'toggleEditReqTeamMember', selectedTeam) +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="er2-save">Save changes</button></div>');

  window.onEditReqOppTypeChange = function() {
    var type = document.getElementById('er2-opp-type').value;
    document.getElementById('er2-estimate-row').style.display = type ? 'block' : 'none';
    if (type) document.getElementById('er2-estimate-label').textContent = type === 'Revenue opportunity' ? 'Estimated Revenue' : 'Estimated Savings';
  };
  window.toggleEditReqTeamMember = function(el) {
    var name = el.getAttribute('data-name');
    var i = selectedTeam.indexOf(name);
    if (el.checked && i < 0) selectedTeam.push(name);
    else if (!el.checked && i >= 0) selectedTeam.splice(i, 1);
  };
  window.openEditReqTagPicker = function() {
    var captured = {
      title: document.getElementById('er2-title').value,
      bu: document.getElementById('er2-bu').value,
      sponsor: document.getElementById('er2-sponsor').value,
      desc: document.getElementById('er2-desc').value,
      team: selectedTeam.slice()
    };
    if (hasFinancial) {
      captured.oppType = document.getElementById('er2-opp-type').value;
      captured.oppOther = isLegacyOther ? curOppOther : '';
      captured.estFreq = document.getElementById('er2-est-freq') ? document.getElementById('er2-est-freq').value : curEstFreq;
      captured.estAmount = document.getElementById('er2-est-amount') ? document.getElementById('er2-est-amount').value : curEstAmount;
      captured.valueConfidence = document.getElementById('er2-value-confidence') ? document.getElementById('er2-value-confidence').value : curValueConfidence;
      captured.costAmount = document.getElementById('er2-cost-amount').value;
      captured.costConfidence = document.getElementById('er2-cost-confidence').value;
      captured.justification = document.getElementById('er2-justification').value;
    } else {
      captured.oppType = 'Something else';
      captured.oppOther = document.getElementById('er2-value-desc').value;
    }
    openTagPicker(selectedTags, function(newTags) {
      captured.tags = newTags;
      openEditRequestModal(id, captured);
    }, false);
  };

  document.getElementById('er2-save').onclick = async function() {
    var title = document.getElementById('er2-title').value.trim();
    var bu = document.getElementById('er2-bu').value;
    var desc = document.getElementById('er2-desc').value.trim();
    if (!title || !bu || !desc) { showToast('Please fill in all required fields', 'error'); return; }

    var updates = {
      title: title, business_unit: bu, sponsor: document.getElementById('er2-sponsor').value.trim() || null, description: desc
    };

    if (hasFinancial) {
      var oppType = document.getElementById('er2-opp-type').value;
      var justification = document.getElementById('er2-justification').value.trim();
      var estAmountRaw = oppType ? document.getElementById('er2-est-amount').value.trim() : '';
      var costAmountRaw = document.getElementById('er2-cost-amount').value.trim();
      if (costAmountRaw && isNaN(Number(costAmountRaw))) { showToast('Please enter a valid cost amount', 'error'); return; }

      if (!oppType && isLegacyOther) {
        // Left unselected on a legacy "Something else" request - preserve it as-is rather than forcing a re-categorization.
        updates.opportunity_type = r.opportunityType;
        updates.opportunity_type_other = r.opportunityTypeOther;
        updates.estimated_frequency = r.estimatedFrequency;
        updates.estimated_type = r.estimatedType;
        updates.estimated_amount = r.estimatedAmount;
        updates.value_confidence = r.valueConfidence;
      } else if (!oppType) {
        showToast('Please select a value type', 'error'); return;
      } else {
        updates.opportunity_type = oppType;
        updates.opportunity_type_other = null;
        updates.estimated_frequency = document.getElementById('er2-est-freq').value;
        updates.estimated_type = oppType === 'Revenue opportunity' ? 'Revenue' : 'Savings';
        updates.estimated_amount = estAmountRaw ? Number(estAmountRaw) : null;
        updates.value_confidence = document.getElementById('er2-value-confidence').value || null;
      }
      updates.cost_estimate = costAmountRaw ? Number(costAmountRaw) : null;
      updates.cost_confidence = document.getElementById('er2-cost-confidence').value || null;
      updates.value_justification = justification || null;
    } else {
      var valueDesc = document.getElementById('er2-value-desc').value.trim();
      if (!valueDesc) { showToast('Please describe the expected value', 'error'); return; }
      updates.opportunity_type = 'Something else';
      updates.opportunity_type_other = valueDesc;
      updates.estimated_frequency = null;
      updates.estimated_type = null;
      updates.estimated_amount = null;
      updates.value_confidence = null;
      updates.cost_estimate = null;
      updates.cost_confidence = null;
      updates.value_justification = null;
    }

    var btn = document.getElementById('er2-save'); btn.disabled = true;
    var isSelfEdit = D.currentProfile.id === r.submitterId;
    var editorName = isSelfEdit ? r.editedByName : D.currentProfile.display_name;
    var editedAt = isSelfEdit ? r.editedAt : new Date().toISOString();
    updates.edited_by_name = editorName; updates.edited_at = editedAt;

    var result = await sb.from('requests').update(updates).eq('id', id);
    if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }

    await sb.from('request_tags').delete().eq('request_id', id);
    if (selectedTags.length) {
      var tagRows = selectedTags.map(function(name){ var t = D.tags.find(function(x){ return x.name === name; }); return t ? { request_id: id, tag_id: t.id } : null; }).filter(Boolean);
      if (tagRows.length) await sb.from('request_tags').insert(tagRows);
    }
    await sb.from('request_team').delete().eq('request_id', id);
    if (selectedTeam.length) {
      var teamRows = selectedTeam.map(function(name){ var res = resolveResource(name); return res ? { request_id: id, resource_id: res.id } : null; }).filter(Boolean);
      if (teamRows.length) await sb.from('request_team').insert(teamRows);
    }

    r.title = title; r.businessUnit = bu; r.sponsor = updates.sponsor; r.description = desc; r.opportunityType = updates.opportunity_type;
    r.opportunityTypeOther = updates.opportunity_type_other; r.estimatedFrequency = updates.estimated_frequency;
    r.estimatedType = updates.estimated_type; r.estimatedAmount = updates.estimated_amount;
    r.valueConfidence = updates.value_confidence; r.costEstimate = updates.cost_estimate; r.costConfidence = updates.cost_confidence;
    r.valueJustification = justification; r.tags = selectedTags; r.team = selectedTeam;
    r.editedByName = editorName; r.editedAt = editedAt;

    showToast('Request updated'); closeModal(); reviewRequest(id);
  };
}

function openEditResubmitModal(id, overrides) {
  var r = D.requests.find(function(x){ return x.id === id; });
  var v = overrides || {};
  var curTitle = 'title' in v ? v.title : r.title;
  var curBu = 'bu' in v ? v.bu : r.businessUnit;
  var curSponsor = 'sponsor' in v ? v.sponsor : (r.sponsor || '');
  var curDesc = 'desc' in v ? v.desc : (r.description || '');
  var curOppType = 'oppType' in v ? v.oppType : r.opportunityType;
  var curOppOther = 'oppOther' in v ? v.oppOther : (r.opportunityTypeOther || '');
  var curEstFreq = 'estFreq' in v ? v.estFreq : r.estimatedFrequency;
  var curEstAmount = 'estAmount' in v ? v.estAmount : r.estimatedAmount;
  var curValueConfidence = 'valueConfidence' in v ? v.valueConfidence : r.valueConfidence;
  var curCostAmount = 'costAmount' in v ? v.costAmount : r.costEstimate;
  var curCostConfidence = 'costConfidence' in v ? v.costConfidence : r.costConfidence;
  var curJustification = 'justification' in v ? v.justification : (r.valueJustification || '');
  var buOpts = BUSINESS_UNITS.map(function(bu){ return '<option' + (curBu===bu?' selected':'') + '>' + bu + '</option>'; }).join('');
  var hasFinancial = canViewFinancials();
  var oppOpts = ['Revenue opportunity','Cost savings opportunity'].map(function(o){ return '<option' + (curOppType===o?' selected':'') + '>' + o + '</option>'; }).join('');
  var showEstimate = curOppType === 'Revenue opportunity' || curOppType === 'Cost savings opportunity';
  var estimateLabel = curOppType === 'Revenue opportunity' ? 'Estimated Revenue' : 'Estimated Savings';
  var isLegacyOther = curOppType === 'Something else';
  var selectedTags = ('tags' in v ? v.tags : r.tags) || [];
  var selectedTeam = (('team' in v ? v.team : r.team) || []).slice();

  var valueSectionHtml = hasFinancial
    ? (isLegacyOther ? '<div class="info-banner info-blue" style="margin-bottom:12px"><i class="ti ti-info-circle"></i><div>Originally submitted as: "' + curOppOther.replace(/</g,'&lt;') + '". Choose a value type below to add structured detail, or leave it unselected to keep this as-is.</div></div>' : '') +
      '<div class="form-group"><div class="form-label">Value type' + (isLegacyOther ? '' : ' *') + '</div><select id="erq-opp-type" onchange="onResubmitOppTypeChange()"><option value="">— Select —</option>' + oppOpts + '</select></div>' +
      '<div class="form-group" id="erq-estimate-row" style="display:' + (showEstimate?'block':'none') + '">' +
        '<div class="form-label" id="erq-estimate-label">' + estimateLabel + '</div>' +
        '<div class="grid-2"><select id="erq-est-freq"><option' + (curEstFreq==='Monthly'?' selected':'') + '>Monthly</option><option' + (curEstFreq==='Annually'?' selected':'') + '>Annually</option></select>' +
        '<input type="text" id="erq-est-amount" value="' + (curEstAmount!=null?curEstAmount:'') + '" placeholder="$ amount (optional)"></div>' +
        '<div class="form-group" style="margin-top:8px"><div class="form-label">Value confidence</div><select id="erq-value-confidence">' + confidenceOptsHtml(curValueConfidence) + '</select></div>' +
        '<div id="erq-est-err" style="color:#A32D2D;font-size:12px;margin-top:4px;display:none">Please enter a valid number (digits only)</div>' +
      '</div>' +
      '<div class="form-group"><div class="form-label">Value justification</div><div class="form-sub">How did you arrive at the estimated value?</div><textarea id="erq-justification" rows="3">' + curJustification.replace(/</g,'&lt;') + '</textarea></div>' +
      '<div class="form-group"><div class="form-label">Cost estimate</div>' +
        '<div class="grid-2"><input type="text" id="erq-cost-amount" value="' + (curCostAmount!=null?curCostAmount:'') + '" placeholder="$ amount (optional)"><select id="erq-cost-confidence">' + confidenceOptsHtml(curCostConfidence) + '</select></div>' +
        '<div id="erq-cost-err" style="color:#A32D2D;font-size:12px;margin-top:4px;display:none">Please enter a valid number (digits only)</div>' +
      '</div>'
    : '<div class="form-group"><div class="form-label">What\'s the expected value? *</div><textarea id="erq-value-desc" rows="3">' + curOppOther.replace(/</g,'&lt;') + '</textarea></div>';

  showModal('<div class="modal-title">Edit &amp; resubmit request <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    (r.feedback ? '<div class="form-group"><div class="form-label">Why it was rejected</div><div style="background:#FBE7E3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6;border-left:3px solid #993C1D">' + r.feedback + '</div></div>' : '') +
    '<div class="form-group"><div class="form-label">Project title *</div><input type="text" id="erq-title" value="' + curTitle.replace(/"/g,'&quot;') + '"></div>' +
    '<div class="form-group"><div class="form-label">Business Unit *</div><select id="erq-bu">' + buOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Sponsor</div><input type="text" id="erq-sponsor" value="' + curSponsor.replace(/"/g,'&quot;') + '" placeholder="Optional"></div>' +
    '<div class="form-group"><div class="form-label">Description *</div><textarea id="erq-desc" rows="4">' + curDesc.replace(/</g,'&lt;') + '</textarea></div>' +
    valueSectionHtml +
    '<div class="form-group"><div class="form-label">Tags</div><div id="erq-tags-chips" style="margin-bottom:8px">' + (selectedTags.length ? selectedTags.map(function(t){ return tagBadge(t); }).join(' ') : '<span class="text-muted" style="font-size:13px">No tags selected</span>') + '</div><button class="btn btn-sm" onclick="openResubmitTagPicker()"><i class="ti ti-tag"></i> Select tags</button></div>' +
    teamPickerHtml('erq', 'toggleResubmitTeamMember', selectedTeam) +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="erq-save"><i class="ti ti-send"></i> Resubmit request</button></div>');

  window.onResubmitOppTypeChange = function() {
    var type = document.getElementById('erq-opp-type').value;
    document.getElementById('erq-estimate-row').style.display = type ? 'block' : 'none';
    if (type) document.getElementById('erq-estimate-label').textContent = type === 'Revenue opportunity' ? 'Estimated Revenue' : 'Estimated Savings';
  };
  if (hasFinancial) {
    document.getElementById('erq-est-amount').addEventListener('input', function() {
      this.value = this.value.replace(/[^0-9]/g,'');
      document.getElementById('erq-est-err').style.display = 'none';
    });
    document.getElementById('erq-cost-amount').addEventListener('input', function() {
      this.value = this.value.replace(/[^0-9]/g,'');
      document.getElementById('erq-cost-err').style.display = 'none';
    });
  }
  window.toggleResubmitTeamMember = function(el) {
    var name = el.getAttribute('data-name');
    var i = selectedTeam.indexOf(name);
    if (el.checked && i < 0) selectedTeam.push(name);
    else if (!el.checked && i >= 0) selectedTeam.splice(i, 1);
  };
  window.openResubmitTagPicker = function() {
    var captured = {
      title: document.getElementById('erq-title').value,
      bu: document.getElementById('erq-bu').value,
      sponsor: document.getElementById('erq-sponsor').value,
      desc: document.getElementById('erq-desc').value,
      team: selectedTeam.slice()
    };
    if (hasFinancial) {
      captured.oppType = document.getElementById('erq-opp-type').value;
      captured.oppOther = isLegacyOther ? curOppOther : '';
      captured.estFreq = document.getElementById('erq-est-freq') ? document.getElementById('erq-est-freq').value : curEstFreq;
      captured.estAmount = document.getElementById('erq-est-amount') ? document.getElementById('erq-est-amount').value : curEstAmount;
      captured.valueConfidence = document.getElementById('erq-value-confidence') ? document.getElementById('erq-value-confidence').value : curValueConfidence;
      captured.costAmount = document.getElementById('erq-cost-amount').value;
      captured.costConfidence = document.getElementById('erq-cost-confidence').value;
      captured.justification = document.getElementById('erq-justification').value;
    } else {
      captured.oppType = 'Something else';
      captured.oppOther = document.getElementById('erq-value-desc').value;
    }
    openTagPicker(selectedTags, function(newTags) {
      captured.tags = newTags;
      openEditResubmitModal(id, captured);
    }, false);
  };

  document.getElementById('erq-save').onclick = function(){ return resubmitRequest(id, selectedTags, selectedTeam); };
}

async function resubmitRequest(id, selectedTags, selectedTeam) {
  var r = D.requests.find(function(x){ return x.id === id; });
  var title = document.getElementById('erq-title').value.trim();
  var bu = document.getElementById('erq-bu').value;
  var desc = document.getElementById('erq-desc').value.trim();
  if (!title || !bu || !desc) { showToast('Please fill in all required fields', 'error'); return; }

  var hasFinancial = canViewFinancials();
  var isLegacyOther = r.opportunityType === 'Something else';
  var updates = {
    title: title, business_unit: bu, sponsor: document.getElementById('erq-sponsor').value.trim() || null, description: desc,
    status: 'Pending', feedback: null, priority: null, value_area: null, start_date: null, target_end_date: null,
    edited_by_name: null, edited_at: null
  };

  if (hasFinancial) {
    var oppType = document.getElementById('erq-opp-type').value;
    var justification = document.getElementById('erq-justification').value.trim();
    var estAmountRaw = oppType ? document.getElementById('erq-est-amount').value.trim() : '';
    if (estAmountRaw && isNaN(Number(estAmountRaw))) { document.getElementById('erq-est-err').style.display = 'block'; return; }
    var costAmountRaw = document.getElementById('erq-cost-amount').value.trim();
    if (costAmountRaw && isNaN(Number(costAmountRaw))) { document.getElementById('erq-cost-err').style.display = 'block'; return; }

    if (!oppType && isLegacyOther) {
      updates.opportunity_type = r.opportunityType;
      updates.opportunity_type_other = r.opportunityTypeOther;
      updates.estimated_frequency = r.estimatedFrequency;
      updates.estimated_type = r.estimatedType;
      updates.estimated_amount = r.estimatedAmount;
      updates.value_confidence = r.valueConfidence;
    } else if (!oppType) {
      showToast('Please select a value type', 'error'); return;
    } else {
      updates.opportunity_type = oppType;
      updates.opportunity_type_other = null;
      updates.estimated_frequency = document.getElementById('erq-est-freq').value;
      updates.estimated_type = oppType === 'Revenue opportunity' ? 'Revenue' : 'Savings';
      updates.estimated_amount = estAmountRaw ? Number(estAmountRaw) : null;
      updates.value_confidence = document.getElementById('erq-value-confidence').value || null;
    }
    updates.cost_estimate = costAmountRaw ? Number(costAmountRaw) : null;
    updates.cost_confidence = document.getElementById('erq-cost-confidence').value || null;
    updates.value_justification = justification || null;
  } else {
    var valueDesc = document.getElementById('erq-value-desc').value.trim();
    if (!valueDesc) { showToast('Please describe the expected value', 'error'); return; }
    updates.opportunity_type = 'Something else';
    updates.opportunity_type_other = valueDesc;
    updates.estimated_frequency = null;
    updates.estimated_type = null;
    updates.estimated_amount = null;
    updates.value_confidence = null;
    updates.cost_estimate = null;
    updates.cost_confidence = null;
    updates.value_justification = null;
  }

  var btn = document.getElementById('erq-save'); btn.disabled = true;
  var result = await sb.from('requests').update(updates).eq('id', id);
  if (result.error) { showToast('Could not resubmit: ' + result.error.message); btn.disabled = false; return; }

  await sb.from('request_tags').delete().eq('request_id', id);
  if (selectedTags.length) {
    var tagRows = selectedTags.map(function(name){ var t = D.tags.find(function(x){ return x.name === name; }); return t ? { request_id: id, tag_id: t.id } : null; }).filter(Boolean);
    if (tagRows.length) await sb.from('request_tags').insert(tagRows);
  }
  await sb.from('request_team').delete().eq('request_id', id);
  if (selectedTeam.length) {
    var teamRows = selectedTeam.map(function(name){ var res = resolveResource(name); return res ? { request_id: id, resource_id: res.id } : null; }).filter(Boolean);
    if (teamRows.length) await sb.from('request_team').insert(teamRows);
  }

  r.title = title; r.businessUnit = bu; r.sponsor = updates.sponsor; r.description = desc; r.opportunityType = updates.opportunity_type;
  r.opportunityTypeOther = updates.opportunity_type_other; r.estimatedFrequency = updates.estimated_frequency;
  r.estimatedType = updates.estimated_type; r.estimatedAmount = updates.estimated_amount;
  r.valueConfidence = updates.value_confidence; r.costEstimate = updates.cost_estimate; r.costConfidence = updates.cost_confidence;
  r.valueJustification = updates.value_justification; r.tags = selectedTags; r.team = selectedTeam;
  r.status = 'Pending'; r.feedback = ''; r.priority = null; r.value = null;
  r.startDate = null; r.targetEndDate = null; r.editedByName = null; r.editedAt = null;

  showToast('Request resubmitted for review'); closeModal(); renderNav();
  if (currentPage === 'my-requests') pgMyRequests(); else if (currentPage === 'requests') pgRequests();
}

async function deleteRequest(id) {
  if (D.role !== 'admin') return; // safety check; UI is already hidden for non-admins
  var r = D.requests.find(function(x){ return x.id === id; });
  if (!r) return;
  var linkedP = r.linkedProject ? D.projects.find(function(p){ return p.id === r.linkedProject; }) : null;
  var msg = 'Delete this request? An admin can restore it later from Administration → Deleted Items.' +
    (linkedP ? ' Its linked project ("' + linkedP.name + '") will NOT be deleted — it will just no longer be connected to this request.' : '');
  if (!confirm(msg)) return;
  var result = await sb.from('requests').update({ deleted_at: new Date().toISOString(), deleted_by: D.currentProfile.id }).eq('id', id);
  if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
  D.requests = D.requests.filter(function(x){ return x.id !== id; });
  closeModal(); showToast('Request deleted'); renderNav();
  if (currentPage === 'requests') pgRequests(); else if (currentPage === 'my-requests') pgMyRequests();
}

async function decideReq(id, decision) {
  var r  = D.requests.find(function(x){ return x.id === id; });
  var fb = document.getElementById('rfb');
  var feedbackVal = fb ? fb.value : r.feedback;

  if (decision === 'Approved') {
    var priority = document.getElementById('rv-priority').value;
    var valueArea = document.getElementById('rv-value').value;
    var businessUnit = document.getElementById('rv-bu').value;
    var tshirtSize = document.getElementById('rv-tshirt').value || null;
    var deliveryMethodology = document.getElementById('rv-methodology').value || null;
    var startDate = document.getElementById('rv-start').value || null;
    var endDate = document.getElementById('rv-end').value || null;
    if (!priority || !valueArea || !businessUnit) {
      showToast('Please fill in Priority, Value Area, and Business Unit before approving');
      return;
    }
    var selectedCategories = Array.from(document.querySelectorAll('.rv-category-cb')).filter(function(cb){ return cb.checked; }).map(function(cb){ return cb.value; });

    var newStage = computeStageFromDates(startDate, endDate);
    var targetQuarter = null, targetYear = null, targetEndQuarter = null, targetEndYear = null;
    if (newStage === 'backlog') {
      var qOpts = buildQuarterOptions();
      var qStartIdx = parseInt(document.getElementById('rv-q-start').value);
      var qEndIdx = parseInt(document.getElementById('rv-q-end').value);
      var qStart = qOpts.find(function(o){ return o.idx === qStartIdx; });
      var qEnd = qOpts.find(function(o){ return o.idx === qEndIdx; });
      if (qStart) { targetQuarter = qStart.quarter; targetYear = qStart.year; }
      if (qEnd) { targetEndQuarter = qEnd.quarter; targetEndYear = qEnd.year; }
    }

    var projectRecord = {
      name: r.title, status: newStage === 'active' ? 'On Track' : 'Not Started', phase: 'Not Started', progress: 0,
      value_area: valueArea, priority: priority, description: r.description, sponsor: r.sponsor || null,
      business_unit: businessUnit, tshirt_size: tshirtSize, delivery_methodology: deliveryMethodology, blockers: '', health: null, stage: newStage,
      planned_start: startDate, start_date: startDate, end_date: endDate,
      target_quarter: targetQuarter, target_year: targetYear, target_end_quarter: targetEndQuarter, target_end_year: targetEndYear,
      estimated_amount: r.estimatedAmount, estimated_frequency: r.estimatedFrequency, estimated_type: r.estimatedType,
      value_confidence: r.valueConfidence, cost_estimate: r.costEstimate, cost_confidence: r.costConfidence,
      request_id: r.id
    };
    var projResult = await sb.from('projects').insert(projectRecord).select().single();
    if (projResult.error) { showToast('Could not create project: ' + projResult.error.message); return; }
    await logProjectChanges(projResult.data.id, null, {
      name: r.title, stage: newStage, status: projectRecord.status, priority: priority, value: valueArea,
      businessUnit: businessUnit, sponsor: r.sponsor, start: startDate, end: endDate, description: r.description,
      tshirtSize: tshirtSize, deliveryMethodology: deliveryMethodology
    }, 'request');

    var teamIds = [];
    if (r.team && r.team.length) {
      var teamRows = [];
      r.team.forEach(function(name){
        var res = resolveResource(name);
        if (res) { teamIds.push(res.id); teamRows.push({ project_id: projResult.data.id, resource_id: res.id }); }
      });
      if (teamRows.length) await sb.from('resource_projects').insert(teamRows);
    }
    if (r.tags && r.tags.length) {
      var tagRows = r.tags.map(function(name){ var t = D.tags.find(function(x){ return x.name === name; }); return t ? { project_id: projResult.data.id, tag_id: t.id } : null; }).filter(Boolean);
      if (tagRows.length) await sb.from('project_tags').insert(tagRows);
    }
    if (selectedCategories.length) {
      await sb.from('project_categories').insert(selectedCategories.map(function(c){ return { project_id: projResult.data.id, category: c }; }));
    }

    var reqStatus = newStage === 'backlog' ? 'Backlog' : newStage === 'active' ? 'Active' : 'Planned';
    var reqResult = await sb.from('requests').update({
      status: reqStatus, feedback: feedbackVal, linked_project: projResult.data.id,
      priority: priority, value_area: valueArea, business_unit: businessUnit,
      start_date: startDate, target_end_date: endDate
    }).eq('id', id);
    if (reqResult.error) { showToast('Could not update request: ' + reqResult.error.message); return; }

    D.projects.push({
      id: projResult.data.id, name: r.title, owner:'', ownerId:null, sponsor: r.sponsor || '', categories: selectedCategories, businessUnit:businessUnit,
      team: r.team ? r.team.slice() : [], teamIds: teamIds, status: projectRecord.status, phase:'Not Started', progress:0,
      start: startDate, end: endDate, plannedStart: startDate,
      value: valueArea, priority: priority, description: r.description, blockers:'', health:null, tshirtSize: tshirtSize,
      stage: newStage, requestId:r.id, tags: r.tags ? r.tags.slice() : [], dependencies:[],
      estimatedAmount: r.estimatedAmount, estimatedFrequency: r.estimatedFrequency, estimatedType: r.estimatedType,
      valueConfidence: r.valueConfidence, costEstimate: r.costEstimate, costConfidence: r.costConfidence,
      targetQuarter: targetQuarter, targetYear: targetYear, targetEndQuarter: targetEndQuarter, targetEndYear: targetEndYear,
      holdReason:null, preHoldStage:null, heldAt:null, completedAt:null,
      deliveryMethodology: deliveryMethodology, projectNumber: projResult.data.project_number, createdAt: projResult.data.created_at,
      milestones:[], tasks:[], raid:{risks:[],assumptions:[],issues:[],dependencies:[]}, documents:[], docFolders:['General'], docFolderIds:{}
    });
    r.status = reqStatus; r.linkedProject = projResult.data.id; r.feedback = feedbackVal;
    r.priority = priority; r.value = valueArea; r.businessUnit = businessUnit; r.startDate = startDate; r.targetEndDate = endDate;
    delete reviewFinalizeDrafts[id];
    addNotif(r.submitter, 'Your request "' + r.title + '" has been approved' + (newStage === 'backlog' ? ' and added to the backlog.' : newStage === 'active' ? ' and is already underway.' : ' and scheduled.'), 'approved');
  } else if (decision === 'Rejected') {
    var rejectedDate = new Date().toISOString().split('T')[0];
    var result = await sb.from('requests').update({ status: 'Rejected', feedback: feedbackVal, rejected_date: rejectedDate }).eq('id', id);
    if (result.error) { showToast('Could not save: ' + result.error.message); return; }
    r.status = 'Rejected'; r.feedback = feedbackVal; r.rejectedDate = rejectedDate;
    delete reviewFinalizeDrafts[id];
  }
  closeModal(); showToast(decision === 'Approved' ? 'Approved and scheduled' : 'Request rejected');
  renderNav();
  if (currentPage === 'requests') pgRequests();
  else if (currentPage === 'planned') pgPlanned();
  else pgDashboard();
}

// ── Backlog ──────────────────────────────────────────────────────────────────

function pgBacklog() {
  tb('Backlog');
  var st = backlogProjState;
  var allBacklog = D.projects.filter(function(p){ return p.stage === 'backlog'; });
  var cat = buildCategoryTabs(allBacklog, st.category, 'setBacklogCategory');
  st.category = cat.resolvedFilter;

  var bp = allBacklog.filter(function(p){ return projectMatchesCategoryTab(p, st.category); });
  if (st.search) { var bq = st.search.toLowerCase(); bp = bp.filter(function(p){ return p.name.toLowerCase().indexOf(bq) >= 0; }); }
  if (st.filters.tags.length) bp = bp.filter(function(p){ return st.filters.tags.some(function(t){ return (p.tags||[]).indexOf(t) >= 0; }); });
  if (st.filters.value.length) bp = bp.filter(function(p){ return st.filters.value.indexOf(p.value) >= 0; });
  if (st.filters.priority.length) bp = bp.filter(function(p){ return st.filters.priority.indexOf(p.priority) >= 0; });
  if (st.filters.owner.length) bp = bp.filter(function(p){ return st.filters.owner.indexOf(p.owner) >= 0; });

  bp = bp.slice().sort(function(a,b) {
    var av, bv;
    if (st.sort === 'priority') { av = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 9; bv = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 9; }
    else {
      av = a[st.sort]; bv = b[st.sort];
      av = (av == null ? '' : av); bv = (bv == null ? '' : bv);
      if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
    }
    var cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return st.dir === 'asc' ? cmp : -cmp;
  });

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }
  function filterIcon(col, active) { return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleBacklogFilter(\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>'; }

  var valueChoices = VALUE_AREAS.slice(), priorityChoices = PRIORITIES.slice();
  var ownerChoices = []; allBacklog.forEach(function(p){ if (p.owner && ownerChoices.indexOf(p.owner) < 0) ownerChoices.push(p.owner); }); ownerChoices.sort();
  var tagChoices = D.tags.map(function(t){ return t.name; });

  var rows = bp.map(function(p) {
    return '<tr>' +
      '<td class="bold">' + p.name + '</td>' +
      '<td>' + ((p.tags && p.tags.length) ? p.tags.map(function(t){ return tagBadge(t); }).join(' ') : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.value || '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.priority ? bdg(p.priority) : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.owner || '<span class="text-muted">—</span>') + '</td>' +
      '<td style="white-space:nowrap"><button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button> ' +
        (D.role === 'admin' ? '<button class="btn btn-sm btn-primary" onclick="openScheduleModal(\'' + p.id + '\')"><i class="ti ti-calendar-plus"></i> Schedule</button>' : '') +
      '</td>' +
      '</tr>';
  }).join('');

  document.getElementById('content').innerHTML =
    '<div class="info-banner info-amber"><i class="ti ti-stack-2" style="font-size:20px;flex-shrink:0;color:#BA7517"></i>' +
    '<span>Projects here are <strong>approved</strong> and waiting to be scheduled. Assign a start date to move them to Planned — an Owner can be assigned later.</span></div>' +
    searchBoxHtml(st.search, 'Search projects by name…', 'backlog-search', 'onBacklogSearch') +
    cat.html +
    '<div class="card"><div class="table-wrap"><table><thead><tr>' +
      '<th class="sortable-th" onclick="setBacklogSort(\'name\')">Project ' + arrow('name') + '</th>' +
      '<th class="sortable-th"><span onclick="setBacklogSort(\'tags\')">Tags ' + arrow('tags') + '</span>' + filterIcon('tags', st.filters.tags.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setBacklogSort(\'value\')">Value area ' + arrow('value') + '</span>' + filterIcon('value', st.filters.value.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setBacklogSort(\'priority\')">Priority ' + arrow('priority') + '</span>' + filterIcon('priority', st.filters.priority.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setBacklogSort(\'owner\')">Owner ' + arrow('owner') + '</span>' + filterIcon('owner', st.filters.owner.length>0) + '</th>' +
      '<th></th>' +
    '</tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px">No backlog projects match these filters</td></tr>') + '</tbody></table></div></div>';

  window.onBacklogSearch = function(v) {
    st.search = v; pgBacklog();
    var el = document.getElementById('backlog-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setBacklogCategory = function(c) { st.category = c; pgBacklog(); };
  window.setBacklogSort = function(col) { if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; } pgBacklog(); };
  window.toggleBacklogFilter = function(col) {
    var labelMap = { tags:'Tags', value:'Value area', priority:'Priority', owner:'Owner' };
    var choicesMap = { tags:tagChoices, value:valueChoices, priority:priorityChoices, owner:ownerChoices };
    openFilterModal(labelMap[col], choicesMap[col],
      function() { return st.filters[col]; },
      function(val) { var arr = st.filters[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { st.filters[col] = []; },
      pgBacklog
    );
  };
}

// ── Prioritize Backlog ────────────────────────────────────────────────────────

function pbIsSized(p) { return p.estimatedAmount != null && !!p.tshirtSize; }

// Higher score = more value for less effort. Only meaningful for sized
// projects; used purely to seed initial order before a rank has been set.
function pbScore(p) {
  var idx = TSHIRT_SIZES.indexOf(p.tshirtSize);
  var effort = idx >= 0 ? idx + 1 : 3;
  return (p.estimatedAmount || 0) / effort;
}

// XS/S = Low effort, M/L/XL = High effort.
function pbEffortBucket(p) {
  var idx = TSHIRT_SIZES.indexOf(p.tshirtSize);
  return idx <= 1 ? 'Low' : 'High';
}

function pbShowMatrixHelp() {
  showModal('<div class="modal-title">How the Value / Effort Matrix works <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-sub" style="margin-bottom:14px">Only sized projects (an estimated value <strong>and</strong> a T-shirt size) show up here — everything else is listed under Needs sizing instead.</div>' +
    '<div class="form-group"><div class="form-label">Value axis (High vs. Low)</div><div style="font-size:13px;color:#444">A project is "High" if its estimated value is at or above the <strong>median</strong> estimated value among the sized projects in this tab, otherwise "Low." That\'s a relative split, not a fixed dollar line — it recalculates per tab and shifts as projects are added, resolved, or resized.</div></div>' +
    '<div class="form-group"><div class="form-label">Effort axis (High vs. Low)</div><div style="font-size:13px;color:#444">Comes straight from T-shirt size: XS/S = Low effort, M/L/XL = High effort.</div></div>' +
    '<div class="form-group"><div class="form-label">The four quadrants</div><div style="font-size:13px;color:#444">Quick Wins = High value, Low effort. Major Projects = High value, High effort. Fill-ins = Low value, Low effort. Reconsider = Low value, High effort.</div></div>' +
    '<div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Got it</button></div>');
}

function pbShowPriorityHelp() {
  showModal('<div class="modal-title">How Priority Order is calculated <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">One shared ranking</div><div style="font-size:13px;color:#444">There is a single priority order across every non-complete project (Backlog, Planned, Active, Hold) — category tabs are a filtered view of that same order, not a ranking of their own. Dragging a row in any tab updates the real, shared order, so a move can shift where a project lands in another tab it also belongs to, if the move crosses a project that shares that category.</div></div>' +
    '<div class="form-group"><div class="form-label">Every sized project has a saved rank</div><div style="font-size:13px;color:#444">As soon as a project has both an estimated value and a T-shirt size, its position is calculated by <strong>estimated value ÷ effort</strong> (highest first) and saved right away — effort comes from T-shirt size (XS=1, S=2, M=3, L=4, XL=5; missing size counts as 3). You don\'t have to touch it for that rank to be real.</div></div>' +
    '<div class="form-group"><div class="form-label">Dragging creates an override</div><div style="font-size:13px;color:#444">Moving a row by hand saves its new position and marks it <span class="badge badge-amber" style="font-size:10px"><i class="ti ti-pin"></i> Manual</span> — that project won\'t be swept back into place by the automatic calculation. Everything else keeps its own override status even when its rank number shifts to make room.</div></div>' +
    '<div class="form-group"><div class="form-label">Undo</div><div style="font-size:13px;color:#444">Right after a drag, an Undo button appears next to Reset to default — it puts that one project back exactly where it was, including removing its Manual badge if this was the first time it had ever been moved by hand. It only covers the most recent move.</div></div>' +
    '<div class="form-group"><div class="form-label">Resetting</div><div style="font-size:13px;color:#444">"Reset to default" clears every manual override and re-sorts the whole list by the automatic calculation — it shows you exactly what would move before anything is saved.</div></div>' +
    '<div class="form-group"><div class="form-label">Only sized projects rank</div><div style="font-size:13px;color:#444">A project needs both an estimated value and a T-shirt size to appear here — otherwise it shows under Needs sizing instead.</div></div>' +
    '<div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Got it</button></div>');
}

async function pbMaterializeDefaultRanks(orderedSized) {
  var rows = orderedSized.map(function(p, idx){ return { project_id: p.id, rank: idx + 1, is_override: !!p.priorityIsOverride }; });
  var result = await sb.from('project_priority_ranks').upsert(rows, { onConflict: 'project_id' });
  prioritizeBacklogState.materializing = false;
  if (result.error) { console.error('Could not save default priority ranks:', result.error); return; }
  rows.forEach(function(r) {
    var p = D.projects.find(function(x){ return x.id === r.project_id; });
    if (p) { p.priorityRank = r.rank; }
  });
  if (currentPage === 'prioritize-backlog') pgPrioritizeBacklog();
}

function pbShowResetPreview() {
  var globalSizedAll = D.projects.filter(function(p){ return p.stage !== 'complete'; }).filter(pbIsSized);
  var currentOrder = globalSizedAll.filter(function(p){ return p.priorityRank != null; }).sort(function(a,b){ return a.priorityRank - b.priorityRank; })
    .concat(globalSizedAll.filter(function(p){ return p.priorityRank == null; }));
  var currentPos = {};
  currentOrder.forEach(function(p, idx){ currentPos[p.id] = idx + 1; });

  var defaultOrder = globalSizedAll.slice().sort(function(a,b){ return pbScore(b) - pbScore(a); });
  var changed = [];
  defaultOrder.forEach(function(p, idx){
    var newPos = idx + 1;
    var oldPos = currentPos[p.id];
    if (oldPos !== newPos) changed.push({ p:p, oldPos:oldPos, newPos:newPos });
  });
  changed.sort(function(a,b){ return a.newPos - b.newPos; });

  var rowsHtml = changed.map(function(c) {
    return '<tr><td>' + c.p.name + '</td><td class="text-muted">#' + c.oldPos + '</td><td style="text-align:center"><i class="ti ti-arrow-right"></i></td><td class="bold">#' + c.newPos + '</td></tr>';
  }).join('');

  showModal('<div class="modal-title">Reset priority order to the default calculation? <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    (changed.length
      ? '<div class="form-sub" style="margin-bottom:12px">This clears every manual override and re-sorts everyone by estimated value ÷ effort. ' + changed.length + ' project' + (changed.length===1?'':'s') + ' would move:</div>' +
        '<div class="table-wrap" style="max-height:320px"><table><thead><tr><th>Project</th><th>Current</th><th></th><th>New</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
      : '<div class="text-muted">No changes — the current order already matches the default calculation.</div>') +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    (changed.length ? '<button class="btn btn-primary" onclick="pbApplyResetToDefault()"><i class="ti ti-check"></i> Reset ' + changed.length + ' project' + (changed.length===1?'':'s') + '</button>' : '') +
    '</div>', true);
}

async function pbApplyResetToDefault() {
  var globalSizedAll = D.projects.filter(function(p){ return p.stage !== 'complete'; }).filter(pbIsSized);
  var defaultOrder = globalSizedAll.slice().sort(function(a,b){ return pbScore(b) - pbScore(a); });
  var rows = defaultOrder.map(function(p, idx){ return { project_id: p.id, rank: idx + 1, is_override: false }; });
  var btn = document.querySelector('.modal-footer .btn-primary'); if (btn) btn.disabled = true;
  var result = await sb.from('project_priority_ranks').upsert(rows, { onConflict: 'project_id' });
  if (result.error) { showToast('Could not reset order: ' + result.error.message, 'error'); if (btn) btn.disabled = false; return; }
  rows.forEach(function(r) {
    var p = D.projects.find(function(x){ return x.id === r.project_id; });
    if (p) { p.priorityRank = r.rank; p.priorityIsOverride = false; }
  });
  prioritizeBacklogState.lastMove = null;
  closeModal();
  showToast('Priority order reset to the default calculation');
  if (currentPage === 'prioritize-backlog') pgPrioritizeBacklog();
}

function pgPrioritizeBacklog() {
  tb('Prioritize Backlog');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can access Prioritize Backlog.</p></div>';
    return;
  }
  var st = prioritizeBacklogState;
  var allActive = D.projects.filter(function(p){ return p.stage !== 'complete'; });
  var cat = buildCategoryTabs(allActive, st.category, 'setPrioritizeCategory');
  st.category = cat.resolvedFilter;
  var scope = st.category;

  // There is exactly one priority order across every non-complete project,
  // regardless of category — category tabs below are a filtered view of
  // this same global order, not an independent ranking of their own. That
  // means dragging within a tab can still shift where a multi-category
  // project lands in its other tabs, if the move crosses another project
  // that also belongs to that other category.
  var globalSized = allActive.filter(pbIsSized);
  var globalRanked = globalSized.filter(function(p){ return p.priorityRank != null; })
    .sort(function(a,b){ return a.priorityRank - b.priorityRank; });
  var globalUnranked = globalSized.filter(function(p){ return p.priorityRank == null; })
    .sort(function(a,b){ return pbScore(b) - pbScore(a); });
  var orderedSized = globalRanked.concat(globalUnranked);
  var hasAnyOverride = globalSized.some(function(p){ return p.priorityIsOverride; });

  // A project's default (score-based) position is meant to be a real, saved
  // rank from the moment it becomes sized -- not just a transient sort order
  // that only gets persisted once someone happens to drag it. So as soon as
  // any sized project is missing a saved rank, quietly write the whole
  // current order as everyone's rank, preserving existing override flags.
  if (globalUnranked.length && !st.materializing) {
    st.materializing = true;
    pbMaterializeDefaultRanks(orderedSized);
  }

  var filtered = allActive.filter(function(p){ return projectMatchesCategoryTab(p, scope); });
  var unsized = filtered.filter(function(p){ return !pbIsSized(p); });
  var displaySized = orderedSized.filter(function(p){ return projectMatchesCategoryTab(p, scope); });

  var searchQ = (st.search || '').trim().toLowerCase();
  function matchesSearch(p) { return !searchQ || p.name.toLowerCase().indexOf(searchQ) >= 0; }

  // Matrix quadrant thresholds: split this tab's sized projects on the median $
  // amount, before any search filtering -- searching should narrow which chips
  // show up, not shift the quadrant boundaries themselves.
  var amounts = displaySized.map(function(p){ return p.estimatedAmount; }).sort(function(a,b){ return a-b; });
  var mid = amounts.length ? amounts[Math.floor((amounts.length-1)/2)] : 0;
  function valueBucket(p) { return p.estimatedAmount >= mid ? 'High' : 'Low'; }

  var quadrants = {
    'High-Low':  { label:'Quick Wins',      cls:'pb-quad-tl', items:[] },
    'High-High': { label:'Major Projects',  cls:'pb-quad-tr', items:[] },
    'Low-Low':   { label:'Fill-ins',        cls:'pb-quad-bl', items:[] },
    'Low-High':  { label:'Reconsider',      cls:'pb-quad-br', items:[] }
  };
  displaySized.filter(matchesSearch).forEach(function(p){ quadrants[valueBucket(p) + '-' + pbEffortBucket(p)].items.push(p); });

  function chip(p) {
    var freqLabel = p.estimatedFrequency ? ' ' + p.estimatedFrequency.toLowerCase() : '';
    var confLabel = p.valueConfidence ? ', ' + p.valueConfidence.toLowerCase() + ' confidence' : '';
    return '<div class="pb-chip" onclick="goToProject(\'' + p.id + '\')" title="' + p.name.replace(/"/g,'&quot;') + ' — ' + fmtCost(p.estimatedAmount) + freqLabel + ', ' + p.tshirtSize + confLabel + '">' + p.name + '</div>';
  }

  var matrixHtml = !displaySized.length
    ? '<div class="empty-state" style="padding:30px"><p>No sized projects in this view yet.</p></div>'
    : '<div class="pb-matrix-wrap">' +
        '<div class="pb-axis-y">Value $</div>' +
        '<div class="pb-matrix">' +
          Object.keys(quadrants).map(function(k){
            var q = quadrants[k];
            return '<div class="pb-quad ' + q.cls + '"><div class="pb-quad-title">' + q.label + '</div><div class="pb-quad-chips">' + (q.items.map(chip).join('') || '<span class="text-muted" style="font-size:12px">—</span>') + '</div></div>';
          }).join('') +
        '</div>' +
        '<div class="pb-axis-x">Effort (T-shirt size) →</div>' +
      '</div>';

  // Rank numbers reflect true position in the full (unfiltered) order for this
  // tab, even when a search narrows which rows are actually shown.
  var listRows = displaySized.map(function(p, idx){ return { p:p, idx:idx }; })
    .filter(function(x){ return matchesSearch(x.p); })
    .map(function(x) {
      var p = x.p, idx = x.idx;
      return '<div class="pb-row" draggable="true" data-pid="' + p.id + '" data-idx="' + idx + '">' +
        '<span class="pb-drag-handle"><i class="ti ti-grip-vertical"></i></span>' +
        '<span class="pb-rank">' + (idx+1) + '</span>' +
        '<span class="pb-name" onclick="goToProject(\'' + p.id + '\')">' + p.name + (p.priorityIsOverride ? ' <span class="badge badge-amber" style="font-size:10px" title="Manually set — won\'t move automatically"><i class="ti ti-pin"></i> Manual</span>' : '') + '</span>' +
        '<span class="pb-cats">' + (p.categories && p.categories.length ? p.categories.map(function(c){ return '<span class="badge badge-blue">' + c + '</span>'; }).join(' ') : '') + '</span>' +
        '<span class="pb-value">' + fmtCost(p.estimatedAmount) + '<span class="text-muted">' + freqAbbr(p.estimatedFrequency) + '</span>' + confidenceDot(p.valueConfidence) + '</span>' +
        '<span class="pb-size">' + '<span class="badge badge-gray">' + p.tshirtSize + '</span>' + '</span>' +
      '</div>';
    }).join('');

  var unsizedVisible = unsized.filter(matchesSearch);
  var unsizedRows = unsizedVisible.map(function(p) {
    return '<div class="pb-unsized-row">' +
      '<span class="pb-name" onclick="goToProject(\'' + p.id + '\')">' + p.name + '</span>' +
      '<span class="text-muted" style="font-size:12px">' + (p.estimatedAmount == null ? 'Needs value estimate' : '') + (p.estimatedAmount == null && !p.tshirtSize ? ' · ' : '') + (!p.tshirtSize ? 'Needs T-shirt size' : '') + '</span>' +
      '<button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-edit"></i> Size it</button>' +
    '</div>';
  }).join('');

  document.getElementById('content').innerHTML =
    '<div class="info-banner info-amber"><i class="ti ti-arrows-sort" style="font-size:20px;flex-shrink:0;color:#BA7517"></i>' +
    '<span>Drag rows in the list to set priority order for <strong>' + scope + '</strong>. There is one overall ranking across all categories — this tab shows just the projects in it, in that same order. Reordering here only changes what you see elsewhere if it moves a project past another one that shares a category with it.</span></div>' +
    searchBoxHtml(st.search, 'Search projects by name…', 'prioritize-search', 'onPrioritizeSearch') +
    cat.html +
    '<div class="grid-2" style="align-items:start;gap:20px">' +
      '<div class="card">' +
        '<div class="section-title" style="margin-bottom:12px;display:flex;align-items:center;gap:6px">Value / Effort Matrix <i class="ti ti-help-circle pb-help-icon" onclick="pbShowMatrixHelp()" title="How this is calculated"></i></div>' +
        matrixHtml +
      '</div>' +
      '<div class="card">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:12px">' +
          '<div class="section-title" style="margin-bottom:0;display:flex;align-items:center;gap:6px">Priority Order — ' + scope + ' <i class="ti ti-help-circle pb-help-icon" onclick="pbShowPriorityHelp()" title="How this is calculated"></i></div>' +
          '<div style="display:flex;gap:8px;flex-shrink:0">' +
            (st.lastMove ? '<button class="btn btn-sm" onclick="pbUndoLastMove()"><i class="ti ti-arrow-back-up"></i> Undo</button>' : '') +
            (hasAnyOverride ? '<button class="btn btn-sm" onclick="pbShowResetPreview()"><i class="ti ti-refresh"></i> Reset to default</button>' : '') +
          '</div>' +
        '</div>' +
        (listRows || '<div class="text-muted" style="padding:20px;text-align:center">' + (searchQ ? 'No sized projects match your search' : 'No sized projects in this view') + '</div>') +
      '</div>' +
    '</div>' +
    (unsizedVisible.length
      ? '<div class="card" style="margin-top:20px"><div class="section-title" style="margin-bottom:12px">Needs sizing (' + unsizedVisible.length + ')</div>' + unsizedRows + '</div>'
      : '');

  window.setPrioritizeCategory = function(c) { st.category = c; pgPrioritizeBacklog(); };
  window.onPrioritizeSearch = function(v) {
    st.search = v; pgPrioritizeBacklog();
    var el = document.getElementById('prioritize-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };

  var rowEls = document.querySelectorAll('.pb-row');
  rowEls.forEach(function(el) {
    el.addEventListener('dragstart', function(ev) {
      st.dragPid = el.getAttribute('data-pid');
      el.classList.add('pb-dragging');
      ev.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', function() { el.classList.remove('pb-dragging'); });
    el.addEventListener('dragover', function(ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; });
    el.addEventListener('drop', function(ev) {
      ev.preventDefault();
      var fromPid = st.dragPid;
      var toPid = el.getAttribute('data-pid');
      st.dragPid = null;
      if (!fromPid || fromPid === toPid) return;
      // Splice against the GLOBAL order, not this tab's filtered view — the
      // drop target's position in that global order is what "move it here"
      // actually means, regardless of which tab the drag happened in.
      var ids = orderedSized.map(function(p){ return p.id; });
      var fromIdx = ids.indexOf(fromPid);
      var toIdx = ids.indexOf(toPid);
      if (fromIdx < 0 || toIdx < 0) return;
      // Snapshot everyone's rank/override as they stood right before this
      // move, so a single Undo can restore exactly this state afterward.
      var snapshotBeforeMove = orderedSized.map(function(p){ return { project_id: p.id, rank: p.priorityRank, is_override: p.priorityIsOverride }; });
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, fromPid);
      pbPersistOrder(ids, fromPid, snapshotBeforeMove);
    });
  });
}

// Writes the whole current order as everyone's rank. Only draggedPid (the
// project someone actually moved) gets flagged as an override; everyone else
// keeps whatever override status they already had, even though their rank
// number may shift to make room.
async function pbPersistOrder(orderedIds, draggedPid, snapshotBeforeMove) {
  var rows = orderedIds.map(function(pid, idx){
    var proj = D.projects.find(function(x){ return x.id === pid; });
    var isOverride = pid === draggedPid ? true : !!(proj && proj.priorityIsOverride);
    return { project_id: pid, rank: idx + 1, is_override: isOverride };
  });
  var result = await sb.from('project_priority_ranks').upsert(rows, { onConflict: 'project_id' });
  if (result.error) {
    showToast('Could not save order: ' + result.error.message, 'error');
    return;
  }
  rows.forEach(function(r) {
    var p = D.projects.find(function(x){ return x.id === r.project_id; });
    if (p) { p.priorityRank = r.rank; p.priorityIsOverride = r.is_override; }
  });
  if (snapshotBeforeMove) prioritizeBacklogState.lastMove = { snapshot: snapshotBeforeMove, movedPid: draggedPid };
  if (currentPage === 'prioritize-backlog') pgPrioritizeBacklog();
}

async function pbUndoLastMove() {
  var lastMove = prioritizeBacklogState.lastMove;
  if (!lastMove) return;
  var rows = lastMove.snapshot.filter(function(r){ return r.rank != null; });
  var result = await sb.from('project_priority_ranks').upsert(rows, { onConflict: 'project_id' });
  if (result.error) { showToast('Could not undo: ' + result.error.message, 'error'); return; }
  rows.forEach(function(r) {
    var p = D.projects.find(function(x){ return x.id === r.project_id; });
    if (p) { p.priorityRank = r.rank; p.priorityIsOverride = r.is_override; }
  });
  prioritizeBacklogState.lastMove = null;
  showToast('Move undone');
  if (currentPage === 'prioritize-backlog') pgPrioritizeBacklog();
}

// ── Schedule Modal ────────────────────────────────────────────────────────────

function openScheduleModal(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var ownerPoolSch = p.owner && individualResourceNames().indexOf(p.owner) < 0 ? individualResourceNames().concat([p.owner]) : individualResourceNames();
  var ownerOpts = '<option value="">— None (assign later) —</option>' + ownerPoolSch.map(function(n){
    var isInactiveCurrent = p.owner === n && individualResourceNames().indexOf(n) < 0;
    return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (p.owner === n ? ' selected' : '') + '>' + n + (isInactiveCurrent ? ' (no longer a resource)' : '') + '</option>';
  }).join('');

  var projectTagsSch = p.tags || [];
  function sharesTagSch(name) {
    if (!projectTagsSch.length) return false;
    var res2 = D.resources.find(function(r){ return r.name === name; });
    return !!(res2 && res2.tags && res2.tags.some(function(t){ return projectTagsSch.indexOf(t) >= 0; }));
  }
  var memberNames = individualResourceNames().slice().sort(function(a, b) {
    var aRec = sharesTagSch(a) ? 0 : 1;
    var bRec = sharesTagSch(b) ? 0 : 1;
    if (aRec !== bRec) return aRec - bRec;
    return a.localeCompare(b);
  });
  var memberOpts = memberNames.map(function(n) {
    var chk = p.team.indexOf(n) >= 0 ? ' checked' : '';
    var rec = sharesTagSch(n);
    return '<label class="member-check schm-row" data-name="' + n.toLowerCase() + '"><input type="checkbox" id="schm-' + n.replace(/ /g,'_') + '"' + chk + '> ' + n + (rec ? ' <span class="badge badge-teal" style="font-size:10px">Recommended</span>' : '') + '</label>';
  }).join('');

  var unplannedDeps = (p.dependencies||[]).filter(function(d){ return !(d.start && d.end); });
  var depWarning = unplannedDeps.length
    ? '<div class="info-banner info-amber" style="margin-bottom:16px"><i class="ti ti-alert-triangle" style="font-size:20px;flex-shrink:0;color:#BA7517"></i>' +
      '<span>This project depends on ' + (unplannedDeps.length===1 ? 'a project' : unplannedDeps.length + ' projects') + ' that ' + (unplannedDeps.length===1?'hasn\'t':'haven\'t') + ' been planned yet: <strong>' + unplannedDeps.map(function(d){ return d.name; }).join(', ') + '</strong>. You can still schedule this project, but worth planning ' + (unplannedDeps.length===1?'that one':'those') + ' too.</span></div>'
    : '';
  showModal(
    '<div class="modal-title">Schedule project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    depWarning +
    '<div style="font-weight:600;margin-bottom:16px;color:#534AB7">' + p.name + '</div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Planned start *</div><input type="date" id="sch-start" value="' + (p.plannedStart||'') + '"></div>' +
    '<div class="form-group"><div class="form-label">Target end *</div><input type="date" id="sch-end" value="' + (p.end||'') + '"></div></div>' +
    '<div class="form-group"><div class="form-label">Owner</div><select id="sch-owner">' + ownerOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Team members</div><input type="text" id="schm-search" placeholder="Search people…" oninput="filterSchmList(this.value)"><div id="schm-list" style="max-height:240px;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;padding-right:4px">' + memberOpts + '</div></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="scheduleProject(\'' + p.id + '\')"><i class="ti ti-calendar-check"></i> Save changes</button></div>', true);
  window.filterSchmList = function(query) {
    var q = query.trim().toLowerCase();
    document.querySelectorAll('#schm-list .schm-row').forEach(function(row) {
      row.style.display = row.getAttribute('data-name').indexOf(q) >= 0 ? 'flex' : 'none';
    });
  };
}

async function scheduleProject(pid) {
  var p     = D.projects.find(function(x){ return x.id === pid; });
  var beforeSnapshot = { stage: p.stage, status: p.status, owner: p.owner, start: p.start, end: p.end };
  var start = document.getElementById('sch-start').value;
  var end   = document.getElementById('sch-end').value;
  if (!start || !end) { showToast('Please set a start and end date'); return; }
  var newStage = computeStageFromDates(start, end);
  var newTeamNames = individualResourceNames().filter(function(n){ var el = document.getElementById('schm-' + n.replace(/ /g,'_')); return el && el.checked; });
  var ownerName = document.getElementById('sch-owner').value;
  var ownerResource = resolveResource(ownerName);

  var updatePayload = {
    planned_start: start, start_date: start, end_date: end, stage: newStage,
    owner_id: ownerResource ? ownerResource.id : null, owner_name: ownerName || null,
    target_quarter: null, target_year: null, target_end_quarter: null, target_end_year: null
  };
  if (newStage === 'active') updatePayload.status = 'On Track';
  var result = await sb.from('projects').update(updatePayload).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  var afterSnapshot = { stage: newStage, owner: ownerName, start: start, end: end };
  if (updatePayload.status) afterSnapshot.status = updatePayload.status;
  await logProjectChanges(pid, beforeSnapshot, afterSnapshot, 'schedule');
  p.targetQuarter = null; p.targetYear = null; p.targetEndQuarter = null; p.targetEndYear = null;
  if (newStage === 'active') p.status = 'On Track';

  var newRealIds = newTeamNames.map(function(n){ return resolveResource(n); }).filter(Boolean).map(function(r){ return r.id; });
  var oldIds = p.teamIds || [];
  var toAdd = newRealIds.filter(function(id){ return oldIds.indexOf(id) < 0; });
  var toRemove = oldIds.filter(function(id){ return newRealIds.indexOf(id) < 0; });
  if (toAdd.length) await sb.from('resource_projects').insert(toAdd.map(function(id){ return { project_id: pid, resource_id: id }; }));
  for (var i = 0; i < toRemove.length; i++) { await sb.from('resource_projects').delete().eq('project_id', pid).eq('resource_id', toRemove[i]); }

  p.team = newTeamNames; p.teamIds = newRealIds;
  p.owner = ownerName; p.ownerId = ownerResource ? ownerResource.id : null;
  p.plannedStart = start; p.start = start; p.end = end; p.stage = newStage;
  await applyOwnerAsLead(p);
  var r = D.requests.find(function(x){ return x.id === p.requestId; });
  if (r) await syncRequestStatus(r.id, { status: 'Planned', linkedProject: pid });
  addNotif(r ? r.submitter : '', 'Great news! "' + p.name + '" has been scheduled to start on ' + start + (p.owner ? '. Owner: ' + p.owner : '') + '.', 'planned');
  closeModal(); showToast('Project scheduled'); renderNav();
  if (currentPage === 'backlog') pgBacklog();
  else if (currentPage === 'planned') pgPlanned();
  else nav(currentPage);
}

// ── Planned ───────────────────────────────────────────────────────────────────

function pgPlanned() {
  tb('Planned projects');
  var st = plannedProjState;
  var allPlanned = D.projects.filter(function(p){ return p.stage === 'planned'; });
  var cat = buildCategoryTabs(allPlanned, st.category, 'setPlannedCategory');
  st.category = cat.resolvedFilter;

  var pp = allPlanned.filter(function(p){ return projectMatchesCategoryTab(p, st.category); });
  if (st.search) { var plq = st.search.toLowerCase(); pp = pp.filter(function(p){ return p.name.toLowerCase().indexOf(plq) >= 0; }); }
  if (st.filters.tags.length) pp = pp.filter(function(p){ return st.filters.tags.some(function(t){ return (p.tags||[]).indexOf(t) >= 0; }); });
  if (st.filters.priority.length) pp = pp.filter(function(p){ return st.filters.priority.indexOf(p.priority) >= 0; });
  if (st.filters.owner.length) pp = pp.filter(function(p){ return st.filters.owner.indexOf(p.owner) >= 0; });

  pp = pp.slice().sort(function(a,b) {
    var av, bv;
    if (st.sort === 'priority') { av = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 9; bv = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 9; }
    else {
      var sortKey = st.sort === 'start' ? 'plannedStart' : st.sort;
      av = a[sortKey]; bv = b[sortKey];
      av = (av == null ? '' : av); bv = (bv == null ? '' : bv);
      if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
    }
    var cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return st.dir === 'asc' ? cmp : -cmp;
  });

  var today = new Date();
  var in30  = new Date(); in30.setDate(today.getDate() + 30);

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }
  function filterIcon(col, active) { return '<button class="th-filter-btn" onclick="event.stopPropagation();togglePlannedFilter(\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>'; }

  var priorityChoices = PRIORITIES.slice();
  var ownerChoices = []; allPlanned.forEach(function(p){ if (p.owner && ownerChoices.indexOf(p.owner) < 0) ownerChoices.push(p.owner); }); ownerChoices.sort();
  var tagChoices = D.tags.map(function(t){ return t.name; });

  var rows = pp.map(function(p) {
    var startDate = p.plannedStart ? new Date(p.plannedStart) : null;
    var soonNoOwner = !p.owner && startDate && startDate <= in30;
    var actionBtns = D.role === 'admin'
      ? '<button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i></button> ' +
        '<button class="btn btn-sm btn-success" onclick="activateProject(\'' + p.id + '\')"><i class="ti ti-player-play"></i> Activate</button> ' +
        '<button class="btn btn-sm" onclick="openScheduleModal(\'' + p.id + '\')"><i class="ti ti-edit"></i> Edit schedule</button>'
      : '<button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>';
    return '<tr>' +
      '<td class="bold">' + p.name + '</td>' +
      '<td>' + ((p.tags && p.tags.length) ? p.tags.map(function(t){ return tagBadge(t); }).join(' ') : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.priority ? bdg(p.priority) : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.owner || '<span class="text-muted">—</span>') + (soonNoOwner ? ' <i class="ti ti-alert-triangle" style="color:#BA7517" title="Starts within 30 days, no Owner assigned yet"></i>' : '') + '</td>' +
      '<td>' + (p.plannedStart || '<span class="text-muted">TBD</span>') + '</td>' +
      '<td>' + (p.end || '<span class="text-muted">TBD</span>') + ' ' + lateBadgeHtml(isProjectLate(p)) + '</td>' +
      '<td style="white-space:nowrap">' + actionBtns + '</td>' +
      '</tr>';
  }).join('');

  var bannerText = 'These projects are <strong>scheduled</strong> with a start date. Activate them when work begins.';

  document.getElementById('content').innerHTML =
    '<div class="info-banner info-blue"><i class="ti ti-calendar-event" style="font-size:20px;flex-shrink:0;color:#185FA5"></i><span>' + bannerText + '</span></div>' +
    searchBoxHtml(st.search, 'Search projects by name…', 'planned-search', 'onPlannedSearch') +
    cat.html +
    '<div class="card"><div class="table-wrap"><table><thead><tr>' +
      '<th class="sortable-th" onclick="setPlannedSort(\'name\')">Project ' + arrow('name') + '</th>' +
      '<th class="sortable-th"><span onclick="setPlannedSort(\'tags\')">Tags ' + arrow('tags') + '</span>' + filterIcon('tags', st.filters.tags.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setPlannedSort(\'priority\')">Priority ' + arrow('priority') + '</span>' + filterIcon('priority', st.filters.priority.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setPlannedSort(\'owner\')">Owner ' + arrow('owner') + '</span>' + filterIcon('owner', st.filters.owner.length>0) + '</th>' +
      '<th class="sortable-th" onclick="setPlannedSort(\'start\')">Target start date ' + arrow('start') + '</th>' +
      '<th class="sortable-th" onclick="setPlannedSort(\'end\')">Target end date ' + arrow('end') + '</th>' +
      '<th></th>' +
    '</tr></thead><tbody>' + (rows || '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:20px">No planned projects match these filters</td></tr>') + '</tbody></table></div></div>';

  window.onPlannedSearch = function(v) {
    st.search = v; pgPlanned();
    var el = document.getElementById('planned-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setPlannedCategory = function(c) { st.category = c; pgPlanned(); };
  window.setPlannedSort = function(col) { if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; } pgPlanned(); };
  window.togglePlannedFilter = function(col) {
    var labelMap = { tags:'Tags', priority:'Priority', owner:'Owner' };
    var choicesMap = { tags:tagChoices, priority:priorityChoices, owner:ownerChoices };
    openFilterModal(labelMap[col], choicesMap[col],
      function() { return st.filters[col]; },
      function(val) { var arr = st.filters[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { st.filters[col] = []; },
      pgPlanned
    );
  };
}

async function autoActivatePlannedProjects() {
  var today = new Date().toISOString().slice(0,10);
  var due = D.projects.filter(function(p){ return p.stage === 'planned' && p.start && p.start <= today; });
  if (!due.length) return;

  var activatedCount = 0;
  for (var i = 0; i < due.length; i++) {
    var p = due[i];
    var result = await sb.from('projects').update({ stage: 'active', status: 'On Track' }).eq('id', p.id);
    if (result.error) { console.error('Could not auto-activate "' + p.name + '":', result.error); continue; }
    p.stage = 'active'; p.status = 'On Track';
    activatedCount++;
    var r = D.requests.find(function(x){ return x.id === p.requestId; });
    if (r) await syncRequestStatus(r.id, { status: 'Active' });
  }

  if (activatedCount > 0) {
    showToast(activatedCount === 1 ? '1 project automatically moved to Active (start date reached)' : activatedCount + ' projects automatically moved to Active (start date reached)');
    renderNav();
    if (currentPage === 'planned') pgPlanned();
    else if (currentPage === 'projects') pgProjects();
    else if (currentPage === 'dashboard') pgDashboard();
  }
}

async function activateProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var beforeSnapshot = { stage: p.stage, status: p.status };
  var result = await sb.from('projects').update({ stage: 'active', status: 'On Track' }).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  await logProjectChanges(pid, beforeSnapshot, { stage: 'active', status: 'On Track' }, 'activate');
  p.stage = 'active'; p.status = 'On Track';
  var r = D.requests.find(function(x){ return x.id === p.requestId; });
  if (r) await syncRequestStatus(r.id, { status: 'Active' });
  showToast('"' + p.name + '" is now active'); renderNav();
  if (currentPage === 'planned') pgPlanned(); else pgProjects();
}

// ── Active Projects ───────────────────────────────────────────────────────────

function pgProjects() {
  tb('Active');
  var st = activeProjState;
  var allActive = myProjects().filter(function(p){ return p.stage === 'active'; });
  var cat = buildCategoryTabs(allActive, st.category, 'setActiveProjCategory');
  st.category = cat.resolvedFilter;

  var ps = allActive.filter(function(p){ return projectMatchesCategoryTab(p, st.category); });
  if (st.search) { var apq = st.search.toLowerCase(); ps = ps.filter(function(p){ return p.name.toLowerCase().indexOf(apq) >= 0; }); }
  if (st.filters.tags.length) ps = ps.filter(function(p){ return st.filters.tags.some(function(t){ return (p.tags||[]).indexOf(t) >= 0; }); });
  if (st.filters.status.length) ps = ps.filter(function(p){ return st.filters.status.indexOf(p.status) >= 0; });
  if (st.filters.priority.length) ps = ps.filter(function(p){ return st.filters.priority.indexOf(p.priority) >= 0; });
  if (st.filters.phase.length) ps = ps.filter(function(p){ return st.filters.phase.indexOf(p.phase) >= 0; });
  if (st.filters.owner.length) ps = ps.filter(function(p){ return st.filters.owner.indexOf(p.owner) >= 0; });

  ps = ps.slice().sort(function(a,b) {
    var av, bv;
    if (st.sort === 'priority') { av = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 9; bv = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 9; }
    else {
      av = a[st.sort]; bv = b[st.sort];
      av = (av == null ? '' : av); bv = (bv == null ? '' : bv);
      if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
    }
    var cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return st.dir === 'asc' ? cmp : -cmp;
  });

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }
  function filterIcon(col, active) { return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleActiveProjFilter(\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>'; }

  var statusChoices = STATUSES.slice(), priorityChoices = PRIORITIES.slice(), phaseChoices = PHASES.slice();
  var ownerChoices = []; allActive.forEach(function(p){ if (p.owner && ownerChoices.indexOf(p.owner) < 0) ownerChoices.push(p.owner); }); ownerChoices.sort();
  var tagChoices = D.tags.map(function(t){ return t.name; });

  var rows = ps.map(function(p) {
    return '<tr>' +
      '<td style="text-align:center">' + hdot(p.health) + '</td>' +
      '<td class="bold">' + p.name + '</td>' +
      '<td>' + ((p.tags && p.tags.length) ? p.tags.map(function(t){ return tagBadge(t); }).join(' ') : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.status ? bdg(p.status) : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.priority ? bdg(p.priority) : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.phase || '<span class="text-muted">—</span>') + '</td>' +
      '<td style="min-width:110px"><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:6px;background:#f0ede8;border-radius:3px;overflow:hidden"><div style="height:100%;width:' + p.progress + '%;background:#534AB7"></div></div><span class="text-muted" style="font-size:11px">' + p.progress + '%</span></div></td>' +
      '<td>' + (p.owner || '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.end || '<span class="text-muted">TBD</span>') + ' ' + lateBadgeHtml(isProjectLate(p)) + '</td>' +
      '<td><button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button></td>' +
      '</tr>';
  }).join('');

  document.getElementById('content').innerHTML =
    searchBoxHtml(st.search, 'Search projects by name…', 'active-projects-search', 'onActiveProjectsSearch') +
    cat.html +
    '<div class="card"><div class="table-wrap"><table><thead><tr>' +
      '<th style="text-align:center">Health</th>' +
      '<th class="sortable-th" onclick="setActiveProjSort(\'name\')">Project ' + arrow('name') + '</th>' +
      '<th class="sortable-th"><span onclick="setActiveProjSort(\'tags\')">Tags ' + arrow('tags') + '</span>' + filterIcon('tags', st.filters.tags.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setActiveProjSort(\'status\')">Status ' + arrow('status') + '</span>' + filterIcon('status', st.filters.status.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setActiveProjSort(\'priority\')">Priority ' + arrow('priority') + '</span>' + filterIcon('priority', st.filters.priority.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setActiveProjSort(\'phase\')">Phase ' + arrow('phase') + '</span>' + filterIcon('phase', st.filters.phase.length>0) + '</th>' +
      '<th class="sortable-th" onclick="setActiveProjSort(\'progress\')">Progress % ' + arrow('progress') + '</th>' +
      '<th class="sortable-th"><span onclick="setActiveProjSort(\'owner\')">Owner ' + arrow('owner') + '</span>' + filterIcon('owner', st.filters.owner.length>0) + '</th>' +
      '<th class="sortable-th" onclick="setActiveProjSort(\'end\')">Target end date ' + arrow('end') + '</th>' +
      '<th></th>' +
    '</tr></thead><tbody>' + (rows || '<tr><td colspan="10" class="text-muted" style="text-align:center;padding:20px">No active projects match these filters</td></tr>') + '</tbody></table></div></div>';

  window.onActiveProjectsSearch = function(v) {
    st.search = v; pgProjects();
    var el = document.getElementById('active-projects-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setActiveProjCategory = function(c) { st.category = c; pgProjects(); };
  window.setActiveProjSort = function(col) { if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; } pgProjects(); };
  window.toggleActiveProjFilter = function(col) {
    var labelMap = { tags:'Tags', status:'Status', priority:'Priority', phase:'Phase', owner:'Owner' };
    var choicesMap = { tags:tagChoices, status:statusChoices, priority:priorityChoices, phase:phaseChoices, owner:ownerChoices };
    openFilterModal(labelMap[col], choicesMap[col],
      function() { return st.filters[col]; },
      function(val) { var arr = st.filters[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { st.filters[col] = []; },
      pgProjects
    );
  };
}

// ── Completed ─────────────────────────────────────────────────────────────────

function pgCompleted() {
  tb('Completed projects');
  var st = completedProjState;
  var allCompleted = D.projects.filter(function(p){ return p.stage === 'complete'; });
  var cat = buildCategoryTabs(allCompleted, st.category, 'setCompletedCategory');
  st.category = cat.resolvedFilter;

  var cp = allCompleted.filter(function(p){ return projectMatchesCategoryTab(p, st.category); });
  if (st.search) { var cq = st.search.toLowerCase(); cp = cp.filter(function(p){ return p.name.toLowerCase().indexOf(cq) >= 0; }); }
  if (st.tagFilter.length) cp = cp.filter(function(p){ return st.tagFilter.some(function(t){ return (p.tags||[]).indexOf(t) >= 0; }); });

  cp = cp.slice().sort(function(a,b) {
    var av = a[st.sort]; var bv = b[st.sort];
    av = (av == null ? '' : av); bv = (bv == null ? '' : bv);
    if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
    var cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return st.dir === 'asc' ? cmp : -cmp;
  });

  function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—'; }

  var rows = cp.map(function(p) {
    return '<tr><td class="bold">' + p.name +
      (p.tags && p.tags.length ? '<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">' + p.tags.map(function(t){ return tagBadge(t); }).join(' ') + '</div>' : '') +
      '</td><td>' + badgeIf('badge-purple', p.value) + '</td>' +
      '<td>' + bdg(p.priority) + '</td><td class="text-muted">' + (p.owner||'—') + '</td><td class="text-muted">' + fmtDate(p.completedAt) + '</td>' +
      '<td><button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>' +
      (D.role === 'admin' ? ' <button class="btn btn-sm" onclick="reactivateProject(\'' + p.id + '\')"><i class="ti ti-refresh"></i> Re-activate</button>' : '') +
      '</td></tr>';
  }).join('');
  document.getElementById('content').innerHTML =
    searchBoxHtml(st.search, 'Search projects by name…', 'completed-search', 'onCompletedSearch') +
    cat.html +
    (cp.length
      ? '<div class="card"><div class="section-title">Completed projects</div><div class="table-wrap"><table>' +
        '<thead><tr><th>Project</th><th>Value area</th><th>Priority</th><th>Owner</th><th>Completed</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div></div>'
      : '<div class="empty-state"><i class="ti ti-circle-check"></i><p>No completed projects yet</p></div>');
  window.onCompletedSearch = function(v) {
    st.search = v; pgCompleted();
    var el = document.getElementById('completed-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setCompletedCategory = function(c) { st.category = c; pgCompleted(); };
  window.openCompletedTagFilter = function() {
    openFilterModal('Tags', D.tags.map(function(t){ return t.name; }),
      function() { return st.tagFilter; },
      function(val) { var i = st.tagFilter.indexOf(val); if (i>=0) st.tagFilter.splice(i,1); else st.tagFilter.push(val); },
      function() { st.tagFilter = []; },
      pgCompleted
    );
  };
}

async function reactivateProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var beforeSnapshot = { stage: p.stage, status: p.status };
  var result = await sb.from('projects').update({ stage: 'active', status: 'On Track', completed_at: null }).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  await logProjectChanges(pid, beforeSnapshot, { stage: 'active', status: 'On Track' }, 'reactivate');
  p.stage = 'active'; p.status = 'On Track'; p.completedAt = null;
  showToast('"' + p.name + '" re-activated'); renderNav(); pgCompleted();
}

// ── Project Detail ─────────────────────────────────────────────────────────────

var SOURCE_LABELS = {
  request: 'From request', edit: 'Edited', schedule: 'Scheduled', activate: 'Activated',
  hold: 'Put on hold', resume: 'Resumed', complete: 'Marked complete', reactivate: 'Re-activated'
};

function openEditProjectFinancialsModal(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  if (!canEditProjectFinancials(p)) return; // safety check; UI is already hidden otherwise
  showModal('<div class="modal-title">Edit financial detail <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-sub" style="margin-bottom:12px">Not visible to anyone without financial-view permission, anywhere in the app.</div>' +
    '<div class="form-group"><div class="form-label">This is a…</div><select id="epf-type"><option value="">— Not set —</option><option value="Revenue"' + (p.estimatedType==='Revenue'?' selected':'') + '>Revenue opportunity</option><option value="Savings"' + (p.estimatedType==='Savings'?' selected':'') + '>Cost savings opportunity</option></select></div>' +
    '<div class="grid-2"><select id="epf-freq"><option' + (p.estimatedFrequency==='Monthly'?' selected':'') + '>Monthly</option><option' + (p.estimatedFrequency==='Annually'?' selected':'') + '>Annually</option></select>' +
    '<input type="text" id="epf-amount" value="' + (p.estimatedAmount!=null?p.estimatedAmount:'') + '" placeholder="$ amount (optional)"></div>' +
    '<div class="form-group" style="margin-top:8px"><div class="form-label">Value confidence</div><select id="epf-value-confidence">' + confidenceOptsHtml(p.valueConfidence) + '</select></div>' +
    '<div class="form-group"><div class="form-label">Cost estimate</div>' +
      '<div class="grid-2"><input type="text" id="epf-cost-amount" value="' + (p.costEstimate!=null?p.costEstimate:'') + '" placeholder="$ amount (optional)"><select id="epf-cost-confidence">' + confidenceOptsHtml(p.costConfidence) + '</select></div>' +
    '</div>' +
    '<div id="epf-err" style="color:#A32D2D;font-size:12px;margin-top:4px;display:none">Please enter valid numbers (digits only)</div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="epf-save">Save changes</button></div>');

  ['epf-amount','epf-cost-amount'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', function() {
      this.value = this.value.replace(/[^0-9]/g,'');
      document.getElementById('epf-err').style.display = 'none';
    });
  });

  document.getElementById('epf-save').onclick = async function() {
    var estType = document.getElementById('epf-type').value || null;
    var estAmountRaw = document.getElementById('epf-amount').value.trim();
    var costAmountRaw = document.getElementById('epf-cost-amount').value.trim();
    if ((estAmountRaw && isNaN(Number(estAmountRaw))) || (costAmountRaw && isNaN(Number(costAmountRaw)))) {
      document.getElementById('epf-err').style.display = 'block'; return;
    }
    var btn = document.getElementById('epf-save'); btn.disabled = true;
    var updates = {
      estimated_type: estType,
      estimated_frequency: estAmountRaw ? document.getElementById('epf-freq').value : null,
      estimated_amount: estAmountRaw ? Number(estAmountRaw) : null,
      value_confidence: document.getElementById('epf-value-confidence').value || null,
      cost_estimate: costAmountRaw ? Number(costAmountRaw) : null,
      cost_confidence: document.getElementById('epf-cost-confidence').value || null
    };
    // Deliberately not logged via logProjectChanges: the general Change Log tab
    // is visible to anyone who can see the project, regardless of financial
    // permission, so logging dollar figures there would leak them.
    var result = await sb.from('projects').update(updates).eq('id', pid);
    if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
    p.estimatedType = updates.estimated_type; p.estimatedFrequency = updates.estimated_frequency;
    p.estimatedAmount = updates.estimated_amount; p.valueConfidence = updates.value_confidence;
    p.costEstimate = updates.cost_estimate; p.costConfidence = updates.cost_confidence;
    showToast('Financial detail updated'); closeModal();
    if (currentPage === 'projectDetail') pgProjectDetail(pid, 'overview');
  };
}

// Fetches project_change_log once and populates both the System & Audit
// "Last edited" line and the Change Log section at the bottom of the
// Information tab -- they used to be two separate tabs with their own
// fetch each; now that they're both always on the page together, one
// fetch serves both instead of duplicating the query on every render.
async function loadAndRenderChangeLog(pid) {
  var result = await sb.from('project_change_log').select('*').eq('project_id', pid);
  var lastEditedEl = document.getElementById('pmeta-last-edited');
  var logEl = document.getElementById('pinfo-changelog-body');
  if (!lastEditedEl && !logEl) return; // user navigated away before the fetch finished

  if (result.error) {
    if (lastEditedEl) lastEditedEl.innerHTML = '<div class="form-label">Last edited</div><span class="text-muted">Could not load</span>';
    if (logEl) logEl.innerHTML = '<div class="empty-state" style="padding:24px"><p>Could not load change history: ' + result.error.message + '</p></div>';
    return;
  }

  var entries = (result.data || []).slice().sort(function(a,b){ return (b.changed_at||'').localeCompare(a.changed_at||''); });

  if (lastEditedEl) {
    lastEditedEl.innerHTML = entries.length
      ? '<div class="form-label">Last edited</div>' + fmtDate(entries[0].changed_at) + ' <span class="text-muted">by ' + entries[0].changed_by_name + '</span>'
      : '<div class="form-label">Last edited</div><span class="text-muted">No changes recorded yet</span>';
  }

  if (logEl) {
    logEl.innerHTML = entries.length
      ? entries.map(function(e) {
          var oldDisp = e.old_value == null ? '<em style="color:#999">empty</em>' : e.old_value;
          var newDisp = e.new_value == null ? '<em style="color:#999">empty</em>' : e.new_value;
          return '<div style="padding:10px 0;border-bottom:1px solid #f0ede8">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
              '<span class="bold" style="font-size:13px">' + e.field_label + '</span>' +
              '<span class="badge badge-gray" style="font-size:10px">' + (SOURCE_LABELS[e.source] || e.source) + '</span>' +
            '</div>' +
            '<div style="font-size:13px;color:#444">' + oldDisp + ' <i class="ti ti-arrow-right" style="color:#999"></i> ' + newDisp + '</div>' +
            '<div class="text-muted" style="font-size:11px;margin-top:2px">' + e.changed_by_name + ' · ' + fmtDate(e.changed_at) + '</div>' +
          '</div>';
        }).join('')
      : '<div class="empty-state" style="padding:24px"><i class="ti ti-history"></i><p>No changes recorded yet</p></div>';
  }
}

function pgProjectDetail(pid, tab) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  if (!p) { nav('projects'); return; }
  tab = tab || 'overview';
  currentPage = 'projectDetail';
  renderNav();
  var editable = canEdit(p);
  var isComplete = p.stage === 'complete';
  var tbs = ['overview','team','milestones','tasks','todos','raid','documentation'];

  function sortedMilestones() {
    return p.milestones.slice().sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  function timelineHtml() {
    var sorted = sortedMilestones();
    if (!sorted.length) return '<div class="text-muted" style="font-size:12px">No milestones tracked yet</div>';
    return '<div class="mini-timeline">' + sorted.map(function(m) {
      return '<div class="mt-item"><div class="mt-dot' + (m.done ? ' mt-done' : '') + '"></div>' +
        '<div class="mt-body"><div class="mt-name">' + m.name + '</div>' +
        '<div class="mt-date">' + (m.done ? 'Completed ' + (m.completedDate || m.date) : 'Planned ' + m.date) + ' ' + lateBadgeHtml(isMilestoneLate(m)) + '</div></div></div>';
    }).join('') + '</div>';
  }

  function tabC(t) {
    if (t === 'overview') {
      function fieldBox(label, valueHtml) {
        return '<div><div class="form-label" style="font-size:11px;color:#888;margin-bottom:3px">' + label + '</div><div style="font-size:13px">' + valueHtml + '</div></div>';
      }
      function editBtnRow(key, allowed) {
        if (allowed === undefined) allowed = editable;
        return allowed ? '<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn btn-sm" onclick="setProjectInfoEditing(\'' + key + '\')"><i class="ti ti-edit"></i> Edit</button></div>' : '';
      }
      function saveCancelRow(saveFn) {
        return '<div style="display:flex;gap:8px;margin-top:14px">' +
          '<button class="btn btn-primary btn-sm" id="pf-save" onclick="' + saveFn + '(\'' + p.id + '\')"><i class="ti ti-check"></i> Save</button>' +
          '<button class="btn btn-sm" onclick="setProjectInfoEditing(null)">Cancel</button>' +
        '</div>';
      }
      var canViewFin = canViewFinancials(p);
      var canEditFin = canEditProjectFinancials(p);

      var sectionDefs = PROJECT_INFO_SUBTABS.filter(function(s){ return s.key !== 'financials' || canViewFin; });

      function section(key, label, bodyHtml) {
        return '<div id="pinfo-' + key + '" style="scroll-margin-top:16px;padding-bottom:24px;margin-bottom:24px;border-bottom:1px solid #f0ede8">' +
          '<div class="section-title">' + label + '</div>' + bodyHtml + '</div>';
      }

      var navHtml = '<div style="width:210px;flex-shrink:0;position:sticky;top:16px;display:flex;flex-direction:column;gap:2px">' +
        sectionDefs.map(function(s){
          return '<div class="nav-item" onclick="scrollToProjectInfoSection(\'' + s.key + '\')"><i class="ti ' + s.icon + '"></i>' + s.label + '</div>';
        }).join('') +
        '<div class="nav-item" onclick="scrollToProjectInfoSection(\'changelog\')"><i class="ti ti-history"></i>Change Log</div>' +
      '</div>';

      var identityBody = (function() {
        if (editable && projectInfoEditing === 'identity') {
          var priorOptsI = PRIORITIES.map(function(s){
            var isSelected = p.priority === s || (PRIORITIES.indexOf(p.priority) < 0 && s === 'Needs prioritization');
            return '<option' + (isSelected ? ' selected' : '') + '>' + s + '</option>';
          }).join('');
          var valOptsI = (VALUE_AREAS.indexOf(p.value) < 0 ? '<option value="" selected>— Not set —</option>' : '') + VALUE_AREAS.map(function(s){ return '<option' + (p.value===s?' selected':'') + '>' + s + '</option>'; }).join('');
          var tshirtOptsI = '<option value=""' + (!p.tshirtSize?' selected':'') + '>— Not sized —</option>' + TSHIRT_SIZES.map(function(s){ return '<option' + (p.tshirtSize===s?' selected':'') + '>' + s + '</option>'; }).join('');
          var buOptsI = '<option value="">— None —</option>' + BUSINESS_UNITS.map(function(s){ return '<option' + (p.businessUnit===s?' selected':'') + '>' + s + '</option>'; }).join('');
          var catCbsI = CATEGORIES.map(function(s){
            var checked = (p.categories||[]).indexOf(s) >= 0;
            return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;font-size:13px"><input type="checkbox" class="pfi-category-cb" value="' + s + '"' + (checked?' checked':'') + '> ' + s + '</label>';
          }).join('');
          return '<div class="form-group" style="margin-bottom:12px"><div class="form-label">Project name</div><input type="text" id="pfi-name" value="' + p.name.replace(/"/g,'&quot;') + '"></div>' +
            '<div class="form-group" style="margin-bottom:12px"><div class="form-label">Description</div><textarea id="pfi-desc">' + (p.description||'') + '</textarea></div>' +
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px 16px;margin-bottom:12px">' +
              '<div><div class="form-label">Priority</div><select id="pfi-priority">' + priorOptsI + '</select></div>' +
              '<div><div class="form-label">Value area</div><select id="pfi-value">' + valOptsI + '</select></div>' +
              '<div><div class="form-label">T-shirt size</div><select id="pfi-tshirt">' + tshirtOptsI + '</select></div>' +
              '<div><div class="form-label">Business unit</div><select id="pfi-bu">' + buOptsI + '</select></div>' +
              '<div><div class="form-label">Delivery methodology</div><select id="pfi-methodology"><option value=""' + (!p.deliveryMethodology?' selected':'') + '>Not selected</option><option' + (p.deliveryMethodology==='Agile'?' selected':'') + '>Agile</option><option' + (p.deliveryMethodology==='Waterfall'?' selected':'') + '>Waterfall</option><option' + (p.deliveryMethodology==='Hybrid'?' selected':'') + '>Hybrid</option></select></div>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:0"><div class="form-label">Category</div>' + catCbsI + '</div>' +
            saveCancelRow('saveProjectIdentity');
        }
        return editBtnRow('identity') +
            fieldBox('Project name', p.name) +
            '<div class="form-group" style="margin:12px 0"><div class="form-label" style="font-size:11px;color:#888;margin-bottom:3px">Description</div><div style="font-size:13px;line-height:1.6">' + (p.description||'<span class="text-muted">—</span>') + '</div></div>' +
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px 20px;margin:12px 0 16px">' +
              fieldBox('Priority', bdg(p.priority)) +
              fieldBox('Value area', badgeIf('badge-purple', p.value)) +
              fieldBox('T-shirt size', p.tshirtSize ? '<span class="badge badge-gray">' + p.tshirtSize + '</span>' : '<span class="text-muted">Not sized</span>') +
              fieldBox('Business unit', p.businessUnit || '—') +
              fieldBox('Delivery methodology', p.deliveryMethodology ? '<span class="badge badge-gray">' + p.deliveryMethodology + '</span>' : '<span class="text-muted">Not selected</span>') +
              fieldBox('Project ID', '<span class="text-muted">#' + (p.projectNumber || '—') + '</span>') +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px"><div class="form-label" style="font-size:11px;color:#888;margin-bottom:3px">Category</div>' +
              (p.categories && p.categories.length ? p.categories.map(function(c){ return '<span class="badge badge-blue">' + c + '</span>'; }).join(' ') : '<span class="text-muted" style="font-size:13px">—</span>') +
            '</div>' +
            '<div class="form-group" style="margin-bottom:0"><div class="form-label" style="font-size:11px;color:#888;margin-bottom:3px">Tags</div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
              (p.tags && p.tags.length ? p.tags.map(function(t){ return tagBadge(t); }).join('') : '<span class="text-muted" style="font-size:13px">No tags yet</span>') +
              (editable ? '<button class="btn btn-sm" onclick="openProjectTagPicker(\'' + p.id + '\')"><i class="ti ti-tag"></i> Edit tags</button>' : '') +
            '</div></div>';
      })();

      var scheduleBody = (function() {
        if (editable && projectInfoEditing === 'schedule') {
          var statusOptsS = (STATUSES.indexOf(p.status) < 0 ? '<option value="" selected>— Not set —</option>' : '') + STATUSES.map(function(s){ return '<option' + (p.status===s?' selected':'') + '>' + s + '</option>'; }).join('');
          var phaseOptsS  = (PHASES.indexOf(p.phase) < 0 ? '<option value="" selected>— Not set —</option>' : '') + PHASES.map(function(s){ return '<option' + (p.phase===s?' selected':'') + '>' + s + '</option>'; }).join('');
          return fieldBox('Stage', stagePill(p.stage) + ' <span class="text-muted" style="font-size:11px">changes via the actions below</span>') +
            '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px 16px;margin:14px 0 12px">' +
              '<div><div class="form-label">Status</div><select id="pfs-status">' + statusOptsS + '</select></div>' +
              '<div><div class="form-label">Phase</div><select id="pfs-phase">' + phaseOptsS + '</select></div>' +
              '<div><div class="form-label">Start date</div><input type="date" id="pfs-start" value="' + (p.start||'') + '"></div>' +
              '<div><div class="form-label">Target end</div><input type="date" id="pfs-end" value="' + (p.end||'') + '"></div>' +
            '</div>' +
            saveCancelRow('saveProjectSchedule');
        }
        return editBtnRow('schedule') +
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px 20px;margin-bottom:14px">' +
              fieldBox('Stage', stagePill(p.stage)) +
              fieldBox('Status', bdg(p.status)) +
              fieldBox('Phase', badgeIf('badge-gray', p.phase)) +
              fieldBox('Start', p.start||'—') +
              fieldBox('Target end', p.end||'—') +
            '</div>' +
            (p.stage === 'hold' ? '<div class="blocker-note" style="background:#FBE7E3;border-left-color:#993C1D;margin-bottom:14px"><i class="ti ti-player-pause"></i> <strong>On hold:</strong> ' + (p.holdReason||'') + '</div>' : '') +
            '<div class="form-group" style="margin-bottom:0"><div class="form-label" style="font-size:11px;color:#888;margin-bottom:3px">Timeline</div>' + timelineHtml() +
            '<button class="btn btn-sm mt-12" onclick="window.switchPTab(\'milestones\')"><i class="ti ti-list"></i> View milestones</button></div>' +
            (editable && !isComplete ? '<div style="margin-top:16px;padding-top:14px;border-top:1px solid #e8e8e5;display:flex;gap:8px">' +
              (p.stage === 'hold'
                ? '<button class="btn btn-success btn-sm" onclick="resumeFromHold(\'' + p.id + '\')"><i class="ti ti-player-play"></i> Resume</button>'
                : ((p.stage === 'active' || p.stage === 'planned' || p.stage === 'backlog') ? '<button class="btn btn-sm" onclick="putOnHold(\'' + p.id + '\')"><i class="ti ti-player-pause"></i> Put on hold</button>' : '') +
                  '<button class="btn btn-success btn-sm" onclick="markComplete(\'' + p.id + '\')"><i class="ti ti-circle-check"></i> Mark complete</button>'
              ) +
            '</div>' : '');
      })();

      var progressBody = (function() {
        if (editable && projectInfoEditing === 'progress') {
          return '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px 16px;max-width:420px;margin-bottom:12px">' +
              '<div><div class="form-label">Progress (%)</div><input type="number" id="pfp-progress" value="' + p.progress + '" min="0" max="100"></div>' +
              '<div><div class="form-label">Health</div><select id="pfp-health"><option value=""' + (!p.health?' selected':'') + '>— Not set —</option><option value="green"' + (p.health==='green'?' selected':'') + '>Green</option><option value="amber"' + (p.health==='amber'?' selected':'') + '>Amber</option><option value="red"' + (p.health==='red'?' selected':'') + '>Red</option></select></div>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:0"><div class="form-label">Current blocker (leave blank if none)</div><input type="text" id="pfp-blocker" value="' + (p.blockers||'').replace(/"/g,'&quot;') + '"></div>' +
            saveCancelRow('saveProjectProgress');
        }
        return editBtnRow('progress') +
            '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px 20px;max-width:420px">' +
              fieldBox('Progress', '<div style="display:flex;align-items:center;gap:8px"><div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:' + p.progress + '%"></div></div><span class="text-muted">' + p.progress + '%</span></div>') +
              fieldBox('Health', hdot(p.health) + (p.health ? p.health.charAt(0).toUpperCase() + p.health.slice(1) : '<span class="text-muted">Not set</span>')) +
            '</div>' +
            (p.blockers ? '<div class="blocker-note" style="margin-top:14px"><i class="ti ti-alert-triangle"></i> <strong>Blocker:</strong> ' + p.blockers + '</div>' : '');
      })();

      var financialsBody = canViewFin ? (function() {
        if (canEditFin && projectInfoEditing === 'financials') {
          return '<div class="form-group"><div class="form-label">This is a…</div><select id="pff-type"><option value="">— Not set —</option><option value="Revenue"' + (p.estimatedType==='Revenue'?' selected':'') + '>Revenue opportunity</option><option value="Savings"' + (p.estimatedType==='Savings'?' selected':'') + '>Cost savings opportunity</option></select></div>' +
            '<div class="grid-2"><select id="pff-freq"><option' + (p.estimatedFrequency==='Monthly'?' selected':'') + '>Monthly</option><option' + (p.estimatedFrequency==='Annually'?' selected':'') + '>Annually</option></select>' +
            '<input type="text" id="pff-amount" value="' + (p.estimatedAmount!=null?p.estimatedAmount:'') + '" placeholder="$ amount (optional)"></div>' +
            '<div class="form-group" style="margin-top:8px"><div class="form-label">Value confidence</div><select id="pff-value-confidence">' + confidenceOptsHtml(p.valueConfidence) + '</select></div>' +
            '<div class="form-group"><div class="form-label">Cost estimate</div>' +
              '<div class="grid-2"><input type="text" id="pff-cost-amount" value="' + (p.costEstimate!=null?p.costEstimate:'') + '" placeholder="$ amount (optional)"><select id="pff-cost-confidence">' + confidenceOptsHtml(p.costConfidence) + '</select></div>' +
            '</div>' +
            '<div id="pff-err" style="color:#A32D2D;font-size:12px;margin-top:4px;display:none">Please enter valid numbers (digits only)</div>' +
            saveCancelRow('saveProjectFinancials');
        }
        var hasFinData = p.estimatedAmount != null || p.costEstimate != null;
        return editBtnRow('financials', canEditFin) +
            (hasFinData
              ? '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px 20px">' +
                  (p.estimatedAmount != null ? fieldBox('Estimated ' + (p.estimatedType||'value'), fmtCost(p.estimatedAmount) + (p.estimatedFrequency ? ' / ' + p.estimatedFrequency.toLowerCase() : '') + (p.valueConfidence ? ' <span class="badge badge-gray" style="font-size:10px">' + p.valueConfidence + '</span>' : '')) : '') +
                  (p.costEstimate != null ? fieldBox('Cost estimate', fmtCost(p.costEstimate) + (p.costConfidence ? ' <span class="badge badge-gray" style="font-size:10px">' + p.costConfidence + '</span>' : '')) : '') +
                '</div>'
              : '<div class="text-muted" style="font-size:13px">No financial detail recorded yet</div>');
      })() : '';

      var relationshipsBody = '<div class="form-group" style="margin-bottom:14px"><div class="form-label" style="font-size:11px;color:#888;margin-bottom:3px">Depends on</div><div style="display:flex;flex-direction:column;gap:6px">' +
            (p.dependencies && p.dependencies.length
              ? p.dependencies.map(function(d){
                  var isPlanned = !!(d.start && d.end);
                  return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;background:#faf9f7;border-radius:6px">' +
                    '<span style="font-size:13px"><i class="ti ti-eye" style="cursor:pointer;margin-right:6px" onclick="goToProject(\'' + d.id + '\')"></i>' + d.name + '</span>' +
                    (isPlanned ? '<span class="badge badge-teal" style="font-size:11px">Planned: ' + d.start + ' – ' + d.end + '</span>' : '<span class="badge badge-amber" style="font-size:11px"><i class="ti ti-alert-triangle"></i> Not yet planned</span>') +
                    (editable ? '<button class="btn btn-sm btn-danger" onclick="removeProjectDependency(\'' + p.id + '\',\'' + d.id + '\')"><i class="ti ti-x"></i></button>' : '') +
                    '</div>';
                }).join('')
              : '<span class="text-muted" style="font-size:13px">No dependencies</span>') +
            (editable ? '<button class="btn btn-sm" style="align-self:flex-start" onclick="openDependencyPicker(\'' + p.id + '\')"><i class="ti ti-link"></i> Add dependency</button>' : '') +
          '</div></div>' +
          '<div class="form-group" style="margin-bottom:14px"><div class="form-label" style="font-size:11px;color:#888;margin-bottom:3px">Program</div><div style="display:flex;align-items:center;gap:8px;font-size:13px">' +
            (p.programId
              ? (function(){
                  var prog = D.programs.find(function(x){ return x.id === p.programId; });
                  return prog
                    ? '<span><i class="ti ti-eye" style="cursor:pointer;margin-right:4px" onclick="goToProgram(\'' + prog.id + '\')"></i>' + programLabel(prog) + ' — ' + prog.name + '</span>' +
                      (editable ? '<button class="btn btn-sm btn-danger" onclick="removeProjectProgram(\'' + p.id + '\')"><i class="ti ti-x"></i></button>' : '')
                    : '<span class="text-muted">No program</span>';
                })()
              : '<span class="text-muted">No program</span>') +
            (editable ? '<button class="btn btn-sm" onclick="openProgramPickerForProject(\'' + p.id + '\')"><i class="ti ti-folders"></i> ' + (p.programId ? 'Change' : 'Add') + '</button>' : '') +
          '</div></div>' +
          fieldBox('Linked request', (function(){
            var linkedReq = p.requestId ? D.requests.find(function(r){ return r.id === p.requestId; }) : null;
            return linkedReq ? '<button class="btn btn-sm" onclick="reviewRequest(\'' + linkedReq.id + '\')"><i class="ti ti-eye"></i> ' + linkedReq.title + '</button>' : '<span class="text-muted">—</span>';
          })());

      var auditBody = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px 20px">' +
            fieldBox('Created', fmtDate(p.createdAt)) +
            '<div id="pmeta-last-edited"><div class="form-label" style="font-size:11px;color:#888;margin-bottom:3px">Last edited</div><span class="text-muted" style="font-size:13px">Loading…</span></div>' +
          '</div>';

      var changelogBody = '<div id="pinfo-changelog-body"><div class="text-muted" style="font-size:13px">Loading…</div></div>';
      loadAndRenderChangeLog(p.id);

      var bodiesByKey = {
        identity: identityBody, schedule: scheduleBody, progress: progressBody,
        financials: financialsBody, relationships: relationshipsBody, audit: auditBody
      };
      var sectionsHtml = sectionDefs.map(function(s){ return section(s.key, s.label, bodiesByKey[s.key]); }).join('') +
        section('changelog', 'Change Log', changelogBody);

      return '<div style="display:flex;gap:24px;align-items:flex-start">' + navHtml + '<div style="flex:1;min-width:0">' + sectionsHtml + '</div></div>';
    }
    if (t === 'team') {
      function peopleFieldBox(label, valueHtml) {
        return '<div><div class="form-label" style="font-size:11px;color:#888;margin-bottom:3px">' + label + '</div><div style="font-size:13px">' + valueHtml + '</div></div>';
      }
      var peopleRolesHtml;
      if (D.role === 'admin' && peopleEditing) {
        var ownerPoolEdit = p.owner && individualResourceNames().indexOf(p.owner) < 0 ? individualResourceNames().concat([p.owner]) : individualResourceNames();
        var ownerOpts = '<option value="">— None —</option>' + ownerPoolEdit.map(function(n){
          var isInactiveCurrent = p.owner===n && individualResourceNames().indexOf(n) < 0;
          return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (p.owner===n?' selected':'') + '>' + n + (isInactiveCurrent ? ' (no longer a resource)' : '') + '</option>';
        }).join('');
        var sponsorPoolEdit = p.sponsor && individualResourceNames().indexOf(p.sponsor) < 0 ? individualResourceNames().concat([p.sponsor]) : individualResourceNames();
        var sponsorOpts = '<option value="">— None —</option>' + sponsorPoolEdit.map(function(n){
          var isUnlinkedCurrent = p.sponsor===n && individualResourceNames().indexOf(n) < 0;
          return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (p.sponsor===n?' selected':'') + '>' + n + (isUnlinkedCurrent ? ' (not linked to a resource)' : '') + '</option>';
        }).join('');
        var reqOwnerPoolEdit = p.requirementsOwner && individualResourceNames().indexOf(p.requirementsOwner) < 0 ? individualResourceNames().concat([p.requirementsOwner]) : individualResourceNames();
        var reqOwnerOpts = '<option value="">— None —</option>' + reqOwnerPoolEdit.map(function(n){
          var isUnlinkedCurrent = p.requirementsOwner===n && individualResourceNames().indexOf(n) < 0;
          return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (p.requirementsOwner===n?' selected':'') + '>' + n + (isUnlinkedCurrent ? ' (not linked to a resource)' : '') + '</option>';
        }).join('');
        peopleRolesHtml = '<div class="card mb-16">' +
          '<div class="grid-3">' +
            '<div><div class="form-label">Sponsor</div><select id="pp-sponsor">' + sponsorOpts + '</select></div>' +
            '<div><div class="form-label">Owner</div><select id="pp-owner">' + ownerOpts + '</select></div>' +
            '<div><div class="form-label">Requirements owner</div><select id="pp-reqowner">' + reqOwnerOpts + '</select></div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:14px">' +
            '<button class="btn btn-primary btn-sm" id="pp-save" onclick="savePeopleRoles(\'' + p.id + '\')"><i class="ti ti-check"></i> Save</button>' +
            '<button class="btn btn-sm" onclick="setPeopleEditing(false)">Cancel</button>' +
          '</div>' +
        '</div>';
      } else {
        peopleRolesHtml = '<div class="card mb-16">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">' +
            '<div style="display:flex;gap:22px;flex-wrap:wrap">' +
              peopleFieldBox('Sponsor', p.sponsor||'—') +
              peopleFieldBox('Owner', p.owner||'—') +
              peopleFieldBox('Requirements owner', p.requirementsOwner||'—') +
            '</div>' +
            (D.role === 'admin' ? '<div style="display:flex;gap:8px">' +
              '<button class="btn btn-sm" onclick="setPeopleEditing(true)"><i class="ti ti-edit"></i> Edit</button>' +
              '<button class="btn btn-sm btn-danger" onclick="deleteProject(\'' + p.id + '\')"><i class="ti ti-trash"></i> Delete</button>' +
            '</div>' : '') +
          '</div>' +
        '</div>';
      }
      var addKind = teamAddKind[p.id] || 'individual';
      var candidatePeople = individualResourceNames().filter(function(n){ return p.team.indexOf(n) < 0; });
      var candidateTeams = teamNames().filter(function(n){ return p.team.indexOf(n) < 0; });
      var projectTags = p.tags || [];
      function sharesTag(name) {
        if (!projectTags.length) return false;
        var res2 = D.resources.find(function(r){ return r.name === name; });
        return !!(res2 && res2.tags && res2.tags.some(function(t){ return projectTags.indexOf(t) >= 0; }));
      }
      function byRecommendedThenName(a, b) {
        var aRec = sharesTag(a) ? 0 : 1;
        var bRec = sharesTag(b) ? 0 : 1;
        if (aRec !== bRec) return aRec - bRec;
        return a.localeCompare(b);
      }
      candidatePeople = candidatePeople.slice().sort(byRecommendedThenName);
      candidateTeams = candidateTeams.slice().sort(byRecommendedThenName);
      function teamManagerSuffix(name) {
        var res2 = D.resources.find(function(r){ return r.name === name; });
        return (res2 && res2.type === 'team' && res2.managerName) ? ' <span class="text-muted" style="font-size:11px">Manager: ' + res2.managerName + '</span>' : '';
      }
      var teamRows = p.team.length
        ? p.team.map(function(m,i){
            var isTeam = teamNames().indexOf(m) >= 0;
            var ini = m.split(' ').map(function(x){ return x[0]; }).join('');
            var resId = p.teamIds[i];
            var curTier = (p.teamTiers && p.teamTiers[resId]) || '';
            var isOverridden = p.teamOverrides && p.teamOverrides[resId] != null;
            var tierSelect = '<select style="font-size:12px" ' + (editable ? '' : 'disabled ') + 'onchange="setAllocationTier(\'' + p.id + '\',\'' + resId + '\',this.value)">' +
              '<option value=""' + (curTier === '' ? ' selected' : '') + '>Not set</option>' +
              ALLOCATION_TIERS.map(function(tier){ return '<option value="' + tier + '"' + (curTier === tier ? ' selected' : '') + '>' + tier + '</option>'; }).join('') +
              '</select>';
            var effPctHint = curTier
              ? '<span class="text-muted" style="font-size:11px;white-space:nowrap" title="' + (isOverridden ? 'This person has overridden this from their My Capacity page' : 'Based on tier + this project\'s T-shirt size') + '">≈' + effectiveAllocationPct(p, resId) + '%' + (isOverridden ? ' (self-set)' : '') + '</span>'
              : '';
            return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0ede8">' +
              '<div style="display:flex;align-items:center;gap:10px">' + (isTeam ? '<i class="ti ti-users" style="color:#185FA5"></i>' : '<div class="avatar ' + AV_COLS[i%AV_COLS.length] + '">' + ini + '</div>') + '<span style="font-size:13px">' + m + '</span>' + (isTeam ? teamManagerSuffix(m) : '') + '</div>' +
              '<div style="display:flex;align-items:center;gap:10px">' + tierSelect + effPctHint +
              (editable ? '<button class="btn btn-sm btn-danger" onclick="removeTeamMemberDirect(\'' + p.id + '\',\'' + m.replace(/'/g,"\\'") + '\')"><i class="ti ti-x"></i></button>' : '') +
              '</div></div>';
          }).join('')
        : '<div class="text-muted">No team members yet</div>';
      var addCandidates = addKind === 'team' ? candidateTeams : candidatePeople;
      var addRows = addCandidates.map(function(n){
        var rec = sharesTag(n);
        return '<div class="team-add-row" data-name="' + n.toLowerCase() + '" style="display:flex;align-items:center;justify-content:space-between;padding:6px 0"><span style="font-size:13px">' + n + (addKind==='team' ? teamManagerSuffix(n) : '') + (rec ? ' <span class="badge badge-teal" style="font-size:10px">Recommended</span>' : '') + '</span><button class="btn btn-sm" onclick="addTeamMemberDirect(\'' + p.id + '\',\'' + n.replace(/'/g,"\\'") + '\')"><i class="ti ti-plus"></i> Add</button></div>';
      }).join('');
      var tierInfoOpenNow = !!teamTierInfoOpen[p.id];
      var sizeMultText = TSHIRT_SIZES.map(function(sz){ return sz + ' ' + Math.round(TSHIRT_SIZE_LOAD_MULTIPLIER[sz] * 100) + '%'; }).join(' &nbsp;·&nbsp; ');
      var tierInfoBlock = tierInfoOpenNow
        ? '<div class="text-muted" style="font-size:12px;margin-bottom:10px;padding:10px;background:#faf9f7;border-radius:8px;line-height:1.6">' +
          'Each person\'s <strong>allocation tier</strong> is an assumed % of their time this project takes, and feeds directly into their total load on the Capacity page (alongside their self-reported BAU % and any open work requests). Base rate at a typical (M) size:<br>' +
          ALLOCATION_TIERS.map(function(tier){ return '<strong>' + tier + '</strong> ≈ ' + ALLOCATION_TIER_PERCENT[tier] + '%'; }).join(' &nbsp;·&nbsp; ') +
          '<br>That base rate is then scaled by this project\'s <strong>T-shirt size</strong> — being Owner/Lead on an XL project is assumed to take more time than the same role on an XS one:<br>' +
          sizeMultText +
          '<br>Leaving someone at "Not set" contributes 0% until a tier is chosen — set one for anyone whose load here should count, including the project owner if they\'re on this team. The person themselves can override the computed % from their own <strong>My Capacity</strong> page if it doesn\'t match reality.' +
          '</div>'
        : '';
      return peopleRolesHtml + '<div class="card mb-16"><div class="section-title" style="display:flex;align-items:center;gap:6px">Team members ' +
          '<button class="btn btn-sm" style="padding:1px 6px" title="How allocation tiers affect capacity" onclick="toggleTeamTierInfo(\'' + p.id + '\')"><i class="ti ti-info-circle"></i></button>' +
        '</div>' + tierInfoBlock + teamRows + '</div>' +
        (editable ? '<div class="card"><div class="section-title">Add a team member</div>' +
          '<div class="tab-bar" style="margin-bottom:12px">' +
            '<div class="tab' + (addKind==='individual'?' active':'') + '" onclick="setTeamAddKind(\'' + p.id + '\',\'individual\')">Individuals</div>' +
            '<div class="tab' + (addKind==='team'?' active':'') + '" onclick="setTeamAddKind(\'' + p.id + '\',\'team\')">Teams</div>' +
          '</div>' +
          '<input type="text" id="team-add-search" placeholder="' + (addKind==='team' ? 'Search teams…' : 'Search people…') + '" oninput="filterTeamAddList(this.value)">' +
          '<div id="team-add-list" style="max-height:220px;overflow-y:auto;margin-top:8px">' +
          addRows +
          (addCandidates.length ? '' : '<span class="text-muted" style="font-size:13px">' + (addKind==='team' ? 'Every team is already on the team' : 'Everyone is already on the team') + '</span>') +
          '</div></div>' : '');
    }
    if (t === 'milestones') {
      var sorted = sortedMilestones();
      var rows = sorted.map(function(m) {
        var idx = p.milestones.indexOf(m);
        var logKey = p.id + '|' + m.id;
        var logOpenNow = !!milestoneLogOpen[logKey];
        var dateLine = (m.done ? ('Completed ' + (m.completedDate || m.date) + (m.completedDate && m.completedDate !== m.date ? ' (target ' + m.date + ')' : '')) : ('Target ' + m.date)) + ' ' + lateBadgeHtml(isMilestoneLate(m));
        var logBlock = '';
        if (logOpenNow) {
          var entries = (m.log && m.log.length) ? m.log.slice().reverse().map(function(e){
            return '<div class="raid-log-entry"><strong>' + e.date + '</strong> — ' + e.actor + ': ' + e.action + (e.detail ? ' (' + e.detail + ')' : '') + '</div>';
          }).join('') : '<div class="raid-log-entry text-muted">No history recorded</div>';
          logBlock = '<div class="raid-log">' + entries + '</div>';
        }
        return '<div style="padding:12px 0;border-bottom:1px solid #f0ede8">' +
          '<div style="display:flex;align-items:center;gap:12px">' +
          '<i class="ti ' + (m.done ? 'ti-circle-check' : 'ti-circle-dotted') + '" style="font-size:22px;color:' + (m.done ? '#1D9E75' : '#ccc') + ';' + (editable ? 'cursor:pointer' : '') + '"' +
          (editable ? ' onclick="toggleMS(\'' + p.id + '\',' + idx + ')"' : '') + '></i>' +
          '<div style="flex:1"><div style="font-size:13px' + (m.done ? ';text-decoration:line-through;color:#999' : '') + '">' + m.name + '</div></div>' +
          '<div class="text-muted" style="white-space:nowrap">' + dateLine + '</div>' +
          '<button class="btn btn-sm" title="Change log" onclick="toggleMSLog(\'' + p.id + '\',' + idx + ')"><i class="ti ' + (logOpenNow?'ti-chevron-up':'ti-history') + '"></i></button>' +
          (editable ? '<button class="btn btn-sm" onclick="openEditMilestone(\'' + p.id + '\',' + idx + ')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteMS(\'' + p.id + '\',' + idx + ')"><i class="ti ti-trash"></i></button>' : '') +
          '</div>' + logBlock + '</div>';
      }).join('');
      return (editable ? '<button class="btn btn-primary btn-sm mb-12" onclick="openAddMilestone(\'' + p.id + '\')"><i class="ti ti-plus"></i> Add milestone</button>' : '') +
        (sorted.length ? rows : '<div class="empty-state" style="padding:30px"><i class="ti ti-circle-dotted"></i><p>No milestones yet</p></div>');
    }
    if (t === 'tasks') {
      var st = getTaskState(p.id);

      var assigneeChoices = [];
      p.tasks.forEach(function(tk){ var lbl = taskAssigneeLabel(tk); if (assigneeChoices.indexOf(lbl) < 0) assigneeChoices.push(lbl); });
      var statusChoices = ['To Do','In Progress','On Hold','Done'];

      function filterIcon(col, active) {
        return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleTaskFilterPanel(\'' + p.id + '\',\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>';
      }

      var searchBar = '<div class="task-filter-bar">' +
        '<input type="text" id="task-search" placeholder="Search tasks…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onTaskSearch(\'' + p.id + '\',this.value)">' +
        '</div>';

      var hierarchyEditable = editable && !st.search && !st.fAssignee.length && !st.fStatus.length;

      var outline = buildTaskOutline(p.tasks).filter(function(row){ return !row.hidden; });
      var list = outline;
      if (st.search) { var q = st.search.toLowerCase(); list = list.filter(function(row){ return row.task.title.toLowerCase().indexOf(q) >= 0; }); }
      if (st.fAssignee.length) list = list.filter(function(row){ return st.fAssignee.indexOf(taskAssigneeLabel(row.task)) >= 0; });
      if (st.fStatus.length) list = list.filter(function(row){ return st.fStatus.indexOf(row.task.status) >= 0; });

      var trows = list.map(function(row) {
        var task = row.task;
        var idx = p.tasks.indexOf(task);
        var myTask = !!(task.assigneeId && D.myResourceId && task.assigneeId === D.myResourceId);
        var canCheck = editable || myTask;
        var logKey = p.id + '|' + task.id;
        var logOpenNow = !!taskLogOpen[logKey];
        var logRow = '';
        if (logOpenNow) {
          var entries = (task.log && task.log.length) ? task.log.slice().reverse().map(function(e){
            return '<div class="raid-log-entry"><strong>' + e.date + '</strong> — ' + e.actor + ': ' + e.action + (e.detail ? ' (' + e.detail + ')' : '') + '</div>';
          }).join('') : '<div class="raid-log-entry text-muted">No history recorded</div>';
          logRow = '<tr><td colspan="6" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' + entries + '</div></td></tr>';
        }
        var descKey = p.id + '|' + task.id;
        var descOpenNow = !!taskDescOpen[descKey];
        var descRow = '';
        if (descOpenNow) {
          descRow = '<tr><td colspan="6" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' +
            (task.description ? '<div style="font-size:13px;white-space:normal;word-break:break-word;line-height:1.6">' + task.description + '</div>' : '<div class="text-muted" style="font-size:12px">No description</div>') +
            '</div></td></tr>';
        }
        var comments = task.comments || [];
        var cKey = p.id + '|' + task.id;
        var cOpenNow = !!taskCommentsOpen[cKey];
        var commentsRow = '';
        if (cOpenNow) {
          var commentEntries = comments.length ? comments.slice().reverse().map(function(c) {
            var mine = c.author === actorName();
            return '<div class="comment-item">' +
              '<div class="comment-meta"><strong>' + c.author + '</strong> <span class="text-muted">' + c.date + '</span></div>' +
              '<div class="comment-text">' + c.text + '</div>' +
              ((editable || mine) ? '<div class="comment-actions"><button class="btn btn-sm" onclick="openEditComment(\'' + p.id + '\',\'' + task.id + '\',\'' + c.id + '\')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteComment(\'' + p.id + '\',\'' + task.id + '\',\'' + c.id + '\')"><i class="ti ti-trash"></i></button></div>' : '') +
              '</div>';
          }).join('') : '<div class="text-muted" style="font-size:12px;margin-bottom:8px">No comments yet</div>';
          commentsRow = '<tr><td colspan="6" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' +
            commentEntries +
            '<div class="comment-add-row"><textarea id="cmt-input-' + task.id + '" placeholder="Add a comment…" rows="2"></textarea><button class="btn btn-sm btn-primary" onclick="addComment(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-send"></i> Post</button></div>' +
            '</div></td></tr>';
        }
        var checklist = task.checklist || [];
        var clKey = p.id + '|' + task.id;
        var clOpenNow = !!taskChecklistOpen[clKey];
        var doneCount = checklist.filter(function(c){ return c.done; }).length;
        var checklistRow = '';
        if (clOpenNow) {
          var itemsHtml = checklist.length ? checklist.map(function(c) {
            return '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px' + (canCheck ? ';cursor:pointer' : '') + '">' +
              '<input type="checkbox"' + (c.done ? ' checked' : '') + (canCheck ? ' onchange="toggleChecklistItem(\'' + p.id + '\',\'' + task.id + '\',\'' + c.id + '\')"' : ' disabled') + '>' +
              '<span style="flex:1' + (c.done ? ';text-decoration:line-through;color:#999' : '') + '">' + c.text + '</span>' +
              (editable ? '<button class="btn btn-sm btn-danger" onclick="deleteChecklistItem(\'' + p.id + '\',\'' + task.id + '\',\'' + c.id + '\')"><i class="ti ti-x"></i></button>' : '') +
              '</label>';
          }).join('') : '<div class="text-muted" style="font-size:12px;margin-bottom:8px">No checklist items yet</div>';
          checklistRow = '<tr><td colspan="6" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' +
            itemsHtml +
            (editable ? '<div class="comment-add-row"><input type="text" id="cl-input-' + task.id + '" style="flex:1" placeholder="Add a checklist item…"><button class="btn btn-sm btn-primary" onclick="addChecklistItem(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-plus"></i> Add</button></div>' : '') +
            '</div></td></tr>';
        }
        var taskTags = task.tags || [];
        var collapsedNow = !!taskOutlineCollapsed[task.id];
        var indentPx = row.depth * 22;
        var doneIconHtml = '<i class="ti ' + (task.status==='Done' ? 'ti-circle-check' : 'ti-circle-dotted') + '" style="font-size:20px;flex-shrink:0;color:' + (task.status==='Done' ? '#1D9E75' : '#ccc') + (canCheck ? ';cursor:pointer' : '') + '"' +
          (canCheck ? ' title="' + (task.status==='Done' ? 'Reopen' : 'Mark done') + '" onclick="toggleTaskDoneIcon(\'' + p.id + '\',' + idx + ')"' : '') + '></i>';
        var titleCell = '<div style="white-space:normal;word-break:break-word;padding-left:' + indentPx + 'px">' +
          '<div style="display:flex;align-items:baseline;gap:6px">' +
          doneIconHtml +
          (row.hasChildren ? '<button class="btn btn-sm" style="padding:1px 4px" onclick="toggleTaskOutlineCollapse(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (collapsedNow?'ti-chevron-right':'ti-chevron-down') + '"></i></button>' : '<span style="display:inline-block;width:22px"></span>') +
          '<span style="font-size:13px' + (task.status==='Done' ? ';color:#999' : '') + '">' + task.title + '</span>' +
          '</div>' +
          ((editable || taskTags.length) ? '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;padding-left:22px">' +
            taskTags.map(function(tg){ return tagBadge(tg); }).join('') +
            (editable ? '<button class="btn btn-sm" style="padding:1px 6px" title="Edit tags" onclick="openTaskTagPicker(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-tag"></i></button>' : '') +
            '</div>' : '') +
          '</div>';
        var menuOpen = taskActionMenuOpen === task.id;
        var menuItems =
          (hierarchyEditable ? '<button onclick="demoteTask(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-indent-increase"></i> Demote</button>' +
            '<button onclick="promoteTask(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-indent-decrease"></i> Promote</button>' : '') +
          '<button onclick="addTaskBefore(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-plus"></i> Add task before</button>' +
          '<button onclick="addTaskAfter(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-plus"></i> Add task after</button>' +
          '<button onclick="openEditTask(\'' + p.id + '\',' + idx + ')"><i class="ti ti-edit"></i> Edit</button>' +
          '<button onclick="deleteTask(\'' + p.id + '\',' + idx + ')" style="color:#A32D2D"><i class="ti ti-trash"></i> Delete</button>';
        var actionMenu = editable ? (
          '<div style="position:relative;display:inline-block">' +
          '<button class="btn btn-sm task-action-menu-btn" title="More actions" onclick="toggleTaskActionMenu(event,\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-dots-vertical"></i></button>' +
          (menuOpen ? '<div class="task-action-menu" onclick="event.stopPropagation()">' + menuItems + '</div>' : '') +
          '</div>'
        ) : '';
        var trAttrs = hierarchyEditable
          ? ' class="task-row task-row-draggable" draggable="true" data-task-id="' + task.id + '" data-pid="' + p.id + '"'
          : '';
        return '<tr' + trAttrs + '><td class="text-muted">' + row.taskNumber + '</td><td>' + titleCell + '</td><td' + (task.assignee ? '' : ' class="text-muted"') + '>' + taskAssigneeLabel(task) + '</td><td>' + bdg(task.status) + '</td><td class="text-muted">' + taskDatesLabel(task) + '</td>' +
          '<td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;justify-content:flex-end">' +
          '<button class="btn btn-sm" title="Description" onclick="toggleTaskDescription(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (descOpenNow?'ti-chevron-up':'ti-align-left') + '"></i></button>' +
          '<button class="btn btn-sm" title="Checklist" onclick="toggleTaskChecklist(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (clOpenNow?'ti-chevron-up':'ti-list-check') + '"></i>' + (checklist.length ? ' ' + doneCount + '/' + checklist.length : '') + '</button>' +
          '<button class="btn btn-sm" title="Comments" onclick="toggleTaskComments(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (cOpenNow?'ti-chevron-up':'ti-message-circle') + '"></i>' + (comments.length ? ' ' + comments.length : '') + '</button>' +
          '<button class="btn btn-sm" title="Change log" onclick="toggleTaskLog(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (logOpenNow?'ti-chevron-up':'ti-history') + '"></i></button>' +
          actionMenu +
          '</div></td></tr>' + descRow + checklistRow + logRow + commentsRow;
      }).join('');

      var header = '<tr><th style="width:36px">ID</th><th>Task</th>' +
        '<th><span>Assignee</span>' + filterIcon('assignee', st.fAssignee.length>0) + '</th>' +
        '<th><span>Status</span>' + filterIcon('status', st.fStatus.length>0) + '</th>' +
        '<th>Dates</th><th></th></tr>';

      var descLine = '<div class="text-muted" style="font-size:12px;margin-bottom:12px">The project plan: scheduled work with owners, dates, and dependencies. For quick action items, follow-ups, or requests that don\'t belong on the plan, use <strong>To-Do</strong> instead.</div>';
      var viewSwitcher = '<div class="tab-bar" style="margin-bottom:12px;display:inline-flex">' +
        '<div class="tab' + (st.viewMode!=='grid'?' active':'') + '" onclick="setTaskViewMode(\'' + p.id + '\',\'list\')">List</div>' +
        '<div class="tab' + (st.viewMode==='grid'?' active':'') + '" onclick="setTaskViewMode(\'' + p.id + '\',\'grid\')">Grid</div>' +
      '</div>';

      if (st.viewMode === 'grid') {
        return descLine + viewSwitcher + searchBar + taskGridHtml(p, list, editable);
      }

      return descLine + viewSwitcher +
        (editable ? '<button class="btn btn-primary btn-sm mb-12" style="margin-right:8px" onclick="openAddTask(\'' + p.id + '\')"><i class="ti ti-plus"></i> Add task</button>' : '') +
        taskTimelineBlock(p.id, list) +
        searchBar +
        (p.tasks.length
          ? (list.length ? '<table class="tasks-table"><thead>' + header + '</thead><tbody>' + trows + '</tbody></table>' : '<div class="empty-state" style="padding:30px"><i class="ti ti-search"></i><p>No tasks match your filters</p></div>')
          : '<div class="empty-state" style="padding:30px"><i class="ti ti-check"></i><p>No tasks yet</p></div>');
    }
    if (t === 'todos') {
      var tst = getTodoState(p.id);

      var todoAssigneeChoices = [];
      p.todos.forEach(function(td){ var lbl = td.assignee || 'Unassigned'; if (todoAssigneeChoices.indexOf(lbl) < 0) todoAssigneeChoices.push(lbl); });
      var todoStatusChoices = ['Not Started','In Progress','Done'];

      function todoFilterIcon(col, active) {
        return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleTodoFilterPanel(\'' + p.id + '\',\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>';
      }

      var todoSearchBar = '<div class="task-filter-bar">' +
        '<input type="text" id="todo-search" placeholder="Search to-dos…" value="' + tst.search.replace(/"/g,'&quot;') + '" oninput="onTodoSearch(\'' + p.id + '\',this.value)">' +
        '</div>';

      var todoList = p.todos.slice();
      if (tst.search) { var tq = tst.search.toLowerCase(); todoList = todoList.filter(function(td){ return td.title.toLowerCase().indexOf(tq) >= 0; }); }
      if (tst.fAssignee.length) todoList = todoList.filter(function(td){ return tst.fAssignee.indexOf(td.assignee || 'Unassigned') >= 0; });
      if (tst.fStatus.length) todoList = todoList.filter(function(td){ return tst.fStatus.indexOf(td.status) >= 0; });
      todoList.sort(function(a, b) {
        if ((a.status==='Done') !== (b.status==='Done')) return a.status==='Done' ? 1 : -1;
        return (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99');
      });

      var todoRows = todoList.map(function(td) {
        var idx = p.todos.indexOf(td);
        var myTodo = !!(td.assigneeId && D.myResourceId && td.assigneeId === D.myResourceId);
        var canCheck = editable || myTodo;
        var logKey = p.id + '|' + td.id;
        var logOpenNow = !!todoLogOpen[logKey];
        var logRow = '';
        if (logOpenNow) {
          var entries = (td.log && td.log.length) ? td.log.slice().reverse().map(function(e){
            return '<div class="raid-log-entry"><strong>' + e.date + '</strong> — ' + e.actor + ': ' + e.action + (e.detail ? ' (' + e.detail + ')' : '') + '</div>';
          }).join('') : '<div class="raid-log-entry text-muted">No history recorded</div>';
          logRow = '<tr><td colspan="5" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' + entries + '</div></td></tr>';
        }
        var descKey = p.id + '|' + td.id;
        var descOpenNow = !!todoDescOpen[descKey];
        var descRow = '';
        if (descOpenNow) {
          descRow = '<tr><td colspan="5" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' +
            (td.description ? '<div style="font-size:13px;white-space:normal;word-break:break-word;line-height:1.6">' + td.description + '</div>' : '<div class="text-muted" style="font-size:12px">No description</div>') +
            '</div></td></tr>';
        }
        var todoComments = td.comments || [];
        var cKey = p.id + '|' + td.id;
        var cOpenNow = !!todoCommentsOpen[cKey];
        var commentsRow = '';
        if (cOpenNow) {
          var commentEntries = todoComments.length ? todoComments.slice().reverse().map(function(c) {
            var mine = c.author === actorName();
            return '<div class="comment-item">' +
              '<div class="comment-meta"><strong>' + c.author + '</strong> <span class="text-muted">' + c.date + '</span></div>' +
              '<div class="comment-text">' + c.text + '</div>' +
              ((editable || mine) ? '<div class="comment-actions"><button class="btn btn-sm" onclick="openEditTodoComment(\'' + p.id + '\',\'' + td.id + '\',\'' + c.id + '\')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteTodoComment(\'' + p.id + '\',\'' + td.id + '\',\'' + c.id + '\')"><i class="ti ti-trash"></i></button></div>' : '') +
              '</div>';
          }).join('') : '<div class="text-muted" style="font-size:12px;margin-bottom:8px">No comments yet</div>';
          commentsRow = '<tr><td colspan="5" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' +
            commentEntries +
            '<div class="comment-add-row"><textarea id="todo-cmt-input-' + td.id + '" placeholder="Add a comment…" rows="2"></textarea><button class="btn btn-sm btn-primary" onclick="addTodoComment(\'' + p.id + '\',\'' + td.id + '\')"><i class="ti ti-send"></i> Post</button></div>' +
            '</div></td></tr>';
        }
        var doneIconHtml = '<i class="ti ' + (td.status==='Done' ? 'ti-circle-check' : 'ti-circle-dotted') + '" style="font-size:20px;flex-shrink:0;color:' + (td.status==='Done' ? '#1D9E75' : '#ccc') + (canCheck ? ';cursor:pointer' : '') + '"' +
          (canCheck ? ' title="' + (td.status==='Done' ? 'Reopen' : 'Mark done') + '" onclick="toggleTodoDoneIcon(\'' + p.id + '\',' + idx + ')"' : '') + '></i>';
        var titleCell = '<div style="display:flex;align-items:center;gap:8px">' + doneIconHtml + '<span style="font-size:13px' + (td.status==='Done' ? ';color:#999' : '') + '">' + td.title + '</span></div>';
        return '<tr><td>' + titleCell + '</td><td' + (td.assignee ? '' : ' class="text-muted"') + '>' + (td.assignee || 'Unassigned') + '</td><td>' + bdg(td.status) + '</td>' +
          '<td class="text-muted">' + (td.due || '—') + ' ' + lateBadgeHtml(isTodoLate(td)) + '</td>' +
          '<td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;justify-content:flex-end">' +
          '<button class="btn btn-sm" title="Description" onclick="toggleTodoDescription(\'' + p.id + '\',\'' + td.id + '\')"><i class="ti ' + (descOpenNow?'ti-chevron-up':'ti-align-left') + '"></i></button>' +
          '<button class="btn btn-sm" title="Comments" onclick="toggleTodoComments(\'' + p.id + '\',\'' + td.id + '\')"><i class="ti ' + (cOpenNow?'ti-chevron-up':'ti-message-circle') + '"></i>' + (todoComments.length ? ' ' + todoComments.length : '') + '</button>' +
          '<button class="btn btn-sm" title="Change log" onclick="toggleTodoLog(\'' + p.id + '\',\'' + td.id + '\')"><i class="ti ' + (logOpenNow?'ti-chevron-up':'ti-history') + '"></i></button>' +
          (editable ? '<button class="btn btn-sm" onclick="openEditTodo(\'' + p.id + '\',' + idx + ')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteTodo(\'' + p.id + '\',' + idx + ')"><i class="ti ti-trash"></i></button>' : '') +
          '</div></td></tr>' + descRow + commentsRow + logRow;
      }).join('');

      var todoHeader = '<tr><th>To-Do</th><th><span>Assignee</span>' + todoFilterIcon('assignee', tst.fAssignee.length>0) + '</th>' +
        '<th><span>Status</span>' + todoFilterIcon('status', tst.fStatus.length>0) + '</th><th>Due</th><th></th></tr>';

      return '<div class="text-muted" style="font-size:12px;margin-bottom:12px">Quick action items, follow-ups, access requests, and reminders -- lightweight work with an owner, an optional due date, and a simple Open/Done status. For scheduled work with dates and dependencies, use <strong>Plan</strong> instead.</div>' +
        (editable ? '<button class="btn btn-primary btn-sm mb-12" onclick="openAddTodo(\'' + p.id + '\')"><i class="ti ti-plus"></i> Add to-do</button>' : '') +
        todoSearchBar +
        (p.todos.length
          ? (todoList.length ? '<table class="tasks-table"><thead>' + todoHeader + '</thead><tbody>' + todoRows + '</tbody></table>' : '<div class="empty-state" style="padding:30px"><i class="ti ti-search"></i><p>No to-dos match your filters</p></div>')
          : '<div class="empty-state" style="padding:30px"><i class="ti ti-list-check"></i><p>No to-dos yet — action items, follow-ups, access requests, and other lightweight work go here.</p></div>');
    }
    if (t === 'raid') {
      var raidQ = (raidSearchState[p.id] || '').toLowerCase();
      function matchesSearch(item) { return !raidQ || (item.desc||'').toLowerCase().indexOf(raidQ) >= 0; }

      function actionBtns(type, idx, item) {
        var key = p.id + '|' + type + '|' + idx;
        var isOpen = !!raidLogOpen[key];
        return '<div class="raid-actions">' +
          '<button class="btn btn-sm" title="Change log" onclick="toggleRaidLog(\'' + p.id + '\',\'' + type + '\',' + idx + ')"><i class="ti ' + (isOpen ? 'ti-chevron-up' : 'ti-history') + '"></i></button>' +
          (editable ? '<button class="btn btn-sm" onclick="openEditRaid(\'' + p.id + '\',\'' + type + '\',' + idx + ')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteRaid(\'' + p.id + '\',\'' + type + '\',' + idx + ')"><i class="ti ti-trash"></i></button>' : '') +
          '</div>';
      }
      function logBlock(type, idx, item) {
        var key = p.id + '|' + type + '|' + idx;
        if (!raidLogOpen[key]) return '';
        var entries = (item.log && item.log.length) ? item.log.slice().reverse().map(function(e){
          return '<div class="raid-log-entry"><strong>' + e.date + '</strong> — ' + e.actor + ': ' + e.action + (e.detail ? ' (' + e.detail + ')' : '') + '</div>';
        }).join('') : '<div class="raid-log-entry text-muted">No history recorded</div>';
        return '<div class="raid-log">' + entries + '</div>';
      }
      function rSection(label, allItems, type) {
        var items = allItems.filter(matchesSearch);
        var addBtn = editable ? '<button class="btn btn-sm btn-primary" onclick="openAddRaid(\'' + p.id + '\',\'' + type + '\')"><i class="ti ti-plus"></i> Add</button>' : '';
        var header = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="bold">' + label + '</div>' + addBtn + '</div>';
        if (!items.length) {
          var msg = allItems.length ? 'No matches in this section' : 'None logged';
          return header + '<div class="text-muted" style="font-size:12px;margin-bottom:12px">' + msg + '</div><div class="divider"></div>';
        }
        var body;
        function idxOf(item) { return allItems.indexOf(item); }
        if (type === 'risks') {
          body = '<div class="raid-grid-risks raid-grid-hdr"><div>Probability</div><div>Impact</div><div>Description &amp; Mitigation</div><div>Owner</div><div>Status</div><div></div></div>' +
            items.map(function(item) {
              var idx = idxOf(item);
              return '<div class="raid-grid-risks raid-grid-row">' +
                '<div style="font-size:13px">' + (item.probability != null ? item.probability + '%' : '—') + '</div>' +
                '<div>' + (item.impact ? bdg(item.impact) : '—') + '</div>' +
                '<div><div style="font-size:13px;word-break:break-word;white-space:normal;margin-bottom:4px">' + item.desc + '</div>' +
                '<div style="font-size:12px;color:#555;word-break:break-word;white-space:normal;background:#f5f5f3;padding:6px 8px;border-radius:6px;line-height:1.5">' + (item.mitigation||'—') + '</div></div>' +
                '<div style="font-size:12px;color:#777;word-break:break-word">' + item.owner + '</div>' +
                '<div>' + (item.status ? bdg(item.status) : '—') + '</div>' +
                '<div>' + actionBtns(type, idx, item) + '</div></div>' +
                logBlock(type, idx, item);
            }).join('');
        } else if (type === 'issues') {
          body = '<div class="raid-grid-issues raid-grid-hdr"><div>Severity</div><div>Description &amp; Solution</div><div>Owner</div><div>Status</div><div></div></div>' +
            items.map(function(item) {
              var idx = idxOf(item);
              return '<div class="raid-grid-issues raid-grid-row">' +
                '<div>' + bdg(item.severity) + '</div>' +
                '<div><div style="font-size:13px;word-break:break-word;white-space:normal;margin-bottom:4px">' + item.desc + '</div>' +
                '<div style="font-size:12px;color:#555;word-break:break-word;white-space:normal;background:#f5f5f3;padding:6px 8px;border-radius:6px;line-height:1.5">' + (item.solution||'—') + '</div></div>' +
                '<div style="font-size:12px;color:#777">' + item.owner + '</div>' +
                '<div>' + bdg(item.status) + '</div>' +
                '<div>' + actionBtns(type, idx, item) + '</div></div>' +
                logBlock(type, idx, item);
            }).join('');
        } else {
          body = items.map(function(item) {
            var idx = idxOf(item);
            return '<div style="font-size:13px;padding:10px 0;border-bottom:1px solid #f0ede8;display:flex;justify-content:space-between;align-items:center;gap:8px;word-break:break-word">' +
              '<div style="flex:1">' + item.desc + (item.owner ? ' <span class="text-muted">— ' + item.owner + '</span>' : '') + (item.status ? ' ' + bdg(item.status) : '') + '</div>' +
              actionBtns(type, idx, item) + '</div>' +
              logBlock(type, idx, item);
          }).join('');
        }
        return header + body + '<div class="divider"></div>';
      }
      var raidSearchBar = '<div class="task-filter-bar"><input type="text" id="raid-search" placeholder="Search RAID log…" value="' + (raidSearchState[p.id]||'').replace(/"/g,'&quot;') + '" oninput="onRaidSearch(\'' + p.id + '\',this.value)"></div>';
      return raidSearchBar + rSection('Risks', p.raid.risks, 'risks') + rSection('Assumptions', p.raid.assumptions, 'assumptions') + rSection('Issues', p.raid.issues, 'issues') + rSection('Dependencies', p.raid.dependencies, 'dependencies');
    }
    if (t === 'documentation') {
      var docs = p.documents || [];
      p.docFolders = (p.docFolders && p.docFolders.length) ? p.docFolders : ['General'];
      var activeFolder = docFolderState[p.id] || 'All';
      var missing = DOC_TYPES.filter(function(dt){ return !docs.some(function(d){ return d.category === dt; }); });
      var guidance = missing.length
        ? '<div class="info-banner info-blue"><i class="ti ti-info-circle"></i><div><strong>Still needed:</strong> ' + missing.join(', ') + '. These will disappear from this list once uploaded or linked.</div></div>'
        : '';
      var folderChips = ['All'].concat(p.docFolders).map(function(f) {
        var esc = f.replace(/'/g,"\\'");
        return '<button class="btn btn-sm' + (activeFolder===f?' btn-primary':'') + '" onclick="setDocFolder(\'' + p.id + '\',\'' + esc + '\')">' + (f==='All' ? '<i class="ti ti-folders"></i> All' : '<i class="ti ti-folder"></i> ' + f) + '</button>';
      }).join('') + (editable ? '<button class="btn btn-sm" onclick="newDocFolder(\'' + p.id + '\')"><i class="ti ti-folder-plus"></i> New folder</button>' : '');
      var shown = activeFolder === 'All' ? docs : docs.filter(function(d){ return (d.folder||'General') === activeFolder; });
      var rows = shown.map(function(d) {
        var idx = docs.indexOf(d);
        return '<div class="doc-row"><i class="ti ' + (d.sourceType === 'link' ? 'ti-link' : 'ti-file-text') + ' doc-icon"></i>' +
          '<div class="doc-info"><div class="doc-name">' + d.name + '</div><div class="text-muted">' + d.category + ' • ' + (d.folder||'General') + ' • added ' + d.dateAdded + '</div></div>' +
          '<button class="btn btn-sm" onclick="openDoc(\'' + p.id + '\',' + idx + ')"><i class="ti ti-external-link"></i> Open</button>' +
          (editable ? '<button class="btn btn-sm" title="Move to folder" onclick="openMoveDoc(\'' + p.id + '\',' + idx + ')"><i class="ti ti-folder-symlink"></i></button><button class="btn btn-sm" onclick="openEditDoc(\'' + p.id + '\',' + idx + ')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteDoc(\'' + p.id + '\',' + idx + ')"><i class="ti ti-trash"></i></button>' : '') +
          '</div>';
      }).join('');
      return guidance +
        '<div class="doc-folder-bar">' + folderChips + '</div>' +
        (editable ? '<button class="btn btn-primary btn-sm mb-12" onclick="openAddDoc(\'' + p.id + '\')"><i class="ti ti-plus"></i> Add document</button>' : '') +
        (shown.length ? rows : '<div class="empty-state" style="padding:30px"><i class="ti ti-files"></i><p>No documents in this folder</p></div>');
    }
    return '';
  }

  var tabsHtml = tbs.map(function(t) {
    return '<div class="tab' + (t === tab ? ' active' : '') + '" id="ptab-' + t + '" onclick="switchPTab(\'' + t + '\')" style="text-transform:capitalize">' + (t === 'overview' ? 'Information' : t === 'team' ? 'People' : t === 'tasks' ? 'Plan' : t === 'todos' ? 'To-Do' : t === 'raid' ? 'RAID log' : t === 'documentation' ? 'Documentation' : t) + '</div>';
  }).join('');

  tb(p.name);

  document.getElementById('content').innerHTML =
    '<div class="card" style="display:flex;flex-direction:column;height:calc(100vh - 112px);box-sizing:border-box;overflow:hidden">' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;flex-shrink:0">' + stagePill(p.stage) + ' ' + bdg(p.status) + ' ' + bdg(p.priority) + ' ' + lateBadgeHtml(isProjectLate(p)) + '</div>' +
    '<div class="tab-bar" style="flex-shrink:0">' + tabsHtml + '</div>' +
    '<div id="ptab-content" style="flex:1;overflow-y:auto">' + tabC(tab) + '</div>' +
    '</div>';
  if (tab === 'tasks') attachTaskDragHandlers();

  window.openProjectTagPicker = function(pid2) {
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    openTagPicker(pr.tags || [], async function(newTags) {
      var result = await applyTagDiff('project_tags', 'project_id', pid2, pr.tags || [], newTags);
      pr.tags = result.tags;
      showToast(result.failed.length ? 'Could not save: ' + result.failed.join(', ') : 'Tags updated');
      if (document.getElementById('ptab-content')) document.getElementById('ptab-content').innerHTML = tabC('overview');
    });
  };
  window.openDependencyPicker = function(pid2) {
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    var currentDepIds = (pr.dependencies||[]).map(function(d){ return d.id; });
    var candidates = D.projects.filter(function(x){ return x.id !== pid2 && currentDepIds.indexOf(x.id) < 0; });
    var query = '';
    function render() {
      var q = query.trim().toLowerCase();
      var matches = candidates.filter(function(x){ return x.name.toLowerCase().indexOf(q) >= 0; });
      var listHtml = matches.map(function(x){
        var isPlanned = !!(x.start && x.end);
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0"><span style="font-size:13px">' + x.name + (isPlanned ? '' : ' <span class="badge badge-amber" style="font-size:10px">Not planned</span>') + '</span><button class="btn btn-sm" onclick="window.__depAdd(\'' + x.id + '\')"><i class="ti ti-plus"></i> Add</button></div>';
      }).join('');
      showModal('<div class="modal-title">Add a dependency <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
        '<input type="text" id="dep-search" placeholder="Search projects…" value="' + query.replace(/"/g,'&quot;') + '" oninput="window.__depSearch(this.value)">' +
        '<div style="max-height:260px;overflow-y:auto;margin-top:8px">' + (listHtml || '<span class="text-muted" style="font-size:13px">No matching projects</span>') + '</div>' +
        '<div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Done</button></div>');
      var el = document.getElementById('dep-search');
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
    }
    window.__depSearch = function(val) { query = val; render(); };
    window.__depAdd = async function(depId) {
      var result = await sb.from('project_dependencies').insert({ project_id: pid2, depends_on_project_id: depId });
      if (result.error) { showToast('Could not add dependency: ' + result.error.message); return; }
      var depProj = D.projects.find(function(x){ return x.id === depId; });
      pr.dependencies = pr.dependencies || [];
      pr.dependencies.push({ id: depProj.id, name: depProj.name, stage: depProj.stage, start: depProj.start, end: depProj.end });
      candidates = candidates.filter(function(x){ return x.id !== depId; });
      showToast(depProj.name + ' added as a dependency');
      render();
      if (document.getElementById('ptab-content')) document.getElementById('ptab-content').innerHTML = tabC('overview');
    };
    render();
  };
  window.removeProjectDependency = async function(pid2, depId) {
    if (!confirm('Remove this dependency?')) return;
    var result = await sb.from('project_dependencies').delete().eq('project_id', pid2).eq('depends_on_project_id', depId);
    if (result.error) { showToast('Could not remove: ' + result.error.message); return; }
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    pr.dependencies = (pr.dependencies||[]).filter(function(d){ return d.id !== depId; });
    showToast('Dependency removed');
    if (document.getElementById('ptab-content')) document.getElementById('ptab-content').innerHTML = tabC('overview');
  };
  window.openProgramPickerForProject = function(pid2) {
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    var candidates = D.programs.filter(function(prog){ return prog.id !== pr.programId; });
    var query = '';
    function render() {
      var q = query.trim().toLowerCase();
      var matches = candidates.filter(function(prog){ return prog.name.toLowerCase().indexOf(q) >= 0 || programLabel(prog).toLowerCase().indexOf(q) >= 0; });
      var listHtml = matches.map(function(prog){
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0"><span style="font-size:13px">' + programLabel(prog) + ' — ' + prog.name + '</span><button class="btn btn-sm" onclick="window.__progAdd(\'' + prog.id + '\')"><i class="ti ti-plus"></i> Add</button></div>';
      }).join('');
      showModal('<div class="modal-title">Add to a program <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
        '<input type="text" id="prog-picker-search" placeholder="Search programs…" value="' + query.replace(/"/g,'&quot;') + '" oninput="window.__progSearch(this.value)">' +
        '<div style="max-height:260px;overflow-y:auto;margin-top:8px">' + (listHtml || '<span class="text-muted" style="font-size:13px">No matching programs</span>') + '</div>' +
        '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button></div>');
      var el = document.getElementById('prog-picker-search');
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
    }
    window.__progSearch = function(val) { query = val; render(); };
    window.__progAdd = async function(progId) {
      var result = await sb.from('projects').update({ program_id: progId }).eq('id', pid2);
      if (result.error) { showToast('Could not set program: ' + result.error.message); return; }
      pr.programId = progId;
      closeModal();
      var prog = D.programs.find(function(x){ return x.id === progId; });
      showToast(pr.name + ' added to ' + programLabel(prog));
      if (document.getElementById('ptab-content')) document.getElementById('ptab-content').innerHTML = tabC('overview');
    };
    render();
  };
  window.removeProjectProgram = async function(pid2) {
    if (!confirm('Remove this project from its program?')) return;
    var result = await sb.from('projects').update({ program_id: null }).eq('id', pid2);
    if (result.error) { showToast('Could not remove: ' + result.error.message); return; }
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    pr.programId = null;
    showToast('Removed from program');
    if (document.getElementById('ptab-content')) document.getElementById('ptab-content').innerHTML = tabC('overview');
  };
  window.setTeamAddKind = function(pid2, kind) {
    teamAddKind[pid2] = kind;
    document.getElementById('ptab-content').innerHTML = tabC('team');
  };
  window.toggleTeamTierInfo = function(pid2) {
    teamTierInfoOpen[pid2] = !teamTierInfoOpen[pid2];
    document.getElementById('ptab-content').innerHTML = tabC('team');
  };
  window.filterTeamAddList = function(query) {
    var q = query.trim().toLowerCase();
    document.querySelectorAll('#team-add-list .team-add-row').forEach(function(row) {
      row.style.display = row.getAttribute('data-name').indexOf(q) >= 0 ? 'flex' : 'none';
    });
  };
  window.addTeamMemberDirect = async function(pid2, personName) {
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    var res = resolveResource(personName);
    if (!res) { showToast('Could not find that person'); return; }
    if (pr.teamIds.indexOf(res.id) >= 0) { showToast('Already on the team'); return; }
    var result = await sb.from('resource_projects').insert({ project_id: pid2, resource_id: res.id });
    if (result.error) { showToast('Could not add: ' + result.error.message); return; }
    pr.team.push(personName); pr.teamIds.push(res.id);
    document.getElementById('ptab-content').innerHTML = tabC('team');
    showToast(personName + ' added to the team');
  };
  window.removeTeamMemberDirect = async function(pid2, personName) {
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    var idx = pr.team.indexOf(personName);
    if (idx < 0) return;
    if (!confirm('Remove ' + personName + ' from the team?')) return;
    var resourceId = pr.teamIds[idx];
    var result = await sb.from('resource_projects').delete().eq('project_id', pid2).eq('resource_id', resourceId);
    if (result.error) { showToast('Could not remove: ' + result.error.message); return; }
    pr.team.splice(idx,1); pr.teamIds.splice(idx,1);
    if (pr.teamTiers) delete pr.teamTiers[resourceId];
    document.getElementById('ptab-content').innerHTML = tabC('team');
    showToast(personName + ' removed from the team');
  };
  window.setAllocationTier = async function(pid2, resourceId, tier) {
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    var result = await writeAllocationTier(pid2, resourceId, tier);
    if (result.error) { showToast('Could not update allocation: ' + result.error.message); return; }
    pr.teamTiers = pr.teamTiers || {};
    pr.teamTiers[resourceId] = tier || null;
    showToast('Allocation updated');
  };
  window.switchPTab = function(t) {
    tbs.forEach(function(x){ var e = document.getElementById('ptab-' + x); if (e) e.className = 'tab' + (x===t?' active':''); });
    document.getElementById('ptab-content').innerHTML = tabC(t);
    if (t === 'tasks') attachTaskDragHandlers();
    var h = '#/project/' + pid + '/' + t;
    if (location.hash !== h) location.hash = h;
    };
  window.scrollToProjectInfoSection = function(key) {
    var el = document.getElementById('pinfo-' + key);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  window.setProjectInfoEditing = function(key) {
    projectInfoEditing = key;
    document.getElementById('ptab-content').innerHTML = tabC('overview');
    if (key === 'financials') {
      ['pff-amount','pff-cost-amount'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', function() {
          this.value = this.value.replace(/[^0-9]/g,'');
          var err = document.getElementById('pff-err'); if (err) err.style.display = 'none';
        });
      });
    }
  };
  window.setPeopleEditing = function(val) {
    peopleEditing = val;
    document.getElementById('ptab-content').innerHTML = tabC('team');
  };
  window.toggleMS   = async function(pid2,idx){
    var pr=D.projects.find(function(x){return x.id===pid2;});
    var m = pr.milestones[idx];
    if (!m.done) { openCompleteMilestoneModal(pid2, idx); return; }
    var result = await sb.from('milestones').update({ done: false, completed_date: null }).eq('id', m.id);
    if (result.error) { showToast('Could not save: ' + result.error.message); return; }
    m.done = false; m.completedDate = null;
    m.log = m.log || []; m.log.push(await writeLog('milestone_log', 'milestone_id', m.id, 'Reopened', ''));
    document.getElementById('ptab-content').innerHTML=tabC('milestones');
  };
  window.deleteMS   = async function(pid2,idx){
    var pr=D.projects.find(function(x){return x.id===pid2;});
    var m = pr.milestones[idx];
    var result = await sb.from('milestones').delete().eq('id', m.id);
    if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
    pr.milestones.splice(idx,1);
    document.getElementById('ptab-content').innerHTML=tabC('milestones');
  };
  window.toggleMSLog = function(pid2, idx) {
    var key = pid2 + '|' + p.milestones[idx].id;
    milestoneLogOpen[key] = !milestoneLogOpen[key];
    document.getElementById('ptab-content').innerHTML = tabC('milestones');
  };
  window.openEditMilestone = function(pid2, idx){ openMilestoneModal(pid2, idx); };
  window.deleteTask = async function(pid2,idx){
    taskActionMenuOpen = null;
    var pr=D.projects.find(function(x){return x.id===pid2;});
    var tk = pr.tasks[idx];
    var descendantIds = collectTaskDescendantIds(pr.tasks, tk.id);
    var result = await sb.from('tasks').delete().eq('id', tk.id);
    if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
    var removeIds = [tk.id].concat(descendantIds);
    pr.tasks = pr.tasks.filter(function(t){ return removeIds.indexOf(t.id) < 0; });
    pr.tasks.forEach(function(t){ if (removeIds.indexOf(t.dependsOnTaskId) >= 0) t.dependsOnTaskId = null; });
    await recalcAndPersist(pr);
    document.getElementById('ptab-content').innerHTML=tabC('tasks');
    attachTaskDragHandlers();
  };
  window.deleteRaid = async function(pid2,type,idx){
    var pr=D.projects.find(function(x){return x.id===pid2;});
    var itemToDelete = pr.raid[type][idx];
    var result = await sb.from('raid_items').delete().eq('id', itemToDelete.id);
    if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
    pr.raid[type].splice(idx,1);
    document.getElementById('ptab-content').innerHTML=tabC('raid');
  };
  window.openAddMilestone = function(pid2){ openMilestoneModal(pid2); };
  window.openAddTask      = function(pid2){ openTaskModal(pid2, null); };
  window.openEditTask     = function(pid2,idx){ taskActionMenuOpen = null; openTaskModal(pid2, idx); };
  window.openAddRaid      = function(pid2,type){ openRaidModal(pid2, type, null); };
  window.openEditRaid     = function(pid2,type,idx){ openRaidModal(pid2, type, idx); };
  window.onTaskSearch = function(pid2, val) {
    getTaskState(pid2).search = val;
    refreshTaskView();
    var el = document.getElementById('task-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.toggleTaskFilterPanel = function(pid2, col) {
    var s = getTaskState(pid2);
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    var label = col === 'assignee' ? 'Assignee' : 'Status';
    var choices;
    if (col === 'assignee') {
      choices = [];
      pr.tasks.forEach(function(tk){ var lbl = taskAssigneeLabel(tk); if (choices.indexOf(lbl) < 0) choices.push(lbl); });
    } else {
      choices = ['To Do','In Progress','On Hold','Done'];
    }
    openFilterModal(label, choices,
      function() { return col === 'assignee' ? s.fAssignee : s.fStatus; },
      function(val) { var arr = col === 'assignee' ? s.fAssignee : s.fStatus; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { if (col === 'assignee') s.fAssignee = []; else s.fStatus = []; },
      refreshTaskView
    );
  };
  window.openAddTodo  = function(pid2){ openTodoModal(pid2, null); };
  window.openEditTodo = function(pid2,idx){ openTodoModal(pid2, idx); };
  window.deleteTodo = async function(pid2,idx){
    var pr = D.projects.find(function(x){return x.id===pid2;});
    var td = pr.todos[idx];
    if (!confirm('Delete "' + td.title + '"?')) return;
    var result = await sb.from('todo_items').delete().eq('id', td.id);
    if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
    pr.todos = pr.todos.filter(function(x){ return x.id !== td.id; });
    document.getElementById('ptab-content').innerHTML = tabC('todos');
    showToast('To-do deleted');
  };
  window.onTodoSearch = function(pid2, val) {
    getTodoState(pid2).search = val;
    refreshTaskView();
    var el = document.getElementById('todo-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.toggleTodoFilterPanel = function(pid2, col) {
    var s = getTodoState(pid2);
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    var label = col === 'assignee' ? 'Assignee' : 'Status';
    var choices;
    if (col === 'assignee') {
      choices = [];
      pr.todos.forEach(function(td){ var lbl = td.assignee || 'Unassigned'; if (choices.indexOf(lbl) < 0) choices.push(lbl); });
    } else {
      choices = ['Not Started','In Progress','Done'];
    }
    openFilterModal(label, choices,
      function() { return col === 'assignee' ? s.fAssignee : s.fStatus; },
      function(val) { var arr = col === 'assignee' ? s.fAssignee : s.fStatus; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { if (col === 'assignee') s.fAssignee = []; else s.fStatus = []; },
      refreshTaskView
    );
  };
  window.toggleTaskLog = function(pid2, taskId) {
    var key = pid2 + '|' + taskId;
    taskLogOpen[key] = !taskLogOpen[key];
    refreshTaskView();
  };
  window.toggleRaidLog = function(pid2, type, idx) {
    var key = pid2 + '|' + type + '|' + idx;
    raidLogOpen[key] = !raidLogOpen[key];
    document.getElementById('ptab-content').innerHTML = tabC('raid');
  };
  window.onRaidSearch = function(pid2, val) {
    raidSearchState[pid2] = val;
    document.getElementById('ptab-content').innerHTML = tabC('raid');
    var el = document.getElementById('raid-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.openAddDoc  = function(pid2){ openDocModal(pid2, null); };
  window.openEditDoc = function(pid2, idx){ openDocModal(pid2, idx); };
  window.setDocFolder = function(pid2, folder) {
    docFolderState[pid2] = folder;
    document.getElementById('ptab-content').innerHTML = tabC('documentation');
  };
  window.newDocFolder = async function(pid2) {
    var name = prompt('New folder name:');
    if (!name) return;
    name = name.trim();
    if (!name) return;
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    pr.docFolders = pr.docFolders && pr.docFolders.length ? pr.docFolders : ['General'];
    if (pr.docFolders.indexOf(name) >= 0) { docFolderState[pid2] = name; document.getElementById('ptab-content').innerHTML = tabC('documentation'); return; }
    var result = await sb.from('doc_folders').insert({ project_id: pid2, name: name }).select().single();
    if (result.error) { showToast('Could not create folder: ' + result.error.message); return; }
    pr.docFolders.push(name);
    pr.docFolderIds = pr.docFolderIds || {};
    pr.docFolderIds[name] = result.data.id;
    docFolderState[pid2] = name;
    document.getElementById('ptab-content').innerHTML = tabC('documentation');
    showToast('Folder created');
  };
  window.openMoveDoc = function(pid2, idx) { openMoveDocModal(pid2, idx); };
  window.deleteDoc   = async function(pid2, idx) {
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    var doc = pr.documents[idx];
    var result = await sb.from('documents').delete().eq('id', doc.id);
    if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
    pr.documents.splice(idx, 1);
    document.getElementById('ptab-content').innerHTML = tabC('documentation');
    showToast('Document removed');
  };
  window.openDoc = function(pid2, idx) {
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    var d = pr.documents[idx];
    if (d && d.url) window.open(d.url, '_blank'); else showToast('No file or link attached');
  };
}

async function putOnHold(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var reason = prompt('Why is "' + p.name + '" going on hold?');
  if (reason == null) return;
  reason = reason.trim();
  if (!reason) { showToast('A hold reason is required'); return; }
  var beforeSnapshot = { stage: p.stage, holdReason: p.holdReason };
  var heldAt = new Date().toISOString();
  var result = await sb.from('projects').update({ stage: 'hold', hold_reason: reason, pre_hold_stage: p.stage, held_at: heldAt }).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  await logProjectChanges(pid, beforeSnapshot, { stage: 'hold', holdReason: reason }, 'hold');
  p.preHoldStage = p.stage; p.stage = 'hold'; p.holdReason = reason; p.heldAt = heldAt;
  closeModal(); showToast('"' + p.name + '" is now on hold'); renderNav();
  if (currentPage === 'projectDetail') pgProjectDetail(pid, 'overview'); else if (currentPage === 'portfolio') pgPortfolio(); else if (currentPage === 'hold') pgHold(); else pgDashboard();
}

async function resumeFromHold(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var beforeSnapshot = { stage: p.stage, holdReason: p.holdReason };
  var resumeStage = p.preHoldStage || 'planned';
  var result = await sb.from('projects').update({ stage: resumeStage, hold_reason: null, pre_hold_stage: null, held_at: null }).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  await logProjectChanges(pid, beforeSnapshot, { stage: resumeStage, holdReason: null }, 'resume');
  p.stage = resumeStage; p.holdReason = null; p.preHoldStage = null; p.heldAt = null;
  closeModal(); showToast('"' + p.name + '" resumed'); renderNav();
  if (currentPage === 'projectDetail') pgProjectDetail(pid, 'overview'); else if (currentPage === 'portfolio') pgPortfolio(); else if (currentPage === 'hold') pgHold(); else pgDashboard();
}

async function markComplete(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var beforeSnapshot = { stage: p.stage, status: p.status, progress: p.progress };
  var completedAt = new Date().toISOString();
  var result = await sb.from('projects').update({ stage: 'complete', status: 'Completed', progress: 100, completed_at: completedAt }).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  await logProjectChanges(pid, beforeSnapshot, { stage: 'complete', status: 'Completed', progress: 100 }, 'complete');
  p.stage = 'complete'; p.status = 'Completed'; p.progress = 100; p.completedAt = completedAt;
  var r = D.requests.find(function(x){ return x.id === p.requestId; });
  if (r) await syncRequestStatus(r.id, { status: 'Active' });
  closeModal(); showToast('"' + p.name + '" marked as complete'); renderNav();
  if (currentPage === 'projectDetail') pgProjectDetail(pid, 'overview'); else if (currentPage === 'projects') pgProjects(); else pgDashboard();
}

// ── Milestone / Task / RAID modals ─────────────────────────────────────────────

async function writeLog(table, fkCol, fkVal, action, detail) {
  var entry = { actor_id: D.currentProfile.id, actor_name: D.currentProfile.display_name, action: action, detail: detail || '' };
  entry[fkCol] = fkVal;
  var result = await sb.from(table).insert(entry).select().single();
  if (result.error) { console.error(table + ' log write failed:', result.error); return { date: new Date().toISOString().split('T')[0], actor: D.currentProfile.display_name, action: action, detail: detail || '' }; }
  return { date: ymd(result.data.logged_at), actor: result.data.actor_name, action: result.data.action, detail: result.data.detail || '' };
}

function openMilestoneModal(pid, idx) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var isEdit = idx != null;
  var m = isEdit ? p.milestones[idx] : null;
  showModal('<div class="modal-title">' + (isEdit?'Edit milestone':'Add milestone') + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Milestone name *</div><input type="text" id="ms-name" value="' + (m?m.name:'') + '" placeholder="e.g. Design approved"></div>' +
    '<div class="form-group"><div class="form-label">Target date *</div><input type="date" id="ms-date" value="' + (m?m.date:'') + '"></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="ms-save"><i class="ti ti-check"></i> ' + (isEdit?'Save changes':'Add milestone') + '</button></div>');
  document.getElementById('ms-save').onclick = async function() {
    var name = document.getElementById('ms-name').value.trim(); var date = document.getElementById('ms-date').value;
    if (!name||!date){ showToast('Fill in name and date'); return; }
    var btn = document.getElementById('ms-save'); btn.disabled = true;

    if (isEdit) {
      var changes = [];
      if (m.name !== name) changes.push('Name: "' + m.name + '" → "' + name + '"');
      if (m.date !== date) changes.push('Target date: "' + m.date + '" → "' + date + '"');
      var result = await sb.from('milestones').update({ name: name, target_date: date }).eq('id', m.id);
      if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
      m.name = name; m.date = date;
      m.log = m.log || [];
      if (changes.length) m.log.push(await writeLog('milestone_log', 'milestone_id', m.id, 'Updated', changes.join('; ')));
      showToast('Milestone updated');
    } else {
      var insertResult = await sb.from('milestones').insert({ project_id: pid, name: name, target_date: date, done: false }).select().single();
      if (insertResult.error) { showToast('Could not save: ' + insertResult.error.message); btn.disabled = false; return; }
      var newM = { id: insertResult.data.id, name: name, date: date, done: false, completedDate: null, log: [] };
      newM.log.push(await writeLog('milestone_log', 'milestone_id', newM.id, 'Created', ''));
      p.milestones.push(newM);
      showToast('Milestone added');
    }
    closeModal(); if (window.switchPTab) window.switchPTab('milestones');
  };
}

function openCompleteMilestoneModal(pid, idx) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var m = p.milestones[idx];
  showModal('<div class="modal-title">Mark "' + m.name + '" complete <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Completion date</div>' +
      '<div class="radio-row">' +
        '<label><input type="radio" name="cm-choice" value="target" checked onchange="toggleCompleteDateRow()"> Target date (' + m.date + ')</label>' +
        '<label><input type="radio" name="cm-choice" value="custom" onchange="toggleCompleteDateRow()"> Different date</label>' +
      '</div>' +
      '<div id="cm-custom-row" style="display:none"><input type="date" id="cm-date" value="' + m.date + '"></div>' +
    '</div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="cm-save"><i class="ti ti-check"></i> Mark complete</button></div>');

  window.toggleCompleteDateRow = function() {
    var custom = document.querySelector('input[name="cm-choice"]:checked').value === 'custom';
    document.getElementById('cm-custom-row').style.display = custom ? 'block' : 'none';
  };

  document.getElementById('cm-save').onclick = async function() {
    var choice = document.querySelector('input[name="cm-choice"]:checked').value;
    var completedDate = choice === 'custom' ? document.getElementById('cm-date').value : m.date;
    if (!completedDate) { showToast('Enter a completion date'); return; }
    var btn = document.getElementById('cm-save'); btn.disabled = true;

    var result = await sb.from('milestones').update({ done: true, completed_date: completedDate }).eq('id', m.id);
    if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
    m.done = true; m.completedDate = completedDate;
    m.log = m.log || [];
    m.log.push(await writeLog('milestone_log', 'milestone_id', m.id, 'Completed', 'Completed date: ' + completedDate + (completedDate !== m.date ? ' (target was ' + m.date + ')' : '')));
    showToast('"' + m.name + '" marked complete');
    closeModal(); if (window.switchPTab) window.switchPTab('milestones');
  };
}

function openTaskModal(pid, idx, opts) {
  opts = opts || {};
  var p = D.projects.find(function(x){ return x.id === pid; });
  var task = idx != null ? p.tasks[idx] : null;
  // only project members + all people for admin/pm
  var pool = canEdit(p) ? individualResourceNames().concat(teamNames()) : p.team.slice();
  if (task && task.assignee && pool.indexOf(task.assignee) < 0) pool = pool.concat([task.assignee]);

  var selectedAssignee = task ? (task.assignee || '') : '';
  var assigneePickerOpen = false;
  var assigneeQuery = '';

  function assigneePanelHtml() {
    var q = assigneeQuery.trim().toLowerCase();
    var matches = pool.filter(function(n){ return n.toLowerCase().indexOf(q) >= 0; });
    var rows = matches.map(function(n){
      var isTeam = teamNames().indexOf(n) >= 0;
      var isInactiveCurrent = task && task.assignee === n && individualResourceNames().indexOf(n) < 0 && teamNames().indexOf(n) < 0;
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">' +
        '<span style="font-size:13px"><i class="ti ' + (isTeam ? 'ti-users' : 'ti-user') + '" style="margin-right:6px;color:#888"></i>' + n + (isInactiveCurrent ? ' <span class="text-muted">(no longer a resource)</span>' : '') + '</span>' +
        '<button type="button" class="btn btn-sm" onclick="window.__taskAssigneePick(\'' + n.replace(/'/g,"\\'") + '\')">Select</button>' +
        '</div>';
    }).join('');
    return '<div style="border:1px solid #e8e8e5;border-radius:8px;padding:10px;margin-top:8px">' +
      '<button type="button" class="btn btn-sm" style="margin-bottom:8px" onclick="window.__taskAssigneePick(\'\')"><i class="ti ti-user-off"></i> Unassigned</button>' +
      '<input type="text" id="tm-assignee-search" placeholder="Search people or teams…" value="' + assigneeQuery.replace(/"/g,'&quot;') + '" oninput="window.__taskAssigneeSearch(this.value)">' +
      '<div style="max-height:180px;overflow-y:auto;margin-top:8px">' + (rows || '<span class="text-muted" style="font-size:13px">No matches</span>') + '</div>' +
      '</div>';
  }

  function assigneeFieldInner() {
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="font-size:13px' + (selectedAssignee ? '' : ';color:#999') + '">' + (selectedAssignee || 'Unassigned') + '</span>' +
      '<button type="button" class="btn btn-sm" onclick="window.__taskAssigneeToggle()">' + (selectedAssignee ? 'Change' : 'Assign') + '</button>' +
      '</div>' +
      (assigneePickerOpen ? assigneePanelHtml() : '');
  }

  window.__taskAssigneeToggle = function() {
    assigneePickerOpen = !assigneePickerOpen;
    assigneeQuery = '';
    document.getElementById('tm-assignee-field').innerHTML = assigneeFieldInner();
    var s = document.getElementById('tm-assignee-search');
    if (s) s.focus();
  };
  window.__taskAssigneeSearch = function(val) {
    assigneeQuery = val;
    document.getElementById('tm-assignee-field').innerHTML = assigneeFieldInner();
    var s = document.getElementById('tm-assignee-search');
    if (s) { s.focus(); s.selectionStart = s.selectionEnd = s.value.length; }
  };
  window.__taskAssigneePick = function(name) {
    selectedAssignee = name;
    assigneePickerOpen = false;
    document.getElementById('tm-assignee-field').innerHTML = assigneeFieldInner();
  };

  var hasChildren = task ? p.tasks.some(function(x){ return x.parentTaskId === task.id; }) : false;
  var descendantIds = task ? collectTaskDescendantIds(p.tasks, task.id) : [];
  var predecessorPool = p.tasks.filter(function(x){ return (!task || x.id !== task.id) && descendantIds.indexOf(x.id) < 0; });
  var predecessorLookup = {}; predecessorPool.forEach(function(x){ predecessorLookup[x.id] = x; });
  var initialDependsOn = task ? (task.dependsOnTaskId || '') : '';
  var datesLocked = hasChildren || !!initialDependsOn;

  var selectedDependsOn = initialDependsOn;
  var dependsOnPickerOpen = false;
  var dependsOnQuery = '';

  function dependsOnPanelHtml() {
    var q = dependsOnQuery.trim().toLowerCase();
    var matches = predecessorPool.filter(function(x){ return x.title.toLowerCase().indexOf(q) >= 0; });
    var rows = matches.map(function(x){
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">' +
        '<span style="font-size:13px">' + x.title + '</span>' +
        '<button type="button" class="btn btn-sm" onclick="window.__taskDependsOnPick(\'' + x.id + '\')">Select</button>' +
        '</div>';
    }).join('');
    return '<div style="border:1px solid #e8e8e5;border-radius:8px;padding:10px;margin-top:8px">' +
      '<button type="button" class="btn btn-sm" style="margin-bottom:8px" onclick="window.__taskDependsOnPick(\'\')"><i class="ti ti-circle-off"></i> None</button>' +
      '<input type="text" id="tm-dependson-search" placeholder="Search tasks…" value="' + dependsOnQuery.replace(/"/g,'&quot;') + '" oninput="window.__taskDependsOnSearch(this.value)">' +
      '<div style="max-height:180px;overflow-y:auto;margin-top:8px">' + (rows || '<span class="text-muted" style="font-size:13px">No matches</span>') + '</div>' +
      '</div>';
  }

  function dependsOnFieldInner() {
    var sel = predecessorLookup[selectedDependsOn];
    return '<input type="hidden" id="tm-dependson" value="' + (selectedDependsOn||'') + '">' +
      '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="font-size:13px' + (sel ? '' : ';color:#999') + '">' + (sel ? sel.title : 'None') + '</span>' +
      '<button type="button" class="btn btn-sm" onclick="window.__taskDependsOnToggle()">' + (sel ? 'Change' : 'Set') + '</button>' +
      '</div>' +
      (dependsOnPickerOpen ? dependsOnPanelHtml() : '');
  }

  window.__taskDependsOnToggle = function() {
    dependsOnPickerOpen = !dependsOnPickerOpen;
    dependsOnQuery = '';
    document.getElementById('tm-dependson-field').innerHTML = dependsOnFieldInner();
    var s = document.getElementById('tm-dependson-search');
    if (s) s.focus();
  };
  window.__taskDependsOnSearch = function(val) {
    dependsOnQuery = val;
    document.getElementById('tm-dependson-field').innerHTML = dependsOnFieldInner();
    var s = document.getElementById('tm-dependson-search');
    if (s) { s.focus(); s.selectionStart = s.selectionEnd = s.value.length; }
  };
  window.__taskDependsOnPick = function(id) {
    selectedDependsOn = id;
    dependsOnPickerOpen = false;
    document.getElementById('tm-dependson-field').innerHTML = dependsOnFieldInner();
    window.__taskDependsOnChange();
  };

  var schedulingHtml = hasChildren
    ? '<div class="form-group"><div class="form-label">Duration &amp; dependency</div><div class="text-muted" style="font-size:12px">Not applicable — this task has subtasks, so its dates roll up from them.</div></div>'
    : '<div class="grid-2"><div class="form-group"><div class="form-label">Duration (working days)</div><input type="number" id="tm-duration" min="1" value="' + (task && task.duration ? task.duration : '') + '" oninput="window.__taskDurationChange()"></div>' +
      '<div class="form-group"><div class="form-label">Depends on</div><div id="tm-dependson-field">' + dependsOnFieldInner() + '</div></div></div>';

  showModal('<div class="modal-title">' + (task?'Edit task':'Add task') + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Task title *</div><input type="text" id="tm-title" value="' + (task?task.title:'') + '" placeholder="Task name"></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="tm-desc" rows="3" placeholder="Details, context, links…">' + (task ? (task.description||'') : '') + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">Assignee</div><div id="tm-assignee-field">' + assigneeFieldInner() + '</div></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Status</div><select id="tm-status">' +
      '<option' + (!task||task.status==='To Do'?' selected':'') + '>To Do</option>' +
      '<option' + (task&&task.status==='In Progress'?' selected':'') + '>In Progress</option>' +
      '<option' + (task&&task.status==='On Hold'?' selected':'') + '>On Hold</option>' +
      '<option' + (task&&task.status==='Done'?' selected':'') + '>Done</option></select></div>' +
    '<div></div></div>' +
    schedulingHtml +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Start date</div><input type="date" id="tm-start" value="' + (task?(task.start||''):'') + '" oninput="window.__taskStartChange()"' + (datesLocked?' disabled':'') + '></div>' +
    '<div class="form-group"><div class="form-label">End date</div><input type="date" id="tm-end" value="' + (task?(task.end||''):'') + '" oninput="window.__taskEndChange()"' + (datesLocked?' disabled':'') + '></div></div>' +
    '<div class="text-muted" id="tm-dates-hint" style="font-size:12px;margin:-6px 0 12px' + (datesLocked?'':';display:none') + '">' + (hasChildren ? 'Dates are calculated from this task\'s subtasks.' : 'Dates are calculated from the selected dependency and duration.') + '</div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="tm-save"><i class="ti ti-check"></i> ' + (task?'Save changes':'Add task') + '</button></div>');

  window.__taskDurationChange = function() {
    var durEl = document.getElementById('tm-duration'), startEl = document.getElementById('tm-start'), endEl = document.getElementById('tm-end');
    var dur = parseInt(durEl.value, 10);
    if (dur > 0 && startEl.value) endEl.value = addWorkingDays(startEl.value, dur);
  };
  window.__taskStartChange = function() { window.__taskDurationChange(); };
  window.__taskEndChange = function() {
    var startEl = document.getElementById('tm-start'), endEl = document.getElementById('tm-end'), durEl = document.getElementById('tm-duration');
    if (startEl.value && endEl.value && endEl.value >= startEl.value) {
      var wd = workingDaysBetween(startEl.value, endEl.value);
      if (wd) durEl.value = wd;
    }
  };
  window.__taskDependsOnChange = function() {
    var dependsEl = document.getElementById('tm-dependson'), startEl = document.getElementById('tm-start'), endEl = document.getElementById('tm-end'), hint = document.getElementById('tm-dates-hint');
    var locked = !!(dependsEl && dependsEl.value);
    startEl.disabled = locked; endEl.disabled = locked;
    if (hint) hint.style.display = locked ? 'block' : 'none';
    if (locked) {
      var pred = predecessorLookup[dependsEl.value];
      if (pred && pred.end) { startEl.value = nextWorkingDay(pred.end); window.__taskDurationChange(); }
    }
  };

  document.getElementById('tm-save').onclick = async function() {
    var title = document.getElementById('tm-title').value.trim();
    if (!title){ showToast('Task title required'); return; }
    var durationEl = document.getElementById('tm-duration');
    var dependsOnEl = document.getElementById('tm-dependson');
    var duration = durationEl ? (parseInt(durationEl.value, 10) || null) : null;
    var dependsOnTaskId = (dependsOnEl && dependsOnEl.value) ? dependsOnEl.value : null;
    var newVals = {
      title: title, description: document.getElementById('tm-desc').value.trim(),
      assignee: selectedAssignee, status: document.getElementById('tm-status').value,
      start: document.getElementById('tm-start').value, end: document.getElementById('tm-end').value,
      duration: hasChildren ? null : duration, dependsOnTaskId: hasChildren ? null : dependsOnTaskId
    };
    if (newVals.start && newVals.end && newVals.end < newVals.start) { showToast('End date cannot be before start date'); return; }
    if (newVals.dependsOnTaskId && !newVals.duration) { showToast('Duration is required when a dependency is set'); return; }
    if (newVals.dependsOnTaskId && wouldCreateDependencyCycle(p.tasks, task ? task.id : null, newVals.dependsOnTaskId)) { showToast('That would create a circular dependency'); return; }
    var btn = document.getElementById('tm-save'); btn.disabled = true;
    var assigneeResource = resolveResource(newVals.assignee);

    if (idx!=null) {
      var fieldLabels = {title:'Title',description:'Description',assignee:'Assignee',status:'Status',start:'Start date',end:'End date'};
      var changes = [];
      ['title','description','assignee','status','start','end'].forEach(function(f){
        if ((task[f]||'') !== (newVals[f]||'')) changes.push(fieldLabels[f] + ': "' + (task[f]||'—') + '" → "' + (newVals[f]||'—') + '"');
      });
      var result = await sb.from('tasks').update({
        title: newVals.title, description: newVals.description || null, assignee_id: assigneeResource ? assigneeResource.id : null,
        assignee_name: newVals.assignee || null, status: newVals.status, start_date: newVals.start || null, end_date: newVals.end || null,
        duration_days: newVals.duration, depends_on_task_id: newVals.dependsOnTaskId
      }).eq('id', task.id);
      if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
      task.title = newVals.title; task.description = newVals.description; task.assignee = newVals.assignee; task.assigneeId = assigneeResource ? assigneeResource.id : null;
      task.status = newVals.status; task.start = newVals.start; task.end = newVals.end;
      task.duration = newVals.duration; task.dependsOnTaskId = newVals.dependsOnTaskId;
      task.log = task.log || [];
      if (changes.length) task.log.push(await writeLog('task_log', 'task_id', task.id, 'Updated', changes.join('; ')));
      await ensureOnTeam(p, assigneeResource);
    } else {
      var relTask = opts.relativeToTaskId ? p.tasks.find(function(x){ return x.id === opts.relativeToTaskId; }) : null;
      var relPosition = opts.relativePosition;
      if (!relTask) {
        // Plain "Add task" (no explicit relative task): append after the
        // last row in the current outline, inheriting its indentation
        // level, instead of always dropping back to the root.
        var fullOutline = buildTaskOutline(p.tasks);
        if (fullOutline.length) { relTask = fullOutline[fullOutline.length - 1].task; relPosition = 'after'; }
      }
      var parentIdForInsert = relTask ? (relTask.parentTaskId || null) : null;
      var insertResult = await sb.from('tasks').insert({
        project_id: pid, title: newVals.title, description: newVals.description || null, assignee_id: assigneeResource ? assigneeResource.id : null,
        assignee_name: newVals.assignee || null, status: newVals.status, start_date: newVals.start || null, end_date: newVals.end || null,
        duration_days: newVals.duration, depends_on_task_id: newVals.dependsOnTaskId,
        parent_task_id: parentIdForInsert, position: 0
      }).select().single();
      if (insertResult.error) { showToast('Could not save: ' + insertResult.error.message); btn.disabled = false; return; }
      var t2 = {id:insertResult.data.id,title:newVals.title,description:newVals.description,assignee:newVals.assignee,assigneeId:assigneeResource?assigneeResource.id:null,status:newVals.status,start:newVals.start,end:newVals.end,duration:newVals.duration,dependsOnTaskId:newVals.dependsOnTaskId,parentTaskId:parentIdForInsert,position:0,log:[],comments:[],checklist:[],tags:[]};
      t2.log.push(await writeLog('task_log', 'task_id', t2.id, 'Created', ''));
      p.tasks.push(t2);
      var newSiblings = taskSiblings(p.tasks, parentIdForInsert).filter(function(x){ return x.id !== t2.id; });
      var relIdx = relTask ? newSiblings.findIndex(function(x){ return x.id === relTask.id; }) : -1;
      if (relIdx < 0) { newSiblings.push(t2); }
      else { newSiblings.splice(relPosition === 'before' ? relIdx : relIdx + 1, 0, t2); }
      await reassignTaskPositions(newSiblings);
      await ensureOnTeam(p, assigneeResource);
    }
    await recalcAndPersist(p);
    showToast(idx!=null?'Task updated':'Task added'); closeModal(); if (window.switchPTab) window.switchPTab('tasks');
  };
}

// To-do assignment is individual-only -- unlike task assignees, a to-do
// has no meaning assigned to a team, since its whole point is to show up
// in one specific person's My Tasks.
function openTodoModal(pid, idx) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var todo = idx != null ? p.todos[idx] : null;
  var pool = canEdit(p) ? individualResourceNames() : p.team.filter(function(n){ return individualResourceNames().indexOf(n) >= 0; });
  if (todo && todo.assignee && pool.indexOf(todo.assignee) < 0) pool = pool.concat([todo.assignee]);

  var selectedAssignee = todo ? (todo.assignee || '') : '';
  var assigneePickerOpen = false;
  var assigneeQuery = '';

  function assigneePanelHtml() {
    var q = assigneeQuery.trim().toLowerCase();
    var matches = pool.filter(function(n){ return n.toLowerCase().indexOf(q) >= 0; });
    var rows = matches.map(function(n){
      var isInactiveCurrent = todo && todo.assignee === n && individualResourceNames().indexOf(n) < 0;
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">' +
        '<span style="font-size:13px"><i class="ti ti-user" style="margin-right:6px;color:#888"></i>' + n + (isInactiveCurrent ? ' <span class="text-muted">(no longer a resource)</span>' : '') + '</span>' +
        '<button type="button" class="btn btn-sm" onclick="window.__todoAssigneePick(\'' + n.replace(/'/g,"\\'") + '\')">Select</button>' +
        '</div>';
    }).join('');
    return '<div style="border:1px solid #e8e8e5;border-radius:8px;padding:10px;margin-top:8px">' +
      '<button type="button" class="btn btn-sm" style="margin-bottom:8px" onclick="window.__todoAssigneePick(\'\')"><i class="ti ti-user-off"></i> Unassigned</button>' +
      '<input type="text" id="tdm-assignee-search" placeholder="Search people…" value="' + assigneeQuery.replace(/"/g,'&quot;') + '" oninput="window.__todoAssigneeSearch(this.value)">' +
      '<div style="max-height:180px;overflow-y:auto;margin-top:8px">' + (rows || '<span class="text-muted" style="font-size:13px">No matches</span>') + '</div>' +
      '</div>';
  }

  function assigneeFieldInner() {
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="font-size:13px' + (selectedAssignee ? '' : ';color:#999') + '">' + (selectedAssignee || 'Unassigned') + '</span>' +
      '<button type="button" class="btn btn-sm" onclick="window.__todoAssigneeToggle()">' + (selectedAssignee ? 'Change' : 'Assign') + '</button>' +
      '</div>' +
      (assigneePickerOpen ? assigneePanelHtml() : '');
  }

  window.__todoAssigneeToggle = function() {
    assigneePickerOpen = !assigneePickerOpen;
    assigneeQuery = '';
    document.getElementById('tdm-assignee-field').innerHTML = assigneeFieldInner();
    var s = document.getElementById('tdm-assignee-search');
    if (s) s.focus();
  };
  window.__todoAssigneeSearch = function(val) {
    assigneeQuery = val;
    document.getElementById('tdm-assignee-field').innerHTML = assigneeFieldInner();
    var s = document.getElementById('tdm-assignee-search');
    if (s) { s.focus(); s.selectionStart = s.selectionEnd = s.value.length; }
  };
  window.__todoAssigneePick = function(name) {
    selectedAssignee = name;
    assigneePickerOpen = false;
    document.getElementById('tdm-assignee-field').innerHTML = assigneeFieldInner();
  };

  showModal('<div class="modal-title">' + (todo?'Edit to-do':'Add to-do') + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Title *</div><input type="text" id="tdm-title" value="' + (todo?todo.title:'') + '" placeholder="e.g. Request VPN access for new hire"></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="tdm-desc" rows="3" placeholder="Details, context, links…">' + (todo ? (todo.description||'') : '') + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">Assignee</div><div id="tdm-assignee-field">' + assigneeFieldInner() + '</div></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Status</div><select id="tdm-status">' +
      '<option' + (!todo||todo.status==='Not Started'?' selected':'') + '>Not Started</option>' +
      '<option' + (todo&&todo.status==='In Progress'?' selected':'') + '>In Progress</option>' +
      '<option' + (todo&&todo.status==='Done'?' selected':'') + '>Done</option></select></div>' +
    '<div class="form-group"><div class="form-label">Due date</div><input type="date" id="tdm-due" value="' + (todo?(todo.due||''):'') + '"></div></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="tdm-save"><i class="ti ti-check"></i> ' + (todo?'Save changes':'Add to-do') + '</button></div>');

  document.getElementById('tdm-save').onclick = async function() {
    var title = document.getElementById('tdm-title').value.trim();
    if (!title) { showToast('Title required'); return; }
    var newVals = {
      title: title, description: document.getElementById('tdm-desc').value.trim(),
      assignee: selectedAssignee, status: document.getElementById('tdm-status').value,
      due: document.getElementById('tdm-due').value
    };
    var btn = document.getElementById('tdm-save'); btn.disabled = true;
    var assigneeResource = resolveResource(newVals.assignee);

    if (idx != null) {
      var fieldLabels = {title:'Title',description:'Description',assignee:'Assignee',status:'Status',due:'Due date'};
      var changes = [];
      ['title','description','assignee','status','due'].forEach(function(f){
        if ((todo[f]||'') !== (newVals[f]||'')) changes.push(fieldLabels[f] + ': "' + (todo[f]||'—') + '" → "' + (newVals[f]||'—') + '"');
      });
      var result = await sb.from('todo_items').update({
        title: newVals.title, description: newVals.description || null, assignee_id: assigneeResource ? assigneeResource.id : null,
        assignee_name: newVals.assignee || null, status: newVals.status, due_date: newVals.due || null
      }).eq('id', todo.id);
      if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
      todo.title = newVals.title; todo.description = newVals.description; todo.assignee = newVals.assignee; todo.assigneeId = assigneeResource ? assigneeResource.id : null;
      todo.status = newVals.status; todo.due = newVals.due;
      todo.log = todo.log || [];
      if (changes.length) todo.log.push(await writeLog('todo_log', 'todo_id', todo.id, 'Updated', changes.join('; ')));
      await ensureOnTeam(p, assigneeResource);
    } else {
      var insertResult = await sb.from('todo_items').insert({
        project_id: pid, title: newVals.title, description: newVals.description || null, assignee_id: assigneeResource ? assigneeResource.id : null,
        assignee_name: newVals.assignee || null, status: newVals.status, due_date: newVals.due || null
      }).select().single();
      if (insertResult.error) { showToast('Could not save: ' + insertResult.error.message); btn.disabled = false; return; }
      var td2 = {
        id: insertResult.data.id, title: newVals.title, description: newVals.description, assignee: newVals.assignee,
        assigneeId: assigneeResource ? assigneeResource.id : null, status: newVals.status, due: newVals.due, log: [], comments: []
      };
      td2.log.push(await writeLog('todo_log', 'todo_id', td2.id, 'Created', ''));
      p.todos.push(td2);
      await ensureOnTeam(p, assigneeResource);
    }
    showToast(idx!=null?'To-do updated':'To-do added'); closeModal(); if (window.switchPTab) window.switchPTab('todos');
  };
}

// Personal to-dos have no project, no team to pick an assignee from, and
// no owner/admin gate -- they're always self-assigned, and managing your
// own is the whole point, so this modal is a much smaller version of
// openTodoModal: no assignee picker at all.
function openPersonalTodoModal(idx) {
  var todo = idx != null ? D.personalTodos[idx] : null;
  // Admins reach this from the Personal To-Dos oversight page too, where
  // "Edit to-do" alone wouldn't say whose it is.
  var isOthers = todo && todo.assigneeId !== D.myResourceId;
  var title = todo ? ('Edit to-do' + (isOthers ? ' (' + (todo.assignee || 'unassigned') + ')' : '')) : 'Add a personal to-do';

  showModal('<div class="modal-title">' + title + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Title *</div><input type="text" id="ptdm-title" value="' + (todo?todo.title:'') + '" placeholder="e.g. Renew certification"></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="ptdm-desc" rows="3" placeholder="Details, links…">' + (todo ? (todo.description||'') : '') + '</textarea></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Status</div><select id="ptdm-status">' +
      '<option' + (!todo||todo.status==='Not Started'?' selected':'') + '>Not Started</option>' +
      '<option' + (todo&&todo.status==='In Progress'?' selected':'') + '>In Progress</option>' +
      '<option' + (todo&&todo.status==='Done'?' selected':'') + '>Done</option></select></div>' +
    '<div class="form-group"><div class="form-label">Due date</div><input type="date" id="ptdm-due" value="' + (todo?(todo.due||''):'') + '"></div></div>' +
    '<div class="modal-footer">' +
      (todo ? '<button class="btn btn-danger" style="margin-right:auto" onclick="closeModal();deletePersonalTodo(' + idx + ')"><i class="ti ti-trash"></i> Delete</button>' : '') +
      '<button class="btn" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" id="ptdm-save"><i class="ti ti-check"></i> ' + (todo?'Save changes':'Add to-do') + '</button></div>');

  document.getElementById('ptdm-save').onclick = async function() {
    var title = document.getElementById('ptdm-title').value.trim();
    if (!title) { showToast('Title required'); return; }
    if (!D.myResourceId) { showToast('Your account isn\'t linked to a resource yet -- ask your PMO Admin to link one before adding personal to-dos'); return; }
    var newVals = {
      title: title, description: document.getElementById('ptdm-desc').value.trim(),
      status: document.getElementById('ptdm-status').value, due: document.getElementById('ptdm-due').value
    };
    var btn = document.getElementById('ptdm-save'); btn.disabled = true;

    if (idx != null) {
      var fieldLabels = {title:'Title',description:'Description',status:'Status',due:'Due date'};
      var changes = [];
      ['title','description','status','due'].forEach(function(f){
        if ((todo[f]||'') !== (newVals[f]||'')) changes.push(fieldLabels[f] + ': "' + (todo[f]||'—') + '" → "' + (newVals[f]||'—') + '"');
      });
      var result = await sb.from('todo_items').update({
        title: newVals.title, description: newVals.description || null, status: newVals.status, due_date: newVals.due || null
      }).eq('id', todo.id);
      if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
      todo.title = newVals.title; todo.description = newVals.description; todo.status = newVals.status; todo.due = newVals.due;
      todo.log = todo.log || [];
      if (changes.length) todo.log.push(await writeLog('todo_log', 'todo_id', todo.id, 'Updated', changes.join('; ')));
    } else {
      var myResource = D.resources.find(function(r){ return r.id === D.myResourceId; });
      var insertResult = await sb.from('todo_items').insert({
        project_id: null, title: newVals.title, description: newVals.description || null,
        assignee_id: D.myResourceId, assignee_name: myResource ? myResource.name : null,
        status: newVals.status, due_date: newVals.due || null
      }).select().single();
      if (insertResult.error) { showToast('Could not save: ' + insertResult.error.message); btn.disabled = false; return; }
      var td2 = {
        id: insertResult.data.id, title: newVals.title, description: newVals.description,
        assignee: myResource ? myResource.name : '', assigneeId: D.myResourceId, status: newVals.status, due: newVals.due,
        log: [], comments: []
      };
      td2.log.push(await writeLog('todo_log', 'todo_id', td2.id, 'Created', ''));
      D.personalTodos.push(td2);
    }
    showToast(idx!=null?'To-do updated':'To-do added'); closeModal(); refreshTaskView();
  };
}

async function deletePersonalTodo(idx) {
  var td = D.personalTodos[idx];
  if (!td) return;
  // Admins browsing Personal To-Dos delete other people's items too, so
  // name whose it is -- on your own My Tasks it's always obviously yours.
  var confirmMsg = td.assigneeId === D.myResourceId
    ? 'Delete "' + td.title + '"?'
    : 'Delete "' + td.title + '" (' + (td.assignee || 'unassigned') + ')?';
  if (!confirm(confirmMsg)) return;
  var result = await sb.from('todo_items').delete().eq('id', td.id);
  if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
  D.personalTodos.splice(idx, 1);
  refreshTaskView();
  showToast('To-do deleted');
}

function openRaidModal(pid, type, idx) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var isEdit = idx != null;
  var item = isEdit ? p.raid[type][idx] : null;
  var label = {risks:'Risk',assumptions:'Assumption',issues:'Issue',dependencies:'Dependency'}[type];
  // owner: project members; with option to add
  var ownerPool = p.team.slice();
  if (item && item.owner && ownerPool.indexOf(item.owner) < 0) ownerPool = ownerPool.concat([item.owner]);
  var ownerOpts = '<option value="">— Select —</option>' + ownerPool.map(function(n){
    var isInactiveCurrent = item && item.owner === n && p.team.indexOf(n) < 0;
    return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (item && item.owner===n?' selected':'') + '>' + n + (isInactiveCurrent ? ' (no longer on the team)' : '') + '</option>';
  }).join('') +
    '<option value="__add__">+ Add member to project…</option>';
  var extra = '';
  if (type === 'risks') {
    extra = '<div class="grid-2">' +
      '<div class="form-group"><div class="form-label">Probability (%)</div><input type="number" id="rd-prob" min="0" max="100" value="' + (item ? item.probability : 50) + '"></div>' +
      '<div class="form-group"><div class="form-label">Impact</div><select id="rd-impact">' + IMPACTS.map(function(s){ return '<option' + (item && item.impact===s ? ' selected' : (!item && s==='Medium' ? ' selected':'')) + '>' + s + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<div class="form-group"><div class="form-label">Status</div><select id="rd-status">' + RISK_STATUSES.map(function(s){ return '<option' + (item && item.status===s ? ' selected' : (!item && s==='Open' ? ' selected':'')) + '>' + s + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><div class="form-label">Mitigation</div><textarea id="rd-mit" placeholder="Describe mitigation plan…" rows="3">' + (item ? (item.mitigation||'') : '') + '</textarea></div>';
  }
  if (type === 'issues')       extra = '<div class="form-group"><div class="form-label">Severity</div><select id="rd-sev"><option' + (item && item.severity==='High'?' selected':'') + '>High</option><option' + (!item || item.severity==='Medium'?' selected':'') + '>Medium</option><option' + (item && item.severity==='Low'?' selected':'') + '>Low</option></select></div>' +
    '<div class="form-group"><div class="form-label">Status</div><select id="rd-issuest"><option' + (!item || item.status==='Open'?' selected':'') + '>Open</option><option' + (item && item.status==='Closed'?' selected':'') + '>Closed</option></select></div>' +
    '<div class="form-group"><div class="form-label">Solution</div><textarea id="rd-sol" placeholder="Describe the solution or resolution plan…" rows="3">' + (item ? (item.solution||'') : '') + '</textarea></div>';
  if (type === 'dependencies') extra = '<div class="form-group"><div class="form-label">Status</div><select id="rd-depst"><option' + (!item || item.status==='Pending'?' selected':'') + '>Pending</option><option' + (item && item.status==='Active'?' selected':'') + '>Active</option><option' + (item && item.status==='Resolved'?' selected':'') + '>Resolved</option></select></div>';

  showModal('<div class="modal-title">' + (isEdit?'Edit ':'Add ') + label + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Description *</div><textarea id="rd-desc" placeholder="Describe this ' + label.toLowerCase() + '…">' + (item ? item.desc : '') + '</textarea></div>' +
    '<div class="form-group" id="rd-owner-group"><div class="form-label">Owner</div><select id="rd-owner" onchange="handleOwnerChange(\'' + pid + '\')">' + ownerOpts + '</select></div>' +
    extra +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="rd-save"><i class="ti ti-check"></i> ' + (isEdit?'Save changes':'Add ' + label) + '</button></div>', true);

  window.handleOwnerChange = function(pid2) {
    var sel = document.getElementById('rd-owner');
    var existingPanel = document.getElementById('rd-add-member-panel');
    if (existingPanel) existingPanel.remove();
    if (sel.value !== '__add__') return;

    var pr2 = D.projects.find(function(x){ return x.id === pid2; });
    var candidates = individualResourceNames().filter(function(n){ return pr2.team.indexOf(n) < 0; });
    var listHtml = candidates.length
      ? candidates.map(function(n) {
          return '<div class="rd-add-member-row" data-name="' + n.toLowerCase() + '" style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">' +
            '<span style="font-size:13px">' + n + '</span>' +
            '<button class="btn btn-sm" onclick="raidAddMemberDirect(\'' + pid2 + '\',\'' + n.replace(/'/g,"\\'") + '\')"><i class="ti ti-plus"></i> Add</button>' +
          '</div>';
        }).join('')
      : '<span class="text-muted" style="font-size:13px">Everyone is already on the project team</span>';

    var panelHtml = '<div class="card" id="rd-add-member-panel" style="margin-top:8px;background:#fafaf8">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
        '<div class="form-label" style="margin-bottom:0">Add someone to the project</div>' +
        '<button class="btn btn-sm" onclick="cancelRaidAddMember()"><i class="ti ti-x"></i></button>' +
      '</div>' +
      '<input type="text" id="rd-add-member-search" placeholder="Search people…" oninput="filterRaidAddMemberList(this.value)">' +
      '<div id="rd-add-member-list" style="max-height:200px;overflow-y:auto;margin-top:8px">' + listHtml + '</div>' +
    '</div>';

    document.getElementById('rd-owner-group').insertAdjacentHTML('afterend', panelHtml);
    var searchEl = document.getElementById('rd-add-member-search');
    if (searchEl) searchEl.focus();
  };

  window.filterRaidAddMemberList = function(query) {
    var q = query.trim().toLowerCase();
    document.querySelectorAll('#rd-add-member-list .rd-add-member-row').forEach(function(row) {
      row.style.display = row.getAttribute('data-name').indexOf(q) >= 0 ? 'flex' : 'none';
    });
  };

  window.cancelRaidAddMember = function() {
    var panel = document.getElementById('rd-add-member-panel');
    if (panel) panel.remove();
    var sel = document.getElementById('rd-owner');
    if (sel && sel.value === '__add__') sel.value = '';
  };

  window.raidAddMemberDirect = async function(pid2, personName) {
    var pr2 = D.projects.find(function(x){ return x.id === pid2; });
    var res = resolveResource(personName);
    if (!res) { showToast('Could not find that person as a resource'); return; }
    var result = await sb.from('resource_projects').insert({ project_id: pid2, resource_id: res.id });
    if (result.error) { showToast('Could not add member: ' + result.error.message); return; }
    pr2.team.push(personName); pr2.teamIds.push(res.id);
    addNotif(personName, 'You have been added to project "' + pr2.name + '".', 'team');
    showToast(personName + ' added to project');

    var panel = document.getElementById('rd-add-member-panel');
    if (panel) panel.remove();
    var sel = document.getElementById('rd-owner');
    if (sel) {
      sel.innerHTML = '<option value="">— Select —</option>' +
        pr2.team.map(function(n){ return '<option' + (n===personName?' selected':'') + '>' + n + '</option>'; }).join('') +
        '<option value="__add__">+ Add member to project…</option>';
    }
  };

  document.getElementById('rd-save').onclick = async function() {
    var desc = document.getElementById('rd-desc').value.trim();
    if (!desc){ showToast('Description required'); return; }
    var owner = document.getElementById('rd-owner').value;
    if (owner === '__add__') owner = '';
    var btn = document.getElementById('rd-save'); btn.disabled = true;
    var dbType = { risks:'risk', assumptions:'assumption', issues:'issue', dependencies:'dependency' }[type];

    if (isEdit) {
      var fieldLabels = { desc:'Description', owner:'Owner', probability:'Probability', impact:'Impact', status:'Status', mitigation:'Mitigation', severity:'Severity', solution:'Solution' };
      var newVals = { desc:desc, owner:owner };
      if (type==='risks') { newVals.probability = parseInt(document.getElementById('rd-prob').value)||0; newVals.impact = document.getElementById('rd-impact').value; newVals.status = document.getElementById('rd-status').value; newVals.mitigation = document.getElementById('rd-mit').value; }
      else if (type==='issues') { newVals.severity = document.getElementById('rd-sev').value; newVals.status = document.getElementById('rd-issuest').value; newVals.solution = document.getElementById('rd-sol').value; }
      else if (type==='dependencies') { newVals.status = document.getElementById('rd-depst').value; }

      var changes = [];
      Object.keys(newVals).forEach(function(f){
        var oldV = item[f] != null ? item[f].toString() : '';
        var newV = newVals[f] != null ? newVals[f].toString() : '';
        if (oldV !== newV) changes.push((fieldLabels[f]||f) + ': "' + (oldV||'—') + (f==='probability'&&oldV!==''?'%':'') + '" → "' + (newV||'—') + (f==='probability'&&newV!==''?'%':'') + '"');
      });

      var dbUpdate = { description: newVals.desc, owner_name: newVals.owner || null };
      if (newVals.probability !== undefined) dbUpdate.probability = newVals.probability;
      if (newVals.impact !== undefined) dbUpdate.impact = newVals.impact;
      if (newVals.mitigation !== undefined) dbUpdate.mitigation = newVals.mitigation;
      if (newVals.severity !== undefined) dbUpdate.severity = newVals.severity;
      if (newVals.solution !== undefined) dbUpdate.solution = newVals.solution;
      if (newVals.status !== undefined) dbUpdate.status = newVals.status;

      var result = await sb.from('raid_items').update(dbUpdate).eq('id', item.id);
      if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
      Object.keys(newVals).forEach(function(f){ item[f] = newVals[f]; });
      if (changes.length) item.log.push(await writeLog('raid_log', 'raid_item_id', item.id, 'Updated', changes.join('; ')));
      showToast(label + ' updated');
    } else {
      var record = { project_id: pid, type: dbType, description: desc, owner_name: owner || null };
      if (type==='risks')   { record.probability = parseInt(document.getElementById('rd-prob').value)||0; record.impact = document.getElementById('rd-impact').value; record.status = document.getElementById('rd-status').value; record.mitigation = document.getElementById('rd-mit').value; }
      else if (type==='issues')       { record.severity = document.getElementById('rd-sev').value; record.status = document.getElementById('rd-issuest').value; record.solution = document.getElementById('rd-sol').value; }
      else if (type==='dependencies') { record.status = document.getElementById('rd-depst').value; }

      var insertResult = await sb.from('raid_items').insert(record).select().single();
      if (insertResult.error) { showToast('Could not save: ' + insertResult.error.message); btn.disabled = false; return; }
      var n = { id: insertResult.data.id, desc: desc, owner: owner, log: [] };
      if (type==='risks')        { n.probability = record.probability; n.impact = record.impact; n.status = record.status; n.mitigation = record.mitigation; }
      else if (type==='issues')       { n.severity = record.severity; n.status = record.status; n.solution = record.solution; }
      else if (type==='dependencies') { n.status = record.status; }
      n.log.push(await writeLog('raid_log', 'raid_item_id', n.id, 'Created', ''));
      p.raid[type].push(n);
      showToast(label + ' added');
    }
    closeModal(); if (window.switchPTab) window.switchPTab('raid');
  };
}

// ── Document modal ─────────────────────────────────────────────────────────────

function openDocModal(pid, idx) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  p.documents = p.documents || [];
  p.docFolders = (p.docFolders && p.docFolders.length) ? p.docFolders : ['General'];
  var isEdit = idx != null;
  var d = isEdit ? p.documents[idx] : null;
  var catOpts = DOC_TYPES.concat(['Other']).map(function(c){ return '<option' + (d && d.category===c ? ' selected' : '') + '>' + c + '</option>'; }).join('');
  var defaultFolder = d ? (d.folder||'General') : (docFolderState[pid] && docFolderState[pid] !== 'All' ? docFolderState[pid] : 'General');
  var folderOpts = p.docFolders.map(function(f){ return '<option' + (defaultFolder===f?' selected':'') + '>' + f + '</option>'; }).join('') + '<option value="__new__">+ New folder…</option>';

  showModal('<div class="modal-title">' + (isEdit?'Edit document':'Add document') + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="grid-2">' +
    '<div class="form-group"><div class="form-label">Document type</div><select id="dm-cat">' + catOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Folder</div><select id="dm-folder" onchange="handleDocFolderChange(\'' + pid + '\')">' + folderOpts + '</select></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Name *</div><input type="text" id="dm-name" value="' + (d ? d.name : '') + '" placeholder="e.g. Project Charter v1"></div>' +
    '<div class="form-group"><div class="form-label">Link URL *</div><input type="text" id="dm-url" value="' + (d ? d.url : '') + '" placeholder="https://…"></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="dm-save"><i class="ti ti-check"></i> ' + (isEdit?'Save changes':'Add document') + '</button></div>', true);

  window.handleDocFolderChange = async function(pid2) {
    var sel = document.getElementById('dm-folder');
    if (sel.value === '__new__') {
      var name = prompt('New folder name:');
      var pr2 = D.projects.find(function(x){ return x.id === pid2; });
      if (name && name.trim()) {
        name = name.trim();
        pr2.docFolders = pr2.docFolders && pr2.docFolders.length ? pr2.docFolders : ['General'];
        if (pr2.docFolders.indexOf(name) < 0) {
          var folderResult = await sb.from('doc_folders').insert({ project_id: pid2, name: name }).select().single();
          if (folderResult.error) { showToast('Could not create folder: ' + folderResult.error.message); sel.value = pr2.docFolders[0] || 'General'; return; }
          pr2.docFolders.push(name);
          pr2.docFolderIds = pr2.docFolderIds || {};
          pr2.docFolderIds[name] = folderResult.data.id;
        }
        var newOpts = pr2.docFolders.map(function(f){ return '<option' + (f===name?' selected':'') + '>' + f + '</option>'; }).join('') + '<option value="__new__">+ New folder…</option>';
        sel.innerHTML = newOpts;
      } else {
        sel.value = pr2.docFolders[0] || 'General';
      }
    }
  };

  document.getElementById('dm-save').onclick = async function() {
    var name = document.getElementById('dm-name').value.trim();
    if (!name) { showToast('Document name required'); return; }
    var cat = document.getElementById('dm-cat').value;
    var folder = document.getElementById('dm-folder').value;
    if (folder === '__new__') folder = 'General';
    var src = 'link';
    var url = document.getElementById('dm-url').value.trim();
    if (!url) { showToast('Enter a link URL'); return; }
    var folderId = (folder === 'General') ? null : ((p.docFolderIds && p.docFolderIds[folder]) || null);
    var btn = document.getElementById('dm-save'); btn.disabled = true;

    if (isEdit) {
      var result = await sb.from('documents').update({
        category: cat, name: name, source_type: src, url: url, folder_id: folderId
      }).eq('id', d.id);
      if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
      d.name = name; d.category = cat; d.sourceType = src; d.url = url; d.folder = folder;
      showToast('Document updated');
    } else {
      var insertResult = await sb.from('documents').insert({
        project_id: pid, category: cat, name: name, source_type: src, url: url, folder_id: folderId, added_by: D.currentProfile.id
      }).select().single();
      if (insertResult.error) { showToast('Could not save: ' + insertResult.error.message); btn.disabled = false; return; }
      p.documents.push({ id: insertResult.data.id, category:cat, name:name, sourceType:src, url:url, folder:folder, dateAdded: insertResult.data.added_at });
      showToast('Document added');
    }
    closeModal(); if (window.switchPTab) window.switchPTab('documentation');
  };
}

function openMoveDocModal(pid, idx) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var d = p.documents[idx];
  p.docFolders = (p.docFolders && p.docFolders.length) ? p.docFolders : ['General'];
  var folderOpts = p.docFolders.map(function(f){ return '<option' + ((d.folder||'General')===f?' selected':'') + '>' + f + '</option>'; }).join('') + '<option value="__new__">+ New folder…</option>';

  showModal('<div class="modal-title">Move "' + d.name + '" <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Move to folder</div><select id="mv-folder" onchange="handleMoveFolderChange(\'' + pid + '\')">' + folderOpts + '</select></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="mv-save"><i class="ti ti-check"></i> Move</button></div>');

  window.handleMoveFolderChange = async function(pid2) {
    var sel = document.getElementById('mv-folder');
    if (sel.value === '__new__') {
      var name = prompt('New folder name:');
      var pr2 = D.projects.find(function(x){ return x.id === pid2; });
      if (name && name.trim()) {
        name = name.trim();
        pr2.docFolders = pr2.docFolders && pr2.docFolders.length ? pr2.docFolders : ['General'];
        if (pr2.docFolders.indexOf(name) < 0) {
          var folderResult = await sb.from('doc_folders').insert({ project_id: pid2, name: name }).select().single();
          if (folderResult.error) { showToast('Could not create folder: ' + folderResult.error.message); sel.value = pr2.docFolders[0] || 'General'; return; }
          pr2.docFolders.push(name);
          pr2.docFolderIds = pr2.docFolderIds || {};
          pr2.docFolderIds[name] = folderResult.data.id;
        }
        var newOpts = pr2.docFolders.map(function(f){ return '<option' + (f===name?' selected':'') + '>' + f + '</option>'; }).join('') + '<option value="__new__">+ New folder…</option>';
        sel.innerHTML = newOpts;
      } else {
        sel.value = pr2.docFolders[0] || 'General';
      }
    }
  };

  document.getElementById('mv-save').onclick = async function() {
    var folder = document.getElementById('mv-folder').value;
    if (folder === '__new__') folder = 'General';
    var folderId = (folder === 'General') ? null : ((p.docFolderIds && p.docFolderIds[folder]) || null);
    var btn = document.getElementById('mv-save'); btn.disabled = true;
    var result = await sb.from('documents').update({ folder_id: folderId }).eq('id', d.id);
    if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
    d.folder = folder;
    docFolderState[pid] = folder;
    showToast('Document moved to "' + folder + '"');
    closeModal(); if (window.switchPTab) window.switchPTab('documentation');
  };
}

// ── Information tab: inline per-section editing ─────────────────────────────
// Each category panel on the Information tab edits and saves itself in place
// (Edit -> form -> Save/Cancel), rather than opening the general-purpose
// editProject() modal below -- that modal, and the financials one, are kept
// only for the handful of entry points outside the project detail page
// (Prioritize Backlog, a request's linked-project summary) that still need
// a quick edit without navigating over to Information.

window.savePeopleRoles = async function(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var beforeSnapshot = { sponsor: p.sponsor, owner: p.owner, ownerId: p.ownerId, requirementsOwner: p.requirementsOwner };
  var sponsorName = document.getElementById('pp-sponsor').value;
  var sponsorResource = resolveResource(sponsorName);
  var ownerName = document.getElementById('pp-owner').value;
  var ownerResource = resolveResource(ownerName);
  var reqOwnerName = document.getElementById('pp-reqowner').value;
  var reqOwnerResource = resolveResource(reqOwnerName);
  var newVals = {
    sponsor: sponsorName || null, sponsor_resource_id: sponsorResource ? sponsorResource.id : null,
    owner_id: ownerResource ? ownerResource.id : null, owner_name: ownerName || null,
    requirements_owner_id: reqOwnerResource ? reqOwnerResource.id : null, requirements_owner_name: reqOwnerName || null
  };
  var btn = document.getElementById('pp-save'); if (btn) btn.disabled = true;
  var result = await sb.from('projects').update(newVals).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); if (btn) btn.disabled = false; return; }
  p.sponsor = newVals.sponsor; p.sponsorResourceId = newVals.sponsor_resource_id;
  p.owner = ownerName || ''; p.ownerId = newVals.owner_id;
  p.requirementsOwner = reqOwnerName || ''; p.requirementsOwnerId = newVals.requirements_owner_id;
  peopleEditing = false;
  showToast('Saved'); pgProjectDetail(pid, 'team');

  try {
    await logProjectChanges(pid, beforeSnapshot, {
      sponsor: newVals.sponsor, owner: ownerName || null, requirementsOwner: reqOwnerName || null
    }, 'edit');
  } catch (e) { console.error('Could not record change history:', e); }
  if (p.ownerId !== beforeSnapshot.ownerId) {
    try { await applyOwnerAsLead(p); } catch (e) { console.error('Could not set owner as Owner/Lead:', e); }
  }
};

window.saveProjectIdentity = async function(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var beforeSnapshot = { name: p.name, priority: p.priority, value: p.value, tshirtSize: p.tshirtSize, businessUnit: p.businessUnit, deliveryMethodology: p.deliveryMethodology, description: p.description };
  var newVals = {
    name: document.getElementById('pfi-name').value.trim() || p.name,
    description: document.getElementById('pfi-desc').value,
    priority: document.getElementById('pfi-priority').value || null,
    value_area: document.getElementById('pfi-value').value || null,
    tshirt_size: document.getElementById('pfi-tshirt').value || null,
    business_unit: document.getElementById('pfi-bu').value || null,
    delivery_methodology: document.getElementById('pfi-methodology').value || null
  };
  var catCbs = document.querySelectorAll('.pfi-category-cb');
  var newCats = Array.from(catCbs).filter(function(cb){ return cb.checked; }).map(function(cb){ return cb.value; });
  var oldCats = p.categories || [];

  var btn = document.getElementById('pf-save'); if (btn) btn.disabled = true;
  var result = await sb.from('projects').update(newVals).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); if (btn) btn.disabled = false; return; }

  p.name = newVals.name; p.description = newVals.description; p.priority = newVals.priority; p.value = newVals.value_area;
  p.tshirtSize = newVals.tshirt_size; p.businessUnit = newVals.business_unit; p.deliveryMethodology = newVals.delivery_methodology;
  p.categories = newCats;
  projectInfoEditing = null;
  showToast('Saved'); pgProjectDetail(pid, 'overview');

  try {
    await logProjectChanges(pid, beforeSnapshot, {
      name: newVals.name, description: newVals.description, priority: newVals.priority, value: newVals.value_area,
      tshirtSize: newVals.tshirt_size, businessUnit: newVals.business_unit, deliveryMethodology: newVals.delivery_methodology
    }, 'edit');
  } catch (e) { console.error('Could not record change history:', e); }

  try {
    var catsToAdd = newCats.filter(function(c){ return oldCats.indexOf(c) < 0; });
    var catsToRemove = oldCats.filter(function(c){ return newCats.indexOf(c) < 0; });
    if (catsToAdd.length) await sb.from('project_categories').insert(catsToAdd.map(function(c){ return { project_id: pid, category: c }; }));
    for (var ci = 0; ci < catsToRemove.length; ci++) { await sb.from('project_categories').delete().eq('project_id', pid).eq('category', catsToRemove[ci]); }
  } catch (e) { console.error('Could not sync categories:', e); }
};

window.saveProjectSchedule = async function(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var beforeSnapshot = { stage: p.stage, status: p.status, phase: p.phase, start: p.start, end: p.end };
  var newVals = {
    status: document.getElementById('pfs-status').value || null,
    phase: document.getElementById('pfs-phase').value || null,
    start_date: document.getElementById('pfs-start').value || null,
    end_date: document.getElementById('pfs-end').value || null
  };

  // If this project is still in backlog or planned, editing in real dates should
  // move it forward automatically, rather than leaving it stranded until someone
  // separately reschedules or reloads the page.
  if (p.stage === 'backlog' || p.stage === 'planned') {
    var newStage = computeStageFromDates(newVals.start_date, newVals.end_date);
    if (newStage !== p.stage) {
      newVals.stage = newStage;
      if (newStage !== 'backlog' && !p.plannedStart) newVals.planned_start = newVals.start_date;
    }
  }

  var btn = document.getElementById('pf-save'); if (btn) btn.disabled = true;
  var result = await sb.from('projects').update(newVals).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); if (btn) btn.disabled = false; return; }

  if (newVals.stage) { p.stage = newVals.stage; if (newVals.planned_start) p.plannedStart = newVals.planned_start; }
  p.status = newVals.status; p.phase = newVals.phase; p.start = newVals.start_date; p.end = newVals.end_date;
  projectInfoEditing = null;
  showToast('Saved'); pgProjectDetail(pid, 'overview');

  try {
    await logProjectChanges(pid, beforeSnapshot, {
      status: newVals.status, phase: newVals.phase, start: newVals.start_date, end: newVals.end_date, stage: newVals.stage || beforeSnapshot.stage
    }, 'edit');
  } catch (e) { console.error('Could not record change history:', e); }
};

window.saveProjectProgress = async function(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var beforeSnapshot = { progress: p.progress, health: p.health, blockers: p.blockers };
  var newVals = {
    progress: parseInt(document.getElementById('pfp-progress').value) || 0,
    health: document.getElementById('pfp-health').value || null,
    blockers: document.getElementById('pfp-blocker').value
  };
  var btn = document.getElementById('pf-save'); if (btn) btn.disabled = true;
  var result = await sb.from('projects').update(newVals).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); if (btn) btn.disabled = false; return; }

  p.progress = newVals.progress; p.health = newVals.health; p.blockers = newVals.blockers;
  projectInfoEditing = null;
  showToast('Saved'); pgProjectDetail(pid, 'overview');

  try {
    await logProjectChanges(pid, beforeSnapshot, { progress: newVals.progress, health: newVals.health, blockers: newVals.blockers }, 'edit');
  } catch (e) { console.error('Could not record change history:', e); }
};

window.saveProjectFinancials = async function(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var estType = document.getElementById('pff-type').value || null;
  var estAmountRaw = document.getElementById('pff-amount').value.trim();
  var costAmountRaw = document.getElementById('pff-cost-amount').value.trim();
  if ((estAmountRaw && isNaN(Number(estAmountRaw))) || (costAmountRaw && isNaN(Number(costAmountRaw)))) {
    document.getElementById('pff-err').style.display = 'block'; return;
  }
  var btn = document.getElementById('pf-save'); if (btn) btn.disabled = true;
  var updates = {
    estimated_type: estType,
    estimated_frequency: estAmountRaw ? document.getElementById('pff-freq').value : null,
    estimated_amount: estAmountRaw ? Number(estAmountRaw) : null,
    value_confidence: document.getElementById('pff-value-confidence').value || null,
    cost_estimate: costAmountRaw ? Number(costAmountRaw) : null,
    cost_confidence: document.getElementById('pff-cost-confidence').value || null
  };
  // Deliberately not logged via logProjectChanges: the general Change Log tab
  // is visible to anyone who can see the project, regardless of financial
  // permission, so logging dollar figures there would leak them.
  var result = await sb.from('projects').update(updates).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); if (btn) btn.disabled = false; return; }
  p.estimatedType = updates.estimated_type; p.estimatedFrequency = updates.estimated_frequency;
  p.estimatedAmount = updates.estimated_amount; p.valueConfidence = updates.value_confidence;
  p.costEstimate = updates.cost_estimate; p.costConfidence = updates.cost_confidence;
  projectInfoEditing = null;
  showToast('Financial detail updated'); pgProjectDetail(pid, 'overview');
};

// ── Edit / New Project ─────────────────────────────────────────────────────────

function editProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  if (!canEdit(p)) { showToast('You do not have edit access'); return; }
  var statusOpts = (STATUSES.indexOf(p.status) < 0 ? '<option value="" selected>— Not set —</option>' : '') + STATUSES.map(function(s){ return '<option' + (p.status===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var phaseOpts  = (PHASES.indexOf(p.phase) < 0 ? '<option value="" selected>— Not set —</option>' : '') + PHASES.map(function(s){   return '<option' + (p.phase===s?' selected':'') + '>' + s + '</option>'; }).join('');
  // No recognized priority yet defaults to "Needs prioritization" rather than
  // a blank "Not set" placeholder; an existing valid value is always kept.
  var priorOpts  = PRIORITIES.map(function(s){
    var isSelected = p.priority === s || (PRIORITIES.indexOf(p.priority) < 0 && s === 'Needs prioritization');
    return '<option' + (isSelected ? ' selected' : '') + '>' + s + '</option>';
  }).join('');
  var valOpts    = (VALUE_AREAS.indexOf(p.value) < 0 ? '<option value="" selected>— Not set —</option>' : '') + VALUE_AREAS.map(function(s){ return '<option' + (p.value===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var ownerPoolEdit = p.owner && individualResourceNames().indexOf(p.owner) < 0 ? individualResourceNames().concat([p.owner]) : individualResourceNames();
  var ownerOpts     = '<option value="">— None —</option>' + ownerPoolEdit.map(function(n){
    var isInactiveCurrent = p.owner===n && individualResourceNames().indexOf(n) < 0;
    return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (p.owner===n?' selected':'') + '>' + n + (isInactiveCurrent ? ' (no longer a resource)' : '') + '</option>';
  }).join('');
  var sponsorPoolEdit = p.sponsor && individualResourceNames().indexOf(p.sponsor) < 0 ? individualResourceNames().concat([p.sponsor]) : individualResourceNames();
  var sponsorOpts     = '<option value="">— None —</option>' + sponsorPoolEdit.map(function(n){
    var isUnlinkedCurrent = p.sponsor===n && individualResourceNames().indexOf(n) < 0;
    return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (p.sponsor===n?' selected':'') + '>' + n + (isUnlinkedCurrent ? ' (not linked to a resource)' : '') + '</option>';
  }).join('');
  var catCheckboxes = CATEGORIES.map(function(s){
    var checked = (p.categories||[]).indexOf(s) >= 0;
    return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;font-size:13px"><input type="checkbox" class="ep-category-cb" value="' + s + '"' + (checked?' checked':'') + '> ' + s + '</label>';
  }).join('');
  var buOpts     = '<option value="">— None —</option>' + BUSINESS_UNITS.map(function(s){ return '<option' + (p.businessUnit===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var programOptsEdit = '<option value="">— None —</option>' + D.programs.slice().sort(function(a,b){ return a.programNumber - b.programNumber; }).map(function(pr){ return '<option value="' + pr.id + '"' + (p.programId===pr.id?' selected':'') + '>' + programLabel(pr) + ' — ' + pr.name + '</option>'; }).join('');
  var unplannedDepsEdit = (p.dependencies||[]).filter(function(d){ return !(d.start && d.end); });
  var depWarningEdit = unplannedDepsEdit.length
    ? '<div class="info-banner info-amber" style="margin-bottom:16px"><i class="ti ti-alert-triangle" style="font-size:20px;flex-shrink:0;color:#BA7517"></i>' +
      '<span>This project depends on ' + (unplannedDepsEdit.length===1 ? 'a project' : unplannedDepsEdit.length + ' projects') + ' that ' + (unplannedDepsEdit.length===1?'hasn\'t':'haven\'t') + ' been planned yet: <strong>' + unplannedDepsEdit.map(function(d){ return d.name; }).join(', ') + '</strong>.</span></div>'
    : '';
  showModal('<div class="modal-title">Edit project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    depWarningEdit +
    '<div class="form-group"><div class="form-label">Project name</div><input type="text" id="ep-name" value="' + p.name + '"></div>' +
    '<div class="grid-2">' +
      '<div class="form-group"><div class="form-label">Status</div><select id="ep-status">' + statusOpts + '</select></div>' +
      '<div class="form-group"><div class="form-label">Phase</div><select id="ep-phase">' + phaseOpts + '</select></div>' +
      '<div class="form-group"><div class="form-label">Priority</div><select id="ep-priority">' + priorOpts + '</select></div>' +
      '<div class="form-group"><div class="form-label">Value area</div><select id="ep-value">' + valOpts + '</select></div>' +
      '<div class="form-group"><div class="form-label">Delivery methodology</div><select id="ep-methodology"><option value=""' + (!p.deliveryMethodology?' selected':'') + '>Not selected</option><option' + (p.deliveryMethodology==='Agile'?' selected':'') + '>Agile</option><option' + (p.deliveryMethodology==='Waterfall'?' selected':'') + '>Waterfall</option><option' + (p.deliveryMethodology==='Hybrid'?' selected':'') + '>Hybrid</option></select></div>' +
      '<div class="form-group"><div class="form-label">T-shirt size</div><select id="ep-tshirt"><option value=""' + (!p.tshirtSize?' selected':'') + '>— Not sized —</option>' + TSHIRT_SIZES.map(function(s){ return '<option' + (p.tshirtSize===s?' selected':'') + '>' + s + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><div class="form-label">Start date</div><input type="date" id="ep-start" value="' + p.start + '"></div>' +
      '<div class="form-group"><div class="form-label">Target end</div><input type="date" id="ep-end" value="' + p.end + '"></div>' +
      '<div class="form-group"><div class="form-label">Progress (%)</div><input type="number" id="ep-progress" value="' + p.progress + '" min="0" max="100"></div>' +
      '<div class="form-group"><div class="form-label">Health</div><select id="ep-health"><option value=""' + (!p.health?' selected':'') + '>— Not set —</option><option value="green"' + (p.health==='green'?' selected':'') + '>Green</option><option value="amber"' + (p.health==='amber'?' selected':'') + '>Amber</option><option value="red"' + (p.health==='red'?' selected':'') + '>Red</option></select></div>' +
      '<div class="form-group"><div class="form-label">Business unit</div><select id="ep-bu">' + buOpts + '</select></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Categories</div><div>' + catCheckboxes + '</div></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="ep-desc">' + (p.description||'') + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">Current blocker (leave blank if none)</div><input type="text" id="ep-blocker" value="' + (p.blockers||'') + '"></div>' +
    '<div class="divider"></div>' +
    '<div class="grid-2">' +
    '<div class="form-group"><div class="form-label">Sponsor</div>' + (D.role === 'admin' ? '<select id="ep-sponsor">' + sponsorOpts + '</select>' : '<div style="padding:8px 0;color:#444">' + (p.sponsor || '—') + '<div class="form-sub" style="margin-top:2px">Only a PMO Admin can reassign the sponsor</div></div>') + '</div>' +
    '<div class="form-group"><div class="form-label">Owner</div>' + (D.role === 'admin' ? '<select id="ep-owner">' + ownerOpts + '</select>' : '<div style="padding:8px 0;color:#444">' + (p.owner || '—') + '<div class="form-sub" style="margin-top:2px">Only a PMO Admin can reassign the owner</div></div>') + '</div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Program</div><select id="ep-program">' + programOptsEdit + '</select></div>' +
    '<div class="modal-footer">' +
      (D.role === 'admin' ? '<button class="btn btn-danger" onclick="deleteProject(\'' + p.id + '\')"><i class="ti ti-trash"></i> Delete</button>' : '') +
      '<button class="btn" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="saveProject(\'' + p.id + '\')"><i class="ti ti-check"></i> Save changes</button>' +
    '</div>', true);
}

async function saveProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var beforeSnapshot = {
    name: p.name, stage: p.stage, status: p.status, phase: p.phase, priority: p.priority, value: p.value,
    businessUnit: p.businessUnit, sponsor: p.sponsor, owner: p.owner, ownerId: p.ownerId, start: p.start, end: p.end,
    progress: p.progress, health: p.health, description: p.description, blockers: p.blockers,
    deliveryMethodology: p.deliveryMethodology, tshirtSize: p.tshirtSize
  };
  var newVals = {
    name: document.getElementById('ep-name').value,
    status: document.getElementById('ep-status').value || null,
    phase: document.getElementById('ep-phase').value || null,
    priority: document.getElementById('ep-priority').value || null,
    value_area: document.getElementById('ep-value').value || null,
    delivery_methodology: document.getElementById('ep-methodology').value || null,
    tshirt_size: document.getElementById('ep-tshirt').value || null,
    start_date: document.getElementById('ep-start').value || null,
    end_date: document.getElementById('ep-end').value || null,
    progress: parseInt(document.getElementById('ep-progress').value) || 0,
    health: document.getElementById('ep-health').value || null,
    description: document.getElementById('ep-desc').value,
    blockers: document.getElementById('ep-blocker').value
  };
  var buEl = document.getElementById('ep-bu'); if (buEl) newVals.business_unit = buEl.value || null;
  var spEl = document.getElementById('ep-sponsor');
  var sponsorResource = spEl ? resolveResource(spEl.value) : null;
  if (spEl) { newVals.sponsor = spEl.value || null; newVals.sponsor_resource_id = sponsorResource ? sponsorResource.id : null; }
  var pmEl = document.getElementById('ep-owner');
  var ownerResource = pmEl ? resolveResource(pmEl.value) : null;
  if (pmEl) { newVals.owner_id = ownerResource ? ownerResource.id : null; newVals.owner_name = pmEl.value || null; }
  var programEl = document.getElementById('ep-program');
  if (programEl) newVals.program_id = programEl.value || null;

  // If this project is still in backlog or planned, editing in real dates should
  // move it forward automatically, rather than leaving it stranded until someone
  // separately reschedules or reloads the page.
  var newStage = p.stage;
  if (p.stage === 'backlog' || p.stage === 'planned') {
    newStage = computeStageFromDates(newVals.start_date, newVals.end_date);
    if (newStage !== p.stage) {
      newVals.stage = newStage;
      if (newStage !== 'backlog' && !p.plannedStart) newVals.planned_start = newVals.start_date;
    }
  }

  // Read the category checkboxes now, before the modal (and its DOM) goes away.
  var catCbs = document.querySelectorAll('.ep-category-cb');
  var newCats = catCbs.length ? Array.from(catCbs).filter(function(cb){ return cb.checked; }).map(function(cb){ return cb.value; }) : null;
  var oldCats = p.categories || [];

  var saveBtn = document.querySelector('.modal-footer .btn-primary'); if (saveBtn) saveBtn.disabled = true;
  var result = await sb.from('projects').update(newVals).eq('id', pid).select().single();
  if (result.error || !result.data) {
    showToast('Could not save: ' + (result.error ? result.error.message : 'no project was updated - you may not have permission to edit this project'));
    if (saveBtn) saveBtn.disabled = false;
    return;
  }

  // The row is saved at this point - everything below (audit log, category
  // sync) is best-effort. A failure in either must never make a successful
  // save look like it silently didn't happen, so local state, the success
  // toast, and the page re-render all happen first and don't depend on them.
  if (newVals.stage) { p.stage = newVals.stage; if (newVals.planned_start) p.plannedStart = newVals.planned_start; }

  p.name = newVals.name; p.status = newVals.status; p.phase = newVals.phase; p.priority = newVals.priority;
  p.value = newVals.value_area; p.start = newVals.start_date; p.end = newVals.end_date; p.progress = newVals.progress;
  p.deliveryMethodology = newVals.delivery_methodology;
  p.tshirtSize = newVals.tshirt_size;
  p.health = newVals.health; p.description = newVals.description; p.blockers = newVals.blockers;
  if (buEl) p.businessUnit = newVals.business_unit;
  if (spEl) { p.sponsor = newVals.sponsor; p.sponsorResourceId = newVals.sponsor_resource_id; }
  if (pmEl) { p.owner = pmEl.value; p.ownerId = newVals.owner_id; }
  if (programEl) p.programId = newVals.program_id;
  if (newCats) p.categories = newCats;

  closeModal(); showToast('Project saved');
  if (currentPage === 'projectDetail') pgProjectDetail(pid, 'overview'); else if (currentPage==='projects') pgProjects(); else if (currentPage === 'requests') pgRequests(); else pgDashboard();

  try {
    var afterSnapshot = {
      name: newVals.name, status: newVals.status, phase: newVals.phase, priority: newVals.priority, value: newVals.value_area,
      businessUnit: newVals.business_unit, sponsor: newVals.sponsor,
      start: newVals.start_date, end: newVals.end_date, progress: newVals.progress, health: newVals.health,
      description: newVals.description, blockers: newVals.blockers, stage: newVals.stage || beforeSnapshot.stage,
      deliveryMethodology: newVals.delivery_methodology, tshirtSize: newVals.tshirt_size
    };
    if (pmEl) afterSnapshot.owner = newVals.owner_name;
    await logProjectChanges(pid, beforeSnapshot, afterSnapshot, 'edit');
  } catch (e) { console.error('Could not record change history:', e); }

  if (newCats) {
    try {
      var catsToAdd = newCats.filter(function(c){ return oldCats.indexOf(c) < 0; });
      var catsToRemove = oldCats.filter(function(c){ return newCats.indexOf(c) < 0; });
      if (catsToAdd.length) await sb.from('project_categories').insert(catsToAdd.map(function(c){ return { project_id: pid, category: c }; }));
      for (var ci = 0; ci < catsToRemove.length; ci++) { await sb.from('project_categories').delete().eq('project_id', pid).eq('category', catsToRemove[ci]); }
    } catch (e) { console.error('Could not sync categories:', e); }
  }

  if (pmEl && p.ownerId !== beforeSnapshot.ownerId) {
    try { await applyOwnerAsLead(p); } catch (e) { console.error('Could not set owner as Owner/Lead:', e); }
  }
}

async function deleteProject(pid) {
  if (!confirm('Delete this project? An admin can restore it later from Administration → Deleted Items.')) return;
  var result = await sb.from('projects').update({ deleted_at: new Date().toISOString(), deleted_by: D.currentProfile.id }).eq('id', pid);
  if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
  D.projects = D.projects.filter(function(x){ return x.id !== pid; });
  closeModal(); showToast('Project deleted'); renderNav();
  var returnTo = (projectDetailReferrer && projectDetailReferrer !== 'projectDetail') ? projectDetailReferrer : 'dashboard';
  nav(returnTo);
}

function openNewProjectModal() {
  var valOpts = VALUE_AREAS.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  var priorOpts = PRIORITIES.map(function(s){ return '<option' + (s==='Needs prioritization'?' selected':'') + '>' + s + '</option>'; }).join('');
  var ownerOpts = '<option value="">— None —</option>' + individualResourceNames().map(function(n){ return '<option>' + n + '</option>'; }).join('');
  var sponsorOpts = '<option value="">— None —</option>' + individualResourceNames().map(function(n){ return '<option>' + n + '</option>'; }).join('');
  var reqOwnerOpts = '<option value="">— None —</option>' + individualResourceNames().map(function(n){ return '<option>' + n + '</option>'; }).join('');
  var programOpts = '<option value="">— None —</option>' + D.programs.slice().sort(function(a,b){ return a.programNumber - b.programNumber; }).map(function(pr){ return '<option value="' + pr.id + '">' + programLabel(pr) + ' — ' + pr.name + '</option>'; }).join('');
  var catCheckboxesNew = CATEGORIES.map(function(s){ return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;font-size:13px"><input type="checkbox" class="np-category-cb" value="' + s + '"> ' + s + '</label>'; }).join('');
  var buOpts = '<option value="">— None —</option>' + BUSINESS_UNITS.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  showModal('<div class="modal-title">Create new project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Project name *</div><input type="text" id="np-name" placeholder="Project name"></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Value area</div><select id="np-value">' + valOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Priority</div><select id="np-priority">' + priorOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Business unit</div><select id="np-bu">' + buOpts + '</select></div></div>' +
    '<div class="form-group"><div class="form-label">Delivery methodology</div><select id="np-methodology"><option value="" selected>Not selected</option><option>Agile</option><option>Waterfall</option><option>Hybrid</option></select></div>' +
    '<div class="form-sub" style="margin:4px 0">Leave dates blank for a backlog item, or set them now if the timeline is already known — the stage is set automatically based on whether the range has started.</div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Start date</div><input type="date" id="np-start"></div>' +
    '<div class="form-group"><div class="form-label">Target end date</div><input type="date" id="np-end"></div></div>' +
    '<div class="form-group"><div class="form-label">Categories</div><div>' + catCheckboxesNew + '</div></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="np-desc" placeholder="What is this project about?"></textarea></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Sponsor</div><select id="np-sponsor">' + sponsorOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Owner</div><select id="np-owner">' + ownerOpts + '</select></div></div>' +
    '<div class="form-group"><div class="form-label">Requirements owner</div><select id="np-reqowner">' + reqOwnerOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Program</div><select id="np-program">' + programOpts + '</select></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="np-save"><i class="ti ti-plus"></i> Create project</button></div>', true);
  document.getElementById('np-save').onclick = async function() {
    var name = document.getElementById('np-name').value.trim();
    if (!name){ showToast('Project name required'); return; }
    var ownerName = document.getElementById('np-owner').value;
    var ownerResource = resolveResource(ownerName);
    var sponsorName = document.getElementById('np-sponsor').value;
    var sponsorResource = resolveResource(sponsorName);
    var reqOwnerName = document.getElementById('np-reqowner').value;
    var reqOwnerResource = resolveResource(reqOwnerName);
    var programId = document.getElementById('np-program').value || null;
    var btn = document.getElementById('np-save'); btn.disabled = true;

    var selectedCats = Array.from(document.querySelectorAll('.np-category-cb')).filter(function(cb){ return cb.checked; }).map(function(cb){ return cb.value; });
    var startDate = document.getElementById('np-start').value || null;
    var endDate = document.getElementById('np-end').value || null;
    var newStage = computeStageFromDates(startDate, endDate);
    var record = {
      name: name, owner_id: ownerResource ? ownerResource.id : null, owner_name: ownerName || null,
      sponsor: sponsorName || null, sponsor_resource_id: sponsorResource ? sponsorResource.id : null,
      requirements_owner_id: reqOwnerResource ? reqOwnerResource.id : null, requirements_owner_name: reqOwnerName || null,
      program_id: programId,
      business_unit: document.getElementById('np-bu').value || null,
      delivery_methodology: document.getElementById('np-methodology').value || null,
      status: newStage === 'active' ? 'On Track' : 'Not Started', phase: 'Not Started', progress: 0,
      value_area: document.getElementById('np-value').value, priority: document.getElementById('np-priority').value,
      description: document.getElementById('np-desc').value, blockers: '', health: null, stage: newStage,
      start_date: startDate, end_date: endDate, planned_start: newStage !== 'backlog' ? startDate : null
    };
    var result = await sb.from('projects').insert(record).select().single();
    if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }

    if (selectedCats.length) await sb.from('project_categories').insert(selectedCats.map(function(c){ return { project_id: result.data.id, category: c }; }));
    await logProjectChanges(result.data.id, null, {
      name: name, stage: newStage, status: record.status, priority: record.priority, value: record.value_area,
      businessUnit: record.business_unit, sponsor: sponsorName, owner: ownerName, requirementsOwner: reqOwnerName, description: record.description,
      deliveryMethodology: record.delivery_methodology, start: startDate, end: endDate
    }, 'edit');

    var newProject = {
      id: result.data.id, name:name, owner:ownerName, ownerId: ownerResource?ownerResource.id:null,
      sponsor:sponsorName, sponsorResourceId: sponsorResource?sponsorResource.id:null,
      requirementsOwner: reqOwnerName, requirementsOwnerId: reqOwnerResource?reqOwnerResource.id:null, programId: programId,
      categories:selectedCats, businessUnit:record.business_unit, team:[], teamIds:[], teamTiers:{}, teamOverrides:{},
      status:record.status, phase:'Not Started', progress:0, start:startDate||'', end:endDate||'',
      value:record.value_area, priority:record.priority, description:record.description,
      blockers:'', health:null, stage:newStage, plannedStart:record.planned_start||'', requestId:'',
      deliveryMethodology: record.delivery_methodology, projectNumber: result.data.project_number, createdAt: result.data.created_at,
      milestones:[], tasks:[], raid:{risks:[],assumptions:[],issues:[],dependencies:[]},
      documents:[], docFolders:['General'], docFolderIds:{}
    };
    D.projects.push(newProject);
    await applyOwnerAsLead(newProject);
    closeModal(); showToast('Project created');
    nav(currentPage);
  };
}

// ── Roadmap ────────────────────────────────────────────────────────────────────

var holdTagFilter = [];
var holdSearch = '';
var holdCategoryFilter = 'All';

function pgHold() {
  tb('Hold');
  var hp = D.projects.filter(function(p){ return p.stage === 'hold'; });
  var cat = buildCategoryTabs(hp, holdCategoryFilter, 'setHoldCategory');
  holdCategoryFilter = cat.resolvedFilter;
  hp = hp.filter(function(p){ return projectMatchesCategoryTab(p, holdCategoryFilter); });
  if (holdSearch) { var hq = holdSearch.toLowerCase(); hp = hp.filter(function(p){ return p.name.toLowerCase().indexOf(hq) >= 0; }); }
  if (holdTagFilter.length) hp = hp.filter(function(p){ return holdTagFilter.some(function(t){ return (p.tags||[]).indexOf(t) >= 0; }); });
  hp = hp.slice().sort(function(a,b){ return (b.heldAt||'').localeCompare(a.heldAt||''); });

  function scheduleInfo(p) {
    if (p.preHoldStage === 'backlog') return '<span class="text-muted">Was in Backlog — no schedule set yet</span>';
    var start = p.plannedStart || p.start;
    if (!start && !p.end) return '<span class="text-muted">No schedule was set</span>';
    return '<span class="text-muted">Start: </span>' + (start||'TBD') + ' &nbsp; <span class="text-muted">End: </span>' + (p.end||'TBD') + ' ' + lateBadgeHtml(isProjectLate(p), 'Its target end date has passed while still on hold');
  }

  var cards = hp.map(function(p) {
    var heldDate = p.heldAt ? new Date(p.heldAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : 'Unknown date';
    return '<div class="project-card">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">' +
        '<div><div class="bold mb-12">' + p.name + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + bdg(p.priority) + ' ' + badgeIf('badge-purple', p.value) + ' <span class="badge badge-gray">Was: ' + (p.preHoldStage||'—') + '</span></div></div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>' +
          (canEdit(p) ? '<button class="btn btn-success" onclick="resumeFromHold(\'' + p.id + '\')"><i class="ti ti-player-play"></i> Resume</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="grid-2 mt-12" style="font-size:13px">' +
        '<div><span class="text-muted">On hold since: </span>' + heldDate + '</div>' +
        '<div>' + scheduleInfo(p) + '</div>' +
      '</div>' +
      (p.tags && p.tags.length ? '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">' + p.tags.map(function(t){ return tagBadge(t); }).join(' ') + '</div>' : '') +
      '<div class="blocker-note" style="background:#FBE7E3;border-left-color:#993C1D;margin-top:10px"><i class="ti ti-player-pause"></i> <strong>Hold reason:</strong> ' + (p.holdReason||'—') + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('content').innerHTML =
    searchBoxHtml(holdSearch, 'Search projects by name…', 'hold-search', 'onHoldSearch') +
    cat.html +
    tagFilterBarHtml(holdTagFilter, 'openHoldTagFilter') +
    (hp.length ? cards : '<div class="empty-state"><i class="ti ti-player-pause"></i><p>Nothing on hold right now</p></div>');

  window.setHoldCategory = function(c) { holdCategoryFilter = c; pgHold(); };
  window.onHoldSearch = function(v) {
    holdSearch = v; pgHold();
    var el = document.getElementById('hold-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.openHoldTagFilter = function() {
    openFilterModal('Tags', D.tags.map(function(t){ return t.name; }),
      function() { return holdTagFilter; },
      function(val) { var i = holdTagFilter.indexOf(val); if (i>=0) holdTagFilter.splice(i,1); else holdTagFilter.push(val); },
      function() { holdTagFilter = []; },
      pgHold
    );
  };
}

function pgFuturePlanning() {
  tb('Future Planning');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can access Future Planning.</p></div>';
    return;
  }

  var win = computeDateWindow(futurePlanningRangeMode, futurePlanningSelectedYear);
  var quarters = quartersInWindow(win.windowStart, win.windowMonths);
  var needsEstimate = [];
  var missingSchedule = [];

  function quarterIndexOf(quarter, year) {
    for (var i = 0; i < quarters.length; i++) {
      if (quarters[i].quarter === quarter && quarters[i].year === year) return i;
    }
    return -1;
  }
  function quarterIndexClamped(quarter, year) {
    var idx = quarterIndexOf(quarter, year);
    if (idx >= 0) return idx;
    var firstQ = quarters[0], lastQ = quarters[quarters.length - 1];
    var thisAbs = year * 4 + quarter, firstAbs = firstQ.year * 4 + firstQ.quarter, lastAbs = lastQ.year * 4 + lastQ.quarter;
    if (thisAbs < firstAbs) return -0.001;
    if (thisAbs > lastAbs) return quarters.length + 0.001;
    return null;
  }
  function quarterPosition(dateStr) {
    var qi = quarterOfDate(dateStr);
    if (!qi) return null;
    var idx = quarterIndexOf(qi.quarter, qi.year);
    if (idx < 0) {
      var firstQ = quarters[0], lastQ = quarters[quarters.length-1];
      if (qi.year < firstQ.year || (qi.year === firstQ.year && qi.quarter < firstQ.quarter)) return -0.001;
      if (qi.year > lastQ.year || (qi.year === lastQ.year && qi.quarter > lastQ.quarter)) return quarters.length + 0.001;
      return null;
    }
    var d = new Date(dateStr + 'T00:00:00');
    var quarterStart = new Date(qi.year, (qi.quarter - 1) * 3, 1);
    var daysSinceStart = (d - quarterStart) / 86400000;
    var fraction = Math.max(0, Math.min(1, daysSinceStart / 91));
    return idx + fraction;
  }

  var allEntries = [];
  var eligibleProjects = D.projects.filter(function(p){ return p.stage !== 'complete'; });

  // Category tabs — same pattern as Roadmap: a project carrying multiple
  // categories shows up under every one of them.
  var categoriesPresent = [];
  var hasUncategorized = false;
  eligibleProjects.forEach(function(p){
    if (p.categories && p.categories.length) {
      p.categories.forEach(function(c){ if (categoriesPresent.indexOf(c) < 0) categoriesPresent.push(c); });
    } else hasUncategorized = true;
  });
  var tabList = ['All'].concat(categoriesPresent).concat(hasUncategorized ? ['Uncategorized'] : []);
  if (tabList.indexOf(futurePlanningCategoryFilter) < 0) futurePlanningCategoryFilter = 'All';
  var categoryTabsHtml = '<div class="tab-bar" style="margin-bottom:16px">' + tabList.map(function(c) {
    return '<div class="tab' + (futurePlanningCategoryFilter === c ? ' active' : '') + '" onclick="setFuturePlanningCategory(\'' + c.replace(/'/g,"\\'") + '\')">' + c + '</div>';
  }).join('') + '</div>';

  function projectMatchesCategory(p, cat) {
    if (cat === 'All') return true;
    if (cat === 'Uncategorized') return !p.categories || !p.categories.length;
    return p.categories && p.categories.indexOf(cat) >= 0;
  }
  if (futurePlanningCategoryFilter !== 'All') {
    eligibleProjects = eligibleProjects.filter(function(p){ return projectMatchesCategory(p, futurePlanningCategoryFilter); });
  }

  eligibleProjects.forEach(function(p) {
    if (p.start && p.end) {
      var startPos = quarterPosition(p.start);
      var endPos = quarterPosition(p.end);
      if (startPos != null && endPos != null && endPos > 0 && startPos < quarters.length) {
        allEntries.push({ project: p, confirmed: true, startPos: startPos, endPos: endPos });
      }
    } else if (p.stage === 'backlog') {
      if (p.targetQuarter && p.targetYear) {
        var startIdx = quarterIndexClamped(p.targetQuarter, p.targetYear);
        var endQ = p.targetEndQuarter || p.targetQuarter;
        var endY = p.targetEndYear || p.targetYear;
        var endIdxRaw = quarterIndexClamped(endQ, endY);
        var endIdx = (endIdxRaw != null ? endIdxRaw : startIdx) + 1;
        if (startIdx != null && endIdx > 0 && startIdx < quarters.length) {
          allEntries.push({ project: p, confirmed: false, startPos: startIdx, endPos: endIdx });
        }
      } else {
        needsEstimate.push(p);
      }
    } else if (p.stage === 'active' || p.stage === 'planned') {
      missingSchedule.push(p);
    }
  });
  allEntries.sort(function(a,b){ return a.endPos - b.endPos; });

  function timelineRow(entry) {
    var p = entry.project;
    var startPos = entry.startPos, endPos = entry.endPos;
    var hasBar = startPos != null && endPos != null && endPos > 0 && startPos < quarters.length;
    var barHtml;
    if (hasBar) {
      var clampedStart = Math.max(0, startPos);
      var clampedEnd = Math.min(quarters.length, endPos);
      var widthPct = Math.max(0.3, clampedEnd - clampedStart) / quarters.length * 100;
      var leftPct = clampedStart / quarters.length * 100;
      var barStyle = entry.confirmed
        ? 'background:' + (PHASE_COLORS[p.phase] || '#534AB7')
        : 'background:repeating-linear-gradient(45deg,#EFCB8E,#EFCB8E 6px,#FBF0DA 6px,#FBF0DA 12px);border:1px dashed #BA7517;color:#63410A';
      var estimateLabel = 'Estimate';
      if (!entry.confirmed && p.targetQuarter && p.targetYear) {
        var hasRange = p.targetEndQuarter && p.targetEndYear && (p.targetEndQuarter !== p.targetQuarter || p.targetEndYear !== p.targetYear);
        estimateLabel = hasRange ? 'Q' + p.targetQuarter + ' \'' + String(p.targetYear).slice(2) + '–Q' + p.targetEndQuarter + ' \'' + String(p.targetEndYear).slice(2) : 'Estimate';
      }
      var lateNow = isProjectLate(p);
      if (lateNow) barStyle += ';box-shadow:inset 0 0 0 2px #B23A3A';
      var barLabel = entry.confirmed ? (p.phase||'') : estimateLabel;
      barHtml = '<div class="tl-wrap"><div class="tl-bar" style="left:' + leftPct + '%;width:' + widthPct + '%;' + barStyle + '" title="' + (lateNow ? 'Late — ' : '') + barLabel + '">' + (lateNow ? '<i class="ti ti-alert-triangle"></i> ' : '') + barLabel + '</div></div>';
    } else {
      barHtml = '<div class="tl-wrap"><span class="text-muted" style="font-size:12px">Outside this window</span></div>';
    }
    var actionIcons = '<button class="btn btn-sm" style="padding:2px 6px;margin-right:4px" title="View project" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i></button>';
    if (!entry.confirmed) {
      actionIcons += '<button class="btn btn-sm" style="padding:2px 6px;margin-right:4px" title="Change target quarter" onclick="openSetQuarterModal(\'' + p.id + '\')"><i class="ti ti-calendar-time"></i></button>' +
        '<button class="btn btn-sm" style="padding:2px 6px" title="Schedule now" onclick="openScheduleModal(\'' + p.id + '\')"><i class="ti ti-calendar-plus"></i></button>';
    }
    return '<div class="tl-row"><div class="tl-label" title="' + p.name + '">' + actionIcons + p.name + '</div>' + barHtml + '</div>';
  }

  var quarterHeaderHtml = '<div style="display:flex;gap:8px;margin-bottom:10px;padding-left:202px">' + quarters.map(function(q){
    return '<div style="flex:1;font-size:11px;color:#999;text-align:center">Q' + q.quarter + ' \'' + String(q.year).slice(2) + '</div>';
  }).join('') + '</div>';

  var legendHtml = '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:11px;color:#666">' +
    '<div style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:10px;border-radius:2px;background:#534AB7;display:inline-block"></span>Confirmed (real dates)</div>' +
    '<div style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:10px;border-radius:2px;background:repeating-linear-gradient(45deg,#EFCB8E,#EFCB8E 3px,#FBF0DA 3px,#FBF0DA 6px);border:1px dashed #BA7517;display:inline-block"></span>Estimated (quarter only)</div>' +
  '</div>';

  var timelineHtml2 = allEntries.length
    ? '<div class="card mb-16"><div class="section-title" style="margin-bottom:20px">Timeline</div>' + legendHtml + quarterHeaderHtml + allEntries.map(timelineRow).join('') + '</div>'
    : '<div class="empty-state"><i class="ti ti-calendar-time"></i><p>Nothing scheduled or estimated in this window</p></div>';

  var needsEstimateSection = '<div class="card mb-16" style="border:1px solid #EFCB8E"><div class="section-title">Needs an estimate</div>' +
    (needsEstimate.length
      ? needsEstimate.map(function(p){
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;background:#faf9f7;border-radius:8px;margin-bottom:6px">' +
            '<span style="font-size:13px;font-weight:600">' + p.name + '</span>' +
            '<div style="display:flex;gap:6px"><button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>' +
            '<button class="btn btn-sm btn-primary" onclick="openSetQuarterModal(\'' + p.id + '\')"><i class="ti ti-calendar-time"></i> Set target quarter</button>' +
            '<button class="btn btn-sm" onclick="openScheduleModal(\'' + p.id + '\')"><i class="ti ti-calendar-plus"></i> Schedule now</button></div></div>';
        }).join('')
      : '<span class="text-muted" style="font-size:13px">Every backlog project has at least a rough estimate</span>') +
    '</div>';

  var missingScheduleSection = missingSchedule.length
    ? '<div class="card mb-16" style="border:1px solid #F09595"><div class="section-title"><i class="ti ti-alert-triangle" style="color:#A32D2D"></i> Missing a schedule</div>' +
      '<div class="text-muted" style="font-size:13px;margin-bottom:10px">These are marked Active or Planned but have no start or end date — usually from an import. They won\'t show anywhere on a timeline until fixed.</div>' +
      missingSchedule.map(function(p){
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;background:#faf9f7;border-radius:8px;margin-bottom:6px">' +
          '<span style="font-size:13px;font-weight:600">' + p.name + '</span> <span class="badge badge-gray" style="font-size:11px">' + p.stage + '</span>' +
          '<div style="display:flex;gap:6px;margin-left:auto"><button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>' +
          '<button class="btn btn-sm btn-primary" onclick="closeModal();editProject(\'' + p.id + '\')"><i class="ti ti-edit"></i> Edit project</button></div></div>';
      }).join('') +
      '</div>'
    : '';

  document.getElementById('content').innerHTML =
    dateRangeControlHtml(futurePlanningRangeMode, futurePlanningSelectedYear, 'setFuturePlanningRangeMode', 'setFuturePlanningYear') +
    categoryTabsHtml +
    timelineHtml2 +
    needsEstimateSection +
    missingScheduleSection;

  window.setFuturePlanningRangeMode = function(mode) { futurePlanningRangeMode = mode; pgFuturePlanning(); };
  window.setFuturePlanningYear = function(year) { futurePlanningSelectedYear = parseInt(year); pgFuturePlanning(); };
  window.setFuturePlanningCategory = function(cat) { futurePlanningCategoryFilter = cat; pgFuturePlanning(); };


  window.openSetQuarterModal = function(pid) {
    var p = D.projects.find(function(x){ return x.id === pid; });
    var allOpts = buildQuarterOptions();
    var startIdx = (p.targetQuarter && p.targetYear) ? (p.targetYear * 4 + p.targetQuarter) : allOpts[0].idx;
    var endIdx = (p.targetEndQuarter && p.targetEndYear) ? (p.targetEndYear * 4 + p.targetEndQuarter) : startIdx;

    function startOptsHtml() {
      return allOpts.map(function(o){ return '<option value="' + o.idx + '"' + (o.idx === startIdx ? ' selected' : '') + '>' + o.label + '</option>'; }).join('');
    }
    function endOptsHtml() {
      return allOpts.filter(function(o){ return o.idx >= startIdx; }).map(function(o){ return '<option value="' + o.idx + '"' + (o.idx === endIdx ? ' selected' : '') + '>' + o.label + '</option>'; }).join('');
    }

    showModal('<div class="modal-title">Set target quarter <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
      '<div style="font-weight:600;margin-bottom:16px;color:#534AB7">' + p.name + '</div>' +
      '<div class="form-sub" style="margin-bottom:12px">For work spanning more than one quarter, set an end quarter later than the start — only quarters on or after the start are selectable, so the range is always sequential.</div>' +
      '<div class="grid-2"><div class="form-group"><div class="form-label">Start quarter</div><select id="sq-start" onchange="onSqStartChange()">' + startOptsHtml() + '</select></div>' +
      '<div class="form-group"><div class="form-label">End quarter</div><select id="sq-end">' + endOptsHtml() + '</select></div></div>' +
      '<div class="modal-footer">' + (p.targetQuarter ? '<button class="btn btn-danger" onclick="clearTargetQuarter(\'' + pid + '\')">Clear estimate</button>' : '') +
      '<button class="btn" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="saveTargetQuarter(\'' + pid + '\')">Save</button></div>');

    window.onSqStartChange = function() {
      startIdx = parseInt(document.getElementById('sq-start').value);
      if (endIdx < startIdx) endIdx = startIdx;
      document.getElementById('sq-end').innerHTML = endOptsHtml();
    };
  };

  window.saveTargetQuarter = async function(pid) {
    var p = D.projects.find(function(x){ return x.id === pid; });
    var startIdx = parseInt(document.getElementById('sq-start').value);
    var endIdx = parseInt(document.getElementById('sq-end').value);
    var startYear = Math.floor((startIdx - 1) / 4), startQuarter = startIdx - startYear * 4;
    var endYear = Math.floor((endIdx - 1) / 4), endQuarter = endIdx - endYear * 4;
    var result = await sb.from('projects').update({
      target_quarter: startQuarter, target_year: startYear,
      target_end_quarter: endQuarter, target_end_year: endYear
    }).eq('id', pid);
    if (result.error) { showToast('Could not save: ' + result.error.message); return; }
    p.targetQuarter = startQuarter; p.targetYear = startYear; p.targetEndQuarter = endQuarter; p.targetEndYear = endYear;
    closeModal(); showToast('Target quarter set'); pgFuturePlanning();
  };

  window.clearTargetQuarter = async function(pid) {
    var p = D.projects.find(function(x){ return x.id === pid; });
    var result = await sb.from('projects').update({ target_quarter: null, target_year: null, target_end_quarter: null, target_end_year: null }).eq('id', pid);
    if (result.error) { showToast('Could not clear: ' + result.error.message); return; }
    p.targetQuarter = null; p.targetYear = null; p.targetEndQuarter = null; p.targetEndYear = null;
    closeModal(); showToast('Estimate cleared'); pgFuturePlanning();
  };
}

function pgRoadmap() {
  tb('Roadmap');
  var win = computeDateWindow(roadmapRangeMode, roadmapSelectedYear);
  var windowStart = win.windowStart;
  var windowMonths = win.windowMonths;
  var monthLabels = [];
  for (var mi = 0; mi < windowMonths; mi++) {
    var md = new Date(windowStart.getFullYear(), windowStart.getMonth() + mi, 1);
    monthLabels.push(md.toLocaleString('en-US', { month: 'short' }) + (md.getMonth() === 0 ? " '" + String(md.getFullYear()).slice(2) : ''));
  }
  var windowEndLabel = new Date(windowStart.getFullYear(), windowStart.getMonth() + windowMonths - 1, 1);
  var rangeLabel = windowStart.toLocaleString('en-US', { month: 'long', year: 'numeric' }) + ' – ' + windowEndLabel.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  function monthsFromWindowStart(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    var yearDiff = d.getFullYear() - windowStart.getFullYear();
    var monthDiff = d.getMonth() - windowStart.getMonth();
    var dayFrac = (d.getDate() - 1) / 30.44;
    return yearDiff * 12 + monthDiff + dayFrac;
  }

  var all = D.projects.filter(function(p){ return p.stage==='active'||p.stage==='planned'; });

  // Category tabs — built from whichever categories actually appear, plus an
  // Uncategorized bucket only if something would actually land there.
  // A project carrying multiple categories shows up under every one of them.
  var categoriesPresent = [];
  var hasUncategorized = false;
  all.forEach(function(p){
    if (p.categories && p.categories.length) {
      p.categories.forEach(function(c){ if (categoriesPresent.indexOf(c) < 0) categoriesPresent.push(c); });
    } else hasUncategorized = true;
  });
  var tabList = ['All'].concat(categoriesPresent).concat(hasUncategorized ? ['Uncategorized'] : []);
  if (tabList.indexOf(roadmapCategoryFilter) < 0) roadmapCategoryFilter = 'All';
  var categoryTabsHtml = '<div class="tab-bar" style="margin-bottom:16px">' + tabList.map(function(c) {
    return '<div class="tab' + (roadmapCategoryFilter === c ? ' active' : '') + '" onclick="setRoadmapCategory(\'' + c.replace(/'/g,"\\'") + '\')">' + c + '</div>';
  }).join('') + '</div>';

  function projectMatchesCategory(p, cat) {
    if (cat === 'All') return true;
    if (cat === 'Uncategorized') return !p.categories || !p.categories.length;
    return p.categories && p.categories.indexOf(cat) >= 0;
  }
  var visibleProjects = roadmapCategoryFilter === 'All' ? all : all.filter(function(p){ return projectMatchesCategory(p, roadmapCategoryFilter); });
  if (roadmapTagFilter.length) visibleProjects = visibleProjects.filter(function(p){ return roadmapTagFilter.some(function(t){ return (p.tags||[]).indexOf(t) >= 0; }); });
  visibleProjects = visibleProjects.slice().sort(function(a,b){
    if (!a.end && !b.end) return 0;
    if (!a.end) return 1;
    if (!b.end) return -1;
    return a.end < b.end ? -1 : a.end > b.end ? 1 : 0;
  });

  function projectBarRow(p) {
    var startOffset = monthsFromWindowStart(p.start);
    var endOffset = monthsFromWindowStart(p.end);
    var hasBar = startOffset !== null && endOffset !== null && endOffset > 0 && startOffset < windowMonths;
    var barHtml;
    if (hasBar) {
      var clampedStart = Math.max(0, startOffset);
      var clampedEnd = Math.min(windowMonths, endOffset);
      var widthPct = Math.max(1, clampedEnd - clampedStart) / windowMonths * 100;
      var leftPct = clampedStart / windowMonths * 100;
      var barColor = PHASE_COLORS[p.phase] || '#534AB7';
      barHtml = '<div class="tl-wrap"><div class="tl-bar" style="left:' + leftPct + '%;width:' + widthPct + '%;background:' + barColor + '">' + (p.phase||'') + '</div></div>';
    } else {
      barHtml = '<div class="tl-wrap"><span class="text-muted" style="font-size:12px">No schedule set</span></div>';
    }
    return '<div class="tl-row"><div class="tl-label" title="' + p.name + '">' +
      '<button class="btn btn-sm" style="padding:2px 6px;margin-right:6px" title="View project" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i></button>' +
      p.name + '</div>' + barHtml + '</div>';
  }

  var phaseLegend = '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">' + PHASES.map(function(ph){
    return '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#666"><span style="width:10px;height:10px;border-radius:3px;background:' + (PHASE_COLORS[ph]||'#534AB7') + ';display:inline-block"></span>' + ph + '</div>';
  }).join('') + '</div>';

  var timelineBody;
  if (!visibleProjects.length) {
    timelineBody = '<div class="text-muted">No projects in this view</div>';
  } else if (roadmapCategoryFilter === 'All') {
    var groups = {};
    visibleProjects.forEach(function(p){
      var keys = (p.categories && p.categories.length) ? p.categories : ['Uncategorized'];
      keys.forEach(function(key){ (groups[key] = groups[key] || []).push(p); });
    });
    var groupOrder = categoriesPresent.concat(hasUncategorized ? ['Uncategorized'] : []);
    timelineBody = groupOrder.filter(function(g){ return groups[g] && groups[g].length; }).map(function(g) {
      return '<div class="bold" style="margin:14px 0 8px;font-size:13px">' + g + '</div>' + groups[g].map(projectBarRow).join('');
    }).join('');
  } else {
    timelineBody = visibleProjects.map(projectBarRow).join('');
  }

  var msItems = [];
  D.projects.filter(function(p){ return p.stage==='active'; }).forEach(function(p) {
    p.milestones.filter(function(m){ return !m.done; }).forEach(function(m) {
      msItems.push({ project:p.name, milestone:m.name, due:m.date, owner: p.owner || 'Unassigned', late: isMilestoneLate(m), categories: p.categories || [], tags: p.tags || [] });
    });
  });
  if (roadmapCategoryFilter !== 'All') {
    msItems = msItems.filter(function(it){
      return roadmapCategoryFilter === 'Uncategorized' ? !it.categories.length : it.categories.indexOf(roadmapCategoryFilter) >= 0;
    });
  }
  if (roadmapTagFilter.length) {
    msItems = msItems.filter(function(it){ return roadmapTagFilter.some(function(t){ return it.tags.indexOf(t) >= 0; }); });
  }

  var st = roadmapMsState;
  function msArrow(col) {
    if (st.sort !== col) return '';
    return '<span class="sort-arrow">' + (st.dir === 'asc' ? '▲' : '▼') + '</span>';
  }
  var projectChoices = [];
  msItems.forEach(function(it){ if (projectChoices.indexOf(it.project) < 0) projectChoices.push(it.project); });
  var ownerChoices = [];
  msItems.forEach(function(it){ if (ownerChoices.indexOf(it.owner) < 0) ownerChoices.push(it.owner); });
  ownerChoices.sort();

  function msFilterIcon(col, active) {
    return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleMsFilterPanel(\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>';
  }

  var msSearchBar = '<div class="task-filter-bar"><input type="text" id="ms-search" placeholder="Search milestones…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onMsSearch(this.value)"></div>';

  var msList = msItems.slice();
  if (st.search) { var q = st.search.toLowerCase(); msList = msList.filter(function(it){ return it.milestone.toLowerCase().indexOf(q) >= 0; }); }
  if (st.fProject.length) msList = msList.filter(function(it){ return st.fProject.indexOf(it.project) >= 0; });
  if (st.fOwner.length) msList = msList.filter(function(it){ return st.fOwner.indexOf(it.owner) >= 0; });
  if (st.sort) {
    msList.sort(function(a,b){
      var av = (a[st.sort]||'').toString(), bv = (b[st.sort]||'').toString();
      if (av < bv) return st.dir === 'asc' ? -1 : 1;
      if (av > bv) return st.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  var msRows = msList.map(function(it) {
    return '<tr><td class="bold">' + it.project + '</td><td>' + it.milestone + '</td><td class="text-muted">' + it.due + ' ' + lateBadgeHtml(it.late) + '</td><td class="text-muted">' + it.owner + '</td></tr>';
  }).join('');

  var msHeader = '<tr>' +
    '<th class="sortable-th"><span onclick="setMsSort(\'project\')">Project ' + msArrow('project') + '</span>' + msFilterIcon('fProject', st.fProject.length>0) + '</th>' +
    '<th class="sortable-th" onclick="setMsSort(\'milestone\')">Milestone ' + msArrow('milestone') + '</th>' +
    '<th class="sortable-th" onclick="setMsSort(\'due\')">Due ' + msArrow('due') + '</th>' +
    '<th class="sortable-th"><span onclick="setMsSort(\'owner\')">Owner ' + msArrow('owner') + '</span>' + msFilterIcon('fOwner', st.fOwner.length>0) + '</th>' +
    '</tr>';
  document.getElementById('content').innerHTML =
    dateRangeControlHtml(roadmapRangeMode, roadmapSelectedYear, 'setRoadmapRangeMode', 'setRoadmapYear') +
    categoryTabsHtml +
    tagFilterBarHtml(roadmapTagFilter, 'openRoadmapTagFilter') +
    '<div class="card mb-16"><div class="section-title" style="margin-bottom:20px">' + windowMonths + '-month view — ' + rangeLabel + '</div>' +
    phaseLegend +
    '<div style="display:flex;gap:8px;margin-bottom:10px;padding-left:202px">' + monthLabels.map(function(m){ return '<div style="flex:1;font-size:11px;color:#999;text-align:center">' + m + '</div>'; }).join('') + '</div>' +
    timelineBody + '</div>' +
    '<div class="card"><div class="section-title">Upcoming milestones</div>' + msSearchBar +
    (msItems.length
      ? (msList.length ? '<div class="table-wrap"><table><thead>' + msHeader + '</thead><tbody>' + msRows + '</tbody></table></div>' : '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No milestones match your filters</p></div>')
      : '<div class="empty-state" style="padding:24px"><i class="ti ti-flag"></i><p>No upcoming milestones</p></div>') +
    '</div>';

  window.setRoadmapCategory = function(cat) { roadmapCategoryFilter = cat; pgRoadmap(); };
  window.setRoadmapRangeMode = function(mode) { roadmapRangeMode = mode; pgRoadmap(); };
  window.setRoadmapYear = function(year) { roadmapSelectedYear = parseInt(year); pgRoadmap(); };
  window.openRoadmapTagFilter = function() {
    openFilterModal('Tags', D.tags.map(function(t){ return t.name; }),
      function() { return roadmapTagFilter; },
      function(val) { var i = roadmapTagFilter.indexOf(val); if (i>=0) roadmapTagFilter.splice(i,1); else roadmapTagFilter.push(val); },
      function() { roadmapTagFilter = []; },
      pgRoadmap
    );
  };
  window.setMsSort = function(col) {
    if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; }
    pgRoadmap();
  };
  window.onMsSearch = function(val) {
    st.search = val;
    pgRoadmap();
    var el = document.getElementById('ms-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.toggleMsFilterPanel = function(col) {
    var label = col === 'fProject' ? 'Project' : 'Owner';
    var choices = col === 'fProject' ? projectChoices : ownerChoices;
    openFilterModal(label, choices,
      function() { return st[col] || []; },
      function(val) { var arr = st[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { st[col] = []; },
      pgRoadmap
    );
  };
}

// ── Resources ──────────────────────────────────────────────────────────────────

// ── Import Projects (Excel) ──────────────────────────────────────────────────

var importState = { rows: null, profilesByEmail: null };

function formatDateCell(val) {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  var s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

function matchOneOf(val, options) {
  if (!val) return null;
  var s = String(val).trim().toLowerCase();
  for (var i = 0; i < options.length; i++) {
    if (options[i].toLowerCase() === s) return options[i];
  }
  return undefined; // signals "provided but didn't match"
}

function validateImportRow(row, profilesByEmail) {
  var errors = [];
  var name = String(row['Project Name'] || '').trim();
  if (!name) errors.push('Missing Project Name');

  var stageRaw = row['Stage'];
  var stage = stageRaw ? matchOneOf(stageRaw, ['Backlog','Planned','Active','Complete','Hold']) : 'Backlog';
  if (stage === undefined) errors.push('Stage "' + stageRaw + '" is not one of Backlog/Planned/Active/Complete/Hold');

  var priorityRaw = row['Priority'];
  var priority = priorityRaw ? matchOneOf(priorityRaw, ['Critical','High','Medium','Low']) : null;
  if (priority === undefined) errors.push('Priority "' + priorityRaw + '" is not one of Critical/High/Medium/Low');

  var categoryRaw = String(row['Category'] || '').trim();
  var categoryPieces = categoryRaw ? categoryRaw.split(',').map(function(c){ return c.trim(); }).filter(Boolean) : [];
  var categories = [];
  categoryPieces.forEach(function(piece){
    var matched = matchOneOf(piece, CATEGORIES);
    if (matched === undefined) errors.push('Category "' + piece + '" is not a recognized category');
    else if (matched && categories.indexOf(matched) < 0) categories.push(matched);
  });

  var statusRaw = row['Status'];
  var status = statusRaw ? matchOneOf(statusRaw, STATUSES) : null;
  if (status === undefined) errors.push('Status "' + statusRaw + '" is not a recognized status');

  var phaseRaw = row['Phase'];
  var phase = phaseRaw ? matchOneOf(phaseRaw, PHASES) : null;
  if (phase === undefined) errors.push('Phase "' + phaseRaw + '" is not a recognized phase');

  var startDate = formatDateCell(row['Start Date']);
  if (row['Start Date'] && !startDate) errors.push('Start Date "' + row['Start Date'] + '" could not be read');
  var endDate = formatDateCell(row['Target End Date']);
  if (row['Target End Date'] && !endDate) errors.push('Target End Date "' + row['Target End Date'] + '" could not be read');

  var progress = row['Progress %'] !== '' && row['Progress %'] != null ? parseInt(row['Progress %']) : 0;
  if (isNaN(progress)) progress = 0;
  progress = Math.max(0, Math.min(100, progress));

  var ownerEmail = String(row['Owner Email'] || '').trim().toLowerCase();
  var ownerResource = ownerEmail ? profilesByEmail[ownerEmail] : null;

  var tagNames = String(row['Tags'] || '').split(',').map(function(t){ return t.trim(); }).filter(Boolean);

  var quarterRaw = String(row['Target Quarter'] || '').trim();
  var yearRaw = String(row['Target Year'] || '').trim();
  var targetQuarter = null, targetYear = null;
  if (quarterRaw || yearRaw) {
    var qMatch = quarterRaw.match(/^Q?([1-4])$/i);
    if (!qMatch) {
      errors.push('Target Quarter "' + quarterRaw + '" should be Q1, Q2, Q3, or Q4');
    } else {
      targetQuarter = parseInt(qMatch[1]);
    }
    if (!/^\d{4}$/.test(yearRaw)) {
      errors.push('Target Year "' + yearRaw + '" should be a 4-digit year');
    } else {
      targetYear = parseInt(yearRaw);
    }
    if ((stage || 'Backlog').toLowerCase() !== 'backlog') {
      errors.push('Target Quarter/Year can only be set on Backlog-stage projects');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    tags: tagNames,
    categories: categories,
    record: {
      name: name,
      sponsor: row['Sponsor'] || null,
      owner_id: ownerResource ? ownerResource.id : null,
      owner_name: ownerResource ? ownerResource.name : (ownerEmail || null),
      business_unit: row['Business Unit'] || null,
      stage: (stage || 'Backlog').toLowerCase(),
      status: status || null,
      phase: phase || null,
      priority: priority || null,
      value_area: row['Value Area'] || null,
      start_date: startDate,
      end_date: endDate,
      progress: progress,
      description: row['Description'] || null,
      blockers: row['Current Blockers'] || null,
      health: null,
      target_quarter: targetQuarter,
      target_year: targetYear
    }
  };
}

function renderImportPreview() {
  var rows = importState.rows;
  var validated = rows.map(function(r){ return validateImportRow(r, importState.profilesByEmail); });
  var validCount = validated.filter(function(v){ return v.valid; }).length;

  var tableRows = validated.map(function(v, idx) {
    return '<tr>' +
      '<td>' + (v.valid ? '<i class="ti ti-circle-check" style="color:#1D9E75"></i>' : '<i class="ti ti-alert-circle" style="color:#A32D2D"></i>') + '</td>' +
      '<td>' + (v.record.name || '<span class="text-muted">(missing)</span>') + '</td>' +
      '<td>' + (v.record.stage || '') + '</td>' +
      '<td>' + (v.record.owner_name || '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (v.categories.length ? v.categories.map(function(c){ return '<span class="badge badge-blue">' + c + '</span>'; }).join(' ') : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (v.tags.length ? v.tags.map(function(t){ return tagBadge(t); }).join(' ') : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (v.record.target_quarter && v.record.target_year ? '<span class="badge badge-amber">Q' + v.record.target_quarter + ' ' + v.record.target_year + '</span>' : '<span class="text-muted">—</span>') + '</td>' +
      '<td style="color:#A32D2D;font-size:12px">' + (v.errors.join('; ') || '') + '</td>' +
      '</tr>';
  }).join('');

  document.getElementById('import-preview').innerHTML =
    '<div class="info-banner ' + (validCount === rows.length ? 'info-blue' : 'info-blue') + '" style="margin-bottom:14px">' +
      '<i class="ti ti-info-circle"></i><div>' + validCount + ' of ' + rows.length + ' rows are ready to import' +
      (validCount < rows.length ? '. Rows with errors will be skipped — fix them in your spreadsheet and re-upload if you want them included.' : '.') +
      '</div></div>' +
    '<div class="table-wrap"><table><thead><tr><th></th><th>Project Name</th><th>Stage</th><th>Owner</th><th>Categories</th><th>Tags</th><th>Target Quarter</th><th>Issues</th></tr></thead><tbody>' + tableRows + '</tbody></table></div>' +
    (validCount > 0 ? '<button class="btn btn-primary mt-12" id="confirm-import-btn"><i class="ti ti-upload"></i> Import ' + validCount + ' project' + (validCount===1?'':'s') + '</button>' : '');

  if (validCount > 0) {
    document.getElementById('confirm-import-btn').onclick = runImport;
  }
}

async function runImport() {
  var btn = document.getElementById('confirm-import-btn');
  btn.disabled = true; btn.textContent = 'Importing…';

  var validated = importState.rows.map(function(r){ return validateImportRow(r, importState.profilesByEmail); });
  var validEntries = validated.filter(function(v){ return v.valid; });
  var records = validEntries.map(function(v){ return v.record; });

  var result = await sb.from('projects').insert(records).select();
  if (result.error) {
    showToast('Import failed: ' + result.error.message);
    btn.disabled = false; btn.textContent = 'Import ' + records.length + ' projects';
    return;
  }

  // Find-or-create each tag mentioned across the import, then link it to
  // the right project — same behavior as the tag picker elsewhere.
  var insertedProjects = result.data;
  var allTagNames = [];
  validEntries.forEach(function(v){ v.tags.forEach(function(t){ if (allTagNames.indexOf(t) < 0) allTagNames.push(t); }); });
  var missingTagNames = allTagNames.filter(function(n){ return !D.tags.some(function(t){ return t.name.toLowerCase() === n.toLowerCase(); }); });
  if (missingTagNames.length) {
    var createResult = await sb.from('tags').insert(missingTagNames.map(function(n){ return { name: n }; })).select();
    if (!createResult.error) {
      createResult.data.forEach(function(t){ D.tags.push({ id: t.id, name: t.name }); });
      D.tags.sort(function(a,b){ return a.name.localeCompare(b.name); });
    }
  }
  var projectTagRows = [];
  insertedProjects.forEach(function(pr, i) {
    validEntries[i].tags.forEach(function(tagName) {
      var tag = D.tags.find(function(t){ return t.name.toLowerCase() === tagName.toLowerCase(); });
      if (tag) projectTagRows.push({ project_id: pr.id, tag_id: tag.id });
    });
  });
  if (projectTagRows.length) await sb.from('project_tags').insert(projectTagRows);

  // Categories are a fixed list (already validated), so this is a simple
  // insert per project — no find-or-create needed like tags.
  var projectCategoryRows = [];
  insertedProjects.forEach(function(pr, i) {
    validEntries[i].categories.forEach(function(cat) {
      projectCategoryRows.push({ project_id: pr.id, category: cat });
    });
  });
  if (projectCategoryRows.length) await sb.from('project_categories').insert(projectCategoryRows);

  showToast(records.length + ' project' + (records.length===1?'':'s') + ' imported');
  importState = { rows: null, profilesByEmail: null };
  await refreshProjects();
  await refreshTags();
  var insertedIds = insertedProjects.map(function(pr){ return pr.id; });
  for (var pi = 0; pi < insertedIds.length; pi++) {
    var importedP = D.projects.find(function(x){ return x.id === insertedIds[pi]; });
    if (importedP) await applyOwnerAsLead(importedP);
  }
  nav('projects');
}

async function handleImportFile(file) {
  document.getElementById('import-preview').innerHTML = '<div class="text-muted" style="padding:12px">Reading file…</div>';

  var resourcesResult = await sb.from('resources').select('id, email, name').eq('type', 'individual');
  var resourcesByEmail = {};
  (resourcesResult.data || []).forEach(function(r){ if (r.email) resourcesByEmail[r.email.toLowerCase()] = r; });
  importState.profilesByEmail = resourcesByEmail;

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      var sheet = wb.Sheets['Projects'] || wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      rows = rows.filter(function(r){ return String(r['Project Name']||'').trim() !== ''; });
      if (!rows.length) {
        document.getElementById('import-preview').innerHTML = '<div class="empty-state" style="padding:24px"><i class="ti ti-file-off"></i><p>No project rows found in that file</p></div>';
        return;
      }
      importState.rows = rows;
      renderImportPreview();
    } catch (err) {
      document.getElementById('import-preview').innerHTML = '<div class="empty-state" style="padding:24px"><i class="ti ti-alert-triangle"></i><p>Could not read that file: ' + err.message + '</p></div>';
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── Import Work Requests (Excel) ─────────────────────────────────────────────
// Brings in work that's already underway or finished, bypassing the New ->
// Accept negotiation entirely -- every imported row lands directly in
// Accepted or Complete status, the same way Import Projects bypasses the
// request/approval workflow for in-flight projects.

var wrImportState = { rows: null, requestersByEmail: null, assigneesByEmail: null };

function validateWorkRequestImportRow(row, requestersByEmail, assigneesByEmail) {
  var errors = [];
  var title = String(row['Title'] || '').trim();
  if (!title) errors.push('Missing Title');

  var requesterEmail = String(row['Requester Email'] || '').trim().toLowerCase();
  var requester = requesterEmail ? requestersByEmail[requesterEmail] : null;
  if (!requesterEmail) errors.push('Missing Requester Email');
  else if (!requester) errors.push('Requester Email "' + requesterEmail + '" does not match an existing user');

  var assigneeEmail = String(row['Assignee Email'] || '').trim().toLowerCase();
  var assignee = assigneeEmail ? assigneesByEmail[assigneeEmail] : null;
  if (!assigneeEmail) errors.push('Missing Assignee Email');
  else if (!assignee) errors.push('Assignee Email "' + assigneeEmail + '" does not match an existing individual resource');

  var statusRaw = String(row['Status'] || '').trim();
  var status = statusRaw ? matchOneOf(statusRaw, ['Accepted','Complete']) : 'Accepted';
  if (status === undefined) errors.push('Status "' + statusRaw + '" must be Accepted or Complete');

  var completionDate = formatDateCell(row['Requested Completion Date']);
  if (row['Requested Completion Date'] && !completionDate) errors.push('Requested Completion Date "' + row['Requested Completion Date'] + '" could not be read');

  var nowIso = new Date().toISOString();
  return {
    valid: errors.length === 0,
    errors: errors,
    requesterName: requester ? requester.display_name : (requesterEmail || '(missing)'),
    assigneeName: assignee ? assignee.name : (assigneeEmail || '(missing)'),
    record: {
      title: title,
      description: row['Description'] || null,
      requester_id: requester ? requester.id : null,
      resource_id: assignee ? assignee.id : null,
      status: status || 'Accepted',
      requested_completion_date: completionDate,
      // The import assumes acceptance, so the requested date doubles as the
      // committed/estimated date -- there's no separate negotiation step to
      // produce a different one.
      estimated_completion_date: completionDate,
      accepted_at: nowIso,
      completed_at: (status || 'Accepted') === 'Complete' ? nowIso : null
    }
  };
}

function renderWorkRequestImportPreview() {
  var rows = wrImportState.rows;
  var validated = rows.map(function(r){ return validateWorkRequestImportRow(r, wrImportState.requestersByEmail, wrImportState.assigneesByEmail); });
  var validCount = validated.filter(function(v){ return v.valid; }).length;

  var tableRows = validated.map(function(v) {
    return '<tr>' +
      '<td>' + (v.valid ? '<i class="ti ti-circle-check" style="color:#1D9E75"></i>' : '<i class="ti ti-alert-circle" style="color:#A32D2D"></i>') + '</td>' +
      '<td>' + (v.record.title || '<span class="text-muted">(missing)</span>') + '</td>' +
      '<td>' + v.requesterName + '</td>' +
      '<td>' + v.assigneeName + '</td>' +
      '<td>' + (v.record.status || '') + '</td>' +
      '<td>' + (v.record.requested_completion_date || '<span class="text-muted">—</span>') + '</td>' +
      '<td style="color:#A32D2D;font-size:12px">' + (v.errors.join('; ') || '') + '</td>' +
      '</tr>';
  }).join('');

  document.getElementById('wr-import-preview').innerHTML =
    '<div class="info-banner info-blue" style="margin-bottom:14px">' +
      '<i class="ti ti-info-circle"></i><div>' + validCount + ' of ' + rows.length + ' rows are ready to import' +
      (validCount < rows.length ? '. Rows with errors will be skipped — fix them in your spreadsheet and re-upload if you want them included.' : '.') +
      '</div></div>' +
    '<div class="table-wrap"><table><thead><tr><th></th><th>Title</th><th>From</th><th>Assigned to</th><th>Status</th><th>Requested completion</th><th>Issues</th></tr></thead><tbody>' + tableRows + '</tbody></table></div>' +
    (validCount > 0 ? '<button class="btn btn-primary mt-12" id="confirm-wr-import-btn"><i class="ti ti-upload"></i> Import ' + validCount + ' work request' + (validCount===1?'':'s') + '</button>' : '');

  if (validCount > 0) document.getElementById('confirm-wr-import-btn').onclick = runWorkRequestImport;
}

async function runWorkRequestImport() {
  var btn = document.getElementById('confirm-wr-import-btn');
  btn.disabled = true; btn.textContent = 'Importing…';

  var validated = wrImportState.rows.map(function(r){ return validateWorkRequestImportRow(r, wrImportState.requestersByEmail, wrImportState.assigneesByEmail); });
  var validEntries = validated.filter(function(v){ return v.valid; });
  var records = validEntries.map(function(v){ return v.record; });

  var result = await sb.from('work_requests').insert(records).select();
  if (result.error) {
    showToast('Import failed: ' + result.error.message);
    btn.disabled = false; btn.textContent = 'Import ' + records.length + ' work request' + (records.length===1?'':'s');
    return;
  }

  showToast(records.length + ' work request' + (records.length===1?'':'s') + ' imported');
  wrImportState = { rows: null, requestersByEmail: null, assigneesByEmail: null };
  D.workRequests = await loadWorkRequests();
  renderNav();
  nav('admin-work-requests');
}

async function handleWorkRequestImportFile(file) {
  document.getElementById('wr-import-preview').innerHTML = '<div class="text-muted" style="padding:12px">Reading file…</div>';

  var lookupResults = await Promise.all([
    sb.from('profiles').select('id, email, display_name'),
    sb.from('resources').select('id, email, name').eq('type', 'individual')
  ]);
  var requestersByEmail = {};
  (lookupResults[0].data || []).forEach(function(p){ if (p.email) requestersByEmail[p.email.toLowerCase()] = p; });
  var assigneesByEmail = {};
  (lookupResults[1].data || []).forEach(function(r){ if (r.email) assigneesByEmail[r.email.toLowerCase()] = r; });
  wrImportState.requestersByEmail = requestersByEmail;
  wrImportState.assigneesByEmail = assigneesByEmail;

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      var sheet = wb.Sheets['Work Requests'] || wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      rows = rows.filter(function(r){ return String(r['Title']||'').trim() !== ''; });
      if (!rows.length) {
        document.getElementById('wr-import-preview').innerHTML = '<div class="empty-state" style="padding:24px"><i class="ti ti-file-off"></i><p>No work request rows found in that file</p></div>';
        return;
      }
      wrImportState.rows = rows;
      renderWorkRequestImportPreview();
    } catch (err) {
      document.getElementById('wr-import-preview').innerHTML = '<div class="empty-state" style="padding:24px"><i class="ti ti-alert-triangle"></i><p>Could not read that file: ' + err.message + '</p></div>';
    }
  };
  reader.readAsArrayBuffer(file);
}

function pgImportWorkRequests() {
  tb('Import Work Requests');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can import work requests.</p></div>';
    return;
  }
  wrImportState = { rows: null, requestersByEmail: null, assigneesByEmail: null };
  document.getElementById('content').innerHTML =
    '<div class="card mb-16">' +
    '<div class="section-title">Bring in existing work requests</div>' +
    '<p class="text-muted" style="font-size:13px;margin-bottom:16px">Use this to add work requests that are already in progress or finished, without sending them through the New/Accept negotiation — every imported row lands directly in Accepted or Complete status.</p>' +
    '<a class="btn btn-sm mb-16" href="pmo-hub-work-request-import-template.xlsx" download><i class="ti ti-download"></i> Download the import template</a>' +
    '<div class="form-group"><div class="form-label">Upload your filled-in template</div><input type="file" id="wr-import-file" accept=".xlsx"></div>' +
    '</div>' +
    '<div id="wr-import-preview"></div>';

  document.getElementById('wr-import-file').addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) handleWorkRequestImportFile(e.target.files[0]);
  });
}

async function callAdminUsersApi(payload) {
  var sessionResult = await sb.auth.getSession();
  var token = sessionResult.data && sessionResult.data.session ? sessionResult.data.session.access_token : null;
  if (!token) { showToast('Your session has expired — please log in again'); return null; }
  payload.accessToken = token;
  var res, json;
  try {
    res = await fetch('/api/admin-users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    json = await res.json();
  } catch (e) { showToast('Could not reach the server: ' + e.message); return null; }
  if (!res.ok) { showToast(json.error || 'Request failed'); return null; }
  return json;
}

function pgAllProjects() {
  var addBtn = D.role === 'admin' ? '<button class="btn btn-primary" onclick="openNewProjectModal()"><i class="ti ti-plus"></i> New project</button>' : '';
  tb('All Projects', addBtn);
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can access All Projects.</p></div>';
    return;
  }
  var st = allProjectsState;

  var sponsorChoices = [], ownerChoices = [];
  D.projects.forEach(function(p) {
    if (p.sponsor && sponsorChoices.indexOf(p.sponsor) < 0) sponsorChoices.push(p.sponsor);
    if (p.owner && ownerChoices.indexOf(p.owner) < 0) ownerChoices.push(p.owner);
  });
  sponsorChoices.sort(); ownerChoices.sort();

  var stageChoices = ['backlog','planned','active','hold','complete'];

  var list = D.projects.slice();
  if (st.search) {
    var q = st.search.toLowerCase();
    list = list.filter(function(p){ return p.name.toLowerCase().indexOf(q) >= 0; });
  }
  if (st.filters.category.length) list = list.filter(function(p){ return st.filters.category.some(function(c){ return (p.categories||[]).indexOf(c) >= 0; }); });
  if (st.filters.businessUnit.length) list = list.filter(function(p){ return st.filters.businessUnit.indexOf(p.businessUnit) >= 0; });
  if (st.filters.stage.length) list = list.filter(function(p){ return st.filters.stage.indexOf(p.stage) >= 0; });
  if (st.filters.status.length) list = list.filter(function(p){ return st.filters.status.indexOf(p.status) >= 0; });
  if (st.filters.phase.length) list = list.filter(function(p){ return st.filters.phase.indexOf(p.phase) >= 0; });
  if (st.filters.priority.length) list = list.filter(function(p){ return st.filters.priority.indexOf(p.priority) >= 0; });
  if (st.filters.value.length) list = list.filter(function(p){ return st.filters.value.indexOf(p.value) >= 0; });
  if (st.filters.sponsor.length) list = list.filter(function(p){ return st.filters.sponsor.indexOf(p.sponsor) >= 0; });
  if (st.filters.owner.length) list = list.filter(function(p){ return st.filters.owner.indexOf(p.owner) >= 0; });

  list.sort(function(a,b) {
    var av = a[st.sort]; var bv = b[st.sort];
    av = (av == null ? '' : av); bv = (bv == null ? '' : bv);
    if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
    var cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return st.dir === 'asc' ? cmp : -cmp;
  });

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir === 'asc' ? '▲' : '▼') + '</span>'; }
  function filterIcon(col, active) { return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleAllProjFilter(\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>'; }

  var visibleIds = list.map(function(p){ return p.id; });
  var selectedVisibleCount = visibleIds.filter(function(id){ return st.selected[id]; }).length;
  var allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  var totalSelected = Object.keys(st.selected).filter(function(id){ return st.selected[id]; }).length;

  var rows = list.map(function(p) {
    return '<tr>' +
      '<td><input type="checkbox" ' + (st.selected[p.id] ? 'checked' : '') + ' onchange="toggleAllProjSelect(\'' + p.id + '\', this.checked)"></td>' +
      '<td class="bold">' + p.name + '</td>' +
      '<td>' + ((p.categories && p.categories.length) ? p.categories.map(function(c){ return '<span class="badge badge-blue">' + c + '</span>'; }).join(' ') : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.businessUnit || '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + stagePill(p.stage) + '</td>' +
      '<td>' + (p.status ? bdg(p.status) : '<span class="text-muted">—</span>') + ' ' + lateBadgeHtml(isProjectLate(p)) + '</td>' +
      '<td>' + (p.phase || '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.priority ? bdg(p.priority) : '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.value || '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.sponsor || '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (p.owner || '<span class="text-muted">—</span>') + '</td>' +
      '<td><button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i></button></td>' +
      '</tr>';
  }).join('');

  document.getElementById('content').innerHTML =
    '<div class="task-filter-bar" style="margin-bottom:12px"><input type="text" id="allproj-search" placeholder="Search projects by name…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onAllProjSearch(this.value)"></div>' +
    (totalSelected > 0
      ? '<div class="info-banner info-blue" style="margin-bottom:12px;display:flex;align-items:center;gap:10px"><i class="ti ti-square-check"></i><div>' + totalSelected + ' selected</div>' +
        '<button class="btn btn-primary" style="margin-left:auto" onclick="openBulkEditModal()"><i class="ti ti-edit"></i> Bulk edit</button>' +
        '<button class="btn" onclick="clearAllProjSelection()">Clear selection</button></div>'
      : '') +
    '<div class="card"><div class="table-wrap"><table><thead><tr>' +
      '<th><input type="checkbox" ' + (allVisibleSelected ? 'checked' : '') + ' onchange="toggleAllProjSelectAll(this.checked)"></th>' +
      '<th class="sortable-th" onclick="setAllProjSort(\'name\')">Project ' + arrow('name') + '</th>' +
      '<th class="sortable-th"><span onclick="setAllProjSort(\'categories\')">Category ' + arrow('categories') + '</span>' + filterIcon('category', st.filters.category.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setAllProjSort(\'businessUnit\')">Business Unit ' + arrow('businessUnit') + '</span>' + filterIcon('businessUnit', st.filters.businessUnit.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setAllProjSort(\'stage\')">Stage ' + arrow('stage') + '</span>' + filterIcon('stage', st.filters.stage.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setAllProjSort(\'status\')">Status ' + arrow('status') + '</span>' + filterIcon('status', st.filters.status.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setAllProjSort(\'phase\')">Phase ' + arrow('phase') + '</span>' + filterIcon('phase', st.filters.phase.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setAllProjSort(\'priority\')">Priority ' + arrow('priority') + '</span>' + filterIcon('priority', st.filters.priority.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setAllProjSort(\'value\')">Value Area ' + arrow('value') + '</span>' + filterIcon('value', st.filters.value.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setAllProjSort(\'sponsor\')">Sponsor ' + arrow('sponsor') + '</span>' + filterIcon('sponsor', st.filters.sponsor.length>0) + '</th>' +
      '<th class="sortable-th"><span onclick="setAllProjSort(\'owner\')">Owner ' + arrow('owner') + '</span>' + filterIcon('owner', st.filters.owner.length>0) + '</th>' +
      '<th></th>' +
    '</tr></thead><tbody>' + (rows || '<tr><td colspan="12" class="text-muted" style="text-align:center;padding:20px">No projects match these filters</td></tr>') + '</tbody></table></div></div>';

  window.onAllProjSearch = function(v) {
    st.search = v; pgAllProjects();
    var el = document.getElementById('allproj-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setAllProjSort = function(col) {
    if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; }
    pgAllProjects();
  };
  window.toggleAllProjSelect = function(id, checked) { st.selected[id] = checked; withScrollPreserved(pgAllProjects); };
  window.toggleAllProjSelectAll = function(checked) { visibleIds.forEach(function(id){ st.selected[id] = checked; }); withScrollPreserved(pgAllProjects); };
  window.clearAllProjSelection = function() { st.selected = {}; withScrollPreserved(pgAllProjects); };

  window.toggleAllProjFilter = function(col) {
    var labelMap = { category:'Category', businessUnit:'Business Unit', stage:'Stage', status:'Status', phase:'Phase', priority:'Priority', value:'Value Area', sponsor:'Sponsor', owner:'Owner' };
    var choicesMap = { category:CATEGORIES, businessUnit:BUSINESS_UNITS, stage:stageChoices, status:STATUSES, phase:PHASES, priority:PRIORITIES, value:VALUE_AREAS, sponsor:sponsorChoices, owner:ownerChoices };
    openFilterModal(labelMap[col], choicesMap[col],
      function() { return st.filters[col]; },
      function(val) { var arr = st.filters[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { st.filters[col] = []; },
      pgAllProjects
    );
  };

  window.openBulkEditModal = function() {
    var selectedIds = Object.keys(st.selected).filter(function(id){ return st.selected[id]; });
    if (!selectedIds.length) return;
    window.__bulkEditSelectedIds = selectedIds;
    var fieldOpts = '<option value="sponsor">Sponsor</option><option value="owner">Owner</option><option value="businessUnit">Business Unit</option>' +
      '<option value="value">Value Area</option><option value="priority">Priority</option><option value="status">Status</option><option value="phase">Phase</option>' +
      '<option value="tshirtSize">T-shirt Size</option><option value="health">Health</option><option value="deliveryMethodology">Delivery Methodology</option>' +
      '<option value="estimatedType">Opportunity Type</option><option value="valueConfidence">Opportunity Type Confidence</option><option value="costConfidence">Cost Estimate Confidence</option>';
    showModal('<div class="modal-title">Bulk edit ' + selectedIds.length + ' project' + (selectedIds.length===1?'':'s') + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
      '<div class="form-group"><div class="form-label">Field to update</div><select id="bulk-field" onchange="renderBulkValueInput(this.value)">' + fieldOpts + '</select></div>' +
      '<div id="bulk-value-container"></div>' +
      '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="applyBulkEdit()">Apply</button></div>');
    window.renderBulkValueInput('sponsor');
  };

  window.renderBulkValueInput = function(field) {
    var container = document.getElementById('bulk-value-container');
    if (!container) return;
    var html;
    if (field === 'sponsor') {
      var sponsorOpts = '<option value="">— None —</option>' + individualResourceNames().map(function(n){ return '<option>' + n + '</option>'; }).join('');
      html = '<div class="form-group"><div class="form-label">New sponsor</div><select id="bulk-value-input">' + sponsorOpts + '</select></div>';
    } else if (field === 'owner') {
      var ownerOpts = '<option value="">— None —</option>' + individualResourceNames().map(function(n){ return '<option>' + n + '</option>'; }).join('');
      html = '<div class="form-group"><div class="form-label">New owner</div><select id="bulk-value-input">' + ownerOpts + '</select></div>';
    } else if (field === 'tshirtSize') {
      html = '<div class="form-group"><div class="form-label">New T-shirt size</div><select id="bulk-value-input"><option value="">— Not sized —</option>' + TSHIRT_SIZES.map(function(s){ return '<option>' + s + '</option>'; }).join('') + '</select></div>';
    } else if (field === 'health') {
      html = '<div class="form-group"><div class="form-label">New health</div><select id="bulk-value-input"><option value="">— Not set —</option><option value="green">Green</option><option value="amber">Amber</option><option value="red">Red</option></select></div>';
    } else if (field === 'deliveryMethodology') {
      html = '<div class="form-group"><div class="form-label">New delivery methodology</div><select id="bulk-value-input"><option value="">Not selected</option><option>Agile</option><option>Waterfall</option><option>Hybrid</option></select></div>';
    } else if (field === 'estimatedType') {
      html = '<div class="form-group"><div class="form-label">New opportunity type</div><select id="bulk-value-input"><option value="">— Not set —</option><option value="Revenue">Revenue opportunity</option><option value="Savings">Cost savings opportunity</option></select></div>';
    } else if (field === 'valueConfidence' || field === 'costConfidence') {
      html = '<div class="form-group"><div class="form-label">New ' + (field === 'valueConfidence' ? 'opportunity type' : 'cost estimate') + ' confidence</div><select id="bulk-value-input">' + confidenceOptsHtml() + '</select></div>';
    } else {
      var opts = field === 'businessUnit' ? BUSINESS_UNITS : field === 'value' ? VALUE_AREAS : field === 'priority' ? PRIORITIES : field === 'status' ? STATUSES : PHASES;
      html = '<div class="form-group"><div class="form-label">New value</div><select id="bulk-value-input">' + opts.map(function(o){ return '<option>' + o + '</option>'; }).join('') + '</select></div>';
    }
    container.innerHTML = html;
  };

  window.applyBulkEdit = async function() {
    var selectedIds = window.__bulkEditSelectedIds || [];
    var field = document.getElementById('bulk-field').value;
    var value = document.getElementById('bulk-value-input').value;
    var btn = document.querySelector('.modal-footer .btn-primary'); if (btn) btn.disabled = true;

    var columnMap = { sponsor:'sponsor', businessUnit:'business_unit', value:'value_area', priority:'priority', status:'status', phase:'phase',
      tshirtSize:'tshirt_size', health:'health', deliveryMethodology:'delivery_methodology', estimatedType:'estimated_type', valueConfidence:'value_confidence', costConfidence:'cost_confidence' };
    var ownerResource = null;
    var sponsorResource = null;
    var updatePayload = {};
    if (field === 'owner') {
      ownerResource = resolveResource(value);
      updatePayload = { owner_id: ownerResource ? ownerResource.id : null, owner_name: value || null };
    } else if (field === 'sponsor') {
      sponsorResource = resolveResource(value);
      updatePayload = { sponsor_resource_id: sponsorResource ? sponsorResource.id : null, sponsor: value || null };
    } else {
      updatePayload[columnMap[field]] = value || null;
    }

    var failed = 0;
    for (var i = 0; i < selectedIds.length; i++) {
      var result = await sb.from('projects').update(updatePayload).eq('id', selectedIds[i]);
      if (result.error) { failed++; continue; }
      var proj = D.projects.find(function(x){ return x.id === selectedIds[i]; });
      if (!proj) continue;
      if (field === 'owner') { proj.owner = value || ''; proj.ownerId = ownerResource ? ownerResource.id : null; if (ownerResource) await applyOwnerAsLead(proj); }
      else if (field === 'sponsor') { proj.sponsor = value || ''; proj.sponsorResourceId = sponsorResource ? sponsorResource.id : null; }
      else if (field === 'businessUnit') proj.businessUnit = value;
      else if (field === 'value') proj.value = value;
      else proj[field] = value;
    }

    closeModal();
    showToast(failed ? (selectedIds.length - failed) + ' updated, ' + failed + ' failed' : selectedIds.length + ' project' + (selectedIds.length===1?'':'s') + ' updated');
    st.selected = {};
    pgAllProjects();
  };
}

function pgManageValues() {
  tb('Manage Values');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can manage these values.</p></div>';
    return;
  }

  function usageCount(fieldName, value) {
    if (fieldName === 'value_area') {
      return D.projects.filter(function(p){ return p.value === value; }).length + D.requests.filter(function(r){ return r.value === value; }).length;
    }
    if (fieldName === 'business_unit') {
      return D.projects.filter(function(p){ return p.businessUnit === value; }).length;
    }
    return D.projects.filter(function(p){ return (p.categories||[]).indexOf(value) >= 0; }).length;
  }

  function fieldSection(fieldName, label, values) {
    var rows = values.map(function(v){
      var count = usageCount(fieldName, v);
      var esc = v.replace(/'/g,"\\'");
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0ede8">' +
        '<div><span style="font-size:13px;font-weight:600">' + v + '</span> <span class="text-muted" style="font-size:12px">— used by ' + count + '</span></div>' +
        '<div style="display:flex;gap:6px"><button class="btn btn-sm" onclick="renameFieldOption(\'' + fieldName + '\',\'' + esc + '\')"><i class="ti ti-edit"></i></button>' +
        '<button class="btn btn-sm btn-danger" onclick="deleteFieldOption(\'' + fieldName + '\',\'' + esc + '\')"><i class="ti ti-trash"></i></button></div></div>';
    }).join('');
    return '<div class="card mb-16"><div class="section-title">' + label + '</div>' +
      (rows || '<span class="text-muted" style="font-size:13px">No values yet</span>') +
      '<div class="task-filter-bar" style="display:flex;gap:8px;margin-top:12px"><input type="text" id="new-' + fieldName + '-input" placeholder="New ' + label.toLowerCase() + '…" style="flex:1"><button class="btn btn-primary" onclick="createFieldOption(\'' + fieldName + '\')"><i class="ti ti-plus"></i> Add</button></div>' +
      '</div>';
  }

  document.getElementById('content').innerHTML =
    fieldSection('value_area', 'Value Area', VALUE_AREAS) +
    fieldSection('business_unit', 'Business Unit', BUSINESS_UNITS) +
    fieldSection('category', 'Category', CATEGORIES);

  window.createFieldOption = async function(fieldName) {
    var el = document.getElementById('new-' + fieldName + '-input');
    var value = el.value.trim();
    if (!value) return;
    var existing = fieldName === 'value_area' ? VALUE_AREAS : fieldName === 'business_unit' ? BUSINESS_UNITS : CATEGORIES;
    if (existing.some(function(v){ return v.toLowerCase() === value.toLowerCase(); })) { showToast('That value already exists'); return; }
    var result = await sb.from('field_options').insert({ field_name: fieldName, value: value });
    if (result.error) { showToast('Could not add: ' + result.error.message); return; }
    await loadFieldOptions();
    showToast('Added'); pgManageValues();
  };

  window.renameFieldOption = async function(fieldName, oldValue) {
    var newValue = prompt('Rename "' + oldValue + '" to:', oldValue);
    if (newValue == null) return;
    newValue = newValue.trim();
    if (!newValue || newValue === oldValue) return;

    var result = await sb.from('field_options').update({ value: newValue }).eq('field_name', fieldName).eq('value', oldValue);
    if (result.error) { showToast('Could not rename: ' + result.error.message); return; }

    if (fieldName === 'value_area') {
      await sb.from('projects').update({ value_area: newValue }).eq('value_area', oldValue);
      await sb.from('requests').update({ value_area: newValue }).eq('value_area', oldValue);
      D.projects.forEach(function(p){ if (p.value === oldValue) p.value = newValue; });
      D.requests.forEach(function(r){ if (r.value === oldValue) r.value = newValue; });
    } else if (fieldName === 'business_unit') {
      await sb.from('projects').update({ business_unit: newValue }).eq('business_unit', oldValue);
      D.projects.forEach(function(p){ if (p.businessUnit === oldValue) p.businessUnit = newValue; });
    } else {
      // Category is multi-valued per project, so a project could in theory
      // already have both the old and new name — handle that collision per
      // project rather than a single bulk update that could hit a duplicate key.
      var affected = D.projects.filter(function(p){ return p.categories && p.categories.indexOf(oldValue) >= 0; });
      for (var i = 0; i < affected.length; i++) {
        var proj = affected[i];
        if (proj.categories.indexOf(newValue) >= 0) {
          await sb.from('project_categories').delete().eq('project_id', proj.id).eq('category', oldValue);
          proj.categories = proj.categories.filter(function(c){ return c !== oldValue; });
        } else {
          await sb.from('project_categories').update({ category: newValue }).eq('project_id', proj.id).eq('category', oldValue);
          var idx = proj.categories.indexOf(oldValue);
          proj.categories[idx] = newValue;
        }
      }
    }

    await loadFieldOptions();
    showToast('Renamed'); pgManageValues();
  };

  window.deleteFieldOption = async function(fieldName, value) {
    var count = usageCount(fieldName, value);
    var msg = 'Delete "' + value + '"?' + (count > 0 ? ' It is currently used by ' + count + ' item(s) — they will keep showing this value, but it will no longer be selectable for new entries.' : '');
    if (!confirm(msg)) return;
    var result = await sb.from('field_options').delete().eq('field_name', fieldName).eq('value', value);
    if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
    await loadFieldOptions();
    showToast('Deleted'); pgManageValues();
  };
}

function pgAdminTags() {
  tb('Manage Tags');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can manage tags.</p></div>';
    return;
  }
  var expandedTagId = tagAdminState.expandedId;
  var rows = D.tags.map(function(t) {
    var projectsWithTag = D.projects.filter(function(p){ return (p.tags||[]).indexOf(t.name) >= 0; })
      .slice().sort(function(a,b){ return (STAGE_SORT_RANK[a.stage]!=null?STAGE_SORT_RANK[a.stage]:9) - (STAGE_SORT_RANK[b.stage]!=null?STAGE_SORT_RANK[b.stage]:9); });
    var resourcesWithTag = D.resources.filter(function(r){ return (r.tags||[]).indexOf(t.name) >= 0; });
    var usageCount = projectsWithTag.length + resourcesWithTag.length;
    var expandRow = '';
    if (expandedTagId === t.id) {
      var projLinks = projectsWithTag.map(function(p){ return '<div style="display:flex;justify-content:space-between;padding:4px 0"><span>' + p.name + ' ' + stagePill(p.stage) + '</span><button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i></button></div>'; }).join('');
      var resLinks = resourcesWithTag.map(function(r){ return '<div style="display:flex;justify-content:space-between;padding:4px 0"><span>' + r.name + ' <span class="text-muted" style="font-size:11px">(resource)</span></span><button class="btn btn-sm" onclick="editResource(\'' + r.id + '\')"><i class="ti ti-eye"></i></button></div>'; }).join('');
      var body = (projLinks + resLinks) || '<span class="text-muted" style="font-size:13px">Not currently used anywhere</span>';
      expandRow = '<tr><td colspan="3" style="background:#faf9f7;padding:10px 16px">' + body + '</td></tr>';
    }
    return '<tr>' +
      '<td>' + tagBadge(t.name) + '</td>' +
      '<td><button class="btn btn-sm" onclick="toggleTagExpand(\'' + t.id + '\')">' + usageCount + ' <i class="ti ' + (expandedTagId===t.id?'ti-chevron-up':'ti-chevron-down') + '"></i></button></td>' +
      '<td><button class="btn btn-sm" onclick="renameTag(\'' + t.id + '\')"><i class="ti ti-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="deleteTag(\'' + t.id + '\')"><i class="ti ti-trash"></i></button></td>' +
      '</tr>' + expandRow;
  }).join('');

  document.getElementById('content').innerHTML =
    '<div class="card"><div class="task-filter-bar" style="display:flex;gap:8px"><input type="text" id="new-tag-input" placeholder="New tag name…" style="flex:1"><button class="btn btn-primary" onclick="createTagFromAdmin()"><i class="ti ti-plus"></i> Add tag</button></div>' +
    (D.tags.length
      ? '<div class="table-wrap"><table><thead><tr><th>Tag</th><th>Used by</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="empty-state" style="padding:24px"><i class="ti ti-tag"></i><p>No tags yet</p></div>') +
    '</div>';

  window.toggleTagExpand = function(tid) { tagAdminState.expandedId = tagAdminState.expandedId === tid ? null : tid; pgAdminTags(); };

  window.createTagFromAdmin = async function() {
    var name = document.getElementById('new-tag-input').value.trim();
    if (!name) return;
    if (D.tags.some(function(t){ return t.name.toLowerCase() === name.toLowerCase(); })) { showToast('That tag already exists'); return; }
    var result = await sb.from('tags').insert({ name: name }).select().single();
    if (result.error) { showToast('Could not create tag: ' + result.error.message); return; }
    D.tags.push({ id: result.data.id, name: name });
    D.tags.sort(function(a,b){ return a.name.localeCompare(b.name); });
    showToast('Tag created');
    pgAdminTags();
  };

  window.renameTag = async function(tid) {
    var tag = D.tags.find(function(t){ return t.id === tid; });
    var newName = prompt('Rename tag:', tag.name);
    if (newName == null) return;
    newName = newName.trim();
    if (!newName || newName === tag.name) return;
    var result = await sb.from('tags').update({ name: newName }).eq('id', tid);
    if (result.error) { showToast('Could not rename: ' + result.error.message); return; }
    var oldName = tag.name;
    tag.name = newName;
    D.projects.forEach(function(p){ if (p.tags) { var i = p.tags.indexOf(oldName); if (i>=0) p.tags[i] = newName; } });
    D.resources.forEach(function(r){ if (r.tags) { var i = r.tags.indexOf(oldName); if (i>=0) r.tags[i] = newName; } });
    D.tags.sort(function(a,b){ return a.name.localeCompare(b.name); });
    showToast('Tag renamed');
    pgAdminTags();
  };

  window.deleteTag = async function(tid) {
    var tag = D.tags.find(function(t){ return t.id === tid; });
    if (!confirm('Delete tag "' + tag.name + '"? It will be removed from everything currently tagged with it.')) return;
    var result = await sb.from('tags').delete().eq('id', tid);
    if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
    D.tags = D.tags.filter(function(t){ return t.id !== tid; });
    D.projects.forEach(function(p){ if (p.tags) p.tags = p.tags.filter(function(n){ return n !== tag.name; }); });
    D.resources.forEach(function(r){ if (r.tags) r.tags = r.tags.filter(function(n){ return n !== tag.name; }); });
    showToast('Tag deleted');
    pgAdminTags();
  };
}

var deletedItemsState = { tab: 'projects', search: '', projectsData: null, requestsData: null, workRequestsData: null };

async function resolveProfileNames(ids) {
  var uniqueIds = ids.filter(function(id, i){ return id && ids.indexOf(id) === i; });
  if (!uniqueIds.length) return {};
  var result = await sb.from('profiles').select('id, display_name').in('id', uniqueIds);
  var map = {};
  (result.data || []).forEach(function(p){ map[p.id] = p.display_name; });
  return map;
}

async function loadDeletedProjects() {
  var result = await sb.from('projects').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
  if (result.error) { showToast('Could not load deleted projects: ' + result.error.message); return []; }
  var rows = result.data || [];
  var nameById = await resolveProfileNames(rows.map(function(r){ return r.deleted_by; }));
  return rows.map(function(r){
    return { id: r.id, name: r.name, stage: r.stage, owner: r.owner_name, deletedAt: r.deleted_at, deletedByName: nameById[r.deleted_by] || '—' };
  });
}

async function loadDeletedRequests() {
  var result = await sb.from('requests').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
  if (result.error) { showToast('Could not load deleted requests: ' + result.error.message); return []; }
  var rows = result.data || [];
  var nameById = await resolveProfileNames(rows.map(function(r){ return r.deleted_by; }));
  return rows.map(function(r){
    return { id: r.id, title: r.title, status: r.status, submitter: r.submitter_name, deletedAt: r.deleted_at, deletedByName: nameById[r.deleted_by] || '—' };
  });
}

async function loadDeletedWorkRequests() {
  var result = await sb.from('work_requests').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
  if (result.error) { showToast('Could not load deleted work requests: ' + result.error.message); return []; }
  var rows = result.data || [];
  var deleterIds = rows.map(function(r){ return r.deleted_by; });
  var resourceIds = rows.map(function(r){ return r.resource_id; });
  var nameById = await resolveProfileNames(deleterIds);
  var resourceResult = await sb.from('resources').select('id, name').in('id', resourceIds.length ? resourceIds : ['00000000-0000-0000-0000-000000000000']);
  var resourceNameById = {}; (resourceResult.data || []).forEach(function(r){ resourceNameById[r.id] = r.name; });
  return rows.map(function(r){
    return { id: r.id, title: r.title, status: r.status, resource: resourceNameById[r.resource_id] || '—', deletedAt: r.deleted_at, deletedByName: nameById[r.deleted_by] || '—' };
  });
}

function deletedItemsTabsHtml() {
  var st = deletedItemsState;
  return '<div class="tab-bar" style="margin-bottom:16px">' +
    '<div class="tab' + (st.tab==='projects'?' active':'') + '" onclick="setDeletedItemsTab(\'projects\')">Projects</div>' +
    '<div class="tab' + (st.tab==='requests'?' active':'') + '" onclick="setDeletedItemsTab(\'requests\')">Requests</div>' +
    '<div class="tab' + (st.tab==='workRequests'?' active':'') + '" onclick="setDeletedItemsTab(\'workRequests\')">Work Requests</div>' +
    '</div>';
}

async function pgDeletedItems() {
  tb('Deleted Items');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can access Deleted Items.</p></div>';
    return;
  }
  var st = deletedItemsState;
  if (st.tab === 'projects' && st.projectsData === null) {
    document.getElementById('content').innerHTML =
      deletedItemsTabsHtml() + '<div class="empty-state" style="padding:40px"><i class="ti ti-loader-2"></i><p>Loading…</p></div>';
    st.projectsData = await loadDeletedProjects();
  } else if (st.tab === 'requests' && st.requestsData === null) {
    document.getElementById('content').innerHTML =
      deletedItemsTabsHtml() + '<div class="empty-state" style="padding:40px"><i class="ti ti-loader-2"></i><p>Loading…</p></div>';
    st.requestsData = await loadDeletedRequests();
  } else if (st.tab === 'workRequests' && st.workRequestsData === null) {
    document.getElementById('content').innerHTML =
      deletedItemsTabsHtml() + '<div class="empty-state" style="padding:40px"><i class="ti ti-loader-2"></i><p>Loading…</p></div>';
    st.workRequestsData = await loadDeletedWorkRequests();
  }
  renderDeletedItemsBody();
}

function renderDeletedItemsBody() {
  var st = deletedItemsState;
  var q = st.search.trim().toLowerCase();
  var searchPlaceholder = st.tab==='projects' ? 'project name' : st.tab==='requests' ? 'request title' : 'work request title';
  var searchBar = '<div class="task-filter-bar"><input type="text" id="deleted-items-search" placeholder="Search by ' + searchPlaceholder + '…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onDeletedItemsSearch(this.value)"></div>';

  if (st.tab === 'workRequests') {
    var rows3 = (st.workRequestsData || []).filter(function(r){ return !q || r.title.toLowerCase().indexOf(q) >= 0; });
    document.getElementById('content').innerHTML = deletedItemsTabsHtml() + searchBar + (rows3.length
      ? '<div class="card"><div class="table-wrap"><table><thead><tr><th>Request</th><th>Status</th><th>Assigned to</th><th>Deleted</th><th>Deleted by</th><th></th></tr></thead><tbody>' +
        rows3.map(function(r) {
          return '<tr><td class="bold">' + r.title + '</td><td><span class="badge ' + workRequestStatusBadgeClass(r.status) + '">' + r.status + '</span></td><td class="text-muted">' + (r.resource||'—') + '</td>' +
            '<td class="text-muted">' + fmtDateTime(r.deletedAt) + '</td><td class="text-muted">' + r.deletedByName + '</td>' +
            '<td><div style="display:flex;gap:4px">' +
            '<button class="btn btn-sm" onclick="openDeletedWorkRequestModal(\'' + r.id + '\')"><i class="ti ti-eye"></i> View</button>' +
            '<button class="btn btn-sm btn-primary" onclick="restoreDeletedWorkRequest(\'' + r.id + '\')"><i class="ti ti-arrow-back-up"></i> Restore</button>' +
            '</div></td></tr>';
        }).join('') + '</tbody></table></div></div>'
      : '<div class="empty-state" style="padding:30px"><i class="ti ' + (q?'ti-search':'ti-trash-off') + '"></i><p>No deleted work requests' + (q ? ' match your search' : '') + '</p></div>');
    return;
  }

  if (st.tab === 'projects') {
    var rows = (st.projectsData || []).filter(function(r){ return !q || r.name.toLowerCase().indexOf(q) >= 0; });
    document.getElementById('content').innerHTML = deletedItemsTabsHtml() + searchBar + (rows.length
      ? '<div class="card"><div class="table-wrap"><table><thead><tr><th>Project</th><th>Stage</th><th>Owner</th><th>Deleted</th><th>Deleted by</th><th></th></tr></thead><tbody>' +
        rows.map(function(r) {
          return '<tr><td class="bold">' + r.name + '</td><td>' + (EXPORT_STAGE_LABELS[r.stage]||r.stage) + '</td><td class="text-muted">' + (r.owner||'—') + '</td>' +
            '<td class="text-muted">' + fmtDateTime(r.deletedAt) + '</td><td class="text-muted">' + r.deletedByName + '</td>' +
            '<td><div style="display:flex;gap:4px">' +
            '<button class="btn btn-sm" onclick="openDeletedProjectModal(\'' + r.id + '\')"><i class="ti ti-eye"></i> View</button>' +
            '<button class="btn btn-sm btn-primary" onclick="restoreDeletedProject(\'' + r.id + '\')"><i class="ti ti-arrow-back-up"></i> Restore</button>' +
            '</div></td></tr>';
        }).join('') + '</tbody></table></div></div>'
      : '<div class="empty-state" style="padding:30px"><i class="ti ' + (q?'ti-search':'ti-trash-off') + '"></i><p>No deleted projects' + (q ? ' match your search' : '') + '</p></div>');
  } else {
    var rows2 = (st.requestsData || []).filter(function(r){ return !q || r.title.toLowerCase().indexOf(q) >= 0; });
    document.getElementById('content').innerHTML = deletedItemsTabsHtml() + searchBar + (rows2.length
      ? '<div class="card"><div class="table-wrap"><table><thead><tr><th>Request</th><th>Status</th><th>Submitter</th><th>Deleted</th><th>Deleted by</th><th></th></tr></thead><tbody>' +
        rows2.map(function(r) {
          return '<tr><td class="bold">' + r.title + '</td><td>' + bdg(r.status) + '</td><td class="text-muted">' + (r.submitter||'—') + '</td>' +
            '<td class="text-muted">' + fmtDateTime(r.deletedAt) + '</td><td class="text-muted">' + r.deletedByName + '</td>' +
            '<td><div style="display:flex;gap:4px">' +
            '<button class="btn btn-sm" onclick="openDeletedRequestModal(\'' + r.id + '\')"><i class="ti ti-eye"></i> View</button>' +
            '<button class="btn btn-sm btn-primary" onclick="restoreDeletedRequest(\'' + r.id + '\')"><i class="ti ti-arrow-back-up"></i> Restore</button>' +
            '</div></td></tr>';
        }).join('') + '</tbody></table></div></div>'
      : '<div class="empty-state" style="padding:30px"><i class="ti ' + (q?'ti-search':'ti-trash-off') + '"></i><p>No deleted requests' + (q ? ' match your search' : '') + '</p></div>');
  }
}

window.setDeletedItemsTab = function(t) { deletedItemsState.tab = t; deletedItemsState.search = ''; pgDeletedItems(); };

window.onDeletedItemsSearch = function(val) {
  deletedItemsState.search = val;
  renderDeletedItemsBody();
  var el = document.getElementById('deleted-items-search');
  if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
};

async function restoreDeletedProject(pid) {
  var result = await sb.from('projects').update({ deleted_at: null, deleted_by: null }).eq('id', pid);
  if (result.error) { showToast('Could not restore: ' + result.error.message); return; }
  var loaded = await Promise.all([loadAllProjects(), loadTags()]);
  D.projects = loaded[0];
  var tagData = loaded[1];
  D.tags = tagData.tags;
  D.projects.forEach(function(p){ p.tags = tagData.projectTagNames[p.id] || []; p.tasks.forEach(function(t){ t.tags = tagData.taskTagNames[t.id] || []; }); });
  showToast('Project restored');
  renderNav();
  deletedItemsState.projectsData = null;
  pgDeletedItems();
}

async function restoreDeletedRequest(id) {
  var result = await sb.from('requests').update({ deleted_at: null, deleted_by: null }).eq('id', id);
  if (result.error) { showToast('Could not restore: ' + result.error.message); return; }
  D.requests = await loadRequests();
  showToast('Request restored');
  renderNav();
  deletedItemsState.requestsData = null;
  pgDeletedItems();
}

async function restoreDeletedWorkRequest(id) {
  var result = await sb.from('work_requests').update({ deleted_at: null, deleted_by: null }).eq('id', id);
  if (result.error) { showToast('Could not restore: ' + result.error.message); return; }
  D.workRequests = await loadWorkRequests();
  showToast('Work request restored');
  renderNav();
  deletedItemsState.workRequestsData = null;
  pgDeletedItems();
}

async function openDeletedWorkRequestModal(id) {
  showModal('<div class="empty-state" style="padding:40px"><i class="ti ti-loader-2"></i><p>Loading…</p></div>', true);
  var results = await Promise.all([
    sb.from('work_requests').select('*').eq('id', id).single(),
    sb.from('work_request_log').select('*').eq('work_request_id', id),
    sb.from('resources').select('id, name')
  ]);
  if (results[0].error || !results[0].data) { closeModal(); showToast('Could not load work request'); return; }
  var w = results[0].data;
  var logRows = mapLog(results[1].data || []);
  var resourceNameById = {}; (results[2].data || []).forEach(function(r){ resourceNameById[r.id] = r.name; });
  var nameById = await resolveProfileNames([w.deleted_by, w.requester_id]);
  var deletedByName = nameById[w.deleted_by] || '—';
  var requesterName = nameById[w.requester_id] || '(no longer an account)';
  var resourceName = resourceNameById[w.resource_id] || '(no longer a resource)';

  var logHtml = logRows.length ? logRows.slice().reverse().map(function(e) {
    return '<div class="raid-log-entry"><strong>' + e.date + '</strong> — ' + e.actor + ': ' + e.action + (e.detail ? ' (' + e.detail + ')' : '') + '</div>';
  }).join('') : '<div class="text-muted" style="font-size:13px">No history recorded</div>';

  showModal(
    '<div class="modal-title">' + w.title + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="info-banner info-amber" style="margin-bottom:16px"><i class="ti ti-trash" style="font-size:20px;flex-shrink:0"></i>' +
      '<div><strong>You are viewing a deleted work request.</strong> Deleted ' + fmtDateTime(w.deleted_at) + ' by ' + deletedByName + '. This view is read-only.' +
      '<div style="margin-top:8px"><button class="btn btn-sm btn-primary" onclick="restoreDeletedWorkRequestFromModal(\'' + id + '\')"><i class="ti ti-arrow-back-up"></i> Restore this work request</button></div>' +
      '</div></div>' +
    '<div class="grid-2 mb-16">' +
      '<div><div class="form-label">Status</div><span class="badge ' + workRequestStatusBadgeClass(w.status) + '">' + w.status + '</span></div>' +
      '<div><div class="form-label">Assigned to</div>' + resourceName + '</div>' +
      '<div><div class="form-label">Requested by</div>' + requesterName + '</div>' +
      '<div><div class="form-label">Submitted</div>' + fmtDate(w.created_at) + '</div>' +
      '<div><div class="form-label">Estimated hours</div>' + (w.estimated_hours != null ? w.estimated_hours : '<span class="text-muted">—</span>') + '</div>' +
      '<div><div class="form-label">Estimated completion</div>' + (w.estimated_completion_date || '<span class="text-muted">—</span>') + '</div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Description</div><div style="font-size:13px;line-height:1.6">' + (w.description || '<span class="text-muted">—</span>') + '</div></div>' +
    (w.info_note ? '<div class="form-group"><div class="form-label">Note</div><div style="font-size:13px;line-height:1.6">' + w.info_note + '</div></div>' : '') +
    '<div class="form-group"><div class="form-label">History</div>' + logHtml + '</div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>',
    true
  );
}

async function restoreDeletedWorkRequestFromModal(id) {
  if (!confirm('Restore this work request?')) return;
  closeModal();
  await restoreDeletedWorkRequest(id);
}

// Deleted items are read-only previews shown in a modal rather than the
// live, fully-interactive project/request views -- those are wired up with
// edit actions in dozens of places (every tab, every button), and none of
// it reads from a deleted row today since it's excluded from D.projects /
// D.requests. A dedicated read-only render is the only way to guarantee
// nothing here is editable, rather than trying to flip every one of those
// switches off for a single preview.
async function openDeletedProjectModal(pid) {
  showModal('<div class="empty-state" style="padding:40px"><i class="ti ti-loader-2"></i><p>Loading…</p></div>', true);
  var results = await Promise.all([
    sb.from('projects').select('*').eq('id', pid).single(),
    sb.from('resource_projects').select('*').eq('project_id', pid),
    sb.from('milestones').select('*').eq('project_id', pid),
    sb.from('tasks').select('*').eq('project_id', pid),
    sb.from('raid_items').select('*').eq('project_id', pid),
    sb.from('documents').select('*').eq('project_id', pid),
    sb.from('project_categories').select('*').eq('project_id', pid),
    sb.from('resources').select('id, name')
  ]);
  if (results[0].error || !results[0].data) { closeModal(); showToast('Could not load project'); return; }
  var pr = results[0].data;
  var teamRows = results[1].data || [];
  var milestoneRows = (results[2].data || []).slice().sort(function(a,b){ return (a.target_date||'') < (b.target_date||'') ? -1 : 1; });
  var taskRows = (results[3].data || []).slice().sort(function(a,b){ return (a.position||0) - (b.position||0); });
  var raidRows = results[4].data || [];
  var docRows = results[5].data || [];
  var catRows = results[6].data || [];
  var resourceNameById = {}; (results[7].data || []).forEach(function(r){ resourceNameById[r.id] = r.name; });
  var nameById = await resolveProfileNames([pr.deleted_by]);
  var deletedByName = nameById[pr.deleted_by] || '—';

  var teamNamesList = teamRows.map(function(t){ return resourceNameById[t.resource_id] || '(no longer a resource)'; });

  var milestonesHtml = milestoneRows.length ? milestoneRows.map(function(m) {
    return '<div style="padding:6px 0;border-bottom:1px solid #f0ede8;font-size:13px">' +
      '<i class="ti ' + (m.done ? 'ti-circle-check' : 'ti-circle-dotted') + '" style="color:' + (m.done ? '#1D9E75' : '#ccc') + ';margin-right:6px"></i>' +
      m.name + ' <span class="text-muted">' + (m.done ? 'Completed ' + (m.completed_date || m.target_date) : 'Target ' + m.target_date) + '</span></div>';
  }).join('') : '<div class="text-muted" style="font-size:13px">None</div>';

  // Hierarchy depth isn't reconstructed here -- a flat, position-ordered
  // list is enough for a read-only review.
  var tasksHtml = taskRows.length ? taskRows.map(function(t) {
    return '<div style="padding:6px 0;border-bottom:1px solid #f0ede8;font-size:13px">' +
      t.title + ' <span class="text-muted">— ' + (t.assignee_name || 'Unassigned') + '</span> ' + bdg(t.status) +
      (t.start_date || t.end_date ? ' <span class="text-muted">' + (t.start_date||'') + (t.start_date && t.end_date ? ' – ' : '') + (t.end_date||'') + '</span>' : '') +
      '</div>';
  }).join('') : '<div class="text-muted" style="font-size:13px">None</div>';

  var raidByType = { risk: [], assumption: [], issue: [], dependency: [] };
  raidRows.forEach(function(r){ if (raidByType[r.type]) raidByType[r.type].push(r); });
  function raidSectionHtml(label, items) {
    if (!items.length) return '';
    return '<div class="bold" style="margin-top:10px;font-size:13px">' + label + '</div>' +
      items.map(function(r) {
        return '<div style="padding:6px 0;border-bottom:1px solid #f0ede8;font-size:13px">' + r.description +
          (r.owner_name ? ' <span class="text-muted">— ' + r.owner_name + '</span>' : '') +
          (r.status ? ' ' + bdg(r.status) : '') + '</div>';
      }).join('');
  }
  var raidHtml = raidSectionHtml('Risks', raidByType.risk) + raidSectionHtml('Assumptions', raidByType.assumption) +
    raidSectionHtml('Issues', raidByType.issue) + raidSectionHtml('Dependencies', raidByType.dependency);
  if (!raidHtml) raidHtml = '<div class="text-muted" style="font-size:13px">None</div>';

  var docsHtml = docRows.length ? docRows.map(function(d) {
    return '<div style="padding:6px 0;border-bottom:1px solid #f0ede8;font-size:13px"><i class="ti ' + (d.source_type==='link'?'ti-link':'ti-file-text') + '" style="margin-right:6px;color:#888"></i>' +
      d.name + ' <span class="text-muted">— ' + d.category + '</span></div>';
  }).join('') : '<div class="text-muted" style="font-size:13px">None</div>';

  var categoriesHtml = catRows.length ? catRows.map(function(c){ return '<span class="badge badge-blue" style="margin-right:4px">' + c.category + '</span>'; }).join('') : '<span class="text-muted">—</span>';
  var financialsHtml = (pr.estimated_amount != null || pr.cost_estimate != null)
    ? '<div class="form-group"><div class="form-label">Financials</div><div style="font-size:13px">' +
      (pr.estimated_amount != null ? 'Estimated value: ' + fmtCost(pr.estimated_amount) : '') +
      (pr.cost_estimate != null ? (pr.estimated_amount != null ? ' · ' : '') + 'Cost estimate: ' + fmtCost(pr.cost_estimate) : '') +
      '</div></div>'
    : '';

  showModal(
    '<div class="modal-title">' + pr.name + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="info-banner info-amber" style="margin-bottom:16px"><i class="ti ti-trash" style="font-size:20px;flex-shrink:0"></i>' +
      '<div><strong>You are viewing a deleted project.</strong> Deleted ' + fmtDateTime(pr.deleted_at) + ' by ' + deletedByName + '. This view is read-only.' +
      '<div style="margin-top:8px"><button class="btn btn-sm btn-primary" onclick="restoreDeletedProjectFromModal(\'' + pid + '\')"><i class="ti ti-arrow-back-up"></i> Restore this project</button></div>' +
      '</div></div>' +
    '<div class="grid-2 mb-16">' +
      '<div><div class="form-label">Stage</div>' + stagePill(pr.stage) + '</div>' +
      '<div><div class="form-label">Status</div>' + (pr.status ? bdg(pr.status) : '<span class="text-muted">—</span>') + '</div>' +
      '<div><div class="form-label">Phase</div>' + (pr.phase || '<span class="text-muted">—</span>') + '</div>' +
      '<div><div class="form-label">Priority</div>' + (pr.priority ? bdg(pr.priority) : '<span class="text-muted">—</span>') + '</div>' +
      '<div><div class="form-label">Owner</div>' + (pr.owner_name || '<span class="text-muted">—</span>') + '</div>' +
      '<div><div class="form-label">Sponsor</div>' + (pr.sponsor || '<span class="text-muted">—</span>') + '</div>' +
      '<div><div class="form-label">Start</div>' + (pr.start_date || '—') + '</div>' +
      '<div><div class="form-label">Target end</div>' + (pr.end_date || '—') + '</div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Description</div><div style="font-size:13px;line-height:1.6">' + (pr.description || '<span class="text-muted">—</span>') + '</div></div>' +
    '<div class="form-group"><div class="form-label">Categories</div>' + categoriesHtml + '</div>' +
    financialsHtml +
    '<div class="form-group"><div class="form-label">Team</div><div style="font-size:13px">' + (teamNamesList.length ? teamNamesList.join(', ') : '<span class="text-muted">—</span>') + '</div></div>' +
    '<div class="form-group"><div class="form-label">Milestones</div>' + milestonesHtml + '</div>' +
    '<div class="form-group"><div class="form-label">Tasks</div>' + tasksHtml + '</div>' +
    '<div class="form-group"><div class="form-label">RAID Log</div>' + raidHtml + '</div>' +
    '<div class="form-group"><div class="form-label">Documents</div>' + docsHtml + '</div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>',
    true
  );
}

async function restoreDeletedProjectFromModal(pid) {
  if (!confirm('Restore this project?')) return;
  closeModal();
  await restoreDeletedProject(pid);
}

async function openDeletedRequestModal(id) {
  showModal('<div class="empty-state" style="padding:40px"><i class="ti ti-loader-2"></i><p>Loading…</p></div>', true);
  var results = await Promise.all([
    sb.from('requests').select('*').eq('id', id).single(),
    sb.from('request_team').select('*').eq('request_id', id),
    sb.from('request_tags').select('*').eq('request_id', id),
    sb.from('resources').select('id, name'),
    sb.from('tags').select('id, name')
  ]);
  if (results[0].error || !results[0].data) { closeModal(); showToast('Could not load request'); return; }
  var r = results[0].data;
  var teamRows = results[1].data || [];
  var tagRows = results[2].data || [];
  var resourceNameById = {}; (results[3].data || []).forEach(function(x){ resourceNameById[x.id] = x.name; });
  var tagNameById = {}; (results[4].data || []).forEach(function(x){ tagNameById[x.id] = x.name; });
  var nameById = await resolveProfileNames([r.deleted_by]);
  var deletedByName = nameById[r.deleted_by] || '—';

  var teamNamesList = teamRows.map(function(t){ return resourceNameById[t.resource_id] || '(no longer a resource)'; });
  var tagNamesList = tagRows.map(function(t){ return tagNameById[t.tag_id]; }).filter(Boolean);
  var financialsHtml = (r.estimated_amount != null || r.cost_estimate != null)
    ? '<div class="form-group"><div class="form-label">Financials</div><div style="font-size:13px">' +
      (r.estimated_amount != null ? 'Estimated value: ' + fmtCost(r.estimated_amount) : '') +
      (r.cost_estimate != null ? (r.estimated_amount != null ? ' · ' : '') + 'Cost estimate: ' + fmtCost(r.cost_estimate) : '') +
      '</div></div>'
    : '';

  showModal(
    '<div class="modal-title">' + r.title + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="info-banner info-amber" style="margin-bottom:16px"><i class="ti ti-trash" style="font-size:20px;flex-shrink:0"></i>' +
      '<div><strong>You are viewing a deleted request.</strong> Deleted ' + fmtDateTime(r.deleted_at) + ' by ' + deletedByName + '. This view is read-only.' +
      '<div style="margin-top:8px"><button class="btn btn-sm btn-primary" onclick="restoreDeletedRequestFromModal(\'' + id + '\')"><i class="ti ti-arrow-back-up"></i> Restore this request</button></div>' +
      '</div></div>' +
    '<div class="grid-2 mb-16">' +
      '<div><div class="form-label">Status</div>' + bdg(r.status) + '</div>' +
      '<div><div class="form-label">Priority</div>' + (r.priority ? bdg(r.priority) : '<span class="text-muted">—</span>') + '</div>' +
      '<div><div class="form-label">Submitter</div>' + (r.submitter_name || '<span class="text-muted">—</span>') + '</div>' +
      '<div><div class="form-label">Business Unit</div>' + (r.business_unit || '<span class="text-muted">—</span>') + '</div>' +
      '<div><div class="form-label">Sponsor</div>' + (r.sponsor || '<span class="text-muted">—</span>') + '</div>' +
      '<div><div class="form-label">Value Area</div>' + (r.value_area || '<span class="text-muted">—</span>') + '</div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Description</div><div style="font-size:13px;line-height:1.6">' + (r.description || '<span class="text-muted">—</span>') + '</div></div>' +
    (r.feedback ? '<div class="form-group"><div class="form-label">Feedback</div><div style="font-size:13px;line-height:1.6">' + r.feedback + '</div></div>' : '') +
    financialsHtml +
    '<div class="form-group"><div class="form-label">Proposed Team</div><div style="font-size:13px">' + (teamNamesList.length ? teamNamesList.join(', ') : '<span class="text-muted">—</span>') + '</div></div>' +
    '<div class="form-group"><div class="form-label">Tags</div>' + (tagNamesList.length ? tagNamesList.map(function(t){ return tagBadge(t); }).join('') : '<span class="text-muted">—</span>') + '</div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>',
    true
  );
}

async function restoreDeletedRequestFromModal(id) {
  if (!confirm('Restore this request?')) return;
  closeModal();
  await restoreDeletedRequest(id);
}

// ── Work Requests ────────────────────────────────────────────────────────
// Small asks for a resource's time -- deliberately standalone from
// Projects/Requests: no approval gate, no Roadmap/Future Planning presence,
// and it feeds Resources/Capacity as hours rather than a project-count.

function workRequestStatusBadgeClass(status) {
  return { 'New':'badge-amber', 'Needs Info':'badge-red', 'Accepted':'badge-blue', 'Complete':'badge-green', 'Declined':'badge-gray', 'Withdrawn':'badge-gray' }[status] || 'badge-gray';
}

function refreshWorkRequestView() {
  renderNav();
  if (currentPage === 'my-work-requests') pgMyWorkRequests();
  else if (currentPage === 'admin-work-requests') pgAdminWorkRequests();
  else if (currentPage === 'my-requests') pgMyRequests();
}

function renderSubmitWorkRequestForm() {
  var pool = individualResourceNames();
  var selectedResource = '';
  var pickerOpen = false;
  var query = '';

  function pickerPanelHtml() {
    var q = query.trim().toLowerCase();
    var matches = pool.filter(function(n){ return n.toLowerCase().indexOf(q) >= 0; });
    var rows = matches.map(function(n){
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">' +
        '<span style="font-size:13px"><i class="ti ti-user" style="margin-right:6px;color:#888"></i>' + n + '</span>' +
        '<button type="button" class="btn btn-sm" onclick="window.__wrResourcePick(\'' + n.replace(/'/g,"\\'") + '\')">Select</button>' +
        '</div>';
    }).join('');
    return '<div style="border:1px solid #e8e8e5;border-radius:8px;padding:10px;margin-top:8px">' +
      '<input type="text" id="wr-resource-search" placeholder="Search people…" value="' + query.replace(/"/g,'&quot;') + '" oninput="window.__wrResourceSearch(this.value)">' +
      '<div style="max-height:180px;overflow-y:auto;margin-top:8px">' + (rows || '<span class="text-muted" style="font-size:13px">No matches</span>') + '</div>' +
      '</div>';
  }
  function resourceFieldInner() {
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="font-size:13px' + (selectedResource ? '' : ';color:#999') + '">' + (selectedResource || 'Choose who this is for') + '</span>' +
      '<button type="button" class="btn btn-sm" onclick="window.__wrResourceToggle()">' + (selectedResource ? 'Change' : 'Select') + '</button>' +
      '</div>' + (pickerOpen ? pickerPanelHtml() : '');
  }

  window.__wrResourceToggle = function() {
    pickerOpen = !pickerOpen; query = '';
    document.getElementById('wr-resource-field').innerHTML = resourceFieldInner();
    var s = document.getElementById('wr-resource-search'); if (s) s.focus();
  };
  window.__wrResourceSearch = function(val) {
    query = val;
    document.getElementById('wr-resource-field').innerHTML = resourceFieldInner();
    var s = document.getElementById('wr-resource-search'); if (s) { s.focus(); s.selectionStart = s.selectionEnd = s.value.length; }
  };
  window.__wrResourcePick = function(name) {
    selectedResource = name; pickerOpen = false;
    document.getElementById('wr-resource-field').innerHTML = resourceFieldInner();
  };

  document.getElementById('submit-tab-body').innerHTML =
    '<div class="card" style="max-width:660px;margin:0 auto">' +
    '<div class="section-title mb-16">Submit a work request</div>' +
    '<p class="text-muted" style="font-size:13px;margin-bottom:16px"><strong>What\'s a work request?</strong> A smaller ask for someone\'s time — a task or piece of work, not a full project with its own timeline, milestones, or team. No PMO review or approval needed; it goes straight to the person you pick, who can accept it, ask for more detail, or decline it.</p>' +
    '<div class="form-group"><div class="form-label">Title *</div><input type="text" id="wr-title" placeholder="What do you need?"></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="wr-desc" rows="4" placeholder="Any detail that will help them scope it"></textarea></div>' +
    '<div class="form-group"><div class="form-label">Requested completion date</div><div class="form-sub">When would you ideally like this done by? Whoever accepts it can keep this date or suggest a different one.</div><input type="date" id="wr-req-date"></div>' +
    '<div class="form-group"><div class="form-label">Who is this for? *</div><div id="wr-resource-field">' + resourceFieldInner() + '</div></div>' +
    '<div class="modal-footer" style="border-top:none;padding-top:0;justify-content:flex-start"><button class="btn btn-primary" id="wr-submit"><i class="ti ti-send"></i> Submit</button></div>' +
    '</div>';

  document.getElementById('wr-submit').onclick = async function() {
    var title = document.getElementById('wr-title').value.trim();
    var desc = document.getElementById('wr-desc').value.trim();
    var reqDate = document.getElementById('wr-req-date').value || null;
    if (!title) { showToast('Title required'); return; }
    if (!selectedResource) { showToast('Choose who this work request is for'); return; }
    var resource = resolveResource(selectedResource);
    if (!resource) { showToast('Could not find that resource'); return; }
    var btn = document.getElementById('wr-submit'); btn.disabled = true;
    var result = await sb.from('work_requests').insert({
      title: title, description: desc || null, requester_id: D.currentProfile.id, resource_id: resource.id, status: 'New',
      requested_completion_date: reqDate
    }).select().single();
    if (result.error) { showToast('Could not submit: ' + result.error.message); btn.disabled = false; return; }
    var w = {
      id: result.data.id, title: title, description: desc,
      requesterId: D.currentProfile.id, requesterName: D.currentProfile.display_name,
      resourceId: resource.id, resourceName: resource.name,
      status: 'New', infoNote: null, estimatedHours: null, estimatedCompletionDate: null,
      requestedCompletionDate: reqDate,
      acceptedAt: null, completedAt: null, createdAt: new Date().toISOString(), log: []
    };
    w.log.push(await writeLog('work_request_log', 'work_request_id', w.id, 'Submitted', reqDate ? 'Requested completion: ' + reqDate : ''));
    D.workRequests.push(w);
    showToast('Work request submitted');
    renderNav();
    myRequestsPageState.tab = 'work';
    nav('my-requests');
  };
}

var myWorkRequestsState = { tab: 'waiting', search: '' };
var myRequestsPageState = { tab: 'project' };
var workRequestLogOpen = {};

function toggleWorkRequestLog(id) {
  workRequestLogOpen[id] = !workRequestLogOpen[id];
  refreshWorkRequestView();
}

// A requested date the assignee changed on Accept is worth flagging back to
// the requester -- no separate DB flag needed, just compare the two dates.
function workRequestCompletionCellHtml(w) {
  if (!w.estimatedCompletionDate) return '<span class="text-muted">—</span>';
  var adjusted = w.requestedCompletionDate && w.requestedCompletionDate !== w.estimatedCompletionDate;
  return w.estimatedCompletionDate + (adjusted ? '<div class="text-muted" style="font-size:11px;margin-top:2px">you asked for ' + w.requestedCompletionDate + '</div>' : '');
}

// Shared row renderer for a work request, used by both My Work Requests
// (flavor 'assigned') and the Work Requests tab on My Requests (flavor
// 'submitted') -- same shape, different actions and "other party" column.
function workRequestRowHtml(w, flavor, opts) {
  opts = opts || {};
  var colCount = opts.colCount || 5;
  var logOpenNow = !!workRequestLogOpen[w.id];
  var logRow = '';
  if (logOpenNow) {
    var entries = (w.log && w.log.length) ? w.log.slice().reverse().map(function(e){
      return '<div class="raid-log-entry"><strong>' + e.date + '</strong> — ' + e.actor + ': ' + e.action + (e.detail ? ' (' + e.detail + ')' : '') + '</div>';
    }).join('') : '<div class="raid-log-entry text-muted">No history recorded</div>';
    logRow = '<tr><td colspan="' + colCount + '" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' + entries + '</div></td></tr>';
  }

  var reassignBtn = '<button class="btn btn-sm" onclick="openReassignResetModal(\'' + w.id + '\')"><i class="ti ti-user-exchange"></i> Reassign</button>';

  var actions = '';
  if (flavor === 'assigned') {
    if (w.status === 'New') {
      actions = '<button class="btn btn-sm btn-primary" onclick="openAcceptWorkRequestModal(\'' + w.id + '\')"><i class="ti ti-check"></i> Accept</button>' +
        '<button class="btn btn-sm" onclick="openSendBackModal(\'' + w.id + '\')"><i class="ti ti-corner-up-left"></i> Send back</button>' +
        '<button class="btn btn-sm btn-danger" onclick="openDeclineWorkRequestModal(\'' + w.id + '\')"><i class="ti ti-x"></i> Decline</button>';
    } else if (w.status === 'Needs Info') {
      actions = '<span class="text-muted" style="font-size:12px">Waiting on ' + w.requesterName + '</span>';
    } else if (w.status === 'Accepted') {
      actions = '<button class="btn btn-sm btn-success" onclick="openCompleteWorkRequestModal(\'' + w.id + '\')"><i class="ti ti-circle-check"></i> Mark complete</button>' +
        '<button class="btn btn-sm" onclick="openSendBackModal(\'' + w.id + '\')"><i class="ti ti-corner-up-left"></i> Send back</button>' + reassignBtn;
    }
  } else {
    if (w.status === 'New') {
      actions = '<span class="text-muted" style="font-size:12px">Waiting on ' + w.resourceName + '</span> <button class="btn btn-sm btn-danger" onclick="withdrawWorkRequest(\'' + w.id + '\')">Withdraw</button>' + reassignBtn;
    } else if (w.status === 'Needs Info') {
      actions = '<button class="btn btn-sm btn-primary" onclick="openReplyWorkRequestModal(\'' + w.id + '\')"><i class="ti ti-message-2"></i> Reply</button>' +
        '<button class="btn btn-sm btn-danger" onclick="withdrawWorkRequest(\'' + w.id + '\')">Withdraw</button>' + reassignBtn;
    } else if (w.status === 'Accepted') {
      actions = '<button class="btn btn-sm btn-success" onclick="openCompleteWorkRequestModal(\'' + w.id + '\')"><i class="ti ti-circle-check"></i> Mark complete</button>' + reassignBtn;
    }
  }

  var detailLine = '';
  if ((w.status === 'Needs Info' || w.status === 'Complete' || w.status === 'Declined') && w.infoNote) detailLine += '<div style="font-size:12px;color:#555;margin-top:4px;background:#f5f5f3;padding:6px 8px;border-radius:6px">' + w.infoNote + '</div>';
  if (flavor === 'assigned' && w.status === 'New' && w.requestedCompletionDate) detailLine += '<div class="text-muted" style="font-size:12px;margin-top:4px">Requested completion: ' + w.requestedCompletionDate + '</div>';
  if (w.status === 'Accepted' || w.status === 'Complete') {
    var bits = [];
    if (w.estimatedHours != null) bits.push(w.estimatedHours + ' hrs');
    if (!opts.showCompletionColumn && w.estimatedCompletionDate) bits.push('due ' + w.estimatedCompletionDate);
    if (bits.length) detailLine += '<div class="text-muted" style="font-size:12px;margin-top:4px">Est. ' + bits.join(', ') + '</div>';
  }

  return '<tr><td class="bold">' + w.title + (w.description ? '<div style="font-size:12px;color:#777;margin-top:4px;font-weight:400">' + w.description + '</div>' : '') + detailLine + '</td>' +
    '<td>' + (flavor==='assigned' ? w.requesterName : w.resourceName) + '</td>' +
    '<td><span class="badge ' + workRequestStatusBadgeClass(w.status) + '">' + w.status + '</span> ' + lateBadgeHtml(isWorkRequestLate(w)) + '</td>' +
    (opts.showCompletionColumn ? '<td class="text-muted">' + workRequestCompletionCellHtml(w) + '</td>' : '') +
    '<td class="text-muted">' + fmtDate(w.createdAt) + '</td>' +
    '<td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">' + actions +
      '<button class="btn btn-sm" title="History" onclick="toggleWorkRequestLog(\'' + w.id + '\')"><i class="ti ' + (logOpenNow?'ti-chevron-up':'ti-history') + '"></i></button>' +
    '</div></td></tr>' + logRow;
}

window.setMyWorkRequestsTab = function(t) { myWorkRequestsState.tab = t; pgMyWorkRequests(); };
window.onMyWorkRequestsSearch = function(val) {
  myWorkRequestsState.search = val;
  pgMyWorkRequests();
  var el = document.getElementById('my-wr-search');
  if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
};

function pgMyWorkRequests() {
  tb('My Work Requests');
  var st = myWorkRequestsState;
  var myId = D.myResourceId;
  var assigned = (D.workRequests || []).filter(function(w){ return myId && w.resourceId === myId; });
  var waitingList = assigned.filter(function(w){ return w.status === 'New' || w.status === 'Needs Info'; });
  var progressList = assigned.filter(function(w){ return w.status === 'Accepted'; });
  var doneList = assigned.filter(function(w){ return w.status === 'Complete' || w.status === 'Declined' || w.status === 'Withdrawn'; });
  var listByTab = { waiting: waitingList, progress: progressList, done: doneList };

  var currentList = (listByTab[st.tab] || waitingList).slice();
  if (st.search) {
    var q = st.search.toLowerCase();
    currentList = currentList.filter(function(w){ return w.title.toLowerCase().indexOf(q) >= 0 || (w.requesterName||'').toLowerCase().indexOf(q) >= 0; });
  }
  currentList.sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); });

  var rows = currentList.map(function(w){ return workRequestRowHtml(w, 'assigned'); }).join('');
  var header = '<tr><th>Request</th><th>From</th><th>Status</th><th>Submitted</th><th></th></tr>';
  var searchBar = '<div class="task-filter-bar"><input type="text" id="my-wr-search" placeholder="Search your work requests…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onMyWorkRequestsSearch(this.value)"></div>';

  document.getElementById('content').innerHTML =
    '<div class="tab-bar" style="margin-bottom:16px">' +
      '<div class="tab' + (st.tab==='waiting'?' active':'') + '" onclick="setMyWorkRequestsTab(\'waiting\')">Waiting for approval <span class="badge badge-gray">' + waitingList.length + '</span></div>' +
      '<div class="tab' + (st.tab==='progress'?' active':'') + '" onclick="setMyWorkRequestsTab(\'progress\')">In progress <span class="badge badge-gray">' + progressList.length + '</span></div>' +
      '<div class="tab' + (st.tab==='done'?' active':'') + '" onclick="setMyWorkRequestsTab(\'done\')">Completed <span class="badge badge-gray">' + doneList.length + '</span></div>' +
    '</div>' +
    '<div class="card">' + searchBar +
    (currentList.length
      ? '<div class="table-wrap"><table><thead>' + header + '</thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="empty-state" style="padding:30px"><i class="ti ti-inbox"></i><p>' + (st.search ? 'No work requests match your search' : 'Nothing here yet') + '</p></div>') +
    '</div>';
}

function openAcceptWorkRequestModal(id) {
  var w = D.workRequests.find(function(x){ return x.id === id; });
  showModal('<div class="modal-title">Accept "' + w.title + '" <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    (w.requestedCompletionDate ? '<p class="text-muted" style="font-size:13px;margin-bottom:12px">' + w.requesterName + ' asked for this by <strong>' + w.requestedCompletionDate + '</strong>. Keep that date below or pick a different one.</p>' : '') +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Estimated hours *</div><input type="number" id="awr-hours" min="0" step="0.5" placeholder="e.g. 4"></div>' +
    '<div class="form-group"><div class="form-label">Estimated completion date *</div><input type="date" id="awr-date" value="' + (w.requestedCompletionDate || '') + '"></div></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="awr-save"><i class="ti ti-check"></i> Accept</button></div>');
  document.getElementById('awr-save').onclick = async function() {
    var hours = document.getElementById('awr-hours').value;
    var date = document.getElementById('awr-date').value;
    if (!hours || !date) { showToast('Enter both estimated hours and a completion date'); return; }
    var btn = document.getElementById('awr-save'); btn.disabled = true;
    await acceptWorkRequest(id, parseFloat(hours), date);
    closeModal();
  };
}

function openNoteModal(id, title, placeholder, actionFn, btnLabel) {
  showModal('<div class="modal-title">' + title + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><textarea id="wr-note-input" rows="3" placeholder="' + placeholder + '"></textarea></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="wr-note-save"><i class="ti ti-check"></i> ' + btnLabel + '</button></div>');
  document.getElementById('wr-note-save').onclick = async function() {
    var note = document.getElementById('wr-note-input').value.trim();
    var btn = document.getElementById('wr-note-save'); btn.disabled = true;
    await actionFn(id, note);
    closeModal();
  };
}

function openSendBackModal(id) { openNoteModal(id, 'Send back for more info', 'What do you need to know?', sendBackWorkRequest, 'Send back'); }
function openDeclineWorkRequestModal(id) { openNoteModal(id, 'Decline this request', 'Optional reason (visible to the requester)', declineWorkRequest, 'Decline'); }
function openReplyWorkRequestModal(id) { openNoteModal(id, 'Reply with the missing detail', 'Add what they asked for…', replyWorkRequest, 'Send reply'); }
function openCompleteWorkRequestModal(id) { openNoteModal(id, 'Mark as complete', 'Anything worth noting about this completion? (optional)', completeWorkRequest, 'Mark complete'); }

async function acceptWorkRequest(id, hours, date) {
  var w = D.workRequests.find(function(x){ return x.id === id; });
  var result = await sb.from('work_requests').update({ status: 'Accepted', estimated_hours: hours, estimated_completion_date: date, accepted_at: new Date().toISOString() }).eq('id', id);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  w.status = 'Accepted'; w.estimatedHours = hours; w.estimatedCompletionDate = date; w.acceptedAt = new Date().toISOString();
  w.log = w.log || [];
  var acceptDetail = 'Est. ' + hours + ' hrs, due ' + date;
  if (w.requestedCompletionDate && w.requestedCompletionDate !== date) acceptDetail += ' (requested ' + w.requestedCompletionDate + ')';
  w.log.push(await writeLog('work_request_log', 'work_request_id', id, 'Accepted', acceptDetail));
  showToast('Accepted');
  refreshWorkRequestView();
}

async function sendBackWorkRequest(id, note) {
  var w = D.workRequests.find(function(x){ return x.id === id; });
  var result = await sb.from('work_requests').update({ status: 'Needs Info', info_note: note || null }).eq('id', id);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  w.status = 'Needs Info'; w.infoNote = note;
  w.log = w.log || [];
  w.log.push(await writeLog('work_request_log', 'work_request_id', id, 'Sent back for more info', note || ''));
  showToast('Sent back to requester');
  refreshWorkRequestView();
}

async function declineWorkRequest(id, note) {
  var w = D.workRequests.find(function(x){ return x.id === id; });
  var result = await sb.from('work_requests').update({ status: 'Declined', info_note: note || null }).eq('id', id);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  w.status = 'Declined'; w.infoNote = note;
  w.log = w.log || [];
  w.log.push(await writeLog('work_request_log', 'work_request_id', id, 'Declined', note || ''));
  showToast('Declined');
  refreshWorkRequestView();
}

async function replyWorkRequest(id, reply) {
  if (!reply) { showToast('Add a reply before sending'); return; }
  var w = D.workRequests.find(function(x){ return x.id === id; });
  var result = await sb.from('work_requests').update({ status: 'New', info_note: null }).eq('id', id);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  w.status = 'New'; w.infoNote = null;
  w.log = w.log || [];
  w.log.push(await writeLog('work_request_log', 'work_request_id', id, 'Replied', reply));
  showToast('Reply sent');
  refreshWorkRequestView();
}

async function completeWorkRequest(id, note) {
  var w = D.workRequests.find(function(x){ return x.id === id; });
  var result = await sb.from('work_requests').update({ status: 'Complete', completed_at: new Date().toISOString(), info_note: note || null }).eq('id', id);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  w.status = 'Complete'; w.completedAt = new Date().toISOString(); w.infoNote = note || null;
  w.log = w.log || [];
  w.log.push(await writeLog('work_request_log', 'work_request_id', id, 'Marked complete', note || ''));
  showToast('Marked complete');
  refreshWorkRequestView();
}

// Reassigning your own request or assignment resets to New rather than
// carrying the old estimate over -- the new person hasn't agreed to
// anything yet, so they go through their own Accept. (Admin's reassign,
// on the admin oversight page, deliberately keeps the existing estimate --
// that's for "this person is out, move their already-agreed work," a
// different situation from "this isn't the right person for this.")
function openReassignResetModal(id) {
  var w = D.workRequests.find(function(x){ return x.id === id; });
  var pool = individualResourceNames().filter(function(n){ return n !== w.resourceName; });
  var opts = pool.map(function(n){ return '<option value="' + n.replace(/"/g,'&quot;') + '">' + n + '</option>'; }).join('');
  showModal('<div class="modal-title">Reassign "' + w.title + '" <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<p class="text-muted" style="font-size:13px;margin-bottom:12px">Sends it back to New for the new person to accept on their own terms — any existing estimate is cleared.</p>' +
    '<div class="form-group"><div class="form-label">Assign to</div><select id="swr-resource">' + opts + '</select></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="swr-save"><i class="ti ti-check"></i> Reassign</button></div>');
  document.getElementById('swr-save').onclick = async function() {
    var name = document.getElementById('swr-resource').value;
    var resource = resolveResource(name);
    if (!resource) { showToast('Choose a resource'); return; }
    var btn = document.getElementById('swr-save'); btn.disabled = true;
    await reassignWorkRequestReset(id, resource);
    closeModal();
  };
}

async function reassignWorkRequestReset(id, resource) {
  var w = D.workRequests.find(function(x){ return x.id === id; });
  var old = w.resourceName;
  var result = await sb.from('work_requests').update({
    resource_id: resource.id, status: 'New', estimated_hours: null, estimated_completion_date: null, accepted_at: null, info_note: null
  }).eq('id', id);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  w.resourceId = resource.id; w.resourceName = resource.name; w.status = 'New';
  w.estimatedHours = null; w.estimatedCompletionDate = null; w.acceptedAt = null; w.infoNote = null;
  w.log = w.log || [];
  w.log.push(await writeLog('work_request_log', 'work_request_id', id, 'Reassigned', old + ' → ' + resource.name + ' (reset to New)'));
  showToast('Reassigned to ' + resource.name);
  refreshWorkRequestView();
}

async function withdrawWorkRequest(id) {
  if (!confirm('Withdraw this work request?')) return;
  var w = D.workRequests.find(function(x){ return x.id === id; });
  var result = await sb.from('work_requests').update({ status: 'Withdrawn' }).eq('id', id);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  w.status = 'Withdrawn';
  w.log = w.log || [];
  w.log.push(await writeLog('work_request_log', 'work_request_id', id, 'Withdrawn', ''));
  showToast('Withdrawn');
  refreshWorkRequestView();
}

var adminWorkRequestsState = { search: '', sort: 'title', dir: 'asc', filters: { requesterName: [], resourceName: [], status: [] } };

function pgAdminWorkRequests() {
  tb('Work Requests');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can access this page.</p></div>';
    return;
  }
  var st = adminWorkRequestsState;
  var all = D.workRequests || [];

  var requesterChoices = []; all.forEach(function(w){ if (w.requesterName && requesterChoices.indexOf(w.requesterName) < 0) requesterChoices.push(w.requesterName); }); requesterChoices.sort();
  var resourceChoices = []; all.forEach(function(w){ if (w.resourceName && resourceChoices.indexOf(w.resourceName) < 0) resourceChoices.push(w.resourceName); }); resourceChoices.sort();
  var statusChoices = ['New','Needs Info','Accepted','Complete','Declined','Withdrawn'];

  var list = all.slice();
  if (st.search) { var q = st.search.toLowerCase(); list = list.filter(function(w){ return w.title.toLowerCase().indexOf(q) >= 0; }); }
  if (st.filters.requesterName.length) list = list.filter(function(w){ return st.filters.requesterName.indexOf(w.requesterName) >= 0; });
  if (st.filters.resourceName.length) list = list.filter(function(w){ return st.filters.resourceName.indexOf(w.resourceName) >= 0; });
  if (st.filters.status.length) list = list.filter(function(w){ return st.filters.status.indexOf(w.status) >= 0; });

  list.sort(function(a, b) {
    var av, bv;
    if (st.sort === 'estimatedHours') { av = a.estimatedHours != null ? a.estimatedHours : -1; bv = b.estimatedHours != null ? b.estimatedHours : -1; }
    else { av = a[st.sort]; bv = b[st.sort]; av = (av == null ? '' : av); bv = (bv == null ? '' : bv); if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); } }
    var cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return st.dir === 'asc' ? cmp : -cmp;
  });

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }
  function filterIcon(col, active) { return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleAdminWrFilter(\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>'; }

  var searchBar = searchBoxHtml(st.search, 'Search work requests by title…', 'admin-wr-search', 'onAdminWrSearch');

  var rows = list.map(function(w) {
    return '<tr><td class="bold">' + w.title + '</td><td>' + w.requesterName + '</td><td>' + w.resourceName + '</td>' +
      '<td><span class="badge ' + workRequestStatusBadgeClass(w.status) + '">' + w.status + '</span> ' + lateBadgeHtml(isWorkRequestLate(w)) + '</td>' +
      '<td class="text-muted">' + (w.estimatedHours!=null ? w.estimatedHours : '—') + '</td>' +
      '<td class="text-muted">' + (w.estimatedCompletionDate || '—') + '</td>' +
      '<td><div style="display:flex;gap:4px">' +
      '<button class="btn btn-sm" onclick="openReassignWorkRequestModal(\'' + w.id + '\')"><i class="ti ti-user-exchange"></i> Reassign</button>' +
      '<button class="btn btn-sm btn-danger" onclick="deleteWorkRequest(\'' + w.id + '\')"><i class="ti ti-trash"></i></button>' +
      '</div></td></tr>';
  }).join('');

  var header = '<tr>' +
    '<th class="sortable-th" onclick="setAdminWrSort(\'title\')">Request ' + arrow('title') + '</th>' +
    '<th class="sortable-th"><span onclick="setAdminWrSort(\'requesterName\')">Requester ' + arrow('requesterName') + '</span>' + filterIcon('requesterName', st.filters.requesterName.length>0) + '</th>' +
    '<th class="sortable-th"><span onclick="setAdminWrSort(\'resourceName\')">Assigned to ' + arrow('resourceName') + '</span>' + filterIcon('resourceName', st.filters.resourceName.length>0) + '</th>' +
    '<th class="sortable-th"><span onclick="setAdminWrSort(\'status\')">Status ' + arrow('status') + '</span>' + filterIcon('status', st.filters.status.length>0) + '</th>' +
    '<th class="sortable-th" onclick="setAdminWrSort(\'estimatedHours\')">Est. hrs ' + arrow('estimatedHours') + '</th>' +
    '<th class="sortable-th" onclick="setAdminWrSort(\'estimatedCompletionDate\')">Due ' + arrow('estimatedCompletionDate') + '</th>' +
    '<th></th></tr>';

  document.getElementById('content').innerHTML = searchBar +
    (all.length
      ? (list.length
          ? '<div class="card"><div class="table-wrap"><table><thead>' + header + '</thead><tbody>' + rows + '</tbody></table></div></div>'
          : '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No work requests match your search or filters</p></div>')
      : '<div class="empty-state" style="padding:30px"><i class="ti ti-inbox"></i><p>No work requests yet</p></div>');

  window.onAdminWrSearch = function(v) {
    st.search = v; pgAdminWorkRequests();
    var el = document.getElementById('admin-wr-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setAdminWrSort = function(col) { if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; } pgAdminWorkRequests(); };
  window.toggleAdminWrFilter = function(col) {
    var labelMap = { requesterName:'Requester', resourceName:'Assigned to', status:'Status' };
    var choicesMap = { requesterName:requesterChoices, resourceName:resourceChoices, status:statusChoices };
    openFilterModal(labelMap[col], choicesMap[col],
      function() { return st.filters[col]; },
      function(val) { var arr = st.filters[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { st.filters[col] = []; },
      pgAdminWorkRequests
    );
  };
}

function openReassignWorkRequestModal(id) {
  var w = D.workRequests.find(function(x){ return x.id === id; });
  var pool = individualResourceNames();
  var opts = pool.map(function(n){ return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (n===w.resourceName?' selected':'') + '>' + n + '</option>'; }).join('');
  showModal('<div class="modal-title">Reassign "' + w.title + '" <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Assign to</div><select id="rwr-resource">' + opts + '</select></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="rwr-save"><i class="ti ti-check"></i> Reassign</button></div>');
  document.getElementById('rwr-save').onclick = async function() {
    var name = document.getElementById('rwr-resource').value;
    var resource = resolveResource(name);
    if (!resource) { showToast('Choose a resource'); return; }
    var btn = document.getElementById('rwr-save'); btn.disabled = true;
    var result = await sb.from('work_requests').update({ resource_id: resource.id }).eq('id', id);
    if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
    var old = w.resourceName;
    w.resourceId = resource.id; w.resourceName = resource.name;
    w.log = w.log || [];
    w.log.push(await writeLog('work_request_log', 'work_request_id', id, 'Reassigned', old + ' → ' + resource.name));
    showToast('Reassigned');
    closeModal();
    refreshWorkRequestView();
  };
}

async function deleteWorkRequest(id) {
  if (!confirm('Delete this work request? An admin can restore it later from Administration → Deleted Items.')) return;
  var result = await sb.from('work_requests').update({ deleted_at: new Date().toISOString(), deleted_by: D.currentProfile.id }).eq('id', id);
  if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
  D.workRequests = D.workRequests.filter(function(x){ return x.id !== id; });
  showToast('Work request deleted');
  refreshWorkRequestView();
}

// Admin oversight of personal to-dos -- the one kind of to-do that isn't
// visible anywhere else in the app (they're private to their assignee by
// design). D.personalTodos already holds every personal to-do an admin's
// RLS grants them, i.e. all of them, so there's no separate query needed
// here -- same data My Tasks reads, just not filtered down to "mine."
var adminPersonalTodosState = { search: '', sort: 'title', dir: 'asc', filters: { assignee: [], status: [] } };

function pgAdminCapacityWeights() {
  tb('Capacity Weights');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can access this page.</p></div>';
    return;
  }

  var tierInputsHtml = ALLOCATION_TIERS.map(function(tier){
    return '<div class="form-group"><div class="form-label">' + tier + '</div>' +
      '<input type="number" min="0" max="100" id="' + capacityWeightTierInputId(tier) + '" value="' + (ALLOCATION_TIER_PERCENT[tier] != null ? ALLOCATION_TIER_PERCENT[tier] : '') + '" oninput="updateCapacityWeightsPreview()"></div>';
  }).join('');

  var sizeInputsHtml = TSHIRT_SIZES.map(function(sz){
    var pct = TSHIRT_SIZE_LOAD_MULTIPLIER[sz] != null ? Math.round(TSHIRT_SIZE_LOAD_MULTIPLIER[sz] * 100) : '';
    return '<div class="form-group"><div class="form-label">' + sz + '</div>' +
      '<input type="number" min="0" max="500" id="' + capacityWeightSizeInputId(sz) + '" value="' + pct + '" oninput="updateCapacityWeightsPreview()"></div>';
  }).join('');

  document.getElementById('content').innerHTML =
    '<div class="card mb-16"><div class="section-title">How this works</div>' +
    '<div class="text-muted" style="font-size:13px;line-height:1.6">A project team member\'s assumed %-of-time load is their <strong>allocation tier</strong>\'s base % (set on the project\'s Team tab, values below) multiplied by the project\'s <strong>T-shirt size</strong> % (also below) — e.g. Owner/Lead at 50% on an XL project at 180% comes out to 90%. This feeds the Capacity page, My Capacity, and the Resources Current Load column everywhere in the app. A person can still override their own computed % for a specific project from their My Capacity page.</div></div>' +
    '<div class="card mb-16"><div class="section-title">Allocation tier base %</div><div class="grid-3">' + tierInputsHtml + '</div></div>' +
    '<div class="card mb-16"><div class="section-title">T-shirt size %</div><div class="grid-3">' + sizeInputsHtml + '</div></div>' +
    '<div class="card mb-16"><div class="section-title">Preview</div><div id="caw-preview"></div></div>' +
    '<button class="btn btn-primary" id="caw-save" onclick="saveCapacityWeights()"><i class="ti ti-check"></i> Save changes</button>';

  window.updateCapacityWeightsPreview = function() {
    var tierVals = {};
    ALLOCATION_TIERS.forEach(function(tier){ tierVals[tier] = parseFloat(document.getElementById(capacityWeightTierInputId(tier)).value) || 0; });
    var sizeVals = {};
    TSHIRT_SIZES.forEach(function(sz){ sizeVals[sz] = (parseFloat(document.getElementById(capacityWeightSizeInputId(sz)).value) || 0) / 100; });
    var head = '<tr><th></th>' + ALLOCATION_TIERS.map(function(tier){ return '<th>' + tier + ' (' + tierVals[tier] + '%)</th>'; }).join('') + '</tr>';
    var body = TSHIRT_SIZES.map(function(sz){
      return '<tr><td class="bold">' + sz + ' (' + Math.round(sizeVals[sz] * 100) + '%)</td>' +
        ALLOCATION_TIERS.map(function(tier){ return '<td>' + Math.round(tierVals[tier] * sizeVals[sz]) + '%</td>'; }).join('') +
        '</tr>';
    }).join('');
    var el = document.getElementById('caw-preview');
    if (el) el.innerHTML = '<div class="table-wrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  };
  updateCapacityWeightsPreview();
}

window.saveCapacityWeights = async function() {
  var btn = document.getElementById('caw-save'); if (btn) btn.disabled = true;
  var tierVals = {};
  ALLOCATION_TIERS.forEach(function(tier){
    var v = parseFloat(document.getElementById(capacityWeightTierInputId(tier)).value);
    tierVals[tier] = isNaN(v) ? 0 : Math.max(0, Math.min(100, v));
  });
  var sizeVals = {};
  TSHIRT_SIZES.forEach(function(sz){
    var v = parseFloat(document.getElementById(capacityWeightSizeInputId(sz)).value);
    sizeVals[sz] = (isNaN(v) ? 100 : Math.max(0, v)) / 100;
  });
  var result = await sb.from('capacity_weights').update({
    tier_percent: tierVals, size_multiplier: sizeVals, updated_at: new Date().toISOString(), updated_by: D.currentProfile.id
  }).eq('id', 'default');
  if (result.error) { showToast('Could not save: ' + result.error.message); if (btn) btn.disabled = false; return; }
  ALLOCATION_TIER_PERCENT = tierVals;
  TSHIRT_SIZE_LOAD_MULTIPLIER = sizeVals;
  showToast('Capacity weights updated');
  pgAdminCapacityWeights();
};

function pgAdminPersonalTodos() {
  tb('Personal To-Dos');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can access this page.</p></div>';
    return;
  }
  var st = adminPersonalTodosState;
  var all = D.personalTodos || [];

  var assigneeChoices = []; all.forEach(function(td){ var n = td.assignee || 'Unassigned'; if (assigneeChoices.indexOf(n) < 0) assigneeChoices.push(n); }); assigneeChoices.sort();
  var statusChoices = ['Not Started','In Progress','Done'];

  var list = all.slice();
  if (st.search) { var q = st.search.toLowerCase(); list = list.filter(function(td){ return td.title.toLowerCase().indexOf(q) >= 0; }); }
  if (st.filters.assignee.length) list = list.filter(function(td){ return st.filters.assignee.indexOf(td.assignee || 'Unassigned') >= 0; });
  if (st.filters.status.length) list = list.filter(function(td){ return st.filters.status.indexOf(td.status) >= 0; });

  list.sort(function(a, b) {
    var av, bv;
    if (st.sort === 'assignee') { av = (a.assignee||'').toLowerCase(); bv = (b.assignee||'').toLowerCase(); }
    else if (st.sort === 'status') { av = a.status || ''; bv = b.status || ''; }
    else if (st.sort === 'due') { av = a.due || ''; bv = b.due || ''; }
    else { av = a.title.toLowerCase(); bv = b.title.toLowerCase(); }
    var cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return st.dir === 'asc' ? cmp : -cmp;
  });

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }
  function filterIcon(col, active) { return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleAdminPersonalTodoFilter(\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>'; }

  var searchBar = searchBoxHtml(st.search, 'Search personal to-dos by title…', 'admin-ptd-search', 'onAdminPersonalTodoSearch');

  var rows = list.map(function(td) {
    var idx = D.personalTodos.indexOf(td);
    return '<tr><td class="bold">' + td.title + (td.description ? '<div style="font-size:12px;color:#777;margin-top:4px;font-weight:400">' + td.description + '</div>' : '') + '</td>' +
      '<td>' + (td.assignee || '<span class="text-muted">Unassigned</span>') + '</td>' +
      '<td>' + bdg(td.status) + '</td>' +
      '<td class="text-muted">' + (td.due || '—') + ' ' + lateBadgeHtml(isTodoLate(td)) + '</td>' +
      '<td><div style="display:flex;gap:4px">' +
      '<button class="btn btn-sm" onclick="openPersonalTodoModal(' + idx + ')"><i class="ti ti-edit"></i></button>' +
      '<button class="btn btn-sm btn-danger" onclick="deletePersonalTodo(' + idx + ')"><i class="ti ti-trash"></i></button>' +
      '</div></td></tr>';
  }).join('');

  var header = '<tr>' +
    '<th class="sortable-th" onclick="setAdminPersonalTodoSort(\'title\')">To-Do ' + arrow('title') + '</th>' +
    '<th class="sortable-th"><span onclick="setAdminPersonalTodoSort(\'assignee\')">Assignee ' + arrow('assignee') + '</span>' + filterIcon('assignee', st.filters.assignee.length>0) + '</th>' +
    '<th class="sortable-th"><span onclick="setAdminPersonalTodoSort(\'status\')">Status ' + arrow('status') + '</span>' + filterIcon('status', st.filters.status.length>0) + '</th>' +
    '<th class="sortable-th" onclick="setAdminPersonalTodoSort(\'due\')">Due ' + arrow('due') + '</th>' +
    '<th></th></tr>';

  document.getElementById('content').innerHTML =
    '<div class="text-muted" style="font-size:12px;margin-bottom:12px">Every member\'s personal to-dos, org-wide — these aren\'t tied to a project, so this is the only other place besides My Tasks to see and manage them.</div>' +
    searchBar +
    (all.length
      ? (list.length
          ? '<div class="card"><div class="table-wrap"><table><thead>' + header + '</thead><tbody>' + rows + '</tbody></table></div></div>'
          : '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No personal to-dos match your search or filters</p></div>')
      : '<div class="empty-state" style="padding:30px"><i class="ti ti-checklist"></i><p>No personal to-dos yet</p></div>');

  window.onAdminPersonalTodoSearch = function(v) {
    st.search = v; pgAdminPersonalTodos();
    var el = document.getElementById('admin-ptd-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setAdminPersonalTodoSort = function(col) { if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; } pgAdminPersonalTodos(); };
  window.toggleAdminPersonalTodoFilter = function(col) {
    var labelMap = { assignee:'Assignee', status:'Status' };
    var choicesMap = { assignee:assigneeChoices, status:statusChoices };
    openFilterModal(labelMap[col], choicesMap[col],
      function() { return st.filters[col]; },
      function(val) { var arr = st.filters[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { st.filters[col] = []; },
      pgAdminPersonalTodos
    );
  };
}

async function pgAdminUsers() {
  tb('Manage Users', D.role === 'admin' ? '<button class="btn btn-primary" onclick="openAddUserModal()"><i class="ti ti-user-plus"></i> Add user</button>' : '');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can manage users.</p></div>';
    return;
  }
  document.getElementById('content').innerHTML = '<div class="empty-state" style="padding:40px"><i class="ti ti-loader-2"></i><p>Loading users…</p></div>';
  var result = await sb.from('profiles').select('id, email, first_name, last_name, display_name, role, is_active, last_active_at');
  if (result.error) {
    document.getElementById('content').innerHTML = '<div class="empty-state" style="padding:40px"><p>Could not load users: ' + result.error.message + '</p></div>';
    return;
  }
  D.allUsers = result.data.sort(function(a,b){ return (a.display_name||'').localeCompare(b.display_name||''); });
  userActivityState.expandedId = null;
  userActivityState.cache = {};
  renderUsersTable();
}

var userActivityState = { expandedId: null, range: 30, cache: {} };

function findTaskActivityContext(taskId) {
  for (var i = 0; i < D.projects.length; i++) {
    var p = D.projects[i];
    var t = p.tasks.find(function(x){ return x.id === taskId; });
    if (t) return { project: p, label: t.title };
  }
  return null;
}
function findMilestoneActivityContext(msId) {
  for (var i = 0; i < D.projects.length; i++) {
    var p = D.projects[i];
    var m = p.milestones.find(function(x){ return x.id === msId; });
    if (m) return { project: p, label: m.name };
  }
  return null;
}
function findRaidActivityContext(raidId) {
  for (var i = 0; i < D.projects.length; i++) {
    var p = D.projects[i];
    var all = p.raid.risks.concat(p.raid.assumptions, p.raid.issues, p.raid.dependencies);
    var item = all.find(function(x){ return x.id === raidId; });
    if (item) return { project: p, label: item.desc };
  }
  return null;
}

async function loadUserActivityIfNeeded(userId) {
  var key = userId + '|' + userActivityState.range;
  if (userActivityState.cache[key]) return;
  var cutoff = new Date(Date.now() - userActivityState.range * 86400000).toISOString();
  var results = await Promise.all([
    sb.from('task_log').select('*').eq('actor_id', userId).gte('logged_at', cutoff),
    sb.from('milestone_log').select('*').eq('actor_id', userId).gte('logged_at', cutoff),
    sb.from('raid_log').select('*').eq('actor_id', userId).gte('logged_at', cutoff),
    sb.from('project_change_log').select('*').eq('changed_by', userId).gte('changed_at', cutoff)
  ]);
  var entries = [];
  (results[0].data || []).forEach(function(r) {
    var ctx = findTaskActivityContext(r.task_id);
    entries.push({ when: r.logged_at, kind: 'Task', label: ctx ? ctx.label : '(deleted task)', project: ctx ? ctx.project : null, action: r.action, detail: r.detail });
  });
  (results[1].data || []).forEach(function(r) {
    var ctx = findMilestoneActivityContext(r.milestone_id);
    entries.push({ when: r.logged_at, kind: 'Milestone', label: ctx ? ctx.label : '(deleted milestone)', project: ctx ? ctx.project : null, action: r.action, detail: r.detail });
  });
  (results[2].data || []).forEach(function(r) {
    var ctx = findRaidActivityContext(r.raid_item_id);
    entries.push({ when: r.logged_at, kind: 'RAID', label: ctx ? ctx.label : '(deleted item)', project: ctx ? ctx.project : null, action: r.action, detail: r.detail });
  });
  (results[3].data || []).forEach(function(r) {
    var proj = D.projects.find(function(p){ return p.id === r.project_id; });
    entries.push({ when: r.changed_at, kind: 'Project field', label: r.field_label, project: proj || null, action: (r.old_value||'—') + ' → ' + (r.new_value||'—'), detail: SOURCE_LABELS[r.source] || r.source });
  });
  entries.sort(function(a,b){ return (b.when||'').localeCompare(a.when||''); });
  userActivityState.cache[key] = entries;
}

async function toggleUserActivityExpand(userId) {
  if (userActivityState.expandedId === userId) { userActivityState.expandedId = null; renderUsersTable(); return; }
  userActivityState.expandedId = userId;
  renderUsersTable();
  await loadUserActivityIfNeeded(userId);
  renderUsersTable();
}

async function setUserActivityRange(days) {
  userActivityState.range = days;
  renderUsersTable();
  if (userActivityState.expandedId) {
    await loadUserActivityIfNeeded(userActivityState.expandedId);
    renderUsersTable();
  }
}

function userActivityPanelHtml() {
  var range = userActivityState.range;
  var entries = userActivityState.cache[userActivityState.expandedId + '|' + range];
  var rangeTabs = [7,30,90].map(function(d){
    return '<div class="tab' + (range===d?' active':'') + '" onclick="setUserActivityRange(' + d + ')">Last ' + d + ' days</div>';
  }).join('');
  var body;
  if (!entries) {
    body = '<div class="text-muted" style="padding:20px;text-align:center"><i class="ti ti-loader-2"></i> Loading…</div>';
  } else if (!entries.length) {
    body = '<div class="text-muted" style="padding:20px;text-align:center">No activity in this range</div>';
  } else {
    body = entries.map(function(e) {
      return '<div style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:13px">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
          '<span><span class="badge badge-gray" style="font-size:10px;margin-right:6px">' + e.kind + '</span>' +
          (e.project ? '<a href="#" onclick="goToProject(\'' + e.project.id + '\');return false;">' + e.project.name + '</a> — ' : '') +
          e.label + '</span>' +
          '<span class="text-muted" style="white-space:nowrap">' + fmtDate(e.when) + '</span>' +
        '</div>' +
        '<div class="text-muted" style="margin-top:2px">' + e.action + (e.detail ? ' (' + e.detail + ')' : '') + '</div>' +
      '</div>';
    }).join('');
  }
  return '<tr><td colspan="5" style="padding:16px;background:#fafaf8">' +
    '<div class="tab-bar" style="margin-bottom:12px">' + rangeTabs + '</div>' + body +
    '</td></tr>';
}

var manageUsersState = { search: '', sort: 'display_name', dir: 'asc', tab: 'active' };

function renderUsersTable() {
  var st = manageUsersState;
  var activeUsers = D.allUsers.filter(function(u){ return u.is_active !== false; });
  var deactivatedUsers = D.allUsers.filter(function(u){ return u.is_active === false; });
  var list = (st.tab === 'active' ? activeUsers : deactivatedUsers).slice();

  if (st.search) {
    var q = st.search.toLowerCase();
    list = list.filter(function(u){ return (u.display_name||'').toLowerCase().indexOf(q) >= 0 || (u.email||'').toLowerCase().indexOf(q) >= 0; });
  }

  list.sort(function(a, b) {
    var av, bv;
    if (st.sort === 'role') { av = roleLabel(a.role); bv = roleLabel(b.role); }
    else { av = a[st.sort]; bv = b[st.sort]; }
    av = (av == null ? '' : av); bv = (bv == null ? '' : bv);
    if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
    var cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return st.dir === 'asc' ? cmp : -cmp;
  });

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }

  var rows = list.map(function(u) {
    var isMe = D.currentProfile.id === u.id;
    var active = u.is_active !== false;
    var expanded = userActivityState.expandedId === u.id;
    var mainRow = '<tr>' +
      '<td>' + (u.display_name||u.email) + (isMe ? ' <span class="text-muted">(you)</span>' : '') + '</td>' +
      '<td class="text-muted">' + u.email + '</td>' +
      '<td>' + bdg(roleLabel(u.role)) + '</td>' +
      '<td class="text-muted">' + (u.last_active_at ? fmtDateTime(u.last_active_at) : 'Never') + '</td>' +
      '<td><div style="display:flex;gap:4px">' +
        '<button class="btn btn-sm" title="Activity history" onclick="toggleUserActivityExpand(\'' + u.id + '\')"><i class="ti ' + (expanded?'ti-chevron-up':'ti-history') + '"></i></button>' +
        '<button class="btn btn-sm" title="Edit" onclick="openEditUserModal(\'' + u.id + '\')"><i class="ti ti-edit"></i></button>' +
        '<button class="btn btn-sm" title="Set new password" onclick="openSetPasswordModal(\'' + u.id + '\',\'' + u.email + '\')"><i class="ti ti-key"></i></button>' +
        (!isMe ? (active
          ? '<button class="btn btn-sm btn-danger" title="Deactivate" onclick="toggleUserActive(\'' + u.id + '\',\'deactivate\')"><i class="ti ti-user-off"></i></button>'
          : '<button class="btn btn-sm btn-success" title="Reactivate" onclick="toggleUserActive(\'' + u.id + '\',\'reactivate\')"><i class="ti ti-user-check"></i></button>')
          : '') +
      '</div></td>' +
    '</tr>';
    return mainRow + (expanded ? userActivityPanelHtml() : '');
  }).join('');

  var searchBar = searchBoxHtml(st.search, 'Search users by name or email…', 'manage-users-search', 'onManageUsersSearch');

  var header = '<tr>' +
    '<th class="sortable-th" onclick="setManageUsersSort(\'display_name\')">Name ' + arrow('display_name') + '</th>' +
    '<th class="sortable-th" onclick="setManageUsersSort(\'email\')">Email ' + arrow('email') + '</th>' +
    '<th class="sortable-th" onclick="setManageUsersSort(\'role\')">Role ' + arrow('role') + '</th>' +
    '<th class="sortable-th" onclick="setManageUsersSort(\'last_active_at\')">Last active ' + arrow('last_active_at') + '</th>' +
    '<th></th></tr>';

  document.getElementById('content').innerHTML =
    '<div class="tab-bar" style="margin-bottom:16px">' +
      '<div class="tab' + (st.tab==='active'?' active':'') + '" onclick="setManageUsersTab(\'active\')">Active <span class="badge badge-gray">' + activeUsers.length + '</span></div>' +
      '<div class="tab' + (st.tab==='deactivated'?' active':'') + '" onclick="setManageUsersTab(\'deactivated\')">Deactivated <span class="badge badge-gray">' + deactivatedUsers.length + '</span></div>' +
    '</div>' +
    '<div class="card">' + searchBar +
    (list.length
      ? '<div class="table-wrap"><table><thead>' + header + '</thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="empty-state" style="padding:30px"><i class="ti ti-users"></i><p>' + (st.search ? 'No users match your search' : (st.tab==='active' ? 'No active users' : 'No deactivated users')) + '</p></div>') +
    '</div>';

  window.onManageUsersSearch = function(v) {
    st.search = v; renderUsersTable();
    var el = document.getElementById('manage-users-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
}

window.setManageUsersSort = function(col) {
  if (manageUsersState.sort === col) manageUsersState.dir = manageUsersState.dir === 'asc' ? 'desc' : 'asc';
  else { manageUsersState.sort = col; manageUsersState.dir = 'asc'; }
  renderUsersTable();
};
window.setManageUsersTab = function(t) { manageUsersState.tab = t; renderUsersTable(); };

function openEditUserModal(userId) {
  var u = D.allUsers.find(function(x){ return x.id === userId; });
  showModal('<div class="modal-title">Edit user <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">First name</div><input type="text" id="eu-first" value="' + (u.first_name||'') + '"></div>' +
    '<div class="form-group"><div class="form-label">Last name</div><input type="text" id="eu-last" value="' + (u.last_name||'') + '"></div></div>' +
    '<div class="form-group"><div class="form-label">Role</div><select id="eu-role">' +
      ['admin','member'].map(function(r){ return '<option value="' + r + '"' + (u.role===r?' selected':'') + '>' + roleLabel(r) + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="eu-save"><i class="ti ti-check"></i> Save changes</button></div>');
  document.getElementById('eu-save').onclick = async function() {
    var first = document.getElementById('eu-first').value.trim();
    var last = document.getElementById('eu-last').value.trim();
    var role = document.getElementById('eu-role').value;
    var displayName = (first + ' ' + last).trim() || u.email;
    var btn = document.getElementById('eu-save'); btn.disabled = true;
    var result = await sb.from('profiles').update({ first_name: first, last_name: last, display_name: displayName, role: role }).eq('id', userId);
    if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
    u.first_name = first; u.last_name = last; u.display_name = displayName; u.role = role;
    showToast('User updated');
    closeModal(); renderUsersTable();
  };
}

function openSetPasswordModal(userId, email) {
  showModal('<div class="modal-title">Set new password <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<p class="text-muted" style="font-size:13px;margin-bottom:14px">For ' + email + '. Share this new password with them directly — no email is sent.</p>' +
    '<div class="form-group"><div class="form-label">New password *</div>' +
      '<div style="display:flex;gap:8px"><input type="text" id="sp-password" placeholder="At least 8 characters"><button class="btn btn-sm" onclick="document.getElementById(\'sp-password\').value=generatePassword()" title="Generate a password"><i class="ti ti-refresh"></i></button></div>' +
    '</div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="sp-save"><i class="ti ti-key"></i> Set password</button></div>');
  document.getElementById('sp-save').onclick = async function() {
    var pw = document.getElementById('sp-password').value;
    if (!pw || pw.length < 8) { showToast('Password must be at least 8 characters'); return; }
    var btn = document.getElementById('sp-save'); btn.disabled = true;
    var result = await callAdminUsersApi({ action: 'set-password', userId: userId, newPassword: pw });
    if (!result) { btn.disabled = false; return; }
    showToast('Password updated — share it with ' + email + ' directly');
    closeModal();
  };
}

window.toggleUserActive = async function(userId, action) {
  if (!confirm(action === 'deactivate' ? 'Deactivate this account? They will not be able to log in until reactivated.' : 'Reactivate this account?')) return;
  var result = await callAdminUsersApi({ action: action, userId: userId });
  if (!result) return;
  var u = D.allUsers.find(function(x){ return x.id === userId; });
  u.is_active = action === 'reactivate';
  showToast(action === 'deactivate' ? 'Account deactivated' : 'Account reactivated');
  renderUsersTable();
};

function openAddUserModal() {
  showModal('<div class="modal-title">Add user <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">First name</div><input type="text" id="au-first"></div>' +
    '<div class="form-group"><div class="form-label">Last name</div><input type="text" id="au-last"></div></div>' +
    '<div class="form-group"><div class="form-label">Email *</div><input type="email" id="au-email" placeholder="name@yourcompany.com"></div>' +
    '<div class="form-group"><div class="form-label">Temporary password *</div>' +
      '<div style="display:flex;gap:8px"><input type="text" id="au-password" value="' + generatePassword() + '"><button class="btn btn-sm" onclick="document.getElementById(\'au-password\').value=generatePassword()" title="Generate a new one"><i class="ti ti-refresh"></i></button></div>' +
      '<p class="text-muted" style="font-size:12px;margin-top:6px">Share this with them directly — no email is sent. They can change it once logged in.</p>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Role</div><select id="au-role">' +
      '<option value="member" selected>Member</option><option value="admin">PMO Admin</option>' +
    '</select></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="au-save"><i class="ti ti-user-plus"></i> Add user</button></div>');
  document.getElementById('au-save').onclick = async function() {
    var email = document.getElementById('au-email').value.trim();
    var password = document.getElementById('au-password').value;
    if (!email) { showToast('Email required'); return; }
    if (!password || password.length < 8) { showToast('Temporary password must be at least 8 characters'); return; }
    var btn = document.getElementById('au-save'); btn.disabled = true; btn.innerHTML = 'Adding…';
    var result = await callAdminUsersApi({
      action: 'create', email: email, password: password,
      firstName: document.getElementById('au-first').value.trim(),
      lastName: document.getElementById('au-last').value.trim(),
      role: document.getElementById('au-role').value
    });
    if (!result) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-user-plus"></i> Add user'; return; }
    showToast('User added — share the temporary password with them directly');
    closeModal();
    pgAdminUsers();
  };
}

function pgImportProjects() {
  tb('Import Projects');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can import projects.</p></div>';
    return;
  }
  importState = { rows: null, profilesByEmail: null };
  document.getElementById('content').innerHTML =
    '<div class="card mb-16">' +
    '<div class="section-title">Bring in existing projects</div>' +
    '<p class="text-muted" style="font-size:13px;margin-bottom:16px">Use this to add in-flight projects directly, without sending each one through the request/approval workflow.</p>' +
    '<a class="btn btn-sm mb-16" href="pmo-hub-project-import-template.xlsx" download><i class="ti ti-download"></i> Download the import template</a>' +
    '<div class="form-group"><div class="form-label">Upload your filled-in template</div><input type="file" id="import-file" accept=".xlsx"></div>' +
    '</div>' +
    '<div id="import-preview"></div>';

  document.getElementById('import-file').addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) handleImportFile(e.target.files[0]);
  });
}

function pgExportProjects() {
  tb('Export Projects');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can export projects.</p></div>';
    return;
  }
  document.getElementById('content').innerHTML =
    '<div class="card">' +
    '<div class="section-title">Export all projects</div>' +
    '<p class="text-muted" style="font-size:13px;margin-bottom:16px">Downloads every project-level field (name, stage, owner, dates, financials, etc.) as one row per project. Tasks, milestones, RAID items, documents, and team assignments are not included — those are per-project sub-records, not project-level fields.</p>' +
    '<button class="btn btn-primary" onclick="exportProjectsToExcel()"><i class="ti ti-file-export"></i> Export ' + D.projects.length + ' project' + (D.projects.length===1?'':'s') + ' to Excel</button>' +
    '</div>';
}

var EXPORT_STAGE_LABELS = { backlog:'Backlog', planned:'Planned', active:'Active', complete:'Completed', hold:'Hold' };
var EXPORT_HEALTH_LABELS = { green:'Green', amber:'Amber', red:'Red' };

function exportProjectsToExcel() {
  if (!D.projects.length) { showToast('No projects to export'); return; }

  var rows = D.projects.map(function(p) {
    var row = {
      'Project ID': p.id,
      'Project Number': p.projectNumber || '',
      'Project Name': p.name || '',
      'Stage': EXPORT_STAGE_LABELS[p.stage] || p.stage || '',
      'Status': p.status || '',
      'Phase': p.phase || '',
      'Priority': p.priority || '',
      'Priority Rank': p.priorityRank != null ? p.priorityRank : ''
    };
    Object.assign(row, {
      'Health': EXPORT_HEALTH_LABELS[p.health] || p.health || 'Not set',
      'Progress %': p.progress != null ? p.progress : '',
      'Category': (p.categories || []).join(', '),
      'Tags': (p.tags || []).join(', '),
      'Business Unit': p.businessUnit || '',
      'Value Area': p.value || '',
      'Owner': p.owner || '',
      'Sponsor': p.sponsor || '',
      'Delivery Methodology': p.deliveryMethodology || '',
      'T-shirt Size': p.tshirtSize || '',
      'Start Date': p.start || '',
      'Target End Date': p.end || '',
      'Planned Start': p.plannedStart || '',
      'Target Quarter': p.targetQuarter || '',
      'Target Year': p.targetYear || '',
      'Target End Quarter': p.targetEndQuarter || '',
      'Target End Year': p.targetEndYear || '',
      'Completed At': p.completedAt || '',
      'Hold Reason': p.holdReason || '',
      'Pre-Hold Stage': EXPORT_STAGE_LABELS[p.preHoldStage] || p.preHoldStage || '',
      'Held At': p.heldAt || '',
      'Description': p.description || '',
      'Blockers': p.blockers || '',
      'Opportunity Type': p.estimatedType || '',
      'Estimated Amount': p.estimatedAmount != null ? p.estimatedAmount : '',
      'Estimated Frequency': p.estimatedFrequency || '',
      'Opportunity Type Confidence': p.valueConfidence || '',
      'Cost Estimate': p.costEstimate != null ? p.costEstimate : '',
      'Cost Estimate Confidence': p.costConfidence || '',
      'Created At': p.createdAt || ''
    });
    return row;
  });

  var ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] || {}).map(function(){ return { wch: 18 }; });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Projects');
  var stamp = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, 'pmo-hub-projects-export-' + stamp + '.xlsx');
}

function resourceOpenTaskCount(r) {
  var count = 0;
  D.projects.forEach(function(p){ p.tasks.forEach(function(t){ if (t.assigneeId === r.id && t.status !== 'Done') count++; }); });
  return count;
}

function resourceLateTaskCount(r) {
  var count = 0;
  D.projects.forEach(function(p){ p.tasks.forEach(function(t){ if (t.assigneeId === r.id && isTaskLate(t)) count++; }); });
  return count;
}

// "Open" here means still active in some form -- New/Needs Info/Accepted --
// as opposed to Complete/Declined/Withdrawn.
function resourceOpenWorkRequests(r) {
  return (D.workRequests || []).filter(function(w){
    return w.resourceId === r.id && (w.status === 'New' || w.status === 'Needs Info' || w.status === 'Accepted');
  });
}

function resourceWorkRequestSummary(r) {
  var open = resourceOpenWorkRequests(r);
  if (!open.length) return '<span class="text-muted">—</span>';
  var hrs = open.reduce(function(sum, w){ return sum + (w.estimatedHours || 0); }, 0);
  var lateCount = open.filter(isWorkRequestLate).length;
  return open.length + ' open' + (hrs > 0 ? ' · ' + hrs + ' hrs' : '') +
    (lateCount > 0 ? ' ' + lateBadgeHtml(true, lateCount + ' of these ' + (lateCount===1?'is':'are') + ' past its committed date') : '');
}

// This-month %-load badge for the Resources admin table -- same figure and
// color thresholds as the Capacity heat map, computed just for the current
// month bucket, with a shortcut into the full Capacity view.
function resourceCurrentLoadBadgeHtml(r) {
  var m = capacityMonthBuckets(new Date(), 1)[0];
  var placed = resourcePlacedProjects(r);
  var openWR = r.type === 'individual' ? resourceOpenWorkRequests(r) : [];
  var pct = resourceMonthLoadPct(r, placed, openWR, m);
  var bg = pct >= 110 ? '#F0A7A3' : pct >= 80 ? '#F5CE8B' : pct >= 50 ? '#BFE3D3' : '#f0ede8';
  var fg = pct === 0 ? '#999' : '#3a3a3a';
  return '<button class="btn btn-sm" style="background:' + bg + ';color:' + fg + ';border:none" title="View in Capacity" onclick="nav(\'capacity\')">' + pct + '%</button>';
}

function resourceCombinedProjectIds(r) {
  var ids = (r.projects || []).slice();
  var ownedIds = [];
  D.projects.forEach(function(p){
    if (p.ownerId === r.id) {
      ownedIds.push(p.id);
      if (ids.indexOf(p.id) < 0) ids.push(p.id);
    }
  });
  return { allIds: ids, ownedIds: ownedIds };
}

function pgResources() {
  tb('Resources', D.role==='admin' ? '<button class="btn btn-primary" onclick="openAddResource()"><i class="ti ti-plus"></i> Add resource</button>' : '');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can access Resources.</p></div>';
    return;
  }
  var st = resourcesPageState;
  var individuals = D.resources.filter(function(r){ return r.type === 'individual'; });
  var teams = D.resources.filter(function(r){ return r.type === 'team'; });

  var list = st.tab === 'individual' ? individuals : teams;
  if (st.search) {
    var q = st.search.toLowerCase();
    list = list.filter(function(r){
      return r.name.toLowerCase().indexOf(q) >= 0 ||
        (r.role||'').toLowerCase().indexOf(q) >= 0 ||
        (r.teamName||'').toLowerCase().indexOf(q) >= 0 ||
        (r.managerName||'').toLowerCase().indexOf(q) >= 0;
    });
  }
  var resSortMonth = capacityMonthBuckets(new Date(), 1)[0];
  function resLoadPct(r) { return resourceMonthLoadPct(r, resourcePlacedProjects(r), r.type === 'individual' ? resourceOpenWorkRequests(r) : [], resSortMonth); }
  function resWorkRequestHours(r) { return resourceOpenWorkRequests(r).reduce(function(sum, w){ return sum + (w.estimatedHours || 0); }, 0); }
  list = list.slice().sort(function(a, b) {
    var av, bv;
    if (st.sort === 'projects') { av = resourceCombinedProjectIds(a).allIds.length; bv = resourceCombinedProjectIds(b).allIds.length; }
    else if (st.sort === 'tasks') { av = resourceOpenTaskCount(a) || 0; bv = resourceOpenTaskCount(b) || 0; }
    else if (st.sort === 'members') { av = (a.members||[]).length; bv = (b.members||[]).length; }
    else if (st.sort === 'workRequests') { av = resWorkRequestHours(a); bv = resWorkRequestHours(b); }
    else if (st.sort === 'load') { av = resLoadPct(a); bv = resLoadPct(b); }
    else { av = (a[st.sort]||'').toString().toLowerCase(); bv = (b[st.sort]||'').toString().toLowerCase(); }
    if (av < bv) return st.dir === 'asc' ? -1 : 1;
    if (av > bv) return st.dir === 'asc' ? 1 : -1;
    return 0;
  });

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }
  function projectExpandRow(r, colspan) {
    if (st.expandedId !== r.id) return '';
    var combined = resourceCombinedProjectIds(r);
    var rows = combined.allIds.map(function(pid){
      var p = D.projects.find(function(x){ return x.id===pid; });
      if (!p) return null;
      var isOwner = combined.ownedIds.indexOf(pid) >= 0;
      return { id:p.id, name:p.name, stage:p.stage, isOwner:isOwner };
    }).filter(Boolean);
    rows.sort(function(a,b){ return (STAGE_SORT_RANK[a.stage]!=null?STAGE_SORT_RANK[a.stage]:9) - (STAGE_SORT_RANK[b.stage]!=null?STAGE_SORT_RANK[b.stage]:9); });
    var body = rows.length
      ? rows.map(function(p){
          return '<div style="display:flex;align-items:center;gap:10px;padding:4px 0">' +
            '<button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i></button>' +
            '<span>' + p.name + ' ' + stagePill(p.stage) + ' <span class="badge ' + (p.isOwner ? 'badge-purple' : 'badge-gray') + '" style="font-size:10px">' + (p.isOwner ? 'Owner' : 'Contributor') + '</span></span></div>';
        }).join('')
      : '<span class="text-muted">No projects assigned</span>';
    return '<tr><td colspan="' + colspan + '" style="background:#faf9f7;padding:10px 16px">' + body + '</td></tr>';
  }
  window.toggleResourceExpand = function(rid) { resourcesPageState.expandedId = resourcesPageState.expandedId === rid ? null : rid; pgResources(); };
  function teamMembersExpandRow(r, colspan) {
    if (resourcesPageState.expandedMembersId !== r.id) return '';
    var names = (r.members||[]).slice().sort(function(a,b){ return a.localeCompare(b); });
    var body = names.length
      ? names.map(function(n){
          var mr = D.resources.find(function(x){ return x.name === n; });
          return '<div style="display:flex;align-items:center;gap:10px;padding:4px 0">' +
            (mr ? '<button class="btn btn-sm" onclick="editResource(\'' + mr.id + '\')"><i class="ti ti-edit"></i></button>' : '<span style="display:inline-block;width:26px"></span>') +
            '<span>' + n + '</span></div>';
        }).join('')
      : '<span class="text-muted">No members yet</span>';
    return '<tr><td colspan="' + colspan + '" style="background:#faf9f7;padding:10px 16px">' + body + '</td></tr>';
  }
  window.toggleResourceMembersExpand = function(rid) { resourcesPageState.expandedMembersId = resourcesPageState.expandedMembersId === rid ? null : rid; pgResources(); };

  var tableHtml;
  if (st.tab === 'individual') {
    var rows = list.map(function(r) {
      var taskCount = resourceOpenTaskCount(r);
      var combinedCount = resourceCombinedProjectIds(r).allIds.length;
      var linkIcon = r.userId ? '<i class="ti ti-link" title="Linked to a real account" style="color:#1D9E75"></i>' : '<i class="ti ti-link-off" title="Not linked yet" style="color:#ccc"></i>';
      return '<tr>' +
        '<td class="bold">' + (r.firstName||'') + '</td>' +
        '<td class="bold">' + (r.lastName||'') + '</td>' +
        '<td class="text-muted">' + (r.role||'—') + '</td>' +
        '<td style="text-align:center">' + linkIcon + '</td>' +
        '<td class="text-muted">' + (r.teamName||'—') + '</td>' +
        '<td><button class="btn btn-sm" onclick="toggleResourceExpand(\'' + r.id + '\')">' + combinedCount + ' <i class="ti ' + (st.expandedId===r.id?'ti-chevron-up':'ti-chevron-down') + '"></i></button></td>' +
        '<td class="text-muted">' + (taskCount === null ? '—' : taskCount) + ' ' + lateBadgeHtml(resourceLateTaskCount(r) > 0, resourceLateTaskCount(r) + ' past due') + '</td>' +
        '<td class="text-muted">' + resourceWorkRequestSummary(r) + '</td>' +
        '<td>' + resourceCurrentLoadBadgeHtml(r) + '</td>' +
        '<td><button class="btn btn-sm" onclick="editResource(\'' + r.id + '\')"><i class="ti ti-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="deleteResource(\'' + r.id + '\')"><i class="ti ti-trash"></i></button></td>' +
        '</tr>' + projectExpandRow(r, 10);
    }).join('');
    tableHtml = '<table><thead><tr>' +
      '<th class="sortable-th" onclick="setResourceSort(\'firstName\')">First name ' + arrow('firstName') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'lastName\')">Last name ' + arrow('lastName') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'role\')">Role ' + arrow('role') + '</th>' +
      '<th style="text-align:center">Linked</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'teamName\')">Team ' + arrow('teamName') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'projects\')">Projects ' + arrow('projects') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'tasks\')">Open tasks ' + arrow('tasks') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'workRequests\')">Work requests ' + arrow('workRequests') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'load\')" title="This month\'s capacity load — BAU % + project tiers + work requests">Current Load ' + arrow('load') + '</th>' +
      '<th></th></tr></thead><tbody>' + rows + '</tbody></table>';
  } else {
    var trows = list.map(function(r) {
      var combinedCount = resourceCombinedProjectIds(r).allIds.length;
      var memberCount = (r.members||[]).length;
      return '<tr>' +
        '<td class="bold">' + r.name + '</td>' +
        '<td class="text-muted">' + (r.managerName||'—') + '</td>' +
        '<td><button class="btn btn-sm" onclick="toggleResourceMembersExpand(\'' + r.id + '\')">' + memberCount + ' <i class="ti ' + (resourcesPageState.expandedMembersId===r.id?'ti-chevron-up':'ti-chevron-down') + '"></i></button></td>' +
        '<td><button class="btn btn-sm" onclick="toggleResourceExpand(\'' + r.id + '\')">' + combinedCount + ' <i class="ti ' + (st.expandedId===r.id?'ti-chevron-up':'ti-chevron-down') + '"></i></button></td>' +
        '<td>' + resourceCurrentLoadBadgeHtml(r) + '</td>' +
        '<td><button class="btn btn-sm" onclick="editResource(\'' + r.id + '\')"><i class="ti ti-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="deleteResource(\'' + r.id + '\')"><i class="ti ti-trash"></i></button></td>' +
        '</tr>' + teamMembersExpandRow(r, 6) + projectExpandRow(r, 6);
    }).join('');
    tableHtml = '<table><thead><tr>' +
      '<th class="sortable-th" onclick="setResourceSort(\'name\')">Team ' + arrow('name') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'managerName\')">Manager ' + arrow('managerName') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'members\')">Members ' + arrow('members') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'projects\')">Projects ' + arrow('projects') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'load\')" title="This month\'s capacity load — BAU % + project tiers + work requests">Current Load ' + arrow('load') + '</th>' +
      '<th></th></tr></thead><tbody>' + trows + '</tbody></table>';
  }

  document.getElementById('content').innerHTML =
    '<div class="tab-bar" style="margin-bottom:16px">' +
      '<div class="tab' + (st.tab==='individual'?' active':'') + '" onclick="setResourceTab(\'individual\')">Individuals <span class="badge badge-gray">' + individuals.length + '</span></div>' +
      '<div class="tab' + (st.tab==='team'?' active':'') + '" onclick="setResourceTab(\'team\')">Teams <span class="badge badge-gray">' + teams.length + '</span></div>' +
    '</div>' +
    '<div class="card"><div class="task-filter-bar"><input type="text" id="res-search" placeholder="Search resources…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onResourceSearch(this.value)"></div>' +
    (list.length ? '<div class="table-wrap">' + tableHtml + '</div>' : '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No resources match your search</p></div>') +
    '</div>';

  window.setResourceTab = function(t) { resourcesPageState.tab = t; resourcesPageState.sort = t === 'individual' ? 'firstName' : 'name'; resourcesPageState.dir = 'asc'; resourcesPageState.expandedId = null; resourcesPageState.expandedMembersId = null; pgResources(); };
  window.setResourceSort = function(col) {
    if (resourcesPageState.sort === col) resourcesPageState.dir = resourcesPageState.dir === 'asc' ? 'desc' : 'asc';
    else { resourcesPageState.sort = col; resourcesPageState.dir = 'asc'; }
    pgResources();
  };
  window.onResourceSearch = function(val) {
    resourcesPageState.search = val;
    pgResources();
    var el = document.getElementById('res-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
}

// ── Capacity ─────────────────────────────────────────────────────────────────

// A resource's "placed" projects - the subset of resourceCombinedProjectIds()
// that actually has a time range (via projectTimeRange), i.e. what can show
// up on the timeline at all. Hold/complete/no-estimate projects are real
// assignments but aren't placeable, so they're excluded here rather than
// counted as if they had a time slot.
function resourcePlacedProjects(r) {
  return resourceCombinedProjectIds(r).allIds
    .map(function(id){ return D.projects.find(function(p){ return p.id === id; }); })
    .filter(Boolean)
    .map(function(p){ return { project: p, range: projectTimeRange(p) }; })
    .filter(function(x){ return x.range; });
}

// Assumed hours in one standard month, for converting a work request's
// estimated_hours into a %-of-month figure.
function monthCapacityHours() { return STANDARD_WORK_WEEK_HOURS * 52 / 12; }

// Prorates an open work request's estimated hours evenly across the working
// days between when it was accepted (or today, if not yet accepted) and its
// estimated completion date, then returns the hours falling within one
// month bucket [m.start, m.end). Work requests with no completion date (not
// yet estimated) or no hours can't be placed on a timeline at all, so they
// contribute 0 here -- same limitation as an unplaced project.
function workRequestHoursInMonth(w, m) {
  if (!w.estimatedCompletionDate || !w.estimatedHours) return 0;
  var startStr = w.acceptedAt ? w.acceptedAt.slice(0, 10) : todayStr();
  var endStr = w.estimatedCompletionDate;
  if (endStr < startStr) startStr = endStr;
  var totalDays = workingDaysBetween(startStr, endStr) || 1;
  var mLastDay = new Date(m.end.getFullYear(), m.end.getMonth(), 0);
  var mStartStr = m.start.toISOString().slice(0, 10);
  var mEndStr = mLastDay.toISOString().slice(0, 10);
  var overlapStart = startStr > mStartStr ? startStr : mStartStr;
  var overlapEnd = endStr < mEndStr ? endStr : mEndStr;
  var overlapDays = workingDaysBetween(overlapStart, overlapEnd) || 0;
  return (w.estimatedHours / totalDays) * overlapDays;
}

// A rough, month-length-independent % figure for a single work request, used
// in the detail view where there's no specific month bucket to place it in.
function workRequestApproxPct(w) {
  if (!w.estimatedCompletionDate || !w.estimatedHours) return null;
  var startStr = w.acceptedAt ? w.acceptedAt.slice(0, 10) : todayStr();
  var endStr = w.estimatedCompletionDate;
  if (endStr < startStr) startStr = endStr;
  var totalDays = workingDaysBetween(startStr, endStr) || 1;
  var hoursPerDay = w.estimatedHours / totalDays;
  var standardHoursPerDay = STANDARD_WORK_WEEK_HOURS / 5;
  return Math.round((hoursPerDay / standardHoursPerDay) * 100);
}

// Total %-of-time load for one resource in one month bucket: BAU baseline
// (constant every month) + tier% for every placed project overlapping the
// month (only counted once its owner has actually set a tier -- see the
// Team tab) + prorated work-request hours converted to a % of a standard
// month. Teams have neither a BAU % nor their own work requests, so `placed`
// (tier contributions) is the only input that applies to them.
function resourceMonthLoadPct(r, placed, openWR, m) {
  var bau = r.bauPercent || 0;
  var projectPct = placed.reduce(function(sum, x) {
    if (!(x.range.end >= m.start && x.range.start < m.end)) return sum;
    return sum + effectiveAllocationPct(x.project, r.id);
  }, 0);
  var wrHours = openWR.reduce(function(sum, w){ return sum + workRequestHoursInMonth(w, m); }, 0);
  var cap = monthCapacityHours();
  var wrPct = cap > 0 ? (wrHours / cap) * 100 : 0;
  return Math.round(bau + projectPct + wrPct);
}

function capacityMonthBuckets(windowStart, windowMonths) {
  var months = [];
  for (var i = 0; i < windowMonths; i++) {
    var d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1);
    var next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    months.push({ start: d, end: next, label: d.toLocaleString('en-US', { month: 'short' }) + (d.getMonth() === 0 ? " '" + String(d.getFullYear()).slice(2) : '') });
  }
  return months;
}

function capacityHeatCellHtml(pct, monthLabel) {
  var bg = pct >= 110 ? '#F0A7A3' : pct >= 80 ? '#F5CE8B' : pct >= 50 ? '#BFE3D3' : '#f0ede8';
  var fg = pct === 0 ? '#999' : '#3a3a3a';
  return '<div class="cap-heat-cell" style="background:' + bg + ';color:' + fg + '" title="' + monthLabel + ': ' + pct + '% load">' + (pct ? pct + '%' : '') + '</div>';
}

// Fractional month-index position of a date within the window, for placing a
// project bar on the expanded detail Gantt (mirrors pgFuturePlanning's
// quarterPosition, but written fresh since that one's a private closure).
function capacityMonthPos(d, windowStart) {
  var daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return (d.getFullYear() - windowStart.getFullYear()) * 12 + (d.getMonth() - windowStart.getMonth()) + (d.getDate() - 1) / daysInMonth;
}

function capacityDetailBarHtml(entry, windowStart, totalMonths, r) {
  var p = entry.project, range = entry.range;
  var startPos = capacityMonthPos(range.start, windowStart);
  var endPos = capacityMonthPos(range.end, windowStart) + 0.05;
  var clampedStart = Math.max(0, startPos), clampedEnd = Math.min(totalMonths, endPos);
  var tier = p.teamTiers ? p.teamTiers[r.id] : null;
  var overridden = p.teamOverrides && p.teamOverrides[r.id] != null;
  var tierBadge = tier
    ? ' <span class="badge badge-purple" style="font-size:10px">' + tier + ' · ' + effectiveAllocationPct(p, r.id) + '%' + (overridden ? ' (self-set)' : '') + '</span>'
    : ' <span class="badge badge-gray" style="font-size:10px">Tier not set</span>';
  var viewBtn = '<button class="btn btn-sm" style="padding:1px 5px;margin-right:4px" title="View project" onclick="event.stopPropagation();goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i></button>';
  if (clampedEnd <= 0 || clampedStart >= totalMonths) {
    return '<div class="tl-row"><div class="tl-label" title="' + p.name + '">' + viewBtn + p.name + tierBadge + '</div><div class="tl-wrap"><span class="text-muted" style="font-size:11px;padding-left:8px">Outside this window</span></div></div>';
  }
  var isEstimate = p.stage === 'backlog';
  var widthPct = Math.max(0.5, clampedEnd - clampedStart) / totalMonths * 100;
  var leftPct = clampedStart / totalMonths * 100;
  var barStyle = isEstimate
    ? 'background:repeating-linear-gradient(45deg,#EFCB8E,#EFCB8E 6px,#FBF0DA 6px,#FBF0DA 12px);border:1px dashed #BA7517;color:#63410A'
    : 'background:' + (PHASE_COLORS[p.phase] || '#534AB7');
  var lateNow = isProjectLate(p);
  if (lateNow) barStyle += ';box-shadow:inset 0 0 0 2px #B23A3A';
  return '<div class="tl-row"><div class="tl-label" title="' + p.name + '">' + viewBtn + p.name + tierBadge + '</div>' +
    '<div class="tl-wrap"><div class="tl-bar" style="left:' + leftPct + '%;width:' + widthPct + '%;' + barStyle + '" title="' + (lateNow ? 'Late — ' : '') + (isEstimate ? 'Estimate' : (p.phase||'')) + '">' + (lateNow ? '<i class="ti ti-alert-triangle"></i> ' : '') + (isEstimate ? 'Estimate' : (p.phase||'')) + '</div></div></div>';
}

// Work requests have no date range to place on the Gantt-style bars above,
// so the expanded detail lists them as plain rows instead -- same .tl-row
// shell as capacityDetailBarHtml, just without a positioned bar.
function capacityWorkRequestDetailRowHtml(w) {
  var approxPct = workRequestApproxPct(w);
  return '<div class="tl-row"><div class="tl-label" title="' + w.title + '">' + w.title + '</div>' +
    '<div class="tl-wrap" style="display:flex;align-items:center;gap:8px;padding-left:8px">' +
    '<span class="badge ' + workRequestStatusBadgeClass(w.status) + '" style="font-size:11px">' + w.status + '</span>' +
    '<span class="text-muted" style="font-size:11px">from ' + w.requesterName + '</span>' +
    (w.estimatedHours != null ? '<span class="text-muted" style="font-size:11px">' + w.estimatedHours + ' hrs</span>' : '') +
    (approxPct != null ? '<span class="text-muted" style="font-size:11px">≈ ' + approxPct + '% of a work day, until due</span>' : '') +
    (w.estimatedCompletionDate ? '<span class="text-muted" style="font-size:11px">due ' + w.estimatedCompletionDate + '</span>' : '') +
    lateBadgeHtml(isWorkRequestLate(w)) +
    '</div></div>';
}

function capacityResourceRowHtml(r, months, windowStart, indent) {
  var placed = resourcePlacedProjects(r);
  var combinedTotal = resourceCombinedProjectIds(r).allIds.length;
  var unplacedCount = combinedTotal - placed.length;
  var openWR = r.type === 'individual' ? resourceOpenWorkRequests(r) : [];
  var cells = months.map(function(m) {
    var pct = resourceMonthLoadPct(r, placed, openWR, m);
    return capacityHeatCellHtml(pct, m.label);
  }).join('');
  var expanded = capacityPageState.expandedId === r.id;
  var detail = '';
  if (expanded) {
    var bars = placed.map(function(x){ return capacityDetailBarHtml(x, windowStart, months.length, r); }).join('');
    detail = '<div style="padding:10px 0 4px 0">' +
      (r.type === 'individual' ? '<div class="text-muted" style="font-size:12px;margin-bottom:8px">BAU (non-project) time: ' + (r.bauPercent != null ? r.bauPercent + '%' : 'not self-reported yet') + '</div>' : '') +
      (bars || '<span class="text-muted" style="font-size:12px">No placed projects in this window</span>') +
      (unplacedCount > 0 ? '<div class="text-muted" style="font-size:11px;margin-top:6px">+' + unplacedCount + ' more assigned but not shown (on hold, completed, or missing a schedule/estimate)</div>' : '') +
      (r.type === 'individual'
        ? '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #eee">' +
          '<div style="font-size:11px;color:#999;margin-bottom:6px;text-transform:uppercase;letter-spacing:.03em">Work requests</div>' +
          (openWR.length ? openWR.map(capacityWorkRequestDetailRowHtml).join('') : '<span class="text-muted" style="font-size:12px">No open work requests</span>') +
          '</div>'
        : '') +
      '</div>';
  }
  // Work requests are only ever assigned to individuals, kept as a plain
  // number/hours summary rather than folded into the month heat-track --
  // there's no date range to place a bar with, just an hours estimate.
  var wrCell = '<div style="width:140px;min-width:140px;font-size:12px;color:#666;text-align:right;padding-right:4px">' +
    (r.type === 'individual' ? resourceWorkRequestSummary(r) : '') + '</div>';
  // Indent lives inside the fixed-width label (padding, not margin) so the
  // heat-track columns stay aligned with the month header regardless of
  // nesting depth - shifting the whole row would offset it from the header.
  return '<div class="tl-row" style="cursor:pointer" onclick="toggleCapacityExpand(\'' + r.id + '\')">' +
    '<div class="tl-label" style="padding-left:' + (indent||0) + 'px" title="' + r.name + '"><i class="ti ' + (expanded ? 'ti-chevron-down' : 'ti-chevron-right') + '"></i> ' + r.name + '</div>' +
    '<div class="cap-heat-track">' + cells + '</div>' + wrCell +
  '</div>' + detail;
}

// The Teams tab's second row per team -- the average %-load across that
// team's individual members (as opposed to the team's own row above it,
// which is only the projects assigned directly to the team resource).
// Collapsed by default; expanding it lists each member as their own full
// capacityResourceRowHtml, so a member's own project bars/work requests are
// still just one more click away.
function capacityTeamAverageRowHtml(team, members, months, windowStart) {
  var perMember = members.map(function(m){
    return { r: m, placed: resourcePlacedProjects(m), openWR: m.type === 'individual' ? resourceOpenWorkRequests(m) : [] };
  });
  var cells = months.map(function(m) {
    if (!perMember.length) return capacityHeatCellHtml(0, m.label);
    var total = perMember.reduce(function(sum, x){ return sum + resourceMonthLoadPct(x.r, x.placed, x.openWR, m); }, 0);
    return capacityHeatCellHtml(Math.round(total / perMember.length), m.label);
  }).join('');
  var expanded = capacityPageState.expandedAvgId === team.id;
  var detail = expanded
    ? (members.length
        ? members.map(function(m){ return capacityResourceRowHtml(m, months, windowStart, 24); }).join('')
        : '<div class="text-muted" style="font-size:12px;padding:6px 0 6px 24px">No individual members on this team</div>')
    : '';
  return '<div class="tl-row" style="cursor:pointer" onclick="toggleCapacityAvgExpand(\'' + team.id + '\')">' +
    '<div class="tl-label" title="Average load across ' + members.length + ' team member' + (members.length===1?'':'s') + '"><i class="ti ' + (expanded ? 'ti-chevron-down' : 'ti-chevron-right') + '"></i> Team members (avg)</div>' +
    '<div class="cap-heat-track">' + cells + '</div>' +
    '<div style="width:140px;min-width:140px"></div>' +
  '</div>' + detail;
}

function pgCapacity() {
  tb('Capacity');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can access Capacity.</p></div>';
    return;
  }
  var st = capacityPageState;
  var window_ = computeDateWindow(st.dateMode, st.dateYear);
  var months = capacityMonthBuckets(window_.windowStart, window_.windowMonths);

  function matchesSearch(r, extraFields) {
    if (!st.search) return true;
    var q = st.search.toLowerCase();
    var fields = [r.name, r.role].concat(extraFields||[]);
    return fields.some(function(f){ return (f||'').toLowerCase().indexOf(q) >= 0; });
  }

  function sortedByLoad(list, tiebreakKey) {
    return list.map(function(r){
      var placed = resourcePlacedProjects(r);
      var openWR = r.type === 'individual' ? resourceOpenWorkRequests(r) : [];
      var peak = months.reduce(function(max, m){ return Math.max(max, resourceMonthLoadPct(r, placed, openWR, m)); }, 0);
      return { r:r, peak: peak };
    })
      .sort(function(a,b){
        if (b.peak !== a.peak) return b.peak - a.peak;
        return (a.r[tiebreakKey]||'').localeCompare(b.r[tiebreakKey]||'');
      })
      .map(function(x){ return x.r; });
  }

  var monthHeaderHtml = '<div style="display:flex;gap:12px;margin-bottom:10px"><div style="width:190px;min-width:190px"></div><div class="cap-heat-track">' +
    months.map(function(m){ return '<div style="flex:1;font-size:11px;color:#999;text-align:center">' + m.label + '</div>'; }).join('') +
    '</div><div style="width:140px;min-width:140px;font-size:11px;color:#999;text-align:right;padding-right:4px">Work requests</div></div>';

  var legendHtml = '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:11px;color:#666">' +
    '<div style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:14px;border-radius:3px;background:#f0ede8;display:inline-block"></span>Light (&lt;50%)</div>' +
    '<div style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:14px;border-radius:3px;background:#BFE3D3;display:inline-block"></span>Moderate (50–79%)</div>' +
    '<div style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:14px;border-radius:3px;background:#F5CE8B;display:inline-block"></span>Full (80–109%)</div>' +
    '<div style="display:flex;align-items:center;gap:6px"><span style="width:14px;height:14px;border-radius:3px;background:#F0A7A3;display:inline-block"></span>Over-allocated (110%+)</div>' +
    '<div class="text-muted">= BAU % + project tiers + work requests</div>' +
  '</div>';

  var bodyHtml;
  if (st.tab === 'individual') {
    var individuals = sortedByLoad(D.resources.filter(function(r){ return r.type === 'individual' && matchesSearch(r, [r.teamName]); }), 'lastName');
    bodyHtml = individuals.length
      ? individuals.map(function(r){ return capacityResourceRowHtml(r, months, window_.windowStart, 0); }).join('')
      : '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No individuals match your search</p></div>';
  } else {
    var teams = sortedByLoad(D.resources.filter(function(r){ return r.type === 'team' && matchesSearch(r, [r.managerName]); }), 'name');
    bodyHtml = teams.length
      ? teams.map(function(team) {
          var memberResources = (team.memberIds||[]).map(function(id){ return D.resources.find(function(r){ return r.id === id; }); }).filter(Boolean);
          var members = sortedByLoad(memberResources, 'lastName');
          return '<div class="cap-team-group">' +
            capacityResourceRowHtml(team, months, window_.windowStart, 0) +
            capacityTeamAverageRowHtml(team, members, months, window_.windowStart) +
          '</div>';
        }).join('')
      : '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No teams match your search</p></div>';
  }

  document.getElementById('content').innerHTML =
    dateRangeControlHtml(st.dateMode, st.dateYear, 'setCapacityDateMode', 'setCapacityDateYear') +
    '<div class="tab-bar" style="margin-bottom:16px">' +
      '<div class="tab' + (st.tab==='individual'?' active':'') + '" onclick="setCapacityTab(\'individual\')">Individuals</div>' +
      '<div class="tab' + (st.tab==='team'?' active':'') + '" onclick="setCapacityTab(\'team\')">Teams</div>' +
    '</div>' +
    '<div class="card">' +
    '<div class="task-filter-bar" style="margin-bottom:16px"><input type="text" id="cap-search" placeholder="Search…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onCapacitySearch(this.value)"></div>' +
    legendHtml + monthHeaderHtml + bodyHtml +
    '</div>';

  window.setCapacityTab = function(t) { st.tab = t; st.expandedId = null; pgCapacity(); };
  window.setCapacityDateMode = function(m) { st.dateMode = m; pgCapacity(); };
  window.setCapacityDateYear = function(y) { st.dateYear = parseInt(y); pgCapacity(); };
  window.toggleCapacityExpand = function(rid) { st.expandedId = st.expandedId === rid ? null : rid; pgCapacity(); };
  window.toggleCapacityAvgExpand = function(teamId) { st.expandedAvgId = st.expandedAvgId === teamId ? null : teamId; pgCapacity(); };
  window.onCapacitySearch = function(val) {
    st.search = val;
    pgCapacity();
    var el = document.getElementById('cap-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
}

// ── Portfolio Health ────────────────────────────────────────────────────────
// Every metric here computes from data already in D.projects, plus one extra
// table (project_change_log) fetched once and cached, since it's not part of
// the normal project payload. expanded[cardKey] tracks which bar (or 'all')
// is currently drilled into, per card, so re-renders stay on the same view.

var phState = { ready:false, lastTouched:{}, expanded:{} };

async function pgPortfolioHealth() {
  tb('Portfolio Health');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can access Portfolio Health.</p></div>';
    return;
  }
  if (!phState.ready) {
    document.getElementById('content').innerHTML = '<div class="empty-state" style="padding:60px"><i class="ti ti-loader-2"></i><p>Loading…</p></div>';
    var result = await sb.from('project_change_log').select('project_id, changed_at');
    if (result.error) console.error('Could not load change log for Portfolio Health:', result.error);
    var lastTouched = {};
    (result.data || []).forEach(function(r) {
      if (!lastTouched[r.project_id] || r.changed_at > lastTouched[r.project_id]) lastTouched[r.project_id] = r.changed_at;
    });
    phState.lastTouched = lastTouched;
    phState.ready = true;
  }
  renderPortfolioHealth();
}

function phHero(value, label, color) {
  return '<div style="text-align:right;flex-shrink:0"><div style="font-size:24px;font-weight:700' + (color ? ';color:' + color : '') + '">' + value +
    '</div><div class="text-muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;margin-top:2px">' + label + '</div></div>';
}

function phViewBtn(p) { return '<button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>'; }
function phOwnerCell(v) { return v ? v : '<span class="text-muted">Not set</span>'; }

// bars: [{key,label,count,color,rows,dot?,valueLabel?}]. Each bar's rows are
// mutually exclusive by default, so "View all" concatenates them -- unless a
// card passes its own allRows (a project can miss more than one field, or be
// short both Owner and Sponsor, so those two cards supply a deduped list).
function phCard(cardKey, title, subtitle, heroHtml, bars, columns, note, allRows) {
  var filterKey = phState.expanded[cardKey];
  var maxCount = Math.max.apply(null, bars.map(function(b){ return b.count; }).concat([1]));

  var barsHtml = bars.map(function(b) {
    var pct = Math.round((b.count / maxCount) * 100);
    var isActive = filterKey === b.key;
    var keyEsc = String(b.key).replace(/'/g, "\\'");
    return '<div class="ph-bar-row' + (isActive ? ' active' : '') + '" onclick="phToggle(\'' + cardKey + '\',\'' + keyEsc + '\')">' +
      '<div class="ph-bar-label">' + (b.dot ? '<span style="width:8px;height:8px;border-radius:50%;background:' + b.dot + ';display:inline-block;flex-shrink:0;margin-right:6px"></span>' : '') + b.label + '</div>' +
      '<div class="ph-bar-track"><div class="ph-bar-fill" style="width:' + pct + '%;background:' + b.color + '"></div></div>' +
      '<div class="ph-bar-value">' + (b.valueLabel != null ? b.valueLabel : b.count) + '</div>' +
    '</div>';
  }).join('');

  var drillHtml = '';
  if (filterKey) {
    var rows, label;
    if (filterKey === 'all') {
      rows = allRows || bars.reduce(function(acc, b){ return acc.concat(b.rows); }, []);
      label = 'All';
    } else {
      var match = bars.filter(function(b){ return b.key === filterKey; })[0];
      rows = match ? match.rows : [];
      label = match ? match.label : filterKey;
    }
    drillHtml = '<div class="mt-16" style="border-top:1px dashed #e8e8e5;padding-top:14px">' +
      '<div class="ph-chip">' + label + ' · ' + rows.length + (rows.length === 1 ? ' project' : ' projects') +
        '<button onclick="event.stopPropagation();phToggle(\'' + cardKey + '\',null)"><i class="ti ti-x" style="font-size:10px"></i></button></div>' +
      (rows.length
        ? '<div class="table-wrap"><table><thead><tr>' + columns.map(function(c){ return '<th>' + c.h + '</th>'; }).join('') + '</tr></thead><tbody>' +
          rows.map(function(r){ return '<tr>' + columns.map(function(c){ return '<td>' + c.cell(r) + '</td>'; }).join('') + '</tr>'; }).join('') +
          '</tbody></table></div>'
        : '<div class="empty-state" style="padding:18px"><p>No projects match this filter.</p></div>') +
    '</div>';
  }

  return '<div class="card mb-16">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px">' +
      '<div><div class="section-title" style="margin-bottom:2px">' + title + '</div><div class="text-muted" style="font-size:12.5px;max-width:48ch">' + subtitle + '</div></div>' +
      heroHtml +
    '</div>' +
    '<div style="margin:14px 0 2px">' + barsHtml + '</div>' +
    (note ? '<div class="text-muted" style="font-size:12px;margin-top:6px">' + note + '</div>' : '') +
    '<div style="text-align:right;margin-top:10px">' +
      '<span style="font-size:12px;font-weight:600;color:#534AB7;cursor:pointer" onclick="phToggle(\'' + cardKey + '\',\'all\')">' +
        (filterKey === 'all' ? 'Hide list' : 'View all projects') + ' <i class="ti ti-chevron-' + (filterKey === 'all' ? 'up' : 'down') + '"></i></span>' +
    '</div>' +
    drillHtml +
  '</div>';
}

function renderPortfolioHealth() {
  var projects = D.projects;
  var lastTouched = phState.lastTouched;
  var activeProjects = projects.filter(function(p){ return p.stage === 'active'; });

  // 1. Stage funnel
  var STAGE_META = [
    { key:'backlog', label:'Backlog', color:'#5598e7' },
    { key:'planned', label:'Planned', color:'#256abf' },
    { key:'active', label:'Active', color:'#184f95' },
    { key:'hold', label:'Hold', color:'#EF9F27' },
    { key:'complete', label:'Completed', color:'#0d366b' }
  ];
  var funnelBars = STAGE_META.map(function(s) {
    var rows = projects.filter(function(p){ return p.stage === s.key; });
    return { key:s.key, label:s.label, count:rows.length, color:s.color, rows:rows };
  });
  var funnelCard = phCard('funnel', 'Portfolio stage funnel', 'Every non-deleted project, by lifecycle stage',
    phHero(projects.length, 'projects'), funnelBars,
    [
      { h:'Project', cell:function(p){ return '<span class="bold">' + p.name + '</span>'; } },
      { h:'Health', cell:function(p){ return hdot(p.health) + (EXPORT_HEALTH_LABELS[p.health] || 'Not set'); } },
      { h:'Owner', cell:function(p){ return phOwnerCell(p.owner); } },
      { h:'Sponsor', cell:function(p){ return phOwnerCell(p.sponsor); } },
      { h:'', cell:phViewBtn }
    ],
    'Hold is a paused state, not further progress along the funnel.');

  // 2. RAG status, active projects
  var RAG_META = [
    { key:'green', label:'Green — on track', color:'#1D9E75' },
    { key:'amber', label:'Amber — at risk', color:'#EF9F27' },
    { key:'red', label:'Red — critical', color:'#E24B4A' },
    { key:'unset', label:'Not set', color:'#ccc' }
  ];
  var ragBars = RAG_META.map(function(s) {
    var rows = activeProjects.filter(function(p){ return (p.health || 'unset') === s.key; });
    return { key:s.key, label:s.label, count:rows.length, color:s.color, dot:s.color, rows:rows };
  }).filter(function(b){ return b.key !== 'unset' || b.count > 0; });
  var redCount = (ragBars.filter(function(b){ return b.key === 'red'; })[0] || { count:0 }).count;
  var ragCard = phCard('rag', 'RAG status — active projects', 'Current health across the ' + activeProjects.length + ' Active-stage projects',
    phHero(redCount, 'red right now', '#E24B4A'), ragBars,
    [
      { h:'Project', cell:function(p){ return '<span class="bold">' + p.name + '</span>'; } },
      { h:'Owner', cell:function(p){ return phOwnerCell(p.owner); } },
      { h:'Sponsor', cell:function(p){ return phOwnerCell(p.sponsor); } },
      { h:'Last updated', cell:function(p){ var t = lastTouched[p.id] || p.createdAt; var d = daysSince(t); return d != null ? (d + 'd ago') : '—'; } },
      { h:'', cell:phViewBtn }
    ],
    'Snapshot only for now — a trend view is a natural next addition.');

  // 3. Late items, by stage
  var lateProjects = projects.filter(isProjectLate);
  var LATE_STAGE_META = [
    { key:'active', label:'Active' }, { key:'planned', label:'Planned' },
    { key:'backlog', label:'Backlog' }, { key:'hold', label:'Hold' }
  ];
  var lateBars = LATE_STAGE_META.map(function(s) {
    var rows = lateProjects.filter(function(p){ return p.stage === s.key; });
    return { key:s.key, label:s.label, count:rows.length, color:'#E24B4A', rows:rows };
  });
  var lateCard = phCard('late', 'Late items', 'Projects past their target end date, by the stage they\'re stuck in',
    phHero(lateProjects.length, 'late right now', '#E24B4A'), lateBars,
    [
      { h:'Project', cell:function(p){ return '<span class="bold">' + p.name + '</span>'; } },
      { h:'Stage', cell:function(p){ return bdg(EXPORT_STAGE_LABELS[p.stage] || p.stage); } },
      { h:'Days late', cell:function(p){ return daysLate(p) + 'd'; } },
      { h:'Owner', cell:function(p){ return phOwnerCell(p.owner); } },
      { h:'', cell:phViewBtn }
    ]);

  // 4. Open risks & issues, by severity
  var openEntries = [];
  projects.forEach(function(p) {
    (p.raid.risks || []).forEach(function(r) {
      if (r.status !== 'Open') return;
      openEntries.push({ project:p, kind:'Risk', title:r.desc, severity:riskEffectiveSeverity(r), opened:raidOpenedDate(r) });
    });
    (p.raid.issues || []).forEach(function(r) {
      if (r.status !== 'Open') return;
      openEntries.push({ project:p, kind:'Issue', title:r.desc, severity:r.severity || 'Medium', opened:raidOpenedDate(r) });
    });
  });
  var SEV_META = [
    { key:'High', label:'High', color:'#E24B4A' },
    { key:'Medium', label:'Medium', color:'#EF9F27' },
    { key:'Low', label:'Low', color:'#5598e7' }
  ];
  var riskBars = SEV_META.map(function(s) {
    var rows = openEntries.filter(function(e){ return e.severity === s.key; });
    return { key:s.key, label:s.label, count:rows.length, color:s.color, rows:rows };
  });
  var riskCard = phCard('risk', 'Open risks & issues', 'RAID log entries across every project, by severity',
    phHero(openEntries.length, 'open entries'), riskBars,
    [
      { h:'Type', cell:function(e){ return e.kind; } },
      { h:'Title', cell:function(e){ return e.title || '<span class="text-muted">No description</span>'; } },
      { h:'Project', cell:function(e){ return e.project.name; } },
      { h:'Days open', cell:function(e){ var d = daysSince(e.opened); return d != null ? (d + 'd') : '—'; } },
      { h:'', cell:function(e){ return phViewBtn(e.project); } }
    ],
    'Risks don\'t carry their own severity, so theirs is derived from probability × impact to sit on the same scale as issues.');

  // 5. Missing owner / sponsor
  var missingScope = projects.filter(function(p){ return p.stage !== 'complete'; });
  var missingBars = [
    { key:'owner', label:'No Owner', rows:missingScope.filter(function(p){ return !p.owner; }) },
    { key:'sponsor', label:'No Sponsor', rows:missingScope.filter(function(p){ return !p.sponsor; }) }
  ].map(function(b){ return Object.assign(b, { count:b.rows.length, color:'#EF9F27' }); });
  var missingAll = missingScope.filter(function(p){ return !p.owner || !p.sponsor; });
  var missingCard = phCard('missing', 'Missing owner or sponsor', 'Backlog through Hold — projects that should have both roles filled in',
    phHero(missingAll.length, 'projects affected', '#EF9F27'), missingBars,
    [
      { h:'Project', cell:function(p){ return '<span class="bold">' + p.name + '</span>'; } },
      { h:'Stage', cell:function(p){ return bdg(EXPORT_STAGE_LABELS[p.stage] || p.stage); } },
      { h:'Owner', cell:function(p){ return phOwnerCell(p.owner); } },
      { h:'Sponsor', cell:function(p){ return phOwnerCell(p.sponsor); } },
      { h:'', cell:phViewBtn }
    ],
    null, missingAll);

  // 6. Owner load
  var OWNER_LOAD_THRESHOLD = 3;
  var loadScope = projects.filter(function(p){ return ['active','planned','hold'].indexOf(p.stage) >= 0 && p.owner; });
  var byOwner = {};
  loadScope.forEach(function(p){ (byOwner[p.owner] = byOwner[p.owner] || []).push(p); });
  var allLoadBars = Object.keys(byOwner).map(function(name) {
    var rows = byOwner[name];
    return { key:name, label:name, count:rows.length, color:rows.length >= OWNER_LOAD_THRESHOLD ? '#EF9F27' : '#256abf', rows:rows };
  }).sort(function(a, b){ return b.count - a.count || a.label.localeCompare(b.label); });
  var overThreshold = allLoadBars.filter(function(b){ return b.count >= OWNER_LOAD_THRESHOLD; }).length;
  var loadCard = phCard('load', 'Owner load', 'Active + Planned + Hold projects, counted per person as Owner (top 8 shown)',
    phHero(overThreshold, 'at/over ' + OWNER_LOAD_THRESHOLD + ' projects', overThreshold ? '#EF9F27' : null), allLoadBars.slice(0, 8),
    [
      { h:'Project', cell:function(p){ return '<span class="bold">' + p.name + '</span>'; } },
      { h:'Stage', cell:function(p){ return bdg(EXPORT_STAGE_LABELS[p.stage] || p.stage); } },
      { h:'', cell:phViewBtn }
    ],
    null, loadScope.slice().sort(function(a, b){ return a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name); }));

  // 7. Stale active projects
  var STALE_BUCKETS = [
    { key:'60', label:'60+ days', color:'#E24B4A', test:function(d){ return d >= 60; } },
    { key:'45', label:'45–59 days', color:'#ec835a', test:function(d){ return d >= 45 && d < 60; } },
    { key:'30', label:'30–44 days', color:'#EF9F27', test:function(d){ return d >= 30 && d < 45; } },
    { key:'14', label:'14–29 days', color:'#5598e7', test:function(d){ return d >= 14 && d < 30; } },
    { key:'7', label:'7–13 days', color:'#9ec5f4', test:function(d){ return d >= 7 && d < 14; } }
  ];
  activeProjects.forEach(function(p) {
    var touched = lastTouched[p.id] || p.createdAt;
    p._staleDays = touched ? daysSince(touched) : null;
  });
  var trueStaleCount = activeProjects.filter(function(p){ return p._staleDays != null && p._staleDays >= 30; }).length;
  var staleBars = STALE_BUCKETS.map(function(b) {
    var rows = activeProjects.filter(function(p){ return p._staleDays != null && b.test(p._staleDays); });
    return { key:b.key, label:b.label, count:rows.length, color:b.color, rows:rows };
  });
  var staleCard = phCard('stale', 'Stale active projects', 'Active-stage projects by days since their last logged change — 30+ counts as stale',
    phHero(trueStaleCount, 'of ' + activeProjects.length + ' active', trueStaleCount ? '#EF9F27' : null), staleBars,
    [
      { h:'Project', cell:function(p){ return '<span class="bold">' + p.name + '</span>'; } },
      { h:'Days since update', cell:function(p){ return p._staleDays + 'd'; } },
      { h:'Owner', cell:function(p){ return phOwnerCell(p.owner); } },
      { h:'Health', cell:function(p){ return hdot(p.health) + (EXPORT_HEALTH_LABELS[p.health] || 'Not set'); } },
      { h:'', cell:phViewBtn }
    ],
    '30+ days (amber to red) is the stale threshold; 7–29 days is shown for context on what\'s aging toward it.');

  // 8. Blank fields, active projects
  var FIELD_CHECKS = [
    { key:'description', label:'Description', test:function(p){ return !p.description; } },
    { key:'end', label:'End date', test:function(p){ return !p.end; } },
    { key:'start', label:'Start date', test:function(p){ return !p.start; } },
    { key:'owner', label:'Owner', test:function(p){ return !p.owner; } },
    { key:'sponsor', label:'Sponsor', test:function(p){ return !p.sponsor; } },
    { key:'health', label:'Health', test:function(p){ return !p.health; } }
  ];
  var blankBars = FIELD_CHECKS.map(function(f) {
    var rows = activeProjects.filter(f.test);
    var pct = activeProjects.length ? Math.round(rows.length / activeProjects.length * 100) : 0;
    return { key:f.key, label:f.label, count:rows.length, valueLabel:pct + '%', color:'#256abf', rows:rows };
  }).sort(function(a, b){ return b.count - a.count; });
  var blankAll = activeProjects.filter(function(p){ return FIELD_CHECKS.some(function(f){ return f.test(p); }); });
  var blankCard = phCard('blank', 'Blank fields, active projects', 'Share of active projects missing each field',
    phHero((blankBars[0] ? blankBars[0].valueLabel : '0%'), 'worst field'), blankBars,
    [
      { h:'Project', cell:function(p){ return '<span class="bold">' + p.name + '</span>'; } },
      { h:'Missing field(s)', cell:function(p){ return FIELD_CHECKS.filter(function(f){ return f.test(p); }).map(function(f){ return f.label; }).join(', '); } },
      { h:'Owner', cell:function(p){ return phOwnerCell(p.owner); } },
      { h:'', cell:phViewBtn }
    ],
    null, blankAll);

  document.getElementById('content').innerHTML =
    '<div class="info-banner info-blue mb-16"><i class="ti ti-info-circle"></i><span>Computed from your live project, RAID, and change-log data. Click any bar to see which projects make it up.</span></div>' +
    funnelCard + ragCard + lateCard + riskCard + missingCard + loadCard + staleCard + blankCard;

  window.phToggle = function(cardKey, filterKey) {
    phState.expanded[cardKey] = (phState.expanded[cardKey] === filterKey) ? null : filterKey;
    renderPortfolioHealth();
  };
}

async function deleteResource(rid) {
  if (!confirm('Remove this resource?')) return;
  var result = await sb.from('resources').delete().eq('id', rid);
  if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
  D.resources = D.resources.filter(function(x){ return x.id!==rid; });
  showToast('Resource removed'); closeModal(); pgResources();
}

function openAddResource() {
  var teamOpts = '<option value="">— None —</option>' + D.resources.filter(function(r){ return r.type === 'team'; }).sort(function(a,b){ return a.name.localeCompare(b.name); }).map(function(r){ return '<option value="' + r.id + '">' + r.name + '</option>'; }).join('');
  var managerOpts = '<option value="">— None —</option>' + D.resources.filter(function(r){ return r.type === 'individual'; }).sort(function(a,b){ return a.name.localeCompare(b.name); }).map(function(r){ return '<option value="' + r.id + '">' + r.name + '</option>'; }).join('');
  showModal('<div class="modal-title">Add resource <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Type</div><select id="nr-type" onchange="toggleAddResourceType()"><option value="individual">Individual</option><option value="team">Team</option></select></div>' +
    '<div id="nr-individual-fields">' +
      '<div class="grid-2">' +
        '<div class="form-group"><div class="form-label">First name *</div><input type="text" id="nr-first"></div>' +
        '<div class="form-group"><div class="form-label">Last name *</div><input type="text" id="nr-last"></div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div class="form-group"><div class="form-label">Role / Title</div><input type="text" id="nr-role" placeholder="e.g. Backend Dev"></div>' +
        '<div class="form-group"><div class="form-label">Team</div><select id="nr-team">' + teamOpts + '</select></div>' +
      '</div>' +
      '<div class="form-group"><div class="form-label">Email</div><input type="email" id="nr-email" placeholder="name@yourcompany.com"><p class="text-muted" style="font-size:12px;margin-top:4px">Auto-links if it matches an existing account.</p></div>' +
    '</div>' +
    '<div id="nr-team-fields" style="display:none">' +
      '<div class="form-group"><div class="form-label">Team name *</div><input type="text" id="nr-name" placeholder="e.g. Platform Team"></div>' +
      '<div class="form-group"><div class="form-label">Manager</div><select id="nr-manager">' + managerOpts + '</select></div>' +
    '</div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="nr-save"><i class="ti ti-plus"></i> Add resource</button></div>', true);

  window.toggleAddResourceType = function() {
    var isTeam = document.getElementById('nr-type').value === 'team';
    document.getElementById('nr-individual-fields').style.display = isTeam ? 'none' : 'block';
    document.getElementById('nr-team-fields').style.display = isTeam ? 'block' : 'none';
  };

  document.getElementById('nr-save').onclick = async function() {
    var isTeam = document.getElementById('nr-type').value === 'team';
    var btn = document.getElementById('nr-save'); btn.disabled = true;
    var record, linkedTeamId = null;

    if (isTeam) {
      var tname = document.getElementById('nr-name').value.trim();
      if (!tname) { showToast('Team name required'); btn.disabled = false; return; }
      record = { name: tname, type: 'team', title: null, manager_resource_id: document.getElementById('nr-manager').value || null };
    } else {
      var first = document.getElementById('nr-first').value.trim();
      var last = document.getElementById('nr-last').value.trim();
      if (!first || !last) { showToast('First and last name required'); btn.disabled = false; return; }
      linkedTeamId = document.getElementById('nr-team').value || null;
      record = {
        name: first + ' ' + last, first_name: first, last_name: last, type: 'individual',
        title: document.getElementById('nr-role').value || null,
        email: document.getElementById('nr-email').value.trim() || null
      };
    }

    var result = await sb.from('resources').insert(record).select().single();
    if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }

    var newRes = {
      id: result.data.id, name: record.name, role: record.title, type: record.type,
      firstName: record.first_name || null, lastName: record.last_name || null,
      projects: [],
      email: record.email || null, userId: result.data.user_id
    };
    if (isTeam) {
      newRes.members = []; newRes.memberIds = [];
      newRes.managerResourceId = record.manager_resource_id;
      var mgr = D.resources.find(function(x){ return x.id === record.manager_resource_id; });
      newRes.managerName = mgr ? mgr.name : null;
    } else {
      newRes.teamId = linkedTeamId;
      var tm = D.resources.find(function(x){ return x.id === linkedTeamId; });
      newRes.teamName = tm ? tm.name : null;
    }
    D.resources.push(newRes);

    if (!isTeam && linkedTeamId) {
      var linkResult = await sb.from('resource_team_members').insert({ team_resource_id: linkedTeamId, member_resource_id: result.data.id });
      if (!linkResult.error) {
        var teamRes = D.resources.find(function(x){ return x.id === linkedTeamId; });
        if (teamRes) { teamRes.members = (teamRes.members||[]).concat([record.name]); teamRes.memberIds = (teamRes.memberIds||[]).concat([result.data.id]); }
      }
    }

    showToast('Resource added' + (result.data.user_id ? ' — linked to an existing account' : ''));
    closeModal(); pgResources();
  };
}
function editResource(rid) {
  var res = D.resources.find(function(x){ return x.id===rid; });
  closeModal();
  var teamOpts = '<option value="">— None —</option>' + D.resources.filter(function(r){ return r.type === 'team'; }).sort(function(a,b){ return a.name.localeCompare(b.name); }).map(function(r){ return '<option value="' + r.id + '"' + (res.teamId===r.id?' selected':'') + '>' + r.name + '</option>'; }).join('');
  var managerOpts = '<option value="">— None —</option>' + D.resources.filter(function(r){ return r.type === 'individual'; }).sort(function(a,b){ return a.name.localeCompare(b.name); }).map(function(r){ return '<option value="' + r.id + '"' + (res.managerResourceId===r.id?' selected':'') + '>' + r.name + '</option>'; }).join('');
  var memberIds = res.memberIds || [];
  var candidateResources = D.resources.filter(function(r){ return r.type === 'individual' && r.id !== rid; }).sort(function(a,b){ return a.name.localeCompare(b.name); });
  var memberChecklist = candidateResources.map(function(r){
    return '<label class="th-filter-opt member-row" data-name="' + r.name.toLowerCase() + '" style="display:block;padding:5px 0;font-size:13px"><input type="checkbox" value="' + r.id + '"' + (memberIds.indexOf(r.id)>=0?' checked':'') + ' style="margin-right:8px"> ' + r.name + (r.teamName ? ' <span class="text-muted" style="font-size:11px">(' + r.teamName + ')</span>' : '') + '</label>';
  }).join('');

  showModal('<div class="modal-title">Edit resource <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    (res.type === 'individual'
      ? '<div class="grid-2"><div class="form-group"><div class="form-label">First name</div><input type="text" id="er-first" value="' + (res.firstName||'') + '"></div>' +
        '<div class="form-group"><div class="form-label">Last name</div><input type="text" id="er-last" value="' + (res.lastName||'') + '"></div></div>' +
        '<div class="grid-2"><div class="form-group"><div class="form-label">Role / Title</div><input type="text" id="er-role" value="' + (res.role||'') + '"></div>' +
        '<div class="form-group"><div class="form-label">Team</div><select id="er-team">' + teamOpts + '</select></div></div>' +
        '<div class="form-group"><div class="form-label">Email</div><input type="email" id="er-email" value="' + (res.email||'') + '">' + (res.userId ? '<p class="text-muted" style="font-size:12px;margin-top:4px"><i class="ti ti-link" style="color:#1D9E75"></i> Linked to a real account</p>' : '') + '</div>' +
        '<div class="form-group"><div class="form-label">BAU (non-project) %</div><input type="number" id="er-bau" min="0" max="100" value="' + (res.bauPercent != null ? res.bauPercent : '') + '"><p class="text-muted" style="font-size:12px;margin-top:4px">Normally self-reported from My Tasks — override here if needed.</p></div>'
      : '<div class="form-group"><div class="form-label">Team name</div><input type="text" id="er-name" value="' + res.name + '"></div>' +
        '<div class="form-group"><div class="form-label">Manager</div><select id="er-manager">' + managerOpts + '</select></div>' +
        '<div class="form-group"><div class="form-label">Team members</div>' +
          '<input type="text" id="er-member-search" placeholder="Search people…" oninput="filterMemberChecklist(this.value)">' +
          '<div id="er-member-list" style="max-height:220px;overflow-y:auto;border:1px solid #e8e8e5;border-radius:8px;padding:8px;margin-top:6px">' + (memberChecklist || '<span class="text-muted" style="font-size:13px">No individual resources yet</span>') + '</div>' +
        '</div>'
    ) +
    '<div class="form-group"><div class="form-label">Tags</div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
      (res.tags && res.tags.length ? res.tags.map(function(t){ return tagBadge(t); }).join('') : '<span class="text-muted" style="font-size:13px">No tags yet</span>') +
      '<button class="btn btn-sm" onclick="openResourceTagPicker(\'' + rid + '\')"><i class="ti ti-tag"></i> Edit tags</button>' +
    '</div></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="er-save"><i class="ti ti-check"></i> Save changes</button></div>');
  document.getElementById('er-save').onclick = function(){ return saveResource(rid); };
  window.openResourceTagPicker = function(rid2) {
    var r = D.resources.find(function(x){ return x.id === rid2; });
    openTagPicker(r.tags || [], async function(newTags) {
      var result = await applyTagDiff('resource_tags', 'resource_id', rid2, r.tags || [], newTags);
      r.tags = result.tags;
      showToast(result.failed.length ? 'Could not save: ' + result.failed.join(', ') : 'Tags updated');
      editResource(rid2);
    });
  };
}

window.filterMemberChecklist = function(query) {
  var q = query.trim().toLowerCase();
  document.querySelectorAll('#er-member-list .member-row').forEach(function(row) {
    row.style.display = row.getAttribute('data-name').indexOf(q) >= 0 ? 'block' : 'none';
  });
};

async function saveResource(rid) {
  var res = D.resources.find(function(x){ return x.id===rid; });
  var btn = document.getElementById('er-save'); if (btn) btn.disabled = true;

  if (res.type === 'individual') {
    var first = document.getElementById('er-first').value.trim();
    var last = document.getElementById('er-last').value.trim();
    var role = document.getElementById('er-role').value;
    var email = document.getElementById('er-email').value.trim() || null;
    var newTeamId = document.getElementById('er-team').value || null;
    var name = (first + ' ' + last).trim() || res.name;
    var bauRaw = document.getElementById('er-bau').value;
    var bauVal = bauRaw === '' ? null : Math.max(0, Math.min(100, parseInt(bauRaw, 10)));

    var result = await sb.from('resources').update({ name: name, first_name: first, last_name: last, title: role, email: email, non_project_capacity: bauVal }).eq('id', rid).select().single();
    if (result.error) { showToast('Could not save: ' + result.error.message); if (btn) btn.disabled = false; return; }
    res.name = name; res.firstName = first; res.lastName = last; res.role = role; res.email = email; res.userId = result.data.user_id; res.bauPercent = bauVal;

    var oldTeamId = res.teamId;
    if (oldTeamId !== newTeamId) {
      if (oldTeamId) {
        await sb.from('resource_team_members').delete().eq('team_resource_id', oldTeamId).eq('member_resource_id', rid);
        var oldTeam = D.resources.find(function(x){ return x.id === oldTeamId; });
        if (oldTeam) { oldTeam.members = (oldTeam.members||[]).filter(function(n){ return n !== res.name; }); oldTeam.memberIds = (oldTeam.memberIds||[]).filter(function(id){ return id !== rid; }); }
      }
      if (newTeamId) {
        await sb.from('resource_team_members').insert({ team_resource_id: newTeamId, member_resource_id: rid });
        var newTeam = D.resources.find(function(x){ return x.id === newTeamId; });
        if (newTeam) { newTeam.members = (newTeam.members||[]).concat([res.name]); newTeam.memberIds = (newTeam.memberIds||[]).concat([rid]); }
      }
      res.teamId = newTeamId;
      var tm = D.resources.find(function(x){ return x.id === newTeamId; });
      res.teamName = tm ? tm.name : null;
    } else if (oldTeamId) {
      var sameTeam = D.resources.find(function(x){ return x.id === oldTeamId; });
      if (sameTeam) { var idx = sameTeam.memberIds.indexOf(rid); if (idx >= 0) sameTeam.members[idx] = res.name; }
    }
  } else {
    var tname = document.getElementById('er-name').value.trim();
    var managerId = document.getElementById('er-manager').value || null;
    var result2 = await sb.from('resources').update({ name: tname, manager_resource_id: managerId }).eq('id', rid);
    if (result2.error) { showToast('Could not save: ' + result2.error.message); if (btn) btn.disabled = false; return; }
    res.name = tname;
    res.managerResourceId = managerId;
    var mgr = D.resources.find(function(x){ return x.id === managerId; });
    res.managerName = mgr ? mgr.name : null;

    var mList = document.getElementById('er-member-list');
    if (mList) {
      var newMemberResourceIds = Array.from(mList.querySelectorAll('input[type=checkbox]:checked')).map(function(cb){ return cb.value; });
      var oldMemberResourceIds = res.memberIds || [];
      var toAdd = newMemberResourceIds.filter(function(id){ return oldMemberResourceIds.indexOf(id) < 0; });
      var toRemove = oldMemberResourceIds.filter(function(id){ return newMemberResourceIds.indexOf(id) < 0; });
      if (toAdd.length) await sb.from('resource_team_members').insert(toAdd.map(function(id){ return { team_resource_id: rid, member_resource_id: id }; }));
      for (var i = 0; i < toRemove.length; i++) { await sb.from('resource_team_members').delete().eq('team_resource_id', rid).eq('member_resource_id', toRemove[i]); }
      res.memberIds = newMemberResourceIds;
      res.members = newMemberResourceIds.map(function(id){ var ind = D.resources.find(function(x){ return x.id===id; }); return ind ? ind.name : null; }).filter(Boolean);
      toAdd.forEach(function(id){ var ind = D.resources.find(function(x){ return x.id===id; }); if (ind) { ind.teamId = rid; ind.teamName = tname; } });
      toRemove.forEach(function(id){ var ind = D.resources.find(function(x){ return x.id===id; }); if (ind && ind.teamId === rid) { ind.teamId = null; ind.teamName = null; } });
    }
  }
  showToast('Resource updated'); closeModal(); pgResources();
}

// ── Stakeholder: Submit ────────────────────────────────────────────────────────

var submitPageState = { tab: 'project' };
window.setSubmitTab = function(t) { submitPageState.tab = t; pgSubmit(); };

function pgSubmit() {
  tb('Submit a Request');
  var st = submitPageState;
  var tabsHtml = '<div class="tab-bar" style="margin-bottom:16px;max-width:660px;margin-left:auto;margin-right:auto">' +
    '<div class="tab' + (st.tab==='project'?' active':'') + '" onclick="setSubmitTab(\'project\')">Project Request</div>' +
    '<div class="tab' + (st.tab==='work'?' active':'') + '" onclick="setSubmitTab(\'work\')">Work Request</div>' +
    '</div>';
  document.getElementById('content').innerHTML = tabsHtml + '<div id="submit-tab-body"></div>';
  if (st.tab === 'project') renderSubmitProjectRequestForm(); else renderSubmitWorkRequestForm();
}

function renderSubmitProjectRequestForm() {
  var buOpts = '<option value="">— Select —</option>' + BUSINESS_UNITS.map(function(v){ return '<option>' + v + '</option>'; }).join('');
  var selectedTags = [];
  var selectedTeam = [];
  var hasFinancial = canViewFinancials();

  var selectedSponsor = '';
  var sponsorPickerOpen = false;
  var sponsorQuery = '';
  var sponsorPool = individualResourceNames();

  function sponsorPanelHtml() {
    var q = sponsorQuery.trim().toLowerCase();
    var matches = sponsorPool.filter(function(n){ return n.toLowerCase().indexOf(q) >= 0; });
    var rows = matches.map(function(n){
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">' +
        '<span style="font-size:13px">' + n + '</span>' +
        '<button type="button" class="btn btn-sm" onclick="window.__reqSponsorPick(\'' + n.replace(/'/g,"\\'") + '\')">Select</button>' +
        '</div>';
    }).join('');
    return '<div style="border:1px solid #e8e8e5;border-radius:8px;padding:10px;margin-top:8px">' +
      '<button type="button" class="btn btn-sm" style="margin-bottom:8px" onclick="window.__reqSponsorPick(\'\')"><i class="ti ti-user-off"></i> No sponsor</button>' +
      '<input type="text" id="f-sponsor-search" placeholder="Search people…" value="' + sponsorQuery.replace(/"/g,'&quot;') + '" oninput="window.__reqSponsorSearch(this.value)">' +
      '<div style="max-height:180px;overflow-y:auto;margin-top:8px">' + (rows || '<span class="text-muted" style="font-size:13px">No matches</span>') + '</div>' +
      '</div>';
  }

  function sponsorFieldInner() {
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="font-size:13px' + (selectedSponsor ? '' : ';color:#999') + '">' + (selectedSponsor || 'Optional') + '</span>' +
      '<button type="button" class="btn btn-sm" onclick="window.__reqSponsorToggle()">' + (selectedSponsor ? 'Change' : 'Select') + '</button>' +
      '</div>' +
      (sponsorPickerOpen ? sponsorPanelHtml() : '');
  }

  window.__reqSponsorToggle = function() {
    sponsorPickerOpen = !sponsorPickerOpen;
    sponsorQuery = '';
    document.getElementById('f-sponsor-field').innerHTML = sponsorFieldInner();
    var s = document.getElementById('f-sponsor-search');
    if (s) s.focus();
  };
  window.__reqSponsorSearch = function(val) {
    sponsorQuery = val;
    document.getElementById('f-sponsor-field').innerHTML = sponsorFieldInner();
    var s = document.getElementById('f-sponsor-search');
    if (s) { s.focus(); s.selectionStart = s.selectionEnd = s.value.length; }
  };
  window.__reqSponsorPick = function(name) {
    selectedSponsor = name;
    sponsorPickerOpen = false;
    document.getElementById('f-sponsor-field').innerHTML = sponsorFieldInner();
  };

  var valueSectionHtml = hasFinancial
    ? '<div class="form-group"><div class="form-label">Value type</div><select id="f-opp-type" onchange="onOppTypeChange()">' +
        '<option value="">— Select —</option><option>Revenue opportunity</option><option>Cost savings opportunity</option>' +
      '</select></div>' +
      '<div class="form-group" id="f-estimate-row" style="display:none">' +
        '<div class="form-label" id="f-estimate-label">Estimated</div>' +
        '<div class="grid-2"><select id="f-est-freq"><option>Monthly</option><option>Annually</option></select>' +
        '<input type="text" id="f-est-amount" placeholder="$ amount (optional)"></div>' +
        '<div class="form-group" style="margin-top:8px"><div class="form-label">Value confidence</div><select id="f-value-confidence">' + confidenceOptsHtml() + '</select></div>' +
        '<div id="f-est-err" style="color:#A32D2D;font-size:12px;margin-top:4px;display:none">Please enter a valid number (digits only)</div>' +
      '</div>' +
      '<div class="form-group"><div class="form-label">Value justification</div><div class="form-sub">How did you arrive at the estimated value?</div><textarea id="f-justification" rows="3" placeholder="e.g. Reduces manual reconciliation time by an estimated 10 hours/week…"></textarea></div>' +
      '<div class="form-group"><div class="form-label">Cost estimate</div><div class="form-sub">What might this cost to deliver? Optional — a rough number is fine.</div>' +
        '<div class="grid-2"><input type="text" id="f-cost-amount" placeholder="$ amount (optional)"><select id="f-cost-confidence">' + confidenceOptsHtml() + '</select></div>' +
        '<div id="f-cost-err" style="color:#A32D2D;font-size:12px;margin-top:4px;display:none">Please enter a valid number (digits only)</div>' +
      '</div>'
    : '<div class="form-group"><div class="form-label">What\'s the expected value? *</div><div class="form-sub">Describe the benefit in your own words.</div><textarea id="f-value-desc" rows="3" placeholder="e.g. Saves the team several hours a week on manual reconciliation"></textarea></div>';

  document.getElementById('submit-tab-body').innerHTML =
    '<div class="card" style="max-width:660px;margin:0 auto">' +
    '<div class="section-title mb-16">New project request</div>' +
    '<p class="text-muted" style="font-size:13px;margin-bottom:16px"><strong>What\'s a project request?</strong> A full-scale project — its own timeline, milestones, team, and budget. Goes through PMO review, and once approved gets scheduled into Backlog, Planned, or Active. Use this for meaningful, multi-step initiatives, not a quick ask for someone\'s time (that\'s a Work Request, on the other tab).</p>' +
    '<div class="form-group"><div class="form-label">Project title *</div><input type="text" id="f-title" placeholder="e.g. Customer onboarding redesign"></div>' +
    '<div class="form-group"><div class="form-label">Business Unit *</div><select id="f-bu">' + buOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Sponsor</div><div id="f-sponsor-field">' + sponsorFieldInner() + '</div></div>' +
    '<div class="form-group"><div class="form-label">Description *</div><div class="form-sub">What is the problem or opportunity?</div><textarea id="f-desc" rows="4" placeholder="Describe the situation and why this project is needed…"></textarea></div>' +
    valueSectionHtml +
    '<div class="form-group"><div class="form-label">Tags</div><div id="f-tags-chips" style="margin-bottom:8px"></div><button class="btn btn-sm" onclick="openRequestTagPicker()"><i class="ti ti-tag"></i> Select tags</button></div>' +
    teamPickerHtml('f', 'toggleRequestTeamMember', []) +
    '<div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" id="f-submit"><i class="ti ti-send"></i> Submit request</button></div></div>';

  window.onOppTypeChange = function() {
    var type = document.getElementById('f-opp-type').value;
    document.getElementById('f-estimate-row').style.display = type ? 'block' : 'none';
    if (type) document.getElementById('f-estimate-label').textContent = 'Estimated ' + (type === 'Revenue opportunity' ? 'Revenue' : 'Savings');
  };

  if (hasFinancial) {
    document.getElementById('f-est-amount').addEventListener('input', function() {
      this.value = this.value.replace(/[^0-9]/g,'');
      document.getElementById('f-est-err').style.display = 'none';
    });
    document.getElementById('f-cost-amount').addEventListener('input', function() {
      this.value = this.value.replace(/[^0-9]/g,'');
      document.getElementById('f-cost-err').style.display = 'none';
    });
  }

  window.toggleRequestTeamMember = function(el) {
    var name = el.getAttribute('data-name');
    var i = selectedTeam.indexOf(name);
    if (el.checked && i < 0) selectedTeam.push(name);
    else if (!el.checked && i >= 0) selectedTeam.splice(i, 1);
  };

  window.openRequestTagPicker = function() {
    openTagPicker(selectedTags, function(newTags) {
      selectedTags = newTags;
      renderRequestTagChips();
    }, false);
  };
  function renderRequestTagChips() {
    document.getElementById('f-tags-chips').innerHTML = selectedTags.length
      ? selectedTags.map(function(t){ return tagBadge(t); }).join(' ')
      : '<span class="text-muted" style="font-size:13px">No tags selected</span>';
  }
  renderRequestTagChips();

  document.getElementById('f-submit').onclick = async function() {
    var title = document.getElementById('f-title').value.trim();
    var bu = document.getElementById('f-bu').value;
    var sponsor = selectedSponsor;
    var desc = document.getElementById('f-desc').value.trim();

    if (!title || !bu || !desc) { showToast('Please fill in all required fields', 'error'); return; }

    var record = {
      title: title, submitter_id: D.currentProfile.id, submitter_name: currentUser() || 'Current User',
      sponsor: sponsor || null, business_unit: bu, description: desc, status: 'Pending'
    };

    if (hasFinancial) {
      var oppType = document.getElementById('f-opp-type').value;
      var justification = document.getElementById('f-justification').value.trim();
      var estAmountRaw = document.getElementById('f-est-amount').value.trim();
      if (estAmountRaw && isNaN(Number(estAmountRaw))) { document.getElementById('f-est-err').style.display = 'block'; return; }
      var costAmountRaw = document.getElementById('f-cost-amount').value.trim();
      if (costAmountRaw && isNaN(Number(costAmountRaw))) { document.getElementById('f-cost-err').style.display = 'block'; return; }

      record.opportunity_type = oppType || null;
      record.opportunity_type_other = null;
      record.estimated_frequency = oppType ? document.getElementById('f-est-freq').value : null;
      record.estimated_type = oppType === 'Revenue opportunity' ? 'Revenue' : oppType === 'Cost savings opportunity' ? 'Savings' : null;
      record.estimated_amount = estAmountRaw ? Number(estAmountRaw) : null;
      record.value_confidence = document.getElementById('f-value-confidence').value || null;
      record.cost_estimate = costAmountRaw ? Number(costAmountRaw) : null;
      record.cost_confidence = document.getElementById('f-cost-confidence').value || null;
      record.value_justification = justification || null;
    } else {
      var valueDesc = document.getElementById('f-value-desc').value.trim();
      if (!valueDesc) { showToast('Please describe the expected value', 'error'); return; }
      record.opportunity_type = 'Something else';
      record.opportunity_type_other = valueDesc;
      record.estimated_frequency = null;
      record.estimated_type = null;
      record.estimated_amount = null;
      record.value_confidence = null;
      record.cost_estimate = null;
      record.cost_confidence = null;
      record.value_justification = null;
    }

    var btn = document.getElementById('f-submit'); btn.disabled = true;
    var result = await sb.from('requests').insert(record).select().single();
    if (result.error) { showToast('Could not submit: ' + result.error.message); btn.disabled = false; return; }

    var newTags = [];
    if (selectedTags.length) {
      var tagRows = selectedTags.map(function(name){ var t = D.tags.find(function(x){ return x.name === name; }); return t ? { request_id: result.data.id, tag_id: t.id } : null; }).filter(Boolean);
      if (tagRows.length) await sb.from('request_tags').insert(tagRows);
      newTags = selectedTags;
    }
    if (selectedTeam.length) {
      var teamRows = selectedTeam.map(function(name){ var r = resolveResource(name); return r ? { request_id: result.data.id, resource_id: r.id } : null; }).filter(Boolean);
      if (teamRows.length) await sb.from('request_team').insert(teamRows);
    }

    D.requests.push({
      id: result.data.id, title: title, submitter: record.submitter_name, submitterId: D.currentProfile.id,
      date: result.data.submitted_at, status: 'Pending', priority: null, value: null, sponsor: sponsor || null,
      businessUnit: bu, description: desc, opportunityType: record.opportunity_type, opportunityTypeOther: record.opportunity_type_other,
      estimatedFrequency: record.estimated_frequency, estimatedType: record.estimated_type, estimatedAmount: record.estimated_amount,
      valueConfidence: record.value_confidence, costEstimate: record.cost_estimate, costConfidence: record.cost_confidence,
      valueJustification: record.value_justification, tags: newTags, team: selectedTeam.slice(), feedback: '', editedByName: null, editedAt: null
    });
    showToast('Request submitted successfully');
    renderNav();
    myRequestsPageState.tab = 'project';
    nav('my-requests');
  };
}

// ── Stakeholder: My Requests ────────────────────────────────────────────────────

var myRequestsState = { search: '', sort: 'date', dir: 'desc', filters: { businessUnit:[], priority:[], status:[] }, openFilter: null };
var myWorkRequestsSubmittedState = { search: '', sort: 'submitted', dir: 'desc', filterAssignee: [] };

window.setMyRequestsTopTab = function(t) { myRequestsPageState.tab = t; pgMyRequests(); };

function pgMyRequests() {
  tb('My Requests');
  var top = myRequestsPageState;
  var me = currentUser() || 'Current User';
  var projectCount = D.requests.filter(function(r){ return r.submitter === me; }).length;
  var workCount = (D.workRequests || []).filter(function(w){ return w.requesterId === D.currentProfile.id; }).length;

  var tabsHtml = '<div class="tab-bar" style="margin-bottom:16px">' +
    '<div class="tab' + (top.tab==='project'?' active':'') + '" onclick="setMyRequestsTopTab(\'project\')">Project Requests <span class="badge badge-gray">' + projectCount + '</span></div>' +
    '<div class="tab' + (top.tab==='work'?' active':'') + '" onclick="setMyRequestsTopTab(\'work\')">Work Requests <span class="badge badge-gray">' + workCount + '</span></div>' +
  '</div>';

  document.getElementById('content').innerHTML = tabsHtml + '<div id="my-requests-body"></div>';
  if (top.tab === 'project') renderMyProjectRequests(); else renderMySubmittedWorkRequests();
}

function renderMyProjectRequests() {
  var st = myRequestsState;
  var me = currentUser() || 'Current User';
  var allMine = D.requests.filter(function(r){ return r.submitter === me; });
  var myNotifs = D.notifications.filter(function(n){ return n.submitter === me; });

  var mine = allMine.slice();
  if (st.search) { var q = st.search.toLowerCase(); mine = mine.filter(function(r){ return r.title.toLowerCase().indexOf(q) >= 0; }); }
  if (st.filters.businessUnit.length) mine = mine.filter(function(r){ return st.filters.businessUnit.indexOf(r.businessUnit) >= 0; });
  if (st.filters.priority.length) mine = mine.filter(function(r){ return st.filters.priority.indexOf(r.priority) >= 0; });
  if (st.filters.status.length) mine = mine.filter(function(r){ return st.filters.status.indexOf(r.status) >= 0; });
  mine.sort(function(a,b) {
    var av, bv;
    if (st.sort === 'priority') { av = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 9; bv = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 9; }
    else { av = a[st.sort]; bv = b[st.sort]; av = (av == null ? '' : av); bv = (bv == null ? '' : bv); if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); } }
    var cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return st.dir === 'asc' ? cmp : -cmp;
  });

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }
  function filterIcon(col, active) { return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleMyReqFilter(\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>'; }
  var businessUnitChoices = []; allMine.forEach(function(r){ if (r.businessUnit && businessUnitChoices.indexOf(r.businessUnit) < 0) businessUnitChoices.push(r.businessUnit); }); businessUnitChoices.sort();
  var priorityChoices = PRIORITIES.slice();
  var statusChoices = ['Pending','Backlog','Planned','Active','Rejected','Revoked'];

  var html = '';
  if (myNotifs.length) html += myNotifs.map(function(n){
    return '<div class="notif-banner"><i class="ti ti-bell" style="font-size:20px;flex-shrink:0"></i><div><div style="font-weight:600;margin-bottom:3px">' + (n.type==='planned'?'Project scheduled':n.type==='approved'?'Request approved':'Update') + '</div>' + n.msg + '</div></div>';
  }).join('');

  html += searchBoxHtml(st.search, 'Search requests by title…', 'my-requests-search', 'onMyRequestsSearch');

  if (!allMine.length) { html += '<div class="empty-state"><i class="ti ti-inbox"></i><p>No project requests yet</p></div>'; document.getElementById('my-requests-body').innerHTML = html; return; }

  html += '<div class="card"><div class="table-wrap"><table><thead><tr>' +
    '<th class="sortable-th" onclick="setMyReqSort(\'title\')">Title ' + arrow('title') + '</th>' +
    '<th class="sortable-th"><span onclick="setMyReqSort(\'businessUnit\')">Business Unit ' + arrow('businessUnit') + '</span>' + filterIcon('businessUnit', st.filters.businessUnit.length>0) + '</th>' +
    '<th class="sortable-th" onclick="setMyReqSort(\'date\')">Date ' + arrow('date') + '</th>' +
    '<th class="sortable-th"><span onclick="setMyReqSort(\'priority\')">Priority ' + arrow('priority') + '</span>' + filterIcon('priority', st.filters.priority.length>0) + '</th>' +
    '<th class="sortable-th"><span onclick="setMyReqSort(\'status\')">Status ' + arrow('status') + '</span>' + filterIcon('status', st.filters.status.length>0) + '</th>' +
    '<th>PMO feedback</th><th></th></tr></thead><tbody>' +
    (mine.length ? mine.map(function(r) {
      var canRevoke = r.status === 'Pending';
      var linkedP = r.linkedProject ? D.projects.find(function(p){ return p.id === r.linkedProject; }) : null;
      return '<tr><td class="bold">' + r.title + '</td><td class="text-muted">' + (r.businessUnit||'—') + '</td><td class="text-muted">' + r.date + '</td><td>' + (r.priority ? bdg(r.priority) : '<span class="text-muted">—</span>') + '</td><td>' + bdg(r.status) + '</td>' +
        '<td style="font-size:12px;color:#777;max-width:180px;word-break:break-word">' + (r.feedback||'—') + '</td>' +
        '<td><div style="display:flex;gap:4px">' +
        '<button class="btn btn-sm" onclick="reviewRequest(\'' + r.id + '\')"><i class="ti ti-eye"></i> Details</button>' +
        (linkedP ? '<button class="btn btn-sm" onclick="viewLinkedProject(\'' + linkedP.id + '\')"><i class="ti ti-external-link"></i></button>' : '') +
        (canRevoke ? '<button class="btn btn-sm btn-danger" onclick="revokeRequest(\'' + r.id + '\')"><i class="ti ti-x"></i> Revoke</button>' : '') +
        '</div></td></tr>';
    }).join('') : '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:20px">No requests match these filters</td></tr>') + '</tbody></table></div></div>';

  document.getElementById('my-requests-body').innerHTML = html;
  window.onMyRequestsSearch = function(v) {
    st.search = v; renderMyProjectRequests();
    var el = document.getElementById('my-requests-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setMyReqSort = function(col) { if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; } renderMyProjectRequests(); };
  window.toggleMyReqFilter = function(col) {
    var labelMap = { businessUnit:'Business Unit', priority:'Priority', status:'Status' };
    var choicesMap = { businessUnit:businessUnitChoices, priority:priorityChoices, status:statusChoices };
    openFilterModal(labelMap[col], choicesMap[col],
      function() { return st.filters[col]; },
      function(val) { var arr = st.filters[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { st.filters[col] = []; },
      renderMyProjectRequests
    );
  };
  window.viewLinkedProject = function(pid) { goToProject(pid); };
  window.revokeRequest = async function(rid) {
    if (!confirm('Revoke this request? It will be removed from the PMO queue.')) return;
    var r = D.requests.find(function(x){ return x.id===rid; });
    var result = await sb.from('requests').update({ status: 'Revoked' }).eq('id', rid);
    if (result.error) { showToast('Could not revoke: ' + result.error.message); return; }
    r.status = 'Revoked'; showToast('Request revoked'); renderMyProjectRequests(); renderNav();
  };
}

function renderMySubmittedWorkRequests() {
  var st = myWorkRequestsSubmittedState;
  var mine = (D.workRequests || []).filter(function(w){ return w.requesterId === D.currentProfile.id; });

  var searchBar = searchBoxHtml(st.search, 'Search work requests by title…', 'my-wr-submitted-search', 'onMyWorkRequestsSubmittedSearch');

  if (!mine.length) {
    document.getElementById('my-requests-body').innerHTML = searchBar + '<div class="empty-state"><i class="ti ti-inbox"></i><p>No work requests yet</p></div>';
    return;
  }

  var assigneeChoices = []; mine.forEach(function(w){ if (w.resourceName && assigneeChoices.indexOf(w.resourceName) < 0) assigneeChoices.push(w.resourceName); }); assigneeChoices.sort();

  var displayed = mine.slice();
  if (st.search) {
    var q = st.search.toLowerCase();
    displayed = displayed.filter(function(w){ return w.title.toLowerCase().indexOf(q) >= 0 || (w.resourceName||'').toLowerCase().indexOf(q) >= 0; });
  }
  if (st.filterAssignee.length) displayed = displayed.filter(function(w){ return st.filterAssignee.indexOf(w.resourceName) >= 0; });

  displayed.sort(function(a, b) {
    var av, bv;
    if (st.sort === 'title') { av = (a.title||'').toLowerCase(); bv = (b.title||'').toLowerCase(); }
    else if (st.sort === 'resourceName') { av = (a.resourceName||'').toLowerCase(); bv = (b.resourceName||'').toLowerCase(); }
    else if (st.sort === 'completion') { av = a.estimatedCompletionDate || ''; bv = b.estimatedCompletionDate || ''; }
    else { av = a.createdAt || ''; bv = b.createdAt || ''; }
    var cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return st.dir === 'asc' ? cmp : -cmp;
  });

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }

  var rows = displayed.map(function(w){ return workRequestRowHtml(w, 'submitted', { colCount: 6, showCompletionColumn: true }); }).join('');
  var header = '<tr>' +
    '<th class="sortable-th" onclick="setMyWrSubmittedSort(\'title\')">Request ' + arrow('title') + '</th>' +
    '<th class="sortable-th"><span onclick="setMyWrSubmittedSort(\'resourceName\')">Assigned to ' + arrow('resourceName') + '</span>' +
      '<button class="th-filter-btn" onclick="event.stopPropagation();toggleMyWrAssigneeFilter()"><i class="ti ti-filter' + (st.filterAssignee.length>0?' th-filter-active':'') + '"></i></button></th>' +
    '<th>Status</th>' +
    '<th class="sortable-th" onclick="setMyWrSubmittedSort(\'completion\')">Est. completion ' + arrow('completion') + '</th>' +
    '<th class="sortable-th" onclick="setMyWrSubmittedSort(\'submitted\')">Submitted ' + arrow('submitted') + '</th>' +
    '<th></th></tr>';

  document.getElementById('my-requests-body').innerHTML = searchBar +
    (displayed.length
      ? '<div class="card"><div class="table-wrap"><table><thead>' + header + '</thead><tbody>' + rows + '</tbody></table></div></div>'
      : '<div class="empty-state" style="padding:20px"><i class="ti ti-search"></i><p>No work requests match your search or filters</p></div>');

  window.onMyWorkRequestsSubmittedSearch = function(v) {
    st.search = v; renderMySubmittedWorkRequests();
    var el = document.getElementById('my-wr-submitted-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setMyWrSubmittedSort = function(col) { if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; } renderMySubmittedWorkRequests(); };
  window.toggleMyWrAssigneeFilter = function() {
    openFilterModal('Assigned to', assigneeChoices,
      function() { return st.filterAssignee; },
      function(val) { var i = st.filterAssignee.indexOf(val); if (i>=0) st.filterAssignee.splice(i,1); else st.filterAssignee.push(val); },
      function() { st.filterAssignee = []; },
      renderMySubmittedWorkRequests
    );
  };
}

// ── Programs ────────────────────────────────────────────────────────────────

function programLabel(program) { return 'P' + program.programNumber; }

// projects.program_id is the single source of truth for membership -- no
// separate cached list to keep in sync.
function programProjects(programId) {
  return D.projects.filter(function(p){ return p.programId === programId; });
}

function goToProgram(id) {
  pgProgramDetail(id);
  var targetHash = '#/program/' + id;
  if (location.hash !== targetHash) location.hash = targetHash;
}

function pgPrograms() {
  tb('Programs');
  var st = programsPageState;
  var programs = D.programs.slice();

  if (st.search) {
    var q = st.search.toLowerCase();
    programs = programs.filter(function(pr){ return pr.name.toLowerCase().indexOf(q) >= 0 || programLabel(pr).toLowerCase().indexOf(q) >= 0; });
  }

  function sortVal(pr, col) {
    if (col === 'id') return pr.programNumber;
    if (col === 'projects') return programProjects(pr.id).length;
    if (col === 'sponsor') return (pr.sponsorName || '').toLowerCase();
    if (col === 'manager') return (pr.managerName || '').toLowerCase();
    if (col === 'owner') return (pr.businessOwnerName || '').toLowerCase();
    return (pr.name || '').toLowerCase();
  }
  programs.sort(function(a, b) {
    var av = sortVal(a, st.sort), bv = sortVal(b, st.sort);
    if (av < bv) return st.dir === 'asc' ? -1 : 1;
    if (av > bv) return st.dir === 'asc' ? 1 : -1;
    return 0;
  });

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir === 'asc' ? '▲' : '▼') + '</span>'; }

  var rows = programs.map(function(prog) {
    return '<tr>' +
      '<td class="bold">' + programLabel(prog) + '</td>' +
      '<td class="bold" style="cursor:pointer" onclick="goToProgram(\'' + prog.id + '\')">' + prog.name + '</td>' +
      '<td>' + (prog.sponsorName || '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (prog.managerName || '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + (prog.businessOwnerName || '<span class="text-muted">—</span>') + '</td>' +
      '<td>' + programProjects(prog.id).length + '</td>' +
      '<td><button class="btn btn-sm" onclick="goToProgram(\'' + prog.id + '\')"><i class="ti ti-eye"></i> View</button></td>' +
    '</tr>';
  }).join('');

  document.getElementById('content').innerHTML =
    (D.role === 'admin' ? '<div style="display:flex;justify-content:flex-end;margin-bottom:16px"><button class="btn btn-primary" onclick="openNewProgramModal()"><i class="ti ti-plus"></i> New Program</button></div>' : '') +
    searchBoxHtml(st.search, 'Search programs by name…', 'programs-search', 'onProgramsSearch') +
    (programs.length
      ? '<div class="card"><div class="table-wrap"><table><thead><tr>' +
          '<th class="sortable-th" onclick="setProgramsSort(\'id\')">ID ' + arrow('id') + '</th>' +
          '<th class="sortable-th" onclick="setProgramsSort(\'name\')">Name ' + arrow('name') + '</th>' +
          '<th class="sortable-th" onclick="setProgramsSort(\'sponsor\')">Sponsor ' + arrow('sponsor') + '</th>' +
          '<th class="sortable-th" onclick="setProgramsSort(\'manager\')">Manager ' + arrow('manager') + '</th>' +
          '<th class="sortable-th" onclick="setProgramsSort(\'owner\')">Business Owner ' + arrow('owner') + '</th>' +
          '<th class="sortable-th" onclick="setProgramsSort(\'projects\')">Projects ' + arrow('projects') + '</th>' +
          '<th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>'
      : '<div class="empty-state"><i class="ti ti-folders"></i><p>' + (st.search ? 'No programs match your search' : ('No programs yet' + (D.role === 'admin' ? ' — create one to start grouping projects' : ''))) + '</p></div>');

  window.onProgramsSearch = function(v) {
    st.search = v; pgPrograms();
    var el = document.getElementById('programs-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setProgramsSort = function(col) {
    if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; }
    pgPrograms();
  };
}

function programResourceOpts(currentName) {
  var pool = currentName && individualResourceNames().indexOf(currentName) < 0 ? individualResourceNames().concat([currentName]) : individualResourceNames();
  return '<option value="">— None —</option>' + pool.map(function(n){ return '<option' + (currentName===n?' selected':'') + '>' + n + '</option>'; }).join('');
}

function openNewProgramModal() {
  if (D.role !== 'admin') return;
  showModal('<div class="modal-title">New Program <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Program name *</div><input type="text" id="npg-name" placeholder="Program name"></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="npg-desc" placeholder="What does this program cover?"></textarea></div>' +
    '<div class="form-group"><div class="form-label">Business objective</div><textarea id="npg-obj" placeholder="What business objective does this program serve?"></textarea></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Program sponsor</div><select id="npg-sponsor">' + programResourceOpts() + '</select></div>' +
    '<div class="form-group"><div class="form-label">Program manager</div><select id="npg-manager">' + programResourceOpts() + '</select></div></div>' +
    '<div class="form-group"><div class="form-label">Business owner</div><select id="npg-owner">' + programResourceOpts() + '</select></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="npg-save"><i class="ti ti-plus"></i> Create program</button></div>');

  document.getElementById('npg-save').onclick = async function() {
    var name = document.getElementById('npg-name').value.trim();
    if (!name) { showToast('Program name required'); return; }
    var sponsorResource = resolveResource(document.getElementById('npg-sponsor').value);
    var managerResource = resolveResource(document.getElementById('npg-manager').value);
    var ownerResource = resolveResource(document.getElementById('npg-owner').value);
    var btn = document.getElementById('npg-save'); btn.disabled = true;

    var record = {
      name: name,
      description: document.getElementById('npg-desc').value.trim() || null,
      business_objective: document.getElementById('npg-obj').value.trim() || null,
      sponsor_resource_id: sponsorResource ? sponsorResource.id : null,
      manager_resource_id: managerResource ? managerResource.id : null,
      business_owner_resource_id: ownerResource ? ownerResource.id : null
    };
    var result = await sb.from('programs').insert(record).select().single();
    if (result.error) { showToast('Could not create program: ' + result.error.message); btn.disabled = false; return; }

    D.programs.push({
      id: result.data.id, programNumber: result.data.program_number, name: name,
      description: record.description, businessObjective: record.business_objective,
      sponsorResourceId: record.sponsor_resource_id, sponsorName: sponsorResource ? sponsorResource.name : '',
      managerResourceId: record.manager_resource_id, managerName: managerResource ? managerResource.name : '',
      businessOwnerResourceId: record.business_owner_resource_id, businessOwnerName: ownerResource ? ownerResource.name : '',
      createdAt: result.data.created_at
    });
    closeModal();
    showToast('Program created');
    pgPrograms();
  };
}

function pgProgramDetail(id) {
  var prog = D.programs.find(function(x){ return x.id === id; });
  if (!prog) { nav('programs'); return; }
  currentPage = 'programDetail';
  renderNav();
  tb(programLabel(prog) + ' — ' + prog.name);

  var canEditProgram = D.role === 'admin' || isProgramManagerOf(prog);
  var canReassignRoles = D.role === 'admin';
  var linkedProjects = programProjects(prog.id);

  var stageOrder = ['active','planned','backlog','hold','complete'];
  var stageLabels = { active:'Active', planned:'Planned', backlog:'Backlog', hold:'Hold', complete:'Completed' };
  var byStage = {};
  linkedProjects.forEach(function(p){ (byStage[p.stage] = byStage[p.stage] || []).push(p); });

  var stageSectionsHtml = stageOrder.filter(function(s){ return byStage[s] && byStage[s].length; }).map(function(s) {
    var rows = byStage[s].map(function(p) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0ede8">' +
        '<span style="font-size:13px;cursor:pointer" onclick="goToProject(\'' + p.id + '\')">' + hdot(p.health) + p.name + '</span>' +
        '<span style="display:flex;align-items:center;gap:12px">' +
          '<span class="text-muted" style="font-size:12px">' + (p.owner || '—') + '</span>' +
          lateBadgeHtml(isProjectLate(p)) +
          (canEditProgram ? '<button class="btn btn-sm btn-danger" onclick="removeProjectFromProgram(\'' + prog.id + '\',\'' + p.id + '\')"><i class="ti ti-x"></i></button>' : '') +
        '</span>' +
      '</div>';
    }).join('');
    return '<div class="mt-16"><div class="form-label" style="margin-bottom:2px">' + stageLabels[s] + ' (' + byStage[s].length + ')</div>' + rows + '</div>';
  }).join('');

  // Non-admins can only pull in projects they can already edit (own, sponsor,
  // or already manage via another program) -- matches what the update RLS
  // policy on projects will actually allow.
  var candidateProjects = D.projects.filter(function(p){ return p.programId !== prog.id && canEdit(p); });
  var addPanelHtml = canEditProgram
    ? '<div class="card mt-16"><div class="section-title">Add a project</div>' +
      '<input type="text" id="pg-add-search" placeholder="Search projects…" oninput="filterProgramAddList(this.value)">' +
      '<div id="pg-add-list" style="max-height:220px;overflow-y:auto;margin-top:8px">' +
      (candidateProjects.length
        ? candidateProjects.map(function(p) {
            var currentProgram = p.programId ? D.programs.find(function(x){ return x.id === p.programId; }) : null;
            return '<div class="pg-add-row" data-name="' + p.name.toLowerCase() + '" style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">' +
              '<span style="font-size:13px">' + p.name + (currentProgram ? ' <span class="text-muted">(currently ' + programLabel(currentProgram) + ')</span>' : '') + '</span>' +
              '<button class="btn btn-sm" onclick="addProjectToProgram(\'' + prog.id + '\',\'' + p.id + '\')"><i class="ti ti-plus"></i> Add</button>' +
            '</div>';
          }).join('')
        : '<span class="text-muted" style="font-size:13px">No projects available to add</span>') +
      '</div></div>'
    : '';

  function fieldRow(label, value, inputId, isTextarea) {
    if (!canEditProgram) return '<div class="form-group"><div class="form-label">' + label + '</div><div style="font-size:13px;color:#444">' + (value || '—') + '</div></div>';
    return '<div class="form-group"><div class="form-label">' + label + '</div>' +
      (isTextarea ? '<textarea id="' + inputId + '">' + (value||'') + '</textarea>' : '<input type="text" id="' + inputId + '" value="' + (value||'').replace(/"/g,'&quot;') + '">') +
      '</div>';
  }
  function roleRow(label, currentName, selectId) {
    if (!canReassignRoles) return '<div class="form-group"><div class="form-label">' + label + '</div><div style="font-size:13px;color:#444">' + (currentName || '—') + '</div></div>';
    return '<div class="form-group"><div class="form-label">' + label + '</div><select id="' + selectId + '">' + programResourceOpts(currentName) + '</select></div>';
  }

  document.getElementById('content').innerHTML =
    '<div class="card">' +
      (!canReassignRoles ? '<div class="form-sub" style="margin-bottom:12px">Only a PMO Admin can reassign Sponsor, Manager, or Business Owner.</div>' : '') +
      fieldRow('Program name', prog.name, 'epg-name') +
      fieldRow('Description', prog.description, 'epg-desc', true) +
      fieldRow('Business objective', prog.businessObjective, 'epg-obj', true) +
      '<div class="grid-2">' + roleRow('Program sponsor', prog.sponsorName, 'epg-sponsor') + roleRow('Program manager', prog.managerName, 'epg-manager') + '</div>' +
      roleRow('Business owner', prog.businessOwnerName, 'epg-owner') +
      (canEditProgram || D.role === 'admin'
        ? '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">' +
            (D.role === 'admin' ? '<button class="btn btn-danger" onclick="deleteProgram(\'' + prog.id + '\')"><i class="ti ti-trash"></i> Delete</button>' : '') +
            (canEditProgram ? '<button class="btn btn-primary" id="epg-save" onclick="saveProgramFields(\'' + prog.id + '\')"><i class="ti ti-check"></i> Save changes</button>' : '') +
          '</div>'
        : '') +
    '</div>' +
    '<div class="card mt-16"><div class="section-title">Linked projects (' + linkedProjects.length + ')</div>' +
      (stageSectionsHtml || '<div class="text-muted" style="font-size:13px">No projects linked yet</div>') +
    '</div>' +
    addPanelHtml;

  window.filterProgramAddList = function(query) {
    var q = query.trim().toLowerCase();
    document.querySelectorAll('#pg-add-list .pg-add-row').forEach(function(row) {
      row.style.display = row.getAttribute('data-name').indexOf(q) >= 0 ? 'flex' : 'none';
    });
  };
}

async function saveProgramFields(id) {
  var prog = D.programs.find(function(x){ return x.id === id; });
  if (!prog) return;
  var nameEl = document.getElementById('epg-name');
  var descEl = document.getElementById('epg-desc');
  var objEl = document.getElementById('epg-obj');
  var name = nameEl ? nameEl.value.trim() : prog.name;
  if (!name) { showToast('Program name required'); return; }

  var updates = {
    name: name,
    description: descEl ? (descEl.value.trim() || null) : prog.description,
    business_objective: objEl ? (objEl.value.trim() || null) : prog.businessObjective
  };

  var sponsorEl = document.getElementById('epg-sponsor');
  var managerEl = document.getElementById('epg-manager');
  var ownerEl = document.getElementById('epg-owner');
  var sponsorResource = sponsorEl ? resolveResource(sponsorEl.value) : null;
  var managerResource = managerEl ? resolveResource(managerEl.value) : null;
  var ownerResource = ownerEl ? resolveResource(ownerEl.value) : null;
  if (sponsorEl) updates.sponsor_resource_id = sponsorResource ? sponsorResource.id : null;
  if (managerEl) updates.manager_resource_id = managerResource ? managerResource.id : null;
  if (ownerEl) updates.business_owner_resource_id = ownerResource ? ownerResource.id : null;

  var btn = document.getElementById('epg-save'); if (btn) btn.disabled = true;
  var result = await sb.from('programs').update(updates).eq('id', id);
  if (result.error) { showToast('Could not save: ' + result.error.message); if (btn) btn.disabled = false; return; }

  prog.name = name; prog.description = updates.description; prog.businessObjective = updates.business_objective;
  if (sponsorEl) { prog.sponsorResourceId = updates.sponsor_resource_id; prog.sponsorName = sponsorResource ? sponsorResource.name : ''; }
  if (managerEl) { prog.managerResourceId = updates.manager_resource_id; prog.managerName = managerResource ? managerResource.name : ''; }
  if (ownerEl) { prog.businessOwnerResourceId = updates.business_owner_resource_id; prog.businessOwnerName = ownerResource ? ownerResource.name : ''; }

  showToast('Program saved');
  if (currentPage === 'programDetail') pgProgramDetail(id);
}

async function deleteProgram(id) {
  if (D.role !== 'admin') return;
  var prog = D.programs.find(function(x){ return x.id === id; });
  if (!prog) return;
  var linkedCount = programProjects(id).length;
  var msg = 'Delete ' + programLabel(prog) + ' — ' + prog.name + '?' + (linkedCount ? ' Its ' + linkedCount + ' linked project' + (linkedCount===1?'':'s') + ' will keep existing, just with no program.' : '');
  if (!confirm(msg)) return;
  var result = await sb.from('programs').delete().eq('id', id);
  if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
  D.programs = D.programs.filter(function(x){ return x.id !== id; });
  D.projects.forEach(function(p){ if (p.programId === id) p.programId = null; });
  showToast('Program deleted');
  nav('programs');
}

async function addProjectToProgram(programId, projectId) {
  var prog = D.programs.find(function(x){ return x.id === programId; });
  var proj = D.projects.find(function(x){ return x.id === projectId; });
  if (!prog || !proj) return;
  var result = await sb.from('projects').update({ program_id: programId }).eq('id', projectId);
  if (result.error) { showToast('Could not add project: ' + result.error.message); return; }
  proj.programId = programId;
  showToast(proj.name + ' added to ' + programLabel(prog));
  if (currentPage === 'programDetail') pgProgramDetail(programId);
}

async function removeProjectFromProgram(programId, projectId) {
  var prog = D.programs.find(function(x){ return x.id === programId; });
  var proj = D.projects.find(function(x){ return x.id === projectId; });
  if (!prog || !proj) return;
  var result = await sb.from('projects').update({ program_id: null }).eq('id', projectId);
  if (result.error) { showToast('Could not remove project: ' + result.error.message); return; }
  proj.programId = null;
  showToast(proj.name + ' removed from ' + programLabel(prog));
  if (currentPage === 'programDetail') pgProgramDetail(programId);
}

// ── Resource Role Pages ────────────────────────────────────────────────────────

function myProjectRoles(p) {
  var roles = [];
  if (isMyOwnedProject(p)) roles.push('Owner');
  if (isProjectSponsor(p)) roles.push('Sponsor');
  if (isMyContribution(p)) roles.push('Contributor');
  return roles;
}

function myProjectCard(p) {
  var myTasks = p.tasks.filter(function(t){ return t.assignee === currentUser(); });
  var doneTasks = myTasks.filter(function(t){ return t.status==='Done'; }).length;
  var roleBadgeClass = { Owner:'badge-blue', Sponsor:'badge-coral', Contributor:'badge-teal' };
  var roleBadges = myProjectRoles(p).map(function(r){ return '<span class="badge ' + roleBadgeClass[r] + '" style="font-size:10px">' + r + '</span>'; }).join(' ');
  return '<div class="project-card">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">' +
      '<div><div class="bold mb-12">' + hdot(p.health) + p.name + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' + roleBadges + ' ' + bdg(p.status) + ' ' + stagePill(p.stage) + ' ' + badgeIf('badge-purple', p.value) + '</div></div>' +
      '<button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>' +
    '</div>' +
    '<div class="grid-2 mt-12" style="font-size:12px;color:#777">' +
      '<div>Owner: ' + (p.owner||'—') + '</div><div>Due: ' + (p.end||'TBD') + ' ' + lateBadgeHtml(isProjectLate(p)) + '</div>' +
      '<div>My tasks: ' + doneTasks + '/' + myTasks.length + ' done</div>' +
    '</div>' +
    (p.blockers ? '<div class="blocker-note"><i class="ti ti-alert-triangle"></i> ' + p.blockers + '</div>' : '') +
  '</div>';
}

function pgMyProjectsResource() {
  tb('My Projects');
  var nonComplete = D.projects.filter(function(p){ return p.stage !== 'complete'; });

  var buckets = {
    sponsor: nonComplete.filter(isProjectSponsor),
    'owner-active': nonComplete.filter(function(p){ return p.stage === 'active' && isMyOwnedProject(p); }),
    // Hold is grouped with Planned/Backlog here as "not currently active."
    'owner-notstarted': nonComplete.filter(function(p){ return (p.stage === 'planned' || p.stage === 'backlog' || p.stage === 'hold') && isMyOwnedProject(p); }),
    contributor: nonComplete.filter(isMyContribution),
    completed: D.projects.filter(function(p){ return p.stage === 'complete' && hasAnyRoleOn(p); })
  };
  // Each tab is an independent role filter -- a project with more than one
  // role for this person (e.g. owner AND sponsor) shows up in every tab that
  // applies, not just one.

  var tabDefs = [
    { key:'sponsor',           label:'Sponsor',           list:buckets.sponsor,           empty:'No projects where you\'re the sponsor' },
    { key:'owner-active',      label:'Owner: Active',     list:buckets['owner-active'],   empty:'No active projects you own' },
    { key:'owner-notstarted',  label:'Owner: Not Started',list:buckets['owner-notstarted'],empty:'No planned, backlog, or on-hold projects you own' },
    { key:'contributor',       label:'Contributor',       list:buckets.contributor,       empty:'No projects where you\'re a contributor' },
    { key:'completed',         label:'Completed',         list:buckets.completed,         empty:'No completed projects yet' }
  ];

  if (!tabDefs.some(function(t){ return t.list.length; })) {
    document.getElementById('content').innerHTML = '<div class="empty-state"><i class="ti ti-briefcase"></i><p>You are not assigned to any projects</p></div>';
    return;
  }
  // Only tabs that actually have something in them, same as the category
  // tabs on Roadmap.
  var visibleTabs = tabDefs.filter(function(t){ return t.list.length; });

  var st = myProjectsPageState;
  if (!visibleTabs.some(function(t){ return t.key === st.tab; })) st.tab = visibleTabs[0].key;
  var activeTab = visibleTabs.filter(function(t){ return t.key === st.tab; })[0];

  var tabHtml = '<div class="tab-bar">' + visibleTabs.map(function(t) {
    return '<div class="tab' + (st.tab===t.key?' active':'') + '" onclick="setMyProjectsTab(\'' + t.key + '\')">' + t.label +
      ' <span class="badge badge-gray" style="font-size:10px">' + t.list.length + '</span></div>';
  }).join('') + '</div>';

  var cardsHtml = activeTab.list.length
    ? activeTab.list.map(myProjectCard).join('')
    : '<div class="empty-state" style="padding:30px"><p>' + activeTab.empty + '</p></div>';

  document.getElementById('content').innerHTML = tabHtml + cardsHtml;
  window.setMyProjectsTab = function(k) { st.tab = k; pgMyProjectsResource(); };
}

function pgMyTasks() {
  tb('My Tasks');
  var st = myTasksState;
  if (st.kind === 'todo') renderMyTodos(); else renderMyPlanTasks();
}

function bauPercentCardHtml() {
  var me = D.resources.find(function(r){ return r.id === D.myResourceId; });
  if (!me) return '';
  var pct = (me.bauPercent === null || me.bauPercent === undefined) ? null : me.bauPercent;
  return '<div class="card mb-16" style="display:flex;align-items:center;justify-content:space-between">' +
    '<div><div class="section-title" style="margin-bottom:2px">Non-project (BAU) time</div>' +
    '<div class="text-muted" style="font-size:12px">The % of your time that typically goes to non-project work. Feeds into your capacity load.</div></div>' +
    '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:18px;font-weight:600">' + (pct === null ? 'Not set' : pct + '%') + '</span>' +
    '<button class="btn btn-sm" onclick="editBauPercent()"><i class="ti ti-edit"></i> Edit</button></div></div>';
}

window.editBauPercent = async function() {
  var me = D.resources.find(function(r){ return r.id === D.myResourceId; });
  if (!me) return;
  var raw = prompt('What % of your time typically goes to non-project (BAU) work?', me.bauPercent != null ? String(me.bauPercent) : '');
  if (raw === null) return;
  var val = parseInt(raw, 10);
  if (isNaN(val) || val < 0 || val > 100) { showToast('Enter a whole number between 0 and 100'); return; }
  var result = await sb.from('resources').update({ non_project_capacity: val }).eq('id', me.id);
  if (result.error) { showToast('Could not update: ' + result.error.message); return; }
  me.bauPercent = val;
  showToast('BAU % updated');
  pgMyCapacity();
};

function pgMyCapacity() {
  tb('My Capacity');
  var me = D.myResourceId;
  var meRes = D.resources.find(function(r){ return r.id === me; });
  if (!meRes) { document.getElementById('content').innerHTML = '<div class="empty-state" style="padding:60px"><i class="ti ti-gauge"></i><p>No resource record linked to your account yet.</p></div>'; return; }

  var today = new Date();
  var months = capacityMonthBuckets(new Date(today.getFullYear(), today.getMonth() - 1, 1), 3);
  var monthDefs = [
    { key:'prev',    label:'Previous month', m: months[0] },
    { key:'current', label:'Current month',  m: months[1] },
    { key:'next',    label:'Next month',     m: months[2] }
  ];
  var st = myCapacityPageState;
  var activeDef = monthDefs.filter(function(d){ return d.key === st.month; })[0] || monthDefs[1];
  var m = activeDef.m;

  var placed = resourcePlacedProjects(meRes);
  var openWR = resourceOpenWorkRequests(meRes);
  var placedThisMonth = placed.filter(function(x){ return x.range.end >= m.start && x.range.start < m.end; });
  var notShownCount = resourceCombinedProjectIds(meRes).allIds.length - placedThisMonth.length;

  var bau = meRes.bauPercent != null ? meRes.bauPercent : 0;
  var projectPct = placedThisMonth.reduce(function(sum, x){ return sum + effectiveAllocationPct(x.project, me); }, 0);
  var wrHours = openWR.reduce(function(sum, w){ return sum + workRequestHoursInMonth(w, m); }, 0);
  var cap = monthCapacityHours();
  var wrPct = Math.round(cap > 0 ? (wrHours / cap) * 100 : 0);
  // Rounded independently and summed, rather than rounding one combined
  // total, so the "BAU + projects + work requests" breakdown always adds up
  // to the number shown -- may drift by 1% from the admin Capacity page's
  // figure for the same person/month, which rounds the total as a whole.
  var totalPct = bau + projectPct + wrPct;
  var totalBg = totalPct >= 110 ? '#F0A7A3' : totalPct >= 80 ? '#F5CE8B' : totalPct >= 50 ? '#BFE3D3' : '#f0ede8';

  var rows = placedThisMonth.map(function(x){
    return {
      p: x.project,
      tier: x.project.teamTiers ? x.project.teamTiers[me] : null,
      overridden: !!(x.project.teamOverrides && x.project.teamOverrides[me] != null),
      effPct: effectiveAllocationPct(x.project, me)
    };
  }).sort(function(a, b){ return b.effPct - a.effPct || a.p.name.localeCompare(b.p.name); });

  var monthTabsHtml = '<div class="tab-bar" style="margin-bottom:16px">' + monthDefs.map(function(d){
    return '<div class="tab' + (st.month===d.key?' active':'') + '" onclick="setMyCapacityMonth(\'' + d.key + '\')">' + d.label + '</div>';
  }).join('') + '</div>';

  var rowsHtml = rows.length
    ? rows.map(myCapacityRowHtml).join('')
    : '<div class="empty-state" style="padding:24px"><i class="ti ti-gauge"></i><p>No projects placed in ' + m.label + '</p></div>';

  document.getElementById('content').innerHTML =
    bauPercentCardHtml() +
    monthTabsHtml +
    '<div class="card mb-16">' +
      '<div style="display:flex;align-items:center;justify-content:space-between">' +
        '<div><div class="section-title" style="margin-bottom:2px">Estimated total load — ' + m.label + '</div>' +
        '<div class="text-muted" style="font-size:12px">Your non-project (BAU) % plus the allocation % for every project of yours active in ' + m.label + ', plus a prorated share of your open work requests due around then. This mirrors what admins see for you on the Capacity page.</div></div>' +
        '<span style="font-size:20px;font-weight:700;padding:4px 12px;border-radius:8px;background:' + totalBg + '">' + totalPct + '%</span>' +
      '</div>' +
      '<div class="text-muted" style="font-size:11px;margin-top:10px;padding-top:10px;border-top:1px solid #eee">' +
        'BAU ' + bau + '% + projects ' + projectPct + '% + work requests ≈' + wrPct + '%' +
      '</div>' +
    '</div>' +
    '<div class="card"><div class="section-title">Your projects in ' + m.label + '</div>' + rowsHtml +
      (notShownCount > 0 ? '<div class="text-muted" style="font-size:11px;margin-top:10px">+' + notShownCount + ' other assigned project' + (notShownCount===1?'':'s') + ' not shown here (on hold, completed, no schedule, or not active in ' + m.label + ')</div>' : '') +
    '</div>';
}

window.setMyCapacityMonth = function(key) { myCapacityPageState.month = key; pgMyCapacity(); };

function myCapacityRowHtml(entry) {
  var p = entry.p, tier = entry.tier, effPct = entry.effPct, overridden = entry.overridden;
  var sizeLabel = p.tshirtSize || 'Not sized';
  return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0ede8">' +
    '<div style="min-width:0">' +
      '<div style="font-size:13px" class="bold">' + p.name + ' ' + stagePill(p.stage) + '</div>' +
      '<div class="text-muted" style="font-size:11px;margin-top:2px">' + (tier ? tier : 'Tier not set') + ' · ' + sizeLabel + (overridden ? ' · custom override' : '') + '</div>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:10px">' +
      '<span style="font-size:16px;font-weight:600">' + effPct + '%</span>' +
      '<button class="btn btn-sm" title="Override this %" onclick="openMyCapacityOverride(\'' + p.id + '\')"><i class="ti ti-edit"></i></button>' +
      (overridden ? '<button class="btn btn-sm" title="Reset to default" onclick="resetMyCapacityOverride(\'' + p.id + '\')"><i class="ti ti-refresh"></i></button>' : '') +
      '<button class="btn btn-sm" title="View project" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i></button>' +
    '</div></div>';
}

window.openMyCapacityOverride = async function(pid2) {
  var p = D.projects.find(function(x){ return x.id === pid2; });
  if (!p) return;
  var me = D.myResourceId;
  var current = effectiveAllocationPct(p, me);
  var raw = prompt('Override your % allocation for "' + p.name + '" (currently ' + current + '%, based on your tier and this project\'s size):', String(current));
  if (raw === null) return;
  var val = parseInt(raw, 10);
  if (isNaN(val) || val < 0 || val > 100) { showToast('Enter a whole number between 0 and 100'); return; }
  await setMyCapacityOverride(pid2, val);
};

window.resetMyCapacityOverride = async function(pid2) {
  await setMyCapacityOverride(pid2, null);
};

async function setMyCapacityOverride(pid2, val) {
  var me = D.myResourceId;
  var result = await sb.from('resource_projects').update({ allocation_pct_override: val }).eq('project_id', pid2).eq('resource_id', me);
  if (result.error) { showToast('Could not update: ' + result.error.message); return; }
  var p = D.projects.find(function(x){ return x.id === pid2; });
  if (p) { p.teamOverrides = p.teamOverrides || {}; p.teamOverrides[me] = val; }
  showToast(val == null ? 'Reset to default' : 'Allocation updated');
  pgMyCapacity();
}

function myTasksKindTabsHtml() {
  var st = myTasksState;
  return '<div class="tab-bar" style="margin-bottom:16px">' +
    '<div class="tab' + (st.kind==='plan'?' active':'') + '" onclick="setMyTasksKind(\'plan\')">Plan</div>' +
    '<div class="tab' + (st.kind==='todo'?' active':'') + '" onclick="setMyTasksKind(\'todo\')">To-Do</div>' +
  '</div>';
}

window.setMyTasksKind = function(k) {
  myTasksState.kind = k; myTasksState.tab = 'open'; myTasksState.search = ''; myTasksState.fProject = []; myTasksState.fStatus = [];
  pgMyTasks();
};

function renderMyPlanTasks() {
  var me = D.myResourceId;
  var allTasks = [];
  D.projects.forEach(function(p) {
    p.tasks.forEach(function(t, idx) {
      if (t.assigneeId === me) allTasks.push({ task: t, project: p, idx: idx });
    });
  });

  var st = myTasksState;
  var openTasksList = allTasks.filter(function(it){ return it.task.status !== 'Done'; });
  var doneTasksList = allTasks.filter(function(it){ return it.task.status === 'Done'; });
  var currentList = st.tab === 'open' ? openTasksList : doneTasksList;

  var projectChoices = []; allTasks.forEach(function(it){ if (projectChoices.indexOf(it.project.name) < 0) projectChoices.push(it.project.name); });
  var statusChoices = []; allTasks.forEach(function(it){ if (statusChoices.indexOf(it.task.status) < 0) statusChoices.push(it.task.status); });

  var displayed = currentList.slice();
  if (st.search) {
    var q = st.search.toLowerCase();
    displayed = displayed.filter(function(it){ return it.task.title.toLowerCase().indexOf(q) >= 0 || it.project.name.toLowerCase().indexOf(q) >= 0; });
  }
  if (st.fProject.length) displayed = displayed.filter(function(it){ return st.fProject.indexOf(it.project.name) >= 0; });
  if (st.fStatus.length) displayed = displayed.filter(function(it){ return st.fStatus.indexOf(it.task.status) >= 0; });
  if (st.sort) {
    displayed.sort(function(a, b) {
      var av, bv;
      if (st.sort === 'task') { av = a.task.title.toLowerCase(); bv = b.task.title.toLowerCase(); }
      else if (st.sort === 'project') { av = a.project.name.toLowerCase(); bv = b.project.name.toLowerCase(); }
      else if (st.sort === 'status') { av = a.task.status || ''; bv = b.task.status || ''; }
      else { av = a.task.end || ''; bv = b.task.end || ''; }
      if (av < bv) return st.dir === 'asc' ? -1 : 1;
      if (av > bv) return st.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }
  function filterIcon(col, choices) {
    if (!choices.length) return '';
    var isActive = (st[col]||[]).length > 0;
    return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleMyTasksFilterPanel(\'' + col + '\')"><i class="ti ti-filter' + (isActive?' th-filter-active':'') + '"></i></button>';
  }

  var rows = displayed.map(function(item) {
    var p = item.project, task = item.task, idx = item.idx;
    var canEditThis = canEdit(p);

    var descKey = p.id + '|' + task.id;
    var descOpenNow = !!taskDescOpen[descKey];
    var descRow = '';
    if (descOpenNow) {
      descRow = '<tr><td colspan="5" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' +
        (task.description ? '<div style="font-size:13px;white-space:normal;word-break:break-word;line-height:1.6">' + task.description + '</div>' : '<div class="text-muted" style="font-size:12px">No description</div>') +
        '</div></td></tr>';
    }

    var checklist = task.checklist || [];
    var clKey = p.id + '|' + task.id;
    var clOpenNow = !!taskChecklistOpen[clKey];
    var doneCount = checklist.filter(function(c){ return c.done; }).length;
    var checklistRow = '';
    if (clOpenNow) {
      var itemsHtml = checklist.length ? checklist.map(function(c) {
        return '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;cursor:pointer">' +
          '<input type="checkbox"' + (c.done ? ' checked' : '') + ' onchange="toggleChecklistItem(\'' + p.id + '\',\'' + task.id + '\',\'' + c.id + '\')">' +
          '<span style="flex:1' + (c.done ? ';text-decoration:line-through;color:#999' : '') + '">' + c.text + '</span>' +
          (canEditThis ? '<button class="btn btn-sm btn-danger" onclick="deleteChecklistItem(\'' + p.id + '\',\'' + task.id + '\',\'' + c.id + '\')"><i class="ti ti-x"></i></button>' : '') +
          '</label>';
      }).join('') : '<div class="text-muted" style="font-size:12px;margin-bottom:8px">No checklist items yet</div>';
      checklistRow = '<tr><td colspan="5" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' +
        itemsHtml +
        (canEditThis ? '<div class="comment-add-row"><input type="text" id="cl-input-' + task.id + '" style="flex:1" placeholder="Add a checklist item…"><button class="btn btn-sm btn-primary" onclick="addChecklistItem(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-plus"></i> Add</button></div>' : '') +
        '</div></td></tr>';
    }

    var logKey = p.id + '|' + task.id;
    var logOpenNow = !!taskLogOpen[logKey];
    var logRow = '';
    if (logOpenNow) {
      var entries = (task.log && task.log.length) ? task.log.slice().reverse().map(function(e){
        return '<div class="raid-log-entry"><strong>' + e.date + '</strong> — ' + e.actor + ': ' + e.action + (e.detail ? ' (' + e.detail + ')' : '') + '</div>';
      }).join('') : '<div class="raid-log-entry text-muted">No history recorded</div>';
      logRow = '<tr><td colspan="5" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' + entries + '</div></td></tr>';
    }

    var comments = task.comments || [];
    var cKey = p.id + '|' + task.id;
    var cOpenNow = !!taskCommentsOpen[cKey];
    var commentsRow = '';
    if (cOpenNow) {
      var commentEntries = comments.length ? comments.slice().reverse().map(function(c) {
        var mine = c.author === D.currentProfile.display_name;
        return '<div class="comment-item">' +
          '<div class="comment-meta"><strong>' + c.author + '</strong> <span class="text-muted">' + c.date + '</span></div>' +
          '<div class="comment-text">' + c.text + '</div>' +
          ((canEditThis || mine) ? '<div class="comment-actions"><button class="btn btn-sm" onclick="openEditComment(\'' + p.id + '\',\'' + task.id + '\',\'' + c.id + '\')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteComment(\'' + p.id + '\',\'' + task.id + '\',\'' + c.id + '\')"><i class="ti ti-trash"></i></button></div>' : '') +
          '</div>';
      }).join('') : '<div class="text-muted" style="font-size:12px;margin-bottom:8px">No comments yet</div>';
      commentsRow = '<tr><td colspan="5" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' +
        commentEntries +
        '<div class="comment-add-row"><textarea id="cmt-input-' + task.id + '" placeholder="Add a comment…" rows="2"></textarea><button class="btn btn-sm btn-primary" onclick="addComment(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-send"></i> Post</button></div>' +
        '</div></td></tr>';
    }

    var taskTags = task.tags || [];
    var doneIconHtml = '<i class="ti ' + (task.status==='Done' ? 'ti-circle-check' : 'ti-circle-dotted') + '" style="font-size:20px;flex-shrink:0;cursor:pointer;color:' + (task.status==='Done' ? '#1D9E75' : '#ccc') + '" title="' + (task.status==='Done' ? 'Reopen' : 'Mark done') + '" onclick="toggleTaskDoneIcon(\'' + p.id + '\',' + idx + ')"></i>';
    var titleCell = '<div style="display:flex;align-items:flex-start;gap:8px">' +
      doneIconHtml +
      '<div style="flex:1;min-width:0">' +
      '<div class="bold" style="font-size:13px' + (task.status==='Done' ? ';color:#999' : '') + '">' + task.title + '</div>' +
      ((canEditThis || taskTags.length) ? '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">' +
        taskTags.map(function(tg){ return tagBadge(tg); }).join('') +
        (canEditThis ? '<button class="btn btn-sm" style="padding:1px 6px" title="Edit tags" onclick="openTaskTagPicker(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-tag"></i></button>' : '') +
        '</div>' : '') +
      '</div></div>';

    return '<tr><td>' + titleCell + '</td>' +
      '<td>' + p.name + ' ' +
        '<button class="btn btn-sm" title="View project overview" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-info-circle"></i></button> ' +
        '<button class="btn btn-sm" title="View this project\'s task list" onclick="goToProject(\'' + p.id + '\',\'tasks\')"><i class="ti ti-list"></i></button></td>' +
      '<td>' + bdg(task.status) + '</td><td class="text-muted">' + (task.end || '—') + ' ' + lateBadgeHtml(isTaskLate(task)) + '</td>' +
      '<td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;justify-content:flex-end">' +
        '<button class="btn btn-sm" title="Description" onclick="toggleTaskDescription(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (descOpenNow?'ti-chevron-up':'ti-align-left') + '"></i></button>' +
        '<button class="btn btn-sm" title="Checklist" onclick="toggleTaskChecklist(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (clOpenNow?'ti-chevron-up':'ti-list-check') + '"></i>' + (checklist.length ? ' ' + doneCount + '/' + checklist.length : '') + '</button>' +
        '<button class="btn btn-sm" title="Comments" onclick="toggleTaskComments(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (cOpenNow?'ti-chevron-up':'ti-message-circle') + '"></i>' + (comments.length ? ' ' + comments.length : '') + '</button>' +
        '<button class="btn btn-sm" title="Change log" onclick="toggleTaskLog(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (logOpenNow?'ti-chevron-up':'ti-history') + '"></i></button>' +
      '</div></td></tr>' + descRow + checklistRow + logRow + commentsRow;
  }).join('');

  var searchBar = '<div class="task-filter-bar"><input type="text" id="my-tasks-search" placeholder="Search your tasks…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onMyTasksSearch(this.value)"></div>';

  document.getElementById('content').innerHTML =
    myTasksKindTabsHtml() +
    '<div class="tab-bar" style="margin-bottom:16px">' +
      '<div class="tab' + (st.tab==='open'?' active':'') + '" onclick="setMyTasksTab(\'open\')">Open tasks <span class="badge badge-gray">' + openTasksList.length + '</span></div>' +
      '<div class="tab' + (st.tab==='done'?' active':'') + '" onclick="setMyTasksTab(\'done\')">Completed tasks <span class="badge badge-gray">' + doneTasksList.length + '</span></div>' +
    '</div>' +
    '<div class="card"><div class="section-title">' + (st.tab==='open'?'Open tasks':'Completed tasks') + '</div>' + searchBar +
    (currentList.length
      ? (displayed.length
        ? '<div class="table-wrap"><table><thead><tr>' +
          '<th class="sortable-th" onclick="setMyTasksSort(\'task\')">Task ' + arrow('task') + '</th>' +
          '<th class="sortable-th"><span onclick="setMyTasksSort(\'project\')">Project ' + arrow('project') + '</span>' + filterIcon('fProject', projectChoices) + '</th>' +
          '<th class="sortable-th"><span onclick="setMyTasksSort(\'status\')">Status ' + arrow('status') + '</span>' + filterIcon('fStatus', statusChoices) + '</th>' +
          '<th class="sortable-th" onclick="setMyTasksSort(\'end\')">End ' + arrow('end') + '</th><th></th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>'
        : '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No tasks match your search/filters</p></div>')
      : '<div class="empty-state" style="padding:24px"><i class="ti ti-check"></i><p>' + (st.tab==='open' ? 'No open tasks — nice work!' : 'No completed tasks yet') + '</p></div>') +
    '</div>';
  renderNav();

  window.setMyTasksTab = function(t) { myTasksState.tab = t; pgMyTasks(); };
  window.setMyTasksSort = function(col) {
    if (myTasksState.sort === col) myTasksState.dir = myTasksState.dir === 'asc' ? 'desc' : 'asc'; else { myTasksState.sort = col; myTasksState.dir = 'asc'; }
    pgMyTasks();
  };
  window.onMyTasksSearch = function(val) {
    myTasksState.search = val;
    pgMyTasks();
    var el = document.getElementById('my-tasks-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.toggleMyTasksFilterPanel = function(col) {
    var label = col === 'fProject' ? 'Project' : 'Status';
    var choices = col === 'fProject' ? projectChoices : statusChoices;
    openFilterModal(label, choices,
      function() { return myTasksState[col] || []; },
      function(val) { var arr = myTasksState[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { myTasksState[col] = []; },
      pgMyTasks
    );
  };
}

function renderMyTodos() {
  var me = D.myResourceId;
  var allTodos = [];
  D.projects.forEach(function(p) {
    p.todos.forEach(function(td, idx) {
      if (td.assigneeId === me) allTodos.push({ todo: td, project: p, idx: idx, isPersonal: false });
    });
  });
  (D.personalTodos || []).forEach(function(td, idx) {
    if (td.assigneeId === me) allTodos.push({ todo: td, project: null, idx: idx, isPersonal: true });
  });

  var st = myTasksState;
  var openList = allTodos.filter(function(it){ return it.todo.status !== 'Done'; });
  var doneList = allTodos.filter(function(it){ return it.todo.status === 'Done'; });
  var currentList = st.tab === 'open' ? openList : doneList;

  function projectLabel(it) { return it.isPersonal ? 'Personal' : it.project.name; }
  var projectChoices = []; allTodos.forEach(function(it){ var lbl = projectLabel(it); if (projectChoices.indexOf(lbl) < 0) projectChoices.push(lbl); });
  var statusChoices = ['Not Started','In Progress','Done'];

  var displayed = currentList.slice();
  if (st.search) {
    var q = st.search.toLowerCase();
    displayed = displayed.filter(function(it){ return it.todo.title.toLowerCase().indexOf(q) >= 0 || projectLabel(it).toLowerCase().indexOf(q) >= 0; });
  }
  if (st.fProject.length) displayed = displayed.filter(function(it){ return st.fProject.indexOf(projectLabel(it)) >= 0; });
  if (st.fStatus.length) displayed = displayed.filter(function(it){ return st.fStatus.indexOf(it.todo.status) >= 0; });
  if (st.sort) {
    displayed.sort(function(a, b) {
      var av, bv;
      if (st.sort === 'task') { av = a.todo.title.toLowerCase(); bv = b.todo.title.toLowerCase(); }
      else if (st.sort === 'project') { av = projectLabel(a).toLowerCase(); bv = projectLabel(b).toLowerCase(); }
      else if (st.sort === 'status') { av = a.todo.status || ''; bv = b.todo.status || ''; }
      else { av = a.todo.due || ''; bv = b.todo.due || ''; }
      if (av < bv) return st.dir === 'asc' ? -1 : 1;
      if (av > bv) return st.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function arrow(col) { if (st.sort !== col) return ''; return '<span class="sort-arrow">' + (st.dir==='asc'?'▲':'▼') + '</span>'; }
  function filterIcon(col, choices) {
    if (!choices.length) return '';
    var isActive = (st[col]||[]).length > 0;
    return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleMyTasksFilterPanel(\'' + col + '\')"><i class="ti ti-filter' + (isActive?' th-filter-active':'') + '"></i></button>';
  }

  var rows = displayed.map(function(item) {
    var p = item.project, td = item.todo, idx = item.idx, isPersonal = item.isPersonal;
    var pidKey = isPersonal ? null : p.id;
    var canEditThis = isPersonal || canEdit(p);

    var descKey = pidKey + '|' + td.id;
    var descOpenNow = !!todoDescOpen[descKey];
    var descRow = '';
    if (descOpenNow) {
      descRow = '<tr><td colspan="5" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' +
        (td.description ? '<div style="font-size:13px;white-space:normal;word-break:break-word;line-height:1.6">' + td.description + '</div>' : '<div class="text-muted" style="font-size:12px">No description</div>') +
        '</div></td></tr>';
    }

    var logKey = pidKey + '|' + td.id;
    var logOpenNow = !!todoLogOpen[logKey];
    var logRow = '';
    if (logOpenNow) {
      var entries = (td.log && td.log.length) ? td.log.slice().reverse().map(function(e){
        return '<div class="raid-log-entry"><strong>' + e.date + '</strong> — ' + e.actor + ': ' + e.action + (e.detail ? ' (' + e.detail + ')' : '') + '</div>';
      }).join('') : '<div class="raid-log-entry text-muted">No history recorded</div>';
      logRow = '<tr><td colspan="5" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' + entries + '</div></td></tr>';
    }

    var comments = td.comments || [];
    var cKey = pidKey + '|' + td.id;
    var cOpenNow = !!todoCommentsOpen[cKey];
    var commentsRow = '';
    if (cOpenNow) {
      var commentEntries = comments.length ? comments.slice().reverse().map(function(c) {
        var mine = c.author === D.currentProfile.display_name;
        return '<div class="comment-item">' +
          '<div class="comment-meta"><strong>' + c.author + '</strong> <span class="text-muted">' + c.date + '</span></div>' +
          '<div class="comment-text">' + c.text + '</div>' +
          ((canEditThis || mine) ? '<div class="comment-actions"><button class="btn btn-sm" onclick="openEditTodoComment(' + (isPersonal?'null':("'"+p.id+"'")) + ',\'' + td.id + '\',\'' + c.id + '\')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteTodoComment(' + (isPersonal?'null':("'"+p.id+"'")) + ',\'' + td.id + '\',\'' + c.id + '\')"><i class="ti ti-trash"></i></button></div>' : '') +
          '</div>';
      }).join('') : '<div class="text-muted" style="font-size:12px;margin-bottom:8px">No comments yet</div>';
      commentsRow = '<tr><td colspan="5" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' +
        commentEntries +
        '<div class="comment-add-row"><textarea id="todo-cmt-input-' + td.id + '" placeholder="Add a comment…" rows="2"></textarea><button class="btn btn-sm btn-primary" onclick="addTodoComment(' + (isPersonal?'null':("'"+p.id+"'")) + ',\'' + td.id + '\')"><i class="ti ti-send"></i> Post</button></div>' +
        '</div></td></tr>';
    }

    var doneIconHtml = '<i class="ti ' + (td.status==='Done' ? 'ti-circle-check' : 'ti-circle-dotted') + '" style="font-size:20px;flex-shrink:0;cursor:pointer;color:' + (td.status==='Done' ? '#1D9E75' : '#ccc') + '" title="' + (td.status==='Done' ? 'Reopen' : 'Mark done') + '" onclick="toggleTodoDoneIcon(' + (isPersonal?'null':("'"+p.id+"'")) + ',' + idx + ')"></i>';
    var titleCell = '<div style="display:flex;align-items:center;gap:8px">' + doneIconHtml + '<span style="font-size:13px' + (td.status==='Done' ? ';color:#999' : '') + '">' + td.title + '</span></div>';

    var projectCell = isPersonal
      ? '<span class="badge badge-gray">Personal</span>'
      : p.name + ' ' +
        '<button class="btn btn-sm" title="View project overview" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-info-circle"></i></button> ' +
        '<button class="btn btn-sm" title="View this project\'s to-do list" onclick="goToProject(\'' + p.id + '\',\'todos\')"><i class="ti ti-list"></i></button>';

    return '<tr><td>' + titleCell + '</td>' +
      '<td>' + projectCell + '</td>' +
      '<td>' + bdg(td.status) + '</td><td class="text-muted">' + (td.due || '—') + ' ' + lateBadgeHtml(isTodoLate(td)) + '</td>' +
      '<td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;justify-content:flex-end">' +
        '<button class="btn btn-sm" title="Description" onclick="toggleTodoDescription(' + (isPersonal?'null':("'"+p.id+"'")) + ',\'' + td.id + '\')"><i class="ti ' + (descOpenNow?'ti-chevron-up':'ti-align-left') + '"></i></button>' +
        '<button class="btn btn-sm" title="Comments" onclick="toggleTodoComments(' + (isPersonal?'null':("'"+p.id+"'")) + ',\'' + td.id + '\')"><i class="ti ' + (cOpenNow?'ti-chevron-up':'ti-message-circle') + '"></i>' + (comments.length ? ' ' + comments.length : '') + '</button>' +
        '<button class="btn btn-sm" title="Change log" onclick="toggleTodoLog(' + (isPersonal?'null':("'"+p.id+"'")) + ',\'' + td.id + '\')"><i class="ti ' + (logOpenNow?'ti-chevron-up':'ti-history') + '"></i></button>' +
        (isPersonal ? '<button class="btn btn-sm" title="Edit" onclick="openPersonalTodoModal(' + idx + ')"><i class="ti ti-edit"></i></button>' : '') +
      '</div></td></tr>' + descRow + logRow + commentsRow;
  }).join('');

  var searchBar = '<div class="task-filter-bar"><input type="text" id="my-tasks-search" placeholder="Search your to-dos…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onMyTasksSearch(this.value)"></div>';

  document.getElementById('content').innerHTML =
    myTasksKindTabsHtml() +
    '<div class="tab-bar" style="margin-bottom:16px">' +
      '<div class="tab' + (st.tab==='open'?' active':'') + '" onclick="setMyTasksTab(\'open\')">Open to-dos <span class="badge badge-gray">' + openList.length + '</span></div>' +
      '<div class="tab' + (st.tab==='done'?' active':'') + '" onclick="setMyTasksTab(\'done\')">Completed to-dos <span class="badge badge-gray">' + doneList.length + '</span></div>' +
    '</div>' +
    '<div class="card">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
      '<div class="section-title" style="margin-bottom:0">' + (st.tab==='open'?'Open to-dos':'Completed to-dos') + '</div>' +
      '<button class="btn btn-primary btn-sm" onclick="openPersonalTodoModal(null)"><i class="ti ti-plus"></i> Add a to-do</button>' +
    '</div>' + searchBar +
    (currentList.length
      ? (displayed.length
        ? '<div class="table-wrap"><table><thead><tr>' +
          '<th class="sortable-th" onclick="setMyTasksSort(\'task\')">To-Do ' + arrow('task') + '</th>' +
          '<th class="sortable-th"><span onclick="setMyTasksSort(\'project\')">Project ' + arrow('project') + '</span>' + filterIcon('fProject', projectChoices) + '</th>' +
          '<th class="sortable-th"><span onclick="setMyTasksSort(\'status\')">Status ' + arrow('status') + '</span>' + filterIcon('fStatus', statusChoices) + '</th>' +
          '<th class="sortable-th" onclick="setMyTasksSort(\'end\')">Due ' + arrow('end') + '</th><th></th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>'
        : '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No to-dos match your search/filters</p></div>')
      : '<div class="empty-state" style="padding:24px"><i class="ti ti-check"></i><p>' + (st.tab==='open' ? 'No open to-dos — nice work!' : 'No completed to-dos yet') + '</p></div>') +
    '</div>';
  renderNav();

  window.setMyTasksTab = function(t) { myTasksState.tab = t; pgMyTasks(); };
  window.setMyTasksSort = function(col) {
    if (myTasksState.sort === col) myTasksState.dir = myTasksState.dir === 'asc' ? 'desc' : 'asc'; else { myTasksState.sort = col; myTasksState.dir = 'asc'; }
    pgMyTasks();
  };
  window.onMyTasksSearch = function(val) {
    myTasksState.search = val;
    pgMyTasks();
    var el = document.getElementById('my-tasks-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.toggleMyTasksFilterPanel = function(col) {
    var label = col === 'fProject' ? 'Project' : 'Status';
    var choices = col === 'fProject' ? projectChoices : statusChoices;
    openFilterModal(label, choices,
      function() { return myTasksState[col] || []; },
      function(val) { var arr = myTasksState[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { myTasksState[col] = []; },
      pgMyTasks
    );
  };
}

// ── Boot / Auth ────────────────────────────────────────────────────────────────

async function fetchProfile(userId) {
  var result = await sb.from('profiles').select('id, email, display_name, role').eq('id', userId).single();
  if (result.error) { console.error('Could not load profile:', result.error); return null; }
  return result.data;
}

function showAuthError(msg) {
  var el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}

async function handleLoginSubmit() {
  var email = document.getElementById('auth-email').value.trim();
  var password = document.getElementById('auth-password').value;
  var errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  if (!email || !password) { showAuthError('Enter your email and password.'); return; }

  var submitBtn = document.getElementById('auth-submit');
  submitBtn.disabled = true;

  var result = await sb.auth.signInWithPassword({ email: email, password: password });
  submitBtn.disabled = false;

  if (result.error) {
    showAuthError(result.error.message || 'Could not sign in. Check your email and password.');
    return;
  }
  var profile = await fetchProfile(result.data.user.id);
  if (!profile) {
    showAuthError('Signed in, but no profile record was found for this account.');
    return;
  }
  D.currentProfile = profile;
  bootAppForUser();
}

async function handleLogout() {
  await sb.auth.signOut();
  D.currentProfile = null;
  D.viewingAsResourceId = null;
  D.viewingAsMode = null;
  document.getElementById('app-root').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-error').style.display = 'none';
}

function generatePassword() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  var out = '';
  for (var i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function pwField(id, label) {
  return '<div class="form-group"><div class="form-label">' + label + '</div>' +
    '<div style="display:flex;gap:8px">' +
    '<input type="password" id="' + id + '">' +
    '<button type="button" class="btn btn-sm" id="' + id + '-toggle" title="Show/hide"><i class="ti ti-eye"></i></button>' +
    '</div></div>';
}

function wirePasswordToggle(id) {
  document.getElementById(id + '-toggle').onclick = function() {
    var el = document.getElementById(id);
    var showing = el.type === 'text';
    el.type = showing ? 'password' : 'text';
    this.innerHTML = '<i class="ti ' + (showing ? 'ti-eye' : 'ti-eye-off') + '"></i>';
  };
}

function openChangePasswordModal() {
  showModal('<div class="modal-title">Change password <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    pwField('cp-current', 'Current password') +
    pwField('cp-new', 'New password') +
    pwField('cp-confirm', 'Confirm new password') +
    '<div id="cp-error" class="auth-error" style="display:none"></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="cp-save"><i class="ti ti-check"></i> Update password</button></div>');
  wirePasswordToggle('cp-current'); wirePasswordToggle('cp-new'); wirePasswordToggle('cp-confirm');

  document.getElementById('cp-save').onclick = async function() {
    var current = document.getElementById('cp-current').value;
    var next = document.getElementById('cp-new').value;
    var confirmVal = document.getElementById('cp-confirm').value;
    var errEl = document.getElementById('cp-error');
    errEl.style.display = 'none';
    if (!current) { errEl.textContent = 'Enter your current password.'; errEl.style.display = 'block'; return; }
    if (!next || next.length < 8) { errEl.textContent = 'New password must be at least 8 characters.'; errEl.style.display = 'block'; return; }
    if (next !== confirmVal) { errEl.textContent = 'New passwords do not match.'; errEl.style.display = 'block'; return; }

    var btn = document.getElementById('cp-save'); btn.disabled = true;
    var updateResult = await sb.auth.updateUser({ password: next, current_password: current });
    btn.disabled = false;
    if (updateResult.error) { errEl.textContent = updateResult.error.message; errEl.style.display = 'block'; return; }

    showToast('Password updated');
    closeModal();
  };
}

async function initApp() {
  document.getElementById('auth-submit').onclick = handleLoginSubmit;
  document.getElementById('auth-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleLoginSubmit();
  });
  document.getElementById('logout-btn').onclick = handleLogout;
  document.getElementById('change-password-btn').onclick = openChangePasswordModal;
  wirePasswordToggle('auth-password');

  var sessionResult = await sb.auth.getSession();
  var session = sessionResult.data && sessionResult.data.session;

  if (session) {
    var profile = await fetchProfile(session.user.id);
    if (profile) {
      D.currentProfile = profile;
      bootAppForUser();
      return;
    }
  }
  document.getElementById('auth-screen').style.display = 'flex';
}

initApp();