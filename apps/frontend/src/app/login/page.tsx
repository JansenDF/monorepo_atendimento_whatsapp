'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { BrandMark } from '@/components/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isDemoMode } from '@/lib/demo-mode';
import { apiRequest } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { demoLogin, DEMO_USER } from '@/lib/demo-store';
import { loginSchema, LoginValues } from '@/lib/schemas';
import { AuthSessionResponse, AuthUser } from '@/lib/types';

function normalizeSession(response: AuthSessionResponse): AuthSessionResponse {
  const raw = response.user as AuthUser & { fullName?: string };
  return {
    accessToken: response.accessToken,
    user: { ...raw, name: raw.name || raw.fullName || raw.email, companyName: raw.companyName || 'Sua empresa' },
  };
}

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [visible, setVisible] = useState(false);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: isDemoMode ? DEMO_USER.email : '', password: '' },
  });

  const onSubmit = async (values: LoginValues) => {
    try {
      const response = isDemoMode
        ? await demoLogin(values.email)
        : await apiRequest<AuthSessionResponse>('/auth/login', {
          method: 'POST', authenticated: false, body: JSON.stringify(values),
        });
      const session = normalizeSession(response);
      setSession(session.accessToken, session.user);
      toast.success(`Boas-vindas, ${session.user.name.split(' ')[0]}!`);
      router.replace('/dashboard');
    } catch (error) {
      setError('root', { message: error instanceof Error ? error.message : 'Não foi possível entrar. Tente novamente.' });
    }
  };

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#10251d] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-28 -top-24 size-[520px] rounded-full border border-white/10" />
        <div className="absolute -right-8 -top-4 size-[390px] rounded-full border border-white/10" />
        <div className="absolute -bottom-64 -left-40 size-[560px] rounded-full bg-primary/20 blur-3xl" />
        <div className="relative z-10"><BrandMark inverse /></div>
        <div className="relative z-10 max-w-xl py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80">
            <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" /> Atendimento conectado, do seu jeito
          </div>
          <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight xl:text-5xl">Conversas melhores.<br /><span className="text-emerald-300">Clientes mais felizes.</span></h1>
          <p className="mt-5 max-w-md text-base leading-7 text-white/65">Organize o atendimento da sua equipe em um só lugar e transforme cada conversa em uma boa experiência.</p>
          <div className="mt-10 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
            <div className="grid size-11 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300"><MessageCircle className="size-5" /></div>
            <div><p className="text-sm font-medium">Tudo em tempo real</p><p className="mt-0.5 text-xs text-white/55">WhatsApp, equipe e histórico em sincronia.</p></div>
          </div>
        </div>
        <p className="relative z-10 text-xs text-white/45">© {new Date().getFullYear()} Atende. Atendimento que aproxima.</p>
      </section>

      <section className="relative flex min-h-screen flex-col justify-center px-5 py-14 sm:px-10 lg:px-16 xl:px-24">
        <div className="absolute right-5 top-5"><ThemeToggle /></div>
        <div className="mx-auto w-full max-w-[420px]">
          <div className="mb-9 lg:hidden"><BrandMark /></div>
          <div className="mb-8">
            <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="size-5" /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Seu espaço de trabalho</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Entre na sua conta</h2>
            <p className="mt-2 text-sm text-muted-foreground">Informe seus dados para acessar o atendimento.</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="email">E-mail</label>
              <div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoComplete="email" className="h-12 pl-10" id="email" placeholder="voce@empresa.com.br" type="email" aria-invalid={Boolean(errors.email)} {...register('email')} /></div>
              {errors.email ? <p className="mt-1.5 text-xs text-destructive">{errors.email.message}</p> : null}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between"><label className="text-sm font-medium" htmlFor="password">Senha</label><button className="text-xs font-semibold text-primary hover:underline" type="button" onClick={() => toast.info('A recuperação de senha será liberada quando a API disponibilizar esse fluxo.')}>Esqueci minha senha</button></div>
              <div className="relative"><LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input autoComplete="current-password" className="h-12 pl-10 pr-12" id="password" placeholder="Sua senha" type={visible ? 'text' : 'password'} aria-invalid={Boolean(errors.password)} {...register('password')} /><button aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground" type="button" onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
              {errors.password ? <p className="mt-1.5 text-xs text-destructive">{errors.password.message}</p> : null}
            </div>
            {errors.root ? <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">{errors.root.message}</p> : null}
            <Button className="h-12 w-full text-sm" disabled={isSubmitting} type="submit">{isSubmitting ? 'Entrando…' : 'Entrar'}<ArrowRight className="ml-auto" /></Button>
          </form>
          <div className="mt-7 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> Seus dados são protegidos e criptografados.</div>
          {isDemoMode ? <p className="mt-5 rounded-xl bg-muted px-4 py-3 text-center text-xs text-muted-foreground">Modo demonstração ativo. Use o e-mail sugerido e qualquer senha.</p> : null}
          <p className="mt-10 text-center text-xs text-muted-foreground">Precisa de acesso? <span className="font-medium text-foreground">Fale com o administrador da sua empresa.</span></p>
        </div>
      </section>
    </main>
  );
}
