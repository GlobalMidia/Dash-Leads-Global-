# Dashboard de Leads — Global Mídia

O funcionamento das telas, campos e integrações, junto ao histórico de mudanças,
está documentado em [`GUIA-DO-DASHBOARD.md`](GUIA-DO-DASHBOARD.md).

Painel comercial em página única para acompanhar leads, empresas, contatos,
origem, data de entrada e qualificação. O projeto foi preparado para Next.js 16, Vercel,
Postgres e RD Station Marketing.

## O que já está pronto

- visão geral com indicadores de leads, qualificados, fechados e pendentes;
- gráfico de entradas e distribuição por origem;
- busca e filtros por origem, status e período;
- tabela responsiva com empresa, e-mail, telefone, origem e data de entrada;
- cópia de e-mail e telefone com um clique, sem abrir aplicativos externos;
- origens padronizadas em Google Ads, Meta Ads, Orgânico e Recomendação;
- detalhes do lead em modal, com observações de até 280 caracteres;
- exportação CSV que respeita busca, período, origem e qualificação selecionados;
- qualificação em `Pendente`, `Atendido`, `Qualificado`, `Desqualificado` e
  `Fechado`;
- modo demonstração com dados totalmente fictícios;
- persistência em Postgres quando `DATABASE_URL` for configurada;
- importação da segmentação padrão de todos os contatos do RD Station;
- webhook do RD Station para novas conversões e oportunidades;
- importação CSV persistida no banco, com lote, arquivo de origem, dados extras
  e agrupamentos sem fusão;
- trilha de auditoria preparada para registrar alterações por usuário;
- migrações versionadas executadas automaticamente antes do build;
- acesso temporário por senha e cookie HTTP-only enquanto o login individual
  por e-mail está sendo conectado.

## Executar localmente

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Sem variáveis de ambiente, o painel abre em modo demonstração. Para validar o
projeto completo:

```bash
npm run check
```

## Banco de dados

1. Crie um Postgres (o Neon da Vercel Marketplace funciona sem servidor).
2. Preencha `DATABASE_URL`.
3. Execute `npm run db:migrate` ou deixe o `prebuild` aplicar as migrações da
   pasta [`database/migrations`](database/migrations).
4. Defina `DASHBOARD_PASSWORD` e gere `DASHBOARD_SESSION_SECRET` com pelo menos
   32 bytes aleatórios.

O painel bloqueia o acesso aos dados reais se a proteção não estiver
completamente configurada.

## Integração com RD Station

A leitura de contatos do RD Station Marketing usa **OAuth2**. Uma API Key
simples serve somente para enviar eventos de conversão e não permite ler a base
de leads.

Será necessário criar um aplicativo privado no App Publisher e obter:

- `RD_CLIENT_ID`
- `RD_CLIENT_SECRET`
- `RD_REFRESH_TOKEN`

Como alternativa temporária para teste, `RD_ACCESS_TOKEN` funciona por até 24
horas. Os tokens são usados somente no servidor.

Depois de configurar as variáveis, o botão **Sincronizar RD** importa os contatos
da segmentação padrão “Todos os contatos da base de Leads”, respeitando a
paginação oficial de até 125 itens por chamada.

Para novas entradas em tempo quase real, cadastre no RD Station os eventos
`WEBHOOK.CONVERTED` e `WEBHOOK.MARKED_OPPORTUNITY` apontando para:

```text
https://SEU-DOMINIO/api/rd/webhook?token=RD_WEBHOOK_SECRET
```

Referências oficiais:

- [Autenticação OAuth2](https://developers.rdstation.com/reference/autentica%C3%A7%C3%A3o?lng=pt-BR)
- [Renovação do access token](https://developers.rdstation.com/reference/atualizar-access-token)
- [Segmentações](https://developers.rdstation.com/reference/segmenta%C3%A7%C3%B5es)
- [Webhooks](https://developers.rdstation.com/reference/webhooks)

## Publicação na Vercel

O projeto não depende de configuração especial de build. Na Vercel:

1. importe o repositório;
2. conecte o banco Postgres;
3. adicione as variáveis da `.env.example`;
4. publique — as migrações pendentes são aplicadas no `prebuild`;
5. use o domínio publicado ao configurar o webhook no RD Station.

Nunca publique `.env.local`, tokens ou senhas no Git.
