/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// GENERATED — do not edit. The Agentic Commerce Protocol 2026-04-17, its checkout
// types: json-schema-to-typescript 15.0.4 over
// agentic-commerce-protocol/agentic-commerce-protocol spec/2026-04-17/json-schema/
// schema.agentic_checkout.json (Apache 2.0). Regenerate with
// scripts/codegen/generate_agentic_commerce.sh.

export const AGENTIC_COMMERCE_VERSION = '2026-04-17';

/**
 * Optional affiliate attribution data for crediting third-party publishers. Write-only: not returned in responses. Forward compatibility: Servers SHOULD ignore unknown fields to support future extensions (per RFC §8.2).
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "AffiliateAttribution".
 */
export type AffiliateAttribution = AffiliateAttribution1 & {
  /**
   * Identifier for the attribution provider / affiliate network namespace (e.g., 'impact.com').
   */
  provider: string;
  /**
   * Opaque provider-issued token for fraud-resistant validation. Treat as secret.
   */
  token?: string;
  /**
   * Provider-scoped affiliate/publisher identifier. Required if token is omitted.
   */
  publisher_id?: string;
  /**
   * Provider-scoped campaign identifier.
   */
  campaign_id?: string;
  /**
   * Provider-scoped creative identifier.
   */
  creative_id?: string;
  /**
   * Provider-scoped sub-tracking identifier.
   */
  sub_id?: string;
  source?: AffiliateAttributionSource;
  /**
   * RFC3339 timestamp when the attribution token was issued.
   */
  issued_at?: string;
  /**
   * RFC3339 timestamp when the attribution token expires.
   */
  expires_at?: string;
  metadata?: AffiliateAttributionMetadata;
  /**
   * Attribution touchpoint type. Use 'first' when capturing at session creation, 'last' when capturing at completion. Enables multi-touch attribution models.
   */
  touchpoint?: 'first' | 'last';
};
export type AffiliateAttribution1 = {
  [k: string]: unknown | undefined;
};
/**
 * Payment instrument data collected from the buyer (e.g., card details, wallet tokens)
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "PaymentData".
 */
export type PaymentData = PaymentData1 & {
  /**
   * ID of the payment handler to use
   */
  handler_id?: string;
  /**
   * Payment instrument details
   */
  instrument?: {
    /**
     * Instrument type (e.g., card, wallet_token)
     */
    type: string;
    /**
     * Payment credential
     */
    credential: {
      /**
       * Credential type (e.g., spt, wallet_token)
       */
      type: string;
      /**
       * Credential token value
       */
      token: string;
    };
  };
  billing_address?: Address3;
  /**
   * Purchase order number
   */
  purchase_order_number?: string;
  /**
   * Payment terms for B2B transactions
   */
  payment_terms?: 'immediate' | 'net_15' | 'net_30' | 'net_60' | 'net_90';
  /**
   * RFC 3339 timestamp when payment is due
   */
  due_date?: string;
  /**
   * Whether this payment requires approval
   */
  approval_required?: boolean;
};
export type PaymentData1 = {
  [k: string]: unknown | undefined;
};
/**
 * Error codes for rejected discount codes, used in messages[].code.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "DiscountErrorCode".
 */
export type DiscountErrorCode =
  | 'discount_code_expired'
  | 'discount_code_invalid'
  | 'discount_code_already_applied'
  | 'discount_code_combination_disallowed'
  | 'discount_code_minimum_not_met'
  | 'discount_code_user_not_logged_in'
  | 'discount_code_user_ineligible'
  | 'discount_code_usage_limit_reached';
/**
 * Agent-provided authentication results returned to the seller for card-based 3D Secure.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "AuthenticationResult".
 */
export type AuthenticationResult = {
  [k: string]: unknown | undefined;
} & {
  /**
   * The outcome of this 3DS Authentication.
   */
  outcome:
    | 'abandoned'
    | 'attempt_acknowledged'
    | 'authenticated'
    | 'canceled'
    | 'denied'
    | 'informational'
    | 'internal_error'
    | 'not_supported'
    | 'processing_error'
    | 'rejected';
  /**
   * Detailed authentication data. This field is required when the outcome is 'authenticated', 'informational', or 'attempt_acknowledged'.
   */
  outcome_details?: {
    /**
     * The 3DS cryptogram (authentication value / AAV/CAVV/AEVV). This value is 20 bytes, base64-encoded into a 28-character string.
     */
    three_ds_cryptogram: string;
    /**
     * Electronic Commerce Indicator (ECI) returned by the 3D Secure provider. Indicates the degree/type of authentication performed.
     */
    electronic_commerce_indicator: '01' | '02' | '05' | '06' | '07';
    /**
     * Transaction identifier returned by the 3DS system:
     * - For 3DS1: the XID
     * - For 3DS2: the Directory Server Transaction ID (dsTransID)
     */
    transaction_id: string;
    /**
     * The 3D Secure version used for this authentication (for example '1.0.2' or '2.2.0').
     */
    version: string;
  };
};
/**
 * Checkout session response model
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "CheckoutSession".
 */
export type CheckoutSession = CheckoutSessionBase;
/**
 * Checkout session response after completion, includes the created order
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "CheckoutSessionWithOrder".
 */
export type CheckoutSessionWithOrder = CheckoutSessionBase & {
  order: Order1;
};
/**
 * Affiliate attribution data for first-touch tracking
 */
export type AffiliateAttribution2 = {
  [k: string]: unknown | undefined;
} & {
  /**
   * Identifier for the attribution provider / affiliate network namespace (e.g., 'impact.com').
   */
  provider: string;
  /**
   * Opaque provider-issued token for fraud-resistant validation. Treat as secret.
   */
  token?: string;
  /**
   * Provider-scoped affiliate/publisher identifier. Required if token is omitted.
   */
  publisher_id?: string;
  /**
   * Provider-scoped campaign identifier.
   */
  campaign_id?: string;
  /**
   * Provider-scoped creative identifier.
   */
  creative_id?: string;
  /**
   * Provider-scoped sub-tracking identifier.
   */
  sub_id?: string;
  source?: AffiliateAttributionSource;
  /**
   * RFC3339 timestamp when the attribution token was issued.
   */
  issued_at?: string;
  /**
   * RFC3339 timestamp when the attribution token expires.
   */
  expires_at?: string;
  metadata?: AffiliateAttributionMetadata;
  /**
   * Attribution touchpoint type. Use 'first' when capturing at session creation, 'last' when capturing at completion. Enables multi-touch attribution models.
   */
  touchpoint?: 'first' | 'last';
};
/**
 * Payment method and details
 */
export type PaymentData2 = {
  [k: string]: unknown | undefined;
} & {
  /**
   * ID of the payment handler to use
   */
  handler_id?: string;
  /**
   * Payment instrument details
   */
  instrument?: {
    /**
     * Instrument type (e.g., card, wallet_token)
     */
    type: string;
    /**
     * Payment credential
     */
    credential: {
      /**
       * Credential type (e.g., spt, wallet_token)
       */
      type: string;
      /**
       * Credential token value
       */
      token: string;
    };
  };
  billing_address?: Address3;
  /**
   * Purchase order number
   */
  purchase_order_number?: string;
  /**
   * Payment terms for B2B transactions
   */
  payment_terms?: 'immediate' | 'net_15' | 'net_30' | 'net_60' | 'net_90';
  /**
   * RFC 3339 timestamp when payment is due
   */
  due_date?: string;
  /**
   * Whether this payment requires approval
   */
  approval_required?: boolean;
};
/**
 * Authentication result for 3DS flows
 */
export type AuthenticationResult1 = {
  [k: string]: unknown | undefined;
} & {
  /**
   * The outcome of this 3DS Authentication.
   */
  outcome:
    | 'abandoned'
    | 'attempt_acknowledged'
    | 'authenticated'
    | 'canceled'
    | 'denied'
    | 'informational'
    | 'internal_error'
    | 'not_supported'
    | 'processing_error'
    | 'rejected';
  /**
   * Detailed authentication data. This field is required when the outcome is 'authenticated', 'informational', or 'attempt_acknowledged'.
   */
  outcome_details?: {
    /**
     * The 3DS cryptogram (authentication value / AAV/CAVV/AEVV). This value is 20 bytes, base64-encoded into a 28-character string.
     */
    three_ds_cryptogram: string;
    /**
     * Electronic Commerce Indicator (ECI) returned by the 3D Secure provider. Indicates the degree/type of authentication performed.
     */
    electronic_commerce_indicator: '01' | '02' | '05' | '06' | '07';
    /**
     * Transaction identifier returned by the 3DS system:
     * - For 3DS1: the XID
     * - For 3DS2: the Directory Server Transaction ID (dsTransID)
     */
    transaction_id: string;
    /**
     * The 3D Secure version used for this authentication (for example '1.0.2' or '2.2.0').
     */
    version: string;
  };
};
/**
 * Affiliate attribution data for last-touch tracking
 */
export type AffiliateAttribution3 = {
  [k: string]: unknown | undefined;
} & {
  /**
   * Identifier for the attribution provider / affiliate network namespace (e.g., 'impact.com').
   */
  provider: string;
  /**
   * Opaque provider-issued token for fraud-resistant validation. Treat as secret.
   */
  token?: string;
  /**
   * Provider-scoped affiliate/publisher identifier. Required if token is omitted.
   */
  publisher_id?: string;
  /**
   * Provider-scoped campaign identifier.
   */
  campaign_id?: string;
  /**
   * Provider-scoped creative identifier.
   */
  creative_id?: string;
  /**
   * Provider-scoped sub-tracking identifier.
   */
  sub_id?: string;
  source?: AffiliateAttributionSource;
  /**
   * RFC3339 timestamp when the attribution token was issued.
   */
  issued_at?: string;
  /**
   * RFC3339 timestamp when the attribution token expires.
   */
  expires_at?: string;
  metadata?: AffiliateAttributionMetadata;
  /**
   * Attribution touchpoint type. Use 'first' when capturing at session creation, 'last' when capturing at completion. Enables multi-touch attribution models.
   */
  touchpoint?: 'first' | 'last';
};

