output "app_url" {
  description = "URL of the application once Argo CD has synced it."
  value       = "http://localhost:${var.app_host_port}"
}

output "kubeconfig" {
  description = "Path to the kubeconfig of the kind cluster."
  value       = kind_cluster.this.kubeconfig_path
}

output "argocd_ui" {
  description = "How to reach the Argo CD UI."
  value       = <<-EOT
    kubectl -n argocd port-forward svc/argocd-server 8443:443   # then open https://localhost:8443
    kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d   # user: admin
  EOT
}
