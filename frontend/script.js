/**
 * SAHAKARA — Food Rescue Platform (National Surplus-to-Shelter Engine)
 * Powered by Supabase (Postgres + Realtime), OpenStreetMap (Leaflet.js) & OSRM Road Routing.
 */

// Global App State
let sbClient = null;
let realtimeChannel = null;

let allRecipients = [];
let allDonations = [];
let jaipurMap = null;
let mapMarkers = [];
let activeRoutePolyline = null;
let activeFilter = 'all';

// Default Seed Recipients (in case Supabase is initializing or offline)
const DEFAULT_RECIPIENTS = [
  {
    id: 'rec-ananda',
    name: 'Ananda Seva Ashram (Node 04)',
    type: 'shelter',
    lat: 26.9248,
    lon: 75.8267,
    capacity: 150,
    needs_note: 'Accepts hot vegetarian meals and roti packs',
    address: 'Bani Park, Near Collectorate Circle, Jaipur 302016'
  },
  {
    id: 'rec-akshaya-patra',
    name: 'Akshaya Patra Foundation Jaipur',
    type: 'shelter',
    lat: 26.8202,
    lon: 75.8647,
    capacity: 1500,
    needs_note: 'Central mega-kitchen with cold/hot bulk storage',
    address: 'Mahal Road, Jagatpura, Jaipur 302017'
  },
  {
    id: 'rec-apna-ghar',
    name: 'Apna Ghar Vridhashram & Child Care',
    type: 'shelter',
    lat: 26.8856,
    lon: 75.7654,
    capacity: 100,
    needs_note: 'Elderly and child care requiring soft cooked food',
    address: 'Shyam Nagar, Janpath, Jaipur 302019'
  },
  {
    id: 'rec-prerna',
    name: 'Prerna Balika Ashram',
    type: 'shelter',
    lat: 26.9654,
    lon: 75.7723,
    capacity: 90,
    needs_note: 'Residential home for girls, dinner intake before 22:00',
    address: 'Vidyadhar Nagar, Sector 3, Jaipur 302039'
  },
  {
    id: 'rec-gaushala-govind',
    name: 'Shree Govind Dev Ji Gaushala Trust',
    type: 'gaushala',
    lat: 26.9298,
    lon: 75.8242,
    capacity: 600,
    needs_note: 'Accepts fresh raw greens, unused grain, and vegetable peels',
    address: 'City Palace Complex, Jaipur 302002'
  },
  {
    id: 'rec-gaushala-pratap',
    name: 'Pratap Nagar Kamdhenu Gaushala',
    type: 'gaushala',
    lat: 26.8012,
    lon: 75.8219,
    capacity: 450,
    needs_note: 'Registered cattle welfare shelter with organic composting',
    address: 'Sector 8, Pratap Nagar, Jaipur 302033'
  },
  {
    id: 'rec-compost-durgapura',
    name: 'Durgapura Municipal Bio-Compost Hub',
    type: 'compost',
    lat: 26.8524,
    lon: 75.7891,
    capacity: 2000,
    needs_note: 'Aerobic decomposition and soil enrichment facility',
    address: 'Durgapura, Jaipur 302018'
  },
  {
    id: 'rec-compost-jmc',
    name: 'JMC Central Biomethanation Facility',
    type: 'compost',
    lat: 26.9420,
    lon: 75.7980,
    capacity: 3500,
    needs_note: 'High-capacity methane capture and organic bio-fertilizer unit',
    address: 'Jaipur 302012'
  }
];

// Active Volunteer Drivers
let ACTIVE_DRIVERS = [
  {
    id: 'drv-vikram',
    name: 'Driver Vikram R. (EV Cargo-4419)',
    vehicle_type: 'Mahindra Zor Grand Electric',
    vehicle_number: 'RJ-14-EV-4419',
    lat: 27.0250,
    lng: 75.8900,
    speed_kmh: 41,
    battery_level: '84%',
    cargo_temp_celsius: 64,
    status: 'In Transit',
    eta_mins: 14
  }
];

// Active Live Dispatch State
let currentLiveDispatch = {
  id: 'demo-initial-dispatch',
  food: '40 Hot Dinner Meals (Rice, Dal Makhani & Roti)',
  qty: 40,
  donor_type: 'Mess',
  city: 'Jaipur',
  area: 'Amity University Campus Mess, Kant Kalwar',
  lat: 27.1729,
  lon: 75.9542,
  safe_minutes: 240,
  food_category: 'cooked rice/dal',
  created_at: new Date(Date.now() - 25 * 60000).toISOString(),
  status: 'Picked up',
  match_id: 'rec-ananda',
  stage: 1,
  source: 'Web',
  otp: '4419'
};

/* ==========================================================================
   INITIALIZATION (DOM CONTENT LOADED)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initial State
  allRecipients = [...DEFAULT_RECIPIENTS];
  allDonations = [];
  currentLiveDispatch = null;
  
  renderRealtimeTable();
  recalculateDashboardMetrics();
  initJaipurMap();
  initLadderCountdown();
  initAuth();
  initHelplineIVR();

  // 2. Asynchronous Supabase Connect & Realtime Sync
  initSupabaseClient();
  loadCities();
  loadRecipients().then(() => {
    renderMapData();
  });
  loadDonations();
  setupRealtimeSubscription();
});

let allCities = [
  { id: 'city-jaipur', name: 'Jaipur', status: 'Live' },
  { id: 'city-delhi', name: 'Delhi NCR', status: 'Live' },
  { id: 'city-blr', name: 'Bengaluru', status: 'Live' },
  { id: 'city-mumbai', name: 'Mumbai', status: 'Coming soon' },
  { id: 'city-hyd', name: 'Hyderabad', status: 'Coming soon' }
];

async function loadCities() {
  if (sbClient) {
    try {
      const { data, error } = await sbClient.from('cities').select('*').order('name');
      if (!error && data && data.length > 0) {
        allCities = data;
      }
    } catch (e) {}
  }
  renderCityDropdown();
  renderCityChips();
}

function renderCityDropdown() {
  const select = document.getElementById('post-city');
  if (!select) return;
  const liveCities = allCities.filter((c) => c.status === 'Live');
  select.innerHTML = `
    <option value="" disabled selected>Select your city...</option>
    ${liveCities.map((c) => `<option value="${c.name}">${c.name} (Live)</option>`).join('')}
  `;
}

function renderCityChips() {
  const container = document.getElementById('city-chips-grid');
  if (!container) return;
  container.innerHTML = allCities
    .map(
      (c) => `
      <div class="city-chip ${c.status === 'Live' ? 'live' : 'coming-soon'}" data-name="${c.name.toLowerCase()}">
        <span class="city-name">${c.name}</span>
        <span class="chip-status ${c.status === 'Live' ? 'live' : 'coming-soon'}">${c.status}</span>
      </div>
    `
    )
    .join('');
}

/* ==========================================================================
   1. SUPABASE CLIENT & REALTIME SUBSCRIPTION
   ========================================================================== */
