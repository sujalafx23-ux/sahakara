/**
 * SAHAKARA — Admin Portal Controller & Realtime Manager
 * Implements 8 management interfaces, live telemetry, and audit trail.
 */

// Global Admin State
let sbAdmin = null;
let currentAdmin = null;
let adminDonations = [];
let adminOrders = [];
let adminRecipients = [];
let adminCities = [];
let adminAuditLogs = [];
let currentDrawerDonation = null;

let drawerMap = null;
let drawerPolyline = null;
let recPickerMap = null;
let recPickerMarker = null;

// Realtime Alert Stack
let activeAlerts = [];

/* ==========================================================================
   INITIALIZATION & AUTHENTICATION GUARD
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  initSupabaseAdmin();

  // Strict Auth Guard: Require Supabase Auth and role = 'admin' from profiles
  const isAuthorized = await verifyAdminAuth();
  if (!isAuthorized) {
    redirectToAdminLogin();
    return;
  }

  // Display admin portal body once authorized
  document.body.style.opacity = '1';

  // Load Seed & Live Data ONLY after admin auth is verified
  await Promise.all([
    loadAdminCities(),
    loadAdminRecipients(),
    loadAdminDonations(),
    loadAdminAuditLogs()
  ]);

  setupAdminRealtime();
  loadAdminOrders();
  renderOverviewMetrics();
  renderOverviewCharts();
  renderDonationsTable();
  renderAdminOrders();
  renderLadderBoard();
  renderRecipientsTable();
  renderVerificationQueue();
  renderCitiesTable();
  renderAuditTable();
});

async function verifyAdminAuth() {
  if (!sbAdmin || !sbAdmin.auth) {
    console.warn('[Admin Guard] Supabase client unavailable.');
    return false;
  }

  try {
    // 1. Require active Supabase Auth user session
    const { data: { user }, error: authError } = await sbAdmin.auth.getUser();
    if (authError || !user) {
      console.warn('[Admin Guard] No active Supabase Auth session.');
      return false;
    }

    // 2. Require role = 'admin' from public.profiles table
    const { data: profile, error: profileError } = await sbAdmin
      .from('profiles')
      .select('id, email, role, name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[Admin Guard] Failed to query profiles table:', profileError.message);
      return false;
    }

    const role = profile?.role || user.user_metadata?.role;
    if (role !== 'admin') {
      console.warn('[Admin Guard] Access denied: User role is not admin:', role);
      return false;
    }

    currentAdmin = {
      id: user.id,
      email: user.email || profile?.email,
      name: profile?.name || user.user_metadata?.name || 'Administrator',
      role: 'admin'
    };

    const nameEl = document.getElementById('sidebar-admin-name');
    const emailEl = document.getElementById('sidebar-admin-email');
    if (nameEl) nameEl.textContent = currentAdmin.name;
    if (emailEl) emailEl.textContent = currentAdmin.email;

    localStorage.setItem('sahakara_admin_user', JSON.stringify(currentAdmin));
    return true;
  } catch (err) {
    console.error('[Admin Guard] Verification exception:', err);
    return false;
  }
}

function redirectToAdminLogin() {
  localStorage.removeItem('sahakara_admin_user');
  localStorage.removeItem('sahakara_admin_token');
  const target = window.location.pathname.startsWith('/admin') ? '/admin/login' : 'login.html';
  window.location.replace(target);
}

function adminLogout() {
  localStorage.removeItem('sahakara_admin_user');
  localStorage.removeItem('sahakara_admin_token');
  if (sbAdmin && sbAdmin.auth) {
    sbAdmin.auth.signOut().catch(() => { });
  }
  redirectToAdminLogin();
}

function initSupabaseAdmin() {
  if (window.SahakaraConfig) {
    sbAdmin = window.SahakaraConfig.getClient();
  }
}

/* ==========================================================================
   TAB NAVIGATION
   ========================================================================== */
function switchAdminTab(tabName, clickedBtn) {
  // Update sidebar active classes
  document.querySelectorAll('.admin-nav-link').forEach((btn) => btn.classList.remove('active'));
  if (clickedBtn) clickedBtn.classList.add('active');

  // Toggle View Containers
  const views = ['overview', 'donations', 'ladder', 'recipients', 'verification', 'cities', 'reports', 'audit', 'orders'];
  views.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.hidden = v !== tabName;
  });

  // Update Page Title
  const titles = {
    overview: 'Logistics Overview',
    donations: 'Live Dispatch Telemetry',
    ladder: 'Dynamic Ladder Monitor',
    recipients: 'Recipient Nodes Network',
    verification: 'Node Verification Queue',
    cities: 'Expansion Cluster Cities',
    reports: 'Compliance Reports & Certificates',
    audit: 'Administrative Action Trail',
    orders: 'Active Orders & Dispatch Coordination (Admin Only)'
  };

  const headingEl = document.getElementById('page-heading-title');
  if (headingEl) headingEl.textContent = titles[tabName] || 'Admin Dashboard';

  // Render Charts if switched to Overview, or Orders table if switched to Orders
  if (tabName === 'overview') {
    renderOverviewCharts();
  } else if (tabName === 'orders') {
    renderAdminOrders();
  }
}

/* ==========================================================================
   DATA LOADERS & REALTIME SYNC
   ========================================================================== */
async function loadAdminCities() {
  if (sbAdmin) {
    try {
      const { data, error } = await sbAdmin.from('cities').select('*').order('name');
      if (!error && data) {
        adminCities = data;
        return;
      }
    } catch (e) { }
  }

  // Fallback only if offline / disconnected
  adminCities = [
    { id: 'city-jaipur', name: 'Jaipur', status: 'Live' },
    { id: 'city-delhi', name: 'Delhi NCR', status: 'Live' },
    { id: 'city-blr', name: 'Bengaluru', status: 'Live' },
    { id: 'city-mumbai', name: 'Mumbai', status: 'Coming soon' },
    { id: 'city-hyd', name: 'Hyderabad', status: 'Coming soon' }
  ];
}

