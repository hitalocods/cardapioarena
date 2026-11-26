# Cardápio QR Code — Arena Home Beach

Sistema independente de pedidos por QR Code para mesas da **Arena Home Beach** em Next.js (App Router), TypeScript, Prisma + Neon, Tailwind v4, shadcn/ui, Vercel Blob e Web Push.

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

- `DATABASE_URL`: URL do Neon Postgres com `-pooler`
- `NEXT_PUBLIC_SITE_URL`: URL base pública usada para gerar os QR Codes das mesas (ex.: `https://cardapio.arenahomebeach.com.br` ou `http://localhost:3000` em desenvolvimento)
- `ADMIN_PASSWORD`: senha de acesso ao painel `/admin`
- `SESSION_SECRET`: segredo aleatório (mínimo 16 caracteres, recomendado 32+) para assinar cookies HMAC
- `BLOB_READ_WRITE_TOKEN`: token do Vercel Blob para upload de fotos de produtos
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: chave pública VAPID para notificações push no `/admin`
- `VAPID_PRIVATE_KEY`: chave privada VAPID
- `VAPID_SUBJECT`: e-mail/URL de contato VAPID (`mailto:...`)

## Como rodar localmente

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```

- Cardápio por mesa: `/mesa/1` (mesas 1 a 10 criadas no seed manual)
- Cardápio somente visualização: `/`
- Painel administrativo: `/admin`

## Testes de concorrência

Com o servidor rodando e `DATABASE_URL` configurada no `.env`:

```bash
npm run test:concurrency
```
