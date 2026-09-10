-- Intelexa Database Schema for SimpleNow.ai

CREATE TABLE IF NOT EXISTS public.intelexa_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT NOT NULL,
  whatsapp_number TEXT,
  job_title TEXT,
  company TEXT,
  industry TEXT,
  business_interests TEXT,
  products_services TEXT,
  target_customers TEXT,
  geography TEXT,
  professional_objectives TEXT,
  what_matters_to_me TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.intelexa_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT NOT NULL,
  whatsapp_number TEXT,
  delivery_email BOOLEAN DEFAULT true,
  delivery_whatsapp BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.intelexa_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'Other',
  objectives TEXT[] DEFAULT '{}',
  watch_for TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  location TEXT,
  recording_status TEXT DEFAULT 'idle',
  processing_status TEXT DEFAULT 'idle',
  processing_step TEXT,
  error_message TEXT,
  is_demo BOOLEAN DEFAULT false,
  recipients JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.intelexa_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.intelexa_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_text TEXT DEFAULT '',
  segments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.intelexa_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.intelexa_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entities JSONB DEFAULT '{}'::jsonb,
  live_signals JSONB DEFAULT '[]'::jsonb,
  insights JSONB DEFAULT '[]'::jsonb,
  people JSONB DEFAULT '[]'::jsonb,
  companies JSONB DEFAULT '[]'::jsonb,
  opportunities JSONB DEFAULT '[]'::jsonb,
  competitive_intelligence JSONB DEFAULT '{}'::jsonb,
  market_intelligence JSONB DEFAULT '{}'::jsonb,
  action_plan JSONB DEFAULT '{}'::jsonb,
  top_3_recommendations JSONB DEFAULT '[]'::jsonb,
  scorecard JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.intelexa_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.intelexa_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  executive_brief TEXT[] DEFAULT '{}',
  what_happened TEXT DEFAULT '',
  full_markdown TEXT DEFAULT '',
  email_delivery_status TEXT DEFAULT 'idle',
  whatsapp_delivery_status TEXT DEFAULT 'idle',
  delivery_log JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.intelexa_qa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.intelexa_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.intelexa_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelexa_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelexa_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelexa_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelexa_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelexa_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelexa_qa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intelexa_profiles_user_all" ON public.intelexa_profiles;
CREATE POLICY "intelexa_profiles_user_all" ON public.intelexa_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intelexa_recipients_user_all" ON public.intelexa_recipients;
CREATE POLICY "intelexa_recipients_user_all" ON public.intelexa_recipients
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intelexa_events_user_all" ON public.intelexa_events;
CREATE POLICY "intelexa_events_user_all" ON public.intelexa_events
  FOR ALL USING (auth.uid() = user_id OR is_demo = true) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intelexa_transcripts_user_all" ON public.intelexa_transcripts;
CREATE POLICY "intelexa_transcripts_user_all" ON public.intelexa_transcripts
  FOR ALL USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.intelexa_events e WHERE e.id = event_id AND e.is_demo = true)) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intelexa_intelligence_user_all" ON public.intelexa_intelligence;
CREATE POLICY "intelexa_intelligence_user_all" ON public.intelexa_intelligence
  FOR ALL USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.intelexa_events e WHERE e.id = event_id AND e.is_demo = true)) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intelexa_reports_user_all" ON public.intelexa_reports;
CREATE POLICY "intelexa_reports_user_all" ON public.intelexa_reports
  FOR ALL USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.intelexa_events e WHERE e.id = event_id AND e.is_demo = true)) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "intelexa_qa_user_all" ON public.intelexa_qa;
CREATE POLICY "intelexa_qa_user_all" ON public.intelexa_qa
  FOR ALL USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.intelexa_events e WHERE e.id = event_id AND e.is_demo = true)) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_intelexa_events_user ON public.intelexa_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intelexa_transcripts_event ON public.intelexa_transcripts(event_id);
CREATE INDEX IF NOT EXISTS idx_intelexa_intelligence_event ON public.intelexa_intelligence(event_id);
CREATE INDEX IF NOT EXISTS idx_intelexa_reports_event ON public.intelexa_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_intelexa_qa_event ON public.intelexa_qa(event_id);
