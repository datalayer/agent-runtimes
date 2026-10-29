# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
#
# GENERATED — do not edit. The Agentic Commerce Protocol 2026-04-17, its
# checkout models: datamodel-code-generator 0.34.0 over
# agentic-commerce-protocol/agentic-commerce-protocol spec/2026-04-17/
# json-schema/schema.agentic_checkout.json (Apache 2.0), with
#   --output-model-type pydantic_v2.BaseModel --target-python-version 3.11
#   --use-standard-collections --use-union-operator --disable-timestamp
# Regenerate with scripts/codegen/generate_agentic_commerce.sh.
# ruff: noqa

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import (
    AnyUrl,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    RootModel,
    confloat,
    conint,
    constr,
)


class AgenticCheckoutSchemaBundle(RootModel[Any]):
    root: Any = Field(..., title="Agentic Checkout — Schema Bundle")


class VariantOption(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: str = Field(..., description="Variant attribute name (e.g., 'Size', 'Color')")
    value: str = Field(
        ..., description="Variant attribute value (e.g., 'Large', 'Blue')"
    )


class Unit(Enum):
    g = "g"
    kg = "kg"
    oz = "oz"
    lb = "lb"


class WeightInfo(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    value: float = Field(..., description="Numeric weight value")
    unit: Unit = Field(..., description="Unit of measurement for weight")


class Unit1(Enum):
    cm = "cm"
    in_ = "in"


class DimensionsInfo(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    length: float = Field(..., description="Length dimension")
    width: float = Field(..., description="Width dimension")
    height: float = Field(..., description="Height dimension")
    unit: Unit1 = Field(..., description="Unit of measurement for dimensions")


class Type(Enum):
    percentage = "percentage"
    fixed = "fixed"
    bogo = "bogo"
    volume = "volume"


class Source(Enum):
    coupon = "coupon"
    automatic = "automatic"
    loyalty = "loyalty"


class DiscountDetail(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    code: str | None = Field(None, description="Discount code if applicable")
    type: Type = Field(..., description="Type of discount")
    amount: int = Field(
        ...,
        description="Discount amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)",
    )
    description: str | None = Field(
        None, description="Human-readable discount description"
    )
    source: Source | None = Field(None, description="Source of the discount")


class Address(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: str = Field(..., description="Recipient name for this address")
    line_one: str = Field(..., description="Primary street address line")
    line_two: str | None = Field(
        None, description="Secondary address line (apartment, suite, etc.)"
    )
    city: str = Field(..., description="City name")
    state: str = Field(..., description="State or province code")
    country: str = Field(..., description="ISO 3166-1 alpha-2 country code")
    postal_code: str = Field(..., description="Postal or ZIP code")
    company: str | None = Field(None, description="Postal or ZIP code")


class Type1(Enum):
    url = "url"
    platform = "platform"
    unknown = "unknown"


class AffiliateAttributionSource(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Type1 = Field(..., description="The type of attribution source.")
    url: AnyUrl | None = Field(
        None, description="Canonical content URL when type is 'url'."
    )


class AffiliateAttributionMetadata(RootModel[dict[str, str | float | bool]]):
    root: dict[str, str | float | bool]


class Touchpoint(Enum):
    first = "first"
    last = "last"


class AffiliateAttribution1(BaseModel):
    provider: str = Field(
        ...,
        description="Identifier for the attribution provider / affiliate network namespace (e.g., 'impact.com').",
    )
    token: str = Field(
        ...,
        description="Opaque provider-issued token for fraud-resistant validation. Treat as secret.",
    )
    publisher_id: str | None = Field(
        None,
        description="Provider-scoped affiliate/publisher identifier. Required if token is omitted.",
    )
    campaign_id: str | None = Field(
        None, description="Provider-scoped campaign identifier."
    )
    creative_id: str | None = Field(
        None, description="Provider-scoped creative identifier."
    )
    sub_id: str | None = Field(
        None, description="Provider-scoped sub-tracking identifier."
    )
    source: AffiliateAttributionSource | None = None
    issued_at: AwareDatetime | None = Field(
        None, description="RFC3339 timestamp when the attribution token was issued."
    )
    expires_at: AwareDatetime | None = Field(
        None, description="RFC3339 timestamp when the attribution token expires."
    )
    metadata: AffiliateAttributionMetadata | None = None
    touchpoint: Touchpoint | None = Field(
        None,
        description="Attribution touchpoint type. Use 'first' when capturing at session creation, 'last' when capturing at completion. Enables multi-touch attribution models.",
    )


class AffiliateAttribution2(BaseModel):
    provider: str = Field(
        ...,
        description="Identifier for the attribution provider / affiliate network namespace (e.g., 'impact.com').",
    )
    token: str | None = Field(
        None,
        description="Opaque provider-issued token for fraud-resistant validation. Treat as secret.",
    )
    publisher_id: str = Field(
        ...,
        description="Provider-scoped affiliate/publisher identifier. Required if token is omitted.",
    )
    campaign_id: str | None = Field(
        None, description="Provider-scoped campaign identifier."
    )
    creative_id: str | None = Field(
        None, description="Provider-scoped creative identifier."
    )
    sub_id: str | None = Field(
        None, description="Provider-scoped sub-tracking identifier."
    )
    source: AffiliateAttributionSource | None = None
    issued_at: AwareDatetime | None = Field(
        None, description="RFC3339 timestamp when the attribution token was issued."
    )
    expires_at: AwareDatetime | None = Field(
        None, description="RFC3339 timestamp when the attribution token expires."
    )
    metadata: AffiliateAttributionMetadata | None = None
    touchpoint: Touchpoint | None = Field(
        None,
        description="Attribution touchpoint type. Use 'first' when capturing at session creation, 'last' when capturing at completion. Enables multi-touch attribution models.",
    )


class AffiliateAttribution(RootModel[AffiliateAttribution1 | AffiliateAttribution2]):
    root: AffiliateAttribution1 | AffiliateAttribution2 = Field(
        ...,
        description="Optional affiliate attribution data for crediting third-party publishers. Write-only: not returned in responses. Forward compatibility: Servers SHOULD ignore unknown fields to support future extensions (per RFC §8.2).",
        examples=[
            {
                "provider": "impact.com",
                "token": "atp_01J8Z3WXYZ9ABC",
                "publisher_id": "pub_123",
                "campaign_id": "camp_summer2026",
                "touchpoint": "first",
                "source": {"type": "url", "url": "https://example.com/product-review"},
                "issued_at": "2026-02-11T10:00:00Z",
                "expires_at": "2026-02-11T11:00:00Z",
            }
        ],
    )


class FulfillmentDetails(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: str | None = Field(None, description="Full name for fulfillment contact")
    phone_number: str | None = Field(
        None,
        description="Contact phone number. E.164 format recommended (e.g., +15551234567) for global interoperability and SMS/delivery carrier systems.",
    )
    email: EmailStr | None = Field(None, description="Contact email address")
    address: Address | None = Field(None, description="Fulfillment address")


class CompanyInfo(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: str = Field(..., description="Company or organization name")
    tax_id: str | None = Field(None, description="Business tax identification number")
    department: str | None = Field(
        None, description="Department within the organization"
    )
    cost_center: str | None = Field(
        None, description="Cost center code for internal accounting"
    )


class LoyaltyInfo(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    tier: str | None = Field(None, description="Loyalty program tier level")
    points_balance: int | None = Field(
        None, description="Current loyalty points balance"
    )
    member_since: AwareDatetime | None = Field(
        None,
        description="RFC 3339 timestamp when the customer joined the loyalty program",
    )


class CertificateType(Enum):
    resale = "resale"
    exempt_organization = "exempt_organization"
    government = "government"


class TaxExemption(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    certificate_id: str = Field(
        ..., description="Unique identifier for the tax exemption certificate"
    )
    certificate_type: CertificateType = Field(
        ..., description="Type of tax exemption certificate"
    )
    exempt_regions: list[str] | None = Field(
        None,
        description="List of regions where the exemption applies (e.g., state codes)",
    )
    expires_at: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp when the exemption certificate expires"
    )


class AccountType(Enum):
    guest = "guest"
    registered = "registered"
    business = "business"


class AuthenticationStatus(Enum):
    authenticated = "authenticated"
    guest = "guest"
    requires_signin = "requires_signin"


class Buyer(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    first_name: str | None = Field(None, description="Buyer's first name")
    last_name: str | None = Field(None, description="Buyer's last name")
    full_name: str | None = Field(None, description="Buyer's full name")
    email: EmailStr = Field(..., description="Buyer's email address")
    phone_number: str | None = Field(None, description="Buyer's phone number")
    customer_id: str | None = Field(
        None, description="Merchant's internal customer identifier"
    )
    account_type: AccountType | None = Field(None, description="Type of buyer account")
    authentication_status: AuthenticationStatus | None = Field(
        None, description="Buyer's authentication status"
    )
    company: CompanyInfo | None = Field(
        None, description="Company information for business buyers"
    )
    loyalty: LoyaltyInfo | None = Field(None, description="Loyalty program information")
    tax_exemption: TaxExemption | None = Field(
        None, description="Tax exemption details"
    )


class SupportedEnum(Enum):
    field_3ds = "3ds"
    biometric = "biometric"
    address_verification = "address_verification"


class RequiredEnum(Enum):
    field_3ds = "3ds"
    biometric = "biometric"


class Enforcement(Enum):
    always = "always"
    conditional = "conditional"
    optional = "optional"


class DisplayContext(Enum):
    native = "native"
    webview = "webview"
    modal = "modal"
    redirect = "redirect"


class RedirectContext(Enum):
    in_app = "in_app"
    external_browser = "external_browser"
    none = "none"


class InterventionCapabilities(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    supported: list[SupportedEnum] | None = Field(
        None,
        description="Intervention types supported. Agent request: Interventions the agent can handle. Seller response: Intersection of supported interventions.",
    )
    required: list[RequiredEnum] | None = Field(
        None,
        description="Intervention methods required for this session (seller only).",
    )
    enforcement: Enforcement | None = Field(
        None, description="When required interventions are enforced (seller only)."
    )
    display_context: DisplayContext | None = Field(
        None, description="How the Agent presents interventions (agent only)."
    )
    redirect_context: RedirectContext | None = Field(
        None, description="How the Agent handles redirects (agent only)."
    )
    max_redirects: conint(ge=0) | None = Field(
        None,
        description="Maximum number of redirects the Agent can handle (agent only).",
    )
    max_interaction_depth: conint(ge=1) | None = Field(
        None,
        description="Maximum depth of nested interactions the Agent can handle (agent only).",
    )


class Extend(
    RootModel[constr(pattern=r"^\$\.[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9_]*)*$")]
):
    root: constr(pattern=r"^\$\.[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9_]*)*$") = (
        Field(
            ...,
            description="JSONPath expression identifying a schema field added by this extension",
        )
    )


class ExtensionDeclaration(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: constr(
        pattern=r"^[a-z][a-z0-9_-]*(@\d{4}-\d{2}-\d{2})?$|^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_-]*)+(@\d{4}-\d{2}-\d{2})?$"
    ) = Field(..., description="Unique identifier for the extension.")
    extends: list[Extend] | None = Field(
        None,
        description="JSONPath expressions identifying the schema fields added by this extension. Format: $.<SchemaName>.<fieldName> (e.g., $.CheckoutSession.discounts).",
    )
    schema_: AnyUrl | None = Field(
        None,
        alias="schema",
        description="URL to the extension's JSON Schema definition.",
    )
    spec: AnyUrl | None = Field(
        None, description="URL to the extension's specification document."
    )


class Brand(Enum):
    visa = "visa"
    mastercard = "mastercard"
    amex = "amex"
    discover = "discover"
    diners = "diners"
    jcb = "jcb"
    unionpay = "unionpay"
    eftpos = "eftpos"
    interac = "interac"


class FundingType(Enum):
    credit = "credit"
    debit = "debit"
    prepaid = "prepaid"


class PaymentMethodObject(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    method: str = Field(..., description="The payment method identifier")
    brands: list[Brand] | None = Field(
        None, description="Specific card brands/networks accepted"
    )
    funding_types: list[FundingType] | None = Field(
        None, description="For card methods, funding types accepted"
    )
    providers: list[str] | None = Field(
        None, description="Optional PSP routing information"
    )


class Item(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(..., description="Unique identifier for the item")
    name: str | None = Field(None, description="Display name of the item")
    unit_amount: int | None = Field(
        None,
        description="Price per unit in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)",
    )


class Type2(Enum):
    disclaimer = "disclaimer"


class ContentType(Enum):
    plain = "plain"
    markdown = "markdown"


class Disclosure(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Type2 = Field(..., description="Type of disclosure")
    content_type: ContentType = Field(
        ...,
        description="Format of the disclosure content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.",
    )
    content: str = Field(
        ...,
        description="The disclosure text content. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.",
    )


class CustomAttribute(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    display_name: str = Field(..., description="Human-readable label for the attribute")
    value: str = Field(..., description="Attribute value")


class MarketplaceSellerDetails(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: str = Field(..., description="Name of the marketplace seller or vendor")


class PaymentHandler(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(..., description="Seller-defined handler identifier")
    name: str = Field(
        ...,
        description="Handler name in reverse-DNS format (e.g., dev.acp.tokenized.card)",
    )
    display_name: str | None = Field(
        None,
        description="Human-readable name for UI (e.g., Credit Card). Use when showing payment options to the buyer.",
    )
    version: constr(pattern=r"^\d{4}-\d{2}-\d{2}$") = Field(
        ..., description="Handler version in YYYY-MM-DD format"
    )
    spec: AnyUrl = Field(..., description="URL to handler specification")
    requires_delegate_payment: bool = Field(
        ..., description="Whether this handler requires using delegate_payment API"
    )
    requires_pci_compliance: bool = Field(
        ..., description="Whether this handler routes PCI DSS sensitive data"
    )
    psp: str = Field(..., description="Payment Service Provider identifier")
    config_schema: AnyUrl = Field(
        ..., description="URL to JSON Schema for handler configuration"
    )
    instrument_schemas: list[AnyUrl] = Field(
        ..., description="URLs to JSON Schemas for payment instruments"
    )
    config: dict[str, Any] = Field(..., description="Handler-specific configuration")
    display_order: int | None = Field(
        None,
        description="Optional merchant-suggested display order (lower = higher preference). Suggestive only; platform/agent MAY reorder.",
    )


class Payment(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    handlers: list[PaymentHandler] = Field(
        ..., description="Available payment handlers"
    )


class AvailabilityStatus(Enum):
    in_stock = "in_stock"
    low_stock = "low_stock"
    out_of_stock = "out_of_stock"
    backorder = "backorder"
    pre_order = "pre_order"


class TaxBreakdownItem(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    jurisdiction: str = Field(
        ...,
        description="Tax jurisdiction name (e.g., 'California State Tax', 'City of San Francisco')",
    )
    rate: float = Field(
        ..., description="Tax rate as a decimal (e.g., 0.0875 for 8.75%)"
    )
    amount: int = Field(
        ...,
        description="Tax amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)",
    )


class Type3(Enum):
    items_base_amount = "items_base_amount"
    items_discount = "items_discount"
    subtotal = "subtotal"
    discount = "discount"
    fulfillment = "fulfillment"
    tax = "tax"
    fee = "fee"
    gift_wrap = "gift_wrap"
    tip = "tip"
    store_credit = "store_credit"
    total = "total"
    amount_refunded = "amount_refunded"


class Total(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Type3 = Field(..., description="Type of total line item")
    display_text: str = Field(..., description="Localized display text for this total")
    amount: int = Field(
        ...,
        description="Amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)",
    )
    presentment_amount: int | None = Field(
        None,
        description="Amount in presentment currency minor units if different from settlement currency",
    )
    description: str | None = Field(
        None, description="Additional descriptive text for this total"
    )
    breakdown: list[TaxBreakdownItem] | None = Field(
        None, description="Detailed breakdown for tax totals"
    )


class Location(BaseModel):
    name: str = Field(..., description="Location name")
    address: Address = Field(..., description="Pickup address")
    phone: str | None = Field(None, description="Location phone number")
    instructions: str | None = Field(None, description="Special pickup instructions")


class PickupType(Enum):
    in_store = "in_store"
    curbside = "curbside"
    locker = "locker"


class FulfillmentOptionPickup(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["pickup"] = Field(..., description="Fulfillment type discriminator")
    id: str = Field(..., description="Unique identifier for this fulfillment option")
    title: str = Field(..., description="Display title for this pickup option")
    description: str | None = Field(
        None, description="Additional details about this pickup option"
    )
    location: Location = Field(..., description="Pickup location details")
    pickup_type: PickupType | None = Field(None, description="Type of pickup method")
    ready_by: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp when order will be ready for pickup"
    )
    pickup_by: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp by which order must be picked up"
    )
    totals: list[Total] = Field(
        ..., description="Cost breakdown for this fulfillment option"
    )


class DeliveryWindow(BaseModel):
    start: AwareDatetime = Field(
        ..., description="RFC 3339 timestamp for delivery window start"
    )
    end: AwareDatetime = Field(
        ..., description="RFC 3339 timestamp for delivery window end"
    )


class ServiceArea(BaseModel):
    radius_miles: float | None = Field(None, description="Delivery radius in miles")
    center_postal_code: str | None = Field(
        None, description="Center point postal code for delivery radius"
    )


class FulfillmentOptionLocalDelivery(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["local_delivery"] = Field(
        ..., description="Fulfillment type discriminator"
    )
    id: str = Field(..., description="Unique identifier for this fulfillment option")
    title: str = Field(..., description="Display title for this local delivery option")
    description: str | None = Field(
        None, description="Additional details about this delivery option"
    )
    delivery_window: DeliveryWindow | None = Field(
        None, description="Expected delivery time window"
    )
    service_area: ServiceArea | None = Field(
        None, description="Geographic service area for local delivery"
    )
    totals: list[Total] = Field(
        ..., description="Cost breakdown for this fulfillment option"
    )


class FulfillmentOptionShipping(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["shipping"] = Field(..., description="Fulfillment type discriminator")
    id: str = Field(..., description="Unique identifier for this fulfillment option")
    title: str = Field(
        ...,
        description="Display title for this shipping option (e.g., 'Standard Shipping', 'Express')",
    )
    description: str | None = Field(
        None, description="Additional details about this shipping option"
    )
    carrier: str | None = Field(
        None, description="Shipping carrier name (e.g., 'USPS', 'FedEx')"
    )
    earliest_delivery_time: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp for earliest expected delivery"
    )
    latest_delivery_time: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp for latest expected delivery"
    )
    totals: list[Total] = Field(
        ..., description="Cost breakdown for this fulfillment option"
    )


class FulfillmentOptionDigital(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["digital"] = Field(..., description="Fulfillment type discriminator")
    id: str = Field(..., description="Unique identifier for this fulfillment option")
    title: str = Field(
        ..., description="Display title for this digital delivery option"
    )
    description: str | None = Field(
        None, description="Additional details about digital delivery method"
    )
    totals: list[Total] = Field(
        ..., description="Cost breakdown for this fulfillment option"
    )


class Type4(Enum):
    shipping = "shipping"
    digital = "digital"
    pickup = "pickup"
    local_delivery = "local_delivery"


class SelectedFulfillmentOption(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Type4 = Field(..., description="Type of fulfillment option selected")
    option_id: str = Field(..., description="ID of the selected fulfillment option")
    item_ids: list[str] = Field(
        ..., description="List of line item IDs associated with this fulfillment option"
    )


class Style(Enum):
    birthday = "birthday"
    holiday = "holiday"
    elegant = "elegant"


class GiftWrap(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    enabled: bool = Field(
        ..., description="Whether gift wrapping is enabled for this order"
    )
    style: Style | None = Field(None, description="Gift wrap style selected")
    charge: int | None = Field(
        None,
        description="Additional charge for gift wrapping in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100)",
    )


class SplitPayment(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    amount: int = Field(
        ...,
        description="Payment amount in minor currency units (e.g. 100 cents for $1.00 or 100 for ¥100) for this split",
    )


class DestinationType(Enum):
    shipping = "shipping"
    pickup = "pickup"
    local_delivery = "local_delivery"
    digital = "digital"


class FulfillmentGroup(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(..., description="Unique identifier for this fulfillment group")
    item_ids: list[str] = Field(
        ..., description="List of line item IDs in this fulfillment group"
    )
    destination_type: DestinationType = Field(
        ..., description="Type of fulfillment for this group"
    )
    fulfillment_details: FulfillmentDetails | None = Field(
        None, description="Fulfillment contact and address details"
    )
    location_id: str | None = Field(
        None, description="Location identifier for pickup or local delivery"
    )
    instructions: str | None = Field(
        None, description="Special fulfillment instructions"
    )


class EstimatedDelivery(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    earliest: AwareDatetime = Field(
        ..., description="RFC 3339 timestamp for earliest expected delivery"
    )
    latest: AwareDatetime = Field(
        ..., description="RFC 3339 timestamp for latest expected delivery"
    )


class OrderConfirmation(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    confirmation_number: str | None = Field(
        None, description="Order confirmation number"
    )
    confirmation_email_sent: bool | None = Field(
        None, description="Whether a confirmation email has been sent"
    )
    receipt_url: AnyUrl | None = Field(None, description="URL to the order receipt")
    invoice_number: str | None = Field(None, description="Invoice number if generated")
    order_notes: str | None = Field(
        None, description="Echo of order_notes attached to the order."
    )


class SupportInfo(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    email: EmailStr | None = Field(None, description="Support contact email")
    phone: str | None = Field(None, description="Support contact phone number")
    hours: str | None = Field(None, description="Support hours of operation")
    help_center_url: AnyUrl | None = Field(
        None, description="URL to merchant's help center"
    )


class Severity(Enum):
    info = "info"
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class Resolution(Enum):
    recoverable = "recoverable"
    requires_buyer_input = "requires_buyer_input"
    requires_buyer_review = "requires_buyer_review"


class MessageInfo(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["info"] = Field(..., description="Message type discriminator")
    severity: Severity | None = Field(
        None, description="Severity level of this informational message"
    )
    resolution: Resolution | None = Field(
        None,
        description="Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize.",
    )
    param: str | None = Field(None, description="RFC 9535 JSONPath")
    content_type: ContentType = Field(
        ...,
        description="Format of the message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.",
    )
    content: str = Field(
        ...,
        description="Informational message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.",
    )


class Code(Enum):
    low_stock = "low_stock"
    high_demand = "high_demand"
    shipping_delay = "shipping_delay"
    price_change = "price_change"
    expiring_promotion = "expiring_promotion"
    limited_availability = "limited_availability"
    discount_code_expired = "discount_code_expired"
    discount_code_invalid = "discount_code_invalid"
    discount_code_already_applied = "discount_code_already_applied"
    discount_code_combination_disallowed = "discount_code_combination_disallowed"
    discount_code_minimum_not_met = "discount_code_minimum_not_met"
    discount_code_user_not_logged_in = "discount_code_user_not_logged_in"
    discount_code_user_ineligible = "discount_code_user_ineligible"
    discount_code_usage_limit_reached = "discount_code_usage_limit_reached"


class MessageWarning(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["warning"] = Field(..., description="Message type discriminator")
    code: Code = Field(..., description="Warning code indicating the type of warning")
    severity: Severity | None = Field(
        None, description="Severity level of this warning"
    )
    resolution: Resolution | None = Field(
        None,
        description="Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize.",
    )
    param: str | None = Field(None, description="RFC 9535 JSONPath")
    content_type: ContentType = Field(
        ...,
        description="Format of the warning message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.",
    )
    content: str = Field(
        ...,
        description="Warning message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.",
    )


class Code1(Enum):
    missing = "missing"
    invalid = "invalid"
    out_of_stock = "out_of_stock"
    payment_declined = "payment_declined"
    requires_sign_in = "requires_sign_in"
    requires_3ds = "requires_3ds"
    low_stock = "low_stock"
    quantity_exceeded = "quantity_exceeded"
    coupon_invalid = "coupon_invalid"
    coupon_expired = "coupon_expired"
    minimum_not_met = "minimum_not_met"
    maximum_exceeded = "maximum_exceeded"
    region_restricted = "region_restricted"
    age_verification_required = "age_verification_required"
    approval_required = "approval_required"
    unsupported = "unsupported"
    not_found = "not_found"
    conflict = "conflict"
    rate_limited = "rate_limited"
    expired = "expired"
    intervention_required = "intervention_required"


class MessageError(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["error"] = Field(..., description="Message type discriminator")
    code: Code1 = Field(..., description="Error code indicating the type of error")
    severity: Severity | None = Field(None, description="Severity level of this error")
    resolution: Resolution | None = Field(
        None,
        description="Who resolves this message. 'recoverable': agent can fix via API. 'requires_buyer_input': buyer must provide info. 'requires_buyer_review': buyer must authorize.",
    )
    param: str | None = Field(None, description="RFC 9535 JSONPath")
    content_type: ContentType = Field(
        ...,
        description="Format of the error message content. When set to 'markdown', content MUST conform to CommonMark (https://spec.commonmark.org/0.31.2/). Raw HTML elements MUST NOT be included. When set to 'plain', content is plain text with no formatting.",
    )
    content: str = Field(
        ...,
        description="Error message text. When content_type is 'markdown', this MUST be valid CommonMark with no raw HTML. Agents MUST render using a CommonMark-compliant parser with raw HTML output disabled or sanitized.",
    )


class Type5(Enum):
    terms_of_use = "terms_of_use"
    privacy_policy = "privacy_policy"
    return_policy = "return_policy"
    shipping_policy = "shipping_policy"
    contact_us = "contact_us"
    about_us = "about_us"
    faq = "faq"
    support = "support"


class Link(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Type5 = Field(..., description="Type of link")
    title: str | None = Field(None, description="Display text for the link")
    url: AnyUrl = Field(..., description="URL destination")


class Credential(BaseModel):
    type: str = Field(..., description="Credential type (e.g., spt, wallet_token)")
    token: str = Field(..., description="Credential token value")


class Instrument(BaseModel):
    type: str = Field(..., description="Instrument type (e.g., card, wallet_token)")
    credential: Credential = Field(..., description="Payment credential")


class PaymentTerms(Enum):
    immediate = "immediate"
    net_15 = "net_15"
    net_30 = "net_30"
    net_60 = "net_60"
    net_90 = "net_90"


class PaymentData1(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    handler_id: str = Field(..., description="ID of the payment handler to use")
    instrument: Instrument = Field(..., description="Payment instrument details")
    billing_address: Address | None = Field(
        None, description="Billing address for the payment"
    )
    purchase_order_number: str | None = Field(None, description="Purchase order number")
    payment_terms: PaymentTerms | None = Field(
        None, description="Payment terms for B2B transactions"
    )
    due_date: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp when payment is due"
    )
    approval_required: bool | None = Field(
        None, description="Whether this payment requires approval"
    )


class Instrument1(BaseModel):
    type: str = Field(..., description="Instrument type (e.g., card, wallet_token)")
    credential: Credential = Field(..., description="Payment credential")


class PaymentData2(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    handler_id: str | None = Field(None, description="ID of the payment handler to use")
    instrument: Instrument1 | None = Field(
        None, description="Payment instrument details"
    )
    billing_address: Address | None = Field(
        None, description="Billing address for the payment"
    )
    purchase_order_number: str = Field(..., description="Purchase order number")
    payment_terms: PaymentTerms | None = Field(
        None, description="Payment terms for B2B transactions"
    )
    due_date: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp when payment is due"
    )
    approval_required: bool | None = Field(
        None, description="Whether this payment requires approval"
    )


class PaymentData(RootModel[PaymentData1 | PaymentData2]):
    root: PaymentData1 | PaymentData2 = Field(
        ...,
        description="Payment instrument data collected from the buyer (e.g., card details, wallet tokens)",
        examples=[{"type": "vault_token", "token": "vt_01J8Z3WXYZ9ABC123"}],
    )


class ProtocolVersion(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    version: constr(pattern=r"^\d{4}-\d{2}-\d{2}$") = Field(
        ...,
        description="ACP protocol version in YYYY-MM-DD format.",
        examples=["2026-01-27"],
    )


class DiscountAllocation(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    path: str = Field(
        ...,
        description="JSONPath to the allocation target (e.g., '$.line_items[0]', '$.totals.shipping').",
    )
    amount: conint(ge=0) = Field(
        ...,
        description="Amount allocated to this target in minor (cents) currency units.",
    )


class Duration(Enum):
    once = "once"
    repeating = "repeating"
    forever = "forever"


class Coupon(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(..., description="Unique identifier for the coupon.")
    name: str = Field(
        ..., description="Human-readable coupon name (e.g., 'Summer Sale 20% Off')."
    )
    percent_off: confloat(ge=0.0, le=100.0) | None = Field(
        None,
        description="Percentage discount (0-100). Mutually exclusive with amount_off.",
    )
    amount_off: conint(ge=0) | None = Field(
        None,
        description="Fixed discount amount in minor currency units. Mutually exclusive with percent_off.",
    )
    currency: constr(pattern=r"^[a-z]{3}$") | None = Field(
        None,
        description="ISO 4217 currency code for amount_off. Required if amount_off is set.",
    )
    duration: Duration | None = Field(
        None,
        description="How long the discount applies. 'once' = single use, 'repeating' = multiple billing periods, 'forever' = indefinitely.",
    )
    duration_in_months: conint(ge=1) | None = Field(
        None,
        description="Number of months the coupon applies if duration is 'repeating'.",
    )
    max_redemptions: conint(ge=1) | None = Field(
        None,
        description="Maximum number of times this coupon can be redeemed across all customers.",
    )
    times_redeemed: conint(ge=0) | None = Field(
        None, description="Number of times this coupon has been redeemed."
    )
    metadata: dict[str, str] | None = Field(
        None, description="Arbitrary key-value metadata attached to the coupon."
    )


class Method(Enum):
    each = "each"
    across = "across"


class AppliedDiscount(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(
        ..., description="Unique identifier for this applied discount instance."
    )
    code: str | None = Field(
        None,
        description="The discount code entered by the user. Omitted for automatic discounts.",
    )
    coupon: Coupon = Field(
        ..., description="Details about the underlying coupon/promotion."
    )
    amount: conint(ge=0) = Field(
        ..., description="Total discount amount in minor (cents) currency units."
    )
    automatic: bool | None = Field(
        False,
        description="True if applied automatically by merchant rules (no code required).",
    )
    start: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp when the discount became active."
    )
    end: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp when the discount expires."
    )
    method: Method | None = Field(
        None,
        description="Allocation method. 'each' = applied independently per item. 'across' = split proportionally by value.",
    )
    priority: conint(ge=1) | None = Field(
        None,
        description="Stacking order for discount calculation. Lower numbers applied first (1 = first).",
    )
    allocations: list[DiscountAllocation] | None = Field(
        None,
        description="Breakdown of where this discount was allocated. Sum of allocation amounts equals total amount.",
    )


class DiscountsRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    codes: list[str] | None = Field(
        None,
        description="Discount codes to apply. Case-insensitive. Replaces previously submitted codes. Send empty array to clear.",
    )


class DiscountErrorCode(Enum):
    discount_code_expired = "discount_code_expired"
    discount_code_invalid = "discount_code_invalid"
    discount_code_already_applied = "discount_code_already_applied"
    discount_code_combination_disallowed = "discount_code_combination_disallowed"
    discount_code_minimum_not_met = "discount_code_minimum_not_met"
    discount_code_user_not_logged_in = "discount_code_user_not_logged_in"
    discount_code_user_ineligible = "discount_code_user_ineligible"
    discount_code_usage_limit_reached = "discount_code_usage_limit_reached"


class PaymentResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    provider: str | None = Field(None, description="Payment provider identifier")
    instruments: list[dict[str, Any]] | None = Field(
        None, description="Available payment instruments"
    )
    handlers: list[dict[str, Any]] | None = Field(
        None, description="Available payment handlers"
    )


class RiskSignals(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    ip_address: str | None = Field(None, description="IP address of the buyer")
    user_agent: str | None = Field(
        None, description="User agent string of the buyer's browser"
    )
    accept_language: str | None = Field(
        None, description="Accept-Language header from the buyer's browser"
    )
    session_id: str | None = Field(None, description="Session identifier for the buyer")
    device_fingerprint: str | None = Field(
        None, description="Device fingerprint for fraud detection"
    )


class OrderLineItemQuantity(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    ordered: conint(ge=1) = Field(
        ..., description="Quantity originally ordered by the customer"
    )
    current: conint(ge=0) = Field(
        ...,
        description="Current active quantity on the order. May be less than ordered due to cancellations or returns. A value of 0 means the line item has been fully removed.",
    )
    fulfilled: conint(ge=0) | None = Field(
        0,
        description="Quantity that has been fulfilled (shipped, picked up, or digitally delivered). Applies to all fulfillment types, not just shipping.",
    )


class LineItemReference(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(..., description="Line item ID reference")
    quantity: conint(ge=1) = Field(
        ..., description="Quantity in this fulfillment or adjustment"
    )


class Type6(Enum):
    shipping = "shipping"
    pickup = "pickup"
    digital = "digital"


class DigitalDelivery(BaseModel):
    access_url: AnyUrl | None = Field(
        None,
        description="URL to access digital content (download link, streaming page, etc.)",
    )
    license_key: str | None = Field(None, description="License or activation key")
    expires_at: AwareDatetime | None = Field(
        None, description="When access expires (RFC 3339 timestamp)"
    )


class FulfillmentEvent(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(..., description="Event identifier")
    type: str = Field(
        ...,
        description="Event type. Implementations MUST accept unrecognized values gracefully. Defined values: 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'failed_attempt', 'returned_to_sender', 'canceled', 'undeliverable'. 'out_for_delivery' and 'ready_for_pickup' are ACP extensions for richer agent experiences.",
    )
    occurred_at: AwareDatetime = Field(
        ..., description="RFC 3339 timestamp when this event occurred"
    )
    description: str | None = Field(
        None, description="Human-readable description (e.g., 'Left at front door')"
    )
    location: str | None = Field(
        None, description="Location where this event occurred (e.g., 'Memphis, TN')"
    )


class Adjustment(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(..., description="Adjustment identifier")
    type: str = Field(
        ...,
        description="Type of adjustment. Implementations MUST accept unrecognized values gracefully. Defined values: 'refund', 'credit', 'return', 'exchange', 'price_adjustment', 'cancellation', 'dispute'. Use 'refund' for both full and partial refunds (distinguish by amount). 'credit' replaces 'store_credit'. 'dispute' covers chargebacks.",
    )
    occurred_at: AwareDatetime = Field(
        ..., description="RFC 3339 timestamp when this adjustment occurred"
    )
    status: str = Field(
        ...,
        description="Adjustment status. Implementations MUST accept unrecognized values gracefully. Defined values: 'pending', 'completed', 'failed'.",
    )
    line_items: list[LineItemReference] | None = Field(
        None, description="Which line items and quantities are affected"
    )
    amount: int | None = Field(
        None,
        description="Total amount credited to the buyer in minor currency units, inclusive of any applicable tax",
    )
    currency: constr(pattern=r"^[a-z]{3}$") | None = Field(
        None, description="ISO 4217 currency code"
    )
    description: str | None = Field(
        None, description="Human-readable reason (e.g., 'Defective item')"
    )
    reason: str | None = Field(None, description="Structured reason code")


class AcquirerDetails(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    acquirer_bin: constr(max_length=11) = Field(
        ..., description="The Acquirer BIN (directory-server specific)."
    )
    acquirer_country: constr(min_length=2, max_length=2) = Field(
        ..., description="Two-letter ISO 3166-1 alpha-2 country code."
    )
    acquirer_merchant_id: constr(max_length=35) = Field(
        ..., description="The Merchant ID assigned by the acquirer."
    )
    merchant_name: constr(max_length=40) = Field(
        ..., description="Merchant name assigned by the acquirer."
    )
    requestor_id: constr(max_length=35) | None = Field(
        None, description="Requestor ID (if required by the directory server)."
    )


class DirectoryServer(Enum):
    american_express = "american_express"
    mastercard = "mastercard"
    visa = "visa"


class Type7(Enum):
    challenge = "challenge"
    frictionless = "frictionless"


class Type8(Enum):
    mandated = "mandated"
    preferred = "preferred"


class Challenge(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Type8 | None = Field(None, description="Subtype of challenge preference.")


class Type9(Enum):
    low_risk = "low_risk"


class Frictionless(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Type9 | None = Field(None, description="Subtype of frictionless preference.")


class FlowPreference(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Type7 = Field(
        ...,
        description="Type of flow requested for this 3DS Authentication. 'challenge' requests a challenge flow; 'frictionless' requests a frictionless flow.",
    )
    challenge: Challenge | None = Field(
        None, description="Details about the requested challenge flow."
    )
    frictionless: Frictionless | None = Field(
        None, description="Details about the requested frictionless flow."
    )


class AuthenticationMetadata(BaseModel):
    model_config = ConfigDict(
        extra="allow",
    )
    acquirer_details: AcquirerDetails = Field(
        ...,
        description="Details about the acquirer used for this 3DS Authentication. This object MUST be present.",
    )
    directory_server: DirectoryServer = Field(
        ..., description="The 3DS directory server used for this Authentication."
    )
    flow_preference: FlowPreference | None = Field(
        None,
        description="Contains additional details on the seller's preference for the 3DS authentication flow. Sellers MAY request a preference, but issuers ultimately decide the actual flow.",
    )


class Outcome(Enum):
    abandoned = "abandoned"
    attempt_acknowledged = "attempt_acknowledged"
    authenticated = "authenticated"
    canceled = "canceled"
    denied = "denied"
    informational = "informational"
    internal_error = "internal_error"
    not_supported = "not_supported"
    processing_error = "processing_error"
    rejected = "rejected"


class ElectronicCommerceIndicator(Enum):
    field_01 = "01"
    field_02 = "02"
    field_05 = "05"
    field_06 = "06"
    field_07 = "07"


class OutcomeDetails(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    three_ds_cryptogram: str = Field(
        ...,
        description="The 3DS cryptogram (authentication value / AAV/CAVV/AEVV). This value is 20 bytes, base64-encoded into a 28-character string.",
        examples=["AbCdEfGhIjKlMnOpQrStUvWxY0="],
    )
    electronic_commerce_indicator: ElectronicCommerceIndicator = Field(
        ...,
        description="Electronic Commerce Indicator (ECI) returned by the 3D Secure provider. Indicates the degree/type of authentication performed.",
        examples=["05"],
    )
    transaction_id: str = Field(
        ...,
        description="Transaction identifier returned by the 3DS system:\n- For 3DS1: the XID\n- For 3DS2: the Directory Server Transaction ID (dsTransID)",
        examples=["dsTransId_abc123"],
    )
    version: str = Field(
        ...,
        description="The 3D Secure version used for this authentication (for example '1.0.2' or '2.2.0').",
        examples=["2.2.0"],
    )


class AuthenticationResult(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    outcome: Outcome = Field(
        ...,
        description="The outcome of this 3DS Authentication.",
        examples=["authenticated"],
    )
    outcome_details: OutcomeDetails | None = Field(
        None,
        description="Detailed authentication data. This field is required when the outcome is 'authenticated', 'informational', or 'attempt_acknowledged'.",
    )


class MarketingConsentOption(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    channel: str = Field(
        ...,
        description="Channel for marketing consent.",
        examples=["email", "sms", "whatsapp"],
    )
    display_text: str = Field(
        ...,
        description="What the buyer is consenting to receive, e.g., 'promotional emails, product launches, and exclusive offers'. Agents MAY use this to compose their own consent prompt.",
    )
    privacy_policy_url: AnyUrl = Field(
        ...,
        description="URL to the seller's privacy policy governing use of the buyer's contact information for marketing.",
    )
    is_subscribed: bool | None = Field(
        None,
        description="Whether the buyer is currently subscribed to marketing via this channel. When true, agents SHOULD render the consent checkbox as pre-checked. Defaults to false if omitted.",
    )


class MarketingConsent(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    channel: str = Field(
        ...,
        description="Channel matching the consent option channel.",
        examples=["email", "sms", "whatsapp"],
    )
    opted_in: bool = Field(
        ...,
        description="Whether the buyer consented to receive marketing via this channel.",
    )


class Status(Enum):
    incomplete = "incomplete"
    not_ready_for_payment = "not_ready_for_payment"
    requires_escalation = "requires_escalation"
    authentication_required = "authentication_required"
    ready_for_payment = "ready_for_payment"
    pending_approval = "pending_approval"
    complete_in_progress = "complete_in_progress"
    completed = "completed"
    canceled = "canceled"
    in_progress = "in_progress"
    expired = "expired"


class CheckoutSessionUpdateRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    buyer: Buyer | None = Field(None, description="Updated buyer information")
    line_items: list[Item] | None = Field(
        None, description="Items to update in the checkout session"
    )
    fulfillment_details: FulfillmentDetails | None = Field(
        None, description="Updated fulfillment contact and address"
    )
    fulfillment_groups: list[FulfillmentGroup] | None = Field(
        None, description="Updated fulfillment groupings"
    )
    selected_fulfillment_options: list[SelectedFulfillmentOption] | None = Field(
        None, description="Fulfillment option selected by the buyer"
    )
    coupons: list[str] | None = Field(
        None,
        description="DEPRECATED: Use discounts.codes instead. Discount codes to apply.",
    )
    discounts: DiscountsRequest | None = Field(
        None,
        description="Discount codes to apply. Replaces previously submitted codes.",
    )
    order_notes: constr(max_length=5000) | None = Field(
        None, description="Optional customer/order notes."
    )


class CheckoutSessionCompleteRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    buyer: Buyer | None = Field(None, description="Final buyer information")
    payment_data: PaymentData = Field(..., description="Payment method and details")
    authentication_result: AuthenticationResult | None = Field(
        None, description="Authentication result for 3DS flows"
    )
    affiliate_attribution: AffiliateAttribution | None = Field(
        None, description="Affiliate attribution data for last-touch tracking"
    )
    risk_signals: RiskSignals | None = Field(None, description="Risk and fraud signals")
    marketing_consents: list[MarketingConsent] | None = Field(
        None,
        description="Buyer's marketing consent decisions. Agents SHOULD include an entry for each consent option surfaced to the buyer. Options not surfaced MUST be omitted — omission preserves existing subscription state. Sellers SHOULD ignore entries in marketing_consents that do not correspond to a channel in marketing_consent_options.",
    )
    order_notes: constr(max_length=5000) | None = Field(
        None,
        description="Optional customer/order notes (delivery instructions, gift message).",
    )


class ReasonCode(Enum):
    price_sensitivity = "price_sensitivity"
    shipping_cost = "shipping_cost"
    shipping_speed = "shipping_speed"
    product_fit = "product_fit"
    trust_security = "trust_security"
    returns_policy = "returns_policy"
    payment_options = "payment_options"
    comparison = "comparison"
    timing_deferred = "timing_deferred"
    other = "other"


class IntentTrace(BaseModel):
    reason_code: ReasonCode = Field(
        ...,
        description="Reason for abandonment. This enum is extensible: servers SHOULD accept unrecognized values and treat them as 'other' (see RFC Section 7.2). Validators SHOULD be configured for lenient enum handling.",
    )
    trace_summary: constr(max_length=500) | None = Field(
        None,
        description="A generated summary of the specific objection or negotiation gap.",
    )
    metadata: dict[str, str | float | bool] | None = Field(
        None, description="Additional structured metadata about the intent"
    )


class CancelSessionRequest(BaseModel):
    intent_trace: IntentTrace | None = None


class Transport(Enum):
    rest = "rest"
    mcp = "mcp"


class Service(Enum):
    checkout = "checkout"
    orders = "orders"
    delegate_payment = "delegate_payment"
    carts = "carts"


class InterventionType(Enum):
    field_3ds = "3ds"
    biometric = "biometric"
    address_verification = "address_verification"


class SupportedCurrency(RootModel[constr(pattern=r"^[a-z]{3}$")]):
    root: constr(pattern=r"^[a-z]{3}$") = Field(
        ..., description='ISO 4217 currency code in lowercase (e.g., "usd", "eur")'
    )


class SupportedVersion(RootModel[constr(pattern=r"^\d{4}-\d{2}-\d{2}$")]):
    root: constr(pattern=r"^\d{4}-\d{2}-\d{2}$") = Field(
        ..., description="API version in YYYY-MM-DD format"
    )


class DiscoveryProtocol(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: Literal["acp"] = Field(..., description='Protocol identifier. Always "acp".')
    version: constr(pattern=r"^\d{4}-\d{2}-\d{2}$") = Field(
        ...,
        description="The current (latest) API version supported by the seller, in YYYY-MM-DD format.",
    )
    supported_versions: list[SupportedVersion] = Field(
        ...,
        description="All API versions the seller currently supports, in chronological order (oldest first). Agents SHOULD use the API-Version header to request a specific version. The last element is always the latest supported version.",
    )
    documentation_url: AnyUrl | None = Field(
        None, description="URL to the seller's ACP documentation."
    )


class DiscoveryExtension(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    name: str = Field(
        ..., description='Extension identifier (e.g., "discount", "fulfillment").'
    )
    spec: AnyUrl | None = Field(
        None, description="URL to the extension's specification document."
    )
    schema_: AnyUrl | None = Field(
        None,
        alias="schema",
        description="URL to the extension's JSON Schema definition for programmatic validation.",
    )


class Type10(Enum):
    invalid_request = "invalid_request"
    processing_error = "processing_error"
    service_unavailable = "service_unavailable"


class Error(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Type10 = Field(
        ..., description="Error type indicating the category of protocol-level error"
    )
    code: str = Field(..., description="Implementation-defined error code")
    message: str = Field(..., description="Human-readable error message")
    param: str | None = Field(None, description="RFC 9535 JSONPath (optional)")
    supported_versions: list[constr(pattern=r"^\d{4}-\d{2}-\d{2}$")] | None = Field(
        None,
        description="List of API versions supported by the server, ordered by preference (newest first). Only included in version-related errors.",
    )


class Capabilities(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    payment: Payment | None = None
    interventions: InterventionCapabilities | None = None
    extensions: list[str] | list[ExtensionDeclaration] | None = Field(
        None,
        description="Extensions supported by the party. Requests: array of extension identifiers. Responses: array of extension declaration objects.",
    )


class LineItem(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(..., description="Unique identifier for the line item")
    item: Item = Field(..., description="Reference to the item being purchased")
    quantity: conint(ge=1) = Field(
        ..., description="Number of units for this line item"
    )
    name: str | None = Field(None, description="Display name of the line item")
    description: str | None = Field(
        None, description="Detailed description of the line item"
    )
    images: list[AnyUrl] | None = Field(
        None, description="Array of image URLs for this line item"
    )
    unit_amount: int | None = Field(
        None,
        description="The unit price of the line item in the smallest currency unit (e.g., cents for USD)",
    )
    disclosures: list[Disclosure] | None = Field(
        None, description="Legal disclosures or disclaimers for this item"
    )
    custom_attributes: list[CustomAttribute] | None = Field(
        None, description="Custom attributes specific to this line item"
    )
    marketplace_seller_details: MarketplaceSellerDetails | None = Field(
        None, description="Seller details for marketplace items"
    )
    product_id: str | None = Field(None, description="Merchant's product identifier")
    sku: str | None = Field(None, description="Stock keeping unit identifier")
    variant_id: str | None = Field(None, description="Product variant identifier")
    category: str | None = Field(None, description="Product category")
    tags: list[str] | None = Field(None, description="Product tags or labels")
    weight: WeightInfo | None = Field(
        None, description="Weight information for the item"
    )
    dimensions: DimensionsInfo | None = Field(
        None, description="Dimensions for the item"
    )
    availability_status: AvailabilityStatus | None = Field(
        None, description="Current availability status of the item"
    )
    available_quantity: conint(ge=0) | None = Field(
        None, description="Quantity currently available for purchase"
    )
    max_quantity_per_order: conint(ge=1) | None = Field(
        None, description="Maximum quantity allowed per order"
    )
    fulfillable_on: AwareDatetime | None = Field(
        None,
        description="RFC 3339 timestamp when item becomes available for fulfillment",
    )
    variant_options: list[VariantOption] | None = Field(
        None, description="Selected product variant options (e.g., size, color)"
    )
    discount_details: list[DiscountDetail] | None = Field(
        None, description="Line-item level discount details"
    )
    tax_exempt: bool | None = Field(
        None, description="Whether this line item is tax exempt"
    )
    tax_exemption_reason: str | None = Field(
        None, description="Reason for tax exemption if applicable"
    )
    parent_id: str | None = Field(
        None, description="Reference to parent line item for bundled products"
    )
    totals: list[Total] = Field(
        ...,
        description="Line-item level totals breakdown including base_amount, discount, subtotal, tax, and total",
    )


class RejectedDiscount(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    code: str = Field(..., description="The discount code that was rejected.")
    reason: DiscountErrorCode = Field(
        ..., description="Error code indicating why the discount was rejected."
    )
    message: str | None = Field(
        None, description="Human-readable explanation of why the code was rejected."
    )


class OrderLineItem(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(
        ...,
        description="Line item identifier, used for references in fulfillments and adjustments",
    )
    title: str = Field(..., description="Product name")
    product_id: str | None = Field(None, description="Catalog product ID")
    description: str | None = Field(None, description="Product description")
    image_url: AnyUrl | None = Field(None, description="Product image URL")
    url: AnyUrl | None = Field(None, description="Product page URL")
    quantity: OrderLineItemQuantity
    unit_price: int | None = Field(
        None, description="Price per unit in minor currency units (cents)"
    )
    subtotal: int | None = Field(None, description="Line total in minor currency units")
    totals: list[Total] | None = Field(
        None,
        description="Optional line-item level totals breakdown using the same Total schema as checkout. Merchants who can provide richer breakdowns MAY use this alongside or instead of unit_price/subtotal.",
    )
    status: str | None = Field(
        None,
        description="Derived from quantity fields. Implementations MUST accept unrecognized values gracefully. Defined values: 'processing', 'partial', 'fulfilled', 'removed'. Rules: 'removed' if current==0, 'fulfilled' if fulfilled==current, 'partial' if 0<fulfilled<current, 'processing' otherwise.",
    )


class Fulfillment(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(..., description="Fulfillment identifier")
    type: Type6 = Field(..., description="Fulfillment method type")
    status: str | None = Field(
        None,
        description="Current fulfillment status. Implementations MUST accept unrecognized values gracefully. Defined values: 'pending', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'failed', 'canceled'. Not all statuses apply to all types.",
    )
    line_items: list[LineItemReference] | None = Field(
        None, description="Which line items and quantities are in this fulfillment"
    )
    carrier: str | None = Field(
        None,
        description="Carrier name (e.g., 'FedEx', 'UPS', 'USPS'). Applies to type: shipping.",
    )
    tracking_number: str | None = Field(
        None, description="Carrier tracking number. Applies to type: shipping."
    )
    tracking_url: AnyUrl | None = Field(
        None, description="URL to track this shipment. Applies to type: shipping."
    )
    destination: Address | None = None
    estimated_delivery: EstimatedDelivery | None = None
    digital_delivery: DigitalDelivery | None = Field(
        None, description="Digital delivery details. Applies to type: digital."
    )
    description: str | None = Field(
        None,
        description="Human-readable description (e.g., 'Backordered - ships Feb 15')",
    )
    events: list[FulfillmentEvent] | None = Field(
        None, description="Append-only event log tracking fulfillment progress"
    )


class CheckoutSessionCreateRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    buyer: Buyer | None = Field(None, description="Buyer information")
    line_items: list[Item] = Field(
        ..., description="Items to add to the checkout session", min_length=1
    )
    currency: str = Field(..., description="ISO 4217 currency code")
    fulfillment_details: FulfillmentDetails | None = Field(
        None, description="Fulfillment contact and address details"
    )
    capabilities: Capabilities = Field(
        ..., description="Agent capabilities and supported features"
    )
    fulfillment_groups: list[FulfillmentGroup] | None = Field(
        None, description="Grouping of items by fulfillment method"
    )
    affiliate_attribution: AffiliateAttribution | None = Field(
        None, description="Affiliate attribution data for first-touch tracking"
    )
    coupons: list[str] | None = Field(
        None,
        description="DEPRECATED: Use discounts.codes instead. Discount codes to apply.",
    )
    discounts: DiscountsRequest | None = Field(
        None, description="Discount codes to apply to the checkout session."
    )
    locale: str | None = Field(
        None, description="Locale code for localizing content (e.g., 'en-US')"
    )
    timezone: str | None = Field(
        None, description="IANA timezone identifier (e.g., 'America/New_York')"
    )
    quote_id: str | None = Field(
        None, description="Quote identifier if this session is based on a quote"
    )
    metadata: dict[str, Any] | None = Field(
        None, description="Arbitrary metadata for merchant use"
    )
    order_notes: constr(max_length=5000) | None = Field(
        None,
        description="Optional customer/order notes (e.g., delivery instructions, gift message).",
    )


class DiscoveryCapabilities(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    services: list[Service] = Field(
        ...,
        description="Services available from this seller. Indicates which ACP operations are implemented. This enum is closed per API version; new values are introduced in new API versions. Agents MAY treat the set as exhaustive for a given version.",
    )
    extensions: list[DiscoveryExtension] | None = Field(
        None,
        description="Extensions the seller supports. Whether a specific extension is active for a given session is determined during checkout session creation.",
    )
    intervention_types: list[InterventionType] | None = Field(
        None,
        description="Intervention types the seller supports. Actual availability for a specific session is negotiated via the capabilities object on POST /checkout_sessions. This enum is closed per API version; new values are introduced in new API versions. Agents MAY treat the set as exhaustive for a given version.",
    )
    supported_currencies: list[SupportedCurrency] | None = Field(
        None, description="ISO 4217 currency codes supported by the seller."
    )
    supported_locales: list[str] | None = Field(
        None,
        description="BCP 47 locale tags supported by the seller for localized responses.",
    )


class DiscountsResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    codes: list[str] | None = Field(
        None, description="Echo of submitted discount codes."
    )
    applied: list[AppliedDiscount] | None = Field(
        None, description="Discounts successfully applied (code-based and automatic)."
    )
    rejected: list[RejectedDiscount] | None = Field(
        None, description="Discount codes that could not be applied, with reasons."
    )


class Order(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    type: Literal["order"] = Field(
        "order",
        description="Discriminator field for webhook payloads. Always 'order' when present.",
    )
    id: str = Field(..., description="Unique identifier for the order")
    checkout_session_id: str = Field(
        ..., description="ID of the checkout session that created this order"
    )
    order_number: str | None = Field(
        None, description="Human-readable order number for customer reference"
    )
    client_reference_id: str | None = Field(
        None,
        description="Reference from the client (agent/platform) stored on the order for reconciliation (e.g. platform transaction id, PO number, ERP id).",
    )
    permalink_url: AnyUrl = Field(
        ..., description="Permanent URL where the customer can view order details"
    )
    status: str | None = Field(
        None,
        description="Order-level status. Implementations MUST accept unrecognized values gracefully. Defined values: 'created', 'confirmed', 'manual_review', 'processing', 'shipped', 'completed', 'canceled'. 'completed' means all items have been delivered/received regardless of fulfillment method. Distinct from LineItem.status 'fulfilled', which indicates the seller has dispatched the item.",
    )
    estimated_delivery: EstimatedDelivery | None = Field(
        None, description="Estimated delivery time range"
    )
    confirmation: OrderConfirmation | None = Field(
        None, description="Order confirmation details"
    )
    support: SupportInfo | None = Field(
        None, description="Customer support contact information"
    )
    line_items: list[OrderLineItem] | None = Field(
        None, description="What was ordered, with per-item fulfillment tracking"
    )
    fulfillments: list[Fulfillment] | None = Field(
        None, description="How items are being delivered (shipping, pickup, digital)"
    )
    adjustments: list[Adjustment] | None = Field(
        None, description="Post-order changes: refunds, credits, returns, disputes"
    )
    totals: list[Total] | None = Field(
        None,
        description="Order-level totals using the same Total schema as checkout. The 'total' entry is always the original charged amount. 'amount_refunded' tracks cumulative refunds.",
    )


class CheckoutSessionBase(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    id: str = Field(..., description="Unique identifier for the checkout session")
    protocol: ProtocolVersion | None = Field(
        None, description="Protocol version metadata"
    )
    capabilities: Capabilities = Field(
        ..., description="Negotiated capabilities between agent and seller"
    )
    buyer: Buyer | None = Field(None, description="Buyer information")
    status: Status = Field(..., description="Current status of the checkout session")
    currency: str = Field(..., description="ISO 4217 settlement currency code")
    presentment_currency: str | None = Field(
        None,
        description="ISO 4217 presentment currency code if different from settlement currency",
    )
    exchange_rate: float | None = Field(
        None, description="Exchange rate from presentment to settlement currency"
    )
    exchange_rate_timestamp: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp when exchange rate was determined"
    )
    locale: str | None = Field(
        None, description="Locale code (e.g., 'en-US') for localizing content"
    )
    timezone: str | None = Field(
        None, description="IANA timezone identifier (e.g., 'America/New_York')"
    )
    line_items: list[LineItem] = Field(
        ..., description="Line items in the checkout session"
    )
    fulfillment_details: FulfillmentDetails | None = Field(
        None, description="Fulfillment contact and address details"
    )
    fulfillment_options: list[
        FulfillmentOptionShipping
        | FulfillmentOptionDigital
        | FulfillmentOptionPickup
        | FulfillmentOptionLocalDelivery
    ] = Field(..., description="Available fulfillment options")
    selected_fulfillment_options: list[SelectedFulfillmentOption] | None = Field(
        None, description="Currently selected fulfillment options"
    )
    fulfillment_groups: list[FulfillmentGroup] | None = Field(
        None, description="Optional grouping of line items by fulfillment method"
    )
    totals: list[Total] = Field(..., description="Cart-level totals breakdown")
    messages: list[MessageInfo | MessageWarning | MessageError] = Field(
        ...,
        description="Messages to communicate with the buyer (info, warnings, errors)",
    )
    links: list[Link] = Field(
        ..., description="Relevant links (terms, policies, support)"
    )
    authentication_metadata: AuthenticationMetadata | None = Field(
        None,
        description="Authentication metadata for payment interventions (e.g., 3DS)",
    )
    created_at: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp when the session was created"
    )
    updated_at: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp of last update"
    )
    expires_at: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp when the session expires"
    )
    continue_url: AnyUrl | None = Field(
        None, description="URL to continue or resume the checkout session"
    )
    metadata: dict[str, Any] | None = Field(
        None, description="Arbitrary metadata for merchant use"
    )
    quote_id: str | None = Field(
        None, description="Quote identifier if this session is based on a quote"
    )
    quote_expires_at: AwareDatetime | None = Field(
        None, description="RFC 3339 timestamp when the quote expires"
    )
    discounts: DiscountsResponse | None = Field(
        None,
        description="Discount extension: submitted codes and applied discounts. Present when the 'discount' extension is active.",
    )
    marketing_consent_options: list[MarketingConsentOption] | None = Field(
        None,
        description="Marketing consent options the seller offers. When present, the agent SHOULD display these to the buyer before checkout completion. Agents MAY selectively surface a subset of options; options not surfaced MUST be omitted from marketing_consents in the complete request. When absent, the agent MUST NOT surface any marketing consent UI. An empty array is equivalent to absent.",
    )
    order: Order | None = None


CheckoutSession = CheckoutSessionBase


class CheckoutSessionWithOrder(CheckoutSessionBase):
    order: Order = Field(..., description="Order created when checkout is completed")


class DiscoveryResponse(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )
    protocol: DiscoveryProtocol
    api_base_url: AnyUrl = Field(
        ...,
        description="Base URL for the ACP REST API. Agents append resource paths to this URL (e.g., {api_base_url}/checkout_sessions).",
    )
    transports: list[Transport] = Field(
        ...,
        description='Transport bindings supported by this seller. "rest" indicates the REST API at api_base_url. "mcp" indicates a Model Context Protocol server is available (see SEP #135). New values are introduced in new API versions; agents MAY treat this enum as exhaustive for a given version.',
    )
    capabilities: DiscoveryCapabilities