export interface AgenticCheckoutSchemaBundle {
  VariantOption?: VariantOption;
  WeightInfo?: WeightInfo;
  DimensionsInfo?: DimensionsInfo;
  DiscountDetail?: DiscountDetail;
  Address?: Address;
  AffiliateAttributionSource?: AffiliateAttributionSource;
  AffiliateAttributionMetadata?: AffiliateAttributionMetadata;
  AffiliateAttribution?: AffiliateAttribution;
  FulfillmentDetails?: FulfillmentDetails;
  CompanyInfo?: CompanyInfo;
  LoyaltyInfo?: LoyaltyInfo;
  TaxExemption?: TaxExemption;
  Buyer?: Buyer;
  InterventionCapabilities?: InterventionCapabilities;
  Capabilities?: Capabilities;
  ExtensionDeclaration?: ExtensionDeclaration;
  PaymentMethodObject?: PaymentMethodObject;
  Item?: Item;
  Disclosure?: Disclosure;
  CustomAttribute?: CustomAttribute;
  MarketplaceSellerDetails?: MarketplaceSellerDetails;
  PaymentHandler?: PaymentHandler;
  Payment?: Payment;
  LineItem?: LineItem;
  TaxBreakdownItem?: TaxBreakdownItem;
  Total?: Total;
  FulfillmentOptionPickup?: FulfillmentOptionPickup;
  FulfillmentOptionLocalDelivery?: FulfillmentOptionLocalDelivery;
  FulfillmentOptionShipping?: FulfillmentOptionShipping;
  FulfillmentOptionDigital?: FulfillmentOptionDigital;
  SelectedFulfillmentOption?: SelectedFulfillmentOption;
  GiftWrap?: GiftWrap;
  SplitPayment?: SplitPayment;
  FulfillmentGroup?: FulfillmentGroup;
  EstimatedDelivery?: EstimatedDelivery;
  OrderConfirmation?: OrderConfirmation;
  SupportInfo?: SupportInfo;
  MessageInfo?: MessageInfo;
  MessageWarning?: MessageWarning;
  MessageError?: MessageError;
  Link?: Link;
  PaymentData?: PaymentData;
  ProtocolVersion?: ProtocolVersion;
  DiscountAllocation?: DiscountAllocation;
  Coupon?: Coupon;
  AppliedDiscount?: AppliedDiscount;
  DiscountsRequest?: DiscountsRequest;
  DiscountsResponse?: DiscountsResponse;
  RejectedDiscount?: RejectedDiscount;
  DiscountErrorCode?: DiscountErrorCode;
  PaymentResponse?: PaymentResponse;
  RiskSignals?: RiskSignals;
  Order?: Order;
  OrderLineItem?: OrderLineItem;
  OrderLineItemQuantity?: OrderLineItemQuantity;
  LineItemReference?: LineItemReference;
  Fulfillment?: Fulfillment;
  FulfillmentEvent?: FulfillmentEvent;
  Adjustment?: Adjustment;
  AuthenticationMetadata?: AuthenticationMetadata;
  AuthenticationResult?: AuthenticationResult;
  MarketingConsentOption?: MarketingConsentOption;
  MarketingConsent?: MarketingConsent;
  CheckoutSessionBase?: CheckoutSessionBase;
  CheckoutSession?: CheckoutSession;
  CheckoutSessionWithOrder?: CheckoutSessionWithOrder;
  CheckoutSessionCreateRequest?: CheckoutSessionCreateRequest;
  CheckoutSessionUpdateRequest?: CheckoutSessionUpdateRequest;
  CheckoutSessionCompleteRequest?: CheckoutSessionCompleteRequest;
  IntentTrace?: IntentTrace;
  CancelSessionRequest?: CancelSessionRequest;
  DiscoveryResponse?: DiscoveryResponse;
  DiscoveryCapabilities?: DiscoveryCapabilities;
  DiscoveryProtocol?: DiscoveryProtocol;
  DiscoveryExtension?: DiscoveryExtension;
  Error?: Error;
}
/**
 * Represents a single variant option for a product (e.g., size, color, material)
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "VariantOption".
 */
export interface VariantOption {
  /**
   * Variant attribute name (e.g., 'Size', 'Color')
   */
  name: string;
  /**
   * Variant attribute value (e.g., 'Large', 'Blue')
   */
  value: string;
}
/**
 * Product weight with unit of measurement
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "WeightInfo".
 */
export interface WeightInfo {
  /**
   * Numeric weight value
   */
  value: number;
  /**
   * Unit of measurement for weight
   */
  unit: 'g' | 'kg' | 'oz' | 'lb';
}
/**
 * Physical dimensions of a product with unit of measurement
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "DimensionsInfo".
 */
export interface DimensionsInfo {
  /**
   * Length dimension
   */
  length: number;
  /**
   * Width dimension
   */
  width: number;
  /**
   * Height dimension
   */
  height: number;
  /**
   * Unit of measurement for dimensions
   */
  unit: 'cm' | 'in';
}
/**
 * Information about a discount applied to the checkout or a specific item
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "DiscountDetail".
 */
export interface DiscountDetail {
  /**
   * Discount code if applicable
   */
  code?: string;
  /**
   * Type of discount
   */
  type: 'percentage' | 'fixed' | 'bogo' | 'volume';
  /**
   * Discount amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  amount: number;
  /**
   * Human-readable discount description
   */
  description?: string;
  /**
   * Source of the discount
   */
  source?: 'coupon' | 'automatic' | 'loyalty';
}
/**
 * Physical address for shipping, billing, or pickup locations
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Address".
 */
export interface Address {
  /**
   * Recipient name for this address
   */
  name: string;
  /**
   * Primary street address line
   */
  line_one: string;
  /**
   * Secondary address line (apartment, suite, etc.)
   */
  line_two?: string;
  /**
   * City name
   */
  city: string;
  /**
   * State or province code
   */
  state: string;
  /**
   * ISO 3166-1 alpha-2 country code
   */
  country: string;
  /**
   * Postal or ZIP code
   */
  postal_code: string;
  /**
   * Postal or ZIP code
   */
  company?: string;
}
/**
 * Context about where the attribution originated.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "AffiliateAttributionSource".
 */
export interface AffiliateAttributionSource {
  /**
   * The type of attribution source.
   */
  type: 'url' | 'platform' | 'unknown';
  /**
   * Canonical content URL when type is 'url'.
   */
  url?: string;
}
/**
 * Flat key/value map for additional non-sensitive context. Keys must be strings; values must be strings, numbers, or booleans. Arrays and nested objects are NOT permitted.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "AffiliateAttributionMetadata".
 */
export interface AffiliateAttributionMetadata {
  [k: string]: (string | number | boolean) | undefined;
}
/**
 * Details about how items will be fulfilled (shipping, pickup, or delivery information)
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "FulfillmentDetails".
 */
export interface FulfillmentDetails {
  /**
   * Full name for fulfillment contact
   */
  name?: string;
  /**
   * Contact phone number. E.164 format recommended (e.g., +15551234567) for global interoperability and SMS/delivery carrier systems.
   */
  phone_number?: string;
  /**
   * Contact email address
   */
  email?: string;
  address?: Address1;
}
/**
 * Fulfillment address
 */
export interface Address1 {
  /**
   * Recipient name for this address
   */
  name: string;
  /**
   * Primary street address line
   */
  line_one: string;
  /**
   * Secondary address line (apartment, suite, etc.)
   */
  line_two?: string;
  /**
   * City name
   */
  city: string;
  /**
   * State or province code
   */
  state: string;
  /**
   * ISO 3166-1 alpha-2 country code
   */
  country: string;
  /**
   * Postal or ZIP code
   */
  postal_code: string;
  /**
   * Postal or ZIP code
   */
  company?: string;
}
/**
 * Information about a company or organization associated with the buyer
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "CompanyInfo".
 */
export interface CompanyInfo {
  /**
   * Company or organization name
   */
  name: string;
  /**
   * Business tax identification number
   */
  tax_id?: string;
  /**
   * Department within the organization
   */
  department?: string;
  /**
   * Cost center code for internal accounting
   */
  cost_center?: string;
}
/**
 * Loyalty program information including membership details and rewards balance
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "LoyaltyInfo".
 */
export interface LoyaltyInfo {
  /**
   * Loyalty program tier level
   */
  tier?: string;
  /**
   * Current loyalty points balance
   */
  points_balance?: number;
  /**
   * RFC 3339 timestamp when the customer joined the loyalty program
   */
  member_since?: string;
}
/**
 * Tax exemption information including exemption type and applicable regions
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "TaxExemption".
 */
export interface TaxExemption {
  /**
   * Unique identifier for the tax exemption certificate
   */
  certificate_id: string;
  /**
   * Type of tax exemption certificate
   */
  certificate_type: 'resale' | 'exempt_organization' | 'government';
  /**
   * List of regions where the exemption applies (e.g., state codes)
   */
  exempt_regions?: string[];
  /**
   * RFC 3339 timestamp when the exemption certificate expires
   */
  expires_at?: string;
}
/**
 * Information about the buyer including contact details, company info, and loyalty status
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Buyer".
 */
export interface Buyer {
  /**
   * Buyer's first name
   */
  first_name?: string;
  /**
   * Buyer's last name
   */
  last_name?: string;
  /**
   * Buyer's full name
   */
  full_name?: string;
  /**
   * Buyer's email address
   */
  email: string;
  /**
   * Buyer's phone number
   */
  phone_number?: string;
  /**
   * Merchant's internal customer identifier
   */
  customer_id?: string;
  /**
   * Type of buyer account
   */
  account_type?: 'guest' | 'registered' | 'business';
  /**
   * Buyer's authentication status
   */
  authentication_status?: 'authenticated' | 'guest' | 'requires_signin';
  company?: CompanyInfo1;
  loyalty?: LoyaltyInfo1;
  tax_exemption?: TaxExemption1;
}
/**
 * Company information for business buyers
 */
export interface CompanyInfo1 {
  /**
   * Company or organization name
   */
  name: string;
  /**
   * Business tax identification number
   */
  tax_id?: string;
  /**
   * Department within the organization
   */
  department?: string;
  /**
   * Cost center code for internal accounting
   */
  cost_center?: string;
}
/**
 * Loyalty program information
 */
export interface LoyaltyInfo1 {
  /**
   * Loyalty program tier level
   */
  tier?: string;
  /**
   * Current loyalty points balance
   */
  points_balance?: number;
  /**
   * RFC 3339 timestamp when the customer joined the loyalty program
   */
  member_since?: string;
}
/**
 * Tax exemption details
 */
