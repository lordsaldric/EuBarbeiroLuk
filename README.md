# Eu Barbeiro Luk

Site estático em HTML, CSS e JavaScript com sistema completo de agendamentos no Supabase e painel administrativo protegido.

## Estrutura

- `index.html`: site público e fluxo de agendamento
- `admin/login.html`: login dos donos
- `admin/primeiro-acesso.html`: criação de senha para e-mails autorizados
- `admin/index.html`: painel administrativo
- `scripts/config.js`: conexão pública e segura com o Supabase
- `supabase/migrations`: estrutura completa e versionada do banco
- `imagens` e `videos`: materiais visuais do site
- `vercel.json`: configuração de publicação e cabeçalhos de segurança

## Recursos disponíveis

- Agendamento sem conta para o cliente
- Escolha de serviço, barbeiro, data e horário livre
- Status pendente, aceito, negado e concluído
- Bloqueio atômico de horários duplicados
- Login administrativo com e-mail e senha
- Lista completa de agendamentos e filtros
- Agenda diária por barbeiro
- Cadastro, edição, remoção e desativação de barbeiros
- Configuração de dias, turnos e intervalo entre horários
- Bloqueios pontuais de horários
- Layout responsivo com identidade Liquid Glass

## Publicação na Vercel

1. Envie todo o conteúdo desta pasta para a raiz de um repositório no GitHub.
2. Na Vercel, clique em **Add New Project**.
3. Importe o repositório.
4. Em **Framework Preset**, escolha **Other**.
5. Deixe **Build Command** e **Output Directory** vazios.
6. Clique em **Deploy**.

O endereço do painel será `https://seu-dominio.com/admin/login`.

## Backend

O pacote já está conectado ao projeto Supabase `Piloto`. A chave presente em `scripts/config.js` é publicável e foi criada para uso seguro no navegador. Dados privados e ações administrativas continuam protegidos pelas políticas do banco.

As migrações permanecem no repositório para histórico, auditoria e recuperação. Não execute novamente essas migrações no projeto `Piloto`, pois elas já foram aplicadas.

## Primeiro acesso dos donos

Antes de criar uma senha, o e-mail do dono precisa ser autorizado no banco. Depois disso:

1. Acesse `/admin/primeiro-acesso`.
2. Digite o e-mail autorizado e crie uma senha com pelo menos oito caracteres.
3. Se a confirmação de e-mail estiver ativa no Supabase, confirme a mensagem recebida.
4. Entre em `/admin/login`.

Não compartilhe senhas nem inclua chaves secretas no repositório.
