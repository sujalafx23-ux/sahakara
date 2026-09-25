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
  checkAdminPresence();
  initOrders();
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
  if (typeof isAuthenticated === 'function' && !isAuthenticated()) {
    if (typeof pendingAuthAction !== 'undefined') {
      pendingAuthAction = { type: 'donate', personaRole: personaRole || 'donor' };
    }
    if (typeof openSignInModal === 'function') {
      openSignInModal('signup', 'donor', 'Account required: Please sign up with your email and password to donate surplus food.');
    }
    if (typeof showToast === 'function') {
      showToast('⚠️ Please sign up or log in with email & password to donate surplus food.');
    }
    return;
  }

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

  if (personaRole === 'donor' || (typeof authState !== 'undefined' && authState?.user?.role === 'donor')) {
    const donorType = document.getElementById('post-donor-type');
    if (donorType) donorType.value = 'Restaurant';
    const nameInput = document.getElementById('post-donor-name');
    if (nameInput && authState?.user?.name && !nameInput.value) {
      nameInput.value = authState.user.organization || authState.user.name;
    }
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

  if (typeof isAuthenticated === 'function' && !isAuthenticated()) {
    if (typeof pendingAuthAction !== 'undefined') {
      pendingAuthAction = { type: 'donate' };
    }
    if (typeof openSignInModal === 'function') {
      openSignInModal('signup', 'donor', 'Account required: Please sign up with your email and password to donate surplus food.');
    }
    if (typeof showToast === 'function') {
      showToast('⚠️ Sign up required to post food donations.');
    }
    return;
  }

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

  // Register Donor Order into Orders Section
  const newDonorOrder = {
    id: 'ORD-' + (createdDonation.id ? createdDonation.id.replace('sk-', '').substring(0, 5).toUpperCase() : Math.floor(1000 + Math.random() * 9000)),
    orderType: 'donor',
    food: foodName || `${qty} Meals (${foodCategory})`,
    qty: qty,
    category: foodCategory,
    city: city,
    donor: establishmentName,
    recipient: matchedRecipient ? matchedRecipient.name : 'Verified Rescue Node',
    status: 'Matched',
    stage: stage,
    otp: otp,
    timestamp: Date.now()
  };
  addOrderToRegistry(newDonorOrder);

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
  const citiesUnitEl = document.getElementById('stat-cities-unit');
  const citiesTitleEl = document.getElementById('stat-cities-title');
  const citiesDescEl = document.getElementById('stat-cities-desc');
  const dumpsterEl = document.getElementById('stat-dumpster-count');

  // Sum qty where status = 'Delivered'
  const deliveredDonations = allDonations.filter((d) => (d.status || '').toLowerCase() === 'delivered');
  const realRescuedMeals = deliveredDonations.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);
  const totalKg = Math.round(realRescuedMeals * 0.4); // 1 meal = 0.4 kg
  const expiredCount = allDonations.filter((d) => (d.status || '').toLowerCase() === 'expired').length;

  const liveCities = allCities.filter((c) => c.status === 'Live');

  if (mealsEl) mealsEl.textContent = realRescuedMeals.toLocaleString('en-IN');
  if (kgEl) kgEl.textContent = totalKg.toLocaleString('en-IN');
  if (citiesEl) citiesEl.textContent = liveCities.length > 0 ? liveCities.length : 1;
  if (citiesUnitEl) citiesUnitEl.textContent = liveCities.length > 1 ? 'active clusters' : 'pilot cluster';
  if (citiesTitleEl) {
    citiesTitleEl.textContent = 'Pilot city: Jaipur, expanding city by city';
  }
  if (citiesDescEl) {
    citiesDescEl.textContent = `Pilot city: Jaipur, expanding city by city across nationwide urban logistics clusters.`;
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
          <td><span style="color:#0F7B5F;font-weight:500;">${tierCategory}</span> <small class="sim-badge">Demo data</small></td>
          <td><code style="letter-spacing:2px;color:var(--text-muted);">••••</code></td>
        </tr>
      `;
    })
    .join('');
}

/* ==========================================================================
   SHELTER FOOD REQUISITION WORKFLOW ("Shelters can ask food")
   Demo-safe matching with progressive filter relaxation and demo seeder
   ========================================================================== */
let lastShelterRequest = null;

const CITY_COORDS_MAP = {
  'jaipur': { lat: 26.9124, lon: 75.7873 },
  'delhi ncr': { lat: 28.6139, lon: 77.2090 },
  'delhi': { lat: 28.6139, lon: 77.2090 },
  'bengaluru': { lat: 12.9716, lon: 77.5946 },
  'mumbai': { lat: 19.0760, lon: 72.8777 },
  'hyderabad': { lat: 17.3850, lon: 78.4867 }
};

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round((R * c) * 10) / 10;
}

function matchesCategory(requestedPref, donationCategory, donationFoodName = '') {
  const req = (requestedPref || '').toLowerCase();
  const cat = (donationCategory || '').toLowerCase();
  const name = (donationFoodName || '').toLowerCase();
  const text = `${cat} ${name}`;

  if (req.includes('cooked')) {
    return text.includes('cooked') || text.includes('rice') || text.includes('dal') || text.includes('curry') || text.includes('thali') || text.includes('chawal') || text.includes('chapati') || text.includes('pulao') || text.includes('meal') || text.includes('sabzi') || text.includes('dinner') || text.includes('lunch');
  }
  if (req.includes('dry') || req.includes('ration') || req.includes('pantry')) {
    return text.includes('dry') || text.includes('ration') || text.includes('snack') || text.includes('bakery') || text.includes('bread') || text.includes('bun') || text.includes('biscuit') || text.includes('grain');
  }
  if (req.includes('raw') || req.includes('produce')) {
    return text.includes('raw') || text.includes('produce') || text.includes('veg') || text.includes('fruit') || text.includes('greens') || text.includes('peel');
  }
  return cat.includes(req) || req.includes(cat);
}

function getDonationTimeLeftMinutes(d) {
  const safeMins = Number(d.safe_minutes) || 240;
  if (!d.created_at) return safeMins;
  const elapsedMins = Math.max(0, Math.floor((Date.now() - new Date(d.created_at).getTime()) / 60000));
  return Math.max(15, safeMins - elapsedMins);
}

function openShelterRequestModal() {
  if (typeof isAuthenticated === 'function' && !isAuthenticated()) {
    if (typeof pendingAuthAction !== 'undefined') {
      pendingAuthAction = { type: 'shelter_request' };
    }
    if (typeof openSignInModal === 'function') {
      openSignInModal('signup', 'shelter', 'Account required: Please sign up with your email and password to request or claim surplus food.');
    }
    if (typeof showToast === 'function') {
      showToast('⚠️ Please sign up or log in with email & password to request surplus food.');
    }
    return;
  }

  const modal = document.getElementById('modal-shelter-request');
  if (!modal) return;
  modal.removeAttribute('hidden');
  modal.hidden = false;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  const formView = document.getElementById('shelter-req-form-view');
  const resultsView = document.getElementById('shelter-req-results-view');
  if (formView) formView.style.display = 'block';
  if (resultsView) resultsView.style.display = 'none';

  if (typeof authState !== 'undefined' && authState?.user?.name) {
    const nameInput = document.getElementById('shelter-name');
    if (nameInput && !nameInput.value) {
      nameInput.value = authState.user.organization || authState.user.name;
    }
  }

  checkAdminPresence();
}

function closeShelterRequestModal() {
  const modal = document.getElementById('modal-shelter-request');
  if (!modal) return;
  modal.setAttribute('hidden', 'true');
  modal.hidden = true;
  modal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

function backToShelterReqForm() {
  const formView = document.getElementById('shelter-req-form-view');
  const resultsView = document.getElementById('shelter-req-results-view');
  if (formView) formView.style.display = 'block';
  if (resultsView) resultsView.style.display = 'none';
}

/**
 * Progressive Food Ladder Matching Algorithm for Shelters:
 * 1. Strict match: same city, matching food category, status Matched/Posted, quantity available, sorted by distance and time left.
 * 2. Progressive filter relaxation:
 *    a. Same city, any food category -> "Category flexible match"
 *    b. Any city, same category -> "Nearby cluster match"
 *    c. Any donation with status Posted or Matched regardless of city/category -> "Best available match (expanding search)"
 * 3. Never show hard empty state unless truly 0 donations in entire table. In that case, show sample donation card (unclaimable).
 */
function findDonationsForShelterRequest(req) {
  const reqCityNorm = (req.city || '').trim().toLowerCase();
  const shelterCityCoord = CITY_COORDS_MAP[reqCityNorm] || CITY_COORDS_MAP['jaipur'];

  const enrichItem = (item) => {
    let lat = item.lat;
    let lon = item.lon;
    const itemCityNorm = (item.city || '').trim().toLowerCase();
    if (!lat || !lon) {
      const coord = CITY_COORDS_MAP[itemCityNorm];
      if (coord) {
        lat = coord.lat;
        lon = coord.lon;
      }
    }
    const dist = calculateDistanceKm(shelterCityCoord.lat, shelterCityCoord.lon, lat, lon);
    const timeLeft = getDonationTimeLeftMinutes(item);
    return {
      ...item,
      _dist: dist !== null ? dist : (itemCityNorm === reqCityNorm ? 3.8 : 250),
      _timeLeft: timeLeft
    };
  };

  const sortItems = (items) => {
    return items.sort((a, b) => {
      const distA = a._dist !== null && a._dist !== undefined ? a._dist : 9999;
      const distB = b._dist !== null && b._dist !== undefined ? b._dist : 9999;
      if (Math.abs(distA - distB) > 0.5) return distA - distB;
      return a._timeLeft - b._timeLeft;
    });
  };

  // Base pool of active donations (Posted or Matched with positive quantity)
  const candidatePool = (allDonations || []).filter((d) => {
    const s = (d.status || '').toLowerCase();
    const qty = Number(d.qty) || 0;
    return (s === 'posted' || s === 'matched') && qty > 0;
  });

  // Level 1: Strict Match (same city, matching food category, status Posted/Matched, quantity > 0)
  const strictMatches = candidatePool.filter((d) => {
    const cityMatch = (d.city || '').trim().toLowerCase() === reqCityNorm;
    const catMatch = matchesCategory(req.foodPref, d.food_category, d.food);
    return cityMatch && catMatch;
  });

  if (strictMatches.length > 0) {
    const enriched = sortItems(strictMatches.map(enrichItem));
    return {
      level: 'exact',
      label: 'Exact match',
      badgeClass: 'match-exact',
      items: enriched,
      isSampleFallback: false
    };
  }

  // Level 2a: Same city, any food category
  const cityFlexibleMatches = candidatePool.filter((d) => {
    return (d.city || '').trim().toLowerCase() === reqCityNorm;
  });

  if (cityFlexibleMatches.length > 0) {
    const enriched = sortItems(cityFlexibleMatches.map(enrichItem));
    return {
      level: 'flexible',
      label: 'Category flexible match',
      badgeClass: 'match-flexible',
      items: enriched,
      isSampleFallback: false
    };
  }

  // Level 2b: Any city, same food category
  const clusterMatches = candidatePool.filter((d) => {
    return matchesCategory(req.foodPref, d.food_category, d.food);
  });

  if (clusterMatches.length > 0) {
    const enriched = sortItems(clusterMatches.map(enrichItem));
    return {
      level: 'cluster',
      label: 'Nearby cluster match',
      badgeClass: 'match-cluster',
      items: enriched,
      isSampleFallback: false
    };
  }

  // Level 2c: Any donation with status Posted or Matched regardless of city/category
  if (candidatePool.length > 0) {
    const enriched = sortItems(candidatePool.map(enrichItem));
    return {
      level: 'best',
      label: 'Best available match (expanding search)',
      badgeClass: 'match-best',
      items: enriched,
      isSampleFallback: false
    };
  }

  // If there are other donations in the entire table (even if different status)
  if (allDonations && allDonations.length > 0) {
    const enriched = sortItems(allDonations.map(enrichItem));
    return {
      level: 'best',
      label: 'Best available match (expanding search)',
      badgeClass: 'match-best',
      items: enriched,
      isSampleFallback: false
    };
  }

  // Level 3: Truly zero donations in the entire table -> Sample fallback card (unclaimable)
  const sampleCard = {
    id: 'sample-demo-card',
    food: '[Sample] 75 Fresh Meals — Dal Tadka & Jeera Rice',
    qty: req.meals || 75,
    donor_type: 'Central Community Kitchen',
    city: req.city || 'Jaipur',
    area: `${req.city || 'Jaipur'} Food Cluster (Sample Preview)`,
    safe_minutes: 240,
    food_category: 'cooked rice/dal',
    status: 'Posted',
    stage: 1,
    is_sample: true,
    _dist: 3.5,
    _timeLeft: 210
  };

  return {
    level: 'sample',
    label: 'Sample — for demo purposes',
    badgeClass: 'match-sample',
    items: [sampleCard],
    isSampleFallback: true
  };
}

function renderShelterMatchResults(matchData, req) {
  const container = document.getElementById('shelter-match-results-list');
  const countBadge = document.getElementById('shelter-results-count-badge');
  const criteriaDisplay = document.getElementById('shelter-criteria-display');

  if (criteriaDisplay) {
    criteriaDisplay.textContent = `${req.name} (${req.city}) • Needed: ${req.meals} Meals • Pref: ${req.foodPref}`;
  }

  if (countBadge) {
    if (matchData.isSampleFallback) {
      countBadge.style.background = '#FEF3C7';
      countBadge.style.color = '#92400E';
      countBadge.textContent = 'Demo Mode (Empty Table)';
    } else {
      countBadge.style.background = '#DEF7EC';
      countBadge.style.color = '#03543F';
      countBadge.textContent = `${matchData.items.length} Batch${matchData.items.length > 1 ? 'es' : ''} Found`;
    }
  }

  if (!container) return;

  const html = matchData.items.map((item) => {
    const isSample = Boolean(item.is_sample);
    const itemStatus = item.status || 'Posted';
    const statusClass = itemStatus === 'Posted' ? 'status-posted' : 'status-matched';
    const distText = item._dist !== null && item._dist !== undefined ? `${item._dist} km away` : 'Cluster proximity';
    const safeTimeText = `${item._timeLeft || 180}m window left`;

    return `
      <div class="match-result-card ${isSample ? 'is-sample' : ''}">
        <div class="match-card-header">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <h4 class="match-card-title">${item.food || 'Surplus Food Batch'}</h4>
            <span class="match-badge ${matchData.badgeClass}">${matchData.label}</span>
          </div>
          <span class="status-pill ${statusClass}">${itemStatus}</span>
        </div>
        
        <div class="match-card-meta">
          <span>📍 <strong>${item.city || 'City'}</strong> • ${item.area || 'Cluster'}</span>
          <span>⚡ <strong>${item.qty}</strong> meals available</span>
          <span>⏱️ <strong>${safeTimeText}</strong></span>
          <span>📏 <strong>${distText}</strong></span>
        </div>

        <div class="match-card-bottom">
          <div style="font-size:0.75rem;color:var(--text-muted);">
            ${isSample 
              ? '<span style="color:#B45309;font-weight:600;">⚠️ Sample card for preview. Claim button disabled until demo data is seeded.</span>'
              : `Batch #${(item.id || '').substring(0, 8).toUpperCase()} • Donor: ${item.donor_type || 'Commercial Kitchen'}`
            }
          </div>
          <div>
            ${isSample 
              ? `<button type="button" class="btn btn-secondary btn-sm" disabled title="Demo data" style="cursor:not-allowed;opacity:0.65;">
                   🔒 Demo data
                 </button>`
              : `<button type="button" class="btn btn-primary btn-sm" id="btn-claim-${item.id}" onclick="claimDonationForShelter('${item.id}')">
                   <span>Claim Food Batch &rarr;</span>
                 </button>`
            }
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

async function handleShelterRequestSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('req-shelter-name')?.value.trim() || 'Community Shelter';
  const type = document.getElementById('req-shelter-type')?.value || 'shelter';
  const city = document.getElementById('req-shelter-city')?.value || 'Jaipur';
  const meals = Number(document.getElementById('req-shelter-meals')?.value) || 80;
  const foodPref = document.getElementById('req-food-preference')?.value || 'Cooked Dinner';
  const phone = document.getElementById('req-contact-phone')?.value.trim() || '';
  const address = document.getElementById('req-shelter-address')?.value.trim() || '';
  const notes = document.getElementById('req-special-notes')?.value.trim() || '';

  lastShelterRequest = { name, type, city, meals, foodPref, phone, address, notes };

  const submitBtn = document.getElementById('btn-submit-shelter-req');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Matching with Food Ladder...</span>';
  }

  // Log requisition to Supabase audit_log
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

  // Run Progressive Match Algorithm
  const matchData = findDonationsForShelterRequest(lastShelterRequest);

  // Switch modal view to Results
  const formView = document.getElementById('shelter-req-form-view');
  const resultsView = document.getElementById('shelter-req-results-view');
  if (formView) formView.style.display = 'none';
  if (resultsView) resultsView.style.display = 'block';

  renderShelterMatchResults(matchData, lastShelterRequest);
  checkAdminPresence();

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Find Matching Surplus Food &rarr;</span>';
  }
}

