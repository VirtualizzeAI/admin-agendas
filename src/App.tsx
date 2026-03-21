import { useMemo, useState } from 'react';

type ViewMode = 'plans' | 'clients';

interface Plan {
  id: string;
  name: string;
  price: number;
  createdAt: string;
}

interface Customer {
  id: string;
  name: string;
  planId: string;
  dueDate: string;
  contact: string;
  createdAt: string;
}

const PLANS_STORAGE_KEY = 'admin-panel:plans';
const CUSTOMERS_STORAGE_KEY = 'admin-panel:customers';
const SESSION_STORAGE_KEY = 'admin-panel:session';

function loadRecords<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords<T>(key: string, value: T[]) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function App() {
  const [isLogged, setIsLogged] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY) === '1';
  });

  const [login, setLogin] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState<string | null>(null);

  const [plans, setPlans] = useState<Plan[]>(() => loadRecords<Plan>(PLANS_STORAGE_KEY));
  const [customers, setCustomers] = useState<Customer[]>(() => loadRecords<Customer>(CUSTOMERS_STORAGE_KEY));

  const [mode, setMode] = useState<ViewMode>('plans');

  const [planForm, setPlanForm] = useState({ name: '', price: 0 });
  const [planError, setPlanError] = useState<string | null>(null);

  const [customerForm, setCustomerForm] = useState({
    name: '',
    planId: '',
    dueDate: '',
    contact: '',
  });
  const [customerError, setCustomerError] = useState<string | null>(null);

  const plansById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const email = login.email.trim().toLowerCase();
    const password = login.password;

    if (email !== 'admin@virtualizze.com' || password !== 'admin123') {
      setLoginError('Credenciais inválidas. Use admin@virtualizze.com / admin123');
      return;
    }

    window.sessionStorage.setItem(SESSION_STORAGE_KEY, '1');
    setLoginError(null);
    setIsLogged(true);
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setIsLogged(false);
  };

  const handleCreatePlan = (event: React.FormEvent<HTMLFormElement>) => {
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

    const newPlan: Plan = {
      id: `plan_${Date.now()}`,
      name,
      price: Number(planForm.price),
      createdAt: new Date().toISOString(),
    };

    const nextPlans = [newPlan, ...plans];
    setPlans(nextPlans);
    saveRecords(PLANS_STORAGE_KEY, nextPlans);

    setPlanForm({ name: '', price: 0 });
    setPlanError(null);
  };

  const handleCreateCustomer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = customerForm.name.trim();
    const contact = customerForm.contact.trim();

    if (!name || !customerForm.planId || !customerForm.dueDate || !contact) {
      setCustomerError('Preencha nome, plano, vencimento e contato.');
      return;
    }

    const newCustomer: Customer = {
      id: `customer_${Date.now()}`,
      name,
      planId: customerForm.planId,
      dueDate: customerForm.dueDate,
      contact,
      createdAt: new Date().toISOString(),
    };

    const nextCustomers = [newCustomer, ...customers];
    setCustomers(nextCustomers);
    saveRecords(CUSTOMERS_STORAGE_KEY, nextCustomers);

    setCustomerForm({ name: '', planId: '', dueDate: '', contact: '' });
    setCustomerError(null);
  };

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
                placeholder="admin@virtualizze.com"
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

      {mode === 'plans' ? (
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
                    <p className="muted">Criado em {new Date(plan.createdAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <p className="price">R$ {plan.price.toFixed(2)}</p>
                </div>
              ))}

              {plans.length === 0 ? <p className="muted">Nenhum plano cadastrado.</p> : null}
            </div>
          </article>
        </section>
      ) : (
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
                  value={customerForm.planId}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCustomerForm((current) => ({ ...current, planId: value }));
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
                  value={customerForm.dueDate}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setCustomerForm((current) => ({ ...current, dueDate: value }));
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
                const plan = plansById.get(customer.planId);

                return (
                  <div className="list-row list-row-column" key={customer.id}>
                    <p className="strong">{customer.name}</p>
                    <p className="muted">Plano: {plan?.name ?? 'Plano removido'}</p>
                    <p className="muted">Vencimento: {new Date(`${customer.dueDate}T00:00:00`).toLocaleDateString('pt-BR')}</p>
                    <p className="muted">Contato: {customer.contact}</p>
                  </div>
                );
              })}

              {customers.length === 0 ? <p className="muted">Nenhum cliente cadastrado.</p> : null}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
