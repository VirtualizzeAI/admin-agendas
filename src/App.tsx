import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';

type ViewMode = 'plans' | 'clients';

interface PlanRecord {
  id: string;
  name: string;
  price: number;
  created_at: string;
  active: boolean;
}

interface CustomerRecord {
  id: string;
  name: string;
  plan_id: string;
  due_date: string;
  contact: string;
  created_at: string;
  active: boolean;
}

export function App() {
  const [isLogged, setIsLogged] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const [login, setLogin] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');

  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);

  const [mode, setMode] = useState<ViewMode>('plans');

  const [planForm, setPlanForm] = useState({ name: '', price: 0 });
  const [planError, setPlanError] = useState<string | null>(null);

  const [customerForm, setCustomerForm] = useState({
    name: '',
    plan_id: '',
    due_date: '',
    contact: '',
  });
  const [customerError, setCustomerError] = useState<string | null>(null);

  const plansById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      setSessionLoading(true);
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error || !data.session) {
        setIsLogged(false);
        setIsAdmin(false);
        setUserEmail('');
        setPlans([]);
        setCustomers([]);
        setSessionLoading(false);
        return;
      }

      setIsLogged(true);
      setUserEmail(data.session.user.email ?? '');
      await loadData(data.session.user.id);
      if (mounted) setSessionLoading(false);
    };

    void syncSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (
      _event: unknown,
      session: { user: { id: string; email?: string | null } } | null,
    ) => {
      if (!mounted) return;

      if (!session) {
        setIsLogged(false);
        setIsAdmin(false);
        setUserEmail('');
        setPlans([]);
        setCustomers([]);
        return;
      }

      setIsLogged(true);
      setUserEmail(session.user.email ?? '');
      await loadData(session.user.id);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function loadData(userId: string) {
    setDataLoading(true);
    setScreenError(null);

    const { data: adminRow, error: adminError } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (adminError) {
      setIsAdmin(false);
      setScreenError(adminError.message);
      setDataLoading(false);
      return;
    }

    if (!adminRow) {
      setIsAdmin(false);
      setScreenError('Seu usuário não está liberado em admin_users.');
      setDataLoading(false);
      return;
    }

    setIsAdmin(true);

    const [{ data: plansData, error: plansError }, { data: customersData, error: customersError }] = await Promise.all([
      supabase.from('admin_plans').select('id, name, price, active, created_at').order('created_at', { ascending: false }),
      supabase.from('admin_customers').select('id, name, plan_id, due_date, contact, active, created_at').order('created_at', { ascending: false }),
    ]);

    if (plansError) {
      setScreenError(plansError.message);
      setDataLoading(false);
      return;
    }

    if (customersError) {
      setScreenError(customersError.message);
      setDataLoading(false);
      return;
    }

    setPlans(plansData ?? []);
    setCustomers(customersData ?? []);
    setDataLoading(false);
  }

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const email = login.email.trim().toLowerCase();
    const password = login.password;

    if (!email || !password) {
      setLoginError('Preencha e-mail e senha.');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoginError(error.message);
      return;
    }

    setLoginError(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLogged(false);
    setIsAdmin(false);
    setPlans([]);
    setCustomers([]);
    setUserEmail('');
  };

  const handleCreatePlan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = planForm.name.trim();
    if (!name) {
      setPlanError('Informe o nome do plano.');
      return;
    }

    if (planForm.price <= 0) {
      setPlanError('Informe um valor maior que zero.');
      return;
    }

    const { data, error } = await supabase
      .from('admin_plans')
      .insert({
        name,
        price: Number(planForm.price),
      })
      .select('id, name, price, active, created_at')
      .single();

    if (error) {
      setPlanError(error.message);
      return;
    }

    const newPlan: PlanRecord = {
      id: data.id,
      name,
      price: Number(data.price),
      active: data.active,
      created_at: data.created_at,
    };

    setPlans((current) => [newPlan, ...current]);

    setPlanForm({ name: '', price: 0 });
    setPlanError(null);
  };

  const handleCreateCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = customerForm.name.trim();
    const contact = customerForm.contact.trim();

    if (!name || !customerForm.plan_id || !customerForm.due_date || !contact) {
      setCustomerError('Preencha nome, plano, vencimento e contato.');
      return;
    }

    const { data, error } = await supabase
      .from('admin_customers')
      .insert({
        name,
        plan_id: customerForm.plan_id,
        due_date: customerForm.due_date,
        contact,
      })
      .select('id, name, plan_id, due_date, contact, active, created_at')
      .single();

    if (error) {
      setCustomerError(error.message);
      return;
    }

    const newCustomer: CustomerRecord = {
      id: data.id,
      name,
      plan_id: data.plan_id,
      due_date: data.due_date,
      contact,
      active: data.active,
      created_at: data.created_at,
    };

    setCustomers((current) => [newCustomer, ...current]);

    setCustomerForm({ name: '', plan_id: '', due_date: '', contact: '' });
    setCustomerError(null);
  };

  if (sessionLoading) {
    return (
      <main className="page page-login">
        <section className="card login-card">
          <p className="muted">Carregando sessão...</p>
        </section>
      </main>
    );
  }

  if (!isLogged) {
    return (
      <main className="page page-login">
        <section className="card login-card">
          <p className="eyebrow">Painel Administrativo</p>
          <h1>Login</h1>
          <form className="stack" onSubmit={handleLogin}>
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                placeholder="seu@email.com"
                value={login.email}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setLogin((current) => ({ ...current, email: value }));
                }}
              />
            </label>

            <label className="field">
              <span>Senha</span>
              <input
                type="password"
                placeholder="******"
                value={login.password}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setLogin((current) => ({ ...current, password: value }));
                }}
              />
            </label>

            {loginError ? <p className="error">{loginError}</p> : null}

            <p className="muted">
              Entre com seu usuário do Supabase Auth que já está cadastrado em admin_users.
            </p>

            <button className="btn" type="submit">
              Entrar
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Painel Administrativo</p>
          <h1>Gestão SaaS</h1>
        </div>

        <div className="topbar-actions">
          <button
            className={mode === 'plans' ? 'tab active' : 'tab'}
            onClick={() => setMode('plans')}
            type="button"
          >
            Planos
          </button>
          <button
            className={mode === 'clients' ? 'tab active' : 'tab'}
            onClick={() => setMode('clients')}
            type="button"
          >
            Clientes
          </button>
          <button className="btn btn-light" onClick={handleLogout} type="button">
            Sair
          </button>
        </div>
      </header>

      <p className="muted" style={{ marginBottom: 12 }}>
        Sessão: {userEmail || 'usuário autenticado'}
      </p>

      {screenError ? <p className="error" style={{ marginBottom: 12 }}>{screenError}</p> : null}

      {!isAdmin ? (
        <section className="card">
          <h2>Acesso não liberado</h2>
          <p className="muted">Adicione seu user_id na tabela public.admin_users para liberar o painel.</p>
        </section>
      ) : null}

      {isAdmin && dataLoading ? (
        <section className="card">
          <p className="muted">Carregando dados...</p>
        </section>
      ) : null}

      {isAdmin && !dataLoading && mode === 'plans' ? (
        <section className="grid">
          <article className="card">
            <h2>Novo plano</h2>
            <form className="stack" onSubmit={handleCreatePlan}>
              <label className="field">
                <span>Nome</span>
                <input
                  type="text"
                  placeholder="Ex: Premium"
                  value={planForm.name}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setPlanForm((current) => ({ ...current, name: value }));
                  }}
                />
              </label>

              <label className="field">
                <span>Valor (R$)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="199.90"
                  value={planForm.price}
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    setPlanForm((current) => ({ ...current, price: Number.isFinite(value) ? value : 0 }));
                  }}
                />
              </label>

              {planError ? <p className="error">{planError}</p> : null}

              <button className="btn" type="submit">
                Criar plano
              </button>
            </form>
          </article>

          <article className="card">
            <h2>Planos cadastrados</h2>
            <div className="stack list">
              {plans.map((plan) => (
                <div className="list-row" key={plan.id}>
                  <div>
                    <p className="strong">{plan.name}</p>
                    <p className="muted">Criado em {new Date(plan.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <p className="price">R$ {plan.price.toFixed(2)}</p>
                </div>
              ))}

              {plans.length === 0 ? <p className="muted">Nenhum plano cadastrado.</p> : null}
            </div>
          </article>
        </section>
      ) : null}

      {isAdmin && !dataLoading && mode === 'clients' ? (
        <section className="grid">
          <article className="card">
            <h2>Novo cliente</h2>
            <form className="stack" onSubmit={handleCreateCustomer}>
              <label className="field">
                <span>Nome</span>
                <input
                  type="text"
                  placeholder="Ex: Clínica Exemplo"
                  value={customerForm.name}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCustomerForm((current) => ({ ...current, name: value }));
                  }}
                />
              </label>

              <label className="field">
                <span>Plano</span>
                <select
                  value={customerForm.plan_id}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCustomerForm((current) => ({ ...current, plan_id: value }));
                  }}
                >
                  <option value="">Selecione um plano</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Data de vencimento</span>
                <input
                  type="date"
                  value={customerForm.due_date}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCustomerForm((current) => ({ ...current, due_date: value }));
                  }}
                />
              </label>

              <label className="field">
                <span>Contato</span>
                <input
                  type="text"
                  placeholder="Telefone, e-mail ou WhatsApp"
                  value={customerForm.contact}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCustomerForm((current) => ({ ...current, contact: value }));
                  }}
                />
              </label>

              {customerError ? <p className="error">{customerError}</p> : null}

              <button className="btn" disabled={plans.length === 0} type="submit">
                Criar cliente
              </button>

              {plans.length === 0 ? (
                <p className="muted">Cadastre pelo menos um plano antes de criar clientes.</p>
              ) : null}
            </form>
          </article>

          <article className="card">
            <h2>Clientes cadastrados</h2>
            <div className="stack list">
              {customers.map((customer) => {
                const plan = plansById.get(customer.plan_id);

                return (
                  <div className="list-row list-row-column" key={customer.id}>
                    <p className="strong">{customer.name}</p>
                    <p className="muted">Plano: {plan?.name ?? 'Plano removido'}</p>
                    <p className="muted">Vencimento: {new Date(`${customer.due_date}T00:00:00`).toLocaleDateString('pt-BR')}</p>
                    <p className="muted">Contato: {customer.contact}</p>
                  </div>
                );
              })}

              {customers.length === 0 ? <p className="muted">Nenhum cliente cadastrado.</p> : null}
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}