async function claimDonationForShelter(donationId, shelterName) {
  if (typeof isAuthenticated === 'function' && !isAuthenticated()) {
    if (typeof pendingAuthAction !== 'undefined') {
      pendingAuthAction = { type: 'claim', donationId, shelterName };
    }
    if (typeof openSignInModal === 'function') {
      openSignInModal('signup', 'shelter', 'Account required: Please sign up with your email and password to claim surplus food batches.');
    }
    if (typeof showToast === 'function') {
      showToast('⚠️ Please sign up or log in with email & password to claim food.');
    }
    return;
  }

  const actualShelterName = (typeof authState !== 'undefined' && (authState?.user?.organization || authState?.user?.name)) || shelterName || lastShelterRequest?.name || 'Verified Shelter';
  const btn = document.getElementById(`btn-claim-${donationId}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Coordinating Dispatch...</span>';
  }

  const matchKey = `shelter-${actualShelterName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  // Update Supabase
  if (sbClient) {
    try {
      await sbClient
        .from('donations')
        .update({
          status: 'Matched',
          match_id: matchKey
        })
        .eq('id', donationId);

      await sbClient.from('audit_log').insert([{
        action: 'SHELTER_CLAIM_DONATION',
        target: donationId,
        details: { shelterName, claimed_at: new Date().toISOString() }
      }]);
    } catch (err) {
      console.warn('[Shelter Claim] Supabase error:', err.message);
    }
  }

  // Update local memory state
  const found = allDonations.find((d) => d.id === donationId);
  if (found) {
    found.status = 'Matched';
    found.match_id = matchKey;
    currentLiveDispatch = found;
  }

  if (btn) {
    btn.className = 'btn btn-secondary btn-sm';
    btn.disabled = true;
    btn.innerHTML = '<span>✅ Batch Claimed & Dispatched</span>';
  }

  // Register Shelter Claim into Orders Section
  const newShelterOrder = {
    id: 'ORD-' + (donationId ? donationId.replace('sk-', '').replace('demo-', '').substring(0, 5).toUpperCase() : Math.floor(1000 + Math.random() * 9000)),
    orderType: 'shelter',
    food: found?.food || 'Surplus Meal Batch',
    qty: found?.qty || lastShelterRequest?.meals || 80,
    category: found?.food_category || lastShelterRequest?.foodPref || 'Cooked Dinner',
    city: found?.city || lastShelterRequest?.city || 'Jaipur',
    donor: found?.area || found?.donor_type || 'Commercial Kitchen',
    recipient: actualShelterName,
    status: 'Matched',
    stage: 2,
    otp: found?.otp || Math.floor(1000 + Math.random() * 9000).toString(),
    timestamp: Date.now()
  };
  addOrderToRegistry(newShelterOrder);

  showToast(`🎉 Batch claimed by ${actualShelterName}! Order logged in Orders section.`);
  renderRealtimeTable();
  recalculateDashboardMetrics();
  renderMapData();
}

/**
 * Quick 1-click Demo Seeder for Admins
 * Inserts 5-6 realistic sample donations across Jaipur, Delhi NCR, and Bengaluru
 */
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
    if (sbClient) {
      const { data, error } = await sbClient.from('donations').insert(sampleBatches).select();
      if (!error && data) {
        allDonations = [...data, ...allDonations];
      } else {
        sampleBatches.forEach(b => {
          b.id = 'demo-' + Math.random().toString(36).substring(2, 9);
        });
        allDonations = [...sampleBatches, ...allDonations];
      }
    } else {
      sampleBatches.forEach(b => {
        b.id = 'demo-' + Math.random().toString(36).substring(2, 9);
      });
      allDonations = [...sampleBatches, ...allDonations];
    }

    if (allDonations.length > 0) {
      currentLiveDispatch = allDonations[0];
      renderDispatchCard(currentLiveDispatch);
    }
    renderRealtimeTable();
    recalculateDashboardMetrics();
    renderMapData();

    // Seed demo orders for both shelter and donor in Orders section
    addOrderToRegistry({
      id: 'ORD-DEMO1',
      orderType: 'shelter',
      food: '[Demo] 80 Meals — Rajma Chawal & Chapati',
      qty: 80,
      category: 'Cooked Dinner',
      city: 'Jaipur',
      donor: 'C-Scheme Dining Hall [Demo]',
      recipient: 'Apna Ghar Ashram',
      status: 'Matched',
      stage: 2,
      otp: '4419',
      timestamp: Date.now() - 5 * 60000
    });
    addOrderToRegistry({
      id: 'ORD-DEMO2',
      orderType: 'donor',
      food: '[Demo] 60 Meals — Chana Masala & Pulao',
      qty: 60,
      category: 'Cooked Lunch',
      city: 'Delhi NCR',
      donor: 'Connaught Place Central Hub [Demo]',
      recipient: 'Robin Hood Army Node 02',
      status: 'Matched',
      stage: 2,
      otp: '8910',
      timestamp: Date.now() - 15 * 60000
    });

    showToast('🌱 6 demo surplus food batches seeded across Jaipur, Delhi NCR, and Bengaluru!');

    // If shelter results view is open, live re-match immediately
    if (lastShelterRequest) {
      const matchData = findDonationsForShelterRequest(lastShelterRequest);
      renderShelterMatchResults(matchData, lastShelterRequest);
    }
  } catch (err) {
    console.error('[Demo Seed Error]:', err);
    showToast('Notice: Demo donations added locally.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml || '<span>🌱 Seed Demo Data (Admin)</span>';
    }
  }
}

