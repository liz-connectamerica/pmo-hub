// ── Helpers ────────────────────────────────────────────────────────────────

function pendingCount() { return D.requests.filter(function(r){ return r.status === 'pending'; }).length; }
function backlogCount()  { return D.projects.filter(function(p){ return p.stage  === 'backlog'; }).length; }
function myProjects()    { return D.role === 'pm' ? D.projects.filter(function(p){ return p.pm === 'Alex Turner'; }) : D.projects; }
function canEdit(p)      { return D.role === 'admin' || (D.role === 'pm' && p.pm === 'Alex Turner'); }

function bdg(s) {
  var map = {
    'On Track':'badge-teal','At Risk':'badge-amber','Planning':'badge-blue','Blocked':'badge-red','Complete':'badge-green',
    'pending':'badge-amber','approved':'badge-teal','rejected':'badge-red','backlog':'badge-amber','active':'badge-teal','planned':'badge-blue',
    'Done':'badge-teal','In Progress':'badge-purple','To Do':'badge-gray',
    'Open':'badge-red','Closed':'badge-teal','Active':'badge-blue','Pending':'badge-amber',
    'Critical':'badge-red','High':'badge-coral','Medium':'badge-amber','Low':'badge-blue'
  };
  return '<span class="badge ' + (map[s] || 'badge-gray') + '">' + s + '</span>';
}

function hdot(h) {
  var c = { green: '#1D9E75', amber: '#EF9F27', red: '#E24B4A' }[h] || '#ccc';
  return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + c + ';margin-right:6px;vertical-align:middle"></span>';
}

function stagePill(s) {
  var m = {
    backlog:  { bg:'#FAEEDA', c:'#633806', l:'Backlog' },
    planned:  { bg:'#E6F1FB', c:'#0C447C', l:'Planned' },
    active:   { bg:'#E1F5EE', c:'#085041', l:'Active'  },
    complete: { bg:'#f0ede8', c:'#444',    l:'Complete'}
  };
  var x = m[s] || m.backlog;
  return '<span class="stage-pill" style="background:' + x.bg + ';color:' + x.c + '">' + x.l + '</span>';
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 2800);
}

function addNotif(sub, msg, type) {
  D.notifications.push({ submitter: sub, msg: msg, type: type, date: new Date().toISOString().split('T')[0] });
}

function tb(title, actions) {
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-actions').innerHTML = actions || '';
}

