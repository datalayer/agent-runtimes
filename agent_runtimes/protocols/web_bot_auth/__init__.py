# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Web Bot Auth: an agent's requests signed, and verified (AGENT_PROTOCOLS PR-20 to PR-23).

Implements ``draft-ietf-webbotauth-httpsig-protocol-00`` (2026-09-01) over
RFC 9421 HTTP Message Signatures:

- :func:`sign_request` and :class:`WebBotAuth` (an ``httpx`` auth) sign an
  outbound request with the host's :class:`HttpSigner` — the
  ``protocols.httpSigner`` contribution; the key stays with the host;
- :func:`directory_body` and :func:`sign_directory_response` publish the
  agent's key directory at ``/.well-known/http-message-signatures-directory``;
- :func:`verify_request`, :class:`DirectoryResolver` and
  :class:`WebBotAuthMiddleware` verify an agent's request, with freshness
  and replay checks.

The protocol is a Reactor plugin (:mod:`.plugin`, AGENT_PROTOCOLS §3.1): the
host's signer, the nonce store and each ``Signature-Agent`` type's key
discovery are its contribution points.

Checked against the draft's Ed25519 test vectors (Appendix E.2) in
``fixtures/vectors.json``, which the TypeScript package reads too.
"""

from .directory import (
    DIRECTORY_TAG,
    DirectoryResponse,
    directory_body,
    sign_directory_response,
    verify_directory_response,
)
from .keys import (
    ALGORITHMS,
    HttpSigner,
    LocalSigner,
    PublicKey,
    jwk_thumbprint,
    public_jwk,
)
from .sign import (
    DIRECTORY_MEDIA_TYPE,
    DIRECTORY_PATH,
    SIGNATURE_AGENT,
    TAG,
    SignedHeaders,
    WebBotAuth,
    generate_nonce,
    sign_request,
    signature_agent_member,
)
from .signature import (
    Component,
    Message,
    SignatureBaseError,
    SignatureParams,
    signature_base,
)
from .verify import (
    DirectoryDiscovery,
    DirectoryResolver,
    InMemoryNonceStore,
    JwksUriDiscovery,
    KeyDiscovery,
    NonceStore,
    Verification,
    WebBotAuthMiddleware,
    verify_request,
)

#: The specification this package implements.
SPECIFICATION = "draft-ietf-webbotauth-httpsig-protocol-00"
VERSION = "draft-ietf-webbotauth-httpsig-protocol-00"

__all__ = [
    "ALGORITHMS",
    "Component",
    "DIRECTORY_MEDIA_TYPE",
    "DIRECTORY_PATH",
    "DIRECTORY_TAG",
    "DirectoryDiscovery",
    "DirectoryResolver",
    "JwksUriDiscovery",
    "KeyDiscovery",
    "DirectoryResponse",
    "HttpSigner",
    "InMemoryNonceStore",
    "LocalSigner",
    "Message",
    "NonceStore",
    "PublicKey",
    "SIGNATURE_AGENT",
    "SPECIFICATION",
    "SignatureBaseError",
    "SignatureParams",
    "SignedHeaders",
    "TAG",
    "VERSION",
    "Verification",
    "WebBotAuth",
    "WebBotAuthMiddleware",
    "directory_body",
    "generate_nonce",
    "jwk_thumbprint",
    "public_jwk",
    "sign_directory_response",
    "sign_request",
    "signature_agent_member",
    "signature_base",
    "verify_directory_response",
    "verify_request",
]