/**
 * Checks if the currently logged in user has admin role and toggles admin demo buttons
 */
async function checkAdminPresence() {
  let isAdmin = false;
  try {
    const raw = localStorage.getItem('sahakara_admin_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u && (u.role === 'admin' || u.role === 'superadmin')) {
        isAdmin = true;
      }
    }
    if (!isAdmin && sbClient) {
      const { data } = await sbClient.auth.getSession();
      if (data?.session?.user) {
        const { data: prof } = await sbClient
          .from('profiles')
          .select('role')
          .eq('id', data.session.user.id)
          .maybeSingle();
        if (prof && (prof.role === 'admin' || prof.role === 'superadmin')) {
          isAdmin = true;
        }
      }
    }
  } catch (e) {
    console.debug('[Admin Check]', e);
  }

  const navBtn = document.getElementById('btn-seed-demo-nav');
  const shelterBtn = document.getElementById('btn-seed-demo-shelter');
  const resultsBtn = document.getElementById('btn-seed-demo-results');
  if (navBtn) navBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  if (shelterBtn) shelterBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  if (resultsBtn) resultsBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  return isAdmin;
}

window.openShelterRequestModal = openShelterRequestModal;
window.closeShelterRequestModal = closeShelterRequestModal;
window.handleShelterRequestSubmit = handleShelterRequestSubmit;
window.seedDemoDonationsQuick = seedDemoDonationsQuick;
window.backToShelterReqForm = backToShelterReqForm;
window.claimDonationForShelter = claimDonationForShelter;
window.checkAdminPresence = checkAdminPresence;
window.filterOrdersTab = filterOrdersTab;
window.renderOrdersSection = renderOrdersSection;
window.initOrders = initOrders;

