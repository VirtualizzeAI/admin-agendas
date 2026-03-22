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
  saas_email?: string | null;
  saas_user_id?: string | null;
  tenant_id?: string | null;
  created_at: string;
  active: boolean;
}

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const REQUEST_TIMEOUT_MS = 10000;

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
    saas_email: '',
    saas_password: '',
  });
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingCustomerForm, setEditingCustomerForm] = useState({
    name: '',
    plan_id: '',
    due_date: '',
    contact: '',
    saas_email: '',
  });
  const [customerActionLoading, setCustomerActionLoading] = useState<string | null>(null);

  const plansById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  useEffect(() => {
    let mounted = true;
    let authChangeInFlight = false;

    const syncSession = async () => {
      setSessionLoading(true);
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          'Timeout ao carregar sessao. Tente entrar novamente.',
        );

        if (!mounted) return;

        if (error || !data.session) {
          setIsLogged(false);
          setIsAdmin(false);
          setUserEmail('');
          setPlans([]);
          setCustomers([]);
          return;
        }

        setIsLogged(true);
        setUserEmail(data.session.user.email ?? '');
        await loadData(data.session.user.id);
      } catch (error) {
        if (!mounted) return;

        void supabase.auth.signOut({ scope: 'local' });

        setIsLogged(false);
        setIsAdmin(false);
        setUserEmail('');
        setPlans([]);
        setCustomers([]);
        setScreenError(error instanceof Error ? error.message : 'Falha ao validar sessao.');
      } finally {
        if (mounted) {
          setSessionLoading(false);
        }
      }
    };

    void syncSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (
      _event: unknown,
      session: { user: { id: string; email?: string | null } } | null,
    ) => {
      if (!mounted) return;
      if (authChangeInFlight) return;

      try {
        authChangeInFlight = true;

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
      } catch (error) {
        if (!mounted) return;
        setScreenError(error instanceof Error ? error.message : 'Falha ao atualizar sessao.');
      } finally {
        authChangeInFlight = false;
        if (mounted) {
          setSessionLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionLoading) return;

    const fallbackTimer = setTimeout(() => {
      setSessionLoading(false);
      setIsLogged(false);
      setIsAdmin(false);
      setUserEmail('');
      setPlans([]);
      setCustomers([]);
      setScreenError((current) => current ?? 'Sessao travada no navegador. Se persistir, limpe os dados do site e entre novamente.');
    }, 12000);

    return () => clearTimeout(fallbackTimer);
  }, [sessionLoading]);

  async function loadData(userId: string) {
    setDataLoading(true);
    setScreenError(null);

    try {
      const { data: adminRow, error: adminError } = await withTimeout(
        Promise.resolve(
          supabase
            .from('admin_users')
            .select('user_id')
            .eq('user_id', userId)
            .maybeSingle(),
        ),
        REQUEST_TIMEOUT_MS,
        'Timeout ao carregar permissao admin.',
      );

      if (adminError) {
        setIsAdmin(false);
        setScreenError(adminError.message);
        return;
      }

      if (!adminRow) {
        setIsAdmin(false);
        setScreenError('Seu usuário não está liberado em admin_users.');
        return;
      }

      setIsAdmin(true);

      const [{ data: plansData, error: plansError }, customersResult] = await withTimeout(
        Promise.all([
          supabase.from('admin_plans').select('id, name, price, active, created_at').order('created_at', { ascending: false }),
          supabase.from('admin_customers').select('id, name, plan_id, due_date, contact, saas_email, saas_user_id, tenant_id, active, created_at').order('created_at', { ascending: false }),
        ]),
        REQUEST_TIMEOUT_MS,
        'Timeout ao carregar planos e clientes.',
      );

      let customersData = customersResult.data;
      let customersError = customersResult.error;

      if (customersError?.message?.includes('column admin_customers.saas_email does not exist')) {
        const legacyResult = await withTimeout(
          Promise.resolve(
            supabase
              .from('admin_customers')
              .select('id, name, plan_id, due_date, contact, active, created_at')
              .order('created_at', { ascending: false }),
          ),
          REQUEST_TIMEOUT_MS,
          'Timeout ao carregar clientes no modo legado.',
        );

        customersData = (legacyResult.data ?? []).map((item) => ({
          ...item,
          saas_email: null,
          saas_user_id: null,
          tenant_id: null,
        }));
        customersError = legacyResult.error;

        if (!legacyResult.error) {
          setScreenError('Schema desatualizado: faltam colunas SaaS em admin_customers. Execute a migracao SQL para habilitar edicao de e-mail e reset de senha.');
        }
      }

      if (plansError) {
        setScreenError(plansError.message);
        return;
      }

      if (customersError) {
        setScreenError(customersError.message);
        return;
      }

      setPlans(plansData ?? []);
      setCustomers(customersData ?? []);
    } catch (error) {
      setIsAdmin(false);
      setPlans([]);
      setCustomers([]);
      setScreenError(error instanceof Error ? error.message : 'Erro ao carregar dados do painel.');
    } finally {
      setDataLoading(false);
    }
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
    const saasEmail = customerForm.saas_email.trim().toLowerCase();
    const saasPassword = customerForm.saas_password;

    if (!name || !customerForm.plan_id || !customerForm.due_date || !contact || !saasEmail || !saasPassword) {
      setCustomerError('Preencha nome, plano, vencimento, contato, e-mail e senha SaaS.');
      return;
    }

    if (!API_URL) {
      setCustomerError('Defina VITE_API_URL no .env do admin-panel.');
      return;
    }

    if (saasPassword.length < 6) {
      setCustomerError('A senha SaaS deve ter ao menos 6 caracteres.');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setCustomerError('Sessao expirada. Faca login novamente.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/v1/admin/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name,
          plan_id: customerForm.plan_id,
          due_date: customerForm.due_date,
          contact,
          saas_email: saasEmail,
          saas_password: saasPassword,
        }),
      });

      const payload = await parseJsonSafe<{
        message?: string;
        id?: string;
        name?: string;
        plan_id?: string;
        due_date?: string;
        contact?: string;
        saas_email?: string;
        saas_user_id?: string;
        tenant_id?: string;
        active?: boolean;
        created_at?: string;
      }>(response);

      if (!response.ok) {
        setCustomerError(payload?.message ?? 'Nao foi possivel criar cliente e acesso SaaS.');
        return;
      }

      if (!payload?.id || !payload.name || !payload.plan_id || !payload.due_date || !payload.contact || !payload.created_at) {
        setCustomerError('Resposta invalida do backend ao criar cliente.');
        return;
      }

      const newCustomer: CustomerRecord = {
        id: payload.id,
        name: payload.name,
        plan_id: payload.plan_id,
        due_date: payload.due_date,
        contact: payload.contact,
        saas_email: payload.saas_email ?? saasEmail,
        saas_user_id: payload.saas_user_id ?? null,
        tenant_id: payload.tenant_id ?? null,
        active: Boolean(payload.active),
        created_at: payload.created_at,
      };

      setCustomers((current) => [newCustomer, ...current]);

      setCustomerForm({ name: '', plan_id: '', due_date: '', contact: '', saas_email: '', saas_password: '' });
      setCustomerError(null);
    } catch (error) {
      setCustomerError(error instanceof Error ? error.message : 'Erro inesperado ao criar cliente.');
    }
  };

  const startEditingCustomer = (customer: CustomerRecord) => {
    setCustomerError(null);
    setEditingCustomerId(customer.id);
    setEditingCustomerForm({
      name: customer.name,
      plan_id: customer.plan_id,
      due_date: customer.due_date,
      contact: customer.contact,
      saas_email: customer.saas_email ?? '',
    });
  };

  const cancelEditingCustomer = () => {
    setEditingCustomerId(null);
    setEditingCustomerForm({
      name: '',
      plan_id: '',
      due_date: '',
      contact: '',
      saas_email: '',
    });
  };

  const handleSaveCustomerEdit = async (customerId: string) => {
    if (!API_URL) {
      setCustomerError('Defina VITE_API_URL no .env do admin-panel.');
      return;
    }

    const name = editingCustomerForm.name.trim();
    const contact = editingCustomerForm.contact.trim();
    const saasEmail = editingCustomerForm.saas_email.trim().toLowerCase();

    if (!name || !editingCustomerForm.plan_id || !editingCustomerForm.due_date || !contact || !saasEmail) {
      setCustomerError('Preencha nome, plano, vencimento, contato e e-mail SaaS no modo edicao.');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setCustomerError('Sessao expirada. Faca login novamente.');
      return;
    }

    setCustomerActionLoading(customerId);

    try {
      const response = await fetch(`${API_URL}/v1/admin/customers/${customerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name,
          plan_id: editingCustomerForm.plan_id,
          due_date: editingCustomerForm.due_date,
          contact,
          saas_email: saasEmail,
        }),
      });

      const payload = await parseJsonSafe<{
        message?: string;
        record?: CustomerRecord;
      }>(response);

      if (!response.ok || !payload?.record) {
        setCustomerError(payload?.message ?? 'Nao foi possivel atualizar o cliente.');
        return;
      }

      setCustomers((current) => current.map((item) => (item.id === customerId ? { ...item, ...payload.record } : item)));
      cancelEditingCustomer();
      setCustomerError(null);
    } catch (error) {
      setCustomerError(error instanceof Error ? error.message : 'Erro inesperado ao atualizar cliente.');
    } finally {
      setCustomerActionLoading(null);
    }
  };

  const handleSendResetPassword = async (customerId: string) => {
    if (!API_URL) {
      setCustomerError('Defina VITE_API_URL no .env do admin-panel.');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setCustomerError('Sessao expirada. Faca login novamente.');
      return;
    }

    setCustomerActionLoading(customerId);

    try {
      const response = await fetch(`${API_URL}/v1/admin/customers/${customerId}/send-password-reset`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = await parseJsonSafe<{ message?: string }>(response);

      if (!response.ok) {
        setCustomerError(payload?.message ?? 'Nao foi possivel enviar o email de troca de senha.');
        return;
      }

      setCustomerError(null);
      window.alert('Email de recuperacao enviado para o cliente.');
    } catch (error) {
      setCustomerError(error instanceof Error ? error.message : 'Erro inesperado ao enviar email de troca de senha.');
    } finally {
      setCustomerActionLoading(null);
    }
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

              <label className="field">
                <span>E-mail de acesso SaaS</span>
                <input
                  type="email"
                  placeholder="cliente@empresa.com"
                  value={customerForm.saas_email}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCustomerForm((current) => ({ ...current, saas_email: value }));
                  }}
                />
              </label>

              <label className="field">
                <span>Senha de acesso SaaS</span>
                <input
                  type="password"
                  placeholder="Minimo 6 caracteres"
                  value={customerForm.saas_password}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCustomerForm((current) => ({ ...current, saas_password: value }));
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
                    {editingCustomerId === customer.id ? (
                      <div className="stack" style={{ width: '100%' }}>
                        <label className="field">
                          <span>Nome</span>
                          <input
                            type="text"
                            value={editingCustomerForm.name}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setEditingCustomerForm((current) => ({ ...current, name: value }));
                            }}
                          />
                        </label>

                        <label className="field">
                          <span>Plano</span>
                          <select
                            value={editingCustomerForm.plan_id}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setEditingCustomerForm((current) => ({ ...current, plan_id: value }));
                            }}
                          >
                            <option value="">Selecione um plano</option>
                            {plans.map((itemPlan) => (
                              <option key={itemPlan.id} value={itemPlan.id}>
                                {itemPlan.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field">
                          <span>Data de vencimento</span>
                          <input
                            type="date"
                            value={editingCustomerForm.due_date}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setEditingCustomerForm((current) => ({ ...current, due_date: value }));
                            }}
                          />
                        </label>

                        <label className="field">
                          <span>Contato</span>
                          <input
                            type="text"
                            value={editingCustomerForm.contact}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setEditingCustomerForm((current) => ({ ...current, contact: value }));
                            }}
                          />
                        </label>

                        <label className="field">
                          <span>E-mail SaaS</span>
                          <input
                            type="email"
                            value={editingCustomerForm.saas_email}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setEditingCustomerForm((current) => ({ ...current, saas_email: value }));
                            }}
                          />
                        </label>

                        <div className="topbar-actions" style={{ justifyContent: 'flex-start' }}>
                          <button
                            className="btn"
                            type="button"
                            disabled={customerActionLoading === customer.id}
                            onClick={() => void handleSaveCustomerEdit(customer.id)}
                          >
                            Salvar
                          </button>
                          <button
                            className="btn btn-light"
                            type="button"
                            onClick={cancelEditingCustomer}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="strong">{customer.name}</p>
                        <p className="muted">Plano: {plan?.name ?? 'Plano removido'}</p>
                        <p className="muted">Vencimento: {new Date(`${customer.due_date}T00:00:00`).toLocaleDateString('pt-BR')}</p>
                        <p className="muted">Contato: {customer.contact}</p>
                        <p className="muted">E-mail SaaS: {customer.saas_email || '-'}</p>

                        <div className="topbar-actions" style={{ justifyContent: 'flex-start' }}>
                          <button
                            className="btn btn-light"
                            type="button"
                            onClick={() => startEditingCustomer(customer)}
                          >
                            Editar
                          </button>
                          <button
                            className="btn"
                            type="button"
                            disabled={customerActionLoading === customer.id}
                            onClick={() => void handleSendResetPassword(customer.id)}
                          >
                            Enviar email troca senha
                          </button>
                        </div>
                      </>
                    )}
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
