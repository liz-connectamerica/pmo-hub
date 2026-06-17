// ── Helpers ────────────────────────────────────────────────────────────────

function pendingCount() { return D.requests.filter(function(r){ return r.status === 'Pending'; }).length; }
function backlogCount()  { return D.projects.filter(function(p){ return p.stage  === 'backlog'; }).length; }

function myProjects() {
  if (D.role === 'pm')       return D.projects.filter(function(p){ return p.pm === currentUser(); });
  if (D.role === 'resource') return D.projects.filter(function(p){ return p.team.indexOf(currentUser()) >= 0; });
  return D.projects;
}

function currentUser() {
  var map = { pm:'Alex Turner', resource:'Jordan Lee', stakeholder:'Sarah Chen' };
  return map[D.role] || '';
}

function canEdit(p) {
  if (D.role === 'admin') return true;
  if (D.role === 'pm')    return p.pm === currentUser();
  return false;
}

function fmtCost(n) {
  if (!n && n !== 0) return '—';
  return '$' + Number(n).toLocaleString();
}

function bdg(s) {
  var map = {
    'On Track':'badge-teal','At Risk':'badge-amber','Planning':'badge-blue','Blocked':'badge-red','Complete':'badge-green','Completed':'badge-green','Not Started':'badge-gray',
    'Pending':'badge-amber','Approved':'badge-teal','Rejected':'badge-red','Backlog':'badge-amber','Active':'badge-teal','Planned':'badge-blue','Revoked':'badge-gray',
    'Done':'badge-teal','In Progress':'badge-purple','To Do':'badge-gray',
    'Open':'badge-red','Closed':'badge-teal',
    'Critical':'badge-red','High':'badge-coral','Medium':'badge-amber','Low':'badge-blue'
  };
  return '<span class="badge ' + (map[s] || 'badge-gray') + '">' + s + '</span>';
}

function hdot(h) {
  var c = { green:'#1D9E75', amber:'#EF9F27', red:'#E24B4A' }[h] || '#ccc';
  return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + c + ';margin-right:6px;vertical-align:middle"></span>';
}

function stagePill(s) {
  var m = { backlog:{bg:'#FAEEDA',c:'#633806',l:'Backlog'}, planned:{bg:'#E6F1FB',c:'#0C447C',l:'Planned'}, active:{bg:'#E1F5EE',c:'#085041',l:'Active'}, complete:{bg:'#f0ede8',c:'#444',l:'Completed'} };
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
    '<div class="modal-overlay" id="mov" onclick="if(event.target.id===\'mov\')closeModal()">' +
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
    ]}
  ],
  pm: [
    { s:'Overview',    items:[{id:'dashboard',icon:'ti-layout-dashboard',label:'Dashboard'}] },
    { s:'My Projects', items:[
      {id:'projects', icon:'ti-briefcase',      label:'Active projects'},
      {id:'planned',  icon:'ti-calendar-event', label:'Planned'},
      {id:'completed',icon:'ti-circle-check',   label:'Completed'},
      {id:'roadmap',  icon:'ti-road',           label:'Roadmap'},
      {id:'resources',icon:'ti-users',          label:'Resources'}
    ]}
  ],
  stakeholder: [
    { s:'Requests', items:[
      {id:'submit',       icon:'ti-send',  label:'Submit a request'},
      {id:'my-requests',  icon:'ti-clock', label:'My requests'}
    ]}
  ],
  exec: [
    { s:'Overview', items:[
      {id:'dashboard', icon:'ti-layout-dashboard',label:'Dashboard'},
      {id:'portfolio', icon:'ti-folder-open',     label:'Portfolio'},
      {id:'completed', icon:'ti-circle-check',    label:'Completed'},
      {id:'roadmap',   icon:'ti-road',            label:'Roadmap'},
      {id:'resources', icon:'ti-users',           label:'Resources'}
    ]}
  ],
  resource: [
    { s:'My Work', items:[
      {id:'my-projects', icon:'ti-briefcase',      label:'My projects'},
      {id:'my-tasks',    icon:'ti-check',          label:'My tasks'},
      {id:'my-capacity', icon:'ti-adjustments',    label:'My capacity'}
    ]}
  ]
};

function renderNav() {
  var defs = NAV_DEF[D.role] || [];
  var h = '';
  defs.forEach(function(sec) {
    h += '<div class="sidebar-section">' + sec.s + '</div>';
    sec.items.forEach(function(item) {
      var cnt = item.badge === 'pending' ? pendingCount() : item.badge === 'backlog' ? backlogCount() : 0;
      var badge = cnt > 0 ? '<span class="nav-badge">' + cnt + '</span>' : '';
      h += '<div class="nav-item' + (currentPage === item.id ? ' active' : '') + '" onclick="nav(\'' + item.id + '\')">' +
           '<i class="ti ' + item.icon + '"></i>' + item.label + badge + '</div>';
    });
  });
  document.getElementById('nav-menu').innerHTML = h;
}

function nav(page) {
  currentPage = page; renderNav();
  var map = {
    dashboard:pgDashboard, portfolio:pgPortfolio, requests:pgRequests,
    backlog:pgBacklog, planned:pgPlanned, projects:pgProjects,
    completed:pgCompleted, roadmap:pgRoadmap, resources:pgResources,
    submit:pgSubmit, 'my-requests':pgMyRequests,
    'my-projects':pgMyProjectsResource, 'my-tasks':pgMyTasks, 'my-capacity':pgMyCapacity
  };
  if (map[page]) map[page]();
}

function setRole(r) {
  D.role = r;
  var def = { admin:'dashboard', pm:'dashboard', stakeholder:'submit', exec:'dashboard', resource:'my-projects' };
  renderNav(); nav(def[r]);
}

// ── Dashboard ───────────────────────────────────────────────────────────────