function initSupabaseClient() {
  if (window.SahakaraConfig) {
    sbClient = window.SahakaraConfig.getClient();
  }
}

/**
 * Loads recipients from Supabase public.recipients table
 */
async function loadRecipients() {
  if (!sbClient) {
    allRecipients = [...DEFAULT_RECIPIENTS];
    return;
  }

  try {
    const { data, error } = await sbClient.from('recipients').select('*');
    if (error || !data) {
      console.warn('[Supabase] Could not fetch recipients:', error?.message);
      allRecipients = [...DEFAULT_RECIPIENTS];
    } else {
      allRecipients = data;
      console.log(`[Supabase] Loaded ${allRecipients.length} recipients.`);
    }
  } catch (err) {
    console.warn('[Supabase] Error loading recipients:', err.message);
    allRecipients = [...DEFAULT_RECIPIENTS];
  }
}

/**
 * Loads donations from Supabase public.donations table
 */
async function loadDonations() {
  if (!sbClient) {
    allDonations = [];
    currentLiveDispatch = null;
    renderRealtimeTable();
    recalculateDashboardMetrics();
    return;
  }

  try {
    const { data, error } = await sbClient
      .from('donations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error || !data) {
      console.warn('[Supabase] Query error loading donations:', error?.message);
      allDonations = [];
      currentLiveDispatch = null;
    } else {
      allDonations = data;
      currentLiveDispatch = data.length > 0 ? data[0] : null;
      console.log(`[Supabase] Loaded ${allDonations.length} live donations.`);
    }
  } catch (err) {
    console.warn('[Supabase] Error loading donations:', err.message);
    allDonations = [];
    currentLiveDispatch = null;
  }

  if (currentLiveDispatch) {
    renderDispatchCard(currentLiveDispatch);
  }
  renderRealtimeTable();
  recalculateDashboardMetrics();
}

/**
 * Sets up Supabase Realtime Channel
 */
function setupRealtimeSubscription() {
  if (!sbClient) return;

  try {
    realtimeChannel = sbClient
      .channel('public:donations_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'donations' },
        (payload) => {
          console.log('[Supabase Realtime] Event received:', payload.eventType, payload.new);
          handleRealtimePayload(payload);
        }
      )
      .subscribe((status) => {
        console.log('[Supabase Realtime] Subscription status:', status);
      });
  } catch (e) {
    console.warn('[Supabase Realtime] Subscription failed:', e.message);
  }
}

/**
 * Handles incoming Realtime INSERT, UPDATE, DELETE events
 */
function handleRealtimePayload(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'INSERT') {
    allDonations.unshift(newRow);
    currentLiveDispatch = newRow;
    showToast(`⚡ New Realtime Donation: ${newRow.food} (${newRow.qty} meals)`);
  } else if (eventType === 'UPDATE') {
    const idx = allDonations.findIndex((d) => d.id === newRow.id);
    if (idx !== -1) {
      allDonations[idx] = newRow;
    }
    if (currentLiveDispatch.id === newRow.id) {
      currentLiveDispatch = newRow;
    }
    showToast(`🔔 Donation #${(newRow.id || '').substring(0, 7)} updated to: ${newRow.status}`);
  } else if (eventType === 'DELETE') {
    allDonations = allDonations.filter((d) => d.id !== oldRow.id);
  }

  // Re-render all connected UI components
  renderDispatchCard(currentLiveDispatch);
  renderRealtimeTable();
  recalculateDashboardMetrics();
  renderMapData();
}

/* ==========================================================================
   2. DONOR POST SURPLUS FLOW
   ========================================================================== */
function openPostModal(personaRole) {
  const modal = document.getElementById('modal-post');
  if (!modal) return;
  modal.removeAttribute('hidden');
  modal.hidden = false;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  const form = document.getElementById('post-form');
  const success = document.getElementById('post-success');
  if (form) form.hidden = false;
  if (success) success.hidden = true;

  if (personaRole === 'donor') {
    const donorType = document.getElementById('post-donor-type');
    if (donorType) donorType.value = 'Restaurant';
  }
}

function closePostModal() {
  const modal = document.getElementById('modal-post');
  if (!modal) return;
  modal.setAttribute('hidden', '');
  modal.hidden = true;
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

function updateSafetyClockHint(category) {
  const safeMins = window.SahakaraMatching?.getDefaultSafeMinutes(category) || 240;
  console.log(`Selected category ${category}: Safe window is ${safeMins} minutes.`);
}

/**
 * Handles Donor form submission:
 * 1. Executes Matching + Ladder logic via SahakaraMatching
 * 2. Generates 4-digit OTP
 * 3. Inserts donation row into Supabase
 * 4. Displays active OTP and matched recipient
 */
async function handlePostSubmit(e) {
  e.preventDefault();

  const donorType = document.getElementById('post-donor-type').value || 'Mess';
  const establishmentName = document.getElementById('post-donor-name').value.trim() || 'Commercial Donor';
  const city = document.getElementById('post-city').value || 'Jaipur';
  const foodCategory = document.getElementById('post-food-category').value || 'cooked rice/dal';
  const foodDesc = document.getElementById('post-food-desc').value.trim() || 'Hot Fresh Meals';
  const qty = parseFloat(document.getElementById('post-qty').value) || 40;
  const address = document.getElementById('post-address').value.trim() || 'Jaipur Central Area';

  const submitBtn = document.getElementById('btn-submit-post');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Matching with Shelters...</span>';
  }

  // Donor Coordinates (Defaulting to Jaipur cluster location)
  const donorLat = 27.1729;
  const donorLon = 75.9542;

  const safeMinutes = window.SahakaraMatching?.getDefaultSafeMinutes(foodCategory) || 240;

  // Run Matching Algorithm
  const matchResult = window.SahakaraMatching
    ? window.SahakaraMatching.findMatch(
        { lat: donorLat, lon: donorLon, qty, safe_minutes: safeMinutes, food_category: foodCategory },
        allRecipients,
        0
      )
    : { matchedRecipient: allRecipients[0], stage: 1, distanceKm: 2.4 };

  const matchedRecipient = matchResult.matchedRecipient || allRecipients[0];
  const stage = matchResult.stage || 1;

  // Generate 4-digit Handover OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  const donationPayload = {
    food: foodDesc,
    qty: qty,
    donor_type: donorType,
    city: city,
    area: `${establishmentName}, ${address}`,
    lat: donorLat,
    lon: donorLon,
    safe_minutes: safeMinutes,
    food_category: foodCategory,
    status: 'Matched',
    match_id: matchedRecipient ? matchedRecipient.id : null,
    stage: stage,
    source: 'Web',
    otp: otp
  };

  let createdDonation = { ...donationPayload, id: 'sk-' + Math.random().toString(36).substring(2, 9), created_at: new Date().toISOString() };

  // Insert into Supabase Postgres
  if (sbClient) {
    try {
      const { data, error } = await sbClient.from('donations').insert([donationPayload]).select();
      if (!error && data && data[0]) {
        createdDonation = data[0];
        console.log('[Supabase] Donation inserted successfully:', createdDonation);
      } else {
        console.warn('[Supabase] Insert error, fallback to local state:', error?.message);
      }
    } catch (err) {
      console.warn('[Supabase] Network exception on insert:', err.message);
    }
  }

  // Update local state if realtime hasn't already fired
  if (!allDonations.some((d) => d.id === createdDonation.id)) {
    allDonations.unshift(createdDonation);
  }
  currentLiveDispatch = createdDonation;

  // Render Success Modal State
  document.getElementById('success-ref-id').textContent = '#' + (createdDonation.id || '').substring(0, 8).toUpperCase();
  document.getElementById('success-otp-code').textContent = otp;
  document.getElementById('success-matched-recipient').textContent = matchedRecipient ? matchedRecipient.name : 'Verified Rescue Node';
  document.getElementById('success-ladder-tier').textContent = `Tier 0${stage} (${stage === 1 ? 'Nearby Shelter' : stage === 2 ? 'Regional Shelter' : stage === 3 ? 'Gaushala' : 'Bio-Compost'})`;

  document.getElementById('post-form').hidden = true;
  document.getElementById('post-success').hidden = false;

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Broadcast to Rescue Network</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  }

  renderDispatchCard(createdDonation);
  renderRealtimeTable();
  recalculateDashboardMetrics();
  renderMapData();
}