// ── Modal ───────────────────────────────────────────────────────────────────

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
    { s: 'Overview', items: [
      { id:'dashboard', icon:'ti-layout-dashboard', label:'Dashboard' },
      { id:'portfolio',  icon:'ti-folder-open',      label:'Portfolio'  }
    ]},
    { s: 'Intake', items: [
      { id:'requests', icon:'ti-inbox', label:'Requests', badge:'pending' }
    ]},
    { s: 'Projects', items: [
      { id:'backlog',   icon:'ti-stack-2',        label:'Backlog',         badge:'backlog' },
      { id:'planned',   icon:'ti-calendar-event', label:'Planned'   },
      { id:'projects',  icon:'ti-briefcase',      label:'Active projects'  },
      { id:'roadmap',   icon:'ti-road',           label:'Roadmap'          },
      { id:'resources', icon:'ti-users',          label:'Resources'        }
    ]}
  ],
  pm: [
    { s: 'Overview', items: [{ id:'dashboard', icon:'ti-layout-dashboard', label:'Dashboard' }]},
    { s: 'My Projects', items: [
      { id:'projects',  icon:'ti-briefcase',      label:'Active projects' },
      { id:'planned',   icon:'ti-calendar-event', label:'Planned'         },
      { id:'roadmap',   icon:'ti-road',           label:'Roadmap'         },
      { id:'resources', icon:'ti-users',          label:'Resources'       }
    ]}
  ],
  stakeholder: [
    { s: 'Requests', items: [
      { id:'submit',       icon:'ti-send',  label:'Submit a request' },
      { id:'my-requests',  icon:'ti-clock', label:'My requests'      }
    ]}
  ],
  exec: [
    { s: 'Overview', items: [
      { id:'dashboard', icon:'ti-layout-dashboard', label:'Dashboard'  },
      { id:'portfolio',  icon:'ti-folder-open',      label:'Portfolio'  },
      { id:'roadmap',    icon:'ti-road',             label:'Roadmap'    },
      { id:'resources',  icon:'ti-users',            label:'Resources'  }
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
  currentPage = page;
  renderNav();
  var map = {
    dashboard:    pgDashboard,
    portfolio:    pgPortfolio,
    requests:     pgRequests,
    backlog:      pgBacklog,
    planned:      pgPlanned,
    projects:     pgProjects,
    roadmap:      pgRoadmap,
    resources:    pgResources,
    submit:       pgSubmit,
    'my-requests': pgMyRequests
  };
  if (map[page]) map[page]();
}

function setRole(r) {
  D.role = r;
  var def = { admin:'dashboard', pm:'dashboard', stakeholder:'submit', exec:'dashboard' };
  renderNav();
  nav(def[r]);
}

// ── Pages ───────────────────────────────────────────────────────────────────

function pgDashboard() {
  tb('Dashboard');
  var ps = myProjects();
  var active = ps.filter(function(p){ return p.stage === 'active'; });
  var onT = active.filter(function(p){ return p.status === 'On Track'; }).length;
  var atR = active.filter(function(p){ return p.status === 'At Risk';  }).length;

  var projRows = active.map(function(p) {
    return '<tr>' +
      '<td class="bold">' + p.name + '</td>' +
      '<td>' + bdg(p.status) + '</td>' +
      '<td>' + bdg(p.priority) + '</td>' +
      '<td><span class="badge badge-gray">' + p.phase + '</span></td>' +
      '<td><div style="display:flex;align-items:center;gap:8px"><div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:' + p.progress + '%"></div></div><span class="text-muted">' + p.progress + '%</span></div></td>' +
      '<td class="text-muted">' + (p.pm || '—') + '</td>' +
      '<td>' + (p.blockers ? '<span style="color:#993C1D;font-size:12px"><i class="ti ti-alert-triangle"></i> Yes</span>' : '<span class="text-muted">—</span>') + '</td>' +
      '<td><button class="btn btn-sm" onclick="openProject(\'' + p.id + '\')"><i class="ti ti-eye"></i> View</button></td>' +
      '</tr>';
  }).join('');

  var pendRows = '';
  if (D.role === 'admin') {
    D.requests.filter(function(r){ return r.status === 'pending'; }).forEach(function(r) {
      pendRows += '<tr>' +
        '<td class="bold">' + r.title + '</td><td>' + r.submitter + '</td><td>' + r.dept + '</td>' +
        '<td>' + bdg(r.priority) + '</td><td><span class="badge badge-purple">' + r.value + '</span></td>' +
        '<td><button class="btn btn-sm" onclick="reviewRequest(\'' + r.id + '\')"><i class="ti ti-eye"></i> Review</button></td>' +
        '</tr>';
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
        '<tbody>' + pendRows + '</tbody></table></div></div>'
      : '');
}

function pgPortfolio() {
  tb('Portfolio');
  var byVal = {};
  D.projects.forEach(function(p){ if (!byVal[p.value]) byVal[p.value] = []; byVal[p.value].push(p); });
  var cols = ['badge-purple','badge-teal','badge-blue','badge-coral','badge-amber'];
  var i = 0, h = '';
  Object.keys(byVal).forEach(function(v) {
    var cl = cols[i++ % cols.length];
    var cards = byVal[v].map(function(p) {
      return '<div class="card card-sm" style="cursor:pointer;border:1px solid #e8e8e5;border-radius:10px" onclick="openProject(\'' + p.id + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px"><span class="bold" style="font-size:13px">' + p.name + '</span>' + stagePill(p.stage) + '</div>' +
        '<div class="text-muted mb-12" style="font-size:12px;line-height:1.5">' + p.description + '</div>' +
        '<div class="progress-bar mb-12"><div class="progress-fill" style="width:' + p.progress + '%"></div></div>' +
        '<div style="display:flex;justify-content:space-between"><span class="text-muted">' + (p.pm || 'No PM') + '</span><span class="text-muted">' + (p.end || 'TBD') + '</span></div>' +
        '</div>';
    }).join('');
    h += '<div class="card mb-16"><div class="mb-12"><span class="badge ' + cl + '" style="font-size:13px;padding:5px 14px">' + v + '</span></div>' +
         '<div class="grid-2">' + cards + '</div></div>';
  });
  document.getElementById('content').innerHTML = h;
}

function pgRequests() {
  tb('Requests');
  var activeTab = 'Pending';
  var tabs = ['All','Pending','Approved','Backlog','Planned','Active','Rejected'];

  function filtered(t) { return t === 'All' ? D.requests : D.requests.filter(function(r){ return r.status === t.toLowerCase(); }); }

  function tbl(t) {
    var rows = filtered(t);
    if (!rows.length) return '<div class="empty-state"><i class="ti ti-inbox"></i><p>No ' + t.toLowerCase() + ' requests</p></div>';
    return '<div class="table-wrap"><table><thead><tr><th>Title</th><th>Submitter</th><th>Dept</th><th>Date</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>' +
      rows.map(function(r) {
        return '<tr><td class="bold">' + r.title + '</td><td>' + r.submitter + '</td><td>' + r.dept + '</td><td class="text-muted">' + r.date + '</td>' +
          '<td>' + bdg(r.priority) + '</td><td>' + bdg(r.status) + '</td>' +
          '<td><button class="btn btn-sm" onclick="reviewRequest(\'' + r.id + '\')"><i class="ti ti-eye"></i> ' + (D.role === 'admin' && r.status === 'pending' ? 'Review' : 'View') + '</button></td></tr>';
      }).join('') +
      '</tbody></table></div>';
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
  var canApprove = D.role === 'admin' && r.status === 'pending';
  var canBacklog  = D.role === 'admin' && r.status === 'approved';

  var html =
    '<div class="modal-title"><div>' +
      '<div style="font-size:16px;font-weight:600;margin-bottom:8px">' + r.title + '</div>' +
      '<div style="display:flex;gap:6px">' + bdg(r.status) + ' ' + bdg(r.priority) + '</div>' +
    '</div><button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="grid-2 mb-16">' +
      '<div><div class="form-label">Submitted by</div>' + r.submitter + ' — ' + r.dept + '</div>' +
      '<div><div class="form-label">Date</div>' + r.date + '</div>' +
      '<div><div class="form-label">Cost</div>' + r.cost + '</div>' +
      '<div><div class="form-label">Effort</div><span class="badge badge-gray">' + r.effort + '</span></div>' +
      '<div><div class="form-label">Value area</div><span class="badge badge-purple">' + r.value + '</span></div>' +
    '</div>' +
    '<div class="form-group"><div class="form-label">Description</div><div style="background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6">' + r.description + '</div></div>' +
    '<div class="form-group"><div class="form-label">Impact &amp; value proposition</div><div style="background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6">' + r.impact + '</div></div>' +
    (r.feedback ? '<div class="form-group"><div class="form-label">PMO feedback</div><div style="background:#f5f5f3;padding:12px;border-radius:8px;font-size:13px;line-height:1.6;border-left:3px solid #534AB7">' + r.feedback + '</div></div>' : '');

  if (canApprove) {
    html += '<div class="form-group"><div class="form-label">Feedback to submitter</div><textarea id="rfb" placeholder="Decision rationale…">' + r.feedback + '</textarea></div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-danger" onclick="decideReq(\'' + r.id + '\',\'rejected\')"><i class="ti ti-x"></i> Reject</button>' +
        '<button class="btn btn-success" onclick="decideReq(\'' + r.id + '\',\'approved\')"><i class="ti ti-check"></i> Approve — add to backlog</button>' +
      '</div>';
  } else if (canBacklog) {
    html += '<div class="modal-footer">' +
      '<button class="btn btn-primary" onclick="scheduleFromRequest(\'' + r.id + '\')"><i class="ti ti-calendar-plus"></i> Schedule this project</button>' +
      '<button class="btn" onclick="closeModal()">Close</button></div>';
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
  if (decision === 'approved') {
    var p = {
      id: 'p' + Date.now(), name: r.title, pm: '', team: [],
      status: 'Planning', phase: 'Discovery', progress: 0, start: '', end: '',
      value: r.value, priority: r.priority, description: r.description,
      blockers: '', health: 'green', stage: 'backlog', plannedStart: '', requestId: r.id,
      milestones: [], tasks: [], raid: { risks:[], assumptions:[], issues:[], dependencies:[] }
    };
    D.projects.push(p);
    r.status = 'backlog';
    r.linkedProject = p.id;
    addNotif(r.submitter, 'Your request "' + r.title + '" has been approved and added to the backlog.', 'approved');
  }
  closeModal();
  showToast(decision === 'approved' ? 'Approved — added to backlog' : 'Request rejected');
  renderNav();
  if (currentPage === 'requests') pgRequests();
  else if (currentPage === 'backlog') pgBacklog();
  else pgDashboard();
}

function scheduleFromRequest(rid) {
  var r = D.requests.find(function(x){ return x.id === rid; });
  closeModal();
  var p = D.projects.find(function(x){ return x.id === r.linkedProject; }) ||
          D.projects.find(function(x){ return x.requestId === rid; });
  if (p) openScheduleModal(p.id);
  else showToast('No linked project found');
}

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
      (!p.pm ? '<div class="blocker-note" style="background:#FAEEDA;color:#854F0B"><i class="ti ti-user-question"></i> No PM assigned yet</div>' : '') +
      '</div>';
  }).join('');

  document.getElementById('content').innerHTML =
    '<div class="info-banner info-amber"><i class="ti ti-stack-2" style="font-size:20px;flex-shrink:0;color:#BA7517"></i>' +
    '<span>Projects here are <strong>approved</strong> and waiting to be scheduled. Assign a PM, team, and start date to move them to Planned.</span></div>' +
    (bp.length ? cards : '<div class="empty-state"><i class="ti ti-stack-2"></i><p>Backlog is clear</p></div>');
}

function openScheduleModal(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var pmOpts = ALL_PEOPLE.map(function(n){
    return '<option value="' + n + '"' + (p.pm === n ? ' selected' : '') + '>' + n + '</option>';
  }).join('');
  var memberOpts = ALL_PEOPLE.concat(ALL_TEAMS).map(function(n) {
    var isTeam = ALL_TEAMS.indexOf(n) >= 0;
    var chk = p.team.indexOf(n) >= 0 ? ' checked' : '';
    return '<label class="member-check"><input type="checkbox" id="schm-' + n.replace(/ /g,'_') + '"' + chk + '> ' + n +
      (isTeam ? ' <span class="badge badge-blue" style="font-size:10px">Team</span>' : '') + '</label>';
  }).join('');

  showModal(
    '<div class="modal-title">Schedule project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div style="font-weight:600;margin-bottom:16px;color:#534AB7">' + p.name + '</div>' +
    '<div class="form-group"><div class="form-label">Project manager *</div>' +
    '<select id="sch-pm"><option value="">— Select PM —</option>' + pmOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Team members</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' + memberOpts + '</div></div>' +
    '<div class="grid-2">' +
    '<div class="form-group"><div class="form-label">Planned start *</div><input type="date" id="sch-start" value="' + (p.plannedStart || '') + '"></div>' +
    '<div class="form-group"><div class="form-label">Target end *</div><input type="date" id="sch-end" value="' + (p.end || '') + '"></div>' +
    '</div>' +
    '<div class="modal-footer">' +
    '<button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" onclick="scheduleProject(\'' + p.id + '\')"><i class="ti ti-calendar-check"></i> Confirm — move to planned</button>' +
    '</div>', true);
}

function scheduleProject(pid) {
  var p     = D.projects.find(function(x){ return x.id === pid; });
  var pm    = document.getElementById('sch-pm').value;
  var start = document.getElementById('sch-start').value;
  var end   = document.getElementById('sch-end').value;
  if (!pm || !start || !end) { showToast('Please fill in PM, start date, and end date'); return; }
  var allNames = ALL_PEOPLE.concat(ALL_TEAMS);
  p.team = allNames.filter(function(n){ var el = document.getElementById('schm-' + n.replace(/ /g,'_')); return el && el.checked; });
  p.pm = pm; p.plannedStart = start; p.start = start; p.end = end; p.stage = 'planned';
  var r = D.requests.find(function(x){ return x.id === p.requestId; });
  if (r) { r.status = 'planned'; r.linkedProject = pid; }
  addNotif(r ? r.submitter : '', 'Great news! "' + p.name + '" has been scheduled to start on ' + start + '. PM: ' + pm + '.', 'planned');
  closeModal();
  showToast('Project scheduled — submitter notified');
  renderNav();
  if (currentPage === 'backlog') pgBacklog();
  else if (currentPage === 'planned') pgPlanned();
  else nav(currentPage);
}

function pgPlanned() {
  tb('Planned projects');
  var pp = D.projects.filter(function(p){ return p.stage === 'planned'; });
  var cards = pp.map(function(p) {
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
        '<div><span class="text-muted">Start: </span>' + p.plannedStart + '</div>' +
        '<div><span class="text-muted">End: </span>' + p.end + '</div>' +
        '<div><span class="text-muted">PM: </span>' + p.pm + '</div>' +
        '<div><span class="text-muted">Team: </span>' + p.team.length + ' member' + (p.team.length !== 1 ? 's' : '') + '</div>' +
      '</div></div>';
  }).join('');

  document.getElementById('content').innerHTML =
    '<div class="info-banner info-blue"><i class="ti ti-calendar-event" style="font-size:20px;flex-shrink:0;color:#185FA5"></i>' +
    '<span>These projects are <strong>scheduled</strong> with a PM, team, and start date. Activate them when work begins.</span></div>' +
    (pp.length ? cards : '<div class="empty-state"><i class="ti ti-calendar-event"></i><p>No planned projects yet</p></div>');
}

function activateProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  p.stage = 'active'; p.status = 'On Track';
  var r = D.requests.find(function(x){ return x.id === p.requestId; });
  if (r) r.status = 'active';
  showToast('"' + p.name + '" is now active');
  renderNav();
  if (currentPage === 'planned') pgPlanned(); else pgProjects();
}

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
      '<div class="grid-2 mt-12" style="font-size:12px;color:#777"><div>PM: ' + (p.pm || '—') + ' &bull; Due ' + (p.end || 'TBD') + '</div><div>' + p.team.length + ' team member' + (p.team.length !== 1 ? 's' : '') + '</div></div>' +
      (p.blockers ? '<div class="blocker-note"><i class="ti ti-alert-triangle"></i> ' + p.blockers + '</div>' : '') +
      '</div>';
  }).join('');
  document.getElementById('content').innerHTML = ps.length ? cards : '<div class="empty-state"><i class="ti ti-briefcase"></i><p>No active projects</p></div>';
}

function openProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  var editable = canEdit(p);
  var tbs = ['overview','milestones','tasks','raid'];

  function tabC(t) {
    if (t === 'overview') {
      var teamHtml = p.team.length
        ? p.team.map(function(m, i) {
            var isTeam = ALL_TEAMS.indexOf(m) >= 0;
            var ini = m.split(' ').map(function(x){ return x[0]; }).join('');
            return '<div class="team-chip">' +
              (isTeam ? '<i class="ti ti-users" style="font-size:13px;color:#185FA5"></i>' : '<div class="avatar ' + AV_COLS[i % AV_COLS.length] + '">' + ini + '</div>') +
              '<span style="font-size:12px">' + m + '</span></div>';
          }).join('')
        : '<span class="text-muted">No team assigned</span>';
      return '<div class="grid-2 mb-16">' +
        '<div><div class="form-label">Stage</div>' + stagePill(p.stage) + '</div>' +
        '<div><div class="form-label">Status</div>' + bdg(p.status) + '</div>' +
        '<div><div class="form-label">Phase</div><span class="badge badge-gray">' + p.phase + '</span></div>' +
        '<div><div class="form-label">Priority</div>' + bdg(p.priority) + '</div>' +
        '<div><div class="form-label">Value area</div><span class="badge badge-purple">' + p.value + '</span></div>' +
        '<div><div class="form-label">Progress</div><div style="display:flex;align-items:center;gap:8px"><div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:' + p.progress + '%"></div></div><span class="text-muted">' + p.progress + '%</span></div></div>' +
        '<div><div class="form-label">Start</div>' + (p.start || '—') + '</div>' +
        '<div><div class="form-label">Target end</div>' + (p.end || '—') + '</div>' +
        '</div>' +
        '<div class="form-group"><div class="form-label">Description</div><div style="font-size:13px;line-height:1.6">' + p.description + '</div></div>' +
        '<div class="form-group"><div class="form-label">PM</div>' + (p.pm || '—') + '</div>' +
        '<div class="form-group"><div class="form-label">Team</div><div style="display:flex;gap:8px;flex-wrap:wrap">' + teamHtml + '</div></div>' +
        (p.blockers ? '<div class="blocker-note"><i class="ti ti-alert-triangle"></i> <strong>Blocker:</strong> ' + p.blockers + '</div>' : '') +
        (editable ? '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e8e8e5;display:flex;justify-content:flex-end"><button class="btn btn-primary" onclick="closeModal();editProject(\'' + p.id + '\')"><i class="ti ti-edit"></i> Edit project</button></div>' : '');
    }
    if (t === 'milestones') {
      var rows = p.milestones.map(function(m, idx) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f0ede8">' +
          '<i class="ti ' + (m.done ? 'ti-circle-check' : 'ti-circle-dotted') + '" style="font-size:22px;color:' + (m.done ? '#1D9E75' : '#ccc') + ';' + (editable ? 'cursor:pointer' : '') + '" ' +
          (editable ? 'onclick="toggleMS(\'' + p.id + '\',' + idx + ')"' : '') + '></i>' +
          '<div style="flex:1"><div style="font-size:13px' + (m.done ? ';text-decoration:line-through;color:#999' : '') + '">' + m.name + '</div></div>' +
          '<div class="text-muted">' + m.date + '</div>' +
          (editable ? '<button class="btn btn-sm btn-danger" onclick="deleteMS(\'' + p.id + '\',' + idx + ')"><i class="ti ti-trash"></i></button>' : '') +
          '</div>';
      }).join('');
      return (editable ? '<button class="btn btn-primary btn-sm mb-12" onclick="openAddMilestone(\'' + p.id + '\')"><i class="ti ti-plus"></i> Add milestone</button>' : '') +
        (p.milestones.length ? rows : '<div class="empty-state" style="padding:30px"><i class="ti ti-circle-dotted"></i><p>No milestones yet</p></div>');
    }
    if (t === 'tasks') {
      var trows = p.tasks.map(function(task, idx) {
        return '<tr><td>' + task.title + '</td><td>' + task.assignee + '</td><td>' + bdg(task.status) + '</td><td class="text-muted">' + task.due + '</td>' +
          (editable ? '<td><div style="display:flex;gap:4px"><button class="btn btn-sm" onclick="openEditTask(\'' + p.id + '\',' + idx + ')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteTask(\'' + p.id + '\',' + idx + ')"><i class="ti ti-trash"></i></button></div></td>' : '') +
          '</tr>';
      }).join('');
      return (editable ? '<button class="btn btn-primary btn-sm mb-12" onclick="openAddTask(\'' + p.id + '\')"><i class="ti ti-plus"></i> Add task</button>' : '') +
        (p.tasks.length
          ? '<table><thead><tr><th>Task</th><th>Assignee</th><th>Status</th><th>Due</th>' + (editable ? '<th></th>' : '') + '</tr></thead><tbody>' + trows + '</tbody></table>'
          : '<div class="empty-state" style="padding:30px"><i class="ti ti-check"></i><p>No tasks yet</p></div>');
    }
    if (t === 'raid') {
      function rSection(label, items, type) {
        var isGrid = type === 'risks' || type === 'issues';
        var addBtn = editable ? '<button class="btn btn-sm btn-primary" onclick="openAddRaid(\'' + p.id + '\',\'' + type + '\')"><i class="ti ti-plus"></i> Add</button>' : '';
        var header = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="bold">' + label + '</div>' + addBtn + '</div>';
        if (!items.length) return header + '<div class="text-muted" style="font-size:12px;margin-bottom:12px">None logged</div><div class="divider"></div>';
        var body = isGrid
          ? '<div class="raid-hdr"><div>Severity</div><div>Description</div><div>Owner</div><div>' + (type === 'risks' ? 'Mitigation' : 'Status') + '</div><div></div></div>' +
            items.map(function(item, idx) {
              return '<div class="raid-row"><div>' + bdg(type === 'risks' ? item.severity : item.status) + '</div><div>' + item.desc + '</div><div class="text-muted">' + item.owner + '</div><div style="font-size:12px;color:#555">' + (type === 'risks' ? item.mitigation : item.status) + '</div>' +
                (editable ? '<div><button class="btn btn-sm btn-danger" onclick="deleteRaid(\'' + p.id + '\',\'' + type + '\',' + idx + ')"><i class="ti ti-trash"></i></button></div>' : '<div></div>') + '</div>';
            }).join('')
          : items.map(function(item, idx) {
              return '<div style="font-size:13px;padding:10px 0;border-bottom:1px solid #f0ede8;display:flex;justify-content:space-between;align-items:center;gap:8px">' +
                '<div>' + item.desc + (item.owner ? ' <span class="text-muted">— ' + item.owner + '</span>' : '') + (item.status ? ' ' + bdg(item.status) : '') + '</div>' +
                (editable ? '<button class="btn btn-sm btn-danger" onclick="deleteRaid(\'' + p.id + '\',\'' + type + '\',' + idx + ')"><i class="ti ti-trash"></i></button>' : '') + '</div>';
            }).join('');
        return header + body + '<div class="divider"></div>';
      }
      return rSection('Risks', p.raid.risks, 'risks') +
             rSection('Assumptions', p.raid.assumptions, 'assumptions') +
             rSection('Issues', p.raid.issues, 'issues') +
             rSection('Dependencies', p.raid.dependencies, 'dependencies');
    }
    return '';
  }

  var tabsHtml = tbs.map(function(t) {
    return '<div class="tab' + (t === 'overview' ? ' active' : '') + '" id="ptab-' + t + '" onclick="switchPTab(\'' + t + '\',\'' + p.id + '\')" style="text-transform:capitalize">' + (t === 'raid' ? 'RAID log' : t) + '</div>';
  }).join('');

  showModal(
    '<div class="modal-title">' +
      '<div><div style="margin-bottom:8px">' + p.name + '</div><div style="display:flex;gap:6px;flex-wrap:wrap">' + stagePill(p.stage) + ' ' + bdg(p.status) + ' ' + bdg(p.priority) + '</div></div>' +
      '<button class="btn btn-sm" style="flex-shrink:0" onclick="closeModal()"><i class="ti ti-x"></i></button>' +
    '</div>' +
    '<div class="tab-bar">' + tabsHtml + '</div>' +
    '<div id="ptab-content">' + tabC('overview') + '</div>', true);

  window.switchPTab = function(t) {
    tbs.forEach(function(x){ var e = document.getElementById('ptab-' + x); if (e) e.className = 'tab' + (x === t ? ' active' : ''); });
    document.getElementById('ptab-content').innerHTML = tabC(t);
  };
  window.toggleMS   = function(pid2, idx){ var pr = D.projects.find(function(x){ return x.id === pid2; }); pr.milestones[idx].done = !pr.milestones[idx].done; document.getElementById('ptab-content').innerHTML = tabC('milestones'); };
  window.deleteMS   = function(pid2, idx){ var pr = D.projects.find(function(x){ return x.id === pid2; }); pr.milestones.splice(idx,1); document.getElementById('ptab-content').innerHTML = tabC('milestones'); };
  window.deleteTask = function(pid2, idx){ var pr = D.projects.find(function(x){ return x.id === pid2; }); pr.tasks.splice(idx,1); document.getElementById('ptab-content').innerHTML = tabC('tasks'); };
  window.deleteRaid = function(pid2, type, idx){ var pr = D.projects.find(function(x){ return x.id === pid2; }); pr.raid[type].splice(idx,1); document.getElementById('ptab-content').innerHTML = tabC('raid'); };
  window.openAddMilestone = function(pid2){ openMilestoneModal(pid2); };
  window.openAddTask      = function(pid2){ openTaskModal(pid2, null); };
  window.openEditTask     = function(pid2, idx){ openTaskModal(pid2, idx); };
  window.openAddRaid      = function(pid2, type){ openRaidModal(pid2, type); };
}