/* ==========================================================================
   ACTIVE ORDERS & CLAIMS REGISTRY
   Two-way order visibility for Shelter Claims & Donor Dispatches
   ========================================================================== */
let activeOrders = [];
let currentOrderFilter = 'all';

const INITIAL_DEFAULT_ORDERS = [
  {
    id: 'ORD-8942',
    orderType: 'shelter',
    food: '80 Meals — Rajma Chawal & Chapati',
    qty: 80,
    category: 'Cooked Dinner',
    city: 'Jaipur',
    donor: 'C-Scheme Dining Hall [Demo]',
    recipient: 'Apna Ghar Ashram',
    status: 'Matched',
    stage: 2,
    otp: '4419',
    timestamp: Date.now() - 12 * 60000
  },
  {
    id: 'ORD-6120',
    orderType: 'donor',
    food: '45 Hot Meals — Dal Fry & Steamed Rice',
    qty: 45,
    category: 'Cooked Lunch',
    city: 'Jaipur',
    donor: 'Mansarovar Campus Canteen [Demo]',
    recipient: 'Ananda Seva Ashram',
    status: 'Matched',
    stage: 2,
    otp: '8912',
    timestamp: Date.now() - 25 * 60000
  }
];

function initOrders() {
  loadOrdersFromStorage();
  renderOrdersSection();
}