function pgDashboard() {
  tb('Dashboard');
  var ps = myProjects();
  var active = ps.filter(function(p){ return p.stage === 'active'; });
  var onT = active.filter(function(p){ return p.status === 'On Track'; }).length;
  var atR = active.filter(function(p){ return p.status === 'At Risk';  }).length;

  var projRows = active.map(function(p) {
    return '<tr>' +
      '<td class="bold">' + p.name + '</td><td>' + bdg(p.status) + '</td><td>' + bdg(p.priority) + '</td>' +
      '<td><span class="badge badge-gray">' + p.phase + '</span></td>' +
      '<td><div style="display:flex;align-items:center;gap:8px"><div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:' + p.progress + '%"></div></div><span class="text-muted">' + p.progress + '%</span></div></td>' +
      '<td class="text-muted">' + (p.pm || '—') + '</td>' +
      '<td>' + (p.blockers ? '<span style="color:#993C1D;font-size:12px"><i class="ti ti-alert-triangle"></i> Yes</span>' : '<span class="text-muted">—</span>') + '</td>' +
      '<td><button class="btn btn-sm" onclick="openProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button></td></tr>';
  }).join('');

  var pendRows = '';
  if (D.role === 'admin') {
    D.requests.filter(function(r){ return r.status === 'Pending'; }).forEach(function(r) {
      pendRows += '<tr><td class="bold">' + r.title + '</td><td>' + r.submitter + '</td><td>' + r.dept + '</td>' +
        '<td>' + bdg(r.priority) + '</td><td><span class="badge badge-purple">' + r.value + '</span></td>' +
        '<td><button class="btn btn-sm" onclick="reviewRequest(\'' + r.id + '\')"><i class="ti ti-eye"></i> Review</button></td></tr>';
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
    '<div class="card mb-16"><div class="section-title">Active projects</div><div class="table-wrap"><table>' +
      '<thead><tr><th>Project</th><th>Status</th><th>Priority</th><th>Phase</th><th style="min-width:160px">Progress</th><th>PM</th><th>Blockers</th><th></th></tr></thead>' +
      '<tbody>' + projRows + '</tbody></table></div></div>' +
    (D.role === 'admin' && pendingCount() > 0
      ? '<div class="card"><div class="section-title">Pending approval <span class="badge badge-amber" style="margin-left:6px">' + pendingCount() + '</span></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Title</th><th>Submitter</th><th>Dept</th><th>Priority</th><th>Value area</th><th></th></tr></thead>' +
        '<tbody>' + pendRows + '</tbody></table></div></div>' : '');
}

// ── Portfolio ───────────────────────────────────────────────────────────────

function pgPortfolio() {
  tb('Portfolio');
  var byVal = {};
  D.projects.filter(function(p){ return p.stage !== 'complete'; }).forEach(function(p){ if (!byVal[p.value]) byVal[p.value] = []; byVal[p.value].push(p); });
  var cols = ['badge-purple','badge-teal','badge-blue','badge-coral','badge-amber'];
  var i = 0, h = '';
  Object.keys(byVal).forEach(function(v) {
    var cl = cols[i++ % cols.length];
    var cards = byVal[v].map(function(p) {
      return '<div class="card card-sm" style="cursor:pointer;border:1px solid #e8e8e5;border-radius:10px" onclick="openProject(\'' + p.id + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px"><span class="bold" style="font-size:13px">' + p.name + '</span>' + stagePill(p.stage) + '</div>' +
        '<div class="text-muted mb-12" style="line-height:1.5">' + p.description + '</div>' +
        '<div class="progress-bar mb-12"><div class="progress-fill" style="width:' + p.progress + '%"></div></div>' +
        '<div style="display:flex;justify-content:space-between"><span class="text-muted">' + (p.pm || 'No PM') + '</span><span class="text-muted">' + (p.end || 'TBD') + '</span></div></div>';
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
    html += '<div class="divider"></div><div class="form-label" style="margin-bottom:10px">Linked project</div>' +
      '<div style="background:#f5f5f3;padding:12px 16px;border-radius:8px;font-size:13px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span class="bold">' + linkedP.name + '</span>' + stagePill(linkedP.stage) + '</div>' +
        '<div class="grid-2" style="gap:8px 16px;font-size:12px">' +
          '<div><span class="text-muted">Status: </span>' + bdg(linkedP.status) + '</div>' +
          '<div><span class="text-muted">Phase: </span><span class="badge badge-gray">' + linkedP.phase + '</span></div>' +
          '<div><span class="text-muted">PM: </span>' + (linkedP.pm || '—') + '</div>' +
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

function decideReq(id, decision) {
  var r  = D.requests.find(function(x){ return x.id === id; });
  var fb = document.getElementById('rfb');
  r.feedback = fb ? fb.value : r.feedback;
  r.status   = decision;
  if (decision === 'Approved') {
    var p = { id:'p'+Date.now(), name:r.title, pm:'', team:[], status:'Not Started', phase:'Not Started', progress:0, start:'', end:'', value:r.value, priority:r.priority, description:r.description, blockers:'', health:'green', stage:'backlog', plannedStart:'', requestId:r.id, milestones:[], tasks:[], raid:{risks:[],assumptions:[],issues:[],dependencies:[]} };
    D.projects.push(p);
    r.status = 'Backlog'; r.linkedProject = p.id;
    addNotif(r.submitter, 'Your request "' + r.title + '" has been approved and added to the backlog.', 'approved');
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
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + bdg(p.priority) + ' <span class="badge badge-purple">' + p.value + '</span> ' + stagePill('backlog') + '</div></div>' +
        (D.role === 'admin' ? '<button class="btn btn-primary" onclick="openScheduleModal(\'' + p.id + '\')"><i class="ti ti-calendar-plus"></i> Schedule</button>' : '') +
      '</div>' +
      '<div class="text-muted mt-12">' + p.description + '</div>' +
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
  var pmOpts = '<option value="">— None (assign later) —</option>' + ALL_PEOPLE.map(function(n){ return '<option value="' + n + '"' + (p.pm === n ? ' selected' : '') + '>' + n + '</option>'; }).join('');
  var memberOpts = ALL_PEOPLE.concat(ALL_TEAMS).map(function(n) {
    var isTeam = ALL_TEAMS.indexOf(n) >= 0;
    var chk = p.team.indexOf(n) >= 0 ? ' checked' : '';
    return '<label class="member-check"><input type="checkbox" id="schm-' + n.replace(/ /g,'_') + '"' + chk + '> ' + n + (isTeam ? ' <span class="badge badge-blue" style="font-size:10px">Team</span>' : '') + '</label>';
  }).join('');
  showModal(
    '<div class="modal-title">Schedule project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div style="font-weight:600;margin-bottom:16px;color:#534AB7">' + p.name + '</div>' +
    '<div class="form-group"><div class="form-label">Project manager</div><select id="sch-pm">' + pmOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Team members</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' + memberOpts + '</div></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Planned start *</div><input type="date" id="sch-start" value="' + (p.plannedStart||'') + '"></div>' +
    '<div class="form-group"><div class="form-label">Target end *</div><input type="date" id="sch-end" value="' + (p.end||'') + '"></div></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="scheduleProject(\'' + p.id + '\')"><i class="ti ti-calendar-check"></i> Save changes</button></div>', true);
}

function scheduleProject(pid) {
  var p     = D.projects.find(function(x){ return x.id === pid; });
  var start = document.getElementById('sch-start').value;
  var end   = document.getElementById('sch-end').value;
  if (!start || !end) { showToast('Please set a start and end date'); return; }
  var allNames = ALL_PEOPLE.concat(ALL_TEAMS);
  p.team = allNames.filter(function(n){ var el = document.getElementById('schm-' + n.replace(/ /g,'_')); return el && el.checked; });
  p.pm = document.getElementById('sch-pm').value;
  p.plannedStart = start; p.start = start; p.end = end; p.stage = 'planned';
  var r = D.requests.find(function(x){ return x.id === p.requestId; });
  if (r) { r.status = 'Planned'; r.linkedProject = pid; }
  addNotif(r ? r.submitter : '', 'Great news! "' + p.name + '" has been scheduled to start on ' + start + (p.pm ? '. PM: ' + p.pm : '') + '.', 'planned');
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
    var soonNoPM  = !p.pm && startDate && startDate <= in30;
    return '<div class="project-card">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">' +
        '<div><div class="bold mb-12">' + p.name + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + bdg(p.priority) + ' <span class="badge badge-purple">' + p.value + '</span> ' + stagePill('planned') + '</div></div>' +
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
        '<div><span class="text-muted">PM: </span>' + (p.pm || '<em style="color:#777">Not assigned</em>') + '</div>' +
        '<div><span class="text-muted">Team: </span>' + p.team.length + ' member' + (p.team.length !== 1 ? 's' : '') + '</div>' +
      '</div>' +
      (soonNoPM ? '<div class="blocker-note" style="background:#FAEEDA;color:#854F0B;margin-top:10px"><i class="ti ti-alert-triangle"></i> <strong>No PM assigned</strong> — this project starts within 30 days. Please assign a PM before activation.</div>' : '') +
    '</div>';
  }).join('');

  var bannerText = D.role === 'pm'
    ? 'These projects are <strong>scheduled</strong> with a start date assigned.'
    : 'These projects are <strong>scheduled</strong> with a start date. Activate them when work begins.';

  document.getElementById('content').innerHTML =
    '<div class="info-banner info-blue"><i class="ti ti-calendar-event" style="font-size:20px;flex-shrink:0;color:#185FA5"></i><span>' + bannerText + '</span></div>' +
    (pp.length ? cards : '<div class="empty-state"><i class="ti ti-calendar-event"></i><p>No planned projects yet</p></div>');
}

function activateProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  // require at least one named resource (not just a team name)
  var hasResource = p.team.some(function(m){ return ALL_PEOPLE.indexOf(m) >= 0; });
  if (!hasResource) { showToast('Please assign at least one individual resource before activating', 'error'); openScheduleModal(pid); return; }
  p.stage = 'active'; p.status = 'On Track';
  var r = D.requests.find(function(x){ return x.id === p.requestId; });
  if (r) r.status = 'Active';
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
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + bdg(p.status) + ' ' + bdg(p.priority) + ' <span class="badge badge-gray">' + p.phase + '</span> <span class="badge badge-purple">' + p.value + '</span></div></div>' +
        '<div style="display:flex;gap:8px;flex-shrink:0">' +
          '<button class="btn btn-sm" onclick="openProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>' +
          (canEdit(p) ? '<button class="btn btn-sm" onclick="editProject(\'' + p.id + '\')"><i class="ti ti-edit"></i> Edit</button>' : '') +
        '</div>' +
      '</div>' +
      '<div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:12px;color:#777;margin-bottom:4px"><span>Progress</span><span>' + p.progress + '%</span></div>' +
      '<div class="progress-bar"><div class="progress-fill" style="width:' + p.progress + '%"></div></div></div>' +
      '<div class="grid-2 mt-12" style="font-size:12px;color:#777"><div>PM: ' + (p.pm||'—') + ' &bull; Due ' + (p.end||'TBD') + '</div><div>' + p.team.length + ' team member' + (p.team.length!==1?'s':'') + '</div></div>' +
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
    return '<tr><td class="bold">' + p.name + '</td><td><span class="badge badge-purple">' + p.value + '</span></td>' +
      '<td>' + bdg(p.priority) + '</td><td class="text-muted">' + (p.pm||'—') + '</td><td class="text-muted">' + (p.end||'—') + '</td>' +
      '<td><button class="btn btn-sm" onclick="openProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>' +
      (D.role === 'admin' ? ' <button class="btn btn-sm" onclick="reactivateProject(\'' + p.id + '\')"><i class="ti ti-refresh"></i> Re-activate</button>' : '') +
      '</td></tr>';
  }).join('');
  document.getElementById('content').innerHTML =
    '<div class="card"><div class="section-title">Completed projects</div><div class="table-wrap"><table>' +
    '<thead><tr><th>Project</th><th>Value area</th><th>Priority</th><th>PM</th><th>Completed</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></div>';
}

function reactivateProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  p.stage = 'active'; p.status = 'On Track';
  showToast('"' + p.name + '" re-activated'); renderNav(); pgCompleted();
}

// ── Project Detail ─────────────────────────────────────────────────────────────

function openProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var editable = canEdit(p);
  var isComplete = p.stage === 'complete';
  var tbs = ['overview','milestones','tasks','raid'];

  function sortedMilestones() {
    return p.milestones.slice().sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  function tabC(t) {
    if (t === 'overview') {
      var teamHtml = p.team.length
        ? p.team.map(function(m,i){ var isTeam = ALL_TEAMS.indexOf(m) >= 0; var ini = m.split(' ').map(function(x){ return x[0]; }).join(''); return '<div class="team-chip">' + (isTeam ? '<i class="ti ti-users" style="font-size:13px;color:#185FA5"></i>' : '<div class="avatar ' + AV_COLS[i%AV_COLS.length] + '">' + ini + '</div>') + '<span style="font-size:12px">' + m + '</span></div>'; }).join('')
        : '<span class="text-muted">No team assigned</span>';
      return '<div class="grid-2 mb-16">' +
        '<div><div class="form-label">Stage</div>' + stagePill(p.stage) + '</div>' +
        '<div><div class="form-label">Status</div>' + bdg(p.status) + '</div>' +
        '<div><div class="form-label">Phase</div><span class="badge badge-gray">' + p.phase + '</span></div>' +
        '<div><div class="form-label">Priority</div>' + bdg(p.priority) + '</div>' +
        '<div><div class="form-label">Value area</div><span class="badge badge-purple">' + p.value + '</span></div>' +
        '<div><div class="form-label">Progress</div><div style="display:flex;align-items:center;gap:8px"><div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:' + p.progress + '%"></div></div><span class="text-muted">' + p.progress + '%</span></div></div>' +
        '<div><div class="form-label">Start</div>' + (p.start||'—') + '</div>' +
        '<div><div class="form-label">Target end</div>' + (p.end||'—') + '</div>' +
        '</div>' +
        '<div class="form-group"><div class="form-label">Description</div><div style="font-size:13px;line-height:1.6">' + p.description + '</div></div>' +
        '<div class="form-group"><div class="form-label">PM</div>' + (p.pm||'—') + '</div>' +
        '<div class="form-group"><div class="form-label">Team</div><div style="display:flex;gap:8px;flex-wrap:wrap">' + teamHtml + '</div></div>' +
        (p.blockers ? '<div class="blocker-note"><i class="ti ti-alert-triangle"></i> <strong>Blocker:</strong> ' + p.blockers + '</div>' : '') +
        (editable && !isComplete ? '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e8e8e5;display:flex;justify-content:flex-end;gap:8px">' +
          '<button class="btn btn-primary" onclick="closeModal();editProject(\'' + p.id + '\')"><i class="ti ti-edit"></i> Edit project</button>' +
          '<button class="btn btn-success" onclick="markComplete(\'' + p.id + '\')"><i class="ti ti-circle-check"></i> Mark complete</button>' +
          '</div>' : '');
    }
    if (t === 'milestones') {
      var sorted = sortedMilestones();
      var rows = sorted.map(function(m) {
        var idx = p.milestones.indexOf(m);
        return '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f0ede8">' +
          '<i class="ti ' + (m.done ? 'ti-circle-check' : 'ti-circle-dotted') + '" style="font-size:22px;color:' + (m.done ? '#1D9E75' : '#ccc') + ';' + (editable ? 'cursor:pointer' : '') + '"' +
          (editable ? ' onclick="toggleMS(\'' + p.id + '\',' + idx + ')"' : '') + '></i>' +
          '<div style="flex:1"><div style="font-size:13px' + (m.done ? ';text-decoration:line-through;color:#999' : '') + '">' + m.name + '</div></div>' +
          '<div class="text-muted" style="white-space:nowrap">' + m.date + '</div>' +
          (editable ? '<button class="btn btn-sm btn-danger" onclick="deleteMS(\'' + p.id + '\',' + idx + ')"><i class="ti ti-trash"></i></button>' : '') + '</div>';
      }).join('');
      return (editable ? '<button class="btn btn-primary btn-sm mb-12" onclick="openAddMilestone(\'' + p.id + '\')"><i class="ti ti-plus"></i> Add milestone</button>' : '') +
        (sorted.length ? rows : '<div class="empty-state" style="padding:30px"><i class="ti ti-circle-dotted"></i><p>No milestones yet</p></div>');
    }
    if (t === 'tasks') {
      var isResource = D.role === 'resource';
      var trows = p.tasks.map(function(task, idx) {
        var myTask = isResource && task.assignee === currentUser();
        return '<tr><td style="white-space:normal;word-break:break-word">' + task.title + '</td><td>' + task.assignee + '</td><td>' + bdg(task.status) + '</td><td class="text-muted">' + task.due + '</td>' +
          '<td><div style="display:flex;gap:4px">' +
          (editable ? '<button class="btn btn-sm" onclick="openEditTask(\'' + p.id + '\',' + idx + ')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteTask(\'' + p.id + '\',' + idx + ')"><i class="ti ti-trash"></i></button>' : '') +
          (myTask && task.status !== 'Done' ? '<button class="btn btn-sm btn-success" onclick="completeMyTask(\'' + p.id + '\',' + idx + ')"><i class="ti ti-check"></i> Done</button>' : '') +
          '</div></td></tr>';
      }).join('');
      return (editable ? '<button class="btn btn-primary btn-sm mb-12" onclick="openAddTask(\'' + p.id + '\')"><i class="ti ti-plus"></i> Add task</button>' : '') +
        (p.tasks.length
          ? '<table><thead><tr><th>Task</th><th>Assignee</th><th>Status</th><th>Due</th><th></th></tr></thead><tbody>' + trows + '</tbody></table>'
          : '<div class="empty-state" style="padding:30px"><i class="ti ti-check"></i><p>No tasks yet</p></div>');
    }
    if (t === 'raid') {
      function rSection(label, items, type) {
        var isGrid = type === 'risks' || type === 'issues';
        var addBtn = editable ? '<button class="btn btn-sm btn-primary" onclick="openAddRaid(\'' + p.id + '\',\'' + type + '\')"><i class="ti ti-plus"></i> Add</button>' : '';
        var header = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="bold">' + label + '</div>' + addBtn + '</div>';
        if (!items.length) return header + '<div class="text-muted" style="font-size:12px;margin-bottom:12px">None logged</div><div class="divider"></div>';
        var body;
        if (type === 'risks') {
          body = '<div style="display:grid;grid-template-columns:90px 1fr 110px 36px;gap:10px;padding:6px 0;border-bottom:1px solid #e8e8e5;font-size:11px;font-weight:600;color:#777"><div>Severity</div><div>Description &amp; Mitigation</div><div>Owner</div><div></div></div>' +
            items.map(function(item, idx) {
              return '<div style="display:grid;grid-template-columns:90px 1fr 110px 36px;gap:10px;padding:10px 0;border-bottom:1px solid #f0ede8;align-items:start">' +
                '<div>' + bdg(item.severity) + '</div>' +
                '<div><div style="font-size:13px;word-break:break-word;white-space:normal;margin-bottom:4px">' + item.desc + '</div>' +
                '<div style="font-size:12px;color:#555;word-break:break-word;white-space:normal;background:#f5f5f3;padding:6px 8px;border-radius:6px;line-height:1.5">' + (item.mitigation||'—') + '</div></div>' +
                '<div style="font-size:12px;color:#777;word-break:break-word">' + item.owner + '</div>' +
                (editable ? '<div><button class="btn btn-sm btn-danger" onclick="deleteRaid(\'' + p.id + '\',\'' + type + '\',' + idx + ')"><i class="ti ti-trash"></i></button></div>' : '<div></div>') + '</div>';
            }).join('');
        } else if (type === 'issues') {
          body = '<div style="display:grid;grid-template-columns:90px 1fr 110px 90px 36px;gap:10px;padding:6px 0;border-bottom:1px solid #e8e8e5;font-size:11px;font-weight:600;color:#777"><div>Severity</div><div>Description</div><div>Owner</div><div>Status</div><div></div></div>' +
            items.map(function(item, idx) {
              return '<div style="display:grid;grid-template-columns:90px 1fr 110px 90px 36px;gap:10px;padding:10px 0;border-bottom:1px solid #f0ede8;align-items:start">' +
                '<div>' + bdg(item.severity) + '</div><div style="font-size:13px;word-break:break-word;white-space:normal">' + item.desc + '</div>' +
                '<div style="font-size:12px;color:#777">' + item.owner + '</div><div>' + bdg(item.status) + '</div>' +
                (editable ? '<div><button class="btn btn-sm btn-danger" onclick="deleteRaid(\'' + p.id + '\',\'' + type + '\',' + idx + ')"><i class="ti ti-trash"></i></button></div>' : '<div></div>') + '</div>';
            }).join('');
        } else {
          body = items.map(function(item, idx) {
            return '<div style="font-size:13px;padding:10px 0;border-bottom:1px solid #f0ede8;display:flex;justify-content:space-between;align-items:center;gap:8px;word-break:break-word">' +
              '<div style="flex:1">' + item.desc + (item.owner ? ' <span class="text-muted">— ' + item.owner + '</span>' : '') + (item.status ? ' ' + bdg(item.status) : '') + '</div>' +
              (editable ? '<button class="btn btn-sm btn-danger" onclick="deleteRaid(\'' + p.id + '\',\'' + type + '\',' + idx + ')"><i class="ti ti-trash"></i></button>' : '') + '</div>';
          }).join('');
        }
        return header + body + '<div class="divider"></div>';
      }
      return rSection('Risks', p.raid.risks, 'risks') + rSection('Assumptions', p.raid.assumptions, 'assumptions') + rSection('Issues', p.raid.issues, 'issues') + rSection('Dependencies', p.raid.dependencies, 'dependencies');
    }
    return '';
  }

  var tabsHtml = tbs.map(function(t) {
    return '<div class="tab' + (t === 'overview' ? ' active' : '') + '" id="ptab-' + t + '" onclick="switchPTab(\'' + t + '\')" style="text-transform:capitalize">' + (t === 'raid' ? 'RAID log' : t) + '</div>';
  }).join('');

  showModal(
    '<div class="modal-title"><div><div style="margin-bottom:8px">' + p.name + '</div><div style="display:flex;gap:6px;flex-wrap:wrap">' + stagePill(p.stage) + ' ' + bdg(p.status) + ' ' + bdg(p.priority) + '</div></div>' +
    '<button class="btn btn-sm" style="flex-shrink:0" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="tab-bar">' + tabsHtml + '</div>' +
    '<div id="ptab-content">' + tabC('overview') + '</div>', true);

  window.switchPTab = function(t) { tbs.forEach(function(x){ var e = document.getElementById('ptab-' + x); if (e) e.className = 'tab' + (x===t?' active':''); }); document.getElementById('ptab-content').innerHTML = tabC(t); };
  window.toggleMS   = function(pid2,idx){ var pr=D.projects.find(function(x){return x.id===pid2;}); pr.milestones[idx].done=!pr.milestones[idx].done; document.getElementById('ptab-content').innerHTML=tabC('milestones'); };
  window.deleteMS   = function(pid2,idx){ var pr=D.projects.find(function(x){return x.id===pid2;}); pr.milestones.splice(idx,1); document.getElementById('ptab-content').innerHTML=tabC('milestones'); };
  window.deleteTask = function(pid2,idx){ var pr=D.projects.find(function(x){return x.id===pid2;}); pr.tasks.splice(idx,1); document.getElementById('ptab-content').innerHTML=tabC('tasks'); };
  window.deleteRaid = function(pid2,type,idx){ var pr=D.projects.find(function(x){return x.id===pid2;}); pr.raid[type].splice(idx,1); document.getElementById('ptab-content').innerHTML=tabC('raid'); };
  window.completeMyTask = function(pid2,idx){ var pr=D.projects.find(function(x){return x.id===pid2;}); pr.tasks[idx].status='Done'; document.getElementById('ptab-content').innerHTML=tabC('tasks'); showToast('Task marked complete'); };
  window.openAddMilestone = function(pid2){ openMilestoneModal(pid2); };
  window.openAddTask      = function(pid2){ openTaskModal(pid2, null); };
  window.openEditTask     = function(pid2,idx){ openTaskModal(pid2, idx); };
  window.openAddRaid      = function(pid2,type){ openRaidModal(pid2, type); };
}

function markComplete(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  p.stage = 'complete'; p.status = 'Completed'; p.progress = 100;
  var r = D.requests.find(function(x){ return x.id === p.requestId; });
  if (r) r.status = 'Active';
  closeModal(); showToast('"' + p.name + '" marked as complete'); renderNav();
  if (currentPage === 'projects') pgProjects(); else pgDashboard();
}

// ── Milestone / Task / RAID modals ─────────────────────────────────────────────

function openMilestoneModal(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  showModal('<div class="modal-title">Add milestone <button class="btn btn-sm" onclick="openProject(\'' + pid + '\')"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Milestone name *</div><input type="text" id="ms-name" placeholder="e.g. Design approved"></div>' +
    '<div class="form-group"><div class="form-label">Target date *</div><input type="date" id="ms-date"></div>' +
    '<div class="modal-footer"><button class="btn" onclick="openProject(\'' + pid + '\')">Cancel</button>' +
    '<button class="btn btn-primary" id="ms-save"><i class="ti ti-check"></i> Add milestone</button></div>');
  document.getElementById('ms-save').onclick = function() {
    var name = document.getElementById('ms-name').value.trim(); var date = document.getElementById('ms-date').value;
    if (!name||!date){ showToast('Fill in name and date'); return; }
    p.milestones.push({name:name,date:date,done:false});
    showToast('Milestone added'); openProject(pid); setTimeout(function(){ window.switchPTab('milestones'); },50);
  };
}

function openTaskModal(pid, idx) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var task = idx != null ? p.tasks[idx] : null;
  // only project members + all people for admin/pm
  var pool = canEdit(p) ? ALL_PEOPLE.concat(ALL_TEAMS) : p.team;
  var assigneeOpts = pool.map(function(n){ return '<option' + (task && task.assignee===n ? ' selected' : '') + '>' + n + '</option>'; }).join('');
  showModal('<div class="modal-title">' + (task?'Edit task':'Add task') + ' <button class="btn btn-sm" onclick="openProject(\'' + pid + '\')"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Task title *</div><input type="text" id="tm-title" value="' + (task?task.title:'') + '" placeholder="Task name"></div>' +
    '<div class="form-group"><div class="form-label">Assignee</div><select id="tm-assignee">' + assigneeOpts + '</select></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Status</div><select id="tm-status">' +
      '<option' + (!task||task.status==='To Do'?' selected':'') + '>To Do</option>' +
      '<option' + (task&&task.status==='In Progress'?' selected':'') + '>In Progress</option>' +
      '<option' + (task&&task.status==='Done'?' selected':'') + '>Done</option></select></div>' +
    '<div class="form-group"><div class="form-label">Due date</div><input type="date" id="tm-due" value="' + (task?task.due:'') + '"></div></div>' +
    '<div class="modal-footer"><button class="btn" onclick="openProject(\'' + pid + '\')">Cancel</button>' +
    '<button class="btn btn-primary" id="tm-save"><i class="ti ti-check"></i> ' + (task?'Save changes':'Add task') + '</button></div>');
  document.getElementById('tm-save').onclick = function() {
    var title = document.getElementById('tm-title').value.trim();
    if (!title){ showToast('Task title required'); return; }
    var t2 = {id:'t'+Date.now(),title:title,assignee:document.getElementById('tm-assignee').value,status:document.getElementById('tm-status').value,due:document.getElementById('tm-due').value};
    if (idx!=null) p.tasks[idx]=t2; else p.tasks.push(t2);
    showToast(idx!=null?'Task updated':'Task added'); openProject(pid); setTimeout(function(){ window.switchPTab('tasks'); },50);
  };
}

function openRaidModal(pid, type) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var label = {risks:'Risk',assumptions:'Assumption',issues:'Issue',dependencies:'Dependency'}[type];
  // risk owner: only project members; with option to add
  var ownerPool = p.team.filter(function(m){ return ALL_PEOPLE.indexOf(m) >= 0; });
  var ownerOpts = '<option value="">— Select —</option>' + ownerPool.map(function(n){ return '<option>' + n + '</option>'; }).join('') +
    '<option value="__add__">+ Add member to project…</option>';
  var extra = '';
  if (type === 'risks')        extra = '<div class="grid-2"><div class="form-group"><div class="form-label">Severity</div><select id="rd-sev"><option>High</option><option selected>Medium</option><option>Low</option></select></div><div class="form-group"><div class="form-label">Mitigation</div><textarea id="rd-mit" placeholder="Describe mitigation plan…" rows="3"></textarea></div></div>';
  if (type === 'issues')       extra = '<div class="form-group"><div class="form-label">Severity</div><select id="rd-sev"><option>High</option><option selected>Medium</option><option>Low</option></select></div>';
  if (type === 'dependencies') extra = '<div class="form-group"><div class="form-label">Status</div><select id="rd-depst"><option>Pending</option><option>Active</option><option>Resolved</option></select></div>';
  showModal('<div class="modal-title">Add ' + label + ' <button class="btn btn-sm" onclick="openProject(\'' + pid + '\')"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Description *</div><textarea id="rd-desc" placeholder="Describe this ' + label.toLowerCase() + '…"></textarea></div>' +
    '<div class="form-group"><div class="form-label">Owner</div><select id="rd-owner" onchange="handleOwnerChange(\'' + pid + '\')">' + ownerOpts + '</select></div>' +
    extra +
    '<div class="modal-footer"><button class="btn" onclick="openProject(\'' + pid + '\')">Cancel</button>' +
    '<button class="btn btn-primary" id="rd-save"><i class="ti ti-check"></i> Add ' + label + '</button></div>');

  window.handleOwnerChange = function(pid2) {
    var sel = document.getElementById('rd-owner');
    if (sel.value === '__add__') {
      var pr2 = D.projects.find(function(x){ return x.id === pid2; });
      var nonMembers = ALL_PEOPLE.filter(function(n){ return pr2.team.indexOf(n) < 0; });
      var chosen = prompt('Select person to add to project:\n' + nonMembers.map(function(n,i){ return (i+1)+'. '+n; }).join('\n') + '\n\nEnter number:');
      var num = parseInt(chosen);
      if (num && nonMembers[num-1]) {
        pr2.team.push(nonMembers[num-1]);
        addNotif(nonMembers[num-1], 'You have been added to project "' + pr2.name + '".', 'team');
        showToast(nonMembers[num-1] + ' added to project');
        // rebuild the select
        var newOpts = '<option value="">— Select —</option>' + pr2.team.filter(function(m){ return ALL_PEOPLE.indexOf(m)>=0; }).map(function(n){ return '<option>' + n + '</option>'; }).join('') + '<option value="__add__">+ Add member to project…</option>';
        sel.innerHTML = newOpts;
      } else {
        sel.value = '';
      }
    }
  };

  document.getElementById('rd-save').onclick = function() {
    var desc = document.getElementById('rd-desc').value.trim();
    if (!desc){ showToast('Description required'); return; }
    var owner = document.getElementById('rd-owner').value;
    if (owner === '__add__') owner = '';
    if (type==='risks')        p.raid.risks.push({id:'ri'+Date.now(),desc:desc,severity:document.getElementById('rd-sev').value,owner:owner,mitigation:document.getElementById('rd-mit').value});
    else if (type==='assumptions')  p.raid.assumptions.push({id:'a'+Date.now(),desc:desc,owner:owner});
    else if (type==='issues')       p.raid.issues.push({id:'i'+Date.now(),desc:desc,severity:document.getElementById('rd-sev').value,owner:owner,status:'Open'});
    else if (type==='dependencies') p.raid.dependencies.push({id:'d'+Date.now(),desc:desc,owner:owner,status:document.getElementById('rd-depst').value});
    showToast(label + ' added'); openProject(pid); setTimeout(function(){ window.switchPTab('raid'); },50);
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
  var pmOpts     = '<option value="">— None —</option>' + ALL_PEOPLE.map(function(n){ return '<option' + (p.pm===n?' selected':'') + '>' + n + '</option>'; }).join('');
  var memberOpts = ALL_PEOPLE.concat(ALL_TEAMS).map(function(n) {
    var isTeam = ALL_TEAMS.indexOf(n) >= 0;
    return '<label class="member-check"><input type="checkbox" id="ep-tm-' + n.replace(/ /g,'_') + '"' + (p.team.indexOf(n)>=0?' checked':'') + '> ' + n + (isTeam?' <span class="badge badge-blue" style="font-size:10px">Team</span>':'') + '</label>';
  }).join('');
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
    '</div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="ep-desc">' + p.description + '</textarea></div>' +
    '<div class="form-group"><div class="form-label">Current blocker (leave blank if none)</div><input type="text" id="ep-blocker" value="' + p.blockers + '"></div>' +
    '<div class="divider"></div>' +
    '<div class="form-group"><div class="form-label">Project manager</div><select id="ep-pm">' + pmOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Team members</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' + memberOpts + '</div></div>' +
    '<div class="modal-footer">' +
      (D.role === 'admin' ? '<button class="btn btn-danger" onclick="deleteProject(\'' + p.id + '\')"><i class="ti ti-trash"></i> Delete</button>' : '') +
      '<button class="btn" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="saveProject(\'' + p.id + '\')"><i class="ti ti-check"></i> Save changes</button>' +
    '</div>', true);
}

function saveProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  p.name = document.getElementById('ep-name').value;
  p.status = document.getElementById('ep-status').value;
  p.phase = document.getElementById('ep-phase').value;
  p.priority = document.getElementById('ep-priority').value;
  p.value = document.getElementById('ep-value').value;
  p.start = document.getElementById('ep-start').value;
  p.end = document.getElementById('ep-end').value;
  p.progress = parseInt(document.getElementById('ep-progress').value) || 0;
  p.health = document.getElementById('ep-health').value;
  p.description = document.getElementById('ep-desc').value;
  p.blockers = document.getElementById('ep-blocker').value;
  var pmEl = document.getElementById('ep-pm'); if (pmEl) p.pm = pmEl.value;
  var allNames = ALL_PEOPLE.concat(ALL_TEAMS);
  p.team = allNames.filter(function(n){ var el = document.getElementById('ep-tm-' + n.replace(/ /g,'_')); return el && el.checked; });
  closeModal(); showToast('Project saved');
  if (currentPage==='projects') pgProjects(); else pgDashboard();
}