export interface TaxExemption1 {
  /**
   * Unique identifier for the tax exemption certificate
   */
  certificate_id: string;
  /**
   * Type of tax exemption certificate
   */
  certificate_type: 'resale' | 'exempt_organization' | 'government';
  /**
   * List of regions where the exemption applies (e.g., state codes)
   */
  exempt_regions?: string[];
  /**
   * RFC 3339 timestamp when the exemption certificate expires
   */
  expires_at?: string;
}
/**
 * Intervention capabilities. Context-specific fields: display_context, redirect_context, max_redirects, max_interaction_depth (requests only). required, enforcement (responses only). supported field contains intersection in responses.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "InterventionCapabilities".
 */
export interface InterventionCapabilities {
  /**
   * Intervention types supported. Agent request: Interventions the agent can handle. Seller response: Intersection of supported interventions.
   */
  supported?: ('3ds' | 'biometric' | 'address_verification')[];
  /**
   * Intervention methods required for this session (seller only).
   */
  required?: ('3ds' | 'biometric')[];
  /**
   * When required interventions are enforced (seller only).
   */
  enforcement?: 'always' | 'conditional' | 'optional';
  /**
   * How the Agent presents interventions (agent only).
   */
  display_context?: 'native' | 'webview' | 'modal' | 'redirect';
  /**
   * How the Agent handles redirects (agent only).
   */
  redirect_context?: 'in_app' | 'external_browser' | 'none';
  /**
   * Maximum number of redirects the Agent can handle (agent only).
   */
  max_redirects?: number;
  /**
   * Maximum depth of nested interactions the Agent can handle (agent only).
   */
  max_interaction_depth?: number;
}
/**
 * Capabilities object used in requests and responses. Context determines the party: requests are from Agents, responses are from Sellers. Seller responses contain the intersection of supported interventions.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Capabilities".
 */
export interface Capabilities {
  payment?: Payment;
  interventions?: InterventionCapabilities;
  /**
   * Extensions supported by the party. Requests: array of extension identifiers. Responses: array of extension declaration objects.
   */
  extensions?: string[] | ExtensionDeclaration[];
}
/**
 * Payment configuration with handlers
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Payment".
 */
export interface Payment {
  /**
   * Available payment handlers
   */
  handlers: PaymentHandler[];
}
/**
 * Payment handler configuration and capabilities
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "PaymentHandler".
 */
export interface PaymentHandler {
  /**
   * Seller-defined handler identifier
   */
  id: string;
  /**
   * Handler name in reverse-DNS format (e.g., dev.acp.tokenized.card)
   */
  name: string;
  /**
   * Human-readable name for UI (e.g., Credit Card). Use when showing payment options to the buyer.
   */
  display_name?: string;
  /**
   * Handler version in YYYY-MM-DD format
   */
  version: string;
  /**
   * URL to handler specification
   */
  spec: string;
  /**
   * Whether this handler requires using delegate_payment API
   */
  requires_delegate_payment: boolean;
  /**
   * Whether this handler routes PCI DSS sensitive data
   */
  requires_pci_compliance: boolean;
  /**
   * Payment Service Provider identifier
   */
  psp: string;
  /**
   * URL to JSON Schema for handler configuration
   */
  config_schema: string;
  /**
   * URLs to JSON Schemas for payment instruments
   */
  instrument_schemas: string[];
  /**
   * Handler-specific configuration
   */
  config: {};
  /**
   * Optional merchant-suggested display order (lower = higher preference). Suggestive only; platform/agent MAY reorder.
   */
  display_order?: number;
}
/**
 * Extension declaration in capabilities.extensions (response). Describes an active extension and which schema fields it adds.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "ExtensionDeclaration".
 */
export interface ExtensionDeclaration {
  /**
   * Unique identifier for the extension.
   */
  name: string;
  /**
   * JSONPath expressions identifying the schema fields added by this extension. Format: $.<SchemaName>.<fieldName> (e.g., $.CheckoutSession.discounts).
   */
  extends?: string[];
  /**
   * URL to the extension's JSON Schema definition.
   */
  schema?: string;
  /**
   * URL to the extension's specification document.
   */
  spec?: string;
}
/**
 * Payment method with additional constraints (e.g., card brands, PSP routing)
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "PaymentMethodObject".
 */
export interface PaymentMethodObject {
  /**
   * The payment method identifier
   */
  method: string;
  /**
   * Specific card brands/networks accepted
   */
  brands?: (
    | 'visa'
    | 'mastercard'
    | 'amex'
    | 'discover'
    | 'diners'
    | 'jcb'
    | 'unionpay'
    | 'eftpos'
    | 'interac'
  )[];
  /**
   * For card methods, funding types accepted
   */
  funding_types?: ('credit' | 'debit' | 'prepaid')[];
  /**
   * Optional PSP routing information
   */
  providers?: string[];
}
/**
 * A purchasable item with variant options (e.g., size, color) and quantity
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Item".
 */
