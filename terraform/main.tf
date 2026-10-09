# --- Cluster ---------------------------------------------------------------

resource "kind_cluster" "this" {
  name            = var.cluster_name
  wait_for_ready  = true
  kubeconfig_path = "${path.module}/${var.cluster_name}-config"

  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    node {
      role = "control-plane"

      # Exposes the application's NodePort Service on localhost.
      extra_port_mappings {
        container_port = var.app_node_port
        host_port      = var.app_host_port
      }

      # Exposes the Argo CD UI on localhost.
      extra_port_mappings {
        container_port = var.argocd_node_port
        host_port      = var.argocd_host_port
      }
    }
  }
}

# --- Application prerequisites ---------------------------------------------

# The database credentials are generated here rather than committed to the
# repository. The manifests in k8s/ only reference the Secret by name.
resource "kubernetes_namespace_v1" "app" {
  metadata {
    name = var.app_namespace
  }
}

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "kubernetes_secret_v1" "postgres" {
  metadata {
    name      = "postgres-credentials"
    namespace = kubernetes_namespace_v1.app.metadata[0].name
  }

  data = {
    database = "todos"
    username = "todos"
    password = random_password.postgres.result
  }
}

# --- Argo CD ---------------------------------------------------------------

resource "helm_release" "argocd" {
  name             = "argocd"
  namespace        = "argocd"
  create_namespace = true
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = var.argocd_chart_version
  timeout          = 600

  # The UI is served through a NodePort that the kind cluster above maps to
  # localhost, so no port-forward is needed.
  values = [yamlencode({
    server = {
      service = {
        type          = "NodePort"
        nodePortHttps = var.argocd_node_port
        # The chart's default HTTP NodePort is 30080, which belongs to the
        # application. Only HTTPS is mapped, so let Kubernetes pick this one.
        nodePortHttp = null
      }
    }
  })]
}

# The admin password Argo CD generates on first install, so that logging in
# to the UI only takes `terraform output`.
data "kubernetes_secret_v1" "argocd_admin" {
  metadata {
    name      = "argocd-initial-admin-secret"
    namespace = helm_release.argocd.namespace
  }
}

# Registers the application with Argo CD, which from then on keeps the
# cluster in sync with the manifests in k8s/.
resource "helm_release" "argocd_apps" {
  name       = "argocd-apps"
  namespace  = helm_release.argocd.namespace
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argocd-apps"
  version    = var.argocd_apps_chart_version

  values = [yamlencode({
    applications = {
      duly-noted = {
        namespace  = helm_release.argocd.namespace
        project    = "default"
        finalizers = ["resources-finalizer.argocd.argoproj.io"]
        source = {
          repoURL        = var.repo_url
          targetRevision = var.repo_revision
          path           = "k8s"
        }
        destination = {
          server    = "https://kubernetes.default.svc"
          namespace = kubernetes_namespace_v1.app.metadata[0].name
        }
        syncPolicy = {
          automated = {
            prune    = true
            selfHeal = true
          }
        }
      }
    }
  })]

  depends_on = [kubernetes_secret_v1.postgres]
}
