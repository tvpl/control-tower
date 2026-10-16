"use client";
import { ArrowRight, ArrowUpRight, Layers3, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
export default function Login({
  local,
  sso,
}: {
  local: boolean;
  sso: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(local ? "admin@demo.local" : ""),
    [password, setPassword] = useState(local ? "Tower-Demo-2026!" : ""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail);
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          <Layers3 size={24} />
          <span>
            MODERNIZATION
            <br />
            <b>CONTROL TOWER</b>
          </span>
        </div>
        <div className="login-copy">
          <span className="eyebrow">ARCHITECTURE INTELLIGENCE</span>
          <h1>
            Complexidade.
            <br />
            Sob controle.
          </h1>
          <p>
            Conecte a arquitetura às entregas.
            <br />
            Transforme informação em decisões.
          </p>
          <div className="orbit">
            <div className="orbit-inner">
              <Layers3 size={45} />
            </div>
            <span className="orbit-label ol-1">ESCOPO</span>
            <span className="orbit-label ol-2">DELIVERY</span>
            <span className="orbit-label ol-3">READINESS</span>
          </div>
        </div>
        <small>Um contexto. Todas as perspectivas.</small>
      </section>
      <section className="login-form">
        <div>
          <span className="eyebrow">SEU PRÓXIMO PONTO DE VISTA</span>
          <h2>Entre na Control Tower</h2>
          <p className="muted">Acesse o programa e continue de onde parou.</p>
          {local && (
            <form onSubmit={login}>
              <label>
                E-mail
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <button className="button primary" disabled={pending}>
                {pending ? "Entrando…" : "Acessar plataforma"}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
          {sso ? (
            <a className="oidc-link" href="/api/auth/oidc">
              Entrar com identidade corporativa <ArrowUpRight size={14} />
            </a>
          ) : (
            <p className="muted" style={{ marginTop: 20, fontSize: 11 }}>
              Identidade corporativa ainda não configurada.
            </p>
          )}
          {local && (
            <div className="demo-note">
              <ShieldCheck size={19} />
              <div>
                <strong>Ambiente local de demonstração</strong>
                <p>Dados fictícios. Senha de demonstração: Tower-Demo-2026!</p>
                <p>
                  Perfis: admin, lider, aprovador, pmo ou leitor @demo.local.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