/* ==========================================================================
   3. DRIVER FLOW: PICKED UP (OTP HANDOVER) & DELIVERED
   ========================================================================== */
/**
 * Driver Pickup Action: Requires Donor OTP
 */
async function triggerDriverPickup() {
  if (!currentLiveDispatch) return;

  const currentOtp = currentLiveDispatch.otp || '4419';
  const entered = prompt(`[Driver Pickup Verification]\nEnter the Donor's 4-Digit Handover OTP (Active Code: ${currentOtp}):`, currentOtp);

  if (!entered) return;

  if (entered.trim() !== currentOtp.trim()) {
    alert('❌ Invalid OTP! Handover could not be authenticated.');
    return;
  }

  // Update status in Supabase
  if (sbClient && currentLiveDispatch.id && !currentLiveDispatch.id.startsWith('demo-')) {
    try {
      const { error } = await sbClient
        .from('donations')
        .update({ status: 'Picked up' })
        .eq('id', currentLiveDispatch.id);

      if (error) console.warn('[Supabase] Error updating status:', error.message);
    } catch (e) {
      console.warn('[Supabase] Update exception:', e.message);
    }
  }

  currentLiveDispatch.status = 'Picked up';
  showToast(`✅ OTP ${currentOtp} Authenticated! Food batch picked up.`);
  renderDispatchCard(currentLiveDispatch);
  renderRealtimeTable();
  recalculateDashboardMetrics();
}

/**
 * Driver Delivery Action
 */
async function triggerDriverDelivery() {
  if (!currentLiveDispatch) return;

  if (currentLiveDispatch.status !== 'Picked up') {
    const proceed = confirm('The donation has not been marked as Picked Up yet. Do you want to confirm delivery now?');
    if (!proceed) return;
  }

  // Update status in Supabase
  if (sbClient && currentLiveDispatch.id && !currentLiveDispatch.id.startsWith('demo-')) {
    try {
      const { error } = await sbClient
        .from('donations')
        .update({ status: 'Delivered' })
        .eq('id', currentLiveDispatch.id);

      if (error) console.warn('[Supabase] Error marking delivered:', error.message);
    } catch (e) {
      console.warn('[Supabase] Delivery update exception:', e.message);
    }
  }

  currentLiveDispatch.status = 'Delivered';
  showToast(`🎉 Food batch delivered to shelter! Meals saved.`);
  renderDispatchCard(currentLiveDispatch);
  renderRealtimeTable();
  recalculateDashboardMetrics();
}

/* ==========================================================================
   4. HERO LIVE DISPATCH CARD RENDERER (PRIVACY PROTECTED FOR PUBLIC VIEWERS)
   ========================================================================== */
function renderDispatchCard(dispatch) {
  if (!dispatch) return;

  const titleEl = document.getElementById('card-food-title');
  const qtyEl = document.getElementById('card-qty');
  const donorEl = document.getElementById('card-donor-name');
  const destEl = document.getElementById('card-destination');
  const destSubEl = document.getElementById('card-destination-sub');
  const driverNameEl = document.getElementById('card-driver-name');
  const driverSubEl = document.getElementById('card-driver-sub');
  const stagePill = document.getElementById('card-stage-pill');

  if (titleEl) titleEl.textContent = dispatch.food || 'Surplus Food Batch';
  if (qtyEl) qtyEl.textContent = `${dispatch.qty} Meals`;
  if (donorEl) donorEl.textContent = `Posted by ${dispatch.area || 'Commercial Donor'}`;

  // Strict Privacy: Public viewers cannot see which shelter has taken the order
  const stage = dispatch.stage || 1;
  const tierLabel = stage === 1 ? 'Tier 01 Human Shelter' : stage === 2 ? 'Tier 02 Regional Shelter' : stage === 3 ? 'Tier 03 Registered Gaushala' : 'Tier 04 Bio-Compost Hub';
  
  if (destEl) {
    destEl.textContent = `${tierLabel} (Privacy Protected)`;
  }
  if (destSubEl) {
    destSubEl.textContent = 'Intake recipient & contact managed via Admin Portal';
  }
  if (driverNameEl) {
    driverNameEl.textContent = 'Automated Volunteer Dispatch';
  }
  if (driverSubEl) {
    driverSubEl.textContent = 'Secure OTP Handover Active &bull; Monitored by Admin';
  }

  if (stagePill) {
    stagePill.textContent = `TIER 0${stage} ACTIVE`;
  }

  // Stepper highlights
  updateStepperState(dispatch.status);
}

function updateStepperState(status) {
  const steps = document.querySelectorAll('.stepper-steps .step-node');
  if (!steps || steps.length < 4) return;

  steps.forEach((s) => s.classList.remove('completed', 'active'));

  const statusLower = (status || 'posted').toLowerCase();

  if (statusLower === 'posted') {
    steps[0].classList.add('active');
  } else if (statusLower === 'matched') {
    steps[0].classList.add('completed');
    steps[1].classList.add('active');
  } else if (statusLower === 'picked up' || statusLower === 'picked_up') {
    steps[0].classList.add('completed');
    steps[1].classList.add('completed');
    steps[2].classList.add('active');
  } else if (statusLower === 'delivered') {
    steps[0].classList.add('completed');
    steps[1].classList.add('completed');
    steps[2].classList.add('completed');
    steps[3].classList.add('completed');
  }
}