function loadOrdersFromStorage() {
  try {
    const raw = localStorage.getItem('sahakara_active_orders');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        activeOrders = parsed;
        return;
      }
    }
  } catch (e) {
    console.debug('[Orders] Storage load fallback', e);
  }
  activeOrders = [...INITIAL_DEFAULT_ORDERS];
}

function saveOrdersToStorage() {
  try {
    localStorage.setItem('sahakara_active_orders', JSON.stringify(activeOrders));
  } catch (e) {
    console.debug('[Orders] Storage save error', e);
  }
}

function addOrderToRegistry(order) {
  if (!activeOrders.some((o) => o.id === order.id)) {
    activeOrders.unshift(order);
  }
  saveOrdersToStorage();
  renderOrdersSection();

  // Pulse animation on the orders badge
  const navBadge = document.getElementById('nav-orders-count');
  if (navBadge) {
    navBadge.style.transition = 'transform 0.25s ease';
    navBadge.style.transform = 'scale(1.4)';
    setTimeout(() => {
      navBadge.style.transform = 'scale(1)';
    }, 400);
  }
}

function filterOrdersTab(filter, btn) {
  currentOrderFilter = filter;
  const tabs = document.querySelectorAll('.order-tab');
  tabs.forEach((t) => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
  }
  renderOrdersSection();
}

function getTimeAgoString(timestamp) {
  if (!timestamp) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
}

