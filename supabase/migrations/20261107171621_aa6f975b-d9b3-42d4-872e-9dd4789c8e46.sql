ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_provider_check;
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_provider_check CHECK (provider IN ('kashier','google_play','dodo'));
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS method text, ADD COLUMN IF NOT EXISTS checkout_ref text, ADD COLUMN IF NOT EXISTS usd_amount numeric(10,2);