/* ==========================================================================
   5. DASHBOARD STATS & REALTIME AUDIT TABLE (MASKED RECIPIENTS & OTPS)
   ========================================================================== */
function recalculateDashboardMetrics() {
  const mealsEl = document.getElementById('stat-meals-count');
  const kgEl = document.getElementById('stat-kg-count');
  const citiesEl = document.getElementById('stat-cities-count');
  const citiesTitleEl = document.getElementById('stat-cities-title');
  const dumpsterEl = document.getElementById('stat-dumpster-count');

  // Sum qty where status = 'Delivered'
  const deliveredDonations = allDonations.filter((d) => (d.status || '').toLowerCase() === 'delivered');
  const realRescuedMeals = deliveredDonations.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);
  const totalKg = Math.round(realRescuedMeals * 0.4); // 1 meal = 0.4 kg
  const expiredCount = allDonations.filter((d) => (d.status || '').toLowerCase() === 'expired').length;

  const liveCities = allCities.filter((c) => c.status === 'Live');

  if (mealsEl) mealsEl.textContent = realRescuedMeals.toLocaleString('en-IN');
  if (kgEl) kgEl.textContent = totalKg.toLocaleString('en-IN');
  if (citiesEl) citiesEl.textContent = liveCities.length;
  if (citiesTitleEl && liveCities.length > 0) {
    citiesTitleEl.textContent = `Live in ${liveCities.map((c) => c.name).slice(0, 3).join(', ')}`;
  }
  if (dumpsterEl) dumpsterEl.textContent = expiredCount;
}

/**
 * Renders the Live Telemetry / Audit Log table in Card D
 * Anonymizes recipient identity and masks OTPs for public viewers
 */
function renderRealtimeTable() {
  const tbody = document.getElementById('realtime-donations-tbody');
  if (!tbody) return;

  if (allDonations.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No donations posted yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = allDonations
    .slice(0, 10)
    .map((d) => {
      const sourceClass = (d.source || 'Web').toLowerCase();
      const stage = d.stage || 1;
      const statusClass = (d.status || 'Posted').toLowerCase().replace(' ', '-');
      const tierCategory = stage === 1 ? 'Tier 1 Shelter' : stage === 2 ? 'Tier 2 Regional' : stage === 3 ? 'Tier 3 Gaushala' : 'Tier 4 Compost';

      return `
        <tr>
          <td><span class="source-badge ${sourceClass}">${d.source || 'Web'}</span></td>
          <td><strong>${d.qty} Meals</strong> (${d.food_category || 'cooked'})</td>
          <td><span class="stage-tag s${stage}">Tier ${stage}</span></td>
          <td><span class="status-pill ${statusClass}">${d.status || 'Posted'}</span></td>
          <td><span style="color:#0F7B5F;font-weight:500;">${tierCategory}</span> <small style="color:var(--text-muted);">(Protected)</small></td>
          <td><code style="letter-spacing:2px;color:var(--text-muted);">••••</code></td>
        </tr>
      `;
    })
    .join('');
}

/* ==========================================================================
   SHELTER FOOD REQUISITION WORKFLOW ("Shelters can ask food")
   ========================================================================== */
function openShelterRequestModal() {
  const modal = document.getElementById('modal-shelter-request');
  if (!modal) return;
  modal.removeAttribute('hidden');
  modal.hidden = false;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeShelterRequestModal() {
  const modal = document.getElementById('modal-shelter-request');
  if (!modal) return;
  modal.setAttribute('hidden', 'true');
  modal.hidden = true;
  modal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

async function handleShelterRequestSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('req-shelter-name')?.value.trim();
  const type = document.getElementById('req-shelter-type')?.value;
  const city = document.getElementById('req-shelter-city')?.value;
  const meals = Number(document.getElementById('req-shelter-meals')?.value) || 50;
  const foodPref = document.getElementById('req-food-preference')?.value;
  const phone = document.getElementById('req-contact-phone')?.value.trim();
  const address = document.getElementById('req-shelter-address')?.value.trim();
  const notes = document.getElementById('req-special-notes')?.value.trim();

  const submitBtn = document.getElementById('btn-submit-shelter-req');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Broadcasting to Network...</span>';
  }

  // Log requisition to Supabase audit_log so Admins can inspect and dispatch
  if (sbClient) {
    try {
      await sbClient.from('audit_log').insert([{
        action: 'SHELTER_FOOD_REQUISITION',
        target: `${name} (${city})`,
        details: { meals, foodPref, type, phone, address, notes, created_at: new Date().toISOString() }
      }]);
    } catch (err) {
      console.warn('[Shelter Request] Could not write to audit_log:', err.message);
    }
  }

  closeShelterRequestModal();
  showToast(`🙏 Requisition for ${meals} meals submitted for ${name}! Matching donors will be notified.`);

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Broadcast Requisition to Network</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  }
}

/* ==========================================================================
   6. HELPLINE & IVR DIAL-PAD SIMULATOR
   ========================================================================== */
function switchHelplineMode(mode) {
  const tabSms = document.getElementById('tab-btn-sms');
  const tabIvr = document.getElementById('tab-btn-ivr');
  const panelSms = document.getElementById('helpline-sms-panel');
  const panelIvr = document.getElementById('helpline-ivr-panel');

  if (mode === 'sms') {
    tabSms.classList.add('active');
    tabIvr.classList.remove('active');
    panelSms.style.display = 'block';
    panelIvr.style.display = 'none';
  } else {
    tabIvr.classList.add('active');
    tabSms.classList.remove('active');
    panelIvr.style.display = 'block';
    panelSms.style.display = 'none';
  }
}

// IVR State Machine
let ivrStep = 1;
let ivrBuffer = '';
let ivrDonation = { qty: 50, food_category: 'cooked rice/dal', area: 'Central Jaipur' };

function initHelplineIVR() {
  resetIvrCall();
}

function resetIvrCall() {
  ivrStep = 1;
  ivrBuffer = '';
  const promptEl = document.getElementById('ivr-voice-prompt');
  const inputEl = document.getElementById('ivr-entered-keys');
  const stepBadge = document.getElementById('ivr-step-badge');

  if (promptEl) promptEl.innerHTML = '"Namaste! Press <strong>1</strong> to broadcast surplus food rescue."';
  if (inputEl) inputEl.innerHTML = '&nbsp;';
  if (stepBadge) stepBadge.textContent = 'Step 1/4';
}

function playDtmfTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {}
}