function deleteProject(pid) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  D.projects = D.projects.filter(function(x){ return x.id !== pid; });
  closeModal(); showToast('Project deleted'); renderNav();
  if (currentPage==='projects') pgProjects(); else pgDashboard();
}

function openNewProjectModal() {
  var valOpts = VALUE_AREAS.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  var priorOpts = PRIORITIES.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  var pmOpts = '<option value="">— None —</option>' + ALL_PEOPLE.map(function(n){ return '<option>' + n + '</option>'; }).join('');
  showModal('<div class="modal-title">Create new project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Project name *</div><input type="text" id="np-name" placeholder="Project name"></div>' +
    '<div class="grid-2"><div class="form-group"><div class="form-label">Value area</div><select id="np-value">' + valOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Priority</div><select id="np-priority">' + priorOpts + '</select></div></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="np-desc" placeholder="What is this project about?"></textarea></div>' +
    '<div class="form-group"><div class="form-label">Project manager</div><select id="np-pm">' + pmOpts + '</select></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="np-save"><i class="ti ti-plus"></i> Create project</button></div>');
  document.getElementById('np-save').onclick = function() {
    var name = document.getElementById('np-name').value.trim();
    if (!name){ showToast('Project name required'); return; }
    D.projects.push({id:'p'+Date.now(),name:name,pm:document.getElementById('np-pm').value,team:[],status:'Not Started',phase:'Not Started',progress:0,start:'',end:'',value:document.getElementById('np-value').value,priority:document.getElementById('np-priority').value,description:document.getElementById('np-desc').value,blockers:'',health:'green',stage:'active',plannedStart:'',requestId:'',milestones:[],tasks:[],raid:{risks:[],assumptions:[],issues:[],dependencies:[]}});
    closeModal(); showToast('Project created'); pgProjects();
  };
}

