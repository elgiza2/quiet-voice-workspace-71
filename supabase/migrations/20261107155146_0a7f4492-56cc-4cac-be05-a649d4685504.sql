ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_e164_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_e164_format CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

CREATE TABLE public.phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  e164 text NOT NULL UNIQUE,
  telnyx_number_id text NOT NULL UNIQUE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  bot_id uuid UNIQUE REFERENCES public.bots(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.phone_numbers TO authenticated;
GRANT ALL ON public.phone_numbers TO service_role;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners see their agent numbers" ON public.phone_numbers FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.bot_phone_agents (
  bot_id uuid PRIMARY KEY REFERENCES public.bots(id) ON DELETE CASCADE,
  telnyx_assistant_id text NOT NULL UNIQUE,
  texml_app_id text,
  config_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_phone_agents TO service_role;
ALTER TABLE public.bot_phone_agents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telephony_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telephony_settings TO service_role;
ALTER TABLE public.telephony_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.phone_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  counterpart text NOT NULL,
  agent_number text,
  purpose text,
  status text NOT NULL DEFAULT 'dialing' CHECK (status IN ('dialing', 'in_progress', 'completed', 'no_answer', 'failed')),
  call_control_id text UNIQUE,
  telnyx_conversation_id text UNIQUE,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  duration_sec integer,
  error text,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phone_calls_user_created_idx ON public.phone_calls (user_id, created_at DESC);
CREATE INDEX phone_calls_active_idx ON public.phone_calls (status) WHERE status IN ('dialing', 'in_progress');
GRANT SELECT ON public.phone_calls TO authenticated;
GRANT ALL ON public.phone_calls TO service_role;
ALTER TABLE public.phone_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their own phone calls" ON public.phone_calls FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER phone_calls_updated_at BEFORE UPDATE ON public.phone_calls FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();