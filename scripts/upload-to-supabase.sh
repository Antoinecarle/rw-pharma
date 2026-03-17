#!/bin/bash
set -euo pipefail

SUPABASE_URL="https://ahpqewiamnulbhboynbv.supabase.co"
ANON_KEY=$(curl -s https://web-production-ecb62.up.railway.app/assets/index-oghf1TaC.js 2>/dev/null | grep -oP 'eyJ[A-Za-z0-9_.-]{100,}' | head -1)

# Authenticate as Julie
AUTH_RESP=$(curl -s "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"julie@rwpharma.com","password":"Test1234!"}')

ACCESS_TOKEN=$(echo "$AUTH_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

BUCKET="example-files"
API="${SUPABASE_URL}/storage/v1/object/${BUCKET}"

upload() {
  local local_path="$1"
  local remote_path="$2"
  echo -n "  ${remote_path} ... "
  # Try POST first (create), then PUT (update) if 409 conflict
  HTTP_CODE=$(curl -s -o /tmp/upload_resp.txt -w "%{http_code}" \
    -X POST "${API}/${remote_path}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: text/csv" \
    --data-binary "@${local_path}")

  if [ "$HTTP_CODE" = "200" ]; then
    echo "OK (created)"
  elif [ "$HTTP_CODE" = "409" ] || [ "$HTTP_CODE" = "400" ]; then
    # File exists, update it
    HTTP_CODE2=$(curl -s -o /tmp/upload_resp.txt -w "%{http_code}" \
      -X PUT "${API}/${remote_path}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "apikey: ${ANON_KEY}" \
      -H "Content-Type: text/csv" \
      --data-binary "@${local_path}")
    echo "OK (updated, $HTTP_CODE2)"
  else
    echo "FAILED ($HTTP_CODE)"
    cat /tmp/upload_resp.txt
    echo ""
  fi
}

cd /root/rw-pharma

echo "=== Quotas Avril 2027 ==="
upload data/test-imports/avril_2027_quotas.csv "quotas/avril2027/quotas_avril_2027.csv"

echo ""
echo "=== Commandes Avril 2027 (par client) ==="
upload data/examples/commandes_ori_avril_2027.csv "commandes/avril2027/commandes_ori_avril_2027.csv"
upload data/examples/commandes_mpa_avril_2027.csv "commandes/avril2027/commandes_mpa_avril_2027.csv"
upload data/examples/commandes_axi_avril_2027.csv "commandes/avril2027/commandes_axi_avril_2027.csv"
upload data/examples/commandes_cc_avril_2027.csv "commandes/avril2027/commandes_cc_avril_2027.csv"
upload data/examples/commandes_medcor_avril_2027.csv "commandes/avril2027/commandes_medcor_avril_2027.csv"
upload data/examples/commandes_brocacef_avril_2027.csv "commandes/avril2027/commandes_brocacef_avril_2027.csv"
upload data/examples/commandes_aba_avril_2027.csv "commandes/avril2027/commandes_aba_avril_2027.csv"

echo ""
echo "=== Stock Avril 2027 (par grossiste) ==="
upload data/examples/stock_epsilon_avril_2027.csv "stock/avril2027/stock_epsilon_avril_2027.csv"
upload data/examples/stock_ginkgo_avril_2027.csv "stock/avril2027/stock_ginkgo_avril_2027.csv"
upload data/examples/stock_sna_avril_2027.csv "stock/avril2027/stock_sna_avril_2027.csv"
upload data/examples/stock_so_avril_2027.csv "stock/avril2027/stock_so_avril_2027.csv"
upload data/examples/stock_ocp_avril_2027.csv "stock/avril2027/stock_ocp_avril_2027.csv"
upload data/test-imports/avril_2027_stock.csv "stock/avril2027/stock_collecte_avril_2027.csv"

echo ""
echo "=== Done ==="
