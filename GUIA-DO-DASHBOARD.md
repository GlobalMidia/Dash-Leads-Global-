# Guia do Dashboard de Leads — Global Mídia

> Documento oficial de uso e evolução do sistema. Atualizado em 12/08/2026.

## Como manter este guia

Este arquivo deve ser atualizado sempre que uma função for adicionada, alterada
ou removida. Cada atualização precisa explicar:

- o que mudou;
- por que a mudança foi feita;
- qual é a função prática para quem utiliza o painel;
- se existe alguma limitação ou configuração externa necessária.

O histórico fica no final do documento. Credenciais, tokens, chaves de API e
senhas nunca devem ser registrados aqui.

## Objetivo do sistema

Centralizar leads, mídia paga, análises de acesso e acompanhamento de clientes.
Durante a transição, o RD Station continua sendo uma fonte de dados. A intenção
de longo prazo é que o dashboard seja a principal ferramenta de organização e
que o RD fique como apoio.

## Acesso e conta pessoal

- O acesso é destinado a e-mails corporativos autorizados.
- Cada pessoa utiliza a própria conta, permitindo identificar alterações no
  histórico.
- Tema, contraste e tamanho do texto são preferências individuais. Alterar a
  aparência de uma conta não modifica a experiência das demais.
- Os níveis específicos de leitura e edição por equipe ainda serão definidos.

## Navegação principal

### Painel de leads

É a visão comercial principal. Reúne indicadores, filtros, gráficos, tabela de
leads e os detalhes de cada registro.

### PME / Reativação

Diretório separado para bases de empresas que participaram do PME e podem ser
retrabalhadas. Os arquivos importados permanecem separados por lote e não são
misturados automaticamente aos leads comerciais do painel principal.

### Saúde das contas

Área de acompanhamento semanal dos clientes. Armazena responsáveis, situação
da conta, pendências, avaliações e histórico. Contas encerradas ficam separadas
e seguem a política de retenção definida no sistema.

### Meta Ads

Mostra contas de anúncio, campanhas e resultados da conexão corporativa da
Meta. A reconexão é feita nessa própria área quando a autorização estiver perto
de expirar.

### Google Ads

Mostra contas e campanhas acessíveis pelo MCC configurado, com filtros de
campanhas e resultados do período selecionado.

### Google Analytics 4

Lista as propriedades disponíveis e abre relatórios com usuários, sessões,
conversões, eventos, canais e evolução diária dentro do período escolhido.

### Rastreamento dos sites

O dashboard possui uma base própria para receber a jornada dos visitantes dos
sites da Global. Ela registra página acessada, origem, campanha, UTMs, `gclid`,
`fbclid`, tempo de permanência, profundidade de rolagem, cliques em chamadas,
clique no WhatsApp, interação com formulários e vídeos HTML.

Cada navegador recebe um identificador aleatório e cada visita recebe um
identificador de sessão. Quando a pessoa envia um formulário com e-mail ou
telefone, a jornada anterior daquele navegador é associada ao lead existente ou
gera um novo lead. Não é necessário ler a conversa pessoal do WhatsApp.

No popup do lead, a aba **Jornada** mostra os eventos em ordem, atribuição,
campanha, número de sessões e uma recomendação automática de temperatura. Essa
recomendação é apenas comportamental; a classificação final (frio, morno ou
quente) deve ser confirmada pela equipe depois do atendimento.

O coletor não armazena conteúdo digitado, texto de conversa, senha ou dados de
cartão. Dos formulários, usa somente os dados de contato necessários para
associar a jornada ao lead.

Para ativar a coleta em um site, o script `/global-site-tracker.js` do dashboard
deve ser instalado pelo Google Tag Manager ou diretamente no site. A variável
`SITE_TRACKING_ALLOWED_ORIGINS` limita quais domínios podem enviar eventos.

## Painel de leads

### Indicadores

- **Total de leads:** quantidade encontrada com os filtros atuais.
- **Qualificados:** leads classificados como qualificados.
- **Fechados:** oportunidades concluídas como venda.
- **Pendentes:** registros aguardando ação.

Os indicadores, gráficos e a exportação são recalculados conforme os filtros.

### Campos principais

- **Lead:** nome da pessoa ou identificação principal recebida da fonte.
- **Empresa:** empresa informada no cadastro ou na integração.
- **Contato:** e-mail e telefone disponíveis.
- **Origem:** canal identificado, como Meta Ads, Google Ads, Orgânico ou
  Recomendação.
- **Projeto/Unidade:** separação operacional do registro entre Global, PME,
  Outras campanhas ou Não identificado.
- **Data de entrada:** momento em que o lead entrou na origem registrada.
- **Qualificação:** situação comercial atual.

### Projeto/Unidade

Essa classificação começa manual para ajudar a organizar a base existente:

- **Global:** oportunidade relacionada à operação da Global Mídia;
- **PME:** oportunidade relacionada ao Programa Mundo Empresarial;
- **Outras campanhas:** registro pertencente a outra operação ou campanha;
- **Não identificado:** ainda precisa ser analisado.

Para alterar, abra o lead, selecione a opção em **Projeto/Unidade** e clique em
**Salvar detalhes**. A alteração é registrada no histórico. O filtro localizado
no topo do painel também limita indicadores, lista e exportação.

Essa classificação não move um lead para o diretório de planilhas do PME. Ela
apenas identifica a unidade à qual o lead comercial pertence.

### Qualificação