function renderOrdersSection() {
  const container = document.getElementById('orders-grid-container');
  const countAll = document.getElementById('orders-tab-count-all');
  const countShelter = document.getElementById('orders-tab-count-shelter');
  const countDonor = document.getElementById('orders-tab-count-donor');
  const navCount = document.getElementById('nav-orders-count');

  const shelterCount = activeOrders.filter((o) => o.orderType === 'shelter').length;
  const donorCount = activeOrders.filter((o) => o.orderType === 'donor').length;

  if (countAll) countAll.textContent = activeOrders.length;
  if (countShelter) countShelter.textContent = shelterCount;
  if (countDonor) countDonor.textContent = donorCount;
  if (navCount) navCount.textContent = activeOrders.length;

  if (!container) return;

  const filtered = activeOrders.filter((o) => {
    if (currentOrderFilter === 'shelter') return o.orderType === 'shelter';
    if (currentOrderFilter === 'donor') return o.orderType === 'donor';
    return true;
  });

  if (filtered.length === 0) {
    const emptyNotice = currentOrderFilter === 'shelter'
      ? 'No active shelter claims found yet. Request surplus food to see your claim tracked here.'
      : currentOrderFilter === 'donor'
      ? 'No active donor dispatches found yet. Post surplus food to see your donation tracked here.'
      : 'No active orders in the registry yet.';

    container.innerHTML = `
      <div class="orders-empty-state">
        <div style="font-size:2rem;margin-bottom:8px;">📦</div>
        <h4 style="font-size:1.125rem;color:var(--text-primary);margin-bottom:6px;">No Orders in This View</h4>
        <p style="font-size:0.875rem;max-width:420px;margin:0 auto 16px auto;">${emptyNotice}</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="openShelterRequestModal()">Request Food as Shelter</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="openPostModal('donor')">Post Surplus as Donor</button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((order, idx) => {
    const isShelter = order.orderType === 'shelter';
    const typeBadgeClass = isShelter ? 'order-badge-shelter' : 'order-badge-donor';
    const typeLabel = isShelter ? '🏠 Shelter Claim' : '🍛 Donor Dispatch';
    const timeAgo = getTimeAgoString(order.timestamp);
    const donorName = order.donor || 'Commercial Kitchen';
    const recipientName = order.recipient || 'Verified Shelter Node';
    const otpDisplay = order.otp || '4419';
    const isFirst = idx === 0;

    return `
      <div class="order-card ${isFirst ? 'highlight-new' : ''}" data-order-type="${order.orderType}">
        <div class="order-card-top">
          <div class="order-header-info">
            <span class="order-ref-pill">#${order.id}</span>
            <span class="order-badge ${typeBadgeClass}">${typeLabel}</span>
            <span class="status-pill status-matched">${order.status || 'Matched'}</span>
          </div>
          <span class="order-time-stamp">⏱️ ${timeAgo}</span>
        </div>

        <div class="order-card-body">
          <div class="order-food-info">
            <h3 class="order-food-title">${order.food || 'Surplus Meal Package'}</h3>
            <div class="order-tags">
              <span class="order-tag">⚡ ${order.qty || 50} Meals</span>
              <span class="order-tag">🍱 ${order.category || 'Cooked Meals'}</span>
              <span class="order-tag">📍 ${order.city || 'Jaipur Cluster'}</span>
            </div>
          </div>

          <div class="order-route-timeline">
            <div class="route-node">
              <span class="route-icon">🏪</span>
              <div class="route-node-content">
                <span class="route-role">Donor Kitchen</span>
                <strong class="route-name">${donorName}</strong>
              </div>
            </div>
            <div class="route-connector-line"></div>
            <div class="route-node">
              <span class="route-icon">🏠</span>
              <div class="route-node-content">
                <span class="route-role">Recipient Node</span>
                <strong class="route-name">${recipientName}</strong>
              </div>
            </div>
          </div>

          <div class="order-stepper" aria-label="Order Progress Stepper">
            <div class="step-item completed">
              <span class="step-dot"></span>
              <span class="step-label">Created</span>
            </div>
            <div class="step-item active">
              <span class="step-dot"></span>
              <span class="step-label">Matched</span>
            </div>
            <div class="step-item">
              <span class="step-dot"></span>
              <span class="step-label">EV Cargo</span>
            </div>
            <div class="step-item">
              <span class="step-dot"></span>
              <span class="step-label">Handover</span>
            </div>
          </div>
        </div>

        <div class="order-card-bottom">
          <div class="order-otp-box">
            <span class="otp-caption">Handover OTP</span>
            <span class="otp-number">${otpDisplay}</span>
          </div>
          <div class="order-actions-row" style="display:flex;gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="showModalNotice('Driver Telemetry: EV Cargo Dispatch #4419 • Insulated container 68°C • Safe window 195m remaining.')" style="font-size:0.75rem;padding:4px 8px;">
              <span>📍 Driver Info</span>
            </button>
            <button type="button" class="btn btn-primary btn-sm" onclick="showFssaiPass()" style="font-size:0.75rem;padding:4px 10px;">
              <span>Digital Pass</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
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
        <strong style="font-size:13px;color:#111827;">Amity Campus Central Mess</strong> <small style="font-size:10px;background:#F1F5F9;color:#475569;padding:1px 4px;border-radius:3px;font-weight:600;">Demo data</small><br>
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
        <strong style="font-size:13px;color:#111827;">Driver Vikram R. (EV-4419)</strong> <small style="font-size:10px;background:#FEF3C7;color:#92400E;padding:1px 4px;border-radius:3px;font-weight:600;">Simulated</small><br>
        <span style="color:#2563EB;font-weight:700;">ACTIVE EV CARRIER</span><br>
        <span>En route &bull; Temp: <strong>64°C (Sim)</strong> (Hot Bag)</span><br>
        <small style="color:#6B7280;">Speed: 32 km/h (Sim) &bull; Battery: 86% (Sim)</small>
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
          <strong style="color:#111827;font-size:13px;">${rec.name}</strong> <small style="font-size:10px;background:#F1F5F9;color:#475569;padding:1px 4px;border-radius:3px;font-weight:600;">Demo Node</small><br>
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
   9. AUTHENTICATION & ACCESS GATING (EMAIL & PASSWORD)
   ========================================================================== */
const AUTH_API_BASE = 'http://localhost:3001/api/auth';
let authState = {
  token: localStorage.getItem('sahakara_auth_token') || null,
  user: JSON.parse(localStorage.getItem('sahakara_auth_user') || 'null')
};
let pendingAuthAction = null;
let currentSignupData = {};
let currentLoginEmail = '';
let loginOtpTimer = null;
let signupOtpTimer = null;

function isAuthenticated() {
  return Boolean(authState && authState.user && authState.user.email);
}

function executePendingAuthAction(user) {
  if (!pendingAuthAction) return;
  const action = pendingAuthAction;
  pendingAuthAction = null;

  setTimeout(() => {
    if (action.type === 'donate') {
      openPostModal(action.personaRole || user?.role || 'donor');
    } else if (action.type === 'shelter_request') {
      openShelterRequestModal();
    } else if (action.type === 'claim') {
      claimDonationForShelter(action.donationId, user?.organization || user?.name || action.shelterName);
    }
  }, 350);
}

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
      <button type="button" class="btn btn-ghost" id="btn-nav-signin" onclick="openSignInModal('signin')">Sign in</button>
      <button type="button" class="btn btn-primary" onclick="openPostModal()">
        <span>Post surplus food</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    `;
  }
}

function openSignInModal(initialTab = 'signin', targetRole = null, customAlertMessage = null) {
  const modal = document.getElementById('modal-signin');
  if (!modal) return;
  modal.removeAttribute('hidden');
  modal.hidden = false;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  switchAuthTab(initialTab);

  if (targetRole) {
    const roleRadio = document.querySelector(`input[name="signup-role"][value="${targetRole}"]`);
    if (roleRadio) {
      const card = roleRadio.closest('.role-card');
      if (card) selectSignupRole(targetRole, card);
    }
  }

  if (customAlertMessage) {
    showAuthAlert('info', customAlertMessage);
  } else {
    hideAuthAlert();
  }
}

function closeSignInModal() {
  const modal = document.getElementById('modal-signin');
  if (!modal) return;
  modal.setAttribute('hidden', 'true');
  modal.hidden = true;
  modal.style.display = 'none';
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
  if (element) {
    element.classList.add('selected');
    const radio = element.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
  }
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

/**
 * Handle direct email & password sign up
 */
async function handleEmailPasswordSignup(e) {
  if (e && e.preventDefault) e.preventDefault();

  const role = document.querySelector('input[name="signup-role"]:checked')?.value || 'donor';
  const name = document.getElementById('signup-name')?.value.trim();
  const email = document.getElementById('signup-email')?.value.trim().toLowerCase();
  const password = document.getElementById('signup-password')?.value;
  const org = document.getElementById('signup-org')?.value.trim() || '';
  const zone = document.getElementById('signup-zone')?.value || 'Central';
  const phone = document.getElementById('signup-phone')?.value.trim() || '';
  const btn = document.getElementById('btn-send-signup-otp');

  if (!name || !email || !password) {
    showAuthAlert('error', 'Please fill in your Name, Email, and Password.');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showAuthAlert('error', 'Please enter a valid email address.');
    return;
  }

  if (password.length < 6) {
    showAuthAlert('error', 'Password must be at least 6 characters long.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Creating Account...</span>';
  }
  hideAuthAlert();

  let registeredUser = null;
  let authToken = null;

  // 1. Backend API signup
  try {
    const res = await fetch(`${AUTH_API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, role, organization: org, phone, zone })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.user) {
        registeredUser = data.user;
        authToken = data.token;
      }
    } else {
      const errData = await res.json().catch(() => null);
      if (errData && errData.error && errData.error.toLowerCase().includes('already exists')) {
        showAuthAlert('error', 'An account with this email already exists. Please switch to Sign In.');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>Sign Up &amp; Continue</span>';
        }
        return;
      }
    }
  } catch (backendErr) {
    console.warn('[Auth] Backend signup unreachable, proceeding with client storage:', backendErr.message);
  }

  // 2. Supabase Auth if backend was unavailable
  if (!registeredUser && sbClient?.auth) {
    try {
      const { data: sbData, error: sbError } = await sbClient.auth.signUp({
        email,
        password,
        options: {
          data: { name, role, organization: org, phone, zone }
        }
      });
      if (!sbError && sbData?.user) {
        registeredUser = {
          id: sbData.user.id,
          name,
          email,
          role,
          organization: org,
          phone,
          zone
        };
        authToken = sbData.session?.access_token || 'sb-token-' + Date.now();
      }
    } catch (sbErr) {
      console.warn('[Auth] Supabase signup error:', sbErr.message);
    }
  }

  // 3. Fallback / Client persistent local registry
  if (!registeredUser) {
    const localUsers = JSON.parse(localStorage.getItem('sahakara_registered_users') || '[]');
    const existing = localUsers.find((u) => u.email === email);
    if (existing && existing.password !== password) {
      showAuthAlert('error', 'An account with this email already exists. Please sign in.');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>Sign Up &amp; Continue</span>';
      }
      return;
    }

    registeredUser = {
      id: existing ? existing.id : 'usr_' + Math.random().toString(36).substring(2, 10),
      name,
      email,
      role,
      organization: org,
      phone,
      zone,
      created_at: new Date().toISOString()
    };
    authToken = 'jwt_' + Math.random().toString(36).substring(2) + Date.now();

    if (!existing) {
      localUsers.push({ ...registeredUser, password });
      localStorage.setItem('sahakara_registered_users', JSON.stringify(localUsers));
    }
  }

  // Save session
  setAuthSession(authToken || 'tok_' + Date.now(), registeredUser);
  closeSignInModal();
  showToast(`🎉 Welcome ${registeredUser.name}! Account created as ${role.toUpperCase()}.`);

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>Sign Up &amp; Continue</span>';
  }

  // Automatically execute pending action
  executePendingAuthAction(registeredUser);
}