async function loadAdminRecipients() {
  if (sbAdmin) {
    try {
      const { data, error } = await sbAdmin.from('recipients').select('*').order('name');
      if (!error && data) {
        adminRecipients = data;
        return;
      }
    } catch (e) { }
  }

  // Fallback only if offline / disconnected
  adminRecipients = [];
}

async function loadAdminDonations() {
  if (sbAdmin) {
    try {
      const { data, error } = await sbAdmin.from('donations').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        adminDonations = data;
        return;
      }
    } catch (e) { }
  }

  // Fallback only if offline / disconnected
  adminDonations = [];
}

async function loadAdminAuditLogs() {
  if (sbAdmin) {
    try {
      const { data, error } = await sbAdmin.from('audit_log').select('*').order('created_at', { ascending: false }).limit(50);
      if (!error && data) {
        adminAuditLogs = data;
        return;
      }
    } catch (e) { }
  }

  adminAuditLogs = [
    {
      id: 'log-01',
      admin_email: 'admin@sahakara.org',
      action: 'REASSIGN_RECIPIENT',
      target: 'Donation #SK-4419',
      details: { from: 'rec-ananda', to: 'rec-akshaya-patra', reason: 'Capacity Surge' },
      created_at: new Date(Date.now() - 12 * 60000).toISOString()
    },
    {
      id: 'log-02',
      admin_email: 'admin@sahakara.org',
      action: 'APPROVE_NODE',
      target: 'Node rec-ananda',
      details: { status: 'Approved', verified: true },
      created_at: new Date(Date.now() - 120 * 60000).toISOString()
    }
  ];
}

function setupAdminRealtime() {
  if (!sbAdmin) return;

  try {
    sbAdmin
      .channel('public:admin_donations_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === 'INSERT') {
          adminDonations.unshift(newRow);
          // Check for Stage 3 alert
          if (newRow.stage >= 3 || !newRow.match_id) {
            triggerFoodSafetyAlert(newRow);
          }
        } else if (eventType === 'UPDATE') {
          const idx = adminDonations.findIndex((d) => d.id === newRow.id);
          if (idx !== -1) adminDonations[idx] = newRow;
        } else if (eventType === 'DELETE') {
          adminDonations = adminDonations.filter((d) => d.id !== oldRow.id);
        }

        renderOverviewMetrics();
        renderDonationsTable();
        renderLadderBoard();
      })
      .subscribe();
  } catch (e) { }
}

/* ==========================================================================
   OVERVIEW METRICS & CHARTS
   ========================================================================== */
function renderOverviewMetrics() {
  const activeDonations = adminDonations.filter((d) => d.status === 'Posted' || d.status === 'Matched' || d.status === 'Picked up');
  const deliveredDonations = adminDonations.filter((d) => d.status === 'Delivered');
  const expiredDonations = adminDonations.filter((d) => d.status === 'Expired');

  // Today's donations
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const donationsToday = adminDonations.filter((d) => new Date(d.created_at).getTime() >= todayStart).length;

  const totalMeals = deliveredDonations.reduce((acc, c) => acc + (Number(c.qty) || 0), 0);
  const totalKg = Math.round(totalMeals * 0.4);
  const totalCo2 = Math.round(totalKg * 2.5);

  const activeBadge = document.getElementById('badge-active-donations');
  if (activeBadge) activeBadge.textContent = activeDonations.length;

  const statToday = document.getElementById('stat-donations-today');
  const statMeals = document.getElementById('stat-meals-rescued');
  const statKg = document.getElementById('stat-kg-diverted');
  const statCo2 = document.getElementById('stat-co2-avoided');
  const statActive = document.getElementById('stat-active-donations');
  const statDumpster = document.getElementById('stat-dumpster-count');

  if (statToday) statToday.textContent = donationsToday;
  if (statMeals) statMeals.textContent = totalMeals.toLocaleString('en-IN');
  if (statKg) statKg.textContent = `${totalKg.toLocaleString('en-IN')} kg`;
  if (statCo2) statCo2.textContent = `${totalCo2.toLocaleString('en-IN')} kg`;
  if (statActive) statActive.textContent = activeDonations.length;
  if (statDumpster) statDumpster.textContent = expiredDonations.length;
}