// ── Roadmap ────────────────────────────────────────────────────────────────────

function pgRoadmap() {
  tb('Roadmap');
  var months = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
  var colors = {p1:'#534AB7',p2:'#1D9E75',p3:'#EF9F27',p4:'#D85A30'};
  var offsets = {p1:0,p2:2,p3:3,p4:3.5};
  var durs = {p1:6,p2:6,p3:4,p4:8.5};
  var all = D.projects.filter(function(p){ return p.stage==='active'||p.stage==='planned'; });
  var bars = all.map(function(p) {
    return '<div class="tl-row"><div class="tl-label" title="' + p.name + '">' + p.name + '</div>' +
      '<div class="tl-wrap"><div class="tl-bar" style="left:' + ((offsets[p.id]||0)/12*100) + '%;width:' + ((durs[p.id]||3)/12*100) + '%;background:' + (colors[p.id]||'#534AB7') + '">' + p.phase + '</div></div></div>';
  }).join('');
  var msRows = [];
  D.projects.filter(function(p){ return p.stage==='active'; }).forEach(function(p) {
    p.milestones.filter(function(m){ return !m.done; }).slice(0,2).forEach(function(m) {
      msRows.push('<tr><td class="bold">' + p.name + '</td><td>' + m.name + '</td><td class="text-muted">' + m.date + '</td><td><span class="badge badge-amber">Upcoming</span></td></tr>');
    });
  });
  document.getElementById('content').innerHTML =
    '<div class="card mb-16"><div class="section-title" style="margin-bottom:20px">12-month view — Apr 2025 – Mar 2026</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:10px;padding-left:202px">' + months.map(function(m){ return '<div style="flex:1;font-size:11px;color:#999;text-align:center">' + m + '</div>'; }).join('') + '</div>' +
    (all.length ? bars : '<div class="text-muted">No active or planned projects</div>') + '</div>' +
    '<div class="card"><div class="section-title">Upcoming milestones</div><div class="table-wrap"><table><thead><tr><th>Project</th><th>Milestone</th><th>Due</th><th>Status</th></tr></thead><tbody>' + msRows.join('') + '</tbody></table></div></div>';
}