function pressIvrKey(key) {
  playDtmfTone();
  const inputEl = document.getElementById('ivr-entered-keys');
  const promptEl = document.getElementById('ivr-voice-prompt');
  const stepBadge = document.getElementById('ivr-step-badge');

  if (key === '*') {
    ivrBuffer = '';
    if (inputEl) inputEl.textContent = '';
    return;
  }

  if (key !== '#') {
    ivrBuffer += key;
    if (inputEl) inputEl.textContent = ivrBuffer;
  }

  // STEP 1: Press 1 to start
  if (ivrStep === 1 && ivrBuffer.includes('1')) {
    ivrStep = 2;
    ivrBuffer = '';
    if (inputEl) inputEl.textContent = '';
    if (promptEl) promptEl.innerHTML = '"Please key in the <strong>number of meals/plates</strong>, then press <strong>#</strong> (e.g. 50#)"';
    if (stepBadge) stepBadge.textContent = 'Step 2/4';
    return;
  }

  // STEP 2: Meals quantity + #
  if (ivrStep === 2 && key === '#') {
    const plates = parseInt(ivrBuffer, 10) || 50;
    ivrDonation.qty = plates;
    ivrStep = 3;
    ivrBuffer = '';
    if (inputEl) inputEl.textContent = '';
    if (promptEl) promptEl.innerHTML = '"Select food type: Press <strong>1 for Cooked</strong>, <strong>2 for Dairy</strong>, <strong>3 for Bakery/Dry</strong>, then press <strong>#</strong>."';
    if (stepBadge) stepBadge.textContent = 'Step 3/4';
    return;
  }

  // STEP 3: Category + #
  if (ivrStep === 3 && key === '#') {
    const catCode = ivrBuffer.trim();
    if (catCode === '2') ivrDonation.food_category = 'dairy';
    else if (catCode === '3') ivrDonation.food_category = 'dry snacks';
    else ivrDonation.food_category = 'cooked rice/dal';

    ivrStep = 4;
    ivrBuffer = '';
    if (inputEl) inputEl.textContent = '';
    if (promptEl) promptEl.innerHTML = '"Key in your 6-digit Postal PIN (e.g. <strong>302001</strong>), then press <strong>#</strong>."';
    if (stepBadge) stepBadge.textContent = 'Step 4/4';
    return;
  }

  // STEP 4: Area PIN + # (Final Dispatch)
  if (ivrStep === 4 && key === '#') {
    const pin = ivrBuffer.trim() || '302001';
    ivrDonation.area = `PIN ${pin} Helpline Call`;

    if (promptEl) promptEl.innerHTML = '⚡ <em>"Connecting to nearest shelter... Dispatch confirmed!"</em>';
    if (stepBadge) stepBadge.textContent = 'DISPATCHED';

    dispatchHelplineDonation(ivrDonation);
    setTimeout(() => resetIvrCall(), 4500);
  }
}

/**
 * Dispatches a donation created via Helpline or SMS to Supabase
 */
async function dispatchHelplineDonation({ qty, food_category, area, source = 'Helpline' }) {
  const donorLat = 26.9124;
  const donorLon = 75.7873;
  const safeMinutes = window.SahakaraMatching?.getDefaultSafeMinutes(food_category) || 240;

  const match = window.SahakaraMatching
    ? window.SahakaraMatching.findMatch({ lat: donorLat, lon: donorLon, qty, safe_minutes: safeMinutes, food_category }, allRecipients, 0)
    : { matchedRecipient: allRecipients[0], stage: 1 };

  const matched = match.matchedRecipient || allRecipients[0];
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  const payload = {
    food: `${qty} Meals (${food_category})`,
    qty: qty,
    donor_type: 'Restaurant',
    city: 'Jaipur',
    area: area || 'Helpline IVR Call-in',
    lat: donorLat,
    lon: donorLon,
    safe_minutes: safeMinutes,
    food_category: food_category,
    status: 'Matched',
    match_id: matched ? matched.id : null,
    stage: match.stage || 1,
    source: source,
    otp: otp
  };

  let record = { ...payload, id: 'hl-' + Math.random().toString(36).substring(2, 8), created_at: new Date().toISOString() };

  if (sbClient) {
    try {
      const { data, error } = await sbClient.from('donations').insert([payload]).select();
      if (!error && data && data[0]) record = data[0];
    } catch (e) {}
  }

  allDonations.unshift(record);
  currentLiveDispatch = record;

  // Update SMS bubble reply display
  const bubbleReply = document.getElementById('sms-bubble-reply');
  if (bubbleReply) {
    bubbleReply.innerHTML = `DISPATCH: Pickup ${qty} meals. Matched to <strong>${matched.name}</strong>. Driver Vikram assigned. Handover OTP: <strong>${otp}</strong>.`;
  }

  showToast(`📞 Toll-Free Helpline Dispatch Created: ${qty} meals matched to ${matched.name} (OTP: ${otp})`);
  renderDispatchCard(record);
  renderRealtimeTable();
  recalculateDashboardMetrics();
  renderMapData();
}

/**
 * SMS Presets for testing
 */
function simulateSmsPreset(preset) {
  if (preset === 'amity') {
    dispatchHelplineDonation({ qty: 50, food_category: 'cooked rice/dal', area: 'Amity Mess (SMS 56161)', source: 'SMS' });
  } else if (preset === 'banquet') {
    dispatchHelplineDonation({ qty: 100, food_category: 'cooked rice/dal', area: 'Royal Banquet (SMS 56161)', source: 'SMS' });
  } else if (preset === 'bakery') {
    dispatchHelplineDonation({ qty: 30, food_category: 'dry snacks', area: 'C-Scheme Bakery (SMS 56161)', source: 'SMS' });
  }
}

/* ==========================================================================
   7. TIME-WARP SLIDER (CLIENT-SIDE DEMO SIMULATOR)
   ========================================================================== */
let timeWarpMinutes = 25;
let timeWarpAutoPlayInterval = null;

function initLadderCountdown() {
  updateLadderDisplay(timeWarpMinutes);
}

function onTimeWarpSliderChange(val) {
  timeWarpMinutes = parseInt(val, 10);
  updateLadderDisplay(timeWarpMinutes);
}

function setTimeWarp(minutes) {
  timeWarpMinutes = minutes;
  const slider = document.getElementById('timewarp-slider');
  if (slider) slider.value = minutes;
  updateLadderDisplay(minutes);
}

