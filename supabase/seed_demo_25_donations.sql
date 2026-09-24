-- ==============================================================================
-- SAHAKARA — Realistic 25 Sample Donations Seed Script (Demo Data)
-- Cities: Jaipur (Pilot), Delhi NCR, Bengaluru, Mumbai
-- Statuses: Mostly Delivered, some Picked up, Matched, and Posted
-- ==============================================================================

-- Optional: Clean previous demo seed records if re-running
DELETE FROM public.donations WHERE food LIKE '[Demo Data]%';

INSERT INTO public.donations (
  id, food, qty, donor_type, city, area, lat, lon, safe_minutes, food_category, created_at, status, match_id, stage, source, otp
) VALUES
-- 1. Jaipur - Delivered (14 days ago)
(
  'd0000001-0000-0000-0000-000000000001',
  '[Demo Data] 65 Meals — Rajma Chawal & Tawa Roti',
  65,
  'Mess',
  'Jaipur',
  'Amity Campus Hostel Mess, Kant Kalwar [Demo]',
  27.1732, 75.9545,
  240,
  'cooked rice/dal',
  now() - interval '13 days 6 hours',
  'Delivered',
  'rec-ananda',
  1,
  'Web',
  '3142'
),

-- 2. Jaipur - Delivered (12 days ago)
(
  'd0000002-0000-0000-0000-000000000002',
  '[Demo Data] 120 Meals — Khichdi, Kadhi & Roasted Papad',
  120,
  'Restaurant',
  'Jaipur',
  'C-Scheme Heritage Diner [Demo]',
  26.9124, 75.8042,
  240,
  'cooked rice/dal',
  now() - interval '12 days 4 hours',
  'Delivered',
  'rec-apna-ghar',
  1,
  'Helpline',
  '8492'
),

-- 3. Delhi NCR - Delivered (11 days ago)
(
  'd0000003-0000-0000-0000-000000000003',
  '[Demo Data] 180 Portions — Wedding Feast Pulao, Paneer & Roti',
  180,
  'Wedding',
  'Delhi NCR',
  'Chattarpur Farms Banquet Hub [Demo]',
  28.4982, 77.1812,
  240,
  'cooked rice/dal',
  now() - interval '11 days 2 hours',
  'Delivered',
  'rec-delhi-shelter',
  1,
  'Web',
  '5521'
),

-- 4. Jaipur - Delivered (10 days ago)
(
  'd0000004-0000-0000-0000-000000000004',
  '[Demo Data] 85 kg — Mixed Fresh Vegetables (Tomato, Cabbage, Gourds)',
  85,
  'Market',
  'Jaipur',
  'Muhana Mandi Wholesale Block B [Demo]',
  26.8150, 75.7420,
  1440,
  'fresh produce',
  now() - interval '10 days 5 hours',
  'Delivered',
  'rec-gaushala-govind',
  3,
  'SMS',
  '7319'
),

-- 5. Bengaluru - Delivered (9 days ago)
(
  'd0000005-0000-0000-0000-000000000005',
  '[Demo Data] 140 Meals — Lemon Rice, Curd Rice & Poriyal',
  140,
  'Mess',
  'Bengaluru',
  'Electronic City Tech Campus Cafeteria [Demo]',
  12.8452, 77.6602,
  240,
  'cooked rice/dal',
  now() - interval '9 days 3 hours',
  'Delivered',
  'rec-blr-shelter',
  1,
  'Web',
  '9014'
),

-- 6. Jaipur - Delivered (8 days ago)
(
  'd0000006-0000-0000-0000-000000000006',
  '[Demo Data] 40 Boxes — Whole Wheat Bread & Pav',
  40,
  'Restaurant',
  'Jaipur',
  'Bani Park Artisan Bakery [Demo]',
  26.9280, 75.7950,
  720,
  'bakery',
  now() - interval '8 days 7 hours',
  'Delivered',
  'rec-prerna',
  1,
  'Web',
  '4201'
),

-- 7. Delhi NCR - Delivered (7 days ago)
(
  'd0000007-0000-0000-0000-000000000007',
  '[Demo Data] 120 kg — Surplus Farm Greens & Spinach',
  120,
  'Market',
  'Delhi NCR',
  'Azadpur Mandi Shed 4 [Demo]',
  28.7150, 77.1720,
  1440,
  'fresh produce',
  now() - interval '7 days 8 hours',
  'Delivered',
  'rec-delhi-gaushala',
  3,
  'Helpline',
  '6612'
),

