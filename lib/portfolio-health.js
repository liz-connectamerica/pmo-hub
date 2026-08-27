// Pure data layer behind the Portfolio Health page. No DOM, no Supabase client
// -- just plain functions over plain data, so the exact same computation runs
// both in the browser (the live page, fed D.projects) and in the
// capture-portfolio-snapshot serverless function (fed its own lean server-side
// query), via the dual export at the bottom of this file. Adding a 9th card
// later means editing computePortfolioHealthSnapshot in this one place; both
// the live page and every future snapshot pick it up automatically. The one
// thing that ISN'T automatic: if a new card needs a project/task/todo/raid
// field the server-side capture query doesn't select yet, that query needs a
// matching update (see api/capture-portfolio-snapshot.js).
//
// Small pure date/RAID helpers are duplicated here rather than shared with
// app.js's copies, since those also serve call sites outside Portfolio Health
// and this file has to stand alone in a Node serverless function with no
// access to app.js's globals.

function phTodayStr() { return new Date().toISOString().slice(0, 10); }
function phIsProjectLate(p) { return !!(p.end && p.stage !== 'complete' && p.end < phTodayStr()); }
function phIsTaskLate(t) { return !!(t.end && t.status !== 'Done' && t.end < phTodayStr()); }
function phIsTodoLate(td) { return !!(td.due && td.status !== 'Done' && td.due < phTodayStr()); }
function phDaysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function phDaysLate(p) { return Math.round((new Date(phTodayStr()) - new Date(p.end)) / 86400000); }

function phRiskEffectiveSeverity(risk) {
  var impactWeight = { Low:1, Medium:2, High:3 }[risk.impact] || 2;
  var probBand = (risk.probability||0) >= 67 ? 3 : (risk.probability||0) >= 34 ? 2 : 1;
  var score = impactWeight * probBand;
  return score >= 6 ? 'High' : score >= 3 ? 'Medium' : 'Low';
}

function phRaidOpenedDate(item) {
  var created = (item.log || []).filter(function(l){ return l.action === 'Created'; })[0];
  if (created) return created.date;
  var dates = (item.log || []).map(function(l){ return l.date; }).filter(Boolean).sort();
  return dates.length ? dates[0] : null;
}

