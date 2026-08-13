// Vercel serverless function — handles actions that require Supabase's admin
// API (creating new users with a password set directly, admin-forced password
// changes, deactivating/reactivating accounts). These can never be done safely
// from the browser, since they require the service role key, which must never
// be shipped to client-side code. This function holds that key server-side
// only, and independently re-checks that the caller is really a logged-in
// Admin before doing anything, regardless of what the app's UI already
// checked on its end.
//
// None of these actions send any email — accounts are created with a password
// set directly by the admin, and password resets work the same way, entirely
// sidestepping Supabase's very limited default email sending.

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  var body = req.body || {};
  var action = body.action;
  var accessToken = body.accessToken;

  if (!accessToken) {
    res.status(400).json({ error: 'Missing accessToken' });
    return;
  }

  var supabaseUrl = process.env.SUPABASE_URL;
  var serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
    return;
  }

  var adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Verify the caller is a real, currently logged-in Admin before doing anything.
  var userResult = await adminClient.auth.getUser(accessToken);
  if (userResult.error || !userResult.data || !userResult.data.user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  var callerId = userResult.data.user.id;

  var profileResult = await adminClient.from('profiles').select('role').eq('id', callerId).single();
  if (profileResult.error || !profileResult.data || profileResult.data.role !== 'admin') {
    res.status(403).json({ error: 'Only PMO Admins can perform this action' });
    return;
  }

  if (action === 'list-logins') {
    var listResult = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listResult.error) { res.status(400).json({ error: listResult.error.message }); return; }
    var logins = (listResult.data.users || []).map(function(u) { return { id: u.id, lastSignInAt: u.last_sign_in_at || null }; });
    res.status(200).json({ success: true, logins: logins });
    return;
  }

  if (action === 'create') {
    var email = body.email;
    var firstName = body.firstName || '';
    var lastName = body.lastName || '';
    var role = body.role;
    var password = body.password;
    if (!email) { res.status(400).json({ error: 'Missing email' }); return; }
    if (!password || password.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters' }); return; }

    var createResult = await adminClient.auth.admin.createUser({
      email: email, password: password, email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName }
    });
    if (createResult.error) { res.status(400).json({ error: createResult.error.message }); return; }

    if (role && createResult.data && createResult.data.user) {
      await adminClient.from('profiles').update({ role: role }).eq('id', createResult.data.user.id);
    }
    res.status(200).json({ success: true, userId: createResult.data.user ? createResult.data.user.id : null });
    return;
  }

  if (action === 'set-password') {
    var targetUserId = body.userId;
    var newPassword = body.newPassword;
    if (!targetUserId || !newPassword) { res.status(400).json({ error: 'Missing userId or newPassword' }); return; }
    if (newPassword.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters' }); return; }

    var pwResult = await adminClient.auth.admin.updateUserById(targetUserId, { password: newPassword });
    if (pwResult.error) { res.status(400).json({ error: pwResult.error.message }); return; }
    res.status(200).json({ success: true });
    return;
  }

  if (action === 'deactivate' || action === 'reactivate') {
    var userId = body.userId;
    if (!userId) { res.status(400).json({ error: 'Missing userId' }); return; }
    if (userId === callerId) { res.status(400).json({ error: 'You cannot deactivate your own account' }); return; }

    var banDuration = action === 'deactivate' ? '876000h' : 'none';
    var updateResult = await adminClient.auth.admin.updateUserById(userId, { ban_duration: banDuration });
    if (updateResult.error) { res.status(400).json({ error: updateResult.error.message }); return; }
    await adminClient.from('profiles').update({ is_active: action === 'reactivate' }).eq('id', userId);
    res.status(200).json({ success: true });
    return;
  }

  res.status(400).json({ error: 'Unknown action: ' + action });
};
