# Painel Administrativo separado

Este app e separado do frontend principal e do backend, focado na administracao do SaaS.

## Funcionalidades iniciais

- Login com Supabase Auth
- Cadastro de planos (nome e valor) em `public.admin_plans`
- Cadastro de clientes (nome, plano, vencimento e contato) em `public.admin_customers`
- Controle de acesso admin por `public.admin_users`

## Rodar localmente

1) Copie `.env.example` para `.env` e preencha as variaveis do Supabase.

```bash
cd admin-panel
npm install
npm run dev
```

Aplicacao abre por padrao em:

- `http://localhost:5174`

## Observacao

Para acessar o painel, seu usuario precisa existir em `public.admin_users`.