-- 8. Jaipur - Delivered (6 days ago)
(
  'd0000008-0000-0000-0000-000000000008',
  '[Demo Data] 160 Portions — Corporate Canteen Lunch Buffet',
  160,
  'Mess',
  'Jaipur',
  'Sitapura Industrial Area Canteen [Demo]',
  26.7820, 75.8340,
  240,
  'cooked rice/dal',
  now() - interval '6 days 4 hours',
  'Delivered',
  'rec-akshaya-patra',
  1,
  'Web',
  '1847'
),

-- 9. Mumbai - Delivered (5 days ago)
(
  'd0000009-0000-0000-0000-000000000009',
  '[Demo Data] 90 Meals — Dal Makhani, Steamed Rice & Roti',
  90,
  'Restaurant',
  'Mumbai',
  'Bandra Kurla Complex Canteen [Demo]',
  19.0657, 72.8688,
  240,
  'cooked rice/dal',
  now() - interval '5 days 6 hours',
  'Delivered',
  'rec-ananda',
  1,
  'Web',
  '7741'
),

-- 10. Jaipur - Delivered (5 days ago)
(
  'd0000010-0000-0000-0000-000000010010',
  '[Demo Data] 50 Boxes — Samosas & Kachoris',
  50,
  'Restaurant',
  'Jaipur',
  'MI Road Confectionery [Demo]',
  26.9180, 75.8120,
  480,
  'dry snacks',
  now() - interval '4 days 9 hours',
  'Delivered',
  'rec-apna-ghar',
  1,
  'SMS',
  '2940'
),

-- 11. Bengaluru - Delivered (4 days ago)
(
  'd0000011-0000-0000-0000-000000010011',
  '[Demo Data] 80 Meals — Sambhar Rice & Poriyal',
  80,
  'Restaurant',
  'Bengaluru',
  'Indiranagar South Indian Kitchen [Demo]',
  12.9784, 77.6408,
  240,
  'cooked rice/dal',
  now() - interval '4 days 2 hours',
  'Delivered',
  'rec-blr-shelter',
  1,
  'Web',
  '5183'
),

-- 12. Jaipur - Delivered (3 days ago)
(
  'd0000012-0000-0000-0000-000000010012',
  '[Demo Data] 45 Meals — Dal Fry, Jeera Rice & Subzi',
  45,
  'Mess',
  'Jaipur',
  'Malviya Nagar Student Mess [Demo]',
  26.8540, 75.8180,
  240,
  'cooked rice/dal',
  now() - interval '3 days 5 hours',
  'Delivered',
  'rec-prerna',
  1,
  'Web',
  '6205'
),

-- 13. Delhi NCR - Delivered (3 days ago)
(
  'd0000013-0000-0000-0000-000000010013',
  '[Demo Data] 70 kg — Uncut Seasonal Fruits (Papaya, Banana, Melons)',
  70,
  'Market',
  'Delhi NCR',
  'Ghazipur Mandi Block C [Demo]',
  28.6250, 77.3290,
  1440,
  'fresh produce',
  now() - interval '2 days 18 hours',
  'Delivered',
  'rec-delhi-shelter',
  1,
  'SMS',
  '8371'
),

-- 14. Jaipur - Delivered (2 days ago)
(
  'd0000014-0000-0000-0000-000000010014',
  '[Demo Data] 95 Meals — Chole Kulche & Mixed Veg',
  95,
  'Wedding',
  'Jaipur',
  'Mansarovar Community Center [Demo]',
  26.8680, 75.7620,
  240,
  'cooked rice/dal',
  now() - interval '2 days 6 hours',
  'Delivered',
  'rec-ananda',
  1,
  'Helpline',
  '1948'
),

-- 15. Bengaluru - Delivered (Yesterday)
(
  'd0000015-0000-0000-0000-000000010015',
  '[Demo Data] 60 Portions — Poha & Upma Breakfast Packs',
  60,
  'Mess',
  'Bengaluru',
  'Whitefield Tech Park Canteen [Demo]',
  12.9698, 77.7499,
  360,
  'dry snacks',
  now() - interval '1 day 8 hours',
  'Delivered',
  'rec-blr-shelter',
  1,
  'Web',
  '3492'
),

-- 16. Mumbai - Delivered (Yesterday)
(
  'd0000016-0000-0000-0000-000000010016',
  '[Demo Data] 110 Meals — Veg Biryani & Salan',
  110,
  'Wedding',
  'Mumbai',
  'Andheri West Celebration Hall [Demo]',
  19.1363, 72.8277,
  240,
  'cooked rice/dal',
  now() - interval '1 day 3 hours',
  'Delivered',
  'rec-ananda',
  1,
  'Web',
  '5632'
),

