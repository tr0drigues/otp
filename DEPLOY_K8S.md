# Guia de Deploy no Kubernetes (K8s)

Este guia descreve como implantar o PassOTP em um cluster Kubernetes.

## Pré-requisitos

1.  Um cluster Kubernetes rodando.
2.  `kubectl` configurado localmente.
3.  Um Ingress Controller instalado (ex: Nginx Ingress Controller).
4.  Docker Registry (Docker Hub, AWS ECR, etc.) para hospedar a imagem da aplicação.

## Passos para Deploy

### 1. Construir e Publicar a Imagem Docker

Você precisa buildar a imagem da aplicação e subir para um registry acessível pelo seu cluster.

### 2. Build da Imagem

A estratégia de build depende de onde seu Kubernetes está rodando.

#### Opção A: Docker Desktop / Minikube (Local)
Se você está rodando o Kubernetes localmente (com Docker Desktop), **não precisa dar push** para o Docker Hub. O Kubernetes consegue enxergar as imagens que você builda localmente.

```bash
# Build local apenas
docker build -t passotp:latest .
```

*Nota: O arquivo `k8s/app.yaml` já está configurado com `imagePullPolicy: IfNotPresent`, o que instrui o K8s a usar a imagem local se ela existir.*

#### Opção B: Cluster Remoto (AWS, DigitalOcean, GKE, etc.)
Se você vai fazer deploy em um servidor remoto, o cluster **não tem acesso** ao seu computador. Você precisa subir a imagem para um registro (Docker Hub, GHCR, etc.).

1.  Crie um repositório no Docker Hub (ex: `seu-usuario/passotp`).
2.  Faça o build e push:
    ```bash
    # Login no Docker Hub
    docker login

    # Build e Push
    docker build -t seu-usuario/passotp:latest .
    docker push seu-usuario/passotp:latest
    ```
3.  **Importante**: Edite o arquivo `k8s/app.yaml` e altere a linha `image: passotp:latest` para `image: seu-usuario/passotp:latest`.

### 3. Configurar Segredos e Variáveis

Edite o arquivo `k8s/secret.yaml` e coloque seus segredos codificados em Base64.

```bash
# Gerar Base64
echo -n "sua-senha-super-secreta" | base64
```

Edite o arquivo `k8s/configmap.yaml` com as configurações do seu ambiente (domínio, etc.).

### 3. Aplicar os Manifestos

Execute os comandos abaixo na ordem:

```bash
# Cria ConfigMap e Secrets
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml

# Cria o Redis
kubectl apply -f k8s/redis.yaml

# Cria a Aplicação
kubectl apply -f k8s/app.yaml

# Cria o Ingress (Expõe para a internet)
kubectl apply -f k8s/ingress.yaml
```

### 4. Verificar o Deploy

```bash
# Verificar Pods
kubectl get pods

# Verificar Logs da App
kubectl logs -l app=passotp-app

# Verificar Ingress
kubectl get ingress
```

## Notas sobre Produção

-   **Redis**: O manifesto `redis.yaml` agora usa um **PersistentVolumeClaim (PVC)** de 1Gi para garantir que os dados (usuários, sessões) sobrevivam a reboots do pod.
-   **SSL/TLS**: O Ingress está configurado esperando um secret TLS (`passotp-tls`). Recomenda-se usar o `cert-manager` para automatizar certificados Let's Encrypt.