// ── Resources ──────────────────────────────────────────────────────────────────

function pgResources() {
  tb('Resources & capacity', D.role==='admin' ? '<button class="btn btn-primary" onclick="openManageResources()"><i class="ti ti-settings"></i> Manage resources</button>' : '');
  var over = D.resources.filter(function(r){ return r.allocated>=100; }).length;
  var warn = D.resources.filter(function(r){ return r.allocated>=80&&r.allocated<100; }).length;

  var rows = D.resources.map(function(r) {
    var pct = r.allocated;
    var nonPct = r.nonProjectCapacity || 0;
    var c = pct>=100?'#E24B4A':pct>=80?'#EF9F27':'#1D9E75';
    var ini = r.name.split(' ').map(function(x){ return x[0]; }).join('');
    var projs = r.projects.map(function(pid){ var p=D.projects.find(function(x){ return x.id===pid; }); return p?p.name:pid; }).join(', ');
    // capacity bar: show project allocation + non-project separately (exec sees both)
    var showNonProject = D.role === 'exec' || D.role === 'admin';
    var barHtml = '<div style="height:10px;background:#f0ede8;border-radius:5px;overflow:hidden;display:flex">' +
      '<div style="height:100%;background:' + c + ';width:' + Math.min(pct,100) + '%;border-radius:5px 0 0 5px;flex-shrink:0"></div>' +
      (showNonProject && nonPct > 0 && (pct+nonPct)<=100 ? '<div style="height:100%;background:#b0abe0;width:' + nonPct + '%;flex-shrink:0"></div>' : '') +
      '</div>';
    var labels = '<div style="display:flex;justify-content:space-between;font-size:12px;color:#777;margin-bottom:4px">' +
      '<span>' + (projs||'Unassigned') + '</span>' +
      '<span style="display:flex;gap:8px"><span style="font-weight:600;color:' + c + '">' + pct + '% project</span>' +
      (showNonProject && nonPct>0 ? '<span style="color:#534AB7">' + nonPct + '% BAU</span>' : '') + '</span></div>';
    return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
      (r.type==='team' ? '<div style="width:30px;height:30px;border-radius:8px;background:#E6F1FB;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-users" style="font-size:15px;color:#185FA5"></i></div>' : '<div class="avatar av-purple" style="flex-shrink:0">' + ini + '</div>') +
      '<div style="width:175px;min-width:175px"><div style="font-size:13px;font-weight:600">' + r.name + '</div><div class="text-muted">' + r.role + ' &bull; ' + (r.type==='team'?'Team':'Individual') + '</div></div>' +
      '<div style="flex:1">' + labels + barHtml + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('content').innerHTML =
    '<div class="grid-3 mb-16">' +
      '<div class="metric"><div class="metric-label">Total resources</div><div class="metric-value">' + D.resources.length + '</div><div class="metric-sub">' + D.resources.filter(function(r){ return r.type==='team'; }).length + ' teams, ' + D.resources.filter(function(r){ return r.type==='individual'; }).length + ' individuals</div></div>' +
      '<div class="metric"><div class="metric-label">At capacity</div><div class="metric-value" style="color:#A32D2D">' + over + '</div></div>' +
      '<div class="metric"><div class="metric-label">Near capacity</div><div class="metric-value" style="color:#854F0B">' + warn + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="section-title">Capacity by resource</div>' + rows +
    '<div class="divider"></div><div style="display:flex;gap:16px;font-size:12px;color:#777">' +
      '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#1D9E75;margin-right:4px"></span>Project (available)</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#EF9F27;margin-right:4px"></span>Project (near capacity)</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#E24B4A;margin-right:4px"></span>Project (over)</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#b0abe0;margin-right:4px"></span>BAU / non-project</span>' +
    '</div></div>';
}

function openManageResources() {
  var listHtml = D.resources.map(function(r) {
    var memberList = r.type==='team' && r.members ? r.members.join(', ') : '';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0ede8;gap:8px">' +
      '<div><div style="font-size:13px;font-weight:600">' + r.name + '</div>' +
      '<div class="text-muted">' + r.role + ' &bull; ' + (r.type==='team'?'Team':'Individual') + (memberList?' &bull; Members: '+memberList:'') + '</div></div>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="btn btn-sm" onclick="editResource(\'' + r.id + '\')"><i class="ti ti-edit"></i></button>' +
        '<button class="btn btn-sm btn-danger" onclick="deleteResource(\'' + r.id + '\')"><i class="ti ti-trash"></i></button>' +
      '</div></div>';
  }).join('');
  showModal('<div class="modal-title">Manage resources <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div style="margin-bottom:16px">' + listHtml + '</div>' +
    '<div class="divider"></div>' +
    '<div class="bold mb-12">Add new resource</div>' +
    '<div class="grid-2">' +
      '<div class="form-group"><div class="form-label">Name *</div><input type="text" id="nr-name" placeholder="Full name or team name"></div>' +
      '<div class="form-group"><div class="form-label">Role / Title</div><input type="text" id="nr-role" placeholder="e.g. Backend Dev"></div>' +
    '</div>' +
    '<div class="grid-2">' +
      '<div class="form-group"><div class="form-label">Type</div><select id="nr-type"><option value="individual">Individual</option><option value="team">Team</option></select></div>' +
      '<div class="form-group"><div class="form-label">Capacity (%)</div><input type="number" id="nr-alloc" value="0" min="0" max="100"></div>' +
    '</div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button>' +
    '<button class="btn btn-primary" id="nr-save"><i class="ti ti-plus"></i> Add resource</button></div>', true);
  document.getElementById('nr-save').onclick = function() {
    var name = document.getElementById('nr-name').value.trim();
    if (!name){ showToast('Name required'); return; }
    D.resources.push({id:'res'+Date.now(),name:name,role:document.getElementById('nr-role').value,type:document.getElementById('nr-type').value,allocated:parseInt(document.getElementById('nr-alloc').value)||0,projects:[],nonProjectCapacity:0});
    if (ALL_PEOPLE.indexOf(name)<0 && document.getElementById('nr-type').value==='individual') ALL_PEOPLE.push(name);
    if (ALL_TEAMS.indexOf(name)<0 && document.getElementById('nr-type').value==='team') ALL_TEAMS.push(name);
    showToast('Resource added'); closeModal(); pgResources();
  };
  window.deleteResource = function(rid) {
    if (!confirm('Remove this resource?')) return;
    D.resources = D.resources.filter(function(x){ return x.id!==rid; });
    showToast('Resource removed'); closeModal(); pgResources();
  };
  window.editResource = function(rid) {
    var res = D.resources.find(function(x){ return x.id===rid; });
    closeModal();
    var peopleOpts = ALL_PEOPLE.map(function(n){ return '<option' + (res.members&&res.members.indexOf(n)>=0?' selected':'') + '>' + n + '</option>'; }).join('');
    showModal('<div class="modal-title">Edit resource <button class="btn btn-sm" onclick="closeModal();openManageResources()"><i class="ti ti-x"></i></button></div>' +
      '<div class="form-group"><div class="form-label">Name</div><input type="text" id="er-name" value="' + res.name + '"></div>' +
      '<div class="form-group"><div class="form-label">Role / Title</div><input type="text" id="er-role" value="' + res.role + '"></div>' +
      '<div class="form-group"><div class="form-label">Type</div><select id="er-type"><option value="individual"' + (res.type==='individual'?' selected':'') + '>Individual</option><option value="team"' + (res.type==='team'?' selected':'') + '>Team</option></select></div>' +
      '<div class="form-group"><div class="form-label">Project allocation (%)</div><input type="number" id="er-alloc" value="' + res.allocated + '" min="0" max="100"></div>' +
      (res.type==='team' ? '<div class="form-group"><div class="form-label">Team members</div><select multiple id="er-members" style="height:120px">' + peopleOpts + '</select></div>' : '') +
      '<div class="modal-footer"><button class="btn" onclick="closeModal();openManageResources()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="saveResource(\'' + rid + '\')"><i class="ti ti-check"></i> Save changes</button></div>');
  };
  window.saveResource = function(rid) {
    var res = D.resources.find(function(x){ return x.id===rid; });
    res.name = document.getElementById('er-name').value;
    res.role = document.getElementById('er-role').value;
    res.type = document.getElementById('er-type').value;
    res.allocated = parseInt(document.getElementById('er-alloc').value)||0;
    var mEl = document.getElementById('er-members');
    if (mEl) res.members = Array.from(mEl.selectedOptions).map(function(o){ return o.value; });
    showToast('Resource updated'); closeModal(); pgResources();
  };
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

  document.getElementById('f-submit').onclick = function() {
    var title  = document.getElementById('f-title').value.trim();
    var desc   = document.getElementById('f-desc').value.trim();
    var impact = document.getElementById('f-impact').value.trim();
    var costRaw= document.getElementById('f-cost').value.trim();
    var errEl  = document.getElementById('f-cost-err');
    if (!title||!desc||!impact) { showToast('Please fill in all required fields','error'); return; }
    if (!costRaw || isNaN(Number(costRaw)) || costRaw === '') { errEl.style.display='block'; return; }
    errEl.style.display = 'none';
    D.requests.push({
      id:'r'+Date.now(), title:title, submitter:currentUser()||'Current User',
      dept:document.getElementById('f-dept').value, date:new Date().toISOString().split('T')[0],
      status:'Pending', priority:document.getElementById('f-priority').value,
      value:document.getElementById('f-value').value, impact:impact, description:desc,
      effort:document.getElementById('f-effort').value, cost:Number(costRaw), feedback:''
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
  var mine = D.requests.filter(function(r){ return r.submitter === me || r.submitter === 'Sarah Chen' || r.submitter === 'Priya Patel'; });
  var myNotifs = D.notifications.filter(function(n){ return n.submitter === me || n.submitter === 'Sarah Chen' || n.submitter === 'Priya Patel'; });
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
  window.viewLinkedProject = function(pid) { openProjectReadOnly(pid); };
  window.revokeRequest = function(rid) {
    if (!confirm('Revoke this request? It will be removed from the PMO queue.')) return;
    var r = D.requests.find(function(x){ return x.id===rid; });
    r.status = 'Revoked'; showToast('Request revoked'); pgMyRequests(); renderNav();
  };
}

function openProjectReadOnly(pid) {
  var p = D.projects.find(function(x){ return x.id===pid; });
  showModal('<div class="modal-title"><div><div style="margin-bottom:8px">' + p.name + '</div><div style="display:flex;gap:6px;flex-wrap:wrap">' + stagePill(p.stage) + ' ' + bdg(p.status) + ' ' + bdg(p.priority) + '</div></div><button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="grid-2 mb-16">' +
      '<div><div class="form-label">Phase</div><span class="badge badge-gray">' + p.phase + '</span></div>' +
      '<div><div class="form-label">Value area</div><span class="badge badge-purple">' + p.value + '</span></div>' +
      '<div><div class="form-label">PM</div>' + (p.pm||'—') + '</div>' +
      '<div><div class="form-label">Target end</div>' + (p.end||'TBD') + '</div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Description</div><div style="font-size:13px;line-height:1.6;background:#f5f5f3;padding:12px;border-radius:8px">' + p.description + '</div></div>' +
    '<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:12px;color:#777;margin-bottom:4px"><span>Overall progress</span><span>' + p.progress + '%</span></div><div class="progress-bar"><div class="progress-fill" style="width:' + p.progress + '%"></div></div></div>' +
    (p.blockers ? '<div class="blocker-note" style="margin-top:12px"><i class="ti ti-alert-triangle"></i> ' + p.blockers + '</div>' : '') +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>');
}

// ── Resource Role Pages ────────────────────────────────────────────────────────

function pgMyProjectsResource() {
  tb('My projects');
  var ps = myProjects();
  if (!ps.length) { document.getElementById('content').innerHTML = '<div class="empty-state"><i class="ti ti-briefcase"></i><p>You are not assigned to any projects</p></div>'; return; }
  var cards = ps.map(function(p) {
    var myTasks = p.tasks.filter(function(t){ return t.assignee === currentUser(); });
    var doneTasks = myTasks.filter(function(t){ return t.status==='Done'; }).length;
    return '<div class="project-card">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">' +
        '<div><div class="bold mb-12">' + hdot(p.health) + p.name + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + bdg(p.status) + ' ' + stagePill(p.stage) + ' <span class="badge badge-purple">' + p.value + '</span></div></div>' +
        '<button class="btn btn-sm" onclick="openProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button>' +
      '</div>' +
      '<div class="grid-2 mt-12" style="font-size:12px;color:#777">' +
        '<div>PM: ' + (p.pm||'—') + '</div><div>Due: ' + (p.end||'TBD') + '</div>' +
        '<div>My tasks: ' + doneTasks + '/' + myTasks.length + ' done</div>' +
      '</div>' +
      (p.blockers ? '<div class="blocker-note"><i class="ti ti-alert-triangle"></i> ' + p.blockers + '</div>' : '') +
    '</div>';
  }).join('');
  document.getElementById('content').innerHTML = cards;
}

function pgMyTasks() {
  tb('My tasks');
  var me = currentUser();
  var allTasks = [];
  D.projects.forEach(function(p) {
    p.tasks.filter(function(t){ return t.assignee===me; }).forEach(function(t,idx) {
      allTasks.push({task:t, project:p, idx:idx});
    });
  });
  if (!allTasks.length) { document.getElementById('content').innerHTML = '<div class="empty-state"><i class="ti ti-check"></i><p>No tasks assigned to you</p></div>'; return; }
  var rows = allTasks.map(function(item) {
    return '<tr><td class="bold">' + item.task.title + '</td><td class="text-muted">' + item.project.name + '</td><td>' + bdg(item.task.status) + '</td><td class="text-muted">' + item.task.due + '</td>' +
      '<td>' + (item.task.status!=='Done' ? '<button class="btn btn-sm btn-success" onclick="markTaskDone(\'' + item.project.id + '\',' + item.idx + ')"><i class="ti ti-check"></i> Mark done</button>' : '') + '</td></tr>';
  }).join('');
  document.getElementById('content').innerHTML =
    '<div class="card"><div class="section-title">Tasks assigned to me</div><div class="table-wrap"><table>' +
    '<thead><tr><th>Task</th><th>Project</th><th>Status</th><th>Due</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></div>';
  window.markTaskDone = function(pid, idx) {
    var p = D.projects.find(function(x){ return x.id===pid; });
    p.tasks[idx].status = 'Done'; showToast('Task marked complete'); pgMyTasks();
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

// ── Boot ────────────────────────────────────────────────────────────────────────
renderNav();
nav('dashboard');