export interface Item {
  /**
   * Unique identifier for the item
   */
  id: string;
  /**
   * Display name of the item
   */
  name?: string;
  /**
   * Price per unit in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  unit_amount?: number;
}
/**
 * Legal disclosure or terms that must be acknowledged by the buyer
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Disclosure".
 */
export interface Disclosure {
  /**
   * Type of disclosure
   */
  type: 'disclaimer';
  /**
   * Format of the disclosure content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.
   */
  content_type: 'plain' | 'markdown';
  /**
   * The disclosure text content. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.
   */
  content: string;
}
/**
 * Custom key-value attribute for merchant-specific metadata on line items
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "CustomAttribute".
 */
export interface CustomAttribute {
  /**
   * Human-readable label for the attribute
   */
  display_name: string;
  /**
   * Attribute value
   */
  value: string;
}
/**
 * Information about a third-party seller in a marketplace model
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "MarketplaceSellerDetails".
 */
export interface MarketplaceSellerDetails {
  /**
   * Name of the marketplace seller or vendor
   */
  name: string;
}
/**
 * A line item in the checkout representing a product with pricing, discounts, and fulfillment details
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "LineItem".
 */
export interface LineItem {
  /**
   * Unique identifier for the line item
   */
  id: string;
  item: Item1;
  /**
   * Number of units for this line item
   */
  quantity: number;
  /**
   * Display name of the line item
   */
  name?: string;
  /**
   * Detailed description of the line item
   */
  description?: string;
  /**
   * Array of image URLs for this line item
   */
  images?: string[];
  /**
   * The unit price of the line item in the smallest currency unit (e.g., cents for USD)
   */
  unit_amount?: number;
  /**
   * Legal disclosures or disclaimers for this item
   */
  disclosures?: Disclosure[];
  /**
   * Custom attributes specific to this line item
   */
  custom_attributes?: CustomAttribute[];
  marketplace_seller_details?: MarketplaceSellerDetails1;
  /**
   * Merchant's product identifier
   */
  product_id?: string;
  /**
   * Stock keeping unit identifier
   */
  sku?: string;
  /**
   * Product variant identifier
   */
  variant_id?: string;
  /**
   * Product category
   */
  category?: string;
  /**
   * Product tags or labels
   */
  tags?: string[];
  weight?: WeightInfo1;
  dimensions?: DimensionsInfo1;
  /**
   * Current availability status of the item
   */
  availability_status?:
    'in_stock' | 'low_stock' | 'out_of_stock' | 'backorder' | 'pre_order';
  /**
   * Quantity currently available for purchase
   */
  available_quantity?: number;
  /**
   * Maximum quantity allowed per order
   */
  max_quantity_per_order?: number;
  /**
   * RFC 3339 timestamp when item becomes available for fulfillment
   */
  fulfillable_on?: string;
  /**
   * Selected product variant options (e.g., size, color)
   */
  variant_options?: VariantOption[];
  /**
   * Line-item level discount details
   */
  discount_details?: DiscountDetail[];
  /**
   * Whether this line item is tax exempt
   */
  tax_exempt?: boolean;
  /**
   * Reason for tax exemption if applicable
   */
  tax_exemption_reason?: string;
  /**
   * Reference to parent line item for bundled products
   */
  parent_id?: string;
  /**
   * Line-item level totals breakdown including base_amount, discount, subtotal, tax, and total
   */
  totals: Total[];
}
/**
 * Reference to the item being purchased
 */
export interface Item1 {
  /**
   * Unique identifier for the item
   */
  id: string;
  /**
   * Display name of the item
   */
  name?: string;
  /**
   * Price per unit in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  unit_amount?: number;
}
/**
 * Seller details for marketplace items
 */
export interface MarketplaceSellerDetails1 {
  /**
   * Name of the marketplace seller or vendor
   */
  name: string;
}
/**
 * Weight information for the item
 */
export interface WeightInfo1 {
  /**
   * Numeric weight value
   */
  value: number;
  /**
   * Unit of measurement for weight
   */
  unit: 'g' | 'kg' | 'oz' | 'lb';
}
/**
 * Dimensions for the item
 */
export interface DimensionsInfo1 {
  /**
   * Length dimension
   */
  length: number;
  /**
   * Width dimension
   */
  width: number;
  /**
   * Height dimension
   */
  height: number;
  /**
   * Unit of measurement for dimensions
   */
  unit: 'cm' | 'in';
}
/**
 * Total amounts for the checkout including subtotal, discounts, tax, shipping, and final total
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Total".
 */
export interface Total {
  /**
   * Type of total line item
   */
  type:
    | 'items_base_amount'
    | 'items_discount'
    | 'subtotal'
    | 'discount'
    | 'fulfillment'
    | 'tax'
    | 'fee'
    | 'gift_wrap'
    | 'tip'
    | 'store_credit'
    | 'total'
    | 'amount_refunded';
  /**
   * Localized display text for this total
   */
  display_text: string;
  /**
   * Amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  amount: number;
  /**
   * Amount in presentment currency minor units if different from settlement currency
   */
  presentment_amount?: number;
  /**
   * Additional descriptive text for this total
   */
  description?: string;
  /**
   * Detailed breakdown for tax totals
   */
  breakdown?: TaxBreakdownItem[];
}
/**
 * Breakdown of tax amounts by type, jurisdiction, or rate
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "TaxBreakdownItem".
 */
export interface TaxBreakdownItem {
  /**
   * Tax jurisdiction name (e.g., 'California State Tax', 'City of San Francisco')
   */
  jurisdiction: string;
  /**
   * Tax rate as a decimal (e.g., 0.0875 for 8.75%)
   */
  rate: number;
  /**
   * Tax amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  amount: number;
}
/**
 * In-store or curbside pickup fulfillment option with pickup location details
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "FulfillmentOptionPickup".
 */
export interface FulfillmentOptionPickup {
  /**
   * Fulfillment type discriminator
   */
  type: 'pickup';
  /**
   * Unique identifier for this fulfillment option
   */
  id: string;
  /**
   * Display title for this pickup option
   */
  title: string;
  /**
   * Additional details about this pickup option
   */
  description?: string;
  /**
   * Pickup location details
   */
  location: {
    /**
     * Location name
     */
    name: string;
    address: Address2;
    /**
     * Location phone number
     */
    phone?: string;
    /**
     * Special pickup instructions
     */
    instructions?: string;
  };
  /**
   * Type of pickup method
   */
  pickup_type?: 'in_store' | 'curbside' | 'locker';
  /**
   * RFC 3339 timestamp when order will be ready for pickup
   */
  ready_by?: string;
  /**
   * RFC 3339 timestamp by which order must be picked up
   */
  pickup_by?: string;
  /**
   * Cost breakdown for this fulfillment option
   */
  totals: Total[];
}
/**
 * Pickup address
 */
export interface Address2 {
  /**
   * Recipient name for this address
   */
  name: string;
  /**
   * Primary street address line
   */
  line_one: string;
  /**
   * Secondary address line (apartment, suite, etc.)
   */
  line_two?: string;
  /**
   * City name
   */
  city: string;
  /**
   * State or province code
   */
  state: string;
  /**
   * ISO 3166-1 alpha-2 country code
   */
  country: string;
  /**
   * Postal or ZIP code
   */
  postal_code: string;
  /**
   * Postal or ZIP code
   */
  company?: string;
}
/**
 * Local delivery fulfillment option with delivery address and scheduling details
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "FulfillmentOptionLocalDelivery".
 */
export interface FulfillmentOptionLocalDelivery {
  /**
   * Fulfillment type discriminator
   */
  type: 'local_delivery';
  /**
   * Unique identifier for this fulfillment option
   */
  id: string;
  /**
   * Display title for this local delivery option
   */
  title: string;
  /**
   * Additional details about this delivery option
   */
  description?: string;
  /**
   * Expected delivery time window
   */
  delivery_window?: {
    /**
     * RFC 3339 timestamp for delivery window start
     */
    start: string;
    /**
     * RFC 3339 timestamp for delivery window end
     */
    end: string;
  };
  /**
   * Geographic service area for local delivery
   */
  service_area?: {
    /**
     * Delivery radius in miles
     */
    radius_miles?: number;
    /**
     * Center point postal code for delivery radius
     */
    center_postal_code?: string;
  };
  /**
   * Cost breakdown for this fulfillment option
   */
  totals: Total[];
}
/**
 * Shipping fulfillment option with carrier, service level, and delivery estimates
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "FulfillmentOptionShipping".
 */
export interface FulfillmentOptionShipping {
  /**
   * Fulfillment type discriminator
   */
  type: 'shipping';
  /**
   * Unique identifier for this fulfillment option
   */
  id: string;
  /**
   * Display title for this shipping option (e.g., 'Standard Shipping', 'Express')
   */
  title: string;
  /**
   * Additional details about this shipping option
   */
  description?: string;
  /**
   * Shipping carrier name (e.g., 'USPS', 'FedEx')
   */
  carrier?: string;
  /**
   * RFC 3339 timestamp for earliest expected delivery
   */
  earliest_delivery_time?: string;
  /**
   * RFC 3339 timestamp for latest expected delivery
   */
  latest_delivery_time?: string;
  /**
   * Cost breakdown for this fulfillment option
   */
  totals: Total[];
}
/**
 * Digital delivery fulfillment option for downloadable or streaming content
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "FulfillmentOptionDigital".
 */
export interface FulfillmentOptionDigital {
  /**
   * Fulfillment type discriminator
   */
  type: 'digital';
  /**
   * Unique identifier for this fulfillment option
   */
  id: string;
  /**
   * Display title for this digital delivery option
   */
  title: string;
  /**
   * Additional details about digital delivery method
   */
  description?: string;
  /**
   * Cost breakdown for this fulfillment option
   */
  totals: Total[];
}
/**
 * Fulfillment option selected by the buyer for specific line items
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "SelectedFulfillmentOption".
 */
export interface SelectedFulfillmentOption {
  /**
   * Type of fulfillment option selected
   */
  type: 'shipping' | 'digital' | 'pickup' | 'local_delivery';
  /**
   * ID of the selected fulfillment option
   */
  option_id: string;
  /**
   * List of line item IDs associated with this fulfillment option
   */
  item_ids: string[];
}
/**
 * Gift wrapping option with associated cost and customization details
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "GiftWrap".
 */
export interface GiftWrap {
  /**
   * Whether gift wrapping is enabled for this order
   */
  enabled: boolean;
  /**
   * Gift wrap style selected
   */
  style?: 'birthday' | 'holiday' | 'elegant';
  /**
   * Additional charge for gift wrapping in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)
   */
  charge?: number;
}
/**
 * Split payment configuration allowing payment across multiple methods or parties
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "SplitPayment".
 */
export interface SplitPayment {
  /**
   * Payment amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100) for this split
   */
  amount: number;
}
/**
 * Group of line items that share the same fulfillment method and destination
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "FulfillmentGroup".
 */
export interface FulfillmentGroup {
  /**
   * Unique identifier for this fulfillment group
   */
  id: string;
  /**
   * List of line item IDs in this fulfillment group
   */
  item_ids: string[];
  /**
   * Type of fulfillment for this group
   */
  destination_type: 'shipping' | 'pickup' | 'local_delivery' | 'digital';
  fulfillment_details?: FulfillmentDetails1;
  /**
   * Location identifier for pickup or local delivery
   */
  location_id?: string;
  /**
   * Special fulfillment instructions
   */
  instructions?: string;
}
/**
 * Fulfillment contact and address details
 */
export interface FulfillmentDetails1 {
  /**
   * Full name for fulfillment contact
   */
  name?: string;
  /**
   * Contact phone number. E.164 format recommended (e.g., +15551234567) for global interoperability and SMS/delivery carrier systems.
   */
  phone_number?: string;
  /**
   * Contact email address
   */
  email?: string;
  address?: Address1;
}
/**
 * Estimated delivery date range for a fulfillment option
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "EstimatedDelivery".
 */
export interface EstimatedDelivery {
  /**
   * RFC 3339 timestamp for earliest expected delivery
   */
  earliest: string;
  /**
   * RFC 3339 timestamp for latest expected delivery
   */
  latest: string;
}
/**
 * Order confirmation details including order number and tracking information
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "OrderConfirmation".
 */
export interface OrderConfirmation {
  /**
   * Order confirmation number
   */
  confirmation_number?: string;
  /**
   * Whether a confirmation email has been sent
   */
  confirmation_email_sent?: boolean;
  /**
   * URL to the order receipt
   */
  receipt_url?: string;
  /**
   * Invoice number if generated
   */
  invoice_number?: string;
  /**
   * Echo of order_notes attached to the order.
   */
  order_notes?: string;
}
/**
 * Customer support contact information including email, phone, and URL
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "SupportInfo".
 */
export interface SupportInfo {
  /**
   * Support contact email
   */
  email?: string;
  /**
   * Support contact phone number
   */
  phone?: string;
  /**
   * Support hours of operation
   */
  hours?: string;
  /**
   * URL to merchant's help center
   */
  help_center_url?: string;
}
/**
 * Informational message to display to the buyer during checkout
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "MessageInfo".
 */
export interface MessageInfo {
  /**
   * Message type discriminator
   */
  type: 'info';
  /**
   * Severity level of this informational message
   */
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
  /**
   * Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize.
   */
  resolution?: 'recoverable' | 'requires_buyer_input' | 'requires_buyer_review';
  /**
   * RFC 9535 JSONPath
   */
  param?: string;
  /**
   * Format of the message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.
   */
  content_type: 'plain' | 'markdown';
  /**
   * Informational message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.
   */
  content: string;
}
/**
 * Warning message to display to the buyer during checkout (non-blocking)
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "MessageWarning".
 */
export interface MessageWarning {
  /**
   * Message type discriminator
   */
  type: 'warning';
  /**
   * Warning code indicating the type of warning
   */
  code:
    | 'low_stock'
    | 'high_demand'
    | 'shipping_delay'
    | 'price_change'
    | 'expiring_promotion'
    | 'limited_availability'
    | 'discount_code_expired'
    | 'discount_code_invalid'
    | 'discount_code_already_applied'
    | 'discount_code_combination_disallowed'
    | 'discount_code_minimum_not_met'
    | 'discount_code_user_not_logged_in'
    | 'discount_code_user_ineligible'
    | 'discount_code_usage_limit_reached';
  /**
   * Severity level of this warning
   */
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
  /**
   * Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize.
   */
  resolution?: 'recoverable' | 'requires_buyer_input' | 'requires_buyer_review';
  /**
   * RFC 9535 JSONPath
   */
  param?: string;
  /**
   * Format of the warning message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.
   */
  content_type: 'plain' | 'markdown';
  /**
   * Warning message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.
   */
  content: string;
}
/**
 * Business-logic error within a valid CheckoutSession response. Used in messages[] on 2xx responses when the session is valid but has actionable issues (e.g. status "not_ready_for_payment"). The agent can respond by asking the buyer for corrections or trying alternatives. Use MessageError—not Error—when you can return a valid CheckoutSession and the problem is conversational (e.g. invalid email → code "invalid" and param "$.buyer.email"; out of stock → code "out_of_stock" and param "$.items[0]").
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "MessageError".
 */
export interface MessageError {
  /**
   * Message type discriminator
   */
  type: 'error';
  /**
   * Error code indicating the type of error
   */
  code:
    | 'missing'
    | 'invalid'
    | 'out_of_stock'
    | 'payment_declined'
    | 'requires_sign_in'
    | 'requires_3ds'
    | 'low_stock'
    | 'quantity_exceeded'
    | 'coupon_invalid'
    | 'coupon_expired'
    | 'minimum_not_met'
    | 'maximum_exceeded'
    | 'region_restricted'
    | 'age_verification_required'
    | 'approval_required'
    | 'unsupported'
    | 'not_found'
    | 'conflict'
    | 'rate_limited'
    | 'expired'
    | 'intervention_required';
  /**
   * Severity level of this error
   */
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
  /**
   * Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize.
   */
  resolution?: 'recoverable' | 'requires_buyer_input' | 'requires_buyer_review';
  /**
   * RFC 9535 JSONPath
   */
  param?: string;
  /**
   * Format of the error message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.
   */
  content_type: 'plain' | 'markdown';
  /**
   * Error message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.
   */
  content: string;
}
/**
 * Hyperlink with URL, display text, and optional action semantics
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Link".
 */
export interface Link {
  /**
   * Type of link
   */
  type:
    | 'terms_of_use'
    | 'privacy_policy'
    | 'return_policy'
    | 'shipping_policy'
    | 'contact_us'
    | 'about_us'
    | 'faq'
    | 'support';
  /**
   * Display text for the link
   */
  title?: string;
  /**
   * URL destination
   */
  url: string;
}
/**
 * Billing address for the payment
 */
export interface Address3 {
  /**
   * Recipient name for this address
   */
  name: string;
  /**
   * Primary street address line
   */
  line_one: string;
  /**
   * Secondary address line (apartment, suite, etc.)
   */
  line_two?: string;
  /**
   * City name
   */
  city: string;
  /**
   * State or province code
   */
  state: string;
  /**
   * ISO 3166-1 alpha-2 country code
   */
  country: string;
  /**
   * Postal or ZIP code
   */
  postal_code: string;
  /**
   * Postal or ZIP code
   */
  company?: string;
}
/**
 * Protocol metadata included in checkout responses. Indicates the ACP version.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "ProtocolVersion".
 */
export interface ProtocolVersion {
  /**
   * ACP protocol version in YYYY-MM-DD format.
   */
  version: string;
}
/**
 * Breakdown of how a discount amount was allocated to a specific target.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "DiscountAllocation".
 */
export interface DiscountAllocation {
  /**
   * JSONPath to the allocation target (e.g., '$.line_items[0]', '$.totals.shipping').
   */
  path: string;
  /**
   * Amount allocated to this target in minor (cents) currency units.
   */
  amount: number;
}
/**
 * Coupon details describing the discount terms.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Coupon".
 */
export interface Coupon {
  /**
   * Unique identifier for the coupon.
   */
  id: string;
  /**
   * Human-readable coupon name (e.g., 'Summer Sale 20% Off').
   */
  name: string;
  /**
   * Percentage discount (0-100). Mutually exclusive with amount_off.
   */
  percent_off?: number;
  /**
   * Fixed discount amount in minor currency units. Mutually exclusive with percent_off.
   */
  amount_off?: number;
  /**
   * ISO 4217 currency code for amount_off. Required if amount_off is set.
   */
  currency?: string;
  /**
   * How long the discount applies. 'once' = single use, 'repeating' = multiple billing periods, 'forever' = indefinitely.
   */
  duration?: 'once' | 'repeating' | 'forever';
  /**
   * Number of months the coupon applies if duration is 'repeating'.
   */
  duration_in_months?: number;
  /**
   * Maximum number of times this coupon can be redeemed across all customers.
   */
  max_redemptions?: number;
  /**
   * Number of times this coupon has been redeemed.
   */
  times_redeemed?: number;
  /**
   * Arbitrary key-value metadata attached to the coupon.
   */
  metadata?: {
    /**
     * Metadata value
     */
    [k: string]: string | undefined;
  };
}
/**
 * A discount that was successfully applied to the checkout session.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "AppliedDiscount".
 */
export interface AppliedDiscount {
  /**
   * Unique identifier for this applied discount instance.
   */
  id: string;
  /**
   * The discount code entered by the user. Omitted for automatic discounts.
   */
  code?: string;
  coupon: Coupon1;
  /**
   * Total discount amount in minor (cents) currency units.
   */
  amount: number;
  /**
   * True if applied automatically by merchant rules (no code required).
   */
  automatic?: boolean;
  /**
   * RFC 3339 timestamp when the discount became active.
   */
  start?: string;
  /**
   * RFC 3339 timestamp when the discount expires.
   */
  end?: string;
  /**
   * Allocation method. 'each' = applied independently per item. 'across' = split proportionally by value.
   */
  method?: 'each' | 'across';
  /**
   * Stacking order for discount calculation. Lower numbers applied first (1 = first).
   */
  priority?: number;
  /**
   * Breakdown of where this discount was allocated. Sum of allocation amounts equals total amount.
   */
  allocations?: DiscountAllocation[];
}
/**
 * Details about the underlying coupon/promotion.
 */
export interface Coupon1 {
  /**
   * Unique identifier for the coupon.
   */
  id: string;
  /**
   * Human-readable coupon name (e.g., 'Summer Sale 20% Off').
   */
  name: string;
  /**
   * Percentage discount (0-100). Mutually exclusive with amount_off.
   */
  percent_off?: number;
  /**
   * Fixed discount amount in minor currency units. Mutually exclusive with percent_off.
   */
  amount_off?: number;
  /**
   * ISO 4217 currency code for amount_off. Required if amount_off is set.
   */
  currency?: string;
  /**
   * How long the discount applies. 'once' = single use, 'repeating' = multiple billing periods, 'forever' = indefinitely.
   */
  duration?: 'once' | 'repeating' | 'forever';
  /**
   * Number of months the coupon applies if duration is 'repeating'.
   */
  duration_in_months?: number;
  /**
   * Maximum number of times this coupon can be redeemed across all customers.
   */
  max_redemptions?: number;
  /**
   * Number of times this coupon has been redeemed.
   */
  times_redeemed?: number;
  /**
   * Arbitrary key-value metadata attached to the coupon.
   */
  metadata?: {
    /**
     * Metadata value
     */
    [k: string]: string | undefined;
  };
}
/**
 * Discount codes input for checkout create/update requests.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "DiscountsRequest".
 */
export interface DiscountsRequest {
  /**
   * Discount codes to apply. Case-insensitive. Replaces previously submitted codes. Send empty array to clear.
   */
  codes?: string[];
}
/**
 * Discount codes input and applied discounts output in checkout responses.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "DiscountsResponse".
 */
export interface DiscountsResponse {
  /**
   * Echo of submitted discount codes.
   */
  codes?: string[];
  /**
   * Discounts successfully applied (code-based and automatic).
   */
  applied?: AppliedDiscount[];
  /**
   * Discount codes that could not be applied, with reasons.
   */
  rejected?: RejectedDiscount[];
}
/**
 * A discount code that could not be applied, with the reason.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "RejectedDiscount".
 */
export interface RejectedDiscount {
  /**
   * The discount code that was rejected.
   */
  code: string;
  /**
   * Error code indicating why the discount was rejected.
   */
  reason:
    | 'discount_code_expired'
    | 'discount_code_invalid'
    | 'discount_code_already_applied'
    | 'discount_code_combination_disallowed'
    | 'discount_code_minimum_not_met'
    | 'discount_code_user_not_logged_in'
    | 'discount_code_user_ineligible'
    | 'discount_code_usage_limit_reached';
  /**
   * Human-readable explanation of why the code was rejected.
   */
  message?: string;
}
/**
 * Payment configuration returned by the seller including accepted methods and handlers
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "PaymentResponse".
 */
export interface PaymentResponse {
  /**
   * Payment provider identifier
   */
  provider?: string;
  /**
   * Available payment instruments
   */
  instruments?: {
    [k: string]: unknown | undefined;
  }[];
  /**
   * Available payment handlers
   */
  handlers?: {
    [k: string]: unknown | undefined;
  }[];
}
/**
 * Risk and fraud detection signals for the checkout session
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "RiskSignals".
 */
export interface RiskSignals {
  /**
   * IP address of the buyer
   */
  ip_address?: string;
  /**
   * User agent string of the buyer's browser
   */
  user_agent?: string;
  /**
   * Accept-Language header from the buyer's browser
   */
  accept_language?: string;
  /**
   * Session identifier for the buyer
   */
  session_id?: string;
  /**
   * Device fingerprint for fraud detection
   */
  device_fingerprint?: string;
}
/**
 * Order returned after checkout completion. Contains order details and optional rich post-purchase tracking.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Order".
 */
export interface Order {
  /**
   * Discriminator field for webhook payloads. Always 'order' when present.
   */
  type?: 'order';
  /**
   * Unique identifier for the order
   */
  id: string;
  /**
   * ID of the checkout session that created this order
   */
  checkout_session_id: string;
  /**
   * Human-readable order number for customer reference
   */
  order_number?: string;
  /**
   * Reference from the client (agent/platform) stored on the order for reconciliation (e.g. platform transaction id, PO number, ERP id).
   */
  client_reference_id?: string;
  /**
   * Permanent URL where the customer can view order details
   */
  permalink_url: string;
  /**
   * Order-level status. Implementations MUST accept unrecognized values gracefully. Defined values: 'created', 'confirmed', 'manual_review', 'processing', 'shipped', 'completed', 'canceled'. 'completed' means all items have been delivered/received regardless of fulfillment method. Distinct from LineItem.status 'fulfilled', which indicates the seller has dispatched the item.
   */
  status?: string;
  estimated_delivery?: EstimatedDelivery1;
  confirmation?: OrderConfirmation1;
  support?: SupportInfo1;
  /**
   * What was ordered, with per-item fulfillment tracking
   */
  line_items?: OrderLineItem[];
  /**
   * How items are being delivered (shipping, pickup, digital)
   */
  fulfillments?: Fulfillment[];
  /**
   * Post-order changes: refunds, credits, returns, disputes
   */
  adjustments?: Adjustment[];
  /**
   * Order-level totals using the same Total schema as checkout. The 'total' entry is always the original charged amount. 'amount_refunded' tracks cumulative refunds.
   */
  totals?: Total[];
}
/**
 * Estimated delivery time range
 */
export interface EstimatedDelivery1 {
  /**
   * RFC 3339 timestamp for earliest expected delivery
   */
  earliest: string;
  /**
   * RFC 3339 timestamp for latest expected delivery
   */
  latest: string;
}
/**
 * Order confirmation details
 */
export interface OrderConfirmation1 {
  /**
   * Order confirmation number
   */
  confirmation_number?: string;
  /**
   * Whether a confirmation email has been sent
   */
  confirmation_email_sent?: boolean;
  /**
   * URL to the order receipt
   */
  receipt_url?: string;
  /**
   * Invoice number if generated
   */
  invoice_number?: string;
  /**
   * Echo of order_notes attached to the order.
   */
  order_notes?: string;
}
/**
 * Customer support contact information
 */
export interface SupportInfo1 {
  /**
   * Support contact email
   */
  email?: string;
  /**
   * Support contact phone number
   */
  phone?: string;
  /**
   * Support hours of operation
   */
  hours?: string;
  /**
   * URL to merchant's help center
   */
  help_center_url?: string;
}
/**
 * Per-line-item tracking of what was ordered and fulfillment progress.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "OrderLineItem".
 */
export interface OrderLineItem {
  /**
   * Line item identifier, used for references in fulfillments and adjustments
   */
  id: string;
  /**
   * Product name
   */
  title: string;
  /**
   * Catalog product ID
   */
  product_id?: string;
  /**
   * Product description
   */
  description?: string;
  /**
   * Product image URL
   */
  image_url?: string;
  /**
   * Product page URL
   */
  url?: string;
  quantity: OrderLineItemQuantity;
  /**
   * Price per unit in minor currency units (cents)
   */
  unit_price?: number;
  /**
   * Line total in minor currency units
   */
  subtotal?: number;
  /**
   * Optional line-item level totals breakdown using the same Total schema as checkout. Merchants who can provide richer breakdowns MAY use this alongside or instead of unit_price/subtotal.
   */
  totals?: Total[];
  /**
   * Derived from quantity fields. Implementations MUST accept unrecognized values gracefully. Defined values: 'processing', 'partial', 'fulfilled', 'removed'. Rules: 'removed' if current==0, 'fulfilled' if fulfilled==current, 'partial' if 0<fulfilled<current, 'processing' otherwise.
   */
  status?: string;
}
/**
 * Quantity tracking for an order line item. Uses a 3-field model: ordered (original), current (active after cancellations/returns), fulfilled (completed).
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "OrderLineItemQuantity".
 */
export interface OrderLineItemQuantity {
  /**
   * Quantity originally ordered by the customer
   */
  ordered: number;
  /**
   * Current active quantity on the order. May be less than ordered due to cancellations or returns. A value of 0 means the line item has been fully removed.
   */
  current: number;
  /**
   * Quantity that has been fulfilled (shipped, picked up, or digitally delivered). Applies to all fulfillment types, not just shipping.
   */
  fulfilled?: number;
}
/**
 * A fulfillment represents how items are delivered to the buyer (shipping, pickup, digital).
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Fulfillment".
 */
export interface Fulfillment {
  /**
   * Fulfillment identifier
   */
  id: string;
  /**
   * Fulfillment method type
   */
  type: 'shipping' | 'pickup' | 'digital';
  /**
   * Current fulfillment status. Implementations MUST accept unrecognized values gracefully. Defined values: 'pending', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'failed', 'canceled'. Not all statuses apply to all types.
   */
  status?: string;
  /**
   * Which line items and quantities are in this fulfillment
   */
  line_items?: LineItemReference[];
  /**
   * Carrier name (e.g., 'FedEx', 'UPS', 'USPS'). Applies to type: shipping.
   */
  carrier?: string;
  /**
   * Carrier tracking number. Applies to type: shipping.
   */
  tracking_number?: string;
  /**
   * URL to track this shipment. Applies to type: shipping.
   */
  tracking_url?: string;
  destination?: Address;
  estimated_delivery?: EstimatedDelivery;
  /**
   * Digital delivery details. Applies to type: digital.
   */
  digital_delivery?: {
    /**
     * URL to access digital content (download link, streaming page, etc.)
     */
    access_url?: string;
    /**
     * License or activation key
     */
    license_key?: string;
    /**
     * When access expires (RFC 3339 timestamp)
     */
    expires_at?: string;
  };
  /**
   * Human-readable description (e.g., 'Backordered - ships Feb 15')
   */
  description?: string;
  /**
   * Append-only event log tracking fulfillment progress
   */
  events?: FulfillmentEvent[];
}
/**
 * Reference to a line item with quantity, used in fulfillments and adjustments
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "LineItemReference".
 */
export interface LineItemReference {
  /**
   * Line item ID reference
   */
  id: string;
  /**
   * Quantity in this fulfillment or adjustment
   */
  quantity: number;
}
/**
 * A point-in-time event in the fulfillment lifecycle.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "FulfillmentEvent".
 */
export interface FulfillmentEvent {
  /**
   * Event identifier
   */
  id: string;
  /**
   * Event type. Implementations MUST accept unrecognized values gracefully. Defined values: 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'failed_attempt', 'returned_to_sender', 'canceled', 'undeliverable'. 'out_for_delivery' and 'ready_for_pickup' are ACP extensions for richer agent experiences.
   */
  type: string;
  /**
   * RFC 3339 timestamp when this event occurred
   */
  occurred_at: string;
  /**
   * Human-readable description (e.g., 'Left at front door')
   */
  description?: string;
  /**
   * Location where this event occurred (e.g., 'Memphis, TN')
   */
  location?: string;
}
/**
 * A post-order change such as refund, credit, return, or dispute.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Adjustment".
 */
export interface Adjustment {
  /**
   * Adjustment identifier
   */
  id: string;
  /**
   * Type of adjustment. Implementations MUST accept unrecognized values gracefully. Defined values: 'refund', 'credit', 'return', 'exchange', 'price_adjustment', 'cancellation', 'dispute'. Use 'refund' for both full and partial refunds (distinguish by amount). 'credit' replaces 'store_credit'. 'dispute' covers chargebacks.
   */
  type: string;
  /**
   * RFC 3339 timestamp when this adjustment occurred
   */
  occurred_at: string;
  /**
   * Adjustment status. Implementations MUST accept unrecognized values gracefully. Defined values: 'pending', 'completed', 'failed'.
   */
  status: string;
  /**
   * Which line items and quantities are affected
   */
  line_items?: LineItemReference[];
  /**
   * Total amount credited to the buyer in minor currency units, inclusive of any applicable tax
   */
  amount?: number;
  /**
   * ISO 4217 currency code
   */
  currency?: string;
  /**
   * Human-readable reason (e.g., 'Defective item')
   */
  description?: string;
  /**
   * Structured reason code
   */
  reason?: string;
}
/**
 * Seller-provided authentication metadata for 3DS flows.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "AuthenticationMetadata".
 */
export interface AuthenticationMetadata {
  /**
   * Details about the acquirer used for this 3DS Authentication. This object MUST be present.
   */
  acquirer_details: {
    /**
     * The Acquirer BIN (directory-server specific).
     */
    acquirer_bin: string;
    /**
     * Two-letter ISO 3166-1 alpha-2 country code.
     */
    acquirer_country: string;
    /**
     * The Merchant ID assigned by the acquirer.
     */
    acquirer_merchant_id: string;
    /**
     * Merchant name assigned by the acquirer.
     */
    merchant_name: string;
    /**
     * Requestor ID (if required by the directory server).
     */
    requestor_id?: string;
  };
  /**
   * The 3DS directory server used for this Authentication.
   */
  directory_server: 'american_express' | 'mastercard' | 'visa';
  /**
   * Contains additional details on the seller's preference for the 3DS authentication flow. Sellers MAY request a preference, but issuers ultimately decide the actual flow.
   */
  flow_preference?: {
    /**
     * Type of flow requested for this 3DS Authentication. 'challenge' requests a challenge flow; 'frictionless' requests a frictionless flow.
     */
    type: 'challenge' | 'frictionless';
    /**
     * Details about the requested challenge flow.
     */
    challenge?: {
      /**
       * Subtype of challenge preference.
       */
      type?: 'mandated' | 'preferred';
    };
    /**
     * Details about the requested frictionless flow.
     */
    frictionless?: {
      /**
       * Subtype of frictionless preference.
       */
      type?: 'low_risk';
    };
  };
  [k: string]: unknown | undefined;
}
/**
 * Seller-declared marketing consent option that specifies an available channel for which the seller must obtain the buyer's consent before sending marketing content
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "MarketingConsentOption".
 */
export interface MarketingConsentOption {
  /**
   * Channel for marketing consent.
   */
  channel: string;
  /**
   * What the buyer is consenting to receive, e.g., 'promotional emails, product launches, and exclusive offers'. Agents MAY use this to compose their own consent prompt.
   */
  display_text: string;
  /**
   * URL to the seller's privacy policy governing use of the buyer's contact information for marketing.
   */
  privacy_policy_url: string;
  /**
   * Whether the buyer is currently subscribed to marketing via this channel. When true, agents SHOULD render the consent checkbox as pre-checked. Defaults to false if omitted.
   */
  is_subscribed?: boolean;
}
/**
 * Buyer's marketing consent decision for a specific channel submitted at checkout completion
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "MarketingConsent".
 */
export interface MarketingConsent {
  /**
   * Channel matching the consent option channel.
   */
  channel: string;
  /**
   * Whether the buyer consented to receive marketing via this channel.
   */
  opted_in: boolean;
}
/**
 * Base checkout session model containing common fields for all checkout session states
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "CheckoutSessionBase".
 */
export interface CheckoutSessionBase {
  /**
   * Unique identifier for the checkout session
   */
  id: string;
  protocol?: ProtocolVersion1;
  capabilities: Capabilities1;
  buyer?: Buyer1;
  /**
   * Current status of the checkout session
   */
  status:
    | 'incomplete'
    | 'not_ready_for_payment'
    | 'requires_escalation'
    | 'authentication_required'
    | 'ready_for_payment'
    | 'pending_approval'
    | 'complete_in_progress'
    | 'completed'
    | 'canceled'
    | 'in_progress'
    | 'expired';
  /**
   * ISO 4217 settlement currency code
   */
  currency: string;
  /**
   * ISO 4217 presentment currency code if different from settlement currency
   */
  presentment_currency?: string;
  /**
   * Exchange rate from presentment to settlement currency
   */
  exchange_rate?: number;
  /**
   * RFC 3339 timestamp when exchange rate was determined
   */
  exchange_rate_timestamp?: string;
  /**
   * Locale code (e.g., 'en-US') for localizing content
   */
  locale?: string;
  /**
   * IANA timezone identifier (e.g., 'America/New_York')
   */
  timezone?: string;
  /**
   * Line items in the checkout session
   */
  line_items: LineItem[];
  fulfillment_details?: FulfillmentDetails2;
  /**
   * Available fulfillment options
   */
  fulfillment_options: (
    | FulfillmentOptionShipping
    | FulfillmentOptionDigital
    | FulfillmentOptionPickup
    | FulfillmentOptionLocalDelivery
  )[];
  /**
   * Currently selected fulfillment options
   */
  selected_fulfillment_options?: SelectedFulfillmentOption[];
  /**
   * Optional grouping of line items by fulfillment method
   */
  fulfillment_groups?: FulfillmentGroup[];
  /**
   * Cart-level totals breakdown
   */
  totals: Total[];
  /**
   * Messages to communicate with the buyer (info, warnings, errors)
   */
  messages: (MessageInfo | MessageWarning | MessageError)[];
  /**
   * Relevant links (terms, policies, support)
   */
  links: Link[];
  authentication_metadata?: AuthenticationMetadata1;
  /**
   * RFC 3339 timestamp when the session was created
   */
  created_at?: string;
  /**
   * RFC 3339 timestamp of last update
   */
  updated_at?: string;
  /**
   * RFC 3339 timestamp when the session expires
   */
  expires_at?: string;
  /**
   * URL to continue or resume the checkout session
   */
  continue_url?: string;
  /**
   * Arbitrary metadata for merchant use
   */
  metadata?: {
    [k: string]: unknown | undefined;
  };
  /**
   * Quote identifier if this session is based on a quote
   */
  quote_id?: string;
  /**
   * RFC 3339 timestamp when the quote expires
   */
  quote_expires_at?: string;
  discounts?: DiscountsResponse1;
  /**
   * Marketing consent options the seller offers. When present, the agent SHOULD display these to the buyer before checkout completion. Agents MAY selectively surface a subset of options; options not surfaced MUST be omitted from marketing_consents in the complete request. When absent, the agent MUST NOT surface any marketing consent UI. An empty array is equivalent to absent.
   */
  marketing_consent_options?: MarketingConsentOption[];
  order?: Order;
}
/**
 * Protocol version metadata
 */
export interface ProtocolVersion1 {
  /**
   * ACP protocol version in YYYY-MM-DD format.
   */
  version: string;
}
/**
 * Negotiated capabilities between agent and seller
 */
export interface Capabilities1 {
  payment?: Payment;
  interventions?: InterventionCapabilities;
  /**
   * Extensions supported by the party. Requests: array of extension identifiers. Responses: array of extension declaration objects.
   */
  extensions?: string[] | ExtensionDeclaration[];
}
/**
 * Buyer information
 */
export interface Buyer1 {
  /**
   * Buyer's first name
   */
  first_name?: string;
  /**
   * Buyer's last name
   */
  last_name?: string;
  /**
   * Buyer's full name
   */
  full_name?: string;
  /**
   * Buyer's email address
   */
  email: string;
  /**
   * Buyer's phone number
   */
  phone_number?: string;
  /**
   * Merchant's internal customer identifier
   */
  customer_id?: string;
  /**
   * Type of buyer account
   */
  account_type?: 'guest' | 'registered' | 'business';
  /**
   * Buyer's authentication status
   */
  authentication_status?: 'authenticated' | 'guest' | 'requires_signin';
  company?: CompanyInfo1;
  loyalty?: LoyaltyInfo1;
  tax_exemption?: TaxExemption1;
}
/**
 * Fulfillment contact and address details
 */
export interface FulfillmentDetails2 {
  /**
   * Full name for fulfillment contact
   */
  name?: string;
  /**
   * Contact phone number. E.164 format recommended (e.g., +15551234567) for global interoperability and SMS/delivery carrier systems.
   */
  phone_number?: string;
  /**
   * Contact email address
   */
  email?: string;
  address?: Address1;
}
/**
 * Authentication metadata for payment interventions (e.g., 3DS)
 */
export interface AuthenticationMetadata1 {
  /**
   * Details about the acquirer used for this 3DS Authentication. This object MUST be present.
   */
  acquirer_details: {
    /**
     * The Acquirer BIN (directory-server specific).
     */
    acquirer_bin: string;
    /**
     * Two-letter ISO 3166-1 alpha-2 country code.
     */
    acquirer_country: string;
    /**
     * The Merchant ID assigned by the acquirer.
     */
    acquirer_merchant_id: string;
    /**
     * Merchant name assigned by the acquirer.
     */
    merchant_name: string;
    /**
     * Requestor ID (if required by the directory server).
     */
    requestor_id?: string;
  };
  /**
   * The 3DS directory server used for this Authentication.
   */
  directory_server: 'american_express' | 'mastercard' | 'visa';
  /**
   * Contains additional details on the seller's preference for the 3DS authentication flow. Sellers MAY request a preference, but issuers ultimately decide the actual flow.
   */
  flow_preference?: {
    /**
     * Type of flow requested for this 3DS Authentication. 'challenge' requests a challenge flow; 'frictionless' requests a frictionless flow.
     */
    type: 'challenge' | 'frictionless';
    /**
     * Details about the requested challenge flow.
     */
    challenge?: {
      /**
       * Subtype of challenge preference.
       */
      type?: 'mandated' | 'preferred';
    };
    /**
     * Details about the requested frictionless flow.
     */
    frictionless?: {
      /**
       * Subtype of frictionless preference.
       */
      type?: 'low_risk';
    };
  };
  [k: string]: unknown | undefined;
}
/**
 * Discount extension: submitted codes and applied discounts. Present when the 'discount' extension is active.
 */
export interface DiscountsResponse1 {
  /**
   * Echo of submitted discount codes.
   */
  codes?: string[];
  /**
   * Discounts successfully applied (code-based and automatic).
   */
  applied?: AppliedDiscount[];
  /**
   * Discount codes that could not be applied, with reasons.
   */
  rejected?: RejectedDiscount[];
}
/**
 * Order returned after checkout completion. Contains order details and optional rich post-purchase tracking.
 */
export interface Order1 {
  /**
   * Discriminator field for webhook payloads. Always 'order' when present.
   */
  type?: 'order';
  /**
   * Unique identifier for the order
   */
  id: string;
  /**
   * ID of the checkout session that created this order
   */
  checkout_session_id: string;
  /**
   * Human-readable order number for customer reference
   */
  order_number?: string;
  /**
   * Reference from the client (agent/platform) stored on the order for reconciliation (e.g. platform transaction id, PO number, ERP id).
   */
  client_reference_id?: string;
  /**
   * Permanent URL where the customer can view order details
   */
  permalink_url: string;
  /**
   * Order-level status. Implementations MUST accept unrecognized values gracefully. Defined values: 'created', 'confirmed', 'manual_review', 'processing', 'shipped', 'completed', 'canceled'. 'completed' means all items have been delivered/received regardless of fulfillment method. Distinct from LineItem.status 'fulfilled', which indicates the seller has dispatched the item.
   */
  status?: string;
  estimated_delivery?: EstimatedDelivery1;
  confirmation?: OrderConfirmation1;
  support?: SupportInfo1;
  /**
   * What was ordered, with per-item fulfillment tracking
   */
  line_items?: OrderLineItem[];
  /**
   * How items are being delivered (shipping, pickup, digital)
   */
  fulfillments?: Fulfillment[];
  /**
   * Post-order changes: refunds, credits, returns, disputes
   */
  adjustments?: Adjustment[];
  /**
   * Order-level totals using the same Total schema as checkout. The 'total' entry is always the original charged amount. 'amount_refunded' tracks cumulative refunds.
   */
  totals?: Total[];
}
/**
 * Request to create a new checkout session
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "CheckoutSessionCreateRequest".
 */
export interface CheckoutSessionCreateRequest {
  buyer?: Buyer2;
  /**
   * Items to add to the checkout session
   *
   * @minItems 1
   */
  line_items: [Item, ...Item[]];
  /**
   * ISO 4217 currency code
   */
  currency: string;
  fulfillment_details?: FulfillmentDetails3;
  capabilities: Capabilities2;
  /**
   * Grouping of items by fulfillment method
   */
  fulfillment_groups?: FulfillmentGroup[];
  affiliate_attribution?: AffiliateAttribution2;
  /**
   * DEPRECATED: Use discounts.codes instead. Discount codes to apply.
   */
  coupons?: string[];
  discounts?: DiscountsRequest1;
  /**
   * Locale code for localizing content (e.g., 'en-US')
   */
  locale?: string;
  /**
   * IANA timezone identifier (e.g., 'America/New_York')
   */
  timezone?: string;
  /**
   * Quote identifier if this session is based on a quote
   */
  quote_id?: string;
  /**
   * Arbitrary metadata for merchant use
   */
  metadata?: {
    [k: string]: unknown | undefined;
  };
  /**
   * Optional customer/order notes (e.g., delivery instructions, gift message).
   */
  order_notes?: string;
}
/**
 * Buyer information
 */
export interface Buyer2 {
  /**
   * Buyer's first name
   */
  first_name?: string;
  /**
   * Buyer's last name
   */
  last_name?: string;
  /**
   * Buyer's full name
   */
  full_name?: string;
  /**
   * Buyer's email address
   */
  email: string;
  /**
   * Buyer's phone number
   */
  phone_number?: string;
  /**
   * Merchant's internal customer identifier
   */
  customer_id?: string;
  /**
   * Type of buyer account
   */
  account_type?: 'guest' | 'registered' | 'business';
  /**
   * Buyer's authentication status
   */
  authentication_status?: 'authenticated' | 'guest' | 'requires_signin';
  company?: CompanyInfo1;
  loyalty?: LoyaltyInfo1;
  tax_exemption?: TaxExemption1;
}
/**
 * Fulfillment contact and address details
 */
export interface FulfillmentDetails3 {
  /**
   * Full name for fulfillment contact
   */
  name?: string;
  /**
   * Contact phone number. E.164 format recommended (e.g., +15551234567) for global interoperability and SMS/delivery carrier systems.
   */
  phone_number?: string;
  /**
   * Contact email address
   */
  email?: string;
  address?: Address1;
}
/**
 * Agent capabilities and supported features
 */
export interface Capabilities2 {
  payment?: Payment;
  interventions?: InterventionCapabilities;
  /**
   * Extensions supported by the party. Requests: array of extension identifiers. Responses: array of extension declaration objects.
   */
  extensions?: string[] | ExtensionDeclaration[];
}
/**
 * Discount codes to apply to the checkout session.
 */
export interface DiscountsRequest1 {
  /**
   * Discount codes to apply. Case-insensitive. Replaces previously submitted codes. Send empty array to clear.
   */
  codes?: string[];
}
/**
 * Request to update an existing checkout session
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "CheckoutSessionUpdateRequest".
 */
export interface CheckoutSessionUpdateRequest {
  buyer?: Buyer3;
  /**
   * Items to update in the checkout session
   */
  line_items?: Item[];
  fulfillment_details?: FulfillmentDetails4;
  /**
   * Updated fulfillment groupings
   */
  fulfillment_groups?: FulfillmentGroup[];
  /**
   * Fulfillment option selected by the buyer
   */
  selected_fulfillment_options?: SelectedFulfillmentOption[];
  /**
   * DEPRECATED: Use discounts.codes instead. Discount codes to apply.
   */
  coupons?: string[];
  discounts?: DiscountsRequest2;
  /**
   * Optional customer/order notes.
   */
  order_notes?: string;
}
/**
 * Updated buyer information
 */
export interface Buyer3 {
  /**
   * Buyer's first name
   */
  first_name?: string;
  /**
   * Buyer's last name
   */
  last_name?: string;
  /**
   * Buyer's full name
   */
  full_name?: string;
  /**
   * Buyer's email address
   */
  email: string;
  /**
   * Buyer's phone number
   */
  phone_number?: string;
  /**
   * Merchant's internal customer identifier
   */
  customer_id?: string;
  /**
   * Type of buyer account
   */
  account_type?: 'guest' | 'registered' | 'business';
  /**
   * Buyer's authentication status
   */
  authentication_status?: 'authenticated' | 'guest' | 'requires_signin';
  company?: CompanyInfo1;
  loyalty?: LoyaltyInfo1;
  tax_exemption?: TaxExemption1;
}
/**
 * Updated fulfillment contact and address
 */
export interface FulfillmentDetails4 {
  /**
   * Full name for fulfillment contact
   */
  name?: string;
  /**
   * Contact phone number. E.164 format recommended (e.g., +15551234567) for global interoperability and SMS/delivery carrier systems.
   */
  phone_number?: string;
  /**
   * Contact email address
   */
  email?: string;
  address?: Address1;
}
/**
 * Discount codes to apply. Replaces previously submitted codes.
 */
export interface DiscountsRequest2 {
  /**
   * Discount codes to apply. Case-insensitive. Replaces previously submitted codes. Send empty array to clear.
   */
  codes?: string[];
}
/**
 * Request to complete a checkout session and create an order
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "CheckoutSessionCompleteRequest".
 */
export interface CheckoutSessionCompleteRequest {
  buyer?: Buyer4;
  payment_data: PaymentData2;
  authentication_result?: AuthenticationResult1;
  affiliate_attribution?: AffiliateAttribution3;
  risk_signals?: RiskSignals1;
  /**
   * Buyer's marketing consent decisions. Agents SHOULD include an entry for each consent option surfaced to the buyer. Options not surfaced MUST be omitted — omission preserves existing subscription state. Sellers SHOULD ignore entries in marketing_consents that do not correspond to a channel in marketing_consent_options.
   */
  marketing_consents?: MarketingConsent[];
  /**
   * Optional customer/order notes (delivery instructions, gift message).
   */
  order_notes?: string;
}
/**
 * Final buyer information
 */
export interface Buyer4 {
  /**
   * Buyer's first name
   */
  first_name?: string;
  /**
   * Buyer's last name
   */
  last_name?: string;
  /**
   * Buyer's full name
   */
  full_name?: string;
  /**
   * Buyer's email address
   */
  email: string;
  /**
   * Buyer's phone number
   */
  phone_number?: string;
  /**
   * Merchant's internal customer identifier
   */
  customer_id?: string;
  /**
   * Type of buyer account
   */
  account_type?: 'guest' | 'registered' | 'business';
  /**
   * Buyer's authentication status
   */
  authentication_status?: 'authenticated' | 'guest' | 'requires_signin';
  company?: CompanyInfo1;
  loyalty?: LoyaltyInfo1;
  tax_exemption?: TaxExemption1;
}
/**
 * Risk and fraud signals
 */
export interface RiskSignals1 {
  /**
   * IP address of the buyer
   */
  ip_address?: string;
  /**
   * User agent string of the buyer's browser
   */
  user_agent?: string;
  /**
   * Accept-Language header from the buyer's browser
   */
  accept_language?: string;
  /**
   * Session identifier for the buyer
   */
  session_id?: string;
  /**
   * Device fingerprint for fraud detection
   */
  device_fingerprint?: string;
}
/**
 * Structured reason for why a buyer action was taken, used for analytics and debugging
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "IntentTrace".
 */
export interface IntentTrace {
  /**
   * Reason for abandonment. This enum is extensible: servers SHOULD accept unrecognized values and treat them as 'other' (see RFC Section 7.2). Validators SHOULD be configured for lenient enum handling.
   */
  reason_code:
    | 'price_sensitivity'
    | 'shipping_cost'
    | 'shipping_speed'
    | 'product_fit'
    | 'trust_security'
    | 'returns_policy'
    | 'payment_options'
    | 'comparison'
    | 'timing_deferred'
    | 'other';
  /**
   * A generated summary of the specific objection or negotiation gap.
   */
  trace_summary?: string;
  /**
   * Additional structured metadata about the intent
   */
  metadata?: {
    /**
     * Metadata value
     */
    [k: string]: (string | number | boolean) | undefined;
  };
}
/**
 * Request to cancel a checkout session
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "CancelSessionRequest".
 */
export interface CancelSessionRequest {
  intent_trace?: IntentTrace;
}
/**
 * Well-known discovery document served at /.well-known/acp.json. Describes the seller's capabilities. This is stable, deterministic information that does not vary per session. Session-specific capabilities (payment methods, payment handlers) are negotiated inline via the capabilities object on POST /checkout_sessions.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "DiscoveryResponse".
 */
export interface DiscoveryResponse {
  protocol: DiscoveryProtocol;
  /**
   * Base URL for the ACP REST API. Agents append resource paths to this URL (e.g., {api_base_url}/checkout_sessions).
   */
  api_base_url: string;
  /**
   * Transport bindings supported by this seller. "rest" indicates the REST API at api_base_url. "mcp" indicates a Model Context Protocol server is available (see SEP #135). New values are introduced in new API versions; agents MAY treat this enum as exhaustive for a given version.
   */
  transports: ('rest' | 'mcp')[];
  capabilities: DiscoveryCapabilities;
}
/**
 * Protocol identification and version information.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "DiscoveryProtocol".
 */
export interface DiscoveryProtocol {
  /**
   * Protocol identifier. Always "acp".
   */
  name: 'acp';
  /**
   * The current (latest) API version supported by the seller, in YYYY-MM-DD format.
   */
  version: string;
  /**
   * All API versions the seller currently supports, in chronological order (oldest first). Agents SHOULD use the API-Version header to request a specific version. The last element is always the latest supported version.
   */
  supported_versions: string[];
  /**
   * URL to the seller's ACP documentation.
   */
  documentation_url?: string;
}
/**
 * Seller capabilities advertised in the well-known discovery document. Contains feature declarations that are stable across sessions.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "DiscoveryCapabilities".
 */
export interface DiscoveryCapabilities {
  /**
   * Services available from this seller. Indicates which ACP operations are implemented. This enum is closed per API version; new values are introduced in new API versions. Agents MAY treat the set as exhaustive for a given version.
   */
  services: ('checkout' | 'orders' | 'delegate_payment' | 'carts')[];
  /**
   * Extensions the seller supports. Whether a specific extension is active for a given session is determined during checkout session creation.
   */
  extensions?: DiscoveryExtension[];
  /**
   * Intervention types the seller supports. Actual availability for a specific session is negotiated via the capabilities object on POST /checkout_sessions. This enum is closed per API version; new values are introduced in new API versions. Agents MAY treat the set as exhaustive for a given version.
   */
  intervention_types?: ('3ds' | 'biometric' | 'address_verification')[];
  /**
   * ISO 4217 currency codes supported by the seller.
   */
  supported_currencies?: string[];
  /**
   * BCP 47 locale tags supported by the seller for localized responses.
   */
  supported_locales?: string[];
}
/**
 * High-level extension declaration in the discovery document. Identifies the extension and provides a spec URL, but does not include session-level details like schema or extends fields.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "DiscoveryExtension".
 */
export interface DiscoveryExtension {
  /**
   * Extension identifier (e.g., "discount", "fulfillment").
   */
  name: string;
  /**
   * URL to the extension's specification document.
   */
  spec?: string;
  /**
   * URL to the extension's JSON Schema definition for programmatic validation.
   */
  schema?: string;
}
/**
 * Protocol-level error returned in 4xx/5xx responses when the server cannot return a valid CheckoutSession at all (e.g. malformed request or unexpected failure). Use Error—not MessageError—when there is no valid session state to return. type semantics: invalid_request — malformed request, missing required fields, invalid JSON, or idempotency violations (codes: idempotency_key_required, idempotency_in_flight, idempotency_conflict); processing_error — unexpected server-side failure; service_unavailable — temporary unavailability.
 *
 * This interface was referenced by `AgenticCheckoutSchemaBundle`'s JSON-Schema
 * via the `definition` "Error".
 */
export interface Error {
  /**
   * Error type indicating the category of protocol-level error
   */
  type: 'invalid_request' | 'processing_error' | 'service_unavailable';
  /**
   * Implementation-defined error code
   */
  code: string;
  /**
   * Human-readable error message
   */
  message: string;
  /**
   * RFC 9535 JSONPath (optional)
   */
  param?: string;
  /**
   * List of API versions supported by the server, ordered by preference (newest first). Only included in version-related errors.
   */
  supported_versions?: string[];
}
