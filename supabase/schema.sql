-- ==============================================================================
-- SAHAKARA — National Food Rescue Platform Schema
-- Database: Supabase PostgreSQL + Row Level Security (RLS) + Realtime
-- ==============================================================================

-- 1. CITIES TABLE
CREATE TABLE IF NOT EXISTS public.cities (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL CHECK (status IN ('Live', 'Coming soon')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. PROFILES TABLE (Linked with Supabase Auth Users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY,
  email      TEXT,
  role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'driver', 'shelter', 'donor')),
  name       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. RECIPIENTS TABLE (Shelters, Gaushalas, Bio-Compost Hubs)
CREATE TABLE IF NOT EXISTS public.recipients (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('shelter', 'gaushala', 'compost')),
  city       TEXT NOT NULL DEFAULT 'Jaipur',
  lat        DOUBLE PRECISION NOT NULL,
  lon        DOUBLE PRECISION NOT NULL,
  capacity   NUMERIC NOT NULL,
  needs_note TEXT,
  verified   BOOLEAN NOT NULL DEFAULT true,
  status     TEXT NOT NULL DEFAULT 'Approved' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration safety for existing recipients tables
ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT 'Jaipur';
ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Approved';
ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS needs_note TEXT;
ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS capacity NUMERIC DEFAULT 100;
ALTER TABLE public.recipients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 4. DONATIONS TABLE (Surplus Food Postings & Rescue Dispatches)
CREATE TABLE IF NOT EXISTS public.donations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food          TEXT NOT NULL,
  qty           NUMERIC NOT NULL,
  donor_type    TEXT NOT NULL CHECK (donor_type IN ('Restaurant', 'Mess', 'Market', 'Wedding')),
  city          TEXT NOT NULL,
  area          TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lon           DOUBLE PRECISION NOT NULL,
  safe_minutes  INTEGER NOT NULL DEFAULT 240,
  food_category TEXT NOT NULL DEFAULT 'cooked rice/dal',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'Posted' CHECK (status IN ('Posted', 'Matched', 'Picked up', 'Delivered', 'Expired')),
  match_id      TEXT REFERENCES public.recipients(id) ON DELETE SET NULL,
  stage         INTEGER NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 4),
  source        TEXT NOT NULL DEFAULT 'Web' CHECK (source IN ('Web', 'Helpline', 'SMS')),
  otp           TEXT NOT NULL
);

-- Migration safety for existing donations tables
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS safe_minutes INTEGER DEFAULT 240;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS food_category TEXT DEFAULT 'cooked rice/dal';
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS stage INTEGER DEFAULT 1;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'Web';
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS otp TEXT DEFAULT '1234';

-- 5. AUDIT LOG TABLE (Admin Tracking & Action Telemetry)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID,
  admin_email TEXT,
  action      TEXT NOT NULL,
  target      TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- HELPER FUNCTIONS FOR SECURITY & AUTH
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-sync auth.users to public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'user'),
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 1. CITIES POLICIES
DROP POLICY IF EXISTS "Public read cities" ON public.cities;
DROP POLICY IF EXISTS "Admin write cities" ON public.cities;
CREATE POLICY "Public read cities" ON public.cities FOR SELECT USING (true);
CREATE POLICY "Admin write cities" ON public.cities FOR ALL USING (public.is_admin() OR auth.role() = 'service_role');

-- 2. PROFILES POLICIES
DROP POLICY IF EXISTS "Read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Write profiles" ON public.profiles;
CREATE POLICY "Read profiles" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin() OR auth.role() = 'service_role');
CREATE POLICY "Write profiles" ON public.profiles FOR ALL USING (auth.uid() = id OR public.is_admin() OR auth.role() = 'service_role');

-- 3. RECIPIENTS POLICIES
DROP POLICY IF EXISTS "Public read recipients" ON public.recipients;
DROP POLICY IF EXISTS "Public insert recipients" ON public.recipients;
DROP POLICY IF EXISTS "Admin modify recipients" ON public.recipients;
DROP POLICY IF EXISTS "Admin update recipients" ON public.recipients;
DROP POLICY IF EXISTS "Admin delete recipients" ON public.recipients;
CREATE POLICY "Public read recipients" ON public.recipients FOR SELECT USING (true);
CREATE POLICY "Public insert recipients" ON public.recipients FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin update recipients" ON public.recipients FOR UPDATE USING (public.is_admin() OR auth.role() = 'service_role') WITH CHECK (public.is_admin() OR auth.role() = 'service_role');
CREATE POLICY "Admin delete recipients" ON public.recipients FOR DELETE USING (public.is_admin() OR auth.role() = 'service_role');

-- 4. DONATIONS POLICIES
DROP POLICY IF EXISTS "Public read donations" ON public.donations;
DROP POLICY IF EXISTS "Public write donations" ON public.donations;
CREATE POLICY "Public read donations" ON public.donations FOR SELECT USING (true);
CREATE POLICY "Public write donations" ON public.donations FOR ALL USING (true) WITH CHECK (true);

-- 5. AUDIT LOG POLICIES
DROP POLICY IF EXISTS "Public read audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Public write audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Admin read audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Admin insert audit_log" ON public.audit_log;
CREATE POLICY "Admin read audit_log" ON public.audit_log FOR SELECT USING (public.is_admin() OR auth.role() = 'service_role');
CREATE POLICY "Admin insert audit_log" ON public.audit_log FOR INSERT WITH CHECK (public.is_admin() OR auth.role() = 'service_role' OR auth.uid() IS NOT NULL);