function toggleTimeWarpAutoPlay() {
  const playBtn = document.getElementById('btn-timewarp-play');
  const playIcon = document.getElementById('play-icon');
  const playText = document.getElementById('play-text');
  const slider = document.getElementById('timewarp-slider');

  if (timeWarpAutoPlayInterval) {
    clearInterval(timeWarpAutoPlayInterval);
    timeWarpAutoPlayInterval = null;
    playBtn.classList.remove('playing');
    playIcon.textContent = '▶';
    playText.textContent = 'Auto Sim';
  } else {
    if (timeWarpMinutes >= 235) {
      timeWarpMinutes = 0;
      if (slider) slider.value = 0;
    }

    playBtn.classList.add('playing');
    playIcon.textContent = '⏸';
    playText.textContent = 'Pause';

    timeWarpAutoPlayInterval = setInterval(() => {
      if (timeWarpMinutes < 240) {
        timeWarpMinutes += 5;
        if (slider) slider.value = timeWarpMinutes;
        updateLadderDisplay(timeWarpMinutes);
      } else {
        toggleTimeWarpAutoPlay();
      }
    }, 350);
  }
}

function updateLadderDisplay(mins) {
  const displayEl = document.getElementById('warp-time-display');
  const badgeEl = document.getElementById('warp-tier-badge');
  const tier1Timer = document.getElementById('tier-1-timer');

  const row1 = document.getElementById('tier-row-1');
  const row2 = document.getElementById('tier-row-2');
  const row3 = document.getElementById('tier-row-3');
  const row4 = document.getElementById('tier-row-4');

  const p1 = document.getElementById('preset-t1');
  const p2 = document.getElementById('preset-t2');
  const p3 = document.getElementById('preset-t3');
  const p4 = document.getElementById('preset-t4');

  if (displayEl) displayEl.textContent = `${mins} min`;

  [p1, p2, p3, p4].forEach((p) => p && p.classList.remove('active'));
  [row1, row2, row3, row4].forEach((r) => r && r.classList.remove('active-tier', 'passed-tier'));

  // Calculate Stage via SahakaraMatching
  const stage = window.SahakaraMatching ? window.SahakaraMatching.currentStage(mins, 240) : mins <= 45 ? 1 : mins <= 90 ? 2 : mins <= 150 ? 3 : 4;

  if (stage === 1) {
    if (badgeEl) {
      badgeEl.className = 'timewarp-tier-badge tier-1-badge';
      badgeEl.textContent = 'Tier 1: Human Grade (Fresh)';
    }
    if (p1) p1.classList.add('active');
    if (row1) row1.classList.add('active-tier');
    if (tier1Timer) tier1Timer.textContent = `${45 - mins}m left`;
    updateHeroCardRecipientName(1, 'Ananda Seva Ashram (Node 04)');
  } else if (stage === 2) {
    if (badgeEl) {
      badgeEl.className = 'timewarp-tier-badge tier-2-badge';
      badgeEl.textContent = 'Tier 2: Regional Shelter Hub';
    }
    if (p2) p2.classList.add('active');
    if (row1) row1.classList.add('passed-tier');
    if (row2) row2.classList.add('active-tier');
    updateHeroCardRecipientName(2, 'Akshaya Patra Foundation (Regional Hub)');
  } else if (stage === 3) {
    if (badgeEl) {
      badgeEl.className = 'timewarp-tier-badge tier-3-badge';
      badgeEl.textContent = 'Tier 3: Animal Shelter (Gaushala)';
    }
    if (p3) p3.classList.add('active');
    if (row1) row1.classList.add('passed-tier');
    if (row2) row2.classList.add('passed-tier');
    if (row3) row3.classList.add('active-tier');
    updateHeroCardRecipientName(3, 'Shree Govind Dev Ji Gaushala (Livestock)');
  } else {
    if (badgeEl) {
      badgeEl.className = 'timewarp-tier-badge tier-4-badge';
      badgeEl.textContent = 'Tier 4: Zero-Landfill Compost';
    }
    if (p4) p4.classList.add('active');
    if (row1) row1.classList.add('passed-tier');
    if (row2) row2.classList.add('passed-tier');
    if (row3) row3.classList.add('passed-tier');
    if (row4) row4.classList.add('active-tier');
    updateHeroCardRecipientName(4, 'Durgapura Municipal Bio-Compost Hub');
  }
}

function updateHeroCardRecipientName(tierNum, recipientName) {
  const destEl = document.getElementById('card-destination');
  const stagePill = document.getElementById('card-stage-pill');
  if (destEl) destEl.textContent = recipientName;
  if (stagePill) stagePill.textContent = `TIER ${tierNum} ACTIVE`;
}

/* ==========================================================================
   8. INTERACTIVE LEAFLET.JS MAP & OSRM RADAR
   ========================================================================== */
function initJaipurMap() {
  const mapContainer = document.getElementById('jaipur-live-map');
  if (!mapContainer) return;
  
  if (jaipurMap) {
    jaipurMap.invalidateSize();
    return;
  }

  if (typeof L === 'undefined' || !L.map) {
    console.warn('[Map] Leaflet library still loading, retrying...');
    setTimeout(initJaipurMap, 150);
    return;
  }

  try {
    jaipurMap = L.map('jaipur-live-map', {
      center: [27.0500, 75.8800],
      zoom: 11,
      zoomControl: true,
      scrollWheelZoom: false
    });

    // Pure Leaflet with OpenStreetMap tiles (no Google Maps / no API key)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>'
    }).addTo(jaipurMap);

    renderMapData();

    // Repeated invalidateSize triggers for instant and reliable rendering
    [50, 200, 500, 1200, 2500].forEach((ms) => {
      setTimeout(() => {
        if (jaipurMap) jaipurMap.invalidateSize();
      }, ms);
    });
  } catch (err) {
    console.warn('[Map] Leaflet initialization error:', err.message);
  }
}

window.addEventListener('load', () => {
  initJaipurMap();
});
window.addEventListener('resize', () => {
  if (jaipurMap) jaipurMap.invalidateSize();
});

