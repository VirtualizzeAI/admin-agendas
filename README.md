# Painel Administrativo separado

Este app e separado do frontend principal e do backend, focado na administracao do SaaS.

## Funcionalidades iniciais

- Login simples
- Cadastro de planos (nome e valor)
- Cadastro de clientes (nome, plano, vencimento e contato)
- Persistencia local com localStorage

## Credenciais de acesso (inicial)

- E-mail: `admin@virtualizze.com`
- Senha: `admin123`

## Rodar localmente

```bash
cd admin-panel
npm install
npm run dev
```

Aplicacao abre por padrao em:

- `http://localhost:5174`

## Observacao

Este painel esta preparado para evoluir para autenticacao real + API backend.