-- ==============================================================================
-- REALTIME PUBLICATIONS (IDEMPOTENT)
-- ==============================================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.donations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.recipients;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cities;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ==============================================================================
-- SEED DATA
-- ==============================================================================

-- 1. SEED CITIES (5 Indian Metro Clusters)
INSERT INTO public.cities (id, name, status)
VALUES
  ('city-jaipur', 'Jaipur', 'Live'),
  ('city-delhi', 'Delhi NCR', 'Live'),
  ('city-blr', 'Bengaluru', 'Live'),
  ('city-mumbai', 'Mumbai', 'Coming soon'),
  ('city-hyd', 'Hyderabad', 'Coming soon')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status;

-- 2. SEED RECIPIENTS (12 Nodes across Shelters, Gaushalas, Compost Facilities)
INSERT INTO public.recipients (id, name, type, city, lat, lon, capacity, needs_note, verified, status)
VALUES
  ('rec-ananda', 'Ananda Seva Ashram (Node 04)', 'shelter', 'Jaipur', 26.9248, 75.8267, 150, 'Accepts hot vegetarian meals and roti packs', true, 'Approved'),
  ('rec-akshaya-patra', 'Akshaya Patra Foundation Jaipur', 'shelter', 'Jaipur', 26.8202, 75.8647, 1500, 'Central mega-kitchen with cold/hot bulk storage', true, 'Approved'),
  ('rec-apna-ghar', 'Apna Ghar Vridhashram & Child Care', 'shelter', 'Jaipur', 26.8856, 75.7654, 100, 'Elderly and child care requiring soft cooked food', true, 'Approved'),
  ('rec-prerna', 'Prerna Balika Ashram', 'shelter', 'Jaipur', 26.9654, 75.7723, 90, 'Residential home for girls, dinner intake before 22:00', true, 'Approved'),
  ('rec-gaushala-govind', 'Shree Govind Dev Ji Gaushala Trust', 'gaushala', 'Jaipur', 26.9298, 75.8242, 600, 'Accepts fresh raw greens, unused grain, and vegetable peels', true, 'Approved'),
  ('rec-gaushala-pratap', 'Pratap Nagar Kamdhenu Gaushala', 'gaushala', 'Jaipur', 26.8012, 75.8219, 450, 'Registered cattle welfare shelter with organic composting', true, 'Approved'),
  ('rec-compost-durgapura', 'Durgapura Municipal Bio-Compost Hub', 'compost', 'Jaipur', 26.8524, 75.7891, 2000, 'Aerobic decomposition and soil enrichment facility', true, 'Approved'),
  ('rec-compost-jmc', 'JMC Central Biomethanation Facility', 'compost', 'Jaipur', 26.9420, 75.7980, 3500, 'High-capacity methane capture and organic bio-fertilizer unit', true, 'Approved'),
  ('rec-delhi-shelter', 'Robin Hood Army Delhi Distribution Center', 'shelter', 'Delhi NCR', 28.6139, 77.2090, 500, 'Active volunteer network serving slum clusters', true, 'Approved'),
  ('rec-delhi-gaushala', 'Delhi Kanha Gaushala Trust', 'gaushala', 'Delhi NCR', 28.5355, 77.3910, 800, 'Cattle care sanctuary accepting vegetable batches', true, 'Approved'),
  ('rec-delhi-compost', 'Okhla Waste-to-Energy & Bio-Compost', 'compost', 'Delhi NCR', 28.5300, 77.2800, 5000, 'Municipal green waste processing node', true, 'Approved'),
  ('rec-blr-shelter', 'Bangalore Food Rescue Shelter', 'shelter', 'Bengaluru', 12.9716, 77.5946, 300, 'Daily community kitchen for daily-wage workers', true, 'Approved')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  city = EXCLUDED.city,
  lat = EXCLUDED.lat,
  lon = EXCLUDED.lon,
  capacity = EXCLUDED.capacity,
  needs_note = EXCLUDED.needs_note,
  verified = EXCLUDED.verified,
  status = EXCLUDED.status;

-- 3. SEED DONATIONS
INSERT INTO public.donations (
  id, food, qty, donor_type, city, area, lat, lon, safe_minutes, food_category, created_at, status, match_id, stage, source, otp
)
VALUES
  (
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    '40 Hot Dinner Meals (Rice, Dal Makhani & Roti)',
    40,
    'Mess',
    'Jaipur',
    'Amity University Campus Mess, Kant Kalwar',
    27.1729,
    75.9542,
    240,
    'cooked rice/dal',
    now() - interval '25 minutes',
    'Picked up',
    'rec-ananda',
    1,
    'Web',
    '4419'
  ),
  (
    'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
    '120 Mixed Wedding Feast Packets',
    120,
    'Wedding',
    'Jaipur',
    'Royal Orchid Banquet, Tonk Road',
    26.8500,
    75.8000,
    240,
    'cooked rice/dal',
    now() - interval '180 minutes',
    'Delivered',
    'rec-akshaya-patra',
    1,
    'Web',
    '8192'
  ),
  (
    'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
    '30 Portions Bakery Bread & Rusks',
    30,
    'Restaurant',
    'Jaipur',
    'C-Scheme Bakery Hub',
    26.9100,
    75.8050,
    1440,
    'dry snacks',
    now() - interval '40 minutes',
    'Matched',
    'rec-apna-ghar',
    1,
    'Helpline',
    '2301'
  )
ON CONFLICT (id) DO NOTHING;