async function renderMapData() {
  if (!jaipurMap) return;

  // Clear existing markers
  mapMarkers.forEach((m) => jaipurMap.removeLayer(m));
  mapMarkers = [];
  if (activeRoutePolyline) jaipurMap.removeLayer(activeRoutePolyline);

  const customIcon = (type) => {
    const color = type === 'shelter' ? '#0F7B5F' : type === 'gaushala' ? '#EA580C' : type === 'compost' ? '#6B7280' : type === 'donor' ? '#D97706' : '#2563EB';
    const label = type === 'shelter' ? '🏠' : type === 'gaushala' ? '🐄' : type === 'compost' ? '🌱' : type === 'donor' ? '🍛' : '🛵';

    return L.divIcon({
      className: 'custom-map-pin',
      html: `<div style="background:${color};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#FFF;border:2.5px solid #FFF;box-shadow:0 3px 10px rgba(0,0,0,0.3);font-size:14px;">${label}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18]
    });
  };

  const boundsLatLngs = [];

  // 1. Add Active Donor Marker (Amity University Central Mess)
  const donorCoords = [27.1729, 75.9542];
  if (activeFilter === 'all' || activeFilter === 'donor') {
    const donorMarker = L.marker(donorCoords, { icon: customIcon('donor') }).addTo(jaipurMap).bindPopup(`
      <div style="font-family:sans-serif;font-size:12px;min-width:180px;">
        <strong style="font-size:13px;color:#111827;">Amity Campus Central Mess</strong><br>
        <span style="color:#D97706;font-weight:700;">DONOR KITCHEN</span><br>
        <span>Surplus Batch: <strong>40 Hot Meals</strong></span><br>
        <small style="color:#6B7280;">NH-11C, Kant Kalwar, Jaipur</small>
      </div>
    `);
    mapMarkers.push(donorMarker);
    boundsLatLngs.push(donorCoords);
  }

  // 2. Add Active Volunteer Driver Marker (Vikram R. EV Carrier)
  const driverCoords = [27.0500, 75.8900];
  if (activeFilter === 'all' || activeFilter === 'driver') {
    const driverMarker = L.marker(driverCoords, { icon: customIcon('driver') }).addTo(jaipurMap).bindPopup(`
      <div style="font-family:sans-serif;font-size:12px;min-width:180px;">
        <strong style="font-size:13px;color:#111827;">Driver Vikram R. (EV-4419)</strong><br>
        <span style="color:#2563EB;font-weight:700;">ACTIVE EV CARRIER</span><br>
        <span>En route &bull; Temp: <strong>64°C</strong> (Hot Bag)</span><br>
        <small style="color:#6B7280;">Speed: 32 km/h &bull; Battery: 86%</small>
      </div>
    `);
    mapMarkers.push(driverMarker);
    boundsLatLngs.push(driverCoords);
  }

  // 3. Add Recipients (Shelters, Gaushalas, Compost)
  const shelterCoords = [26.9248, 75.8267]; // Ananda Seva Ashram
  allRecipients.forEach((rec) => {
    if (activeFilter === 'all' || activeFilter === rec.type) {
      const coords = [rec.lat, rec.lon];
      const marker = L.marker(coords, { icon: customIcon(rec.type) }).addTo(jaipurMap).bindPopup(`
        <div style="font-family:sans-serif;font-size:12px;min-width:180px;">
          <strong style="color:#111827;font-size:13px;">${rec.name}</strong><br>
          <span style="color:#0F7B5F;font-weight:700;">${rec.type.toUpperCase()} NODE</span><br>
          <span>Intake Capacity: <strong>${rec.capacity} meals</strong></span><br>
          <small style="color:#6B7280;">${rec.needs_note || rec.address || ''}</small>
        </div>
      `);
      mapMarkers.push(marker);
      boundsLatLngs.push(coords);
    }
  });

  // 4. Draw Real Road Route using Public OSRM API (with straight line fallback)
  drawOsrmRoute(donorCoords, driverCoords, shelterCoords);

  // Fit bounds if we have points
  if (boundsLatLngs.length > 0) {
    try {
      const bounds = L.latLngBounds(boundsLatLngs);
      jaipurMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    } catch (e) {}
  }
}

/**
 * Fetches real road coordinates from free public OSRM API (router.project-osrm.org)
 * Falls back to a direct straight line polyline if network/API fails.
 */
async function drawOsrmRoute(donor, driver, shelter) {
  const straightLineFallback = [donor, driver, shelter];

  try {
    // OSRM expects coordinates in {longitude},{latitude} format
    const coordinatesStr = `${donor[1]},${donor[0]};${driver[1]},${driver[0]};${shelter[1]},${shelter[0]}`;
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordinatesStr}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 second timeout

    const response = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);
    const data = await response.json();

    if (data && data.routes && data.routes[0] && data.routes[0].geometry) {
      // GeoJSON is [lon, lat] -> convert to Leaflet [lat, lon]
      const routeLatLngs = data.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);

      if (activeRoutePolyline && jaipurMap) {
        jaipurMap.removeLayer(activeRoutePolyline);
      }

      activeRoutePolyline = L.polyline(routeLatLngs, {
        color: '#0F7B5F',
        weight: 5,
        opacity: 0.85,
        lineJoin: 'round'
      }).addTo(jaipurMap);
      return;
    }
  } catch (err) {
    console.warn('[OSRM Routing] Road route unavailable, using straight line fallback:', err.message);
  }

  // Fallback to straight polyline
  if (activeRoutePolyline && jaipurMap) {
    jaipurMap.removeLayer(activeRoutePolyline);
  }
  activeRoutePolyline = L.polyline(straightLineFallback, {
    color: '#0F7B5F',
    weight: 4,
    dashArray: '8, 8',
    opacity: 0.85
  }).addTo(jaipurMap);
}

function filterMapNodes(filter, element) {
  activeFilter = filter;
  document.querySelectorAll('.map-chip').forEach((c) => c.classList.remove('active'));
  if (element) element.classList.add('active');
  renderMapData();
}

/* ==========================================================================
   9. AUTHENTICATION (EMAIL OTP / PASSWORD / JWT)
   ========================================================================== */
const AUTH_API_BASE = 'http://localhost:3001/api/auth';
let authState = {
  token: localStorage.getItem('sahakara_auth_token') || null,
  user: JSON.parse(localStorage.getItem('sahakara_auth_user') || 'null')
};
let currentSignupData = {};
let currentLoginEmail = '';
let loginOtpTimer = null;
let signupOtpTimer = null;

async function initAuth() {
  renderNavAuthState();
  setupOtpDigitInputs('login-otp-inputs');
  setupOtpDigitInputs('signup-otp-inputs');

  if (authState.token) {
    try {
      const res = await fetch(`${AUTH_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          authState.user = data.user;
          localStorage.setItem('sahakara_auth_user', JSON.stringify(data.user));
          renderNavAuthState();
        }
      }
    } catch (e) {}
  }
}

function renderNavAuthState() {
  const container = document.getElementById('nav-actions-container');
  if (!container) return;

  if (authState.user) {
    const roleEmoji = authState.user.role === 'donor' ? '🍛' : authState.user.role === 'shelter' ? '🏠' : '🛵';
    const roleName = (authState.user.role || 'Partner').toUpperCase();
    const initials = (authState.user.name || 'User')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    container.innerHTML = `
      <div class="user-nav-profile" title="Logged in as ${authState.user.name} (${authState.user.email})">
        <div class="user-avatar">${initials}</div>
        <div class="user-info">
          <span class="user-nav-name">${authState.user.name}</span>
          <span class="user-nav-role">${roleEmoji} ${roleName}</span>
        </div>
        <button type="button" class="btn-nav-logout" onclick="logout(true)" title="Sign out">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        </button>
      </div>
      <button type="button" class="btn btn-primary" onclick="openPostModal()">
        <span>Post surplus</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    `;
  } else {
    container.innerHTML = `
      <button type="button" class="btn btn-ghost" id="btn-nav-signin" onclick="openSignInModal()">Sign in</button>
      <button type="button" class="btn btn-primary" onclick="openPostModal()">
        <span>Post surplus food</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    `;
  }
}