/**
 * Handle email & password login
 */
async function handlePasswordLogin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const password = passwordInput ? passwordInput.value : '';
  const btn = document.getElementById('btn-submit-pwd-login');

  if (!email || !password) {
    showAuthAlert('error', 'Please enter your email and password.');
    return;
  }

  if (btn) btn.disabled = true;
  hideAuthAlert();

  let loggedInUser = null;
  let authToken = null;

  // 1. Backend API login
  try {
    const res = await fetch(`${AUTH_API_BASE}/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.user) {
        loggedInUser = data.user;
        authToken = data.token;
      }
    }
  } catch (err) {
    console.warn('[Auth] Backend login-password offline:', err.message);
  }

  // 2. Supabase Auth
  if (!loggedInUser && sbClient?.auth) {
    try {
      const { data: sbData, error: sbError } = await sbClient.auth.signInWithPassword({
        email,
        password
      });
      if (!sbError && sbData?.user) {
        const meta = sbData.user.user_metadata || {};
        loggedInUser = {
          id: sbData.user.id,
          name: meta.name || sbData.user.email.split('@')[0],
          email: sbData.user.email,
          role: meta.role || 'donor',
          organization: meta.organization || '',
          phone: meta.phone || '',
          zone: meta.zone || 'Central'
        };
        authToken = sbData.session?.access_token || 'sb-token-' + Date.now();
      }
    } catch (sbErr) {
      console.warn('[Auth] Supabase sign in error:', sbErr.message);
    }
  }

  // 3. Local Registered Users in localStorage
  if (!loggedInUser) {
    const localUsers = JSON.parse(localStorage.getItem('sahakara_registered_users') || '[]');
    const matched = localUsers.find((u) => u.email === email && u.password === password);
    if (matched) {
      const { password: _, ...userSafe } = matched;
      loggedInUser = userSafe;
      authToken = 'jwt_local_' + Math.random().toString(36).substring(2);
    }
  }

  // 4. Demo Accounts fallback
  if (!loggedInUser) {
    const demoAccounts = {
      'donor@sahakara.org': { name: 'Rajesh Sharma', role: 'donor', organization: 'Jaipur Marriott & Banquet' },
      'shelter@sahakara.org': { name: 'Anjali Sen', role: 'shelter', organization: 'Aasha Shelter Home' },
      'driver@sahakara.org': { name: 'Vikas Meena', role: 'driver', organization: 'Rescue Fleet Fleet-1' }
    };
    if (demoAccounts[email] && (password === 'Sahakara@123' || password.length >= 6)) {
      loggedInUser = {
        id: 'usr-demo-' + email.split('@')[0],
        email,
        ...demoAccounts[email],
        zone: 'Central'
      };
      authToken = 'demo-token-' + Date.now();
    }
  }

  if (loggedInUser) {
    setAuthSession(authToken, loggedInUser);
    closeSignInModal();
    showToast(`Welcome back, ${loggedInUser.name}!`);
    executePendingAuthAction(loggedInUser);
  } else {
    showAuthAlert('error', 'Invalid email or password. Please verify credentials or create an account.');
  }

  if (btn) btn.disabled = false;
}

async function quickLoginPersona(role) {
  const creds = {
    donor: { email: 'donor@sahakara.org', password: 'Sahakara@123', name: 'Rajesh Sharma', role: 'donor', organization: 'Jaipur Marriott & Banquet' },
    shelter: { email: 'shelter@sahakara.org', password: 'Sahakara@123', name: 'Anjali Sen', role: 'shelter', organization: 'Aasha Shelter Home' },
    driver: { email: 'driver@sahakara.org', password: 'Sahakara@123', name: 'Vikas Meena', role: 'driver', organization: 'Rescue Fleet Fleet-1' }
  };

  const cred = creds[role];
  if (!cred) return;

  let loggedInUser = null;
  let authToken = null;

  try {
    const res = await fetch(`${AUTH_API_BASE}/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cred.email, password: cred.password })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.user) {
        loggedInUser = data.user;
        authToken = data.token;
      }
    }
  } catch (e) {
    console.warn('[Auth] Quick login using offline fallback:', e.message);
  }

  if (!loggedInUser) {
    loggedInUser = {
      id: 'usr-demo-' + role,
      name: cred.name,
      email: cred.email,
      role: cred.role,
      organization: cred.organization,
      zone: 'Central'
    };
    authToken = 'demo-token-' + Date.now();
  }

  setAuthSession(authToken, loggedInUser);
  closeSignInModal();
  showToast(`⚡ Signed in as ${loggedInUser.name} (${loggedInUser.role.toUpperCase()})`);
  executePendingAuthAction(loggedInUser);
}

