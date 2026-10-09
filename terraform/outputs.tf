output "app_url" {
  description = "URL of the application once Argo CD has synced it."
  value       = "http://localhost:${var.app_host_port}"
}

output "kubeconfig" {
  description = "Path to the kubeconfig of the kind cluster."
  value       = kind_cluster.this.kubeconfig_path
}

output "argocd_url" {
  description = "URL of the Argo CD UI (self-signed certificate). The user is admin."
  value       = "https://localhost:${var.argocd_host_port}"
}

output "argocd_admin_password" {
  description = "Initial password of the Argo CD admin user. Show it with `terraform output -raw argocd_admin_password`."
  value       = data.kubernetes_secret.argocd_admin.data["password"]
  sensitive   = true
}