function renderOverviewCharts() {
  // 1. 14-Day Velocity Canvas Line Chart
  const trendCanvas = document.getElementById('chart-donations-trend');
  if (trendCanvas) {
    const ctx = trendCanvas.getContext('2d');
    const width = trendCanvas.parentElement.clientWidth - 48;
    const height = 140;
    trendCanvas.width = width;
    trendCanvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (adminDonations.length === 0) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No donations recorded yet. New rescue postings will appear here.', width / 2, height / 2);
    } else {
      // Calculate daily points for last 14 days
      const days = 14;
      const points = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayStart = d.getTime();
        const dayEnd = dayStart + 86400000;
        const count = adminDonations.filter((don) => {
          const t = new Date(don.created_at).getTime();
          return t >= dayStart && t < dayEnd;
        }).length;
        points.push(count);
      }

      const maxVal = Math.max(...points, 5);
      const stepX = width / (points.length - 1);

      // Gradient Area
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
      grad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

      ctx.beginPath();
      points.forEach((val, i) => {
        const x = i * stepX;
        const y = height - (val / maxVal) * (height - 30) - 15;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.strokeStyle = '#0F7B5F';
      ctx.lineWidth = 3;
      points.forEach((val, i) => {
        const x = i * stepX;
        const y = height - (val / maxVal) * (height - 30) - 15;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Points
      points.forEach((val, i) => {
        const x = i * stepX;
        const y = height - (val / maxVal) * (height - 30) - 15;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#10B981';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  }

  // 2. City Distribution Bar Chart
  const cityCanvas = document.getElementById('chart-city-distribution');
  if (cityCanvas) {
    const ctx = cityCanvas.getContext('2d');
    const width = cityCanvas.parentElement.clientWidth - 48;
    const height = 140;
    cityCanvas.width = width;
    cityCanvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (adminDonations.length === 0) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No city telemetry available yet.', width / 2, height / 2);
    } else {
      const cityMap = {};
      adminDonations.forEach((d) => {
        const city = d.city || 'Unknown';
        cityMap[city] = (cityMap[city] || 0) + (Number(d.qty) || 0);
      });

      const cityEntries = Object.entries(cityMap);
      const totalMeals = cityEntries.reduce((acc, [, val]) => acc + val, 0) || 1;
      const barWidth = Math.min(60, width / (cityEntries.length * 2));
      const gap = (width - cityEntries.length * barWidth) / (cityEntries.length + 1);

      cityEntries.forEach(([cityName, qty], i) => {
        const pct = Math.round((qty / totalMeals) * 100);
        const x = gap + i * (barWidth + gap);
        const barH = Math.max(10, (pct / 100) * (height - 45));
        const y = height - barH - 24;

        ctx.fillStyle = i === 0 ? '#0F7B5F' : i === 1 ? '#3B82F6' : '#F59E0B';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barH, [6, 6, 0, 0]);
        } else {
          ctx.rect(x, y, barWidth, barH);
        }
        ctx.fill();

        ctx.fillStyle = '#64748B';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cityName, x + barWidth / 2, height - 8);
        ctx.fillText(`${qty} meals (${pct}%)`, x + barWidth / 2, y - 6);
      });
    }
  }
}

/* ==========================================================================
   LIVE DONATIONS TABLE & ACTIONS
   ========================================================================== */
function filterDonationsTable() {
  renderDonationsTable();
}

function renderDonationsTable() {
  const tbody = document.getElementById('admin-donations-tbody');
  if (!tbody) return;

  const search = (document.getElementById('filter-donation-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('filter-donation-status')?.value || 'all';
  const cityFilter = document.getElementById('filter-donation-city')?.value || 'all';

  const filtered = adminDonations.filter((d) => {
    const matchSearch =
      (d.food || '').toLowerCase().includes(search) ||
      (d.area || '').toLowerCase().includes(search) ||
      (d.otp || '').includes(search);
    const matchStatus = statusFilter === 'all' || (d.status || '').toLowerCase() === statusFilter.toLowerCase();
    const matchCity = cityFilter === 'all' || (d.city || '').toLowerCase() === cityFilter.toLowerCase();
    return matchSearch && matchStatus && matchCity;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted);">No donation records match the filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((d) => {
      const matched = adminRecipients.find((r) => r.id === d.match_id);
      const recipientName = matched ? matched.name : 'Unassigned / Searching...';
      const stage = d.stage || 1;
      const statusClass = (d.status || 'Posted').toLowerCase().replace(' ', '-');

      return `
      <tr>
        <td><span class="source-badge ${(d.source || 'Web').toLowerCase()}">${d.source || 'Web'}</span></td>
        <td><strong>${d.food}</strong><br><small style="color:var(--text-muted);">${d.qty} Meals &bull; ${d.food_category || 'cooked'}</small></td>
        <td>${d.city}<br><small style="color:var(--text-muted);">${d.area}</small></td>
        <td><span class="stage-tag s${stage}">Tier 0${stage}</span></td>
        <td><span class="status-pill ${statusClass}">${d.status}</span></td>
        <td title="${recipientName}"><strong>${recipientName.length > 20 ? recipientName.substring(0, 20) + '...' : recipientName}</strong></td>
        <td><code>${d.safe_minutes || 240}m safe</code></td>
        <td><code>${d.otp || '----'}</code></td>
        <td>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="openDonationDrawer('${d.id}')" title="Inspect Telemetry">
              <span>Inspect</span>
            </button>
            <button type="button" class="btn btn-danger btn-sm" onclick="markDonationExpired('${d.id}')" title="Mark Expired">
              <span>Expire</span>
            </button>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');
}

/* ==========================================================================
   DONATION SIDE DRAWER WITH OSRM LEAFLET MAP
   ========================================================================== */
function openDonationDrawer(donationId) {
  const donation = adminDonations.find((d) => d.id === donationId);
  if (!donation) return;

  currentDrawerDonation = donation;

  const drawer = document.getElementById('donation-drawer');
  drawer.hidden = false;

  document.getElementById('drawer-donation-title').textContent = donation.food;
  document.getElementById('drawer-batch-id').textContent = '#' + (donation.id || '').substring(0, 8).toUpperCase();
  document.getElementById('drawer-source').textContent = donation.source || 'Web';
  document.getElementById('drawer-otp').textContent = donation.otp || '4419';

  const statusSelect = document.getElementById('drawer-status-select');
  if (statusSelect) statusSelect.value = donation.status;

  // Populate reassign recipient select
  const reassignSelect = document.getElementById('drawer-reassign-select');
  if (reassignSelect) {
    reassignSelect.innerHTML = adminRecipients
      .map((r) => `<option value="${r.id}" ${r.id === donation.match_id ? 'selected' : ''}>${r.name} (${r.type.toUpperCase()} - Cap: ${r.capacity})</option>`)
      .join('');
  }

  // Initialize or update drawer Leaflet map
  setTimeout(() => {
    initDrawerMap(donation);
  }, 100);
}

function closeDonationDrawer() {
  const drawer = document.getElementById('donation-drawer');
  drawer.hidden = true;
}

function initDrawerMap(donation) {
  const container = document.getElementById('drawer-leaflet-map');
  if (!container || typeof L === 'undefined') return;

  if (!drawerMap) {
    drawerMap = L.map('drawer-leaflet-map', {
      center: [donation.lat || 27.1729, donation.lon || 75.9542],
      zoom: 12,
      zoomControl: false
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(drawerMap);
  } else {
    drawerMap.setView([donation.lat || 27.1729, donation.lon || 75.9542], 12);
    drawerMap.invalidateSize();
  }

  const donorCoords = [donation.lat || 27.1729, donation.lon || 75.9542];
  const matched = adminRecipients.find((r) => r.id === donation.match_id) || adminRecipients[0];
  const shelterCoords = matched ? [matched.lat, matched.lon] : [26.9248, 75.8267];

  if (drawerPolyline) drawerMap.removeLayer(drawerPolyline);

  drawerPolyline = L.polyline([donorCoords, shelterCoords], { color: '#0F7B5F', weight: 4, dashArray: '6, 6' }).addTo(drawerMap);
  drawerMap.fitBounds(drawerPolyline.getBounds(), { padding: [20, 20] });
}

async function saveDonationDrawerChanges() {
  if (!currentDrawerDonation) return;

  const newStatus = document.getElementById('drawer-status-select').value;
  const newMatchId = document.getElementById('drawer-reassign-select').value;

  currentDrawerDonation.status = newStatus;
  currentDrawerDonation.match_id = newMatchId;

  if (sbAdmin && !currentDrawerDonation.id.startsWith('sk-')) {
    try {
      await sbAdmin.from('donations').update({ status: newStatus, match_id: newMatchId }).eq('id', currentDrawerDonation.id);
    } catch (e) { }
  }

  await logAdminAction('UPDATE_DONATION', `Donation #${currentDrawerDonation.id.substring(0, 8)}`, {
    status: newStatus,
    match_id: newMatchId
  });

  closeDonationDrawer();
  renderDonationsTable();
  renderOverviewMetrics();
  renderLadderBoard();
}

async function markDonationExpired(donationId) {
  const confirmed = confirm('Mark this donation batch as EXPIRED? This moves it to Zero-Landfill compost logging.');
  if (!confirmed) return;

  const item = adminDonations.find((d) => d.id === donationId);
  if (item) {
    item.status = 'Expired';
    item.stage = 4;

    if (sbAdmin && !donationId.startsWith('sk-')) {
      try {
        await sbAdmin.from('donations').update({ status: 'Expired', stage: 4 }).eq('id', donationId);
      } catch (e) { }
    }

    await logAdminAction('MARK_EXPIRED', `Donation #${donationId.substring(0, 8)}`, { status: 'Expired' });
    renderDonationsTable();
    renderLadderBoard();
  }
}

/* ==========================================================================
   LADDER MONITOR KANBAN BOARD
   ========================================================================== */
function renderLadderBoard() {
  for (let s = 1; s <= 4; s++) {
    const colEl = document.getElementById(`ladder-col-${s}`);
    const countEl = document.getElementById(`count-stage-${s}`);
    if (!colEl) continue;

    const items = adminDonations.filter((d) => (d.stage || 1) === s && d.status !== 'Delivered' && d.status !== 'Expired');
    if (countEl) countEl.textContent = items.length;

    if (items.length === 0) {
      colEl.innerHTML = `<div style="text-align:center;padding:32px 12px;color:var(--text-muted);font-size:0.75rem;">No active batches in Tier 0${s}.</div>`;
      continue;
    }

    colEl.innerHTML = items
      .map((d) => {
        const matched = adminRecipients.find((r) => r.id === d.match_id);
        const isUrgent = s >= 3 || d.status === 'Posted';

        return `
        <div class="ladder-donation-card ${isUrgent ? 'at-risk' : ''}" onclick="openDonationDrawer('${d.id}')">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <strong style="font-size:0.8125rem;">${d.food}</strong>
            <span class="status-pill ${d.status.toLowerCase().replace(' ', '-')}">${d.status}</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">
            <span>${d.qty} Meals &bull; ${d.city}</span><br>
            <span>Target: <strong>${matched ? matched.name : 'Auto-Routing...'}</strong></span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.6875rem;">
            <code>OTP: ${d.otp}</code>
            <span style="color:${isUrgent ? '#EF4444' : '#10B981'};font-weight:700;">${s === 4 ? 'Bio-Compost Node' : isUrgent ? '⚠️ At Risk' : '✅ Stable'}</span>
          </div>
        </div>
      `;
      })
      .join('');
  }
}

/* ==========================================================================
   RECIPIENTS MANAGEMENT
   ========================================================================== */
function renderRecipientsTable() {
  const tbody = document.getElementById('admin-recipients-tbody');
  if (!tbody) return;

  tbody.innerHTML = adminRecipients
    .map(
      (r) => `
    <tr>
      <td><code>${r.id}</code></td>
      <td><strong>${r.name}</strong><br><small style="color:var(--brand-green);text-transform:uppercase;font-weight:700;">${r.type} node</small></td>
      <td>${r.city}</td>
      <td><strong>${r.capacity} meals</strong></td>
      <td><code>${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}</code></td>
      <td>${r.verified ? '<span style="color:#0F7B5F;font-weight:700;">✓ Verified</span>' : '<span style="color:#EF4444;">Pending</span>'}</td>
      <td><span class="status-pill ${r.status.toLowerCase()}">${r.status}</span></td>
      <td>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="editRecipient('${r.id}')">Edit</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="deleteRecipient('${r.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `
    )
    .join('');
}

function openRecipientModal(editId = null) {
  const modal = document.getElementById('modal-recipient');
  modal.hidden = false;

  document.getElementById('recipient-modal-heading').textContent = editId ? 'Edit Recipient Node' : 'Add Recipient Node';
  document.getElementById('rec-edit-id').value = editId || '';

  if (editId) {
    const rec = adminRecipients.find((r) => r.id === editId);
    if (rec) {
      document.getElementById('rec-name').value = rec.name;
      document.getElementById('rec-type').value = rec.type;
      document.getElementById('rec-city').value = rec.city;
      document.getElementById('rec-capacity').value = rec.capacity;
      document.getElementById('rec-lat').value = rec.lat;
      document.getElementById('rec-lon').value = rec.lon;
      document.getElementById('rec-needs-note').value = rec.needs_note || '';
    }
  } else {
    document.getElementById('recipient-form').reset();
    document.getElementById('rec-lat').value = '26.9124';
    document.getElementById('rec-lon').value = '75.8200';
  }

  setTimeout(() => initRecPickerMap(), 100);
}

function closeRecipientModal() {
  document.getElementById('modal-recipient').hidden = true;
}

function initRecPickerMap() {
  const container = document.getElementById('rec-picker-map');
  if (!container || typeof L === 'undefined') return;

  const lat = parseFloat(document.getElementById('rec-lat').value) || 26.9124;
  const lon = parseFloat(document.getElementById('rec-lon').value) || 75.8200;

  if (!recPickerMap) {
    recPickerMap = L.map('rec-picker-map', {
      center: [lat, lon],
      zoom: 12
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(recPickerMap);

    recPickerMarker = L.marker([lat, lon], { draggable: true }).addTo(recPickerMap);

    recPickerMap.on('click', (e) => {
      recPickerMarker.setLatLng(e.latlng);
      document.getElementById('rec-lat').value = e.latlng.lat.toFixed(4);
      document.getElementById('rec-lon').value = e.latlng.lng.toFixed(4);
    });

    recPickerMarker.on('dragend', () => {
      const pos = recPickerMarker.getLatLng();
      document.getElementById('rec-lat').value = pos.lat.toFixed(4);
      document.getElementById('rec-lon').value = pos.lng.toFixed(4);
    });
  } else {
    recPickerMap.setView([lat, lon], 12);
    recPickerMarker.setLatLng([lat, lon]);
    recPickerMap.invalidateSize();
  }
}

async function handleSaveRecipient(e) {
  e.preventDefault();
  const editId = document.getElementById('rec-edit-id').value;
  const payload = {
    id: editId || 'rec-' + Math.random().toString(36).substring(2, 8),
    name: document.getElementById('rec-name').value.trim(),
    type: document.getElementById('rec-type').value,
    city: document.getElementById('rec-city').value,
    capacity: parseFloat(document.getElementById('rec-capacity').value),
    lat: parseFloat(document.getElementById('rec-lat').value),
    lon: parseFloat(document.getElementById('rec-lon').value),
    needs_note: document.getElementById('rec-needs-note').value.trim(),
    verified: true,
    status: 'Approved'
  };

  if (editId) {
    const idx = adminRecipients.findIndex((r) => r.id === editId);
    if (idx !== -1) adminRecipients[idx] = payload;
  } else {
    adminRecipients.push(payload);
  }

  if (sbAdmin) {
    try {
      await sbAdmin.from('recipients').upsert([payload]);
    } catch (err) { }
  }

  await logAdminAction(editId ? 'UPDATE_RECIPIENT' : 'CREATE_RECIPIENT', payload.name, payload);
  closeRecipientModal();
  renderRecipientsTable();
}

async function deleteRecipient(id) {
  if (!confirm('Are you sure you want to remove this recipient node?')) return;
  adminRecipients = adminRecipients.filter((r) => r.id !== id);

  if (sbAdmin) {
    try {
      await sbAdmin.from('recipients').delete().eq('id', id);
    } catch (e) { }
  }

  await logAdminAction('DELETE_RECIPIENT', `Node ${id}`, { id });
  renderRecipientsTable();
}

/* ==========================================================================
   VERIFICATION QUEUE
   ========================================================================== */
function renderVerificationQueue() {
  const tbody = document.getElementById('admin-verification-tbody');
  const badge = document.getElementById('badge-pending-verifications');
  if (!tbody) return;

  const pending = adminRecipients.filter((r) => r.status === 'Pending');
  if (badge) badge.textContent = pending.length;

  if (pending.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No pending node verification requests in queue.</td></tr>`;
    return;
  }

  tbody.innerHTML = pending
    .map(
      (r) => `
    <tr>
      <td><strong>${r.name}</strong></td>
      <td><span class="source-badge web">${r.type}</span></td>
      <td>${r.city}</td>
      <td>Capacity: ${r.capacity} meals &bull; ${r.needs_note || 'Standard intake'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn btn-primary btn-sm" onclick="approveNode('${r.id}')">Approve</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="rejectNode('${r.id}')">Reject</button>
        </div>
      </td>
    </tr>
  `
    )
    .join('');
}

async function approveNode(id) {
  const rec = adminRecipients.find((r) => r.id === id);
  if (rec) {
    rec.status = 'Approved';
    rec.verified = true;
    if (sbAdmin) {
      try {
        await sbAdmin.from('recipients').update({ status: 'Approved', verified: true }).eq('id', id);
      } catch (e) { }
    }
    await logAdminAction('APPROVE_NODE', rec.name, { status: 'Approved' });
    renderVerificationQueue();
    renderRecipientsTable();
  }
}

async function rejectNode(id) {
  const note = prompt('Enter reason for node rejection (will be logged in audit trail):', 'Incomplete FSSAI / Capacity audit');
  if (!note) return;

  const rec = adminRecipients.find((r) => r.id === id);
  if (rec) {
    rec.status = 'Rejected';
    if (sbAdmin) {
      try {
        await sbAdmin.from('recipients').update({ status: 'Rejected' }).eq('id', id);
      } catch (e) { }
    }
    await logAdminAction('REJECT_NODE', rec.name, { reason: note });
    renderVerificationQueue();
    renderRecipientsTable();
  }
}

/* ==========================================================================
   CITIES MANAGEMENT
   ========================================================================== */
function renderCitiesTable() {
  const tbody = document.getElementById('admin-cities-tbody');
  if (!tbody) return;

  tbody.innerHTML = adminCities
    .map(
      (c) => `
    <tr>
      <td><code>${c.id}</code></td>
      <td><strong>${c.name}</strong></td>
      <td><span class="chip-status ${c.status === 'Live' ? 'live' : 'coming-soon'}">${c.status}</span></td>
      <td>
        <button type="button" class="btn btn-secondary btn-sm" onclick="toggleCityStatus('${c.id}')">
          <span>Toggle to ${c.status === 'Live' ? 'Coming soon' : 'Live'}</span>
        </button>
      </td>
    </tr>
  `
    )
    .join('');
}

function openCityModal() {
  document.getElementById('modal-city').hidden = false;
}

function closeCityModal() {
  document.getElementById('modal-city').hidden = true;
}

async function handleSaveCity(e) {
  e.preventDefault();
  const name = document.getElementById('city-input-name').value.trim();
  const status = document.getElementById('city-input-status').value;
  const id = 'city-' + name.toLowerCase().replace(/[^a-z0-9]/g, '');

  const payload = { id, name, status };
  adminCities.push(payload);

  if (sbAdmin) {
    try {
      await sbAdmin.from('cities').upsert([payload]);
    } catch (e) { }
  }

  await logAdminAction('CREATE_CITY', name, payload);
  closeCityModal();
  renderCitiesTable();
}

async function toggleCityStatus(cityId) {
  const city = adminCities.find((c) => c.id === cityId);
  if (!city) return;

  city.status = city.status === 'Live' ? 'Coming soon' : 'Live';

  if (sbAdmin) {
    try {
      await sbAdmin.from('cities').update({ status: city.status }).eq('id', cityId);
    } catch (e) { }
  }

  await logAdminAction('TOGGLE_CITY_STATUS', city.name, { status: city.status });
  renderCitiesTable();
}

/* ==========================================================================
   REPORTS & CSV EXPORT
   ========================================================================== */
function exportDonationsCSV() {
  if (adminDonations.length === 0) {
    alert('No donations available to export.');
    return;
  }

  const headers = ['ID', 'Food Description', 'Quantity (Meals)', 'Donor Type', 'City', 'Area', 'Status', 'Stage', 'Source', 'OTP', 'Timestamp'];
  const rows = adminDonations.map((d) => [
    d.id,
    `"${d.food.replace(/"/g, '""')}"`,
    d.qty,
    d.donor_type,
    d.city,
    `"${d.area.replace(/"/g, '""')}"`,
    d.status,
    d.stage,
    d.source,
    d.otp,
    d.created_at
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `sahakara_telemetry_report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  logAdminAction('EXPORT_CSV', 'Telemetry Report', { rowsCount: rows.length });
}

/* ==========================================================================
   AUDIT LOGGING
   ========================================================================== */
async function logAdminAction(action, target, details = {}) {
  const entry = {
    id: 'log-' + Math.random().toString(36).substring(2, 8),
    admin_id: currentAdmin?.id || 'admin-system',
    admin_email: currentAdmin?.email || 'admin@sahakara.org',
    action,
    target,
    details,
    created_at: new Date().toISOString()
  };

  adminAuditLogs.unshift(entry);

  if (sbAdmin) {
    try {
      await sbAdmin.from('audit_log').insert([entry]);
    } catch (e) { }
  }

  renderAuditTable();
}

function renderAuditTable() {
  const tbody = document.getElementById('admin-audit-tbody');
  if (!tbody) return;

  tbody.innerHTML = adminAuditLogs
    .map(
      (log) => `
    <tr>
      <td><code>${new Date(log.created_at).toLocaleString('en-IN')}</code></td>
      <td><strong>${log.admin_email || 'admin@sahakara.org'}</strong></td>
      <td><span class="stage-tag s1">${log.action}</span></td>
      <td><strong>${log.target || '--'}</strong></td>
      <td><small><code>${JSON.stringify(log.details || {})}</code></small></td>
    </tr>
  `
    )
    .join('');
}

/* ==========================================================================
   REALTIME FOOD SAFETY ALERTS (BELL NOTIFICATION)
   ========================================================================== */
function triggerFoodSafetyAlert(donation) {
  const alertItem = {
    id: 'alert-' + Date.now(),
    title: `Tier 0${donation.stage} Risk Alert`,
    message: `${donation.food} (${donation.qty} meals in ${donation.city}) requires rapid dispatch before safe window expires!`,
    time: new Date().toLocaleTimeString()
  };

  activeAlerts.unshift(alertItem);
  renderNotifications();
}

function toggleNotifDropdown() {
  const el = document.getElementById('notif-dropdown');
  if (el) el.hidden = !el.hidden;
}

function clearNotifications() {
  activeAlerts = [];
  renderNotifications();
}

function renderNotifications() {
  const dot = document.getElementById('notif-dot');
  const list = document.getElementById('notif-items-list');

  if (dot) dot.hidden = activeAlerts.length === 0;

  if (list) {
    if (activeAlerts.length === 0) {
      list.innerHTML = `<div style="padding:16px;text-align:center;color:#94A3B8;font-size:0.8125rem;">No active high-risk alerts.</div>`;
    } else {
      list.innerHTML = activeAlerts
        .map(
          (a) => `
        <div class="notif-item urgent">
          <span>⚠️</span>
          <div>
            <strong>${a.title}</strong><br>
            <span>${a.message}</span><br>
            <small style="color:#64748B;">${a.time}</small>
          </div>
        </div>
      `
        )
        .join('');
    }
  }
}

/* ==========================================================================
   QUICK SEED DEMO DONATIONS (FOR ADMIN LIVE DEMOS)
   ========================================================================== */
async function seedDemoDonationsQuick(e) {
  if (e && e.preventDefault) e.preventDefault();
  const btn = e?.currentTarget;
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>🌱 Seeding 6 Batches...</span>';
  }

  const sampleBatches = [
    {
      food: '[Demo] 45 Hot Meals — Dal Fry & Steamed Rice',
      qty: 45,
      donor_type: 'Mess',
      city: 'Jaipur',
      area: 'Mansarovar Campus Canteen [Demo]',
      lat: 26.8530,
      lon: 75.7680,
      safe_minutes: 240,
      food_category: 'cooked rice/dal',
      status: 'Posted',
      stage: 1,
      source: 'Web',
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      created_at: new Date().toISOString()
    },
    {
      food: '[Demo] 80 Meals — Rajma Chawal & Chapati',
      qty: 80,
      donor_type: 'Restaurant',
      city: 'Jaipur',
      area: 'C-Scheme Dining Hall [Demo]',
      lat: 26.9120,
      lon: 75.8050,
      safe_minutes: 240,
      food_category: 'cooked rice/dal',
      status: 'Matched',
      match_id: 'rec-ananda',
      stage: 1,
      source: 'Web',
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      created_at: new Date(Date.now() - 20 * 60000).toISOString()
    },
    {
      food: '[Demo] 60 Meals — Chana Masala & Pulao',
      qty: 60,
      donor_type: 'Mess',
      city: 'Delhi NCR',
      area: 'Connaught Place Central Hub [Demo]',
      lat: 28.6315,
      lon: 77.2167,
      safe_minutes: 240,
      food_category: 'cooked rice/dal',
      status: 'Posted',
      stage: 1,
      source: 'SMS',
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      created_at: new Date(Date.now() - 15 * 60000).toISOString()
    },
    {
      food: '[Demo] 35 Packs — Bakery Sandwiches & Buns',
      qty: 35,
      donor_type: 'Restaurant',
      city: 'Delhi NCR',
      area: 'Hauz Khas Artisan Bakery [Demo]',
      lat: 28.5494,
      lon: 77.2001,
      safe_minutes: 720,
      food_category: 'dry snacks',
      status: 'Matched',
      match_id: 'rec-delhi-shelter',
      stage: 1,
      source: 'Web',
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      created_at: new Date(Date.now() - 30 * 60000).toISOString()
    },
    {
      food: '[Demo] 100 Meals — Sambhar Rice & Veg Poriyal',
      qty: 100,
      donor_type: 'Restaurant',
      city: 'Bengaluru',
      area: 'Indiranagar Tech Cafe [Demo]',
      lat: 12.9784,
      lon: 77.6408,
      safe_minutes: 240,
      food_category: 'cooked rice/dal',
      status: 'Posted',
      stage: 1,
      source: 'Web',
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      created_at: new Date(Date.now() - 10 * 60000).toISOString()
    },
    {
      food: '[Demo] 50 Boxes — Whole Wheat Bread & Pav',
      qty: 50,
      donor_type: 'Mess',
      city: 'Bengaluru',
      area: 'Whitefield Campus Cafeteria [Demo]',
      lat: 12.9698,
      lon: 77.7499,
      safe_minutes: 360,
      food_category: 'dry snacks',
      status: 'Matched',
      match_id: 'rec-blr-shelter',
      stage: 1,
      source: 'Helpline',
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      created_at: new Date(Date.now() - 45 * 60000).toISOString()
    }
  ];

  try {
    if (sbAdmin) {
      const { error } = await sbAdmin.from('donations').insert(sampleBatches);
      if (error) console.warn('[Admin Seed Notice]:', error.message);
    }

    await loadAdminDonations();
    renderOverviewMetrics();
    renderOverviewCharts();
    renderDonationsTable();
    renderLadderBoard();
  } catch (err) {
    console.error('[Admin Seed Error]:', err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml || '<span>🌱 Seed Demo Donations</span>';
    }
  }
}

/* ==========================================================================
   ACTIVE ORDERS & DISPATCH COORDINATION (ADMIN ONLY)
   ========================================================================== */
function loadAdminOrders() {
  let stored = [];
  try {
    const raw = localStorage.getItem('sahakara_active_orders');
    if (raw) stored = JSON.parse(raw);
  } catch (e) {}

  if (!Array.isArray(stored) || stored.length === 0) {
    stored = [
      {
        id: 'ORD-8942',
        orderType: 'shelter',
        food: '45kg Fresh Dal Fry & Jeera Rice',
        qty: 90,
        category: 'Cooked Meal',
        city: 'Jaipur',
        donor: 'Jaipur Marriott & Banquet (Tonk Rd)',
        recipient: 'Aasha Shelter Home (Malviya Nagar)',
        status: 'Matched',
        stage: 1,
        otp: '4821',
        timestamp: Date.now() - 12 * 60000
      },
      {
        id: 'ORD-6218',
        orderType: 'donor',
        food: '30kg Packed Vegetable Biryani',
        qty: 60,
        category: 'Cooked Meal',
        city: 'Jaipur',
        donor: 'Royal Palace Convention (Mansarovar)',
        recipient: 'Bal Seva Orphanage',
        status: 'Picked up',
        stage: 2,
        otp: '7392',
        timestamp: Date.now() - 34 * 60000
      }
    ];
  }

  // Merge with any Supabase matched donations that aren't already represented
  if (Array.isArray(adminDonations)) {
    adminDonations
      .filter((d) => ['matched', 'picked up', 'delivered'].includes((d.status || '').toLowerCase()))
      .forEach((d) => {
        const orderId = 'ORD-' + (d.id ? d.id.replace('sk-', '').replace('demo-', '').substring(0, 5).toUpperCase() : 'SK');
        if (!stored.some((o) => o.id === orderId)) {
          const matchedRec = (adminRecipients || []).find((r) => r.id === d.match_id);
          stored.push({
            id: orderId,
            orderType: d.match_id && String(d.match_id).startsWith('shelter-') ? 'shelter' : 'donor',
            food: d.food || 'Surplus Meal Batch',
            qty: d.qty || 40,
            category: d.food_category || 'Cooked',
            city: d.city || 'Jaipur',
            donor: d.area || d.donor_type || 'Commercial Donor',
            recipient: matchedRec ? matchedRec.name : (d.match_id ? String(d.match_id).replace('shelter-', '').replace(/-/g, ' ') : 'Verified Shelter'),
            status: d.status || 'Matched',
            stage: d.stage || 1,
            otp: d.otp || '----',
            timestamp: d.created_at ? new Date(d.created_at).getTime() : Date.now() - 20 * 60000
          });
        }
      });
  }

  adminOrders = stored;
  try {
    localStorage.setItem('sahakara_active_orders', JSON.stringify(adminOrders));
  } catch (e) {}

  updateAdminOrdersBadge();
}

function updateAdminOrdersBadge() {
  const badge = document.getElementById('badge-admin-orders');
  if (badge) {
    badge.textContent = adminOrders.length;
  }
}

function renderAdminOrders() {
  const tbody = document.getElementById('admin-orders-tbody');
  if (!tbody) return;

  const totalEl = document.getElementById('admin-orders-total-count');
  const shelterEl = document.getElementById('admin-orders-shelter-count');
  const donorEl = document.getElementById('admin-orders-donor-count');
  const transitEl = document.getElementById('admin-orders-transit-count');

  const shelterTotal = adminOrders.filter((o) => o.orderType === 'shelter').length;
  const donorTotal = adminOrders.filter((o) => o.orderType === 'donor').length;
  const transitTotal = adminOrders.filter((o) => (o.status || '').toLowerCase() === 'picked up').length;

  if (totalEl) totalEl.textContent = adminOrders.length;
  if (shelterEl) shelterEl.textContent = shelterTotal;
  if (donorEl) donorEl.textContent = donorTotal;
  if (transitEl) transitEl.textContent = transitTotal;

  updateAdminOrdersBadge();

  const search = (document.getElementById('filter-order-search')?.value || '').toLowerCase();
  const typeFilter = document.getElementById('filter-order-type')?.value || 'all';
  const statusFilter = document.getElementById('filter-order-status')?.value || 'all';
  const cityFilter = document.getElementById('filter-order-city')?.value || 'all';

  const filtered = adminOrders.filter((o) => {
    const matchSearch =
      (o.id || '').toLowerCase().includes(search) ||
      (o.food || '').toLowerCase().includes(search) ||
      (o.donor || '').toLowerCase().includes(search) ||
      (o.recipient || '').toLowerCase().includes(search) ||
      (o.otp || '').includes(search);
    const matchType = typeFilter === 'all' || o.orderType === typeFilter;
    const matchStatus = statusFilter === 'all' || (o.status || '').toLowerCase() === statusFilter.toLowerCase();
    const matchCity = cityFilter === 'all' || (o.city || '').toLowerCase() === cityFilter.toLowerCase();
    return matchSearch && matchType && matchStatus && matchCity;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--text-muted);">No active orders or dispatches match the selected filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((o) => {
      const typeBadge =
        o.orderType === 'shelter'
          ? `<span class="source-badge" style="background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;">🏠 Shelter Claim</span>`
          : `<span class="source-badge" style="background:#ECFDF5;color:#047857;border:1px solid #A7F3D0;">🍛 Donor Dispatch</span>`;

      const statusClass = (o.status || 'Matched').toLowerCase().replace(' ', '-');
      const timeStr = getTimeAgoStringAdmin(o.timestamp);

      return `
        <tr>
          <td><strong style="font-family:var(--font-mono);font-size:0.875rem;color:var(--brand-green);">${o.id}</strong></td>
          <td>${typeBadge}</td>
          <td>
            <strong>${o.food}</strong><br>
            <small style="color:var(--text-muted);">${o.qty} kg / meals &bull; ${o.category}</small>
          </td>
          <td>
            <div style="font-weight:600;font-size:0.8125rem;">${o.donor}</div>
            <small style="color:var(--text-muted);">${o.city}</small>
          </td>
          <td>
            <div style="font-weight:700;font-size:0.8125rem;color:#1E3A8A;">${o.recipient}</div>
            <small style="color:var(--text-muted);">${o.city}</small>
          </td>
          <td>
            <span class="status-pill ${statusClass}">${o.status}</span><br>
            <span class="stage-tag s${o.stage || 1}" style="margin-top:4px;display:inline-block;">Tier 0${o.stage || 1}</span>
          </td>
          <td>
            <code style="background:#F1F5F9;padding:3px 8px;border-radius:4px;font-size:0.875rem;font-weight:700;color:#0F172A;border:1px solid #CBD5E1;">${o.otp || '----'}</code>
          </td>
          <td><small style="color:var(--text-muted);">${timeStr}</small></td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${
                o.status === 'Matched'
                  ? `<button type="button" class="btn btn-secondary btn-sm" onclick="adminUpdateOrderStatus('${o.id}', 'Picked up')">Mark Picked Up</button>`
                  : o.status === 'Picked up'
                  ? `<button type="button" class="btn btn-primary btn-sm" onclick="adminUpdateOrderStatus('${o.id}', 'Delivered')">Mark Delivered</button>`
                  : `<span style="font-size:0.75rem;color:#059669;font-weight:700;">✅ Complete</span>`
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function getTimeAgoStringAdmin(timestamp) {
  if (!timestamp) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
}

async function adminUpdateOrderStatus(orderId, newStatus) {
  const order = adminOrders.find((o) => o.id === orderId);
  if (!order) return;

  order.status = newStatus;
  if (newStatus === 'Picked up') order.stage = 3;
  if (newStatus === 'Delivered') order.stage = 4;

  try {
    localStorage.setItem('sahakara_active_orders', JSON.stringify(adminOrders));
  } catch (e) {}

  // Also update corresponding donation row if present
  if (sbAdmin) {
    try {
      const donationId = orderId.replace('ORD-', 'sk-').toLowerCase();
      await sbAdmin.from('donations').update({ status: newStatus }).eq('id', donationId);
      await sbAdmin.from('audit_log').insert([{
        action: 'ADMIN_UPDATE_ORDER_STATUS',
        target: orderId,
        details: { newStatus, updated_by: currentAdmin?.email, timestamp: new Date().toISOString() }
      }]);
    } catch (e) {
      console.warn('[Admin Orders] Supabase sync error:', e.message);
    }
  }

  showAdminNotification(`Order ${orderId} status updated to: ${newStatus}`);
  renderAdminOrders();
}

window.loadAdminOrders = loadAdminOrders;
window.renderAdminOrders = renderAdminOrders;
window.adminUpdateOrderStatus = adminUpdateOrderStatus;
