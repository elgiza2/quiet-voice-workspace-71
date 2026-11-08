CREATE TABLE public.payment_orders (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('plus','pro','ultra')),
  interval text NOT NULL CHECK (interval IN ('monthly','yearly')),
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('kashier','google_play')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders readable" ON public.payment_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE UNIQUE INDEX payment_orders_provider_ref ON public.payment_orders(provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE TRIGGER payment_orders_updated BEFORE UPDATE ON public.payment_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  interval text NOT NULL,
  provider text NOT NULL,
  current_period_end timestamptz NOT NULL,
  last_order_id text REFERENCES public.payment_orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscription readable" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER subscriptions_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic settlement: marks a pending order paid once and extends the plan.
CREATE OR REPLACE FUNCTION public.settle_payment_order(p_order text, p_ref text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.payment_orders;
BEGIN
  UPDATE public.payment_orders SET status='paid', provider_ref=p_ref
   WHERE id=p_order AND status='pending' RETURNING * INTO o;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.subscriptions(user_id, plan, interval, provider, current_period_end, last_order_id)
  VALUES (o.user_id, o.tier, o.interval, o.provider, now() + CASE WHEN o.interval='yearly' THEN interval '365 days' ELSE interval '30 days' END, o.id)
  ON CONFLICT (user_id) DO UPDATE SET plan=excluded.plan, interval=excluded.interval, provider=excluded.provider,
    current_period_end = greatest(public.subscriptions.current_period_end, now()) + CASE WHEN o.interval='yearly' THEN interval '365 days' ELSE interval '30 days' END,
    last_order_id=excluded.last_order_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.settle_payment_order(text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payment_order(text,text) TO service_role;