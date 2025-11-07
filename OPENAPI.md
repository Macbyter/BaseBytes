# BaseBytes API - OpenAPI 3.0

```yaml
openapi: 3.0.0
info:
  title: BaseBytes API
  version: 1.0.0
  description: Ethical data rental on Base

servers:
  - url: http://localhost:3000

paths:
  /ai/catalog:
    get:
      summary: Get SKU catalog
      responses:
        '200':
          description: List of available SKUs
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Sku'

  /ai/stream/{skuId}:
    get:
      summary: Stream data for a SKU
      parameters:
        - name: skuId
          in: path
          required: true
          schema:
            type: string
      security:
        - evmTx: []
      responses:
        '200':
          description: NDJSON stream of data
          content:
            application/x-ndjson:
              schema:
                type: string
        '402':
          description: Payment required
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PaymentRequired'

  /ai/receipt/{id}:
    get:
      summary: Get receipt by ID
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Receipt details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Receipt'
        '404':
          description: Receipt not found

  /proofs/{id}:
    get:
      summary: Get Merkle proof for a receipt
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Merkle inclusion proof
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MerkleProof'
        '404':
          description: Proof not found

components:
  securitySchemes:
    evmTx:
      type: apiKey
      in: header
      name: Authorization
      description: EVM transaction hash (e.g., "evm-tx 0x...")

  schemas:
    Sku:
      type: object
      properties:
        sku_id: { type: string }
        title: { type: string }
        price_usd6: { type: integer }

    PaymentRequired:
      type: object
      properties:
        error: { type: string }
        payment_terms: { $ref: '#/components/schemas/PaymentTerms' }

    PaymentTerms:
      type: object
      properties:
        scheme: { type: string, example: "evm" }
        network: { type: string, example: "base-sepolia" }
        asset: { type: string, example: "usdc" }
        payTo: { type: string, example: "0xF0a998d1cA93def52e2eA9929a20fEe8a644551c" }
        amount: { type: string, example: "200000" }
        memo: { type: string, example: "defi:preTradeRisk" }

    Receipt:
      type: object
      properties:
        receipt_id: { type: string }
        buyer: { type: string }
        seller: { type: string }
        attestation: { $ref: '#/components/schemas/Attestation' }

    Attestation:
      type: object
      properties:
        uid: { type: string }
        schema_uid: { type: string }
        attested_at: { type: string, format: date-time }
        tx_hash: { type: string }

    MerkleProof:
      type: object
      properties:
        receipt_id: { type: string }
        anchor: { $ref: '#/components/schemas/Anchor' }
        proof: { $ref: '#/components/schemas/Proof' }

    Anchor:
      type: object
      properties:
        merkle_root: { type: string }
        date: { type: string, format: date }

    Proof:
      type: object
      properties:
        leaf_hash: { type: string }
        siblings: { type: array, items: { type: string } }
        verified: { type: boolean }
```
