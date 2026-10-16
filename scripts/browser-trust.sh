#!/usr/bin/env bash
# Confia somente no certificado de proxy já fornecido pelo ambiente.
# Não desativa validação TLS e não baixa certificados de terceiros.
set -euo pipefail
if [ -n "${NODE_EXTRA_CA_CERTS:-}" ] && [ -r "$NODE_EXTRA_CA_CERTS" ] && command -v certutil >/dev/null; then
  cota_nss_dir="$HOME/.pki/nssdb"
  cota_fingerprint="$(openssl x509 -in "$NODE_EXTRA_CA_CERTS" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d :)"
  cota_nickname="Cota proxy CA ${cota_fingerprint:0:16}"
  mkdir -p "$cota_nss_dir"
  if [ ! -f "$cota_nss_dir/cert9.db" ]; then
    certutil -N -d "sql:$cota_nss_dir" --empty-password
  fi
  if ! certutil -L -d "sql:$cota_nss_dir" -n "$cota_nickname" >/dev/null 2>&1; then
    certutil -A -d "sql:$cota_nss_dir" -n "$cota_nickname" -t 'C,,' -i "$NODE_EXTRA_CA_CERTS"
  fi
fi