function openMilestoneModal(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  showModal(
    '<div class="modal-title">Add milestone <button class="btn btn-sm" onclick="openProject(\'' + pid + '\')"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Milestone name *</div><input type="text" id="ms-name" placeholder="e.g. Design approved"></div>' +
    '<div class="form-group"><div class="form-label">Target date *</div><input type="date" id="ms-date"></div>' +
    '<div class="modal-footer"><button class="btn" onclick="openProject(\'' + pid + '\')">Cancel</button>' +
    '<button class="btn btn-primary" id="ms-save"><i class="ti ti-check"></i> Add milestone</button></div>');
  document.getElementById('ms-save').onclick = function() {
    var name = document.getElementById('ms-name').value.trim();
    var date = document.getElementById('ms-date').value;
    if (!name || !date) { showToast('Fill in name and date'); return; }
    p.milestones.push({ name: name, date: date, done: false });
    showToast('Milestone added');
    openProject(pid);
    setTimeout(function(){ window.switchPTab('milestones'); }, 50);
  };
}

function openTaskModal(pid, idx) {
  var p    = D.projects.find(function(x){ return x.id === pid; });
  var task = idx != null ? p.tasks[idx] : null;
  var assigneeOpts = ALL_PEOPLE.concat(ALL_TEAMS).map(function(n){ return '<option' + (task && task.assignee === n ? ' selected' : '') + '>' + n + '</option>'; }).join('');
  showModal(
    '<div class="modal-title">' + (task ? 'Edit task' : 'Add task') + ' <button class="btn btn-sm" onclick="openProject(\'' + pid + '\')"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Task title *</div><input type="text" id="tm-title" value="' + (task ? task.title : '') + '" placeholder="Task name"></div>' +
    '<div class="form-group"><div class="form-label">Assignee</div><select id="tm-assignee">' + assigneeOpts + '</select></div>' +
    '<div class="grid-2">' +
    '<div class="form-group"><div class="form-label">Status</div><select id="tm-status">' +
      '<option' + (!task || task.status === 'To Do'       ? ' selected' : '') + '>To Do</option>' +
      '<option' + (task && task.status === 'In Progress'  ? ' selected' : '') + '>In Progress</option>' +
      '<option' + (task && task.status === 'Done'         ? ' selected' : '') + '>Done</option>' +
    '</select></div>' +
    '<div class="form-group"><div class="form-label">Due date</div><input type="date" id="tm-due" value="' + (task ? task.due : '') + '"></div></div>' +
    '<div class="modal-footer"><button class="btn" onclick="openProject(\'' + pid + '\')">Cancel</button>' +
    '<button class="btn btn-primary" id="tm-save"><i class="ti ti-check"></i> ' + (task ? 'Save changes' : 'Add task') + '</button></div>');
  document.getElementById('tm-save').onclick = function() {
    var title = document.getElementById('tm-title').value.trim();
    if (!title) { showToast('Task title required'); return; }
    var t2 = { id: 't' + Date.now(), title: title, assignee: document.getElementById('tm-assignee').value, status: document.getElementById('tm-status').value, due: document.getElementById('tm-due').value };
    if (idx != null) p.tasks[idx] = t2; else p.tasks.push(t2);
    showToast(idx != null ? 'Task updated' : 'Task added');
    openProject(pid);
    setTimeout(function(){ window.switchPTab('tasks'); }, 50);
  };
}