- **Pendente:** ainda aguarda atendimento ou decisão.
- **Atendido:** já recebeu alguma ação da equipe.
- **Qualificado:** possui aderência e deve continuar no processo comercial.
- **Desqualificado:** não deve continuar como oportunidade ativa.
- **Fechado:** resultou em venda ou fechamento confirmado.

### Detalhes e histórico

Ao clicar no nome do lead, o popup apresenta contatos, origem, projeto/unidade,
dados do CRM, procedência, link profissional, observações e registros agrupados.
Quando o lead veio do RD, informações complementares podem ser consultadas ao
abrir o perfil.

A aba **Histórico** informa quem alterou o registro, o que foi alterado e quando.

### Origem e procedência

Origem é o canal comercial atribuído ao lead. Procedência indica de qual sistema
ou arquivo o registro veio, por exemplo RD Station, Meta Lead Ads ou CSV. São
informações diferentes e ambas devem ser preservadas.

### Contatos agrupados

Registros que parecem pertencer à mesma empresa podem ser agrupados para
consulta. O agrupamento não funde nem apaga informações: cada lead continua
independente e mantém sua procedência.

### Importação e exportação

- O painel principal importa arquivos CSV.
- Colunas extras são preservadas como dados adicionais quando possível.
- A exportação respeita busca, origem, projeto/unidade, qualificação e período.
- Fórmulas potencialmente perigosas são neutralizadas no CSV exportado.

## PME / Reativação

- Aceita CSV, XLS, XLSX e ODS.
- Cada arquivo vira um lote separado, com data e responsável pela importação.
- As planilhas podem ser reordenadas e pesquisadas.
- É possível abrir o lote, consultar empresas agrupadas e visualizar cada linha
  original com a aba e posição de origem.
- Excluir uma planilha remove também os registros pertencentes àquele lote.
- Linhas preenchidas devem ser preservadas; linhas totalmente vazias usadas
  apenas como formatação não são registros.

## Saúde das contas

- Cada conta possui CNPJ, perfil profissional, núcleo, Head e direção.
- Informações operacionais podem ser editadas; CNPJ e link profissional seguem
  as regras específicas da tela.
- Revisões semanais, pendências e alterações ficam no histórico.
- Contas vermelhas representam prioridade e geram destaque de urgência.
- O aviso semanal desaparece depois que a revisão correspondente é concluída.
- A distribuição individual por social media ainda será configurada quando os
  responsáveis e as permissões forem confirmados.

## Integrações

### RD Station

Fornece a base histórica de contatos e dados comerciais disponíveis no CRM.
Novos registros podem chegar por sincronização e recebimento automático. Nem
todo contato possui telefone, empresa, origem ou oportunidade preenchidos no RD.

### Meta Ads

Fornece desempenho de contas e campanhas. Formulários de Lead Ads podem criar
leads automaticamente quando o aplicativo, as permissões e o webhook estão
ativos.

### Google Ads

Fornece contas, campanhas e métricas acessíveis pelo usuário e pelo MCC
configurado. Contas sem permissão não devem ser tratadas como dados válidos.

### Google Analytics 4

Fornece comportamento agregado dos sites e canais. O relatório do GA4 não
substitui o cadastro de lead; ele ajuda a entender aquisição e navegação.

## O que ainda está planejado

- conectar os sites da Global, PME e outras operações ao dashboard;
- registrar UTMs, página, domínio, campanha, anúncio, `gclid` e `fbclid`;
- registrar a jornada até formulário e clique no WhatsApp;
- organizar contatos vindos diretamente de vendedores;
- definir acessos específicos para mídia, social media, Heads e direção;
- criar avisos semanais individuais conforme a carteira de clientes;
- relacionar investimento de mídia aos leads qualificados e fechados.

Até essas funções serem implementadas, elas não devem ser apresentadas como
recursos já disponíveis.

## Histórico de mudanças

### 12/08/2026 — Jornada do site e classificação comportamental

- **Adicionado:** endpoint público e protegido por origem para receber eventos
  dos sites.
- **Adicionado:** identificação anônima de navegador e sessão, captura de
  atribuição e eventos de navegação, formulário, WhatsApp e vídeo.
- **Adicionado:** associação da jornada ao lead por e-mail ou telefone e criação
  do registro quando o formulário é enviado.
- **Adicionado:** aba Jornada no popup, recomendação automática de temperatura,
  classificação comercial final editável e histórico da alteração.
- **Motivo:** identificar quais canais e comportamentos trazem oportunidades com
  maior intenção e preparar a substituição gradual do RD Station.
- **Limitação:** a coleta só começa depois que o script for publicado no site;
  históricos anteriores não podem ser reconstruídos.

### 11/08/2026 — Projeto/Unidade e documentação permanente

- **Adicionado:** classificação Global, PME, Outras campanhas e Não identificado
  no popup do lead.
- **Adicionado:** filtro por Projeto/Unidade, também aplicado à exportação CSV.
- **Adicionado:** registro da classificação no histórico de alterações.
- **Motivo:** iniciar a separação das operações sem depender das futuras
  integrações com os sites.
- **Função:** organizar manualmente a base atual e preparar o campo para
  preenchimento automático no futuro.
- **Corrigido:** o link profissional da empresa agora pode ser salvo mesmo
  quando for a única informação alterada no popup.
- **Adicionado:** este guia permanente para evitar perda de contexto sobre o
  funcionamento e a evolução do sistema.
