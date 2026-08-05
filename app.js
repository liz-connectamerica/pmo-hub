// ── Supabase connection ───────────────────────────────────────────────────────
var SUPABASE_URL = 'https://mglwdprqbjncnlioifya.supabase.co';
var SUPABASE_KEY = 'sb_publishable_iEcNnoDk0u7CqoAuh8Kuyg_nDl-QuO3';
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

async function loadRequests() {
  var results = await Promise.all([
    sb.from('requests').select('*'),
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
      valueJustification: r.value_justification, startDate: r.start_date, targetEndDate: r.target_end_date,
      editedByName: r.edited_by_name, editedAt: r.edited_at,
      tags: (tagsByRequest[r.id] || []).map(function(t){ return tagNameById[t.tag_id]; }).filter(Boolean),
      team: (teamByRequest[r.id] || []).map(function(t){ return resourceNameById[t.resource_id]; }).filter(Boolean)
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
    sb.from('resource_tags').select('*')
  ]);
  for (var i = 0; i < results.length; i++) {
    if (results[i].error) { console.error('loadTags query failed:', results[i].error); return { tags: [], projectTagsByProject: {}, resourceTagsByResource: {} }; }
  }
  var tagRows = results[0].data || [];
  var projectTagRows = results[1].data || [];
  var resourceTagRows = results[2].data || [];
  var nameById = {};
  tagRows.forEach(function(t){ nameById[t.id] = t.name; });
  var projectTagsByProject = groupBy(projectTagRows, 'project_id');
  var resourceTagsByResource = groupBy(resourceTagRows, 'resource_id');
  var projectTagNames = {};
  Object.keys(projectTagsByProject).forEach(function(pid){ projectTagNames[pid] = projectTagsByProject[pid].map(function(r){ return nameById[r.tag_id]; }).filter(Boolean); });
  var resourceTagNames = {};
  Object.keys(resourceTagsByResource).forEach(function(rid){ resourceTagNames[rid] = resourceTagsByResource[rid].map(function(r){ return nameById[r.tag_id]; }).filter(Boolean); });
  return {
    tags: tagRows.map(function(t){ return { id: t.id, name: t.name }; }).sort(function(a,b){ return a.name.localeCompare(b.name); }),
    projectTagNames: projectTagNames,
    resourceTagNames: resourceTagNames
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
      allocated: r.allocated_pct, nonProjectCapacity: r.non_project_capacity,
      projects: projectIds, email: r.email, userId: r.user_id
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

async function loadAllProjects() {
  var results = await Promise.all([
    sb.from('projects').select('*'),
    sb.from('profiles').select('id, display_name, is_active'),
    sb.from('resource_projects').select('*'),
    sb.from('milestones').select('*'),
    sb.from('milestone_log').select('*'),
    sb.from('tasks').select('*'),
    sb.from('task_log').select('*'),
    sb.from('task_comments').select('*'),
    sb.from('raid_items').select('*'),
    sb.from('raid_log').select('*'),
    sb.from('doc_folders').select('*'),
    sb.from('documents').select('*'),
    sb.from('resources').select('id, name, user_id'),
    sb.from('project_categories').select('*'),
    sb.from('project_dependencies').select('*')
  ]);

  for (var i = 0; i < results.length; i++) {
    if (results[i].error) { console.error('loadAllProjects query failed:', results[i].error); return []; }
  }

  var projectsRows      = results[0].data || [];
  var profilesRows      = results[1].data || [];
  var teamRows          = results[2].data || [];
  var milestoneRows     = results[3].data || [];
  var milestoneLogRows  = results[4].data || [];
  var taskRows          = results[5].data || [];
  var taskLogRows       = results[6].data || [];
  var commentRows       = results[7].data || [];
  var raidRows          = results[8].data || [];
  var raidLogRows       = results[9].data || [];
  var folderRows        = results[10].data || [];
  var docRows           = results[11].data || [];
  var resourceMiniRows  = results[12].data || [];
  var categoryRows      = results[13].data || [];
  var dependencyRows    = results[14].data || [];

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
  var raidByProj         = groupBy(raidRows, 'project_id');
  var raidLogByItem      = groupBy(raidLogRows, 'raid_item_id');
  var foldersByProj      = groupBy(folderRows, 'project_id');
  var docsByProj         = groupBy(docRows, 'project_id');
  var folderNameById     = {};
  folderRows.forEach(function(f){ folderNameById[f.id] = f.name; });

  function mapLog(rows) {
    return (rows || []).map(function(r){
      return { date: ymd(r.logged_at), actor: r.actor_name, action: r.action, detail: r.detail || '' };
    });
  }

  return projectsRows.map(function(pr) {
    var teamRowsForProj = teamByProject[pr.id] || [];
    var teamIds = teamRowsForProj.map(function(t){ return t.resource_id; });
    var teamNames = teamIds.map(function(id){ return resourceNameById[id] || id; });

    var milestones = (milestonesByProj[pr.id] || []).map(function(m) {
      return {
        id: m.id, name: m.name, date: m.target_date, done: m.done,
        completedDate: m.completed_date,
        log: mapLog(msLogByMilestone[m.id])
      };
    });

    var tasks = (tasksByProj[pr.id] || []).map(function(t) {
      return {
        id: t.id, title: t.title,
        assignee: t.assignee_name || (t.assignee_id ? resourceNameById[t.assignee_id] : ''),
        assigneeId: t.assignee_id, status: t.status, due: t.due_date,
        log: mapLog(taskLogByTask[t.id]),
        comments: (commentsByTask[t.id] || []).map(function(c) {
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

    return {
      id: pr.id, name: pr.name,
      owner: pr.owner_name || (pr.owner_id ? resourceNameById[pr.owner_id] : ''), ownerId: pr.owner_id,
      sponsor: pr.sponsor, sponsorEmail: pr.sponsor_email, sponsorId: pr.sponsor_id,
      categories: (categoriesByProj[pr.id]||[]).map(function(c){ return c.category; }), businessUnit: pr.business_unit,
      dependencies: (dependenciesByProject[pr.id]||[]).map(function(d){ return projectInfoById[d.depends_on_project_id]; }).filter(Boolean),
      team: teamNames, teamIds: teamIds,
      status: pr.status, phase: pr.phase, progress: pr.progress,
      start: pr.start_date, end: pr.end_date, plannedStart: pr.planned_start,
      value: pr.value_area, priority: pr.priority, description: pr.description,
      blockers: pr.blockers, health: pr.health, stage: pr.stage, requestId: pr.request_id,
      holdReason: pr.hold_reason, preHoldStage: pr.pre_hold_stage, heldAt: pr.held_at,
      targetQuarter: pr.target_quarter, targetYear: pr.target_year, completedAt: pr.completed_at,
      targetEndQuarter: pr.target_end_quarter, targetEndYear: pr.target_end_year,
      deliveryMethodology: pr.delivery_methodology, projectNumber: pr.project_number, createdAt: pr.created_at,
      milestones: milestones, tasks: tasks, raid: raid,
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
  D.projects.forEach(function(p){ p.tasks.forEach(function(t){ if (t.assigneeId === myId && t.status !== 'Done') count++; }); });
  return count;
}

function myProjects() {
  return D.projects;
}

function myAssignedProjects() {
  var myId = D.myResourceId;
  if (!myId) return [];
  return D.projects.filter(function(p){
    return (p.teamIds||[]).indexOf(myId) >= 0 || p.ownerId === myId ||
      p.tasks.some(function(t){ return t.assigneeId === myId; });
  });
}

function hasAssignedWork() {
  var myId = D.myResourceId;
  if (!myId) return false;
  var onActiveProject = D.projects.some(function(p){ return p.stage === 'active' && ((p.teamIds||[]).indexOf(myId) >= 0 || p.ownerId === myId); });
  var hasOpenTask = D.projects.some(function(p){ return p.tasks.some(function(t){ return t.assigneeId === myId && t.status !== 'Done'; }); });
  return onActiveProject || hasOpenTask;
}

function currentUser() {
  return D.currentProfile ? D.currentProfile.display_name : '';
}

function canEdit(p) {
  if (D.role === 'admin') return true;
  return !!(p.ownerId && D.myResourceId && p.ownerId === D.myResourceId);
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

var TAG_COLOR_CLASSES = ['badge-purple','badge-teal','badge-amber','badge-red','badge-blue','badge-green','badge-coral'];
function tagColorClass(name) {
  var hash = 0;
  for (var i = 0; i < name.length; i++) { hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0; }
  return TAG_COLOR_CLASSES[Math.abs(hash) % TAG_COLOR_CLASSES.length];
}
function tagBadge(name) {
  return '<span class="badge ' + tagColorClass(name) + '">' + name + '</span>';
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
    pgProjectDetail(m[1], 'tasks');
  } else if (currentPage === 'my-tasks') {
    pgMyTasks();
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
  if (!taskViewState[pid]) taskViewState[pid] = { sort:'due', dir:'asc', search:'', fAssignee:[], fStatus:[], openFilter:null };
  return taskViewState[pid];
}

var raidLogOpen = {};
var taskLogOpen = {};
var milestoneLogOpen = {};
var taskCommentsOpen = {};
var raidSearchState = {};
var docFolderState = {};
var roadmapMsState = { sort:'due', dir:'asc', search:'', fProject:[], fStatus:[], openFilter:null };
var roadmapCategoryFilter = 'All';
var PHASE_COLORS = { 'Not Started':'#9B9B93', 'Discovery':'#185FA5', 'Design':'#534AB7', 'Build':'#1D9E75', 'Testing':'#EF9F27', 'Deployment':'#D85A30', 'Monitor':'#993556' };
var dashProjState = { sort:'priority', dir:'asc', search:'', fStatus:[], fPhase:[], openFilter:null, tagFilter:[] };
var resourcesPageState = { tab:'individual', sort:'firstName', dir:'asc', search:'', expandedId:null };
var portfolioTagFilter = [];
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
var myTasksState = { sort:'due', dir:'asc', search:'', tab:'open', fProject:[], fStatus:[], openFilter:null };
var PRIORITY_RANK = { 'Critical':0, 'High':1, 'Medium':2, 'Low':3 };
var rejectedFilterState = { range:'30' };

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
  value: 'Value Area', businessUnit: 'Business Unit', sponsor: 'Sponsor', owner: 'Owner',
  start: 'Start Date', end: 'Target End Date', progress: 'Progress %', health: 'Health',
  description: 'Description', blockers: 'Blockers', holdReason: 'Hold Reason', deliveryMethodology: 'Delivery Methodology'
};

// Compares a "before" snapshot to an "after" snapshot across every tracked
// Overview field and logs whichever ones actually changed. Pass before=null
// to log every present field as a fresh value (used when a project is first
// created from an approved request).
async function logProjectChanges(projectId, before, after, source) {
  var rows = [];
  Object.keys(CHANGE_LOG_FIELDS).forEach(function(field) {
    if (!(field in after)) return;
    var oldVal = before ? before[field] : undefined;
    var newVal = after[field];
    var oldNorm = (oldVal == null || oldVal === '') ? null : String(oldVal);
    var newNorm = (newVal == null || newVal === '') ? null : String(newVal);
    if (oldNorm === newNorm) return;
    rows.push({
      project_id: projectId, field_name: field, field_label: CHANGE_LOG_FIELDS[field],
      old_value: oldNorm, new_value: newNorm,
      changed_by_name: D.currentProfile.display_name, source: source
    });
  });
  if (!rows.length) return;
  await sb.from('project_change_log').insert(rows);
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

function bdg(s) {
  if (!s) return '';
  var map = {
    'On Track':'badge-teal','At Risk':'badge-amber','Planning':'badge-blue','Blocked':'badge-red','Complete':'badge-green','Completed':'badge-green','Not Started':'badge-gray',
    'Pending':'badge-amber','Approved':'badge-teal','Rejected':'badge-red','Backlog':'badge-amber','Active':'badge-teal','Planned':'badge-blue','Revoked':'badge-gray',
    'Done':'badge-teal','In Progress':'badge-purple','To Do':'badge-gray',
    'Open':'badge-red','Closed':'badge-teal',
    'Critical':'badge-red','High':'badge-coral','Medium':'badge-amber','Low':'badge-blue'
  };
  return '<span class="badge ' + (map[s] || 'badge-gray') + '">' + s + '</span>';
}

function badgeIf(cls, s) {
  return s ? '<span class="badge ' + cls + '">' + s + '</span>' : '';
}

function hdot(h) {
  var c = { green:'#1D9E75', amber:'#EF9F27', red:'#E24B4A' }[h] || '#ccc';
  return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + c + ';margin-right:6px;vertical-align:middle"></span>';
}

function stagePill(s) {
  var m = { backlog:{bg:'#FAEEDA',c:'#633806',l:'Backlog'}, planned:{bg:'#E6F1FB',c:'#0C447C',l:'Planned'}, active:{bg:'#E1F5EE',c:'#085041',l:'Active'}, complete:{bg:'#f0ede8',c:'#444',l:'Completed'}, hold:{bg:'#FBE7E3',c:'#993C1D',l:'Hold'} };
  var x = m[s] || m.backlog;
  return '<span class="stage-pill" style="background:' + x.bg + ';color:' + x.c + '">' + x.l + '</span>';
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
    { s:'Overview', items:[{id:'dashboard',icon:'ti-layout-dashboard',label:'Dashboard'},{id:'roadmap',icon:'ti-road',label:'Roadmap'},{id:'future-planning',icon:'ti-calendar-time',label:'Future Planning'},{id:'portfolio',icon:'ti-folder-open',label:'Portfolio'}] },
    { s:'Projects', items:[
      {id:'projects', icon:'ti-briefcase',      label:'Active'},
      {id:'planned',  icon:'ti-calendar-event', label:'Planned'},
      {id:'backlog',  icon:'ti-stack-2',        label:'Backlog',         badge:'backlog'},
      {id:'hold',     icon:'ti-player-pause',   label:'Hold'},
      {id:'completed',icon:'ti-circle-check',   label:'Completed'},
      {id:'resources',icon:'ti-users',          label:'Resources'}
    ]},
    { s:'Intake',   items:[{id:'requests',icon:'ti-inbox',label:'Requests',badge:'pending'}] },
    { s:'My Requests', items:[
      {id:'submit',       icon:'ti-send',  label:'Submit a Request'},
      {id:'my-requests',  icon:'ti-clock', label:'My Requests'}
    ]},
    { s:'Data Tools', items:[
      {id:'import-projects', icon:'ti-file-upload', label:'Import Projects'}
    ]},
    { s:'Administration', items:[
      {id:'admin-users', icon:'ti-users-group', label:'Manage Users'},
      {id:'admin-tags', icon:'ti-tag', label:'Manage Tags'},
      {id:'admin-values', icon:'ti-list-details', label:'Manage Values'},
      {id:'all-projects', icon:'ti-table', label:'All Projects'}
    ]}
  ],
  member: [
    { s:'Overview', items:[
      {id:'dashboard', icon:'ti-layout-dashboard', label:'Dashboard'},
      {id:'roadmap',   icon:'ti-road',             label:'Roadmap'},
      {id:'portfolio', icon:'ti-folder-open',      label:'Portfolio'}
    ]},
    { s:'Projects', items:[
      {id:'projects',  icon:'ti-briefcase',      label:'Active'},
      {id:'planned',   icon:'ti-calendar-event', label:'Planned'},
      {id:'backlog',   icon:'ti-stack-2',        label:'Backlog',         badge:'backlog'},
      {id:'hold',      icon:'ti-player-pause',   label:'Hold'},
      {id:'completed', icon:'ti-circle-check',   label:'Completed'},
      {id:'resources', icon:'ti-users',          label:'Resources'}
    ]},
    { s:'My Requests', items:[
      {id:'submit',       icon:'ti-send',  label:'Submit a Request'},
      {id:'my-requests',  icon:'ti-clock', label:'My Requests'}
    ]}
  ]
};

function renderNav() {
  var defs = (NAV_DEF[D.role] || []).slice();
  if (hasAssignedWork()) {
    defs = defs.concat([{ s:'My Work', items:[
      {id:'my-projects', icon:'ti-briefcase',   label:'My Projects'},
      {id:'my-tasks',    icon:'ti-check',       label:'My Tasks', badge:'my-tasks'},
      {id:'my-capacity', icon:'ti-adjustments', label:'My Capacity'}
    ]}]);
  }
  var h = '';
  defs.forEach(function(sec) {
    h += '<div class="sidebar-section">' + sec.s + '</div>';
    sec.items.forEach(function(item) {
      var cnt = item.badge === 'pending' ? pendingCount() : item.badge === 'backlog' ? backlogCount() : item.badge === 'my-tasks' ? myOpenTasksCount() : 0;
      var badge = cnt > 0 ? '<span class="nav-badge">' + cnt + '</span>' : '';
      h += '<div class="nav-item' + (currentPage === item.id ? ' active' : '') + '" onclick="nav(\'' + item.id + '\')">' +
           '<i class="ti ' + item.icon + '"></i>' + item.label + badge + '</div>';
    });
  });
  document.getElementById('nav-menu').innerHTML = h;
}

var PAGE_RENDERERS = {
  dashboard:pgDashboard, portfolio:pgPortfolio, requests:pgRequests,
  backlog:pgBacklog, planned:pgPlanned, projects:pgProjects,
  completed:pgCompleted, roadmap:pgRoadmap, resources:pgResources,
  submit:pgSubmit, 'my-requests':pgMyRequests,
  'my-projects':pgMyProjectsResource, 'my-tasks':pgMyTasks, 'my-capacity':pgMyCapacity,
  'import-projects':pgImportProjects, 'admin-users':pgAdminUsers, 'admin-tags':pgAdminTags, 'admin-values':pgManageValues, 'future-planning':pgFuturePlanning, hold:pgHold, 'all-projects':pgAllProjects
};

function pageAllowedForRole(page, role) {
  if (page === 'my-projects' || page === 'my-tasks' || page === 'my-capacity') {
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
  var m2 = hash.match(/^#\/([a-zA-Z0-9_-]+)/);
  if (m2) { renderPage(m2[1]); return; }
  renderPage('dashboard');
}
window.addEventListener('hashchange', handleRoute);

async function bootAppForUser(skipReload) {
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
    var loaded = await Promise.all([loadAllProjects(), loadResources(), loadRequests(), loadTags(), loadFieldOptions()]);
    D.projects = loaded[0];
    D.resources = loaded[1];
    D.requests = loaded[2];
    var tagData = loaded[3];
    D.tags = tagData.tags;
    D.projects.forEach(function(p){ p.tags = tagData.projectTagNames[p.id] || []; });
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
  D.projects.forEach(function(p){ p.tags = tagData.projectTagNames[p.id] || []; });
  D.resources.forEach(function(r){ r.tags = tagData.resourceTagNames[r.id] || []; });
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
    return '<tr>' +
      '<td class="bold">' + hdot(p.health) + p.name + '</td><td>' + bdg(p.status) + '</td><td>' + bdg(p.priority) + '</td>' +
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
        '<div style="display:flex;justify-content:space-between"><span class="text-muted">' + (p.owner || 'No Owner') + '</span><span class="text-muted">' + (p.end || 'TBD') + '</span></div></div>';
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

  var estimateLabel = r.estimatedType ? 'Estimated ' + r.estimatedType : null;
  var estimateDisplay = (isAdmin && r.estimatedAmount != null)
    ? '<div><div class="form-label">' + estimateLabel + '</div>' + fmtCost(r.estimatedAmount) + (r.estimatedFrequency ? ' / ' + r.estimatedFrequency.toLowerCase() : '') + '</div>'
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
      '<div><div class="form-label">This request is a…</div>' + opportunityDisplay + '</div>' +
      (r.value ? '<div><div class="form-label">Value area</div><span class="badge badge-purple">' + r.value + '</span></div>' : '') +
      estimateDisplay +
    '</div>' +
    '<div class="form-group"><div class="form-label">Description</div><div style="background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6">' + (r.description||'') + '</div></div>' +
    (r.valueJustification ? '<div class="form-group"><div class="form-label">Value justification</div><div style="background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6">' + r.valueJustification + '</div></div>' : '') +
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
    var priorOptsApprove = PRIORITIES.map(function(p){ return '<option value="' + p + '"' + ((draft.priority||r.priority)===p?' selected':'') + '>' + p + '</option>'; }).join('');
    var valOptsApprove = VALUE_AREAS.map(function(v){ return '<option' + ((draft.value||r.value)===v?' selected':'') + '>' + v + '</option>'; }).join('');
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
        '<div class="form-group"><div class="form-label">Priority *</div><select id="rv-priority"><option value="">— Select —</option>' + priorOptsApprove + '</select></div>' +
        '<div class="form-group"><div class="form-label">Value area *</div><select id="rv-value"><option value="">— Select —</option>' + valOptsApprove + '</select></div>' +
      '</div>' +
      '<div class="form-group"><div class="form-label">Business Unit *</div><select id="rv-bu">' + buOptsApprove + '</select></div>' +
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
  var curJustification = 'justification' in v ? v.justification : (r.valueJustification || '');
  var buOpts = BUSINESS_UNITS.map(function(bu){ return '<option' + (curBu===bu?' selected':'') + '>' + bu + '</option>'; }).join('');
  var oppOpts = ['Revenue opportunity','Cost savings opportunity','Something else'].map(function(o){ return '<option' + (curOppType===o?' selected':'') + '>' + o + '</option>'; }).join('');
  var showOther = curOppType === 'Something else';
  var showEstimate = curOppType === 'Revenue opportunity' || curOppType === 'Cost savings opportunity';
  var estimateLabel = curOppType === 'Revenue opportunity' ? 'Estimated Revenue' : 'Estimated Savings';
  var selectedTags = ('tags' in v ? v.tags : r.tags) || [];
  var selectedTeam = (('team' in v ? v.team : r.team) || []).slice();

  function teamOptionsHtml() {
    var options = individualResourceNames().concat(teamNames());
    return options.map(function(n) {
      var isTeam = teamNames().indexOf(n) >= 0;
      var chk = selectedTeam.indexOf(n) >= 0 ? ' checked' : '';
      return '<label class="member-check er2-team-row" data-name="' + n.toLowerCase() + '"><input type="checkbox" data-name="' + n.replace(/"/g,'&quot;') + '" onchange="toggleEditReqTeamMember(this)"' + chk + '> ' + n + (isTeam ? ' <i class="ti ti-users" style="color:#185FA5;font-size:11px"></i>' : '') + '</label>';
    }).join('');
  }

  showModal('<div class="modal-title">Edit request <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Project title *</div><input type="text" id="er2-title" value="' + curTitle.replace(/"/g,'&quot;') + '"></div>' +
    '<div class="form-group"><div class="form-label">Business Unit *</div><select id="er2-bu">' + buOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Sponsor</div><input type="text" id="er2-sponsor" value="' + curSponsor.replace(/"/g,'&quot;') + '" placeholder="Optional"></div>' +
    '<div class="form-group"><div class="form-label">Description *</div><textarea id="er2-desc" rows="4">' + curDesc.replace(/</g,'&lt;') + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">This request is a… *</div><select id="er2-opp-type" onchange="onEditReqOppTypeChange()"><option value="">— Select —</option>' + oppOpts + '</select></div>' +
    '<div class="form-group" id="er2-opp-other-row" style="display:' + (showOther?'block':'none') + '"><div class="form-label">Please describe</div><input type="text" id="er2-opp-other" value="' + curOppOther.replace(/"/g,'&quot;') + '"></div>' +
    '<div class="form-group" id="er2-estimate-row" style="display:' + (showEstimate?'block':'none') + '">' +
      '<div class="form-label" id="er2-estimate-label">' + estimateLabel + '</div>' +
      '<div class="grid-2"><select id="er2-est-freq"><option' + (curEstFreq==='Monthly'?' selected':'') + '>Monthly</option><option' + (curEstFreq==='Annually'?' selected':'') + '>Annually</option></select>' +
      '<input type="text" id="er2-est-amount" value="' + (curEstAmount!=null?curEstAmount:'') + '" placeholder="$ amount (optional)"></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Value justification</div><textarea id="er2-justification" rows="3">' + curJustification.replace(/</g,'&lt;') + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">Tags</div><div id="er2-tags-chips" style="margin-bottom:8px">' + (selectedTags.length ? selectedTags.map(function(t){ return tagBadge(t); }).join(' ') : '<span class="text-muted" style="font-size:13px">No tags selected</span>') + '</div><button class="btn btn-sm" onclick="openEditReqTagPicker()"><i class="ti ti-tag"></i> Select tags</button></div>' +
    '<div class="form-group"><div class="form-label">Team</div><input type="text" id="er2-team-search" placeholder="Search people or teams…" oninput="filterEditReqTeamList(this.value)">' +
      '<div id="er2-team-list" style="max-height:200px;overflow-y:auto;margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px">' + teamOptionsHtml() + '</div></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="er2-save">Save changes</button></div>');

  window.onEditReqOppTypeChange = function() {
    var type = document.getElementById('er2-opp-type').value;
    document.getElementById('er2-opp-other-row').style.display = type === 'Something else' ? 'block' : 'none';
    var show = type === 'Revenue opportunity' || type === 'Cost savings opportunity';
    document.getElementById('er2-estimate-row').style.display = show ? 'block' : 'none';
    if (show) document.getElementById('er2-estimate-label').textContent = type === 'Revenue opportunity' ? 'Estimated Revenue' : 'Estimated Savings';
  };
  window.filterEditReqTeamList = function(query) {
    var q = query.trim().toLowerCase();
    document.querySelectorAll('#er2-team-list .er2-team-row').forEach(function(row) {
      row.style.display = row.getAttribute('data-name').indexOf(q) >= 0 ? 'flex' : 'none';
    });
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
      oppType: document.getElementById('er2-opp-type').value,
      oppOther: document.getElementById('er2-opp-other').value,
      estFreq: document.getElementById('er2-est-freq') ? document.getElementById('er2-est-freq').value : curEstFreq,
      estAmount: document.getElementById('er2-est-amount') ? document.getElementById('er2-est-amount').value : curEstAmount,
      justification: document.getElementById('er2-justification').value,
      team: selectedTeam.slice()
    };
    openTagPicker(selectedTags, function(newTags) {
      captured.tags = newTags;
      openEditRequestModal(id, captured);
    }, false);
  };

  document.getElementById('er2-save').onclick = async function() {
    var title = document.getElementById('er2-title').value.trim();
    var bu = document.getElementById('er2-bu').value;
    var desc = document.getElementById('er2-desc').value.trim();
    var oppType = document.getElementById('er2-opp-type').value;
    var oppOther = document.getElementById('er2-opp-other').value.trim();
    var justification = document.getElementById('er2-justification').value.trim();
    if (!title || !bu || !desc || !oppType) { showToast('Please fill in all required fields', 'error'); return; }

    var showEst = oppType === 'Revenue opportunity' || oppType === 'Cost savings opportunity';
    var estAmountRaw = showEst ? document.getElementById('er2-est-amount').value.trim() : '';

    var btn = document.getElementById('er2-save'); btn.disabled = true;
    var isSelfEdit = D.currentProfile.id === r.submitterId;
    var editorName = isSelfEdit ? r.editedByName : D.currentProfile.display_name;
    var editedAt = isSelfEdit ? r.editedAt : new Date().toISOString();
    var updates = {
      title: title, business_unit: bu, sponsor: document.getElementById('er2-sponsor').value.trim() || null, description: desc, opportunity_type: oppType,
      opportunity_type_other: oppType === 'Something else' ? oppOther : null,
      estimated_frequency: showEst ? document.getElementById('er2-est-freq').value : null,
      estimated_type: oppType === 'Revenue opportunity' ? 'Revenue' : oppType === 'Cost savings opportunity' ? 'Savings' : null,
      estimated_amount: (showEst && estAmountRaw) ? Number(estAmountRaw) : null,
      value_justification: justification || null, edited_by_name: editorName, edited_at: editedAt
    };
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

    r.title = title; r.businessUnit = bu; r.sponsor = updates.sponsor; r.description = desc; r.opportunityType = oppType;
    r.opportunityTypeOther = updates.opportunity_type_other; r.estimatedFrequency = updates.estimated_frequency;
    r.estimatedType = updates.estimated_type; r.estimatedAmount = updates.estimated_amount;
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
  var curJustification = 'justification' in v ? v.justification : (r.valueJustification || '');
  var buOpts = BUSINESS_UNITS.map(function(bu){ return '<option' + (curBu===bu?' selected':'') + '>' + bu + '</option>'; }).join('');
  var oppOpts = ['Revenue opportunity','Cost savings opportunity','Something else'].map(function(o){ return '<option' + (curOppType===o?' selected':'') + '>' + o + '</option>'; }).join('');
  var showOther = curOppType === 'Something else';
  var showEstimate = curOppType === 'Revenue opportunity' || curOppType === 'Cost savings opportunity';
  var estimateLabel = curOppType === 'Revenue opportunity' ? 'Estimated Revenue' : 'Estimated Savings';
  var selectedTags = ('tags' in v ? v.tags : r.tags) || [];
  var selectedTeam = (('team' in v ? v.team : r.team) || []).slice();

  function teamOptionsHtml() {
    var options = individualResourceNames().concat(teamNames());
    return options.map(function(n) {
      var isTeam = teamNames().indexOf(n) >= 0;
      var chk = selectedTeam.indexOf(n) >= 0 ? ' checked' : '';
      return '<label class="member-check erq-team-row" data-name="' + n.toLowerCase() + '"><input type="checkbox" data-name="' + n.replace(/"/g,'&quot;') + '" onchange="toggleResubmitTeamMember(this)"' + chk + '> ' + n + (isTeam ? ' <i class="ti ti-users" style="color:#185FA5;font-size:11px"></i>' : '') + '</label>';
    }).join('');
  }

  showModal('<div class="modal-title">Edit &amp; resubmit request <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    (r.feedback ? '<div class="form-group"><div class="form-label">Why it was rejected</div><div style="background:#FBE7E3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6;border-left:3px solid #993C1D">' + r.feedback + '</div></div>' : '') +
    '<div class="form-group"><div class="form-label">Project title *</div><input type="text" id="erq-title" value="' + curTitle.replace(/"/g,'&quot;') + '"></div>' +
    '<div class="form-group"><div class="form-label">Business Unit *</div><select id="erq-bu">' + buOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Sponsor</div><input type="text" id="erq-sponsor" value="' + curSponsor.replace(/"/g,'&quot;') + '" placeholder="Optional"></div>' +
    '<div class="form-group"><div class="form-label">Description *</div><textarea id="erq-desc" rows="4">' + curDesc.replace(/</g,'&lt;') + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">This request is a… *</div><select id="erq-opp-type" onchange="onResubmitOppTypeChange()"><option value="">— Select —</option>' + oppOpts + '</select></div>' +
    '<div class="form-group" id="erq-opp-other-row" style="display:' + (showOther?'block':'none') + '"><div class="form-label">Please describe</div><input type="text" id="erq-opp-other" value="' + curOppOther.replace(/"/g,'&quot;') + '"></div>' +
    '<div class="form-group" id="erq-estimate-row" style="display:' + (showEstimate?'block':'none') + '">' +
      '<div class="form-label" id="erq-estimate-label">' + estimateLabel + '</div>' +
      '<div class="grid-2"><select id="erq-est-freq"><option' + (curEstFreq==='Monthly'?' selected':'') + '>Monthly</option><option' + (curEstFreq==='Annually'?' selected':'') + '>Annually</option></select>' +
      '<input type="text" id="erq-est-amount" value="' + (curEstAmount!=null?curEstAmount:'') + '" placeholder="$ amount (optional)"></div>' +
      '<div id="erq-est-err" style="color:#A32D2D;font-size:12px;margin-top:4px;display:none">Please enter a valid number (digits only)</div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Value justification</div><textarea id="erq-justification" rows="3">' + curJustification.replace(/</g,'&lt;') + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">Tags</div><div id="erq-tags-chips" style="margin-bottom:8px">' + (selectedTags.length ? selectedTags.map(function(t){ return tagBadge(t); }).join(' ') : '<span class="text-muted" style="font-size:13px">No tags selected</span>') + '</div><button class="btn btn-sm" onclick="openResubmitTagPicker()"><i class="ti ti-tag"></i> Select tags</button></div>' +
    '<div class="form-group"><div class="form-label">Team</div><input type="text" id="erq-team-search" placeholder="Search people or teams…" oninput="filterResubmitTeamList(this.value)">' +
      '<div id="erq-team-list" style="max-height:200px;overflow-y:auto;margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px">' + teamOptionsHtml() + '</div></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="erq-save"><i class="ti ti-send"></i> Resubmit request</button></div>');

  window.onResubmitOppTypeChange = function() {
    var type = document.getElementById('erq-opp-type').value;
    document.getElementById('erq-opp-other-row').style.display = type === 'Something else' ? 'block' : 'none';
    var show = type === 'Revenue opportunity' || type === 'Cost savings opportunity';
    document.getElementById('erq-estimate-row').style.display = show ? 'block' : 'none';
    if (show) document.getElementById('erq-estimate-label').textContent = type === 'Revenue opportunity' ? 'Estimated Revenue' : 'Estimated Savings';
  };
  document.getElementById('erq-est-amount').addEventListener('input', function() {
    this.value = this.value.replace(/[^0-9]/g,'');
    document.getElementById('erq-est-err').style.display = 'none';
  });
  window.filterResubmitTeamList = function(query) {
    var q = query.trim().toLowerCase();
    document.querySelectorAll('#erq-team-list .erq-team-row').forEach(function(row) {
      row.style.display = row.getAttribute('data-name').indexOf(q) >= 0 ? 'flex' : 'none';
    });
  };
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
      oppType: document.getElementById('erq-opp-type').value,
      oppOther: document.getElementById('erq-opp-other').value,
      estFreq: document.getElementById('erq-est-freq') ? document.getElementById('erq-est-freq').value : curEstFreq,
      estAmount: document.getElementById('erq-est-amount') ? document.getElementById('erq-est-amount').value : curEstAmount,
      justification: document.getElementById('erq-justification').value,
      team: selectedTeam.slice()
    };
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
  var oppType = document.getElementById('erq-opp-type').value;
  var oppOther = document.getElementById('erq-opp-other').value.trim();
  var justification = document.getElementById('erq-justification').value.trim();
  if (!title || !bu || !desc || !oppType) { showToast('Please fill in all required fields', 'error'); return; }
  if (oppType === 'Something else' && !oppOther) { showToast('Please describe the opportunity', 'error'); return; }

  var showEstimate = oppType === 'Revenue opportunity' || oppType === 'Cost savings opportunity';
  var estAmountRaw = showEstimate ? document.getElementById('erq-est-amount').value.trim() : '';
  if (estAmountRaw && isNaN(Number(estAmountRaw))) { document.getElementById('erq-est-err').style.display = 'block'; return; }

  var btn = document.getElementById('erq-save'); btn.disabled = true;
  var updates = {
    title: title, business_unit: bu, sponsor: document.getElementById('erq-sponsor').value.trim() || null, description: desc, opportunity_type: oppType,
    opportunity_type_other: oppType === 'Something else' ? oppOther : null,
    estimated_frequency: showEstimate ? document.getElementById('erq-est-freq').value : null,
    estimated_type: oppType === 'Revenue opportunity' ? 'Revenue' : oppType === 'Cost savings opportunity' ? 'Savings' : null,
    estimated_amount: (showEstimate && estAmountRaw) ? Number(estAmountRaw) : null,
    value_justification: justification || null,
    status: 'Pending', feedback: null, priority: null, value_area: null, start_date: null, target_end_date: null,
    edited_by_name: null, edited_at: null
  };
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

  r.title = title; r.businessUnit = bu; r.sponsor = updates.sponsor; r.description = desc; r.opportunityType = oppType;
  r.opportunityTypeOther = updates.opportunity_type_other; r.estimatedFrequency = updates.estimated_frequency;
  r.estimatedType = updates.estimated_type; r.estimatedAmount = updates.estimated_amount;
  r.valueJustification = justification; r.tags = selectedTags; r.team = selectedTeam;
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
  var msg = 'Delete this request? This cannot be undone.' +
    (linkedP ? ' Its linked project ("' + linkedP.name + '") will NOT be deleted — it will just no longer be connected to this request.' : '');
  if (!confirm(msg)) return;
  var result = await sb.from('requests').delete().eq('id', id);
  if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
  D.requests = D.requests.filter(function(x){ return x.id !== id; });
  if (linkedP) linkedP.requestId = null;
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
      business_unit: businessUnit, blockers: '', health: 'green', stage: newStage,
      planned_start: startDate, start_date: startDate, end_date: endDate,
      target_quarter: targetQuarter, target_year: targetYear, target_end_quarter: targetEndQuarter, target_end_year: targetEndYear,
      estimated_amount: r.estimatedAmount, estimated_frequency: r.estimatedFrequency, estimated_type: r.estimatedType,
      request_id: r.id
    };
    var projResult = await sb.from('projects').insert(projectRecord).select().single();
    if (projResult.error) { showToast('Could not create project: ' + projResult.error.message); return; }
    await logProjectChanges(projResult.data.id, null, {
      name: r.title, stage: newStage, status: projectRecord.status, priority: priority, value: valueArea,
      businessUnit: businessUnit, sponsor: r.sponsor, start: startDate, end: endDate, description: r.description
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
      value: valueArea, priority: priority, description: r.description, blockers:'', health:'green',
      stage: newStage, requestId:r.id, tags: r.tags ? r.tags.slice() : [], dependencies:[],
      estimatedAmount: r.estimatedAmount, estimatedFrequency: r.estimatedFrequency, estimatedType: r.estimatedType,
      targetQuarter: targetQuarter, targetYear: targetYear, targetEndQuarter: targetEndQuarter, targetEndYear: targetEndYear,
      holdReason:null, preHoldStage:null, heldAt:null, completedAt:null,
      deliveryMethodology: null, projectNumber: projResult.data.project_number, createdAt: projResult.data.created_at,
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
      '<td>' + (p.end || '<span class="text-muted">TBD</span>') + '</td>' +
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
  var addBtn = D.role === 'admin' ? '<button class="btn btn-primary" onclick="openNewProjectModal()"><i class="ti ti-plus"></i> New project</button>' : '';
  tb('Active', addBtn);
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
      '<td>' + (p.end || '<span class="text-muted">TBD</span>') + '</td>' +
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

function renderMetadataStatic(p, editable) {
  var linkedReq = p.requestId ? D.requests.find(function(r){ return r.id === p.requestId; }) : null;
  return '<div class="card">' +
    (editable ? '<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn btn-sm" onclick="editProject(\'' + p.id + '\')"><i class="ti ti-edit"></i> Edit</button></div>' : '') +
    '<div class="grid-2 mb-16">' +
      '<div><div class="form-label">Project ID</div><span class="text-muted">#' + (p.projectNumber || '—') + '</span></div>' +
      '<div><div class="form-label">Value area</div>' + badgeIf('badge-purple', p.value) + '</div>' +
      '<div><div class="form-label">Category</div>' + (p.categories && p.categories.length ? p.categories.map(function(c){ return '<span class="badge badge-blue">' + c + '</span>'; }).join(' ') : '<span class="text-muted">—</span>') + '</div>' +
      '<div><div class="form-label">Business unit</div>' + (p.businessUnit || '—') + '</div>' +
      '<div><div class="form-label">Delivery methodology</div>' + (p.deliveryMethodology ? '<span class="badge badge-gray">' + p.deliveryMethodology + '</span>' : '<span class="text-muted">Not selected</span>') + '</div>' +
      '<div><div class="form-label">Linked request</div>' + (linkedReq ? '<button class="btn btn-sm" onclick="reviewRequest(\'' + linkedReq.id + '\')"><i class="ti ti-eye"></i> ' + linkedReq.title + '</button>' : '<span class="text-muted">—</span>') + '</div>' +
    '</div>' +
    '<div class="divider"></div>' +
    '<div class="grid-2">' +
      '<div><div class="form-label">Created</div>' + fmtDate(p.createdAt) + '</div>' +
      '<div id="pmeta-last-edited"><div class="form-label">Last edited</div><span class="text-muted">Loading…</span></div>' +
    '</div>' +
  '</div>';
}

async function loadAndRenderMetadata(pid) {
  var result = await sb.from('project_change_log').select('*').eq('project_id', pid);
  var el = document.getElementById('pmeta-last-edited');
  if (!el) return; // user navigated away from this tab before the fetch finished
  if (result.error || !result.data || !result.data.length) {
    el.innerHTML = '<div class="form-label">Last edited</div><span class="text-muted">No changes recorded yet</span>';
    return;
  }
  var latest = result.data.slice().sort(function(a,b){ return (b.changed_at||'').localeCompare(a.changed_at||''); })[0];
  el.innerHTML = '<div class="form-label">Last edited</div>' + fmtDate(latest.changed_at) + ' <span class="text-muted">by ' + latest.changed_by_name + '</span>';
}

async function loadAndRenderChangeLog(pid) {
  var result = await sb.from('project_change_log').select('*').eq('project_id', pid);
  var container = document.getElementById('ptab-content');
  if (!container) return; // user navigated away from this tab before the fetch finished
  if (result.error) { container.innerHTML = '<div class="empty-state" style="padding:40px"><p>Could not load change history: ' + result.error.message + '</p></div>'; return; }

  var entries = (result.data || []).slice().sort(function(a,b){ return (b.changed_at||'').localeCompare(a.changed_at||''); });
  if (!entries.length) { container.innerHTML = '<div class="empty-state" style="padding:40px"><i class="ti ti-history"></i><p>No changes recorded yet</p></div>'; return; }

  container.innerHTML = '<div class="card"><div class="section-title">Change history</div>' +
    entries.map(function(e) {
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
    }).join('') +
  '</div>';
}

function pgProjectDetail(pid, tab) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  if (!p) { nav('projects'); return; }
  tab = tab || 'overview';
  currentPage = 'projectDetail';
  renderNav();
  var editable = canEdit(p);
  var isComplete = p.stage === 'complete';
  var tbs = ['overview','team','milestones','tasks','raid','documentation','metadata','changelog'];

  function sortedMilestones() {
    return p.milestones.slice().sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  function timelineHtml() {
    var sorted = sortedMilestones();
    if (!sorted.length) return '<div class="text-muted" style="font-size:12px">No milestones tracked yet</div>';
    return '<div class="mini-timeline">' + sorted.map(function(m) {
      return '<div class="mt-item"><div class="mt-dot' + (m.done ? ' mt-done' : '') + '"></div>' +
        '<div class="mt-body"><div class="mt-name">' + m.name + '</div>' +
        '<div class="mt-date">' + (m.done ? 'Completed ' + (m.completedDate || m.date) : 'Planned ' + m.date) + '</div></div></div>';
    }).join('') + '</div>';
  }

  function tabC(t) {
    if (t === 'overview') {
      return '<div class="grid-2 mb-16">' +
        '<div><div class="form-label">Stage</div>' + stagePill(p.stage) + '</div>' +
        '<div><div class="form-label">Status</div>' + bdg(p.status) + '</div>' +
        '<div><div class="form-label">Phase</div>' + badgeIf('badge-gray', p.phase) + '</div>' +
        '<div><div class="form-label">Priority</div>' + bdg(p.priority) + '</div>' +
        '<div><div class="form-label">Progress</div><div style="display:flex;align-items:center;gap:8px"><div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:' + p.progress + '%"></div></div><span class="text-muted">' + p.progress + '%</span></div></div>' +
        '<div><div class="form-label">Start</div>' + (p.start||'—') + '</div>' +
        '<div><div class="form-label">Target end</div>' + (p.end||'—') + '</div>' +
        '</div>' +
        '<div class="form-group"><div class="form-label">Description</div><div style="font-size:13px;line-height:1.6">' + (p.description||'') + '</div></div>' +
        '<div class="grid-2 mb-16">' +
        '<div class="form-group"><div class="form-label">Sponsor</div>' + (p.sponsor||'—') + '</div>' +
        '<div class="form-group"><div class="form-label">Owner</div>' + (p.owner||'—') + '</div>' +
        '</div>' +
        '<div class="form-group mb-16"><div class="form-label">Tags</div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
          (p.tags && p.tags.length ? p.tags.map(function(t){ return tagBadge(t); }).join('') : '<span class="text-muted" style="font-size:13px">No tags yet</span>') +
          (editable ? '<button class="btn btn-sm" onclick="openProjectTagPicker(\'' + p.id + '\')"><i class="ti ti-tag"></i> Edit tags</button>' : '') +
        '</div></div>' +
        '<div class="form-group mb-16"><div class="form-label">Depends on</div><div style="display:flex;flex-direction:column;gap:6px">' +
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
        (p.blockers ? '<div class="blocker-note"><i class="ti ti-alert-triangle"></i> <strong>Blocker:</strong> ' + p.blockers + '</div>' : '') +
        (p.stage === 'hold' ? '<div class="blocker-note" style="background:#FBE7E3;border-left-color:#993C1D"><i class="ti ti-player-pause"></i> <strong>On hold:</strong> ' + (p.holdReason||'') + '</div>' : '') +
        '<div class="form-group" style="margin-top:16px"><div class="form-label">Timeline</div>' + timelineHtml() +
        '<button class="btn btn-sm mt-12" onclick="window.switchPTab(\'milestones\')"><i class="ti ti-list"></i> View milestones</button></div>' +
        (editable ? '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e8e8e5;display:flex;justify-content:flex-end;gap:8px">' +
          '<button class="btn btn-primary" onclick="closeModal();editProject(\'' + p.id + '\')"><i class="ti ti-edit"></i> Edit project</button>' +
          (!isComplete ? (p.stage === 'hold'
            ? '<button class="btn btn-success" onclick="resumeFromHold(\'' + p.id + '\')"><i class="ti ti-player-play"></i> Resume</button>'
            : ((p.stage === 'active' || p.stage === 'planned' || p.stage === 'backlog') ? '<button class="btn" onclick="putOnHold(\'' + p.id + '\')"><i class="ti ti-player-pause"></i> Put on hold</button>' : '') +
              '<button class="btn btn-success" onclick="markComplete(\'' + p.id + '\')"><i class="ti ti-circle-check"></i> Mark complete</button>'
          ) : '') +
          '</div>' : '');
    }
    if (t === 'team') {
      var candidatePeople = individualResourceNames().filter(function(n){ return p.team.indexOf(n) < 0; });
      var projectTags = p.tags || [];
      function sharesTag(name) {
        if (!projectTags.length) return false;
        var res2 = D.resources.find(function(r){ return r.name === name; });
        return !!(res2 && res2.tags && res2.tags.some(function(t){ return projectTags.indexOf(t) >= 0; }));
      }
      candidatePeople = candidatePeople.slice().sort(function(a, b) {
        var aRec = sharesTag(a) ? 0 : 1;
        var bRec = sharesTag(b) ? 0 : 1;
        if (aRec !== bRec) return aRec - bRec;
        return a.localeCompare(b);
      });
      var teamRows = p.team.length
        ? p.team.map(function(m,i){
            var isTeam = teamNames().indexOf(m) >= 0;
            var ini = m.split(' ').map(function(x){ return x[0]; }).join('');
            return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0ede8">' +
              '<div style="display:flex;align-items:center;gap:10px">' + (isTeam ? '<i class="ti ti-users" style="color:#185FA5"></i>' : '<div class="avatar ' + AV_COLS[i%AV_COLS.length] + '">' + ini + '</div>') + '<span style="font-size:13px">' + m + '</span></div>' +
              (editable ? '<button class="btn btn-sm btn-danger" onclick="removeTeamMemberDirect(\'' + p.id + '\',\'' + m.replace(/'/g,"\\'") + '\')"><i class="ti ti-x"></i></button>' : '') +
              '</div>';
          }).join('')
        : '<div class="text-muted">No team members yet</div>';
      return '<div class="card"><div class="section-title">Team members</div>' + teamRows + '</div>' +
        (editable ? '<div class="card mt-16"><div class="section-title">Add a team member</div>' +
          '<input type="text" id="team-add-search" placeholder="Search people…" oninput="filterTeamAddList(this.value)">' +
          '<div id="team-add-list" style="max-height:220px;overflow-y:auto;margin-top:8px">' +
          candidatePeople.map(function(n){
            var rec = sharesTag(n);
            return '<div class="team-add-row" data-name="' + n.toLowerCase() + '" style="display:flex;align-items:center;justify-content:space-between;padding:6px 0"><span style="font-size:13px">' + n + (rec ? ' <span class="badge badge-teal" style="font-size:10px">Recommended</span>' : '') + '</span><button class="btn btn-sm" onclick="addTeamMemberDirect(\'' + p.id + '\',\'' + n.replace(/'/g,"\\'") + '\')"><i class="ti ti-plus"></i> Add</button></div>';
          }).join('') +
          (candidatePeople.length ? '' : '<span class="text-muted" style="font-size:13px">Everyone is already on the team</span>') +
          '</div></div>' : '');
    }
    if (t === 'milestones') {
      var sorted = sortedMilestones();
      var rows = sorted.map(function(m) {
        var idx = p.milestones.indexOf(m);
        var logKey = p.id + '|' + m.id;
        var logOpenNow = !!milestoneLogOpen[logKey];
        var dateLine = m.done ? ('Completed ' + (m.completedDate || m.date) + (m.completedDate && m.completedDate !== m.date ? ' (target ' + m.date + ')' : '')) : ('Target ' + m.date);
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

      function arrow(col) {
        if (st.sort !== col) return '';
        return '<span class="sort-arrow">' + (st.dir === 'asc' ? '▲' : '▼') + '</span>';
      }

      var assigneeChoices = [];
      p.tasks.forEach(function(tk){ if (assigneeChoices.indexOf(tk.assignee) < 0) assigneeChoices.push(tk.assignee); });
      var statusChoices = ['To Do','In Progress','Done'];

      function filterIcon(col, active) {
        return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleTaskFilterPanel(\'' + p.id + '\',\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>';
      }

      var searchBar = '<div class="task-filter-bar">' +
        '<input type="text" id="task-search" placeholder="Search tasks…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onTaskSearch(\'' + p.id + '\',this.value)">' +
        '</div>';

      var list = p.tasks.slice();
      if (st.search) { var q = st.search.toLowerCase(); list = list.filter(function(tk){ return tk.title.toLowerCase().indexOf(q) >= 0; }); }
      if (st.fAssignee.length) list = list.filter(function(tk){ return st.fAssignee.indexOf(tk.assignee) >= 0; });
      if (st.fStatus.length) list = list.filter(function(tk){ return st.fStatus.indexOf(tk.status) >= 0; });
      if (st.sort) {
        list.sort(function(a,b){
          var av = (a[st.sort]||'').toString(), bv = (b[st.sort]||'').toString();
          if (av < bv) return st.dir === 'asc' ? -1 : 1;
          if (av > bv) return st.dir === 'asc' ? 1 : -1;
          return 0;
        });
      }

      var trows = list.map(function(task) {
        var idx = p.tasks.indexOf(task);
        var myTask = !!(task.assigneeId && D.myResourceId && task.assigneeId === D.myResourceId);
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
            var mine = c.author === actorName();
            return '<div class="comment-item">' +
              '<div class="comment-meta"><strong>' + c.author + '</strong> <span class="text-muted">' + c.date + '</span></div>' +
              '<div class="comment-text">' + c.text + '</div>' +
              ((editable || mine) ? '<div class="comment-actions"><button class="btn btn-sm" onclick="openEditComment(\'' + p.id + '\',\'' + task.id + '\',\'' + c.id + '\')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteComment(\'' + p.id + '\',\'' + task.id + '\',\'' + c.id + '\')"><i class="ti ti-trash"></i></button></div>' : '') +
              '</div>';
          }).join('') : '<div class="text-muted" style="font-size:12px;margin-bottom:8px">No comments yet</div>';
          commentsRow = '<tr><td colspan="5" style="padding:0"><div class="raid-log" style="margin:0 0 10px">' +
            commentEntries +
            '<div class="comment-add-row"><textarea id="cmt-input-' + task.id + '" placeholder="Add a comment…" rows="2"></textarea><button class="btn btn-sm btn-primary" onclick="addComment(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ti-send"></i> Post</button></div>' +
            '</div></td></tr>';
        }
        return '<tr><td style="white-space:normal;word-break:break-word">' + task.title + '</td><td>' + task.assignee + '</td><td>' + bdg(task.status) + '</td><td class="text-muted">' + task.due + '</td>' +
          '<td><div style="display:flex;gap:4px">' +
          '<button class="btn btn-sm" title="Comments" onclick="toggleTaskComments(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (cOpenNow?'ti-chevron-up':'ti-message-circle') + '"></i>' + (comments.length ? ' ' + comments.length : '') + '</button>' +
          '<button class="btn btn-sm" title="Change log" onclick="toggleTaskLog(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (logOpenNow?'ti-chevron-up':'ti-history') + '"></i></button>' +
          (editable ? '<button class="btn btn-sm" onclick="openEditTask(\'' + p.id + '\',' + idx + ')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteTask(\'' + p.id + '\',' + idx + ')"><i class="ti ti-trash"></i></button>' : '') +
          (myTask && task.status !== 'Done' ? '<button class="btn btn-sm btn-success" onclick="openCompleteTaskPrompt(\'' + p.id + '\',' + idx + ')"><i class="ti ti-check"></i> Done</button>' : '') +
          '</div></td></tr>' + logRow + commentsRow;
      }).join('');

      var header = '<tr><th>Task</th>' +
        '<th class="sortable-th"><span onclick="setTaskSort(\'' + p.id + '\',\'assignee\')">Assignee ' + arrow('assignee') + '</span>' + filterIcon('assignee', st.fAssignee.length>0) + '</th>' +
        '<th class="sortable-th"><span onclick="setTaskSort(\'' + p.id + '\',\'status\')">Status ' + arrow('status') + '</span>' + filterIcon('status', st.fStatus.length>0) + '</th>' +
        '<th class="sortable-th" onclick="setTaskSort(\'' + p.id + '\',\'due\')">Due ' + arrow('due') + '</th><th></th></tr>';

      return (editable ? '<button class="btn btn-primary btn-sm mb-12" onclick="openAddTask(\'' + p.id + '\')"><i class="ti ti-plus"></i> Add task</button>' : '') +
        searchBar +
        (p.tasks.length
          ? (list.length ? '<table><thead>' + header + '</thead><tbody>' + trows + '</tbody></table>' : '<div class="empty-state" style="padding:30px"><i class="ti ti-search"></i><p>No tasks match your filters</p></div>')
          : '<div class="empty-state" style="padding:30px"><i class="ti ti-check"></i><p>No tasks yet</p></div>');
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
    if (t === 'metadata') {
      loadAndRenderMetadata(p.id);
      return renderMetadataStatic(p, editable);
    }
    if (t === 'changelog') {
      loadAndRenderChangeLog(p.id);
      return '<div class="empty-state" style="padding:40px"><i class="ti ti-loader-2"></i><p>Loading change history…</p></div>';
    }
    return '';
  }

  var tabsHtml = tbs.map(function(t) {
    return '<div class="tab' + (t === tab ? ' active' : '') + '" id="ptab-' + t + '" onclick="switchPTab(\'' + t + '\')" style="text-transform:capitalize">' + (t === 'raid' ? 'RAID log' : t === 'documentation' ? 'Documentation' : t === 'changelog' ? 'Change Log' : t) + '</div>';
  }).join('');

  tb(p.name);

  document.getElementById('content').innerHTML =
    '<div class="card">' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">' + stagePill(p.stage) + ' ' + bdg(p.status) + ' ' + bdg(p.priority) + '</div>' +
    '<div class="tab-bar">' + tabsHtml + '</div>' +
    '<div id="ptab-content">' + tabC(tab) + '</div>' +
    '</div>';

  window.openProjectTagPicker = function(pid2) {
    var pr = D.projects.find(function(x){ return x.id === pid2; });
    openTagPicker(pr.tags || [], async function(newTags) {
      var oldTags = pr.tags || [];
      var toAdd = newTags.filter(function(n){ return oldTags.indexOf(n) < 0; });
      var toRemove = oldTags.filter(function(n){ return newTags.indexOf(n) < 0; });
      for (var i = 0; i < toAdd.length; i++) {
        var tag = D.tags.find(function(t){ return t.name === toAdd[i]; });
        if (tag) await sb.from('project_tags').insert({ project_id: pid2, tag_id: tag.id });
      }
      for (var j = 0; j < toRemove.length; j++) {
        var tagR = D.tags.find(function(t){ return t.name === toRemove[j]; });
        if (tagR) await sb.from('project_tags').delete().eq('project_id', pid2).eq('tag_id', tagR.id);
      }
      pr.tags = newTags;
      showToast('Tags updated');
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
    document.getElementById('ptab-content').innerHTML = tabC('team');
    showToast(personName + ' removed from the team');
  };
  window.switchPTab = function(t) {
    tbs.forEach(function(x){ var e = document.getElementById('ptab-' + x); if (e) e.className = 'tab' + (x===t?' active':''); });
    document.getElementById('ptab-content').innerHTML = tabC(t);
    var h = '#/project/' + pid + '/' + t;
    if (location.hash !== h) location.hash = h;
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
    var pr=D.projects.find(function(x){return x.id===pid2;});
    var tk = pr.tasks[idx];
    var result = await sb.from('tasks').delete().eq('id', tk.id);
    if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
    pr.tasks.splice(idx,1);
    document.getElementById('ptab-content').innerHTML=tabC('tasks');
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
  window.openEditTask     = function(pid2,idx){ openTaskModal(pid2, idx); };
  window.openAddRaid      = function(pid2,type){ openRaidModal(pid2, type, null); };
  window.openEditRaid     = function(pid2,type,idx){ openRaidModal(pid2, type, idx); };
  window.setTaskSort = function(pid2, col) {
    var s = getTaskState(pid2);
    if (s.sort === col) s.dir = s.dir === 'asc' ? 'desc' : 'asc'; else { s.sort = col; s.dir = 'asc'; }
    refreshTaskView();
  };
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
      pr.tasks.forEach(function(tk){ if (choices.indexOf(tk.assignee) < 0) choices.push(tk.assignee); });
    } else {
      choices = ['To Do','In Progress','Done'];
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

function openTaskModal(pid, idx) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var task = idx != null ? p.tasks[idx] : null;
  // only project members + all people for admin/pm
  var pool = canEdit(p) ? individualResourceNames().concat(teamNames()) : p.team;
  if (task && task.assignee && pool.indexOf(task.assignee) < 0) pool = pool.concat([task.assignee]);
  var assigneeOpts = pool.map(function(n){
    var isInactiveCurrent = task && task.assignee === n && individualResourceNames().indexOf(n) < 0 && teamNames().indexOf(n) < 0;
    return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (task && task.assignee===n ? ' selected' : '') + '>' + n + (isInactiveCurrent ? ' (no longer a resource)' : '') + '</option>';
  }).join('');
  showModal('<div class="modal-title">' + (task?'Edit task':'Add task') + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Task title *</div><input type="text" id="tm-title" value="' + (task?task.title:'') + '" placeholder="Task name"></div>' +
    '<div class="form-group"><div class="form-label">Assignee</div><select id="tm-assignee">' + assigneeOpts + '</select></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Status</div><select id="tm-status">' +
      '<option' + (!task||task.status==='To Do'?' selected':'') + '>To Do</option>' +
      '<option' + (task&&task.status==='In Progress'?' selected':'') + '>In Progress</option>' +
      '<option' + (task&&task.status==='Done'?' selected':'') + '>Done</option></select></div>' +
    '<div class="form-group"><div class="form-label">Due date</div><input type="date" id="tm-due" value="' + (task?task.due:'') + '"></div></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="tm-save"><i class="ti ti-check"></i> ' + (task?'Save changes':'Add task') + '</button></div>');
  document.getElementById('tm-save').onclick = async function() {
    var title = document.getElementById('tm-title').value.trim();
    if (!title){ showToast('Task title required'); return; }
    var btn = document.getElementById('tm-save'); btn.disabled = true;
    var newVals = {title:title,assignee:document.getElementById('tm-assignee').value,status:document.getElementById('tm-status').value,due:document.getElementById('tm-due').value};
    var assigneeResource = resolveResource(newVals.assignee);

    if (idx!=null) {
      var fieldLabels = {title:'Title',assignee:'Assignee',status:'Status',due:'Due date'};
      var changes = [];
      ['title','assignee','status','due'].forEach(function(f){
        if (task[f] !== newVals[f]) changes.push(fieldLabels[f] + ': "' + (task[f]||'—') + '" → "' + (newVals[f]||'—') + '"');
      });
      var result = await sb.from('tasks').update({
        title: newVals.title, assignee_id: assigneeResource ? assigneeResource.id : null,
        assignee_name: newVals.assignee, status: newVals.status, due_date: newVals.due || null
      }).eq('id', task.id);
      if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }
      task.title = newVals.title; task.assignee = newVals.assignee; task.assigneeId = assigneeResource ? assigneeResource.id : null;
      task.status = newVals.status; task.due = newVals.due;
      task.log = task.log || [];
      if (changes.length) task.log.push(await writeLog('task_log', 'task_id', task.id, 'Updated', changes.join('; ')));
      await ensureOnTeam(p, assigneeResource);
    } else {
      var insertResult = await sb.from('tasks').insert({
        project_id: pid, title: newVals.title, assignee_id: assigneeResource ? assigneeResource.id : null,
        assignee_name: newVals.assignee, status: newVals.status, due_date: newVals.due || null
      }).select().single();
      if (insertResult.error) { showToast('Could not save: ' + insertResult.error.message); btn.disabled = false; return; }
      var t2 = {id:insertResult.data.id,title:newVals.title,assignee:newVals.assignee,assigneeId:assigneeResource?assigneeResource.id:null,status:newVals.status,due:newVals.due,log:[],comments:[]};
      t2.log.push(await writeLog('task_log', 'task_id', t2.id, 'Created', ''));
      p.tasks.push(t2);
      await ensureOnTeam(p, assigneeResource);
    }
    showToast(idx!=null?'Task updated':'Task added'); closeModal(); if (window.switchPTab) window.switchPTab('tasks');
  };
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
    '<div class="form-group"><div class="form-label">Owner</div><select id="rd-owner" onchange="handleOwnerChange(\'' + pid + '\')">' + ownerOpts + '</select></div>' +
    extra +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="rd-save"><i class="ti ti-check"></i> ' + (isEdit?'Save changes':'Add ' + label) + '</button></div>', true);

  window.handleOwnerChange = async function(pid2) {
    var sel = document.getElementById('rd-owner');
    if (sel.value === '__add__') {
      var pr2 = D.projects.find(function(x){ return x.id === pid2; });
      var nonMembers = individualResourceNames().filter(function(n){ return pr2.team.indexOf(n) < 0; });
      var chosen = prompt('Select person to add to project:\n' + nonMembers.map(function(n,i){ return (i+1)+'. '+n; }).join('\n') + '\n\nEnter number:');
      var num = parseInt(chosen);
      if (num && nonMembers[num-1]) {
        var chosenName = nonMembers[num-1];
        var chosenResource = resolveResource(chosenName);
        if (!chosenResource) { showToast('Could not find that person as a resource'); sel.value = ''; return; }
        var result = await sb.from('resource_projects').insert({ project_id: pid2, resource_id: chosenResource.id });
        if (result.error) { showToast('Could not add member: ' + result.error.message); sel.value = ''; return; }
        pr2.team.push(chosenName);
        pr2.teamIds.push(chosenResource.id);
        addNotif(chosenName, 'You have been added to project "' + pr2.name + '".', 'team');
        showToast(chosenName + ' added to project');
        var newOpts = '<option value="">— Select —</option>' + pr2.team.map(function(n){ return '<option>' + n + '</option>'; }).join('') + '<option value="__add__">+ Add member to project…</option>';
        sel.innerHTML = newOpts;
      } else {
        sel.value = '';
      }
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

// ── Edit / New Project ─────────────────────────────────────────────────────────

function editProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  if (!canEdit(p)) { showToast('You do not have edit access'); return; }
  var statusOpts = (STATUSES.indexOf(p.status) < 0 ? '<option value="" selected>— Not set —</option>' : '') + STATUSES.map(function(s){ return '<option' + (p.status===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var phaseOpts  = (PHASES.indexOf(p.phase) < 0 ? '<option value="" selected>— Not set —</option>' : '') + PHASES.map(function(s){   return '<option' + (p.phase===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var priorOpts  = (PRIORITIES.indexOf(p.priority) < 0 ? '<option value="" selected>— Not set —</option>' : '') + PRIORITIES.map(function(s){ return '<option' + (p.priority===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var valOpts    = (VALUE_AREAS.indexOf(p.value) < 0 ? '<option value="" selected>— Not set —</option>' : '') + VALUE_AREAS.map(function(s){ return '<option' + (p.value===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var ownerPoolEdit = p.owner && individualResourceNames().indexOf(p.owner) < 0 ? individualResourceNames().concat([p.owner]) : individualResourceNames();
  var ownerOpts     = '<option value="">— None —</option>' + ownerPoolEdit.map(function(n){
    var isInactiveCurrent = p.owner===n && individualResourceNames().indexOf(n) < 0;
    return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (p.owner===n?' selected':'') + '>' + n + (isInactiveCurrent ? ' (no longer a resource)' : '') + '</option>';
  }).join('');
  var catCheckboxes = CATEGORIES.map(function(s){
    var checked = (p.categories||[]).indexOf(s) >= 0;
    return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;font-size:13px"><input type="checkbox" class="ep-category-cb" value="' + s + '"' + (checked?' checked':'') + '> ' + s + '</label>';
  }).join('');
  var buOpts     = '<option value="">— None —</option>' + BUSINESS_UNITS.map(function(s){ return '<option' + (p.businessUnit===s?' selected':'') + '>' + s + '</option>'; }).join('');
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
      '<div class="form-group"><div class="form-label">Start date</div><input type="date" id="ep-start" value="' + p.start + '"></div>' +
      '<div class="form-group"><div class="form-label">Target end</div><input type="date" id="ep-end" value="' + p.end + '"></div>' +
      '<div class="form-group"><div class="form-label">Progress (%)</div><input type="number" id="ep-progress" value="' + p.progress + '" min="0" max="100"></div>' +
      '<div class="form-group"><div class="form-label">Health</div><select id="ep-health"><option value="green"' + (p.health==='green'?' selected':'') + '>Green</option><option value="amber"' + (p.health==='amber'?' selected':'') + '>Amber</option><option value="red"' + (p.health==='red'?' selected':'') + '>Red</option></select></div>' +
      '<div class="form-group"><div class="form-label">Business unit</div><select id="ep-bu">' + buOpts + '</select></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Categories</div><div>' + catCheckboxes + '</div></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="ep-desc">' + (p.description||'') + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">Current blocker (leave blank if none)</div><input type="text" id="ep-blocker" value="' + (p.blockers||'') + '"></div>' +
    '<div class="divider"></div>' +
    '<div class="grid-2">' +
    '<div class="form-group"><div class="form-label">Sponsor name</div><input type="text" id="ep-sponsor" value="' + (p.sponsor||'') + '"></div>' +
    '<div class="form-group"><div class="form-label">Sponsor email' + (p.sponsorId ? ' <i class="ti ti-link" title="Linked to a real account" style="color:#1D9E75;font-size:12px"></i>' : '') + '</div><input type="email" id="ep-sponsor-email" value="' + (p.sponsorEmail||'') + '"></div>' +
    '<div class="form-group"><div class="form-label">Owner</div>' + (D.role === 'admin' ? '<select id="ep-owner">' + ownerOpts + '</select>' : '<div style="padding:8px 0;color:#444">' + (p.owner || '—') + '<div class="form-sub" style="margin-top:2px">Only a PMO Admin can reassign the owner</div></div>') + '</div>' +
    '</div>' +
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
    businessUnit: p.businessUnit, sponsor: p.sponsor, owner: p.owner, start: p.start, end: p.end,
    progress: p.progress, health: p.health, description: p.description, blockers: p.blockers,
    deliveryMethodology: p.deliveryMethodology
  };
  var newVals = {
    name: document.getElementById('ep-name').value,
    status: document.getElementById('ep-status').value || null,
    phase: document.getElementById('ep-phase').value || null,
    priority: document.getElementById('ep-priority').value || null,
    value_area: document.getElementById('ep-value').value || null,
    delivery_methodology: document.getElementById('ep-methodology').value || null,
    start_date: document.getElementById('ep-start').value || null,
    end_date: document.getElementById('ep-end').value || null,
    progress: parseInt(document.getElementById('ep-progress').value) || 0,
    health: document.getElementById('ep-health').value,
    description: document.getElementById('ep-desc').value,
    blockers: document.getElementById('ep-blocker').value
  };
  var buEl = document.getElementById('ep-bu'); if (buEl) newVals.business_unit = buEl.value || null;
  var spEl = document.getElementById('ep-sponsor'); if (spEl) newVals.sponsor = spEl.value || null;
  var spEmailEl = document.getElementById('ep-sponsor-email'); if (spEmailEl) newVals.sponsor_email = spEmailEl.value.trim() || null;
  var pmEl = document.getElementById('ep-owner');
  var ownerResource = pmEl ? resolveResource(pmEl.value) : null;
  if (pmEl) { newVals.owner_id = ownerResource ? ownerResource.id : null; newVals.owner_name = pmEl.value || null; }

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

  var saveBtn = document.querySelector('.modal-footer .btn-primary'); if (saveBtn) saveBtn.disabled = true;
  var result = await sb.from('projects').update(newVals).eq('id', pid).select().single();
  if (result.error) { showToast('Could not save: ' + result.error.message); if (saveBtn) saveBtn.disabled = false; return; }
  if (newVals.stage) { p.stage = newVals.stage; if (newVals.planned_start) p.plannedStart = newVals.planned_start; }

  await logProjectChanges(pid, beforeSnapshot, {
    name: newVals.name, status: newVals.status, phase: newVals.phase, priority: newVals.priority, value: newVals.value_area,
    businessUnit: newVals.business_unit, sponsor: newVals.sponsor, owner: newVals.owner_name,
    start: newVals.start_date, end: newVals.end_date, progress: newVals.progress, health: newVals.health,
    description: newVals.description, blockers: newVals.blockers, stage: newVals.stage || beforeSnapshot.stage,
    deliveryMethodology: newVals.delivery_methodology
  }, 'edit');

  var catCbs = document.querySelectorAll('.ep-category-cb');
  if (catCbs.length) {
    var newCats = Array.from(catCbs).filter(function(cb){ return cb.checked; }).map(function(cb){ return cb.value; });
    var oldCats = p.categories || [];
    var catsToAdd = newCats.filter(function(c){ return oldCats.indexOf(c) < 0; });
    var catsToRemove = oldCats.filter(function(c){ return newCats.indexOf(c) < 0; });
    if (catsToAdd.length) await sb.from('project_categories').insert(catsToAdd.map(function(c){ return { project_id: pid, category: c }; }));
    for (var ci = 0; ci < catsToRemove.length; ci++) { await sb.from('project_categories').delete().eq('project_id', pid).eq('category', catsToRemove[ci]); }
    p.categories = newCats;
  }

  p.name = newVals.name; p.status = newVals.status; p.phase = newVals.phase; p.priority = newVals.priority;
  p.value = newVals.value_area; p.start = newVals.start_date; p.end = newVals.end_date; p.progress = newVals.progress;
  p.deliveryMethodology = newVals.delivery_methodology;
  p.health = newVals.health; p.description = newVals.description; p.blockers = newVals.blockers;
  if (buEl) p.businessUnit = newVals.business_unit;
  if (spEl) p.sponsor = newVals.sponsor;
  if (spEmailEl) { p.sponsorEmail = newVals.sponsor_email; p.sponsorId = result.data.sponsor_id; }
  if (pmEl) { p.owner = pmEl.value; p.ownerId = newVals.owner_id; }

  closeModal(); showToast('Project saved');
  if (currentPage === 'projectDetail') pgProjectDetail(pid, 'overview'); else if (currentPage==='projects') pgProjects(); else if (currentPage === 'requests') pgRequests(); else pgDashboard();
}

async function deleteProject(pid) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  var result = await sb.from('projects').delete().eq('id', pid);
  if (result.error) { showToast('Could not delete: ' + result.error.message); return; }
  D.projects = D.projects.filter(function(x){ return x.id !== pid; });
  closeModal(); showToast('Project deleted'); renderNav();
  var returnTo = (projectDetailReferrer && projectDetailReferrer !== 'projectDetail') ? projectDetailReferrer : 'dashboard';
  nav(returnTo);
}

function openNewProjectModal() {
  var valOpts = VALUE_AREAS.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  var priorOpts = PRIORITIES.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  var ownerOpts = '<option value="">— None —</option>' + individualResourceNames().map(function(n){ return '<option>' + n + '</option>'; }).join('');
  var catCheckboxesNew = CATEGORIES.map(function(s){ return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;font-size:13px"><input type="checkbox" class="np-category-cb" value="' + s + '"> ' + s + '</label>'; }).join('');
  var buOpts = '<option value="">— None —</option>' + BUSINESS_UNITS.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  showModal('<div class="modal-title">Create new project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Project name *</div><input type="text" id="np-name" placeholder="Project name"></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Value area</div><select id="np-value">' + valOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Priority</div><select id="np-priority">' + priorOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Business unit</div><select id="np-bu">' + buOpts + '</select></div></div>' +
    '<div class="form-group"><div class="form-label">Delivery methodology</div><select id="np-methodology"><option value="" selected>Not selected</option><option>Agile</option><option>Waterfall</option><option>Hybrid</option></select></div>' +
    '<div class="form-group"><div class="form-label">Categories</div><div>' + catCheckboxesNew + '</div></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="np-desc" placeholder="What is this project about?"></textarea></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Sponsor name</div><input type="text" id="np-sponsor" placeholder="Sponsor name"></div>' +
    '<div class="form-group"><div class="form-label">Sponsor email</div><input type="email" id="np-sponsor-email" placeholder="name@yourcompany.com"></div>' +
    '<div class="form-group"><div class="form-label">Owner</div><select id="np-owner">' + ownerOpts + '</select></div></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="np-save"><i class="ti ti-plus"></i> Create project</button></div>', true);
  document.getElementById('np-save').onclick = async function() {
    var name = document.getElementById('np-name').value.trim();
    if (!name){ showToast('Project name required'); return; }
    var ownerName = document.getElementById('np-owner').value;
    var ownerResource = resolveResource(ownerName);
    var sponsorName = document.getElementById('np-sponsor').value.trim();
    var sponsorEmail = document.getElementById('np-sponsor-email').value.trim();
    var btn = document.getElementById('np-save'); btn.disabled = true;

    var selectedCats = Array.from(document.querySelectorAll('.np-category-cb')).filter(function(cb){ return cb.checked; }).map(function(cb){ return cb.value; });
    var record = {
      name: name, owner_id: ownerResource ? ownerResource.id : null, owner_name: ownerName || null,
      sponsor: sponsorName || null, sponsor_email: sponsorEmail || null,
      business_unit: document.getElementById('np-bu').value || null,
      delivery_methodology: document.getElementById('np-methodology').value || null,
      status: 'Not Started', phase: 'Not Started', progress: 0,
      value_area: document.getElementById('np-value').value, priority: document.getElementById('np-priority').value,
      description: document.getElementById('np-desc').value, blockers: '', health: 'green', stage: 'active'
    };
    var result = await sb.from('projects').insert(record).select().single();
    if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }

    if (selectedCats.length) await sb.from('project_categories').insert(selectedCats.map(function(c){ return { project_id: result.data.id, category: c }; }));
    await logProjectChanges(result.data.id, null, {
      name: name, stage: 'active', status: 'Not Started', priority: record.priority, value: record.value_area,
      businessUnit: record.business_unit, sponsor: sponsorName, owner: ownerName, description: record.description,
      deliveryMethodology: record.delivery_methodology
    }, 'edit');

    D.projects.push({
      id: result.data.id, name:name, owner:ownerName, ownerId: ownerResource?ownerResource.id:null,
      sponsor:sponsorName, sponsorEmail:sponsorEmail, sponsorId: result.data.sponsor_id,
      categories:selectedCats, businessUnit:record.business_unit, team:[], teamIds:[],
      status:'Not Started', phase:'Not Started', progress:0, start:'', end:'',
      value:record.value_area, priority:record.priority, description:record.description,
      blockers:'', health:'green', stage:'active', plannedStart:'', requestId:'',
      deliveryMethodology: record.delivery_methodology, projectNumber: result.data.project_number, createdAt: result.data.created_at,
      milestones:[], tasks:[], raid:{risks:[],assumptions:[],issues:[],dependencies:[]},
      documents:[], docFolders:['General'], docFolderIds:{}
    });
    closeModal(); showToast('Project created'); pgProjects();
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
    return '<span class="text-muted">Start: </span>' + (start||'TBD') + ' &nbsp; <span class="text-muted">End: </span>' + (p.end||'TBD');
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
  allEntries.sort(function(a,b){ return a.startPos - b.startPos; });

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
      barHtml = '<div class="tl-wrap"><div class="tl-bar" style="left:' + leftPct + '%;width:' + widthPct + '%;' + barStyle + '">' + (entry.confirmed ? (p.phase||'') : estimateLabel) + '</div></div>';
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
      msItems.push({ project:p.name, milestone:m.name, due:m.date, status:'Upcoming', categories: p.categories || [], tags: p.tags || [] });
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
  var statusChoices = ['Upcoming'];

  function msFilterIcon(col, active) {
    return '<button class="th-filter-btn" onclick="event.stopPropagation();toggleMsFilterPanel(\'' + col + '\')"><i class="ti ti-filter' + (active ? ' th-filter-active' : '') + '"></i></button>';
  }

  var msSearchBar = '<div class="task-filter-bar"><input type="text" id="ms-search" placeholder="Search milestones…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onMsSearch(this.value)"></div>';

  var msList = msItems.slice();
  if (st.search) { var q = st.search.toLowerCase(); msList = msList.filter(function(it){ return it.milestone.toLowerCase().indexOf(q) >= 0; }); }
  if (st.fProject.length) msList = msList.filter(function(it){ return st.fProject.indexOf(it.project) >= 0; });
  if (st.fStatus.length) msList = msList.filter(function(it){ return st.fStatus.indexOf(it.status) >= 0; });
  if (st.sort) {
    msList.sort(function(a,b){
      var av = (a[st.sort]||'').toString(), bv = (b[st.sort]||'').toString();
      if (av < bv) return st.dir === 'asc' ? -1 : 1;
      if (av > bv) return st.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  var msRows = msList.map(function(it) {
    return '<tr><td class="bold">' + it.project + '</td><td>' + it.milestone + '</td><td class="text-muted">' + it.due + '</td><td><span class="badge badge-amber">' + it.status + '</span></td></tr>';
  }).join('');

  var msHeader = '<tr>' +
    '<th class="sortable-th"><span onclick="setMsSort(\'project\')">Project ' + msArrow('project') + '</span>' + msFilterIcon('fProject', st.fProject.length>0) + '</th>' +
    '<th class="sortable-th" onclick="setMsSort(\'milestone\')">Milestone ' + msArrow('milestone') + '</th>' +
    '<th class="sortable-th" onclick="setMsSort(\'due\')">Due ' + msArrow('due') + '</th>' +
    '<th class="sortable-th"><span onclick="setMsSort(\'status\')">Status ' + msArrow('status') + '</span>' + msFilterIcon('fStatus', st.fStatus.length>0) + '</th>' +
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
    var label = col === 'fProject' ? 'Project' : 'Status';
    var choices = col === 'fProject' ? projectChoices : statusChoices;
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
      health: 'green',
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
  tb('All Projects');
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
      '<td>' + (p.status ? bdg(p.status) : '<span class="text-muted">—</span>') + '</td>' +
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
  window.toggleAllProjSelect = function(id, checked) { st.selected[id] = checked; pgAllProjects(); };
  window.toggleAllProjSelectAll = function(checked) { visibleIds.forEach(function(id){ st.selected[id] = checked; }); pgAllProjects(); };
  window.clearAllProjSelection = function() { st.selected = {}; pgAllProjects(); };

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
      '<option value="value">Value Area</option><option value="priority">Priority</option><option value="status">Status</option><option value="phase">Phase</option>';
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
      html = '<div class="form-group"><div class="form-label">New sponsor name</div><input type="text" id="bulk-value-input" placeholder="Sponsor name"></div>';
    } else if (field === 'owner') {
      var ownerOpts = '<option value="">— None —</option>' + individualResourceNames().map(function(n){ return '<option>' + n + '</option>'; }).join('');
      html = '<div class="form-group"><div class="form-label">New owner</div><select id="bulk-value-input">' + ownerOpts + '</select></div>';
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

    var columnMap = { sponsor:'sponsor', businessUnit:'business_unit', value:'value_area', priority:'priority', status:'status', phase:'phase' };
    var ownerResource = null;
    var updatePayload = {};
    if (field === 'owner') {
      ownerResource = resolveResource(value);
      updatePayload = { owner_id: ownerResource ? ownerResource.id : null, owner_name: value || null };
    } else {
      updatePayload[columnMap[field]] = value || null;
    }

    var failed = 0;
    for (var i = 0; i < selectedIds.length; i++) {
      var result = await sb.from('projects').update(updatePayload).eq('id', selectedIds[i]);
      if (result.error) { failed++; continue; }
      var proj = D.projects.find(function(x){ return x.id === selectedIds[i]; });
      if (!proj) continue;
      if (field === 'owner') { proj.owner = value || ''; proj.ownerId = ownerResource ? ownerResource.id : null; }
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

async function pgAdminUsers() {
  tb('Manage Users', D.role === 'admin' ? '<button class="btn btn-primary" onclick="openAddUserModal()"><i class="ti ti-user-plus"></i> Add user</button>' : '');
  if (D.role !== 'admin') {
    document.getElementById('content').innerHTML =
      '<div class="empty-state" style="padding:60px"><i class="ti ti-lock"></i><p>Only PMO Admins can manage users.</p></div>';
    return;
  }
  document.getElementById('content').innerHTML = '<div class="empty-state" style="padding:40px"><i class="ti ti-loader-2"></i><p>Loading users…</p></div>';
  var result = await sb.from('profiles').select('id, email, first_name, last_name, display_name, role, is_active');
  if (result.error) {
    document.getElementById('content').innerHTML = '<div class="empty-state" style="padding:40px"><p>Could not load users: ' + result.error.message + '</p></div>';
    return;
  }
  D.allUsers = result.data.sort(function(a,b){ return (a.display_name||'').localeCompare(b.display_name||''); });
  renderUsersTable();
}

function renderUsersTable() {
  var rows = D.allUsers.map(function(u) {
    var isMe = D.currentProfile.id === u.id;
    var active = u.is_active !== false;
    return '<tr>' +
      '<td>' + (u.display_name||u.email) + (isMe ? ' <span class="text-muted">(you)</span>' : '') + '</td>' +
      '<td class="text-muted">' + u.email + '</td>' +
      '<td>' + bdg(roleLabel(u.role)) + '</td>' +
      '<td>' + (active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Deactivated</span>') + '</td>' +
      '<td><div style="display:flex;gap:4px">' +
        '<button class="btn btn-sm" title="Edit" onclick="openEditUserModal(\'' + u.id + '\')"><i class="ti ti-edit"></i></button>' +
        '<button class="btn btn-sm" title="Set new password" onclick="openSetPasswordModal(\'' + u.id + '\',\'' + u.email + '\')"><i class="ti ti-key"></i></button>' +
        (!isMe ? (active
          ? '<button class="btn btn-sm btn-danger" title="Deactivate" onclick="toggleUserActive(\'' + u.id + '\',\'deactivate\')"><i class="ti ti-user-off"></i></button>'
          : '<button class="btn btn-sm btn-success" title="Reactivate" onclick="toggleUserActive(\'' + u.id + '\',\'reactivate\')"><i class="ti ti-user-check"></i></button>')
          : '') +
      '</div></td>' +
    '</tr>';
  }).join('');
  document.getElementById('content').innerHTML =
    '<div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

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

function resourceOpenTaskCount(r) {
  var count = 0;
  D.projects.forEach(function(p){ p.tasks.forEach(function(t){ if (t.assigneeId === r.id && t.status !== 'Done') count++; }); });
  return count;
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
  var st = resourcesPageState;
  var individuals = D.resources.filter(function(r){ return r.type === 'individual'; });
  var teams = D.resources.filter(function(r){ return r.type === 'team'; });
  var over = individuals.filter(function(r){ return r.allocated>=100; }).length;
  var warn = individuals.filter(function(r){ return r.allocated>=80 && r.allocated<100; }).length;

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
  list = list.slice().sort(function(a, b) {
    var av, bv;
    if (st.sort === 'projects') { av = resourceCombinedProjectIds(a).allIds.length; bv = resourceCombinedProjectIds(b).allIds.length; }
    else if (st.sort === 'tasks') { av = resourceOpenTaskCount(a) || 0; bv = resourceOpenTaskCount(b) || 0; }
    else if (st.sort === 'capacity') { av = a.allocated||0; bv = b.allocated||0; }
    else if (st.sort === 'members') { av = (a.members||[]).length; bv = (b.members||[]).length; }
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
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0">' +
            '<span>' + p.name + ' ' + stagePill(p.stage) + ' <span class="badge ' + (p.isOwner ? 'badge-purple' : 'badge-gray') + '" style="font-size:10px">' + (p.isOwner ? 'Owner' : 'Contributor') + '</span></span>' +
            '<button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i></button></div>';
        }).join('')
      : '<span class="text-muted">No projects assigned</span>';
    return '<tr><td colspan="' + colspan + '" style="background:#faf9f7;padding:10px 16px">' + body + '</td></tr>';
  }
  window.toggleResourceExpand = function(rid) { resourcesPageState.expandedId = resourcesPageState.expandedId === rid ? null : rid; pgResources(); };

  var tableHtml;
  if (st.tab === 'individual') {
    var rows = list.map(function(r) {
      var pct = r.allocated || 0;
      var c = pct>=100?'#E24B4A':pct>=80?'#EF9F27':'#1D9E75';
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
        '<td class="text-muted">' + (taskCount === null ? '—' : taskCount) + '</td>' +
        '<td style="min-width:110px"><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:6px;background:#f0ede8;border-radius:3px;overflow:hidden"><div style="height:100%;width:' + Math.min(pct,100) + '%;background:' + c + '"></div></div><span class="text-muted" style="font-size:11px;min-width:30px">' + pct + '%</span></div></td>' +
        '<td><button class="btn btn-sm" onclick="editResource(\'' + r.id + '\')"><i class="ti ti-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="deleteResource(\'' + r.id + '\')"><i class="ti ti-trash"></i></button></td>' +
        '</tr>' + projectExpandRow(r, 9);
    }).join('');
    tableHtml = '<table><thead><tr>' +
      '<th class="sortable-th" onclick="setResourceSort(\'firstName\')">First name ' + arrow('firstName') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'lastName\')">Last name ' + arrow('lastName') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'role\')">Role ' + arrow('role') + '</th>' +
      '<th style="text-align:center">Linked</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'teamName\')">Team ' + arrow('teamName') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'projects\')">Projects ' + arrow('projects') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'tasks\')">Open tasks ' + arrow('tasks') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'capacity\')">Capacity ' + arrow('capacity') + '</th>' +
      '<th></th></tr></thead><tbody>' + rows + '</tbody></table>';
  } else {
    var trows = list.map(function(r) {
      var combinedCount = resourceCombinedProjectIds(r).allIds.length;
      return '<tr>' +
        '<td class="bold">' + r.name + '</td>' +
        '<td class="text-muted">' + (r.managerName||'—') + '</td>' +
        '<td class="text-muted">' + (r.members||[]).length + '</td>' +
        '<td><button class="btn btn-sm" onclick="toggleResourceExpand(\'' + r.id + '\')">' + combinedCount + ' <i class="ti ' + (st.expandedId===r.id?'ti-chevron-up':'ti-chevron-down') + '"></i></button></td>' +
        '<td><button class="btn btn-sm" onclick="editResource(\'' + r.id + '\')"><i class="ti ti-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="deleteResource(\'' + r.id + '\')"><i class="ti ti-trash"></i></button></td>' +
        '</tr>' + projectExpandRow(r, 5);
    }).join('');
    tableHtml = '<table><thead><tr>' +
      '<th class="sortable-th" onclick="setResourceSort(\'name\')">Team ' + arrow('name') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'managerName\')">Manager ' + arrow('managerName') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'members\')">Members ' + arrow('members') + '</th>' +
      '<th class="sortable-th" onclick="setResourceSort(\'projects\')">Projects ' + arrow('projects') + '</th>' +
      '<th></th></tr></thead><tbody>' + trows + '</tbody></table>';
  }

  document.getElementById('content').innerHTML =
    '<div class="grid-3 mb-16">' +
      '<div class="metric"><div class="metric-label">Total resources</div><div class="metric-value">' + D.resources.length + '</div><div class="metric-sub">' + teams.length + ' teams, ' + individuals.length + ' individuals</div></div>' +
      '<div class="metric"><div class="metric-label">At capacity</div><div class="metric-value" style="color:#A32D2D">' + over + '</div></div>' +
      '<div class="metric"><div class="metric-label">Near capacity</div><div class="metric-value" style="color:#854F0B">' + warn + '</div></div>' +
    '</div>' +
    '<div class="tab-bar" style="margin-bottom:16px">' +
      '<div class="tab' + (st.tab==='individual'?' active':'') + '" onclick="setResourceTab(\'individual\')">Individuals <span class="badge badge-gray">' + individuals.length + '</span></div>' +
      '<div class="tab' + (st.tab==='team'?' active':'') + '" onclick="setResourceTab(\'team\')">Teams <span class="badge badge-gray">' + teams.length + '</span></div>' +
    '</div>' +
    '<div class="card"><div class="task-filter-bar"><input type="text" id="res-search" placeholder="Search resources…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onResourceSearch(this.value)"></div>' +
    (list.length ? '<div class="table-wrap">' + tableHtml + '</div>' : '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No resources match your search</p></div>') +
    '</div>';

  window.setResourceTab = function(t) { resourcesPageState.tab = t; resourcesPageState.sort = t === 'individual' ? 'firstName' : 'name'; resourcesPageState.dir = 'asc'; resourcesPageState.expandedId = null; pgResources(); };
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
      '<div class="grid-2">' +
        '<div class="form-group"><div class="form-label">Email</div><input type="email" id="nr-email" placeholder="name@yourcompany.com"><p class="text-muted" style="font-size:12px;margin-top:4px">Auto-links if it matches an existing account.</p></div>' +
        '<div class="form-group"><div class="form-label">Capacity (%)</div><input type="number" id="nr-alloc" value="0" min="0" max="100"></div>' +
      '</div>' +
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
      record = { name: tname, type: 'team', title: null, manager_resource_id: document.getElementById('nr-manager').value || null, allocated_pct: 0, non_project_capacity: 0 };
    } else {
      var first = document.getElementById('nr-first').value.trim();
      var last = document.getElementById('nr-last').value.trim();
      if (!first || !last) { showToast('First and last name required'); btn.disabled = false; return; }
      linkedTeamId = document.getElementById('nr-team').value || null;
      record = {
        name: first + ' ' + last, first_name: first, last_name: last, type: 'individual',
        title: document.getElementById('nr-role').value || null,
        allocated_pct: parseInt(document.getElementById('nr-alloc').value) || 0, non_project_capacity: 0,
        email: document.getElementById('nr-email').value.trim() || null
      };
    }

    var result = await sb.from('resources').insert(record).select().single();
    if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }

    var newRes = {
      id: result.data.id, name: record.name, role: record.title, type: record.type,
      firstName: record.first_name || null, lastName: record.last_name || null,
      allocated: record.allocated_pct, nonProjectCapacity: 0, projects: [],
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
        '<div class="grid-2"><div class="form-group"><div class="form-label">Email</div><input type="email" id="er-email" value="' + (res.email||'') + '">' + (res.userId ? '<p class="text-muted" style="font-size:12px;margin-top:4px"><i class="ti ti-link" style="color:#1D9E75"></i> Linked to a real account</p>' : '') + '</div>' +
        '<div class="form-group"><div class="form-label">Project allocation (%)</div><input type="number" id="er-alloc" value="' + res.allocated + '" min="0" max="100"></div></div>'
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
      var oldTags = r.tags || [];
      var toAdd = newTags.filter(function(n){ return oldTags.indexOf(n) < 0; });
      var toRemove = oldTags.filter(function(n){ return newTags.indexOf(n) < 0; });
      for (var i = 0; i < toAdd.length; i++) {
        var tag = D.tags.find(function(t){ return t.name === toAdd[i]; });
        if (tag) await sb.from('resource_tags').insert({ resource_id: rid2, tag_id: tag.id });
      }
      for (var j = 0; j < toRemove.length; j++) {
        var tagR = D.tags.find(function(t){ return t.name === toRemove[j]; });
        if (tagR) await sb.from('resource_tags').delete().eq('resource_id', rid2).eq('tag_id', tagR.id);
      }
      r.tags = newTags;
      showToast('Tags updated');
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
    var alloc = parseInt(document.getElementById('er-alloc').value) || 0;
    var email = document.getElementById('er-email').value.trim() || null;
    var newTeamId = document.getElementById('er-team').value || null;
    var name = (first + ' ' + last).trim() || res.name;

    var result = await sb.from('resources').update({ name: name, first_name: first, last_name: last, title: role, allocated_pct: alloc, email: email }).eq('id', rid).select().single();
    if (result.error) { showToast('Could not save: ' + result.error.message); if (btn) btn.disabled = false; return; }
    res.name = name; res.firstName = first; res.lastName = last; res.role = role; res.allocated = alloc; res.email = email; res.userId = result.data.user_id;

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

function pgSubmit() {
  tb('Submit a Request');
  var buOpts = '<option value="">— Select —</option>' + BUSINESS_UNITS.map(function(v){ return '<option>' + v + '</option>'; }).join('');
  var selectedTags = [];
  var selectedTeam = [];

  document.getElementById('content').innerHTML =
    '<div class="card" style="max-width:660px;margin:0 auto">' +
    '<div class="section-title mb-16">New project request</div>' +
    '<div class="form-group"><div class="form-label">Project title *</div><input type="text" id="f-title" placeholder="e.g. Customer onboarding redesign"></div>' +
    '<div class="form-group"><div class="form-label">Business Unit *</div><select id="f-bu">' + buOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Sponsor</div><input type="text" id="f-sponsor" placeholder="Optional"></div>' +
    '<div class="form-group"><div class="form-label">Description *</div><div class="form-sub">What is the problem or opportunity?</div><textarea id="f-desc" rows="4" placeholder="Describe the situation and why this project is needed…"></textarea></div>' +
    '<div class="form-group"><div class="form-label">This request is a… *</div><select id="f-opp-type" onchange="onOppTypeChange()">' +
      '<option value="">— Select —</option><option>Revenue opportunity</option><option>Cost savings opportunity</option><option>Something else</option>' +
    '</select></div>' +
    '<div class="form-group" id="f-opp-other-row" style="display:none"><div class="form-label">Please describe</div><input type="text" id="f-opp-other" placeholder="What kind of opportunity is this?"></div>' +
    '<div class="form-group" id="f-estimate-row" style="display:none">' +
      '<div class="form-label" id="f-estimate-label">Estimated</div>' +
      '<div class="grid-2"><select id="f-est-freq"><option>Monthly</option><option>Annually</option></select>' +
      '<input type="text" id="f-est-amount" placeholder="$ amount (optional)"></div>' +
      '<div id="f-est-err" style="color:#A32D2D;font-size:12px;margin-top:4px;display:none">Please enter a valid number (digits only)</div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Value justification</div><div class="form-sub">Why does this matter? This stays with the request and won\'t appear on the project itself.</div><textarea id="f-justification" rows="3" placeholder="e.g. Reduces manual reconciliation time by an estimated 10 hours/week…"></textarea></div>' +
    '<div class="form-group"><div class="form-label">Tags</div><div id="f-tags-chips" style="margin-bottom:8px"></div><button class="btn btn-sm" onclick="openRequestTagPicker()"><i class="ti ti-tag"></i> Select tags</button></div>' +
    '<div class="form-group"><div class="form-label">Team</div><input type="text" id="f-team-search" placeholder="Search people or teams…" oninput="filterRequestTeamList(this.value)">' +
      '<div id="f-team-list" style="max-height:200px;overflow-y:auto;margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px">' + requestTeamOptionsHtml([]) + '</div></div>' +
    '<div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" id="f-submit"><i class="ti ti-send"></i> Submit request</button></div></div>';

  function requestTeamOptionsHtml(selected) {
    var options = individualResourceNames().concat(teamNames());
    return options.map(function(n) {
      var isTeam = teamNames().indexOf(n) >= 0;
      var chk = selected.indexOf(n) >= 0 ? ' checked' : '';
      return '<label class="member-check f-team-row" data-name="' + n.toLowerCase() + '"><input type="checkbox" data-name="' + n.replace(/"/g,'&quot;') + '" onchange="toggleRequestTeamMember(this)"' + chk + '> ' + n + (isTeam ? ' <i class="ti ti-users" style="color:#185FA5;font-size:11px"></i>' : '') + '</label>';
    }).join('');
  }

  window.onOppTypeChange = function() {
    var type = document.getElementById('f-opp-type').value;
    document.getElementById('f-opp-other-row').style.display = type === 'Something else' ? 'block' : 'none';
    var showEstimate = type === 'Revenue opportunity' || type === 'Cost savings opportunity';
    document.getElementById('f-estimate-row').style.display = showEstimate ? 'block' : 'none';
    if (showEstimate) document.getElementById('f-estimate-label').textContent = 'Estimated ' + (type === 'Revenue opportunity' ? 'Revenue' : 'Savings');
  };

  document.getElementById('f-est-amount').addEventListener('input', function() {
    this.value = this.value.replace(/[^0-9]/g,'');
    document.getElementById('f-est-err').style.display = 'none';
  });

  window.filterRequestTeamList = function(query) {
    var q = query.trim().toLowerCase();
    document.querySelectorAll('#f-team-list .f-team-row').forEach(function(row) {
      row.style.display = row.getAttribute('data-name').indexOf(q) >= 0 ? 'flex' : 'none';
    });
  };
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
    var sponsor = document.getElementById('f-sponsor').value.trim();
    var desc = document.getElementById('f-desc').value.trim();
    var oppType = document.getElementById('f-opp-type').value;
    var oppOther = document.getElementById('f-opp-other').value.trim();
    var justification = document.getElementById('f-justification').value.trim();

    if (!title || !bu || !desc || !oppType) { showToast('Please fill in all required fields', 'error'); return; }
    if (oppType === 'Something else' && !oppOther) { showToast('Please describe the opportunity', 'error'); return; }

    var showEstimate = oppType === 'Revenue opportunity' || oppType === 'Cost savings opportunity';
    var estAmountRaw = showEstimate ? document.getElementById('f-est-amount').value.trim() : '';
    if (estAmountRaw && isNaN(Number(estAmountRaw))) { document.getElementById('f-est-err').style.display = 'block'; return; }

    var btn = document.getElementById('f-submit'); btn.disabled = true;
    var record = {
      title: title, submitter_id: D.currentProfile.id, submitter_name: currentUser() || 'Current User',
      sponsor: sponsor || null, business_unit: bu, description: desc, opportunity_type: oppType,
      opportunity_type_other: oppType === 'Something else' ? oppOther : null,
      estimated_frequency: showEstimate ? document.getElementById('f-est-freq').value : null,
      estimated_type: oppType === 'Revenue opportunity' ? 'Revenue' : oppType === 'Cost savings opportunity' ? 'Savings' : null,
      estimated_amount: (showEstimate && estAmountRaw) ? Number(estAmountRaw) : null,
      value_justification: justification || null, status: 'Pending'
    };
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
      businessUnit: bu, description: desc, opportunityType: oppType, opportunityTypeOther: record.opportunity_type_other,
      estimatedFrequency: record.estimated_frequency, estimatedType: record.estimated_type, estimatedAmount: record.estimated_amount,
      valueJustification: justification, tags: newTags, team: selectedTeam.slice(), feedback: '', editedByName: null, editedAt: null
    });
    showToast('Request submitted successfully');
    renderNav();
    nav('my-requests');
  };
}

// ── Stakeholder: My Requests ────────────────────────────────────────────────────

var myRequestsState = { search: '', sort: 'date', dir: 'desc', filters: { businessUnit:[], priority:[], status:[] }, openFilter: null };

function pgMyRequests() {
  tb('My Requests');
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

  if (!allMine.length) { html += '<div class="empty-state"><i class="ti ti-inbox"></i><p>No requests yet</p></div>'; document.getElementById('content').innerHTML = html; return; }

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

  document.getElementById('content').innerHTML = html;
  window.onMyRequestsSearch = function(v) {
    st.search = v; pgMyRequests();
    var el = document.getElementById('my-requests-search');
    if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
  };
  window.setMyReqSort = function(col) { if (st.sort === col) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = col; st.dir = 'asc'; } pgMyRequests(); };
  window.toggleMyReqFilter = function(col) {
    var labelMap = { businessUnit:'Business Unit', priority:'Priority', status:'Status' };
    var choicesMap = { businessUnit:businessUnitChoices, priority:priorityChoices, status:statusChoices };
    openFilterModal(labelMap[col], choicesMap[col],
      function() { return st.filters[col]; },
      function(val) { var arr = st.filters[col]; var i = arr.indexOf(val); if (i>=0) arr.splice(i,1); else arr.push(val); },
      function() { st.filters[col] = []; },
      pgMyRequests
    );
  };
  window.viewLinkedProject = function(pid) { goToProject(pid); };
  window.revokeRequest = async function(rid) {
    if (!confirm('Revoke this request? It will be removed from the PMO queue.')) return;
    var r = D.requests.find(function(x){ return x.id===rid; });
    var result = await sb.from('requests').update({ status: 'Revoked' }).eq('id', rid);
    if (result.error) { showToast('Could not revoke: ' + result.error.message); return; }
    r.status = 'Revoked'; showToast('Request revoked'); pgMyRequests(); renderNav();
  };
}

// ── Resource Role Pages ────────────────────────────────────────────────────────

function pgMyProjectsResource() {
  tb('My Projects');
  var ps = myAssignedProjects();
  if (!ps.length) { document.getElementById('content').innerHTML = '<div class="empty-state"><i class="ti ti-briefcase"></i><p>You are not assigned to any projects</p></div>'; return; }
  var cards = ps.map(function(p) {
    var myTasks = p.tasks.filter(function(t){ return t.assignee === currentUser(); });
    var doneTasks = myTasks.filter(function(t){ return t.status==='Done'; }).length;
    return '<div class="project-card">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">' +
        '<div><div class="bold mb-12">' + hdot(p.health) + p.name + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + bdg(p.status) + ' ' + stagePill(p.stage) + ' ' + badgeIf('badge-purple', p.value) + '</div></div>' +
        '<button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>' +
      '</div>' +
      '<div class="grid-2 mt-12" style="font-size:12px;color:#777">' +
        '<div>Owner: ' + (p.owner||'—') + '</div><div>Due: ' + (p.end||'TBD') + '</div>' +
        '<div>My tasks: ' + doneTasks + '/' + myTasks.length + ' done</div>' +
      '</div>' +
      (p.blockers ? '<div class="blocker-note"><i class="ti ti-alert-triangle"></i> ' + p.blockers + '</div>' : '') +
    '</div>';
  }).join('');
  document.getElementById('content').innerHTML = cards;
}

function pgMyTasks() {
  tb('My Tasks');
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
      else { av = a.task.due || ''; bv = b.task.due || ''; }
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
    var p = item.project, task = item.task;
    var canEditThis = canEdit(p);
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
    return '<tr><td class="bold">' + task.title + '</td>' +
      '<td>' + p.name + ' ' +
        '<button class="btn btn-sm" title="View project overview" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-info-circle"></i></button> ' +
        '<button class="btn btn-sm" title="View this project\'s task list" onclick="goToProject(\'' + p.id + '\',\'tasks\')"><i class="ti ti-list"></i></button></td>' +
      '<td>' + bdg(task.status) + '</td><td class="text-muted">' + (task.due || '—') + '</td>' +
      '<td><div style="display:flex;gap:4px;flex-wrap:wrap">' +
        '<button class="btn btn-sm" title="Comments" onclick="toggleTaskComments(\'' + p.id + '\',\'' + task.id + '\')"><i class="ti ' + (cOpenNow?'ti-chevron-up':'ti-message-circle') + '"></i>' + (comments.length ? ' ' + comments.length : '') + '</button>' +
        (task.status!=='Done' ? '<button class="btn btn-sm btn-success" onclick="openCompleteTaskPrompt(\'' + p.id + '\',' + item.idx + ')"><i class="ti ti-check"></i> Mark done</button>' : '') +
      '</div></td></tr>' + commentsRow;
  }).join('');

  var searchBar = '<div class="task-filter-bar"><input type="text" id="my-tasks-search" placeholder="Search your tasks…" value="' + st.search.replace(/"/g,'&quot;') + '" oninput="onMyTasksSearch(this.value)"></div>';

  document.getElementById('content').innerHTML =
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
          '<th class="sortable-th" onclick="setMyTasksSort(\'due\')">Due ' + arrow('due') + '</th><th></th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>'
        : '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No tasks match your search/filters</p></div>')
      : '<div class="empty-state" style="padding:24px"><i class="ti ti-check"></i><p>' + (st.tab==='open' ? 'No open tasks — nice work!' : 'No completed tasks yet') + '</p></div>') +
    '</div>';

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

function pgMyCapacity() {
  tb('My Capacity');
  var me = currentUser();
  var res = D.resources.find(function(r){ return r.name===me; });
  var nonPct = res ? (res.nonProjectCapacity||0) : 0;
  var projPct = res ? res.allocated : 0;
  document.getElementById('content').innerHTML =
    '<div class="card" style="max-width:500px">' +
    '<div class="section-title">My capacity settings</div>' +
    '<div style="margin-bottom:20px">' +
      '<div class="form-label">Project allocation</div>' +
      '<div style="font-size:28px;font-weight:600;color:#534AB7">' + projPct + '%</div>' +
      '<div class="text-muted">Managed by your PMO admin based on assigned projects</div>' +
    '</div>' +
    '<div class="divider"></div>' +
    '<div class="form-group"><div class="form-label">BAU / Non-project work (%)</div>' +
    '<div class="form-sub">Set the percentage of your capacity that should be reserved for day-to-day non-project work (e.g. support, meetings, BAU tasks).</div>' +
    '<input type="number" id="cap-bau" value="' + nonPct + '" min="0" max="100" style="max-width:120px"></div>' +
    '<div style="background:#f5f5f3;border-radius:8px;padding:14px;margin-bottom:16px">' +
      '<div style="font-size:13px;font-weight:600;margin-bottom:8px">Capacity summary</div>' +
      '<div style="display:flex;gap:0;height:20px;border-radius:5px;overflow:hidden;margin-bottom:8px">' +
        '<div id="cap-bar-proj" style="background:#534AB7;width:' + projPct + '%;transition:width .3s"></div>' +
        '<div id="cap-bar-bau"  style="background:#b0abe0;width:' + nonPct + '%;transition:width .3s"></div>' +
        '<div id="cap-bar-free" style="background:#f0ede8;flex:1"></div>' +
      '</div>' +
      '<div style="display:flex;gap:16px;font-size:12px">' +
        '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#534AB7;margin-right:4px"></span>Projects: ' + projPct + '%</span>' +
        '<span id="cap-bau-label"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#b0abe0;margin-right:4px"></span>BAU: ' + nonPct + '%</span>' +
        '<span id="cap-free-label"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f0ede8;margin-right:4px"></span>Available: ' + Math.max(0,100-projPct-nonPct) + '%</span>' +
      '</div>' +
    '</div>' +
    '<button class="btn btn-primary" id="cap-save"><i class="ti ti-check"></i> Save</button></div>';

  document.getElementById('cap-bau').addEventListener('input', function() {
    var v = Math.min(100-projPct, Math.max(0, parseInt(this.value)||0));
    document.getElementById('cap-bar-bau').style.width = v + '%';
    document.getElementById('cap-bau-label').innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#b0abe0;margin-right:4px"></span>BAU: ' + v + '%';
    document.getElementById('cap-free-label').innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f0ede8;margin-right:4px"></span>Available: ' + Math.max(0,100-projPct-v) + '%';
  });
  document.getElementById('cap-save').onclick = function() {
    var v = Math.min(100-projPct, Math.max(0, parseInt(document.getElementById('cap-bau').value)||0));
    if (res) { res.nonProjectCapacity = v; showToast('Capacity saved'); }
    else showToast('Resource profile not found','error');
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