async function requestLoginOtp(isResend = false) {
  const emailInput = document.getElementById('login-otp-email');
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  if (!email) {
    showAuthAlert('error', 'Please enter your registered email address.');
    return;
  }
  hideAuthAlert();
  currentLoginEmail = email;

  try {
    const res = await fetch(`${AUTH_API_BASE}/login-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      const step1 = document.getElementById('login-otp-step-1');
      if (step1) step1.style.display = 'none';
      const step2 = document.getElementById('login-otp-step-2');
      if (step2) {
        step2.hidden = false;
        step2.style.display = 'block';
      }
      const displayEl = document.getElementById('login-target-email-display');
      if (displayEl) displayEl.textContent = email;
      showAuthAlert('success', `Verification code sent to ${email}`, data.devOtp);
      return;
    }
  } catch (e) {}

  // Fallback demo OTP
  const demoOtp = '123456';
  const step1 = document.getElementById('login-otp-step-1');
  if (step1) step1.style.display = 'none';
  const step2 = document.getElementById('login-otp-step-2');
  if (step2) {
    step2.hidden = false;
    step2.style.display = 'block';
  }
  const displayEl = document.getElementById('login-target-email-display');
  if (displayEl) displayEl.textContent = email;
  showAuthAlert('info', `Simulated login code generated. Fill ${demoOtp} below.`, demoOtp);
}

function resetLoginOtpFlow() {
  const step1 = document.getElementById('login-otp-step-1');
  const step2 = document.getElementById('login-otp-step-2');
  if (step1) step1.style.display = 'block';
  if (step2) {
    step2.hidden = true;
    step2.style.display = 'none';
  }
  hideAuthAlert();
}

async function submitLoginOtp() {
  const otp = getOtpCodeFromBoxes('login-otp-inputs');
  if (!otp || otp.length < 6) {
    showAuthAlert('error', 'Please enter the 6-digit verification code.');
    return;
  }
  hideAuthAlert();

  const user = {
    id: 'usr_' + Math.random().toString(36).substring(2, 9),
    name: currentLoginEmail.split('@')[0],
    email: currentLoginEmail,
    role: 'donor',
    organization: 'Partner Organization',
    zone: 'Central'
  };
  setAuthSession('otp_token_' + Date.now(), user);
  closeSignInModal();
  showToast(`Welcome, ${user.name}!`);
  executePendingAuthAction(user);
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

function dismissPrototypeToast() {
  const toast = document.getElementById('prototype-notice-toast');
  if (toast) {
    toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 15px)';
    setTimeout(() => {
      if (toast && toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 260);
  }
}

// Global Window Exports for Inline HTML Event Handlers
window.isAuthenticated = isAuthenticated;
window.executePendingAuthAction = executePendingAuthAction;
window.openSignInModal = openSignInModal;
window.closeSignInModal = closeSignInModal;
window.switchAuthTab = switchAuthTab;
window.toggleLoginMethod = toggleLoginMethod;
window.selectSignupRole = selectSignupRole;
window.handleEmailPasswordSignup = handleEmailPasswordSignup;
window.handlePasswordLogin = handlePasswordLogin;
window.quickLoginPersona = quickLoginPersona;
window.requestLoginOtp = requestLoginOtp;
window.resetLoginOtpFlow = resetLoginOtpFlow;
window.submitLoginOtp = submitLoginOtp;
window.logout = logout;
window.showToast = showToast;
window.openNoticeModal = openNoticeModal;
window.closeNoticeModal = closeNoticeModal;
window.openFssaiPassModal = openFssaiPassModal;
window.closeFssaiPassModal = closeFssaiPassModal;
window.dismissPrototypeToast = dismissPrototypeToast;
window.openPostModal = openPostModal;
window.closePostModal = closePostModal;
window.handlePostSubmit = handlePostSubmit;
window.getPendingAuthAction = () => pendingAuthAction;
window.setAuthSession = setAuthSession;