-- 17. Jaipur - Delivered (Earlier Today)
(
  'd0000017-0000-0000-0000-000000010017',
  '[Demo Data] 75 Meals — Veg Pulao & Cucumber Raita',
  75,
  'Restaurant',
  'Jaipur',
  'Vaishali Nagar Multi-Cuisine [Demo]',
  26.9060, 75.7480,
  240,
  'cooked rice/dal',
  now() - interval '8 hours',
  'Delivered',
  'rec-apna-ghar',
  1,
  'Web',
  '4829'
),

-- 18. Jaipur - Delivered (2 hours ago)
(
  'd0000018-0000-0000-0000-000000010018',
  '[Demo Data] 35 Meals — Moong Dal Khichdi',
  35,
  'Mess',
  'Jaipur',
  'Jagatpura Coaching Hostel [Demo]',
  26.8290, 75.8450,
  240,
  'cooked rice/dal',
  now() - interval '2 hours 15 minutes',
  'Delivered',
  'rec-akshaya-patra',
  1,
  'Helpline',
  '9120'
),

-- 19. Jaipur - Picked up (Active Transit)
(
  'd0000019-0000-0000-0000-000000010019',
  '[Demo Data] 50 Meals — Hot Dal & Rice',
  50,
  'Mess',
  'Jaipur',
  'Amity University Campus Mess, NH-11C [Demo]',
  27.1729, 75.9542,
  240,
  'cooked rice/dal',
  now() - interval '35 minutes',
  'Picked up',
  'rec-ananda',
  1,
  'Web',
  '4419'
),

-- 20. Delhi NCR - Picked up (Active Transit)
(
  'd0000020-0000-0000-0000-000000010020',
  '[Demo Data] 80 Meals — Chana Masala & Jeera Rice',
  80,
  'Restaurant',
  'Delhi NCR',
  'Connaught Place Corporate Canteen [Demo]',
  28.6315, 77.2167,
  240,
  'cooked rice/dal',
  now() - interval '50 minutes',
  'Picked up',
  'rec-delhi-shelter',
  1,
  'Web',
  '7823'
),

-- 21. Bengaluru - Picked up (Active Transit)
(
  'd0000021-0000-0000-0000-000000010021',
  '[Demo Data] 30 Packs — Sandwiches & Patties',
  30,
  'Restaurant',
  'Bengaluru',
  'Koramangala Bakery Cafe [Demo]',
  12.9352, 77.6245,
  360,
  'dry snacks',
  now() - interval '45 minutes',
  'Picked up',
  'rec-blr-shelter',
  1,
  'SMS',
  '6194'
),

-- 22. Jaipur - Matched (Awaiting Driver Arrival)
(
  'd0000022-0000-0000-0000-000000010022',
  '[Demo Data] 40 Meals — Yellow Dal & Phulka Roti',
  40,
  'Restaurant',
  'Jaipur',
  'Tonk Road Dhaba & Kitchen [Demo]',
  26.8720, 75.7980,
  240,
  'cooked rice/dal',
  now() - interval '20 minutes',
  'Matched',
  'rec-apna-ghar',
  1,
  'Web',
  '2301'
),

-- 23. Delhi NCR - Matched (Awaiting Driver Arrival)
(
  'd0000023-0000-0000-0000-000000010023',
  '[Demo Data] 25 Packs — Multigrain Bread Loaves',
  25,
  'Restaurant',
  'Delhi NCR',
  'Hauz Khas Bakery Studio [Demo]',
  28.5494, 77.2001,
  720,
  'bakery',
  now() - interval '28 minutes',
  'Matched',
  'rec-delhi-shelter',
  1,
  'Web',
  '9412'
),

-- 24. Jaipur - Posted (Newly Broadcast)
(
  'd0000024-0000-0000-0000-000000010024',
  '[Demo Data] 30 Portions — Freshly Baked Dinner Rolls',
  30,
  'Restaurant',
  'Jaipur',
  'Raja Park Bakery Hub [Demo]',
  26.8920, 75.8280,
  720,
  'bakery',
  now() - interval '12 minutes',
  'Posted',
  NULL,
  1,
  'Web',
  '1094'
),

-- 25. Jaipur - Posted (Newly Broadcast)
(
  'd0000025-0000-0000-0000-000000010025',
  '[Demo Data] 55 Meals — Mixed Veg Subzi & Rice',
  55,
  'Mess',
  'Jaipur',
  'Pratap Nagar University Hostel [Demo]',
  26.8040, 75.8190,
  240,
  'cooked rice/dal',
  now() - interval '8 minutes',
  'Posted',
  NULL,
  1,
  'SMS',
  '8734'
)
ON CONFLICT (id) DO UPDATE SET
  food = EXCLUDED.food,
  qty = EXCLUDED.qty,
  status = EXCLUDED.status,
  match_id = EXCLUDED.match_id,
  created_at = EXCLUDED.created_at;