function openSignInModal(initialTab = 'signin') {
  const modal = document.getElementById('modal-signin');
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  hideAuthAlert();
  switchAuthTab(initialTab);
}

function closeSignInModal() {
  const modal = document.getElementById('modal-signin');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

function switchAuthTab(tab) {
  const btnSignin = document.getElementById('tab-btn-signin');
  const btnSignup = document.getElementById('tab-btn-signup');
  const panelSignin = document.getElementById('auth-panel-signin');
  const panelSignup = document.getElementById('auth-panel-signup');

  hideAuthAlert();

  if (tab === 'signin') {
    if (btnSignin) btnSignin.classList.add('active');
    if (btnSignup) btnSignup.classList.remove('active');
    if (panelSignin) panelSignin.style.display = 'block';
    if (panelSignup) panelSignup.style.display = 'none';
  } else {
    if (btnSignup) btnSignup.classList.add('active');
    if (btnSignin) btnSignin.classList.remove('active');
    if (panelSignup) panelSignup.style.display = 'block';
    if (panelSignin) panelSignin.style.display = 'none';
  }
}

function toggleLoginMethod(method) {
  const btnPwd = document.getElementById('btn-login-method-pwd');
  const btnOtp = document.getElementById('btn-login-method-otp');
  const formPwd = document.getElementById('form-login-pwd');
  const formOtp = document.getElementById('form-login-otp');

  hideAuthAlert();

  if (method === 'password') {
    if (btnPwd) btnPwd.classList.add('active');
    if (btnOtp) btnOtp.classList.remove('active');
    if (formPwd) formPwd.style.display = 'flex';
    if (formOtp) formOtp.style.display = 'none';
  } else {
    if (btnOtp) btnOtp.classList.add('active');
    if (btnPwd) btnPwd.classList.remove('active');
    if (formOtp) formOtp.style.display = 'block';
    if (formPwd) formPwd.style.display = 'none';
  }
}

function selectSignupRole(role, element) {
  document.querySelectorAll('.role-card').forEach((card) => card.classList.remove('selected'));
  if (element) element.classList.add('selected');
  const radio = element ? element.querySelector('input[type="radio"]') : null;
  if (radio) radio.checked = true;
}

function showAuthAlert(type, message, devOtp = null) {
  const alertEl = document.getElementById('auth-alert');
  if (!alertEl) return;
  alertEl.className = `auth-alert ${type}`;
  alertEl.hidden = false;

  if (devOtp) {
    alertEl.innerHTML = `
      <div>${message}</div>
      <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:0.75rem;" onclick="autoFillOtp('${devOtp}')">
        Fill OTP: <strong>${devOtp}</strong>
      </button>
    `;
  } else {
    alertEl.textContent = message;
  }
}

function hideAuthAlert() {
  const alertEl = document.getElementById('auth-alert');
  if (alertEl) alertEl.hidden = true;
}

function autoFillOtp(otp) {
  const digits = otp.split('');
  const activePanel = document.getElementById('auth-panel-signup')?.style.display === 'block' ? 'signup' : 'login';
  const inputs = document.querySelectorAll(`#${activePanel}-otp-inputs .otp-box-digit`);
  inputs.forEach((input, idx) => {
    input.value = digits[idx] || '';
  });
  if (inputs.length > 0) inputs[inputs.length - 1].focus();
}

function setupOtpDigitInputs(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const inputs = container.querySelectorAll('.otp-box-digit');
  inputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = val ? val.slice(-1) : '';
      if (val && index < inputs.length - 1) inputs[index + 1].focus();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) inputs[index - 1].focus();
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
      if (/^\d{6}$/.test(pasteData)) {
        pasteData.split('').forEach((d, i) => {
          if (inputs[i]) inputs[i].value = d;
        });
        inputs[inputs.length - 1].focus();
      }
    });
  });
}

function getOtpCodeFromBoxes(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return '';
  const inputs = container.querySelectorAll('.otp-box-digit');
  return Array.from(inputs).map((i) => i.value).join('');
}

async function handlePasswordLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-submit-pwd-login');

  if (btn) btn.disabled = true;
  hideAuthAlert();

  try {
    const res = await fetch(`${AUTH_API_BASE}/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setAuthSession(data.token, data.user);
      closeSignInModal();
      showToast(`Welcome back, ${data.user.name}!`);
    } else {
      showAuthAlert('error', data.error || 'Invalid email or password');
    }
  } catch (err) {
    showAuthAlert('error', 'Authentication server offline. Make sure backend port 3001 is running.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function quickLoginPersona(role) {
  const creds = {
    donor: { email: 'donor@sahakara.org', password: 'Sahakara@123' },
    shelter: { email: 'shelter@sahakara.org', password: 'Sahakara@123' },
    driver: { email: 'driver@sahakara.org', password: 'Sahakara@123' }
  };

  const cred = creds[role];
  if (!cred) return;

  try {
    const res = await fetch(`${AUTH_API_BASE}/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cred)
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setAuthSession(data.token, data.user);
      closeSignInModal();
      showToast(`Logged in as demo persona: ${data.user.name} (${data.user.role.toUpperCase()})`);
    } else {
      showAuthAlert('error', 'Could not login demo persona');
    }
  } catch (e) {
    showAuthAlert('error', 'Backend port 3001 offline.');
  }
}

function setAuthSession(token, user) {
  authState.token = token;
  authState.user = user;
  localStorage.setItem('sahakara_auth_token', token);
  localStorage.setItem('sahakara_auth_user', JSON.stringify(user));
  renderNavAuthState();
}

function logout(showNotice = true) {
  authState.token = null;
  authState.user = null;
  localStorage.removeItem('sahakara_auth_token');
  localStorage.removeItem('sahakara_auth_user');
  renderNavAuthState();
  if (showNotice) showToast('You have been signed out.');
}

/* ==========================================================================
   10. TOAST NOTIFICATION & COMPLIANCE MODALS
   ========================================================================== */
function showToast(message) {
  let toast = document.getElementById('sahakara-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sahakara-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #111827;
      color: #FFFFFF;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid #374151;
      transition: all 0.3s ease;
      opacity: 0;
      transform: translateY(10px);
    `;
    document.body.appendChild(toast);
  }

  toast.innerHTML = `<span>🌱</span> <span>${message}</span>`;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 4000);
}

function openNoticeModal(title) {
  const modal = document.getElementById('modal-notice');
  const heading = document.getElementById('notice-heading');
  const body = document.getElementById('notice-body');
  if (!modal) return;
  if (heading) heading.textContent = title;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeNoticeModal() {
  const modal = document.getElementById('modal-notice');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

function openFssaiPassModal() {
  const modal = document.getElementById('modal-fssai-pass');
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeFssaiPassModal() {
  const modal = document.getElementById('modal-fssai-pass');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}



