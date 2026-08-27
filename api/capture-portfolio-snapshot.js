// Captures the current Portfolio Health dashboard into portfolio_health_snapshots,
// either on a schedule (Vercel Cron, GET, authenticated via CRON_SECRET) or
// on demand from an admin (POST, same accessToken pattern as admin-users.js).
// One row per calendar month -- a manual capture upserts on conflict, which
// doubles as "backfill a missed month" and "re-capture this month."
//
// Runs its own lean queries rather than reusing the client's loadAllProjects()
// (that pulls milestones, docs, baselines, comments, checklists -- none of
// which Portfolio Health touches). If a future card needs a field this
// doesn't select yet, add it here to match.

const { createClient } = require('@supabase/supabase-js');
const { computePortfolioHealthSnapshot } = require('../lib/portfolio-health.js');

function firstOfMonth(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10); }

module.exports = async (req, res) => {
  var supabaseUrl = process.env.SUPABASE_URL;
  var serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
    return;
  }
  var adminClient = createClient(supabaseUrl, serviceRoleKey);

  var source, capturedBy = null, capturedByName = null, periodMonth = firstOfMonth(new Date());

  var cronSecret = process.env.CRON_SECRET;
  var authHeader = req.headers.authorization || '';
  if (cronSecret && authHeader === 'Bearer ' + cronSecret) {
    source = 'cron';
  } else {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    var body = req.body || {};
    var accessToken = body.accessToken;
    if (!accessToken) { res.status(401).json({ error: 'Missing accessToken' }); return; }

    var userResult = await adminClient.auth.getUser(accessToken);
    if (userResult.error || !userResult.data || !userResult.data.user) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }
    var callerId = userResult.data.user.id;
    var profileResult = await adminClient.from('profiles').select('role, display_name').eq('id', callerId).single();
    if (profileResult.error || !profileResult.data || profileResult.data.role !== 'admin') {
      res.status(403).json({ error: 'Only PMO Admins can capture a snapshot' });
      return;
    }
    source = 'manual';
    capturedBy = callerId;
    capturedByName = profileResult.data.display_name;
    if (body.periodMonth) periodMonth = body.periodMonth;
  }

  var results = await Promise.all([
    adminClient.from('projects').select('id, name, stage, health, owner_name, owner_id, sponsor, description, start_date, end_date, created_at').is('deleted_at', null),
    adminClient.from('resources').select('id, name'),
    adminClient.from('tasks').select('project_id, status, end_date'),
    adminClient.from('todo_items').select('project_id, status, due_date'),
    adminClient.from('raid_items').select('id, project_id, type, status, description, severity, probability, impact'),
    adminClient.from('raid_log').select('raid_item_id, action, logged_at'),
    adminClient.from('project_change_log').select('project_id, changed_at')
  ]);
  for (var i = 0; i < results.length; i++) {
    if (results[i].error) { res.status(500).json({ error: 'Query failed: ' + results[i].error.message }); return; }
  }
  var projectRows = results[0].data || [];
  var resourceRows = results[1].data || [];
  var taskRows = results[2].data || [];
  var todoRows = results[3].data || [];
  var raidRows = results[4].data || [];
  var raidLogRows = results[5].data || [];
  var changeLogRows = results[6].data || [];

  var resourceNameById = {};
  resourceRows.forEach(function(r) { resourceNameById[r.id] = r.name; });

  function groupBy(rows, key) {
    var out = {};
    rows.forEach(function(r) { var k = r[key]; (out[k] = out[k] || []).push(r); });
    return out;
  }
  var tasksByProj = groupBy(taskRows, 'project_id');
  var todosByProj = groupBy(todoRows, 'project_id');
  var raidByProj = groupBy(raidRows, 'project_id');
  var raidLogByItem = groupBy(raidLogRows, 'raid_item_id');

  var lastTouched = {};
  changeLogRows.forEach(function(r) {
    if (!lastTouched[r.project_id] || r.changed_at > lastTouched[r.project_id]) lastTouched[r.project_id] = r.changed_at;
  });

  var projects = projectRows.map(function(pr) {
    var raid = { risks: [], issues: [] };
    (raidByProj[pr.id] || []).forEach(function(r) {
      var log = (raidLogByItem[r.id] || []).map(function(l) { return { date: (l.logged_at || '').slice(0, 10), action: l.action }; });
      if (r.type === 'risk') raid.risks.push({ desc: r.description, status: r.status, probability: r.probability, impact: r.impact, log: log });
      else if (r.type === 'issue') raid.issues.push({ desc: r.description, status: r.status, severity: r.severity, log: log });
    });
    return {
      id: pr.id, name: pr.name, stage: pr.stage, health: pr.health,
      owner: pr.owner_name || (pr.owner_id ? resourceNameById[pr.owner_id] : ''), sponsor: pr.sponsor,
      description: pr.description, start: pr.start_date, end: pr.end_date, createdAt: pr.created_at,
      tasks: (tasksByProj[pr.id] || []).map(function(t) { return { status: t.status, end: t.end_date }; }),
      todos: (todosByProj[pr.id] || []).map(function(td) { return { status: td.status, due: td.due_date }; }),
      raid: raid
    };
  });

  var snapshot = computePortfolioHealthSnapshot(projects, lastTouched);

  var upsertResult = await adminClient.from('portfolio_health_snapshots').upsert({
    period_month: periodMonth, source: source, captured_by: capturedBy, captured_by_name: capturedByName, data: snapshot
  }, { onConflict: 'period_month' }).select('id, period_month').single();
  if (upsertResult.error) { res.status(500).json({ error: 'Could not save snapshot: ' + upsertResult.error.message }); return; }

  res.status(200).json({ success: true, periodMonth: upsertResult.data.period_month });
};