// projects: array shaped like D.projects (id, name, stage, health, owner,
// sponsor, description, start, end, createdAt, tasks[], todos[], raid:{risks,issues}).
// lastTouched: { [projectId]: isoTimestamp } -- latest project_change_log entry
// per project, however the caller sourced it.
function computePortfolioHealthSnapshot(projects, lastTouched) {
  lastTouched = lastTouched || {};
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

  // 3. Late projects, by stage
  var lateProjects = projects.filter(phIsProjectLate);
  var LATE_STAGE_META = [
    { key:'active', label:'Active' }, { key:'planned', label:'Planned' },
    { key:'backlog', label:'Backlog' }, { key:'hold', label:'Hold' }
  ];
  var lateBars = LATE_STAGE_META.map(function(s) {
    var rows = lateProjects.filter(function(p){ return p.stage === s.key; });
    return { key:s.key, label:s.label, count:rows.length, color:'#E24B4A', rows:rows };
  });

  // 3b. Late plan tasks & to-dos, projects bucketed by how many they have
  var lateCountByProject = {};
  projects.forEach(function(p) {
    var count = 0;
    (p.tasks || []).forEach(function(t){ if (phIsTaskLate(t)) count++; });
    (p.todos || []).forEach(function(td){ if (phIsTodoLate(td)) count++; });
    if (count > 0) { lateCountByProject[p.id] = count; p._lateTaskCount = count; }
  });
  var LATE_TASK_BUCKETS = [
    { key:'20', label:'20+ late tasks', color:'#E24B4A', test:function(c){ return c >= 20; } },
    { key:'10', label:'10–19 late tasks', color:'#ec835a', test:function(c){ return c >= 10 && c < 20; } },
    { key:'5', label:'5–9 late tasks', color:'#EF9F27', test:function(c){ return c >= 5 && c < 10; } },
    { key:'1', label:'1–4 late tasks', color:'#5598e7', test:function(c){ return c >= 1 && c < 5; } }
  ];
  var lateTaskBars = LATE_TASK_BUCKETS.map(function(b) {
    var rows = projects.filter(function(p){ return lateCountByProject[p.id] != null && b.test(lateCountByProject[p.id]); })
      .sort(function(a, c){ return lateCountByProject[c.id] - lateCountByProject[a.id]; });
    return { key:b.key, label:b.label, count:rows.length, color:b.color, rows:rows };
  });
  var projectsWithLateTasks = Object.keys(lateCountByProject).length;

  // 4. Open risks & issues, by severity
  var openEntries = [];
  projects.forEach(function(p) {
    (p.raid && p.raid.risks || []).forEach(function(r) {
      if (r.status !== 'Open') return;
      openEntries.push({ project:{ id:p.id, name:p.name }, kind:'Risk', title:r.desc, severity:phRiskEffectiveSeverity(r), opened:phRaidOpenedDate(r) });
    });
    (p.raid && p.raid.issues || []).forEach(function(r) {
      if (r.status !== 'Open') return;
      openEntries.push({ project:{ id:p.id, name:p.name }, kind:'Issue', title:r.desc, severity:r.severity || 'Medium', opened:phRaidOpenedDate(r) });
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

  // 5. Missing owner / sponsor
  var missingScope = projects.filter(function(p){ return p.stage !== 'complete'; });
  var missingBars = [
    { key:'owner', label:'No Owner', rows:missingScope.filter(function(p){ return !p.owner; }) },
    { key:'sponsor', label:'No Sponsor', rows:missingScope.filter(function(p){ return !p.sponsor; }) }
  ].map(function(b){ b.count = b.rows.length; b.color = '#EF9F27'; return b; });
  var missingAll = missingScope.filter(function(p){ return !p.owner || !p.sponsor; });

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
  var loadAll = loadScope.slice().sort(function(a, b){ return a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name); });

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
    p._staleDays = touched ? phDaysSince(touched) : null;
  });
  var trueStaleCount = activeProjects.filter(function(p){ return p._staleDays != null && p._staleDays >= 30; }).length;
  var staleBars = STALE_BUCKETS.map(function(b) {
    var rows = activeProjects.filter(function(p){ return p._staleDays != null && b.test(p._staleDays); });
    return { key:b.key, label:b.label, count:rows.length, color:b.color, rows:rows };
  });

  // 8. Blank fields, active projects
  var FIELD_CHECKS = [
    { key:'description', label:'Description', test:function(p){ return !p.description; } },
    { key:'end', label:'End date', test:function(p){ return !p.end; } },
    { key:'start', label:'Start date', test:function(p){ return !p.start; } },
    { key:'owner', label:'Owner', test:function(p){ return !p.owner; } },
    { key:'sponsor', label:'Sponsor', test:function(p){ return !p.sponsor; } },
    { key:'health', label:'Health', test:function(p){ return !p.health; } }
  ];
  activeProjects.forEach(function(p) {
    p._blankFields = FIELD_CHECKS.filter(function(f){ return f.test(p); }).map(function(f){ return f.key; });
  });
  var blankBars = FIELD_CHECKS.map(function(f) {
    var rows = activeProjects.filter(f.test);
    var pct = activeProjects.length ? Math.round(rows.length / activeProjects.length * 100) : 0;
    return { key:f.key, label:f.label, count:rows.length, valueLabel:pct + '%', color:'#256abf', rows:rows };
  }).sort(function(a, b){ return b.count - a.count; });
  var blankAll = activeProjects.filter(function(p){ return p._blankFields.length > 0; });

  return {
    totalCount: projects.length,
    activeCount: activeProjects.length,
    funnel: { bars: funnelBars },
    rag: { bars: ragBars, redCount: redCount },
    late: { bars: lateBars, count: lateProjects.length },
    lateTasks: { bars: lateTaskBars, projectsAffected: projectsWithLateTasks },
    risk: { bars: riskBars, total: openEntries.length },
    missing: { bars: missingBars, allRows: missingAll },
    load: { bars: allLoadBars.slice(0, 8), allRows: loadAll, overThreshold: overThreshold, threshold: OWNER_LOAD_THRESHOLD },
    stale: { bars: staleBars, trueStaleCount: trueStaleCount },
    blank: { bars: blankBars, allRows: blankAll }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computePortfolioHealthSnapshot: computePortfolioHealthSnapshot };
} else {
  window.PortfolioHealth = { computePortfolioHealthSnapshot: computePortfolioHealthSnapshot };
}
