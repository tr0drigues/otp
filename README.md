
# Sistema de Autenticação TOTP (RFC 6238) - Security by Design

Este projeto implementa um sistema robusto de Autenticação de Dois Fatores (2FA) utilizando o algoritmo **TOTP** (Time-Based One-Time Password), seguindo rigorosamente as especificações das RFCs 4226 e 6238.

Desenvolvido com foco em segurança ("Security by Design"), performance e melhor experiência do desenvolvedor/usuário.

## 🚀 Tecnologias

*   **Node.js (v20+) & TypeScript**: Backend performático e tipado.
*   **Fastify**: Framework web de alta performance.
*   **Redis (via Docker)**: Armazenamento de estado volátil, controle de *Rate Limiting* e prevenção de *Replay Attacks*.
*   **Playwright**: Suite de testes automatizados de segurança.
*   **Frontend**: Interface moderna com Glassmorphism e animações (HTML/CSS/JS puro).

## 🛡️ Funcionalidades de Segurança

1.  **Algoritmo TOTP Padrão**: Compatível com Google Authenticator, Authy, Microsoft Authenticator, etc.
2.  **Rate Limiting**: Proteção contra ataques de força bruta (limite de 5 tentativas a cada 5 minutos por usuário/IP).
3.  **Replay Protection**: Impede que um código válido seja utilizado mais de uma vez (idempotência).
4.  **NoSQL Injection Safe**: Sanitização e tratamento adequado de chaves no Redis.
5.  **Recovery Codes**: Códigos de backup criptografados (bcrypt) para recuperação de conta.
6.  **Security Obsevability**: Logs estruturados (JSON) com eventos de segurança (SIEM-ready).
7.  **Context Awareness**: Monitoramento de IP e User-Agent para detecção de logins suspeitos.

## 📦 Como Rodar

### Pré-requisitos

*   Docker e Docker Compose
*   Node.js (v20 ou superior)

### Passo a Passo

1.  **Clone o repositório**
    ```bash
    git clone <seu-repositorio>
    cd otp-system
    ```

2.  **Suba a infraestrutura (Redis)**
    ```bash
    docker-compose up -d
    ```

3.  **Instale as dependências**
    ```bash
    npm install
    ```

4.  **Inicie o servidor de desenvolvimento**
    ```bash
    npm run dev
    ```

5.  **Acesse a aplicação**
    Abra `http://localhost:3000` no seu navegador.

## 🧪 Como Testar

### Fluxo de Usuário
1.  Acesse a página inicial para configurar o 2FA.
2.  Digite seu e-mail e clique em "Enable 2FA".
3.  Escaneie o QR Code com seu aplicativo autenticador.
4.  Para validar o login recorrente, clique em "Log in here" no rodapé ou acesse `/login.html`.

### Testes de Segurança Avançados
Além da auditoria básica, você pode validar o fluxo de recuperação:
```bash
npx tsx scripts/test-recovery.ts
```
Isso testará: Geração de 10 códigos -> Setup -> Login com código -> Bloqueio de reutilização.

Para rodar a auditoria:
```bash
# Instale os navegadores do Playwright (apenas na primeira vez)
npx playwright install chromium

# Execute o script de auditoria
npx tsx scripts/security-audit.ts
```

Este script irá verificar:
- ✅ Se o Rate Limit bloqueia tentativas excessivas.
- ✅ Se códigos duplicados (Replay Attack) são rejeitados.
- ✅ Se o sistema resiste a injeção de inputs maliciosos.

### Dashboard de Validação (Developer Mode)
Ao realizar o login com sucesso no ambiente de desenvolvimento, você será redirecionado para `dashboard.html`.
Esta página exibe os metadados da sessão (Usuário, Método usado, IP) para confirmar se a autenticação ocorreu via **TOTP App** ou **Recovery Code**.

> **⚠️ Para Produção**:
> Edite o arquivo `public/login.html` (linha ~360) e altere o redirecionamento:
> ```javascript
> // De:
> window.location.href = '/dashboard.html';
> // Para:
> window.location.href = '/app'; // Sua rota real
> ```
> E remova o arquivo `public/dashboard.html`.

## 📚 API Endpoints

### `POST /setup`
Inicia o processo de vínculo 2FA.
- **Body**: `{ "user": "email@exemplo.com" }`
- **Retorno**: `{ "secret": "...", "qrCode": "data:image/..." }`
- **Ação**: Gera um segredo único e o salva no Redis associado ao usuário.

### `POST /login`
Valida um token para login.
- **Body**: `{ "user": "email@exemplo.com", "token": "123456" }`
- **Retorno**: `{ "success": true, "message": "Login realizado..." }`
- **Segurança**: Verifica o token contra o segredo salvo, aplica Rate Limit e checa Replay. Aceita também códigos de recuperação (formato XXXX-XXXX).

### `POST /login/recovery` (Implícito no /login)
O endpoint de login detecta automaticamente se o token é um código de recuperação. Se for, valida o hash e invalida o código.

## 📊 Logs de Auditoria

Os logs são gerados em formato JSON no stdout, ideais para ingestão em Datadog, Elastic ou Splunk.
Exemplo:
```json
{
  "timestamp": "2024-02-10T03:00:00.000Z",
  "level": "warn",
  "event": "RATE_LIMIT",
  "message": "Rate limit exceeded",
  "user": "attacker@evil.com",
  "ip": "1.2.3.4"
}
```

## ⚠️ Notas de Produção

Este projeto é uma implementação de referência. Para uso em produção, considere:
1.  **HTTPS**: Obrigatório para proteger o tráfego de segredos.
2.  **Variáveis de Ambiente**: Mova configurações sensíveis (host do Redis, portas) para um arquivo `.env` (exemplo não incluído por segurança).
3.  **Redis Password**: Configure uma senha forte no `docker-compose.yml` e no cliente Redis.

---

Desenvolvido como demonstração de **Security by Design** e **Frontend Aesthetics**.