function openRaidModal(pid, type) {
  var p     = D.projects.find(function(x){ return x.id === pid; });
  var label = { risks:'Risk', assumptions:'Assumption', issues:'Issue', dependencies:'Dependency' }[type];
  var ownerOpts = ALL_PEOPLE.map(function(n){ return '<option>' + n + '</option>'; }).join('');
  var extra = '';
  if (type === 'risks')        extra = '<div class="grid-2"><div class="form-group"><div class="form-label">Severity</div><select id="rd-sev"><option>High</option><option selected>Medium</option><option>Low</option></select></div><div class="form-group"><div class="form-label">Mitigation</div><input type="text" id="rd-mit" placeholder="Mitigation plan…"></div></div>';
  if (type === 'issues')       extra = '<div class="form-group"><div class="form-label">Severity</div><select id="rd-sev"><option>High</option><option selected>Medium</option><option>Low</option></select></div>';
  if (type === 'dependencies') extra = '<div class="form-group"><div class="form-label">Status</div><select id="rd-depst"><option>Pending</option><option>Active</option><option>Resolved</option></select></div>';
  showModal(
    '<div class="modal-title">Add ' + label + ' <button class="btn btn-sm" onclick="openProject(\'' + pid + '\')"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Description *</div><textarea id="rd-desc" placeholder="Describe this ' + label.toLowerCase() + '…"></textarea></div>' +
    '<div class="form-group"><div class="form-label">Owner</div><select id="rd-owner"><option value="">— Select —</option>' + ownerOpts + '</select></div>' +
    extra +
    '<div class="modal-footer"><button class="btn" onclick="openProject(\'' + pid + '\')">Cancel</button>' +
    '<button class="btn btn-primary" id="rd-save"><i class="ti ti-check"></i> Add ' + label + '</button></div>');
  document.getElementById('rd-save').onclick = function() {
    var desc = document.getElementById('rd-desc').value.trim();
    if (!desc) { showToast('Description required'); return; }
    var owner = document.getElementById('rd-owner').value;
    if (type === 'risks')        p.raid.risks.push({ id:'ri'+Date.now(), desc:desc, severity:document.getElementById('rd-sev').value, owner:owner, mitigation:document.getElementById('rd-mit').value });
    else if (type === 'assumptions')  p.raid.assumptions.push({ id:'a'+Date.now(), desc:desc, owner:owner });
    else if (type === 'issues')       p.raid.issues.push({ id:'i'+Date.now(), desc:desc, severity:document.getElementById('rd-sev').value, owner:owner, status:'Open' });
    else if (type === 'dependencies') p.raid.dependencies.push({ id:'d'+Date.now(), desc:desc, owner:owner, status:document.getElementById('rd-depst').value });
    showToast(label + ' added');
    openProject(pid);
    setTimeout(function(){ window.switchPTab('raid'); }, 50);
  };
}

function editProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  if (!canEdit(p)) { showToast('You do not have edit access'); return; }
  var statusOpts = STATUSES.map(function(s){ return '<option' + (p.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
  var phaseOpts  = PHASES.map(function(s){   return '<option' + (p.phase  === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
  var priorOpts  = PRIORITIES.map(function(s){ return '<option' + (p.priority === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
  var valOpts    = VALUE_AREAS.map(function(s){ return '<option' + (p.value === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
  var pmOpts     = '<option value="">— None —</option>' + ALL_PEOPLE.map(function(n){ return '<option' + (p.pm === n ? ' selected' : '') + '>' + n + '</option>'; }).join('');
  var memberOpts = D.role === 'admin' ? ALL_PEOPLE.concat(ALL_TEAMS).map(function(n) {
    var isTeam = ALL_TEAMS.indexOf(n) >= 0;
    return '<label class="member-check"><input type="checkbox" id="ep-tm-' + n.replace(/ /g,'_') + '"' + (p.team.indexOf(n) >= 0 ? ' checked' : '') + '> ' + n + (isTeam ? ' <span class="badge badge-blue" style="font-size:10px">Team</span>' : '') + '</label>';
  }).join('') : '';

  showModal(
    '<div class="modal-title">Edit project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
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
    (D.role === 'admin'
      ? '<div class="divider"></div>' +
        '<div class="form-group"><div class="form-label">Project manager</div><select id="ep-pm">' + pmOpts + '</select></div>' +
        '<div class="form-group"><div class="form-label">Team members</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' + memberOpts + '</div></div>'
      : '') +
    '<div class="modal-footer">' +
      (D.role === 'admin' ? '<button class="btn btn-danger" onclick="deleteProject(\'' + p.id + '\')"><i class="ti ti-trash"></i> Delete</button>' : '') +
      '<button class="btn" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="saveProject(\'' + p.id + '\')"><i class="ti ti-check"></i> Save changes</button>' +
    '</div>', true);
}

function saveProject(pid) {
  var p = D.projects.find(function(x){ return x.id === pid; });
  p.name        = document.getElementById('ep-name').value;
  p.status      = document.getElementById('ep-status').value;
  p.phase       = document.getElementById('ep-phase').value;
  p.priority    = document.getElementById('ep-priority').value;
  p.value       = document.getElementById('ep-value').value;
  p.start       = document.getElementById('ep-start').value;
  p.end         = document.getElementById('ep-end').value;
  p.progress    = parseInt(document.getElementById('ep-progress').value) || 0;
  p.health      = document.getElementById('ep-health').value;
  p.description = document.getElementById('ep-desc').value;
  p.blockers    = document.getElementById('ep-blocker').value;
  if (D.role === 'admin') {
    var pmEl = document.getElementById('ep-pm'); if (pmEl) p.pm = pmEl.value;
    var allNames = ALL_PEOPLE.concat(ALL_TEAMS);
    p.team = allNames.filter(function(n){ var el = document.getElementById('ep-tm-' + n.replace(/ /g,'_')); return el && el.checked; });
  }
  closeModal(); showToast('Project saved');
  if (currentPage === 'projects') pgProjects(); else pgDashboard();
}

function deleteProject(pid) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  D.projects = D.projects.filter(function(x){ return x.id !== pid; });
  closeModal(); showToast('Project deleted'); renderNav();
  if (currentPage === 'projects') pgProjects(); else pgDashboard();
}

function openNewProjectModal() {
  var valOpts   = VALUE_AREAS.map(function(s){ return '<option>' + s + '</option>'; }).join('');
  var priorOpts = PRIORITIES.map(function(s){  return '<option>' + s + '</option>'; }).join('');
  var pmOpts    = '<option value="">— None —</option>' + ALL_PEOPLE.map(function(n){ return '<option>' + n + '</option>'; }).join('');
  showModal(
    '<div class="modal-title">Create new project <button class="btn btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button></div>' +
    '<div class="form-group"><div class="form-label">Project name *</div><input type="text" id="np-name" placeholder="Project name"></div>' +
    '<div class="grid-2">' +
    '<div class="form-group"><div class="form-label">Value area</div><select id="np-value">' + valOpts + '</select></div>' +
    '<div class="form-group"><div class="form-label">Priority</div><select id="np-priority">' + priorOpts + '</select></div></div>' +
    '<div class="form-group"><div class="form-label">Description</div><textarea id="np-desc" placeholder="What is this project about?"></textarea></div>' +
    '<div class="form-group"><div class="form-label">Project manager</div><select id="np-pm">' + pmOpts + '</select></div>' +
    '<div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-primary" id="np-save"><i class="ti ti-plus"></i> Create project</button></div>');
  document.getElementById('np-save').onclick = function() {
    var name = document.getElementById('np-name').value.trim();
    if (!name) { showToast('Project name required'); return; }
    D.projects.push({ id:'p'+Date.now(), name:name, pm:document.getElementById('np-pm').value, team:[], status:'On Track', phase:'Discovery', progress:0, start:'', end:'', value:document.getElementById('np-value').value, priority:document.getElementById('np-priority').value, description:document.getElementById('np-desc').value, blockers:'', health:'green', stage:'active', plannedStart:'', requestId:'', milestones:[], tasks:[], raid:{risks:[],assumptions:[],issues:[],dependencies:[]} });
    closeModal(); showToast('Project created'); pgProjects();
  };
}

function pgRoadmap() {
  tb('Roadmap');
  var months = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
  var colors  = { p1:'#534AB7', p2:'#1D9E75', p3:'#EF9F27', p4:'#D85A30' };
  var offsets = { p1:0, p2:2, p3:3, p4:3.5 };
  var durs    = { p1:6, p2:6, p3:4, p4:8.5 };
  var all = D.projects.filter(function(p){ return p.stage === 'active' || p.stage === 'planned'; });
  var bars = all.map(function(p) {
    return '<div class="tl-row"><div class="tl-label" title="' + p.name + '">' + p.name + '</div>' +
      '<div class="tl-wrap"><div class="tl-bar" style="left:' + ((offsets[p.id]||0)/12*100) + '%;width:' + ((durs[p.id]||3)/12*100) + '%;background:' + (colors[p.id]||'#534AB7') + '">' + p.phase + '</div></div></div>';
  }).join('');
  var msRows = [];
  D.projects.filter(function(p){ return p.stage === 'active'; }).forEach(function(p) {
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

function pgResources() {
  tb('Resources & capacity');
  var over = D.resources.filter(function(r){ return r.allocated >= 100; }).length;
  var warn = D.resources.filter(function(r){ return r.allocated >= 80 && r.allocated < 100; }).length;
  var rows = D.resources.map(function(r) {
    var pct = r.allocated;
    var c   = pct >= 100 ? '#E24B4A' : pct >= 80 ? '#EF9F27' : '#1D9E75';
    var ini = r.name.split(' ').map(function(x){ return x[0]; }).join('');
    var projs = r.projects.map(function(pid){ var p = D.projects.find(function(x){ return x.id === pid; }); return p ? p.name : pid; }).join(', ');
    return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
      (r.type === 'team'
        ? '<div style="width:30px;height:30px;border-radius:8px;background:#E6F1FB;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-users" style="font-size:15px;color:#185FA5"></i></div>'
        : '<div class="avatar av-purple" style="flex-shrink:0">' + ini + '</div>') +
      '<div style="width:175px;min-width:175px"><div style="font-size:13px;font-weight:600">' + r.name + '</div><div class="text-muted">' + r.role + ' &bull; ' + (r.type === 'team' ? 'Team' : 'Individual') + '</div></div>' +
      '<div style="flex:1"><div style="display:flex;justify-content:space-between;font-size:12px;color:#777;margin-bottom:4px"><span>' + (projs || 'Unassigned') + '</span><span style="font-weight:600;color:' + c + '">' + pct + '%</span></div>' +
      '<div style="height:10px;background:#f0ede8;border-radius:5px;overflow:hidden"><div style="height:100%;border-radius:5px;background:' + c + ';width:' + Math.min(pct,100) + '%"></div></div></div></div>';
  }).join('');

  document.getElementById('content').innerHTML =
    '<div class="grid-3 mb-16">' +
      '<div class="metric"><div class="metric-label">Total resources</div><div class="metric-value">' + D.resources.length + '</div><div class="metric-sub">' + D.resources.filter(function(r){ return r.type==='team'; }).length + ' teams, ' + D.resources.filter(function(r){ return r.type==='individual'; }).length + ' individuals</div></div>' +
      '<div class="metric"><div class="metric-label">At capacity</div><div class="metric-value" style="color:#A32D2D">' + over + '</div><div class="metric-sub">100%+ allocated</div></div>' +
      '<div class="metric"><div class="metric-label">Near capacity</div><div class="metric-value" style="color:#854F0B">' + warn + '</div><div class="metric-sub">80–99% allocated</div></div>' +
    '</div>' +
    '<div class="card"><div class="section-title">Capacity by resource</div>' + rows +
    '<div class="divider"></div><div style="display:flex;gap:16px;font-size:12px;color:#777">' +
      '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#1D9E75;margin-right:4px"></span>Available</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#EF9F27;margin-right:4px"></span>Near capacity</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#E24B4A;margin-right:4px"></span>Over capacity</span>' +
    '</div></div>';
}

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
    '<div class="form-group"><div class="form-label">Business description *</div><div class="form-sub">What is the problem or opportunity?</div><textarea id="f-desc" rows="4" placeholder="Describe the situation and why this project is needed…"></textarea></div>' +
    '<div class="form-group"><div class="form-label">Impact &amp; value proposition *</div><div class="form-sub">What measurable outcomes do you expect?</div><textarea id="f-impact" rows="3" placeholder="e.g. Reduce support tickets by 25%, saving ~$80k annually…"></textarea></div>' +
    '<div class="form-group"><div class="form-label">Estimated cost (optional)</div><input type="text" id="f-cost" placeholder="e.g. $50,000"></div>' +
    '<div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" id="f-submit"><i class="ti ti-send"></i> Submit request</button></div></div>';
  document.getElementById('f-submit').onclick = function() {
    var t = document.getElementById('f-title').value.trim();
    var d = document.getElementById('f-desc').value.trim();
    var i = document.getElementById('f-impact').value.trim();
    if (!t || !d || !i) { showToast('Please fill in all required fields'); return; }
    D.requests.push({ id:'r'+Date.now(), title:t, submitter:'Current User', dept:document.getElementById('f-dept').value, date:new Date().toISOString().split('T')[0], status:'pending', priority:document.getElementById('f-priority').value, value:document.getElementById('f-value').value, impact:i, description:d, effort:document.getElementById('f-effort').value, cost:document.getElementById('f-cost').value||'—', feedback:'' });
    showToast('Request submitted successfully');
    renderNav();
    pgMyRequests();
  };
}

function pgMyRequests() {
  tb('My requests');
  var mine = D.requests.filter(function(r){ return ['Current User','Sarah Chen','Priya Patel','Tom Walsh','Jess Kim'].indexOf(r.submitter) >= 0; });
  var myNotifs = D.notifications.filter(function(n){ return ['Current User','Sarah Chen','Priya Patel','Tom Walsh'].indexOf(n.submitter) >= 0; });
  var html = '';
  if (myNotifs.length) html += myNotifs.map(function(n){
    return '<div class="notif-banner"><i class="ti ti-bell" style="font-size:20px;flex-shrink:0"></i><div><div style="font-weight:600;margin-bottom:3px">' + (n.type==='planned'?'Project scheduled':'Request update') + '</div>' + n.msg + '</div></div>';
  }).join('');
  if (!mine.length) { html += '<div class="empty-state"><i class="ti ti-inbox"></i><p>No requests yet</p></div>'; document.getElementById('content').innerHTML = html; return; }
  html += '<div class="card"><div class="table-wrap"><table><thead><tr><th>Title</th><th>Date</th><th>Priority</th><th>Status</th><th>PMO feedback</th></tr></thead><tbody>' +
    mine.map(function(r){
      return '<tr><td class="bold">' + r.title + '</td><td class="text-muted">' + r.date + '</td><td>' + bdg(r.priority) + '</td><td>' + bdg(r.status) + '</td><td style="font-size:12px;color:#777;max-width:220px">' + (r.feedback || '—') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
  document.getElementById('content').innerHTML = html;
}

// ── Boot ────────────────────────────────────────────────────────────────────
renderNav();
nav('dashboard');
