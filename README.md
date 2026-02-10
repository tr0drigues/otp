# Sistema de Autenticação (TOTP + Passkeys) - Security by Design

Este projeto implementa um sistema de Autenticação Multi-Fator (MFA) moderno, suportando **TOTP** (RFC 6238) e **WebAuthn/Passkeys** (FIDO2).

**Destaques:**
- 🔒 **Security by Design**: Criptografia AES-256 em repouso, proteção contra replay, rate limiting.
- 🐳 **Docker Native**: Infraestrutura completa containerizada (App + Redis + Nginx).
- 🎨 **Premium UI**: Interface moderna com Dark Mode e Glassmorphism.

## 🏗️ Arquitetura de Referência

A solução roda totalmente em containers Docker, com um proxy reverso Nginx gerenciando a segurança de borda.

```mermaid
graph TD
    Client(["👤 User / Browser"]) 
    
    subgraph "Infrastructure (Docker Compose)"
        Nginx["🌐 Nginx Reverse Proxy\n(Port 80)"]
        
        subgraph "Application Layer"
            Node["🟢 Node.js (Fastify)\n(Internal: 3000)"]
        end
        
        subgraph "Persistence Layer"
            Redis[("🔴 Redis\n(Session / Secrets / Cache)")]
        end
    end

    Client -->|HTTP/HTTPS| Nginx
    Nginx -->|Proxy Pass| Node
    Node -->|Read/Write| Redis

    %% Logic Flow
    Node --> Auth["🛡️ Auth Service"]
    Node --> TOTP["🔢 TOTP Service"]
    Node --> WebAuthn["🔑 WebAuthn Service"]
```

## 🚀 Tecnologias

| Componente | Tecnologia | Função |
|------------|------------|--------|
| **Backend** | ![NodeJS](https://img.shields.io/badge/-Node.js-339933?style=flat&logo=node.js&logoColor=white) ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) | Lógica de negócios e API segura. |
| **Framework** | ![Fastify](https://img.shields.io/badge/-Fastify-000000?style=flat&logo=fastify&logoColor=white) | Servidor web de alta performance. |
| **Database** | ![Redis](https://img.shields.io/badge/-Redis-DC382D?style=flat&logo=redis&logoColor=white) | Sessões, Rate Limiting e Segredos (Encriptados). |
| **Infra** | ![Docker](https://img.shields.io/badge/-Docker-2496ED?style=flat&logo=docker&logoColor=white) ![Nginx](https://img.shields.io/badge/-Nginx-009639?style=flat&logo=nginx&logoColor=white) | Containerização e Proxy Reverso. |
| **Auth** | ![WebAuthn](https://img.shields.io/badge/-WebAuthn-orange?style=flat) | Autenticação Biométrica FIDO2. |

## 📦 Como Rodar

A aplicação foi desenhada para rodar via **Docker Compose**, o que garante que todas as variáveis de ambiente e configurações de rede (Nginx -> Node) funcionem corretamente.

### 1. Configure as Variáveis
Crie o arquivo `.env` na raiz:

```bash
cp .env.example .env
```

**Variáveis Importantes:**
- `WEBAUTHN_ORIGIN`: Deve ser `http://localhost` (sem porta, pois o Nginx roda na 80).
- `ENCRYPTION_KEY`: Chave HEX de 32 bytes para criptografar segredos no Redis.

### 2. Suba os Containers
```bash
docker-compose up -d --build
```

### 3. Acesse a Aplicação
Abra no navegador:
👉 **http://localhost**

- **Setup (2FA/Passkey)**: `http://localhost/setup`
- **Login**: `http://localhost/login.html`

> **Nota**: Não acesse via porta 3000. O acesso direto é bloqueado ou pode causar erros de CORS/WebAuthn. Use sempre a porta 80 (Nginx).

## 🛡️ Funcionalidades de Segurança

1.  **Criptografia em Repouso**: Segredos TOTP são encriptados com **AES-256-GCM** antes de ir para o Redis.
2.  **WebAuthn/Passkeys**: Suporte completo a login biométrico (TouchID/FaceID).
    - *Configuração relaxada de UV (User Verification) para maior compatibilidade.*
3.  **Proteção de Replay**: Bloqueio atômico de tokens OTP já utilizados.
4.  **Rate Limiting**:
    - Proteção por IP (DDoS).
    - Proteção por Usuário (Credential Stuffing).
5.  **Hardening HTTP**:
    - **Nginx**: Headers de segurança, mascaramento do backend.
    - **CSP**: Política restritiva contra XSS.

## 🧪 Desenvolvimento e Testes

Para rodar scripts de teste (e.g. testes de carga ou verificação de segurança), certifique-se de que eles apontem para `http://localhost` (Nginx).

```bash
# Exemplo: Teste de recuperação
npx tsx scripts/test-recovery.ts
```
