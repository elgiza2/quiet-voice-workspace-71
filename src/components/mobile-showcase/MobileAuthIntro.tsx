/** Shared reference sign-in and registration presentation with Ceyo branding. */
import { ArrowLeft, Eye, EyeOff, Mail } from "lucide-react";
import AuthAgentOrbit from "@/components/auth/AuthAgentOrbit";
import { AnimatePresence, m as motion, useReducedMotion } from "framer-motion";
import { useUserLang } from "@/lib/authI18n";
import { Button } from "@/components/ui/button";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

interface Props {
  onGoogle: () => void; onGithub?: () => void; onEmail: () => void; onBack?: () => void; onClose?: () => void; onTelegram?: () => void;
  expanded?: boolean; showPasswordField?: boolean; email?: string; setEmail?: (v: string) => void;
  password?: string; setPassword?: (v: string) => void; showPassword?: boolean; setShowPassword?: (v: boolean) => void;
  isSubmitting?: boolean; onSubmitEmail?: () => void; onSubmitPassword?: () => void; onForgotPassword?: () => void; error?: string | null;
  authMode?: "signup" | "signin"; onAuthModeChange?: (mode: "signup" | "signin") => void;
}
export default function MobileAuthIntro(p: Props) {
  const ar = useUserLang() === "ar-eg";
  const reducedMotion = useReducedMotion();
  const screen = !p.expanded ? "entry" : p.showPasswordField ? "password" : "email";
  const label = (provider: string) => ar ? `متابعة باستخدام ${provider}` : `Continue with ${provider}`;
  const creating = p.authMode === "signup";
  return <main className="megsy-auth-screen megsy-auth-entry" dir={ar ? "rtl" : "ltr"}>
    {p.expanded && <Button variant="ghost" type="button" className="megsy-auth-back" onClick={p.onBack} aria-label={ar ? "رجوع" : "Back"}><ArrowLeft size={20} /></Button>}
    <div className="megsy-auth-brand">
      <AuthAgentOrbit />
      <div className="megsy-auth-brand-copy"><div className="megsy-auth-lockup"><h1>Ceyo</h1></div><p className="megsy-auth-tagline">{ar ? <><span>فريقك من الوكلاء، جاهز دائمًا</span><span>لإنجاز شغلك.</span></> : <><span>Your team of always-on agents</span><span>that finish the work.</span></>}</p></div>
    </div>
    <section className="megsy-auth-actions">
      <AnimatePresence mode="wait" initial={false}><motion.div key={screen} initial={{ opacity: 0, y: reducedMotion ? 0 : 12, scale: reducedMotion ? 1 : .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -6, scale: reducedMotion ? 1 : .985 }} transition={{ duration: reducedMotion ? 0 : .28, ease: [.22, 1, .36, 1] }}>
      {p.error && <p role="alert" className="megsy-auth-error">{p.error}</p>}
      {!p.expanded ? <>
        <GoogleSignInButton label={label("Google")} onClick={p.onGoogle} disabled={p.isSubmitting} />
        <Button variant="ghost" className="megsy-auth-pill megsy-auth-primary" onClick={p.onEmail}><Mail size={21} /><span>{ar ? "التسجيل بالبريد الإلكتروني" : "Continue with email"}</span></Button>
      </> : <form className="megsy-auth-form" onSubmit={e => { e.preventDefault(); if (!p.isSubmitting) (p.showPasswordField ? p.onSubmitPassword : p.onSubmitEmail)?.(); }}>
        <h2>{p.showPasswordField ? (creating ? (ar ? "أنشئ كلمة مرور" : "Create your password") : (ar ? "أدخل كلمة المرور" : "Enter your password")) : (ar ? "أدخل بريدك الإلكتروني" : "Enter your email")}</h2>
        {p.showPasswordField ? <p className="megsy-auth-email-summary" dir="ltr">{p.email}</p> : <input className="megsy-auth-input" type="email" aria-label={ar ? "البريد الإلكتروني" : "Email address"} autoComplete="email" placeholder={ar ? "البريد الإلكتروني" : "Email address"} value={p.email ?? ""} onChange={e => p.setEmail?.(e.target.value)} required disabled={p.isSubmitting} autoFocus dir="ltr" />}
        {p.showPasswordField && <div className="megsy-auth-password"><input className="megsy-auth-input" type={p.showPassword ? "text" : "password"} aria-label={ar ? "كلمة المرور" : "Password"} autoComplete={creating ? "new-password" : "current-password"} placeholder={creating ? (ar ? "كلمة مرور جديدة" : "New password") : (ar ? "كلمة المرور" : "Password")} value={p.password ?? ""} onChange={e => p.setPassword?.(e.target.value)} required disabled={p.isSubmitting} autoFocus dir="ltr" /><Button variant="ghost" type="button" onClick={() => p.setShowPassword?.(!p.showPassword)} aria-label={ar ? (p.showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور") : (p.showPassword ? "Hide password" : "Show password")}>{p.showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</Button></div>}
        {p.showPasswordField && !creating && <Button variant="ghost" type="button" className="megsy-auth-forgot" onClick={p.onForgotPassword}>{ar ? "نسيت كلمة المرور؟" : "Forgot password?"}</Button>}
        <Button variant="ghost" type="submit" className="megsy-auth-pill megsy-auth-primary" disabled={p.isSubmitting || !(p.showPasswordField ? p.password?.trim() : p.email?.trim())}>{p.isSubmitting ? (ar ? "لحظة…" : "Please wait…") : p.showPasswordField ? (creating ? (ar ? "أكمل" : "Continue") : (ar ? "تسجيل الدخول" : "Sign in")) : (ar ? "أكمل" : "Continue")}</Button>
      </form>}
      </motion.div></AnimatePresence>
    </section>
  </main>;
}
