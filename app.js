// ── Supabase connection ───────────────────────────────────────────────────────
var SUPABASE_URL = 'https://mglwdprqbjncnlioifya.supabase.co';
var SUPABASE_KEY = 'sb_publishable_iEcNnoDk0u7CqoAuh8Kuyg_nDl-QuO3';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
  var result = await sb.from('requests').select('*');
  if (result.error) { console.error('loadRequests query failed:', result.error); return []; }
  return (result.data || []).map(function(r) {
    return {
      id: r.id, title: r.title, submitter: r.submitter_name, submitterId: r.submitter_id,
      dept: r.dept, date: r.submitted_at, status: r.status, priority: r.priority,
      value: r.value_area, impact: r.impact, description: r.description,
      effort: r.effort, cost: r.cost, feedback: r.feedback,
      linkedProject: r.linked_project, rejectedDate: r.rejected_date
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
    sb.from('resources').select('id, name, user_id')
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

  var activeProfilesRows = profilesRows.filter(function(p){ return p.is_active !== false; });
  D.people = activeProfilesRows.map(function(p){ return p.display_name; });
  D.peopleByName = {};
  activeProfilesRows.forEach(function(p){ D.peopleByName[p.display_name] = p; });

  // Owner/assignee/team all resolve through resources now, not accounts.
  var resourceNameById = {};
  resourceMiniRows.forEach(function(r){ resourceNameById[r.id] = r.name; });

  var teamByProject      = groupBy(teamRows, 'project_id');
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
      category: pr.category, businessUnit: pr.business_unit,
      team: teamNames, teamIds: teamIds,
      status: pr.status, phase: pr.phase, progress: pr.progress,
      start: pr.start_date, end: pr.end_date, plannedStart: pr.planned_start,
      value: pr.value_area, priority: pr.priority, description: pr.description,
      blockers: pr.blockers, health: pr.health, stage: pr.stage, requestId: pr.request_id,
      holdReason: pr.hold_reason, preHoldStage: pr.pre_hold_stage,
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
  window.__filterModalClear = function() { clearAll(); rerenderPage(); render(); };
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
var PHASE_COLORS = { 'Not Started':'#9B9B93', 'Discovery':'#185FA5', 'Design':'#534AB7', 'Build':'#1D9E75', 'Testing':'#EF9F27', 'Deployment':'#D85A30' };
var dashProjState = { sort:'priority', dir:'asc', search:'', fStatus:[], fPhase:[], openFilter:null };
var resourcesPageState = { tab:'individual', sort:'firstName', dir:'asc', search:'', expandedId:null };
var myTasksState = { sort:'due', dir:'asc', search:'', tab:'open', fProject:[], fStatus:[], openFilter:null };
var PRIORITY_RANK = { 'Critical':0, 'High':1, 'Medium':2, 'Low':3 };
var rejectedFilterState = { range:'30' };

function fmtCost(n) {
  if (!n && n !== 0) return '—';
  return '$' + Number(n).toLocaleString();
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

var NAV_DEF = {
  admin: [
    { s:'Overview', items:[{id:'dashboard',icon:'ti-layout-dashboard',label:'Dashboard'},{id:'portfolio',icon:'ti-folder-open',label:'Portfolio'}] },
    { s:'Intake',   items:[{id:'requests',icon:'ti-inbox',label:'Requests',badge:'pending'}] },
    { s:'Projects', items:[
      {id:'backlog',  icon:'ti-stack-2',        label:'Backlog',         badge:'backlog'},
      {id:'planned',  icon:'ti-calendar-event', label:'Planned'},
      {id:'projects', icon:'ti-briefcase',      label:'Active projects'},
      {id:'completed',icon:'ti-circle-check',   label:'Completed'},
      {id:'roadmap',  icon:'ti-road',           label:'Roadmap'},
      {id:'resources',icon:'ti-users',          label:'Resources'}
    ]},
    { s:'My Requests', items:[
      {id:'submit',       icon:'ti-send',  label:'Submit a request'},
      {id:'my-requests',  icon:'ti-clock', label:'My requests'}
    ]},
    { s:'Data Tools', items:[
      {id:'import-projects', icon:'ti-file-upload', label:'Import Projects'}
    ]},
    { s:'Administration', items:[
      {id:'admin-users', icon:'ti-users-group', label:'Manage Users'}
    ]}
  ],
  member: [
    { s:'Overview', items:[
      {id:'dashboard', icon:'ti-layout-dashboard', label:'Dashboard'},
      {id:'portfolio', icon:'ti-folder-open',      label:'Portfolio'}
    ]},
    { s:'Projects', items:[
      {id:'planned',   icon:'ti-calendar-event', label:'Planned'},
      {id:'projects',  icon:'ti-briefcase',      label:'Active projects'},
      {id:'completed', icon:'ti-circle-check',   label:'Completed'},
      {id:'roadmap',   icon:'ti-road',           label:'Roadmap'},
      {id:'resources', icon:'ti-users',          label:'Resources'}
    ]},
    { s:'Requests', items:[
      {id:'submit',       icon:'ti-send',  label:'Submit a request'},
      {id:'my-requests',  icon:'ti-clock', label:'My requests'}
    ]}
  ]
};

function renderNav() {
  var defs = (NAV_DEF[D.role] || []).slice();
  if (hasAssignedWork()) {
    defs = defs.concat([{ s:'My Work', items:[
      {id:'my-projects', icon:'ti-briefcase',   label:'My projects'},
      {id:'my-tasks',    icon:'ti-check',       label:'My tasks', badge:'my-tasks'},
      {id:'my-capacity', icon:'ti-adjustments', label:'My capacity'}
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
  'import-projects':pgImportProjects, 'admin-users':pgAdminUsers
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
  var previewBanner = document.getElementById('preview-banner');
  if (realRole === 'admin') {
    previewControl.style.display = 'block';
    document.getElementById('preview-role-select').value = D.previewRole || '';
  } else {
    previewControl.style.display = 'none';
  }
  if (D.previewRole) {
    previewBanner.style.display = 'block';
    previewBanner.innerHTML = '<i class="ti ti-eye"></i> Previewing as ' + roleLabel(D.previewRole);
  } else {
    previewBanner.style.display = 'none';
  }

  D.role = D.previewRole || realRole;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-root').style.display = 'flex';
  renderNav();

  if (!skipReload) {
    document.getElementById('content').innerHTML = '<div class="empty-state" style="padding:60px"><i class="ti ti-loader-2"></i><p>Loading your projects…</p></div>';
    var loaded = await Promise.all([loadAllProjects(), loadResources(), loadRequests()]);
    D.projects = loaded[0];
    D.resources = loaded[1];
    D.requests = loaded[2];
    var myResource = D.resources.find(function(r){ return r.userId === D.currentProfile.id; });
    D.myResourceId = myResource ? myResource.id : null;
  }

  if (location.hash && location.hash.length > 1) {
    handleRoute();
  } else {
    nav('dashboard');
  }
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

function setPreviewRole(role) {
  if (D.currentProfile.role !== 'admin') return; // safety check; UI is already hidden for non-admins
  D.previewRole = role || null;
  bootAppForUser(true);
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
    '<div class="card mb-16"><div class="section-title">Active projects</div>' + dashSearchBar +
      (displayed.length ? '<div class="table-wrap"><table>' +
      '<thead><tr>' +
        '<th class="sortable-th" onclick="setDashProjSort(\'name\')">Project ' + dArrow('name') + '</th>' +
        '<th class="sortable-th" style="position:relative"><span onclick="setDashProjSort(\'status\')">Status ' + dArrow('status') + '</span>' + dFilterIcon('fStatus', statusChoicesD) + '</th>' +
        '<th class="sortable-th" onclick="setDashProjSort(\'priority\')">Priority ' + dArrow('priority') + '</th>' +
        '<th class="sortable-th" style="position:relative"><span onclick="setDashProjSort(\'phase\')">Phase ' + dArrow('phase') + '</span>' + dFilterIcon('fPhase', phaseChoicesD) + '</th>' +
        '<th class="sortable-th" style="min-width:160px" onclick="setDashProjSort(\'progress\')">Progress ' + dArrow('progress') + '</th>' +
        '<th>PM</th><th>Blockers</th><th></th></tr></thead>' +
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
}

// ── Portfolio ───────────────────────────────────────────────────────────────

function pgPortfolio() {
  tb('Portfolio');
  var stageOrder = { active: 0, planned: 1, backlog: 2, hold: 3, complete: 4 };
  var byVal = {};
  D.projects.filter(function(p){ return p.stage !== 'complete'; }).forEach(function(p){ if (!byVal[p.value]) byVal[p.value] = []; byVal[p.value].push(p); });
  Object.keys(byVal).forEach(function(v) {
    byVal[v].sort(function(a, b) {
      var ar = stageOrder[a.stage]; if (ar == null) ar = 9;
      var br = stageOrder[b.stage]; if (br == null) br = 9;
      return ar - br;
    });
  });
  var cols = ['badge-purple','badge-teal','badge-blue','badge-coral','badge-amber'];
  var i = 0, h = '';
  Object.keys(byVal).forEach(function(v) {
    var cl = cols[i++ % cols.length];
    var cards = byVal[v].map(function(p) {
      var req = p.requestId ? D.requests.find(function(r){ return r.id === p.requestId; }) : null;
      return '<div class="card card-sm" style="cursor:pointer;border:1px solid #e8e8e5;border-radius:10px" onclick="goToProject(\'' + p.id + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px"><span class="bold" style="font-size:13px">' + p.name + '</span>' + stagePill(p.stage) + '</div>' +
        (p.stage === 'hold' && p.holdReason ? '<div class="text-muted mb-12" style="font-size:12px"><i class="ti ti-player-pause"></i> ' + p.holdReason + '</div>' : '') +
        '<div class="text-muted mb-12" style="line-height:1.5">' + (p.description||'') + '</div>' +
        (req && req.cost != null ? '<div class="text-muted mb-12" style="font-size:12px"><i class="ti ti-currency-dollar"></i> Estimated cost: ' + fmtCost(req.cost) + '</div>' : '') +
        '<div class="progress-bar mb-12"><div class="progress-fill" style="width:' + p.progress + '%"></div></div>' +
        '<div style="display:flex;justify-content:space-between"><span class="text-muted">' + (p.owner || 'No PM') + '</span><span class="text-muted">' + (p.end || 'TBD') + '</span></div></div>';
    }).join('');
    h += '<div class="card mb-16"><div class="mb-12"><span class="badge ' + cl + '" style="font-size:13px;padding:5px 14px">' + v + '</span></div><div class="grid-2">' + cards + '</div></div>';
  });
  document.getElementById('content').innerHTML = h || '<div class="empty-state"><i class="ti ti-folder-open"></i><p>No projects yet</p></div>';
}

// ── Requests ────────────────────────────────────────────────────────────────

function pgRequests() {
  tb('Requests');
  var activeTab = 'Pending';
  var tabs = ['All','Pending','Approved','Backlog','Planned','Active','Rejected','Revoked'];
  function filtered(t) { return t === 'All' ? D.requests : D.requests.filter(function(r){ return r.status === t; }); }
  function tbl(t) {
    var rows = filtered(t);
    if (!rows.length) return '<div class="empty-state"><i class="ti ti-inbox"></i><p>No ' + t.toLowerCase() + ' requests</p></div>';
    return '<div class="table-wrap"><table><thead><tr><th>Title</th><th>Submitter</th><th>Dept</th><th>Date</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>' +
      rows.map(function(r) {
        return '<tr><td class="bold">' + r.title + '</td><td>' + r.submitter + '</td><td>' + r.dept + '</td><td class="text-muted">' + r.date + '</td>' +
          '<td>' + bdg(r.priority) + '</td><td>' + bdg(r.status) + '</td>' +
          '<td><button class="btn btn-sm" onclick="reviewRequest(\'' + r.id + '\')"><i class="ti ti-eye"></i> ' + (D.role === 'admin' && r.status === 'Pending' ? 'Review' : 'View') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  var tabsHtml = tabs.map(function(t) {
    var extra = t === 'Pending' ? ' <span class="badge badge-amber" style="margin-left:4px">' + pendingCount() + '</span>' : '';
    return '<div class="tab' + (t === activeTab ? ' active' : '') + '" id="rtab-' + t + '" onclick="switchRTab(\'' + t + '\')">' + t + extra + '</div>';
  }).join('');
  document.getElementById('content').innerHTML = '<div class="tab-bar">' + tabsHtml + '</div><div id="req-body">' + tbl(activeTab) + '</div>';
  window.switchRTab = function(t) {
    activeTab = t;
    tabs.forEach(function(x){ var e = document.getElementById('rtab-' + x); if (e) e.className = 'tab' + (x === t ? ' active' : ''); });
    document.getElementById('req-body').innerHTML = tbl(t);
  };
}

function reviewRequest(id) {
  var r = D.requests.find(function(x){ return x.id === id; });
  var canApprove = D.role === 'admin' && r.status === 'Pending';
  var canBacklog  = D.role === 'admin' && r.status === 'Approved';
  // find linked project for read-only view
  var linkedP = r.linkedProject ? D.projects.find(function(p){ return p.id === r.linkedProject; }) : null;

  var html =
    '<div class="modal-title"><div>' +
      '<div style="font-size:16px;font-weight:600;margin-bottom:8px">' + r.title + '</div>' +
      '<div style="display:flex;gap:6px">' + bdg(r.status) + ' ' + bdg(r.priority) + '</div>' +
    '</div><button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="grid-2 mb-16">' +
      '<div><div class="form-label">Submitted by</div>' + r.submitter + ' — ' + r.dept + '</div>' +
      '<div><div class="form-label">Date</div>' + r.date + '</div>' +
      '<div><div class="form-label">Estimated cost</div>' + fmtCost(r.cost) + '</div>' +
      '<div><div class="form-label">Effort</div><span class="badge badge-gray">' + r.effort + '</span></div>' +
      '<div><div class="form-label">Value area</div><span class="badge badge-purple">' + r.value + '</span></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Description</div><div style="background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6">' + r.description + '</div></div>' +
    '<div class="form-group"><div class="form-label">Impact &amp; value proposition</div><div style="background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6">' + r.impact + '</div></div>' +
    (r.feedback ? '<div class="form-group"><div class="form-label">PMO feedback</div><div style="background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6;border-left:3px solid #534AB7">' + r.feedback + '</div></div>' : '');

  // linked project read-only summary
  if (linkedP) {
    html += '<div class="divider"></div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div class="form-label" style="margin-bottom:0">Linked project</div>' +
      (D.role === 'admin' ? '<button class="btn btn-sm" onclick="closeModal();editProject(\'' + linkedP.id + '\')"><i class="ti ti-edit"></i> Edit project</button>' : '') + '</div>' +
      '<div style="background:#f5f5f3;padding:12px 16px;border-radius:8px;font-size:13px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span class="bold">' + linkedP.name + '</span>' + stagePill(linkedP.stage) + '</div>' +
        '<div class="grid-2" style="gap:8px 16px;font-size:12px">' +
          '<div><span class="text-muted">Status: </span>' + bdg(linkedP.status) + '</div>' +
          '<div><span class="text-muted">Phase: </span><span class="badge badge-gray">' + linkedP.phase + '</span></div>' +
          '<div><span class="text-muted">PM: </span>' + (linkedP.owner || '—') + '</div>' +
          '<div><span class="text-muted">Due: </span>' + (linkedP.end || 'TBD') + '</div>' +
        '</div>' +
        '<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:11px;color:#777;margin-bottom:3px"><span>Progress</span><span>' + linkedP.progress + '%</span></div>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + linkedP.progress + '%"></div></div></div>' +
        (linkedP.blockers ? '<div class="blocker-note" style="margin-top:8px"><i class="ti ti-alert-triangle"></i> ' + linkedP.blockers + '</div>' : '') +
      '</div>';
  }

  if (canApprove) {
    html += '<div class="form-group" style="margin-top:16px"><div class="form-label">Feedback to submitter</div><textarea id="rfb" placeholder="Decision rationale…">' + r.feedback + '</textarea></div>' +
      '<div class="modal-footer"><button class="btn btn-danger" onclick="decideReq(\'' + r.id + '\',\'Rejected\')"><i class="ti ti-x"></i> Reject</button>' +
      '<button class="btn btn-success" onclick="decideReq(\'' + r.id + '\',\'Approved\')"><i class="ti ti-check"></i> Approve — add to backlog</button></div>';
  } else if (canBacklog) {
    html += '<div class="modal-footer"><button class="btn btn-primary" onclick="scheduleFromRequest(\'' + r.id + '\')"><i class="ti ti-calendar-plus"></i> Schedule this project</button><button class="btn" onclick="closeModal()">Close</button></div>';
  } else {
    html += '<div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>';
  }
  showModal(html);
}

async function decideReq(id, decision) {
  var r  = D.requests.find(function(x){ return x.id === id; });
  var fb = document.getElementById('rfb');
  var feedbackVal = fb ? fb.value : r.feedback;

  if (decision === 'Approved') {
    var projectRecord = {
      name: r.title, status: 'Not Started', phase: 'Not Started', progress: 0,
      value_area: r.value, priority: r.priority, description: r.description,
      blockers: '', health: 'green', stage: 'backlog', request_id: r.id
    };
    var projResult = await sb.from('projects').insert(projectRecord).select().single();
    if (projResult.error) { showToast('Could not create project: ' + projResult.error.message); return; }

    var reqResult = await sb.from('requests').update({ status: 'Backlog', feedback: feedbackVal, linked_project: projResult.data.id }).eq('id', id);
    if (reqResult.error) { showToast('Could not update request: ' + reqResult.error.message); return; }

    D.projects.push({
      id: projResult.data.id, name: r.title, owner:'', ownerId:null, sponsor:'', category:null, businessUnit:null,
      team:[], teamIds:[], status:'Not Started', phase:'Not Started', progress:0, start:'', end:'',
      value:r.value, priority:r.priority, description:r.description, blockers:'', health:'green',
      stage:'backlog', plannedStart:'', requestId:r.id, milestones:[], tasks:[],
      raid:{risks:[],assumptions:[],issues:[],dependencies:[]}, documents:[], docFolders:['General'], docFolderIds:{}
    });
    r.status = 'Backlog'; r.linkedProject = projResult.data.id; r.feedback = feedbackVal;
    addNotif(r.submitter, 'Your request "' + r.title + '" has been approved and added to the backlog.', 'approved');
  } else if (decision === 'Rejected') {
    var rejectedDate = new Date().toISOString().split('T')[0];
    var result = await sb.from('requests').update({ status: 'Rejected', feedback: feedbackVal, rejected_date: rejectedDate }).eq('id', id);
    if (result.error) { showToast('Could not save: ' + result.error.message); return; }
    r.status = 'Rejected'; r.feedback = feedbackVal; r.rejectedDate = rejectedDate;
  }
  closeModal(); showToast(decision === 'Approved' ? 'Approved — added to backlog' : 'Request rejected');
  renderNav();
  if (currentPage === 'requests') pgRequests();
  else if (currentPage === 'backlog') pgBacklog();
  else pgDashboard();
}

function scheduleFromRequest(rid) {
  var r = D.requests.find(function(x){ return x.id === rid; });
  closeModal();
  var p = D.projects.find(function(x){ return x.id === r.linkedProject; }) || D.projects.find(function(x){ return x.requestId === rid; });
  if (p) openScheduleModal(p.id); else showToast('No linked project found');
}

// ── Backlog ──────────────────────────────────────────────────────────────────

function pgBacklog() {
  tb('Backlog');
  var bp = D.projects.filter(function(p){ return p.stage === 'backlog'; });
  var cards = bp.map(function(p) {
    return '<div class="project-card">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">' +
        '<div><div class="bold mb-12">' + p.name + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + bdg(p.priority) + ' ' + badgeIf('badge-purple', p.value) + ' ' + stagePill('backlog') + '</div></div>' +
        (D.role === 'admin' ? '<button class="btn btn-primary" onclick="openScheduleModal(\'' + p.id + '\')"><i class="ti ti-calendar-plus"></i> Schedule</button>' : '') +
      '</div>' +
      '<div class="text-muted mt-12">' + (p.description||'') + '</div>' +
    '</div>';
  }).join('');
  document.getElementById('content').innerHTML =
    '<div class="info-banner info-amber"><i class="ti ti-stack-2" style="font-size:20px;flex-shrink:0;color:#BA7517"></i>' +
    '<span>Projects here are <strong>approved</strong> and waiting to be scheduled. Assign a start date to move them to Planned — a PM can be assigned later.</span></div>' +
    (bp.length ? cards : '<div class="empty-state"><i class="ti ti-stack-2"></i><p>Backlog is clear</p></div>');
}

// ── Schedule Modal ────────────────────────────────────────────────────────────

function openScheduleModal(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var ownerPoolSch = p.owner && D.people.indexOf(p.owner) < 0 ? D.people.concat([p.owner]) : D.people;
  var ownerOpts = '<option value="">— None (assign later) —</option>' + ownerPoolSch.map(function(n){
    var isInactiveCurrent = p.owner === n && D.people.indexOf(n) < 0;
    return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (p.owner === n ? ' selected' : '') + '>' + n + (isInactiveCurrent ? ' (deactivated)' : '') + '</option>';
  }).join('');
  var memberOpts = D.people.map(function(n) {
    var chk = p.team.indexOf(n) >= 0 ? ' checked' : '';
    return '<label class="member-check schm-row" data-name="' + n.toLowerCase() + '"><input type="checkbox" id="schm-' + n.replace(/ /g,'_') + '"' + chk + '> ' + n + '</label>';
  }).join('');
  showModal(
    '<div class="modal-title">Schedule project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div style="font-weight:600;margin-bottom:16px;color:#534AB7">' + p.name + '</div>' +
    '<div class="form-group"><div class="form-label">Project manager</div><select id="sch-owner">' + ownerOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Team members</div><input type="text" id="schm-search" placeholder="Search people…" oninput="filterSchmList(this.value)"><div id="schm-list" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">' + memberOpts + '</div></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Planned start *</div><input type="date" id="sch-start" value="' + (p.plannedStart||'') + '"></div>' +
    '<div class="form-group"><div class="form-label">Target end *</div><input type="date" id="sch-end" value="' + (p.end||'') + '"></div></div>' +
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
  var start = document.getElementById('sch-start').value;
  var end   = document.getElementById('sch-end').value;
  if (!start || !end) { showToast('Please set a start and end date'); return; }
  var newTeamNames = D.people.filter(function(n){ var el = document.getElementById('schm-' + n.replace(/ /g,'_')); return el && el.checked; });
  var ownerName = document.getElementById('sch-owner').value;
  var ownerResource = resolveResource(ownerName);

  var result = await sb.from('projects').update({
    planned_start: start, start_date: start, end_date: end, stage: 'planned',
    owner_id: ownerResource ? ownerResource.id : null, owner_name: ownerName || null
  }).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }

  var newRealIds = newTeamNames.map(function(n){ return resolveResource(n); }).filter(Boolean).map(function(r){ return r.id; });
  var oldIds = p.teamIds || [];
  var toAdd = newRealIds.filter(function(id){ return oldIds.indexOf(id) < 0; });
  var toRemove = oldIds.filter(function(id){ return newRealIds.indexOf(id) < 0; });
  if (toAdd.length) await sb.from('resource_projects').insert(toAdd.map(function(id){ return { project_id: pid, resource_id: id }; }));
  for (var i = 0; i < toRemove.length; i++) { await sb.from('resource_projects').delete().eq('project_id', pid).eq('resource_id', toRemove[i]); }

  p.team = newTeamNames; p.teamIds = newRealIds;
  p.owner = ownerName; p.ownerId = ownerResource ? ownerResource.id : null;
  p.plannedStart = start; p.start = start; p.end = end; p.stage = 'planned';
  var r = D.requests.find(function(x){ return x.id === p.requestId; });
  if (r) await syncRequestStatus(r.id, { status: 'Planned', linkedProject: pid });
  addNotif(r ? r.submitter : '', 'Great news! "' + p.name + '" has been scheduled to start on ' + start + (p.owner ? '. PM: ' + p.owner : '') + '.', 'planned');
  closeModal(); showToast('Project scheduled'); renderNav();
  if (currentPage === 'backlog') pgBacklog();
  else if (currentPage === 'planned') pgPlanned();
  else nav(currentPage);
}

// ── Planned ───────────────────────────────────────────────────────────────────

function pgPlanned() {
  tb('Planned projects');
  var pp = D.projects.filter(function(p){ return p.stage === 'planned'; });
  var today = new Date();
  var in30  = new Date(); in30.setDate(today.getDate() + 30);

  var cards = pp.map(function(p) {
    var startDate = p.plannedStart ? new Date(p.plannedStart) : null;
    var soonNoPM  = !p.owner && startDate && startDate <= in30;
    return '<div class="project-card">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">' +
        '<div><div class="bold mb-12">' + p.name + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + bdg(p.priority) + ' ' + badgeIf('badge-purple', p.value) + ' ' + stagePill('planned') + '</div></div>' +
        (D.role === 'admin'
          ? '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">' +
              '<button class="btn btn-success" onclick="activateProject(\'' + p.id + '\')"><i class="ti ti-player-play"></i> Activate</button>' +
              '<button class="btn btn-sm" onclick="openScheduleModal(\'' + p.id + '\')"><i class="ti ti-edit"></i> Edit schedule</button>' +
            '</div>'
          : '') +
      '</div>' +
      '<div class="grid-2 mt-12" style="font-size:13px">' +
        '<div><span class="text-muted">Start: </span>' + (p.plannedStart||'TBD') + '</div>' +
        '<div><span class="text-muted">End: </span>' + (p.end||'TBD') + '</div>' +
        '<div><span class="text-muted">PM: </span>' + (p.owner || '<em style="color:#777">Not assigned</em>') + '</div>' +
        '<div><span class="text-muted">Team: </span>' + p.team.length + ' member' + (p.team.length !== 1 ? 's' : '') + '</div>' +
      '</div>' +
      (soonNoPM ? '<div class="blocker-note" style="background:#FAEEDA;color:#854F0B;margin-top:10px"><i class="ti ti-alert-triangle"></i> <strong>No PM assigned</strong> — this project starts within 30 days. Please assign a PM before activation.</div>' : '') +
    '</div>';
  }).join('');

  var bannerText = 'These projects are <strong>scheduled</strong> with a start date. Activate them when work begins.';

  document.getElementById('content').innerHTML =
    '<div class="info-banner info-blue"><i class="ti ti-calendar-event" style="font-size:20px;flex-shrink:0;color:#185FA5"></i><span>' + bannerText + '</span></div>' +
    (pp.length ? cards : '<div class="empty-state"><i class="ti ti-calendar-event"></i><p>No planned projects yet</p></div>');
}

async function activateProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  // require at least one named resource (not just a team name)
  var hasResource = p.team.some(function(m){ return D.people.indexOf(m) >= 0; });
  if (!hasResource) { showToast('Please assign at least one individual resource before activating', 'error'); openScheduleModal(pid); return; }
  var result = await sb.from('projects').update({ stage: 'active', status: 'On Track' }).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  p.stage = 'active'; p.status = 'On Track';
  var r = D.requests.find(function(x){ return x.id === p.requestId; });
  if (r) await syncRequestStatus(r.id, { status: 'Active' });
  showToast('"' + p.name + '" is now active'); renderNav();
  if (currentPage === 'planned') pgPlanned(); else pgProjects();
}

// ── Active Projects ───────────────────────────────────────────────────────────

function pgProjects() {
  var addBtn = D.role === 'admin' ? '<button class="btn btn-primary" onclick="openNewProjectModal()"><i class="ti ti-plus"></i> New project</button>' : '';
  tb('Active projects', addBtn);
  var ps = myProjects().filter(function(p){ return p.stage === 'active'; });
  var cards = ps.map(function(p) {
    return '<div class="project-card">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">' +
        '<div style="flex:1"><div class="bold mb-12">' + hdot(p.health) + p.name + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + bdg(p.status) + ' ' + bdg(p.priority) + ' ' + badgeIf('badge-gray', p.phase) + ' ' + badgeIf('badge-purple', p.value) + '</div></div>' +
        '<div style="display:flex;gap:8px;flex-shrink:0">' +
          '<button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>' +
          (canEdit(p) ? '<button class="btn btn-sm" onclick="editProject(\'' + p.id + '\')"><i class="ti ti-edit"></i> Edit</button>' : '') +
        '</div>' +
      '</div>' +
      '<div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:12px;color:#777;margin-bottom:4px"><span>Progress</span><span>' + p.progress + '%</span></div>' +
      '<div class="progress-bar"><div class="progress-fill" style="width:' + p.progress + '%"></div></div></div>' +
      '<div class="grid-2 mt-12" style="font-size:12px;color:#777"><div>PM: ' + (p.owner||'—') + ' &bull; Due ' + (p.end||'TBD') + '</div><div>' + p.team.length + ' team member' + (p.team.length!==1?'s':'') + '</div></div>' +
      (p.blockers ? '<div class="blocker-note"><i class="ti ti-alert-triangle"></i> ' + p.blockers + '</div>' : '') +
    '</div>';
  }).join('');
  document.getElementById('content').innerHTML = ps.length ? cards : '<div class="empty-state"><i class="ti ti-briefcase"></i><p>No active projects</p></div>';
}

// ── Completed ─────────────────────────────────────────────────────────────────

function pgCompleted() {
  tb('Completed projects');
  var cp = D.projects.filter(function(p){ return p.stage === 'complete'; });
  if (!cp.length) { document.getElementById('content').innerHTML = '<div class="empty-state"><i class="ti ti-circle-check"></i><p>No completed projects yet</p></div>'; return; }
  var rows = cp.map(function(p) {
    return '<tr><td class="bold">' + p.name + '</td><td>' + badgeIf('badge-purple', p.value) + '</td>' +
      '<td>' + bdg(p.priority) + '</td><td class="text-muted">' + (p.owner||'—') + '</td><td class="text-muted">' + (p.end||'—') + '</td>' +
      '<td><button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>' +
      (D.role === 'admin' ? ' <button class="btn btn-sm" onclick="reactivateProject(\'' + p.id + '\')"><i class="ti ti-refresh"></i> Re-activate</button>' : '') +
      '</td></tr>';
  }).join('');
  document.getElementById('content').innerHTML =
    '<div class="card"><div class="section-title">Completed projects</div><div class="table-wrap"><table>' +
    '<thead><tr><th>Project</th><th>Value area</th><th>Priority</th><th>PM</th><th>Completed</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></div>';
}

async function reactivateProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var result = await sb.from('projects').update({ stage: 'active', status: 'On Track' }).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  p.stage = 'active'; p.status = 'On Track';
  showToast('"' + p.name + '" re-activated'); renderNav(); pgCompleted();
}

// ── Project Detail ─────────────────────────────────────────────────────────────

function pgProjectDetail(pid, tab) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  if (!p) { nav('projects'); return; }
  tab = tab || 'overview';
  var cameFromMyProjects = currentPage === 'my-projects';
  currentPage = 'projectDetail';
  renderNav();
  var editable = canEdit(p);
  var isComplete = p.stage === 'complete';
  var tbs = ['overview','team','milestones','tasks','raid','documentation'];

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
        '<div><div class="form-label">Value area</div>' + badgeIf('badge-purple', p.value) + '</div>' +
        '<div><div class="form-label">Progress</div><div style="display:flex;align-items:center;gap:8px"><div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:' + p.progress + '%"></div></div><span class="text-muted">' + p.progress + '%</span></div></div>' +
        '<div><div class="form-label">Start</div>' + (p.start||'—') + '</div>' +
        '<div><div class="form-label">Target end</div>' + (p.end||'—') + '</div>' +
        '<div><div class="form-label">Category</div>' + (p.category ? '<span class="badge badge-blue">' + p.category + '</span>' : '<span class="text-muted">—</span>') + '</div>' +
        '<div><div class="form-label">Business unit</div>' + (p.businessUnit || '—') + '</div>' +
        '</div>' +
        '<div class="form-group"><div class="form-label">Description</div><div style="font-size:13px;line-height:1.6">' + (p.description||'') + '</div></div>' +
        '<div class="grid-2 mb-16">' +
        '<div class="form-group"><div class="form-label">Sponsor</div>' + (p.sponsor||'—') + '</div>' +
        '<div class="form-group"><div class="form-label">PM</div>' + (p.owner||'—') + '</div>' +
        '</div>' +
        (p.blockers ? '<div class="blocker-note"><i class="ti ti-alert-triangle"></i> <strong>Blocker:</strong> ' + p.blockers + '</div>' : '') +
        (p.stage === 'hold' ? '<div class="blocker-note" style="background:#FBE7E3;border-left-color:#993C1D"><i class="ti ti-player-pause"></i> <strong>On hold:</strong> ' + (p.holdReason||'') + '</div>' : '') +
        '<div class="form-group" style="margin-top:16px"><div class="form-label">Timeline</div>' + timelineHtml() +
        '<button class="btn btn-sm mt-12" onclick="window.switchPTab(\'milestones\')"><i class="ti ti-list"></i> View milestones</button></div>' +
        (editable && !isComplete ? '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e8e8e5;display:flex;justify-content:flex-end;gap:8px">' +
          '<button class="btn btn-primary" onclick="closeModal();editProject(\'' + p.id + '\')"><i class="ti ti-edit"></i> Edit project</button>' +
          (p.stage === 'hold'
            ? '<button class="btn btn-success" onclick="resumeFromHold(\'' + p.id + '\')"><i class="ti ti-player-play"></i> Resume</button>'
            : ((p.stage === 'active' || p.stage === 'planned') ? '<button class="btn" onclick="putOnHold(\'' + p.id + '\')"><i class="ti ti-player-pause"></i> Put on hold</button>' : '') +
              '<button class="btn btn-success" onclick="markComplete(\'' + p.id + '\')"><i class="ti ti-circle-check"></i> Mark complete</button>'
          ) +
          '</div>' : '');
    }
    if (t === 'team') {
      var candidatePeople = D.people.filter(function(n){ return p.team.indexOf(n) < 0; });
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
            return '<div class="team-add-row" data-name="' + n.toLowerCase() + '" style="display:flex;align-items:center;justify-content:space-between;padding:6px 0"><span style="font-size:13px">' + n + '</span><button class="btn btn-sm" onclick="addTeamMemberDirect(\'' + p.id + '\',\'' + n.replace(/'/g,"\\'") + '\')"><i class="ti ti-plus"></i> Add</button></div>';
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
        '<th class="sortable-th" style="position:relative"><span onclick="setTaskSort(\'' + p.id + '\',\'assignee\')">Assignee ' + arrow('assignee') + '</span>' + filterIcon('assignee', st.fAssignee.length>0) + '</th>' +
        '<th class="sortable-th" style="position:relative"><span onclick="setTaskSort(\'' + p.id + '\',\'status\')">Status ' + arrow('status') + '</span>' + filterIcon('status', st.fStatus.length>0) + '</th>' +
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
    return '';
  }

  var tabsHtml = tbs.map(function(t) {
    return '<div class="tab' + (t === tab ? ' active' : '') + '" id="ptab-' + t + '" onclick="switchPTab(\'' + t + '\')" style="text-transform:capitalize">' + (t === 'raid' ? 'RAID log' : t === 'documentation' ? 'Documentation' : t) + '</div>';
  }).join('');

  tb(p.name, '<button class="btn btn-sm" onclick="nav(\'' + (cameFromMyProjects ? 'my-projects' : 'projects') + '\')"><i class="ti ti-arrow-left"></i> Back to projects</button>');

  document.getElementById('content').innerHTML =
    '<div class="card">' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">' + stagePill(p.stage) + ' ' + bdg(p.status) + ' ' + bdg(p.priority) + '</div>' +
    '<div class="tab-bar">' + tabsHtml + '</div>' +
    '<div id="ptab-content">' + tabC(tab) + '</div>' +
    '</div>';

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
  var result = await sb.from('projects').update({ stage: 'hold', hold_reason: reason, pre_hold_stage: p.stage }).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  p.preHoldStage = p.stage; p.stage = 'hold'; p.holdReason = reason;
  closeModal(); showToast('"' + p.name + '" is now on hold'); renderNav();
  if (currentPage === 'projectDetail') pgProjectDetail(pid, 'overview'); else if (currentPage === 'portfolio') pgPortfolio(); else pgDashboard();
}

async function resumeFromHold(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var resumeStage = p.preHoldStage || 'planned';
  var result = await sb.from('projects').update({ stage: resumeStage, hold_reason: null, pre_hold_stage: null }).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  p.stage = resumeStage; p.holdReason = null; p.preHoldStage = null;
  closeModal(); showToast('"' + p.name + '" resumed'); renderNav();
  if (currentPage === 'projectDetail') pgProjectDetail(pid, 'overview'); else if (currentPage === 'portfolio') pgPortfolio(); else pgDashboard();
}

async function markComplete(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var result = await sb.from('projects').update({ stage: 'complete', status: 'Completed', progress: 100 }).eq('id', pid);
  if (result.error) { showToast('Could not save: ' + result.error.message); return; }
  p.stage = 'complete'; p.status = 'Completed'; p.progress = 100;
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
  var pool = canEdit(p) ? D.people.concat(teamNames()) : p.team;
  if (task && task.assignee && pool.indexOf(task.assignee) < 0) pool = pool.concat([task.assignee]);
  var assigneeOpts = pool.map(function(n){
    var isInactiveCurrent = task && task.assignee === n && D.people.indexOf(n) < 0 && teamNames().indexOf(n) < 0;
    return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (task && task.assignee===n ? ' selected' : '') + '>' + n + (isInactiveCurrent ? ' (deactivated)' : '') + '</option>';
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
  var ownerPool = p.team.filter(function(m){ return D.people.indexOf(m) >= 0; });
  if (item && item.owner && ownerPool.indexOf(item.owner) < 0) ownerPool = ownerPool.concat([item.owner]);
  var ownerOpts = '<option value="">— Select —</option>' + ownerPool.map(function(n){
    var isInactiveCurrent = item && item.owner === n && D.people.indexOf(n) < 0;
    return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (item && item.owner===n?' selected':'') + '>' + n + (isInactiveCurrent ? ' (deactivated)' : '') + '</option>';
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
      var nonMembers = D.people.filter(function(n){ return pr2.team.indexOf(n) < 0; });
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
        var newOpts = '<option value="">— Select —</option>' + pr2.team.filter(function(m){ return D.people.indexOf(m)>=0; }).map(function(n){ return '<option>' + n + '</option>'; }).join('') + '<option value="__add__">+ Add member to project…</option>';
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
  var isLink = d ? d.sourceType === 'link' : true;
  var defaultFolder = d ? (d.folder||'General') : (docFolderState[pid] && docFolderState[pid] !== 'All' ? docFolderState[pid] : 'General');
  var folderOpts = p.docFolders.map(function(f){ return '<option' + (defaultFolder===f?' selected':'') + '>' + f + '</option>'; }).join('') + '<option value="__new__">+ New folder…</option>';

  showModal('<div class="modal-title">' + (isEdit?'Edit document':'Add document') + ' <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="grid-2">' +
    '<div class="form-group"><div class="form-label">Document type</div><select id="dm-cat">' + catOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Folder</div><select id="dm-folder" onchange="handleDocFolderChange(\'' + pid + '\')">' + folderOpts + '</select></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Name *</div><input type="text" id="dm-name" value="' + (d ? d.name : '') + '" placeholder="e.g. Project Charter v1"></div>' +
    '<div class="form-group"><div class="form-label">Source</div>' +
      '<div class="radio-row">' +
        '<label><input type="radio" name="dm-src" value="link"' + (isLink ? ' checked' : '') + ' onchange="toggleDocSource()"> External link (Jira, SharePoint, etc.)</label>' +
        '<label><input type="radio" name="dm-src" value="file"' + (!isLink ? ' checked' : '') + ' onchange="toggleDocSource()"> Upload file</label>' +
      '</div>' +
      '<div id="dm-link-row"><input type="text" id="dm-url" value="' + (isLink && d ? d.url : '') + '" placeholder="https://…"></div>' +
      '<div id="dm-file-row" style="display:none"><input type="file" id="dm-file"></div>' +
    '</div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="dm-save"><i class="ti ti-check"></i> ' + (isEdit?'Save changes':'Add document') + '</button></div>', true);

  window.toggleDocSource = function() {
    var checkedEl = document.querySelector('input[name="dm-src"]:checked');
    var linkRow = document.getElementById('dm-link-row');
    var fileRow = document.getElementById('dm-file-row');
    if (!checkedEl || !linkRow || !fileRow) return;
    var src = checkedEl.value;
    linkRow.style.display = src === 'link' ? 'block' : 'none';
    fileRow.style.display = src === 'file' ? 'block' : 'none';
  };
  setTimeout(function(){ if (window.toggleDocSource) window.toggleDocSource(); }, 0);

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
    var src = document.querySelector('input[name="dm-src"]:checked').value;
    var url = '';
    if (src === 'link') {
      url = document.getElementById('dm-url').value.trim();
      if (!url) { showToast('Enter a link URL'); return; }
    } else {
      var fileEl = document.getElementById('dm-file');
      if (fileEl.files && fileEl.files[0]) url = URL.createObjectURL(fileEl.files[0]);
      else if (isEdit && d.sourceType === 'file') url = d.url;
      else { showToast('Choose a file to upload'); return; }
    }
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
  var statusOpts = STATUSES.map(function(s){ return '<option' + (p.status===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var phaseOpts  = PHASES.map(function(s){   return '<option' + (p.phase===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var priorOpts  = PRIORITIES.map(function(s){ return '<option' + (p.priority===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var valOpts    = VALUE_AREAS.map(function(s){ return '<option' + (p.value===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var ownerPoolEdit = p.owner && D.people.indexOf(p.owner) < 0 ? D.people.concat([p.owner]) : D.people;
  var ownerOpts     = '<option value="">— None —</option>' + ownerPoolEdit.map(function(n){
    var isInactiveCurrent = p.owner===n && D.people.indexOf(n) < 0;
    return '<option value="' + n.replace(/"/g,'&quot;') + '"' + (p.owner===n?' selected':'') + '>' + n + (isInactiveCurrent ? ' (deactivated)' : '') + '</option>';
  }).join('');
  var catOpts    = '<option value="">— None —</option>' + CATEGORIES.map(function(s){ return '<option' + (p.category===s?' selected':'') + '>' + s + '</option>'; }).join('');
  var buOpts     = '<option value="">— None —</option>' + BUSINESS_UNITS.map(function(s){ return '<option' + (p.businessUnit===s?' selected':'') + '>' + s + '</option>'; }).join('');
  showModal('<div class="modal-title">Edit project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Project name</div><input type="text" id="ep-name" value="' + p.name + '"></div>' +
    '<div class="grid-2">' +
      '<div class="form-group"><div class="form-label">Status</div><select id="ep-status">' + statusOpts + '</select></div>' +
      '<div class="form-group"><div class="form-label">Phase</div><select id="ep-phase">' + phaseOpts + '</select></div>' +
      '<div class="form-group"><div class="form-label">Priority</div><select id="ep-priority">' + priorOpts + '</select></div>' +
      '<div class="form-group"><div class="form-label">Value area</div><select id="ep-value">' + valOpts + '</select></div>' +
      '<div class="form-group"><div class="form-label">Start date</div><input type="date" id="ep-start" value="' + p.start + '"></div>' +
      '<div class="form-group"><div class="form-label">Target end</div><input type="date" id="ep-end" value="' + p.end + '"></div>' +
      '<div class="form-group"><div class="form-label">Progress (%)</div><input type="number" id="ep-progress" value="' + p.progress + '" min="0" max="100"></div>' +
      '<div class="form-group"><div class="form-label">Health</div><select id="ep-health"><option value="green"' + (p.health==='green'?' selected':'') + '>Green</option><option value="amber"' + (p.health==='amber'?' selected':'') + '>Amber</option><option value="red"' + (p.health==='red'?' selected':'') + '>Red</option></select></div>' +
      '<div class="form-group"><div class="form-label">Category</div><select id="ep-category">' + catOpts + '</select></div>' +
      '<div class="form-group"><div class="form-label">Business unit</div><select id="ep-bu">' + buOpts + '</select></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="ep-desc">' + (p.description||'') + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">Current blocker (leave blank if none)</div><input type="text" id="ep-blocker" value="' + (p.blockers||'') + '"></div>' +
    '<div class="divider"></div>' +
    '<div class="grid-2">' +
    '<div class="form-group"><div class="form-label">Sponsor name</div><input type="text" id="ep-sponsor" value="' + (p.sponsor||'') + '"></div>' +
    '<div class="form-group"><div class="form-label">Sponsor email' + (p.sponsorId ? ' <i class="ti ti-link" title="Linked to a real account" style="color:#1D9E75;font-size:12px"></i>' : '') + '</div><input type="email" id="ep-sponsor-email" value="' + (p.sponsorEmail||'') + '"></div>' +
    '<div class="form-group"><div class="form-label">Project manager</div><select id="ep-owner">' + ownerOpts + '</select></div>' +
    '</div>' +
    '<div class="modal-footer">' +
      (D.role === 'admin' ? '<button class="btn btn-danger" onclick="deleteProject(\'' + p.id + '\')"><i class="ti ti-trash"></i> Delete</button>' : '') +
      '<button class="btn" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="saveProject(\'' + p.id + '\')"><i class="ti ti-check"></i> Save changes</button>' +
    '</div>', true);
}

async function saveProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var newVals = {
    name: document.getElementById('ep-name').value,
    status: document.getElementById('ep-status').value,
    phase: document.getElementById('ep-phase').value,
    priority: document.getElementById('ep-priority').value,
    value_area: document.getElementById('ep-value').value,
    start_date: document.getElementById('ep-start').value || null,
    end_date: document.getElementById('ep-end').value || null,
    progress: parseInt(document.getElementById('ep-progress').value) || 0,
    health: document.getElementById('ep-health').value,
    description: document.getElementById('ep-desc').value,
    blockers: document.getElementById('ep-blocker').value
  };
  var catEl = document.getElementById('ep-category'); if (catEl) newVals.category = catEl.value || null;
  var buEl = document.getElementById('ep-bu'); if (buEl) newVals.business_unit = buEl.value || null;
  var spEl = document.getElementById('ep-sponsor'); if (spEl) newVals.sponsor = spEl.value || null;
  var spEmailEl = document.getElementById('ep-sponsor-email'); if (spEmailEl) newVals.sponsor_email = spEmailEl.value.trim() || null;
  var pmEl = document.getElementById('ep-owner');
  var ownerResource = pmEl ? resolveResource(pmEl.value) : null;
  if (pmEl) { newVals.owner_id = ownerResource ? ownerResource.id : null; newVals.owner_name = pmEl.value || null; }

  var saveBtn = document.querySelector('.modal-footer .btn-primary'); if (saveBtn) saveBtn.disabled = true;
  var result = await sb.from('projects').update(newVals).eq('id', pid).select().single();
  if (result.error) { showToast('Could not save: ' + result.error.message); if (saveBtn) saveBtn.disabled = false; return; }

  p.name = newVals.name; p.status = newVals.status; p.phase = newVals.phase; p.priority = newVals.priority;
  p.value = newVals.value_area; p.start = newVals.start_date; p.end = newVals.end_date; p.progress = newVals.progress;
  p.health = newVals.health; p.description = newVals.description; p.blockers = newVals.blockers;
  if (catEl) p.category = newVals.category;
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
  if (currentPage === 'projectDetail') nav('projects'); else if (currentPage==='projects') pgProjects(); else pgDashboard();
}

function openNewProjectModal() {
  var valOpts = VALUE_AREAS.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  var priorOpts = PRIORITIES.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  var ownerOpts = '<option value="">— None —</option>' + D.people.map(function(n){ return '<option>' + n + '</option>'; }).join('');
  var catOpts = '<option value="">— None —</option>' + CATEGORIES.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  var buOpts = '<option value="">— None —</option>' + BUSINESS_UNITS.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  showModal('<div class="modal-title">Create new project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Project name *</div><input type="text" id="np-name" placeholder="Project name"></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Value area</div><select id="np-value">' + valOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Priority</div><select id="np-priority">' + priorOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Category</div><select id="np-category">' + catOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Business unit</div><select id="np-bu">' + buOpts + '</select></div></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="np-desc" placeholder="What is this project about?"></textarea></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Sponsor name</div><input type="text" id="np-sponsor" placeholder="Sponsor name"></div>' +
    '<div class="form-group"><div class="form-label">Sponsor email</div><input type="email" id="np-sponsor-email" placeholder="name@yourcompany.com"></div>' +
    '<div class="form-group"><div class="form-label">Project manager</div><select id="np-owner">' + ownerOpts + '</select></div></div>' +
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

    var record = {
      name: name, owner_id: ownerResource ? ownerResource.id : null, owner_name: ownerName || null,
      sponsor: sponsorName || null, sponsor_email: sponsorEmail || null,
      category: document.getElementById('np-category').value || null, business_unit: document.getElementById('np-bu').value || null,
      status: 'Not Started', phase: 'Not Started', progress: 0,
      value_area: document.getElementById('np-value').value, priority: document.getElementById('np-priority').value,
      description: document.getElementById('np-desc').value, blockers: '', health: 'green', stage: 'active'
    };
    var result = await sb.from('projects').insert(record).select().single();
    if (result.error) { showToast('Could not save: ' + result.error.message); btn.disabled = false; return; }

    D.projects.push({
      id: result.data.id, name:name, owner:ownerName, ownerId: ownerResource?ownerResource.id:null,
      sponsor:sponsorName, sponsorEmail:sponsorEmail, sponsorId: result.data.sponsor_id,
      category:record.category, businessUnit:record.business_unit, team:[], teamIds:[],
      status:'Not Started', phase:'Not Started', progress:0, start:'', end:'',
      value:record.value_area, priority:record.priority, description:record.description,
      blockers:'', health:'green', stage:'active', plannedStart:'', requestId:'',
      milestones:[], tasks:[], raid:{risks:[],assumptions:[],issues:[],dependencies:[]},
      documents:[], docFolders:['General'], docFolderIds:{}
    });
    closeModal(); showToast('Project created'); pgProjects();
  };
}

// ── Roadmap ────────────────────────────────────────────────────────────────────

function pgRoadmap() {
  tb('Roadmap');
  var windowStart = new Date(); windowStart.setDate(1); windowStart.setHours(0,0,0,0);
  var windowMonths = 12;
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
  var categoriesPresent = [];
  var hasUncategorized = false;
  all.forEach(function(p){
    if (p.category) { if (categoriesPresent.indexOf(p.category) < 0) categoriesPresent.push(p.category); }
    else hasUncategorized = true;
  });
  var tabList = ['All'].concat(categoriesPresent).concat(hasUncategorized ? ['Uncategorized'] : []);
  if (tabList.indexOf(roadmapCategoryFilter) < 0) roadmapCategoryFilter = 'All';
  var categoryTabsHtml = '<div class="tab-bar" style="margin-bottom:16px">' + tabList.map(function(c) {
    return '<div class="tab' + (roadmapCategoryFilter === c ? ' active' : '') + '" onclick="setRoadmapCategory(\'' + c.replace(/'/g,"\\'") + '\')">' + c + '</div>';
  }).join('') + '</div>';

  var visibleProjects = roadmapCategoryFilter === 'All' ? all : all.filter(function(p){ return (p.category || 'Uncategorized') === roadmapCategoryFilter; });

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
    visibleProjects.forEach(function(p){ var key = p.category || 'Uncategorized'; (groups[key] = groups[key] || []).push(p); });
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
      msItems.push({ project:p.name, milestone:m.name, due:m.date, status:'Upcoming', category: p.category || 'Uncategorized' });
    });
  });
  if (roadmapCategoryFilter !== 'All') {
    msItems = msItems.filter(function(it){ return it.category === roadmapCategoryFilter; });
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
    '<th class="sortable-th" style="position:relative"><span onclick="setMsSort(\'project\')">Project ' + msArrow('project') + '</span>' + msFilterIcon('fProject', st.fProject.length>0) + '</th>' +
    '<th class="sortable-th" onclick="setMsSort(\'milestone\')">Milestone ' + msArrow('milestone') + '</th>' +
    '<th class="sortable-th" onclick="setMsSort(\'due\')">Due ' + msArrow('due') + '</th>' +
    '<th class="sortable-th" style="position:relative"><span onclick="setMsSort(\'status\')">Status ' + msArrow('status') + '</span>' + msFilterIcon('fStatus', st.fStatus.length>0) + '</th>' +
    '</tr>';
  document.getElementById('content').innerHTML =
    categoryTabsHtml +
    '<div class="card mb-16"><div class="section-title" style="margin-bottom:20px">12-month view — ' + rangeLabel + '</div>' +
    phaseLegend +
    '<div style="display:flex;gap:8px;margin-bottom:10px;padding-left:202px">' + monthLabels.map(function(m){ return '<div style="flex:1;font-size:11px;color:#999;text-align:center">' + m + '</div>'; }).join('') + '</div>' +
    timelineBody + '</div>' +
    '<div class="card"><div class="section-title">Upcoming milestones</div>' + msSearchBar +
    (msItems.length
      ? (msList.length ? '<div class="table-wrap"><table><thead>' + msHeader + '</thead><tbody>' + msRows + '</tbody></table></div>' : '<div class="empty-state" style="padding:24px"><i class="ti ti-search"></i><p>No milestones match your filters</p></div>')
      : '<div class="empty-state" style="padding:24px"><i class="ti ti-flag"></i><p>No upcoming milestones</p></div>') +
    '</div>';

  window.setRoadmapCategory = function(cat) { roadmapCategoryFilter = cat; pgRoadmap(); };
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

  var categoryRaw = row['Category'];
  var category = categoryRaw ? matchOneOf(categoryRaw, CATEGORIES) : null;
  if (category === undefined) errors.push('Category "' + categoryRaw + '" is not a recognized category');

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

  var ownerEmail = String(row['PM Email'] || '').trim().toLowerCase();
  var ownerResource = ownerEmail ? profilesByEmail[ownerEmail] : null;

  return {
    valid: errors.length === 0,
    errors: errors,
    record: {
      name: name,
      sponsor: row['Sponsor'] || null,
      owner_id: ownerResource ? ownerResource.id : null,
      owner_name: ownerResource ? ownerResource.name : (ownerEmail || null),
      category: category || null,
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
      health: 'green'
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
      '<td style="color:#A32D2D;font-size:12px">' + (v.errors.join('; ') || '') + '</td>' +
      '</tr>';
  }).join('');

  document.getElementById('import-preview').innerHTML =
    '<div class="info-banner ' + (validCount === rows.length ? 'info-blue' : 'info-blue') + '" style="margin-bottom:14px">' +
      '<i class="ti ti-info-circle"></i><div>' + validCount + ' of ' + rows.length + ' rows are ready to import' +
      (validCount < rows.length ? '. Rows with errors will be skipped — fix them in your spreadsheet and re-upload if you want them included.' : '.') +
      '</div></div>' +
    '<div class="table-wrap"><table><thead><tr><th></th><th>Project Name</th><th>Stage</th><th>PM</th><th>Issues</th></tr></thead><tbody>' + tableRows + '</tbody></table></div>' +
    (validCount > 0 ? '<button class="btn btn-primary mt-12" id="confirm-import-btn"><i class="ti ti-upload"></i> Import ' + validCount + ' project' + (validCount===1?'':'s') + '</button>' : '');

  if (validCount > 0) {
    document.getElementById('confirm-import-btn').onclick = runImport;
  }
}

async function runImport() {
  var btn = document.getElementById('confirm-import-btn');
  btn.disabled = true; btn.textContent = 'Importing…';

  var validated = importState.rows.map(function(r){ return validateImportRow(r, importState.profilesByEmail); });
  var records = validated.filter(function(v){ return v.valid; }).map(function(v){ return v.record; });

  var result = await sb.from('projects').insert(records);
  if (result.error) {
    showToast('Import failed: ' + result.error.message);
    btn.disabled = false; btn.textContent = 'Import ' + records.length + ' projects';
    return;
  }
  showToast(records.length + ' project' + (records.length===1?'':'s') + ' imported');
  importState = { rows: null, profilesByEmail: null };
  await refreshProjects();
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
    if (st.sort === 'projects') { av = a.projects.length; bv = b.projects.length; }
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
    var names = r.projects.map(function(pid){ var p = D.projects.find(function(x){ return x.id===pid; }); return p ? { id:p.id, name:p.name } : null; }).filter(Boolean);
    var body = names.length
      ? names.map(function(p){ return '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0"><span>' + p.name + '</span><button class="btn btn-sm" onclick="goToProject(\'' + p.id + '\')"><i class="ti ti-eye"></i></button></div>'; }).join('')
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
      var linkIcon = r.userId ? '<i class="ti ti-link" title="Linked to a real account" style="color:#1D9E75"></i>' : '<i class="ti ti-link-off" title="Not linked yet" style="color:#ccc"></i>';
      return '<tr>' +
        '<td class="bold">' + (r.firstName||'') + '</td>' +
        '<td class="bold">' + (r.lastName||'') + '</td>' +
        '<td class="text-muted">' + (r.role||'—') + '</td>' +
        '<td style="text-align:center">' + linkIcon + '</td>' +
        '<td class="text-muted">' + (r.teamName||'—') + '</td>' +
        '<td><button class="btn btn-sm" onclick="toggleResourceExpand(\'' + r.id + '\')">' + r.projects.length + ' <i class="ti ' + (st.expandedId===r.id?'ti-chevron-up':'ti-chevron-down') + '"></i></button></td>' +
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
      return '<tr>' +
        '<td class="bold">' + r.name + '</td>' +
        '<td class="text-muted">' + (r.managerName||'—') + '</td>' +
        '<td class="text-muted">' + (r.members||[]).length + '</td>' +
        '<td><button class="btn btn-sm" onclick="toggleResourceExpand(\'' + r.id + '\')">' + r.projects.length + ' <i class="ti ' + (st.expandedId===r.id?'ti-chevron-up':'ti-chevron-down') + '"></i></button></td>' +
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
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="er-save"><i class="ti ti-check"></i> Save changes</button></div>');
  document.getElementById('er-save').onclick = function(){ return saveResource(rid); };
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
  tb('Submit a request');
  var valOpts = VALUE_AREAS.map(function(v){ return '<option>' + v + '</option>'; }).join('');
  document.getElementById('content').innerHTML =
    '<div class="card" style="max-width:660px;margin:0 auto">' +
    '<div class="section-title mb-16">New project request</div>' +
    '<div class="form-group"><div class="form-label">Project title *</div><input type="text" id="f-title" placeholder="e.g. Customer onboarding redesign"></div>' +
    '<div class="grid-2">' +
      '<div class="form-group"><div class="form-label">Department</div><select id="f-dept"><option>Marketing</option><option>Operations</option><option>HR</option><option>Sales</option><option>Product</option><option>Finance</option><option>Technology</option></select></div>' +
      '<div class="form-group"><div class="form-label">Priority</div><select id="f-priority"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></div>' +
    '</div><div class="grid-2">' +
      '<div class="form-group"><div class="form-label">Value area</div><select id="f-value">' + valOpts + '</select></div>' +
      '<div class="form-group"><div class="form-label">Effort</div><select id="f-effort"><option value="S">S — days</option><option value="M">M — weeks</option><option value="L">L — 1–3 months</option><option value="XL">XL — 3+ months</option></select></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Estimated cost ($) *</div><div class="form-sub">Numbers only — do not include $ or commas</div><input type="text" id="f-cost" placeholder="e.g. 50000"><div id="f-cost-err" style="color:#A32D2D;font-size:12px;margin-top:4px;display:none">Please enter a valid number (digits only)</div></div>' +
    '<div class="form-group"><div class="form-label">Business description *</div><div class="form-sub">What is the problem or opportunity?</div><textarea id="f-desc" rows="4" placeholder="Describe the situation and why this project is needed…"></textarea></div>' +
    '<div class="form-group"><div class="form-label">Impact &amp; value proposition *</div><div class="form-sub">What measurable outcomes do you expect?</div><textarea id="f-impact" rows="3" placeholder="e.g. Reduce support tickets by 25%, saving ~$80k annually…"></textarea></div>' +
    '<div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" id="f-submit"><i class="ti ti-send"></i> Submit request</button></div></div>';

  document.getElementById('f-cost').addEventListener('input', function() {
    var v = this.value.replace(/[^0-9]/g,'');
    this.value = v;
    document.getElementById('f-cost-err').style.display = 'none';
  });

  document.getElementById('f-submit').onclick = async function() {
    var title  = document.getElementById('f-title').value.trim();
    var desc   = document.getElementById('f-desc').value.trim();
    var impact = document.getElementById('f-impact').value.trim();
    var costRaw= document.getElementById('f-cost').value.trim();
    var errEl  = document.getElementById('f-cost-err');
    if (!title||!desc||!impact) { showToast('Please fill in all required fields','error'); return; }
    if (!costRaw || isNaN(Number(costRaw)) || costRaw === '') { errEl.style.display='block'; return; }
    errEl.style.display = 'none';
    var btn = document.getElementById('f-submit'); btn.disabled = true;
    var record = {
      title: title, submitter_id: D.currentProfile.id, submitter_name: currentUser() || 'Current User',
      dept: document.getElementById('f-dept').value, priority: document.getElementById('f-priority').value,
      value_area: document.getElementById('f-value').value, impact: impact, description: desc,
      effort: document.getElementById('f-effort').value, cost: Number(costRaw), status: 'Pending'
    };
    var result = await sb.from('requests').insert(record).select().single();
    if (result.error) { showToast('Could not submit: ' + result.error.message); btn.disabled = false; return; }
    D.requests.push({
      id: result.data.id, title: title, submitter: record.submitter_name, submitterId: D.currentProfile.id,
      dept: record.dept, date: result.data.submitted_at, status: 'Pending', priority: record.priority,
      value: record.value_area, impact: impact, description: desc, effort: record.effort, cost: record.cost, feedback: ''
    });
    showToast('Request submitted successfully');
    renderNav();
    nav('my-requests');
  };
}

// ── Stakeholder: My Requests ────────────────────────────────────────────────────

function pgMyRequests() {
  tb('My requests');
  var me = currentUser() || 'Current User';
  var mine = D.requests.filter(function(r){ return r.submitter === me; });
  var myNotifs = D.notifications.filter(function(n){ return n.submitter === me; });
  var html = '';
  if (myNotifs.length) html += myNotifs.map(function(n){
    return '<div class="notif-banner"><i class="ti ti-bell" style="font-size:20px;flex-shrink:0"></i><div><div style="font-weight:600;margin-bottom:3px">' + (n.type==='planned'?'Project scheduled':n.type==='approved'?'Request approved':'Update') + '</div>' + n.msg + '</div></div>';
  }).join('');
  if (!mine.length) { html += '<div class="empty-state"><i class="ti ti-inbox"></i><p>No requests yet</p></div>'; document.getElementById('content').innerHTML = html; return; }
  html += '<div class="card"><div class="table-wrap"><table><thead><tr><th>Title</th><th>Date</th><th>Priority</th><th>Status</th><th>Cost</th><th>PMO feedback</th><th></th></tr></thead><tbody>' +
    mine.map(function(r) {
      var canRevoke = r.status === 'Pending';
      var linkedP = r.linkedProject ? D.projects.find(function(p){ return p.id === r.linkedProject; }) : null;
      return '<tr><td class="bold">' + r.title + '</td><td class="text-muted">' + r.date + '</td><td>' + bdg(r.priority) + '</td><td>' + bdg(r.status) + '</td><td class="text-muted">' + fmtCost(r.cost) + '</td>' +
        '<td style="font-size:12px;color:#777;max-width:180px;word-break:break-word">' + (r.feedback||'—') + '</td>' +
        '<td><div style="display:flex;gap:4px">' +
        (linkedP ? '<button class="btn btn-sm" onclick="viewLinkedProject(\'' + linkedP.id + '\')"><i class="ti ti-eye"></i></button>' : '') +
        (canRevoke ? '<button class="btn btn-sm btn-danger" onclick="revokeRequest(\'' + r.id + '\')"><i class="ti ti-x"></i> Revoke</button>' : '') +
        '</div></td></tr>';
    }).join('') + '</tbody></table></div></div>';
  document.getElementById('content').innerHTML = html;
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
  tb('My projects');
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
        '<div>PM: ' + (p.owner||'—') + '</div><div>Due: ' + (p.end||'TBD') + '</div>' +
        '<div>My tasks: ' + doneTasks + '/' + myTasks.length + ' done</div>' +
      '</div>' +
      (p.blockers ? '<div class="blocker-note"><i class="ti ti-alert-triangle"></i> ' + p.blockers + '</div>' : '') +
    '</div>';
  }).join('');
  document.getElementById('content').innerHTML = cards;
}

function pgMyTasks() {
  tb('My tasks');
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
          '<th class="sortable-th" style="position:relative"><span onclick="setMyTasksSort(\'project\')">Project ' + arrow('project') + '</span>' + filterIcon('fProject', projectChoices) + '</th>' +
          '<th class="sortable-th" style="position:relative"><span onclick="setMyTasksSort(\'status\')">Status ' + arrow('status') + '</span>' + filterIcon('fStatus', statusChoices) + '</th>' +
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
  tb('My capacity');
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
  D.previewRole = null;
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