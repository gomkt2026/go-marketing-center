-- Threads 發文時段可選更多主題
ALTER TABLE brand_posting_slots DROP CONSTRAINT IF EXISTS brand_posting_slots_kind_check;
ALTER TABLE brand_posting_slots
  ADD CONSTRAINT brand_posting_slots_kind_check CHECK (slot_kind IN (
    'daily_theme', 'threads_hourly', 'threads_offtopic',
    'threads_love', 'threads_weather', 'threads_entertainment',
    'threads_sports', 'threads_emotion',
    'threads_workplace', 'threads_qa', 'threads_image'
  ));
