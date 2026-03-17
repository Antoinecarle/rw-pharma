#!/bin/bash
# Upload example files to Supabase Storage bucket "example-files"
# Usage: SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx bash scripts/upload-example-files.sh

set -euo pipefail

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
  echo "Error: Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables"
  echo "Example: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... bash $0"
  exit 1
fi

BUCKET="example-files"
API="${SUPABASE_URL}/storage/v1/object/${BUCKET}"
AUTH="Authorization: Bearer ${SUPABASE_SERVICE_KEY}"

upload() {
  local local_path="$1"
  local remote_path="$2"
  echo "  Uploading ${remote_path}..."
  curl -s -X POST "${API}/${remote_path}" \
    -H "$AUTH" \
    -H "Content-Type: text/csv" \
    --data-binary "@${local_path}" \
    -o /dev/null -w "  -> HTTP %{http_code}\n" || \
  curl -s -X PUT "${API}/${remote_path}" \
    -H "$AUTH" \
    -H "Content-Type: text/csv" \
    --data-binary "@${local_path}" \
    -o /dev/null -w "  -> HTTP %{http_code} (update)\n"
}

echo "=== Uploading Avril 2027 Quotas ==="
upload data/test-imports/avril_2027_quotas.csv "quotas/avril2027/quotas_avril_2027.csv"

echo ""
echo "=== Uploading Avril 2027 Orders (per customer) ==="
upload data/examples/commandes_ori_avril_2027.csv "commandes/avril2027/commandes_ori_avril_2027.csv"
upload data/examples/commandes_mpa_avril_2027.csv "commandes/avril2027/commandes_mpa_avril_2027.csv"
upload data/examples/commandes_axi_avril_2027.csv "commandes/avril2027/commandes_axi_avril_2027.csv"
upload data/examples/commandes_cc_avril_2027.csv "commandes/avril2027/commandes_cc_avril_2027.csv"
upload data/examples/commandes_medcor_avril_2027.csv "commandes/avril2027/commandes_medcor_avril_2027.csv"
upload data/examples/commandes_brocacef_avril_2027.csv "commandes/avril2027/commandes_brocacef_avril_2027.csv"
upload data/examples/commandes_aba_avril_2027.csv "commandes/avril2027/commandes_aba_avril_2027.csv"

echo ""
echo "=== Uploading Avril 2027 Stock (per wholesaler) ==="
upload data/examples/stock_epsilon_avril_2027.csv "stock/avril2027/stock_epsilon_avril_2027.csv"
upload data/examples/stock_ginkgo_avril_2027.csv "stock/avril2027/stock_ginkgo_avril_2027.csv"
upload data/examples/stock_sna_avril_2027.csv "stock/avril2027/stock_sna_avril_2027.csv"
upload data/examples/stock_so_avril_2027.csv "stock/avril2027/stock_so_avril_2027.csv"
upload data/examples/stock_ocp_avril_2027.csv "stock/avril2027/stock_ocp_avril_2027.csv"
upload data/test-imports/avril_2027_stock.csv "stock/avril2027/stock_collecte_avril_2027.csv"

echo ""
echo "=== Done! ==="
