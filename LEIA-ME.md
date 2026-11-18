# Oftalmo Update: passo a passo pelo celular

**Dica importante:** no navegador, peça a **versão para computador** do GitHub.
- Safari: toque em **aA** e depois em **Solicitar site para computador**.
- Chrome: toque em **⋮** e marque **Site para computador**.

1. **Descompactar:** abra o zip no app **Arquivos** (iPhone) ou **Files** (Android). Ele cria uma pasta.
2. **Repositório:** no github.com, crie uma conta e depois um **New repository**. Nome: `oftalmo-update`, marque **Public** e toque em **Create**.
3. **Subir os arquivos:** toque em **Add file › Upload files**, selecione **todos os arquivos da pasta, menos o CHAVES-SECRETAS.txt**, e toque em **Commit changes**.
4. **Ligar o site:** vá em **Settings › Pages** e, em *Source*, escolha **GitHub Actions**.
5. **Chaves:** vá em **Settings › Secrets and variables › Actions › New repository secret** e crie `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`, com os valores do CHAVES-SECRETAS.txt.
6. **Ligar o robô:** abra o arquivo **workflow.yml** no repositório e toque no **lápis** (editar). No nome do arquivo, apague tudo e digite `.github/workflows/noticias.yml`. Toque em **Commit changes**.
7. **Esperar:** na aba **Actions**, aguarde ficar verde (uns 2 minutos). O app vai estar em **https://SEU-USUARIO.github.io/oftalmo-update/**
8. **Instalar:** iPhone: Safari › Compartilhar › Adicionar à Tela de Início. Android: Chrome › ⋮ › Instalar app.
9. **Avisos:** abra pelo ícone, vá na aba **Ao vivo**, toque em **Ativar avisos** e **Permitir**, e depois em **Copiar código**. No GitHub, crie o segredo `PUSH_SUBSCRIPTION` e cole o código.
10. **Teste:** vá em **Actions › Buscar notícias e publicar app › Run workflow**, marque *teste* e toque em **Run